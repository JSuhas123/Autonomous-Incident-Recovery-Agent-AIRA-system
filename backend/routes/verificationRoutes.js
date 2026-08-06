"use strict";

/**
 * Verification routes — mounted under /api/v1/services/:serviceId/verification
 *
 * POST   /challenge    – create (or return existing pending) challenge
 * GET    /             – get current verification status
 * POST   /check        – run the verification check
 * POST   /regenerate   – invalidate current challenge and issue a new one
 */

const express = require("express");
const Joi     = require("joi");

const Service                 = require("../models/Service");
const VerificationChallenge   = require("../models/VerificationChallenge");
const { createChallenge, CHALLENGE_METHODS } = VerificationChallenge;
const { runVerificationCheck, parseDomain }  = require("../services/verificationService");
const { record: auditRecord }                = require("../services/identity/identityAuditService");
const { AUTH_EVENT_TYPES, AUTH_EVENT_OUTCOMES } = require("../constants/authEvents");

const router = express.Router({ mergeParams: true });

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Load service and assert org ownership. Returns 404 if not found/wrong org. */
async function loadService(req, res) {
  const { serviceId } = req.params;
  if (!serviceId.match(/^[a-f\d]{24}$/i)) {
    res.status(404).json({ error: "Service not found", code: "NOT_FOUND" });
    return null;
  }
  const svc = await Service.findOne({
    _id: serviceId,
    organizationId: req.auth.organizationId,
  });
  if (!svc) {
    res.status(404).json({ error: "Service not found", code: "NOT_FOUND" });
    return null;
  }
  return svc;
}

/** Active pending challenge for a service (not expired). */
async function getPendingChallenge(serviceId) {
  return VerificationChallenge.findOne({
    serviceId,
    status: "pending",
    expiresAt: { $gt: new Date() },
  });
}

/** Serialize a challenge for the API response (never expose tokenHash). */
function safeChallenge(c, svc) {
  const domain = parseDomain(svc.baseUrl);
  return {
    id: c._id,
    serviceId: c.serviceId,
    method: c.method,
    token: c.token,
    status: c.status,
    attempts: c.attempts,
    maxAttempts: c.maxAttempts,
    expiresAt: c.expiresAt,
    verifiedAt: c.verifiedAt,
    lastAttemptAt: c.lastAttemptAt,
    failureReason: c.failureReason,
    // Pre-built instructions – avoids any logic in the frontend
    instructions: buildInstructions(c.method, c.token, domain, svc.baseUrl),
  };
}

