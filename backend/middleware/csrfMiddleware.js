"use strict";

const crypto = require("crypto");
const { userSessionRepository } = require("../persistence/repositories");
const { deriveCsrfToken } = require("../services/identity/csrfHelper");
const { record: auditRecord } = require("../services/identity/identityAuditService");
const { AUTH_EVENT_TYPES, AUTH_EVENT_OUTCOMES } = require("../constants/authEvents");

const PRODUCTION_FRONTEND = "https://autonomous-incident-recovery-agent-ten.vercel.app";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Public browser auth routes that establish a session — no CSRF token available yet
const CSRF_EXEMPT_PATHS = new Set([
  "/api/v1/auth/register",
  "/api/v1/auth/login",
]);

function generateCsrfSecret() {
  return crypto.randomBytes(32).toString("hex");
}

/** Constant-time comparison of two hex CSRF tokens. */
function validateCsrfToken(secret, provided) {
  const expected = deriveCsrfToken(secret);
  if (expected.length !== provided.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false;
  }
}

function getAllowedOrigins() {
  const raw = process.env.CORS_ORIGINS || `http://localhost:5173,http://localhost:3000,${PRODUCTION_FRONTEND}`;
  return new Set(raw.split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean));
}

/** Attach a CSRF secret to a new session and return the browser-visible token. */
async function attachCsrfSecret(session) {
  const secret = generateCsrfSecret();
  await userSessionRepository.updateOne({ _id: session._id }, { csrfSecret: secret });
  return deriveCsrfToken(secret);
}

/** Get the browser-visible CSRF token for an active session. */
async function getCsrfTokenForSession(sessionId) {
  const session = await userSessionRepository.findById(sessionId, { includeCsrfSecret: true });
  if (!session || !session.csrfSecret) return null;
  return deriveCsrfToken(session.csrfSecret);
}

/**
 * csrfProtection middleware.
 *
 * Applied only to cookie-authenticated browser mutations.
 * Machine HMAC routes, public auth endpoints and safe methods are bypassed.
 *
 * The middleware runs AFTER sessionAuthMiddleware, so req.auth is populated.
 * It must NOT run on machine-auth routes (/api/v1/tenants/:tenantId/*).
 */
function csrfProtection(req, res, next) {
  // Safe HTTP methods never mutate state
  if (SAFE_METHODS.has(req.method)) return next();

  // Public register/login are exempt — no session exists yet at that point
  if (CSRF_EXEMPT_PATHS.has(req.path)) return next();

  // Routes not using cookie auth (machine HMAC) must not be blocked here
  if (!req.auth || req.auth.authenticationType !== "user_session") return next();

  const origin = req.headers["origin"];
  const allowedOrigins = getAllowedOrigins();

  // Reject mutations from unexpected origins
  if (origin) {
    const normalized = origin.replace(/\/+$/, "");
    if (!allowedOrigins.has(normalized)) {
      auditRecord(AUTH_EVENT_TYPES.PERMISSION_DENIED, AUTH_EVENT_OUTCOMES.DENIED, {
        userId: req.auth?.userId,
        reasonCode: "CSRF_INVALID_ORIGIN",
        metadata: { origin },
      }).catch(() => {});
      return res.status(403).json({ error: "Forbidden: invalid origin", code: "CSRF_INVALID_ORIGIN" });
    }
  }

  const provided = req.headers["x-csrf-token"];
  if (!provided) {
    auditRecord(AUTH_EVENT_TYPES.PERMISSION_DENIED, AUTH_EVENT_OUTCOMES.DENIED, {
      userId: req.auth?.userId,
      reasonCode: "CSRF_MISSING_TOKEN",
    }).catch(() => {});
    return res.status(403).json({ error: "Forbidden: missing CSRF token", code: "CSRF_MISSING_TOKEN" });
  }

  // Load the session's csrfSecret synchronously — we need the DB value
  userSessionRepository.findById(req.auth.sessionId, { includeCsrfSecret: true })
    .then((session) => {
      if (!session || !session.csrfSecret) {
        return res.status(403).json({ error: "Forbidden: no CSRF state", code: "CSRF_NO_STATE" });
      }
      if (!validateCsrfToken(session.csrfSecret, provided)) {
        auditRecord(AUTH_EVENT_TYPES.PERMISSION_DENIED, AUTH_EVENT_OUTCOMES.DENIED, {
          userId: req.auth?.userId,
          sessionId: req.auth?.sessionId,
          reasonCode: "CSRF_INVALID_TOKEN",
        }).catch(() => {});
        return res.status(403).json({ error: "Forbidden: invalid CSRF token", code: "CSRF_INVALID_TOKEN" });
      }
      next();
    })
    .catch(() => res.status(500).json({ error: "CSRF validation error" }));
}

module.exports = { csrfProtection, getCsrfTokenForSession };