function buildInstructions(method, token, domain, baseUrl) {
  if (!domain) return null;
  if (method === "dns_txt") {
    return {
      type:  "DNS TXT record",
      host:  `_aira-verification.${domain}`,
      value: `aira-verification=${token}`,
      note:  "DNS propagation can take up to 48 hours, but usually completes within minutes.",
    };
  }
  if (method === "file") {
    const base = (baseUrl ?? `https://${domain}`).replace(/\/+$/, "");
    return {
      type:    "HTML verification file",
      url:     `${base}/.well-known/aira-verification.txt`,
      content: `aira-verification=${token}`,
      note:    "The file must be publicly accessible over HTTPS.",
    };
  }
  if (method === "meta_tag") {
    return {
      type: "HTML meta tag",
      tag:  `<meta name="aira-verification" content="${token}">`,
      note: "Place the tag inside the <head> element of your homepage.",
    };
  }
  return null;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const challengeSchema = Joi.object({
  method: Joi.string().valid(...CHALLENGE_METHODS).required(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET / — current verification status
router.get("/", async (req, res, next) => {
  try {
    const svc = await loadService(req, res);
    if (!svc) return;

    const challenge = await VerificationChallenge.findOne(
      { serviceId: svc._id },
      null,
      { sort: { createdAt: -1 } }
    );

    return res.json({
      success: true,
      data: {
        verificationStatus: svc.verificationStatus,
        verificationMethod: svc.verificationMethod,
        verifiedAt: svc.verifiedAt,
        challenge: challenge ? safeChallenge(challenge, svc) : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /challenge — create a new challenge (or return the existing pending one)
router.post("/challenge", async (req, res, next) => {
  try {
    const svc = await loadService(req, res);
    if (!svc) return;

    const { error, value } = challengeSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: error.details.map((d) => d.message),
      });
    }

    const { method } = value;

    // file and meta_tag require a baseUrl
    if ((method === "file" || method === "meta_tag") && !svc.baseUrl) {
      return res.status(400).json({
        error: "Service must have a base URL to use file or meta_tag verification",
        code: "MISSING_BASE_URL",
      });
    }

    // Already verified? Don't issue a new challenge.
    if (svc.verificationStatus === "verified") {
      return res.status(409).json({
        error: "Service is already verified",
        code: "ALREADY_VERIFIED",
      });
    }

    // Return existing pending challenge if method matches
    const existing = await getPendingChallenge(svc._id);
    if (existing && existing.method === method) {
      return res.status(200).json({ success: true, data: safeChallenge(existing, svc) });
    }

    const challenge = await createChallenge(
      svc._id,
      svc.organizationId,
      svc.tenantId,
      method
    );

    await svc.updateOne({ $set: { verificationStatus: "pending" } });

    await auditRecord(
      AUTH_EVENT_TYPES.VERIFICATION_CHALLENGE_CREATED,
      AUTH_EVENT_OUTCOMES.SUCCESS,
      {
        userId: req.auth.userId,
        organizationId: req.auth.organizationId,
        metadata: { serviceId: String(svc._id), method },
      }
    );

    return res.status(201).json({ success: true, data: safeChallenge(challenge, svc) });
  } catch (err) {
    next(err);
  }
});

// POST /check — run the actual verification check
router.post("/check", async (req, res, next) => {
  try {
    const svc = await loadService(req, res);
    if (!svc) return;

    if (svc.verificationStatus === "verified") {
      return res.status(409).json({
        error: "Service is already verified",
        code: "ALREADY_VERIFIED",
      });
    }

    const challenge = await getPendingChallenge(svc._id);
    if (!challenge) {
      // Check if most recent is expired
      const latest = await VerificationChallenge.findOne(
        { serviceId: svc._id },
        null,
        { sort: { createdAt: -1 } }
      );
      if (latest && latest.status === "expired") {
        return res.status(410).json({
          error: "Verification challenge has expired. Please create a new one.",
          code: "CHALLENGE_EXPIRED",
        });
      }
      return res.status(404).json({
        error: "No pending verification challenge. Create one first.",
        code: "NO_CHALLENGE",
      });
    }

    // Rate-limit by attempt count
    if (challenge.attempts >= challenge.maxAttempts) {
      await challenge.updateOne({ $set: { status: "failed", failureReason: "too many attempts" } });
      await svc.updateOne({ $set: { verificationStatus: "failed" } });
      return res.status(429).json({
        error: "Too many verification attempts. Please regenerate the challenge.",
        code: "TOO_MANY_ATTEMPTS",
      });
    }

    // Increment attempt counter
    await challenge.updateOne({
      $inc: { attempts: 1 },
      $set: { lastAttemptAt: new Date() },
    });

    // Run the check
    const result = await runVerificationCheck(challenge.method, svc.baseUrl, challenge.token);

    if (result.found) {
      const now = new Date();
      await challenge.updateOne({ $set: { status: "verified", verifiedAt: now } });
      await svc.updateOne({
        $set: {
          verificationStatus: "verified",
          verificationMethod: challenge.method,
          verifiedAt: now,
          "ownershipVerification.method": challenge.method,
          "ownershipVerification.verifiedAt": now,
        },
      });

      await auditRecord(
        AUTH_EVENT_TYPES.VERIFICATION_SUCCEEDED,
        AUTH_EVENT_OUTCOMES.SUCCESS,
        {
          userId: req.auth.userId,
          organizationId: req.auth.organizationId,
          metadata: { serviceId: String(svc._id), method: challenge.method },
        }
      );

      const updatedSvc = await Service.findById(svc._id);
      return res.json({
        success: true,
        data: {
          verified: true,
          verificationStatus: "verified",
          verificationMethod: challenge.method,
          verifiedAt: now,
          service: {
            id: updatedSvc._id,
            verificationStatus: updatedSvc.verificationStatus,
            verificationMethod: updatedSvc.verificationMethod,
            verifiedAt: updatedSvc.verifiedAt,
          },
        },
      });
    }

    // Verification failed this attempt
    await auditRecord(
      AUTH_EVENT_TYPES.VERIFICATION_FAILED,
      AUTH_EVENT_OUTCOMES.FAILURE,
      {
        userId: req.auth.userId,
        organizationId: req.auth.organizationId,
        // Do NOT log the token itself
        metadata: {
          serviceId: String(svc._id),
          method: challenge.method,
          reason: result.reason,
        },
      }
    );

    const freshChallenge = await VerificationChallenge.findById(challenge._id);
    return res.status(422).json({
      success: false,
      data: {
        verified: false,
        reason: result.reason,
        attemptsRemaining: Math.max(0, freshChallenge.maxAttempts - freshChallenge.attempts),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /regenerate — invalidate current challenge and create a new one
router.post("/regenerate", async (req, res, next) => {
  try {
    const svc = await loadService(req, res);
    if (!svc) return;

    if (svc.verificationStatus === "verified") {
      return res.status(409).json({
        error: "Service is already verified",
        code: "ALREADY_VERIFIED",
      });
    }

    const { error, value } = challengeSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: error.details.map((d) => d.message),
      });
    }

    if ((value.method === "file" || value.method === "meta_tag") && !svc.baseUrl) {
      return res.status(400).json({
        error: "Service must have a base URL to use file or meta_tag verification",
        code: "MISSING_BASE_URL",
      });
    }

    const challenge = await createChallenge(
      svc._id,
      svc.organizationId,
      svc.tenantId,
      value.method
    );

    await svc.updateOne({ $set: { verificationStatus: "pending" } });

    await auditRecord(
      AUTH_EVENT_TYPES.VERIFICATION_REGENERATED,
      AUTH_EVENT_OUTCOMES.SUCCESS,
      {
        userId: req.auth.userId,
        organizationId: req.auth.organizationId,
        metadata: { serviceId: String(svc._id), method: value.method },
      }
    );

    return res.status(201).json({ success: true, data: safeChallenge(challenge, svc) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
