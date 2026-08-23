"use strict";

const crypto = require("crypto");

const {
  tenantConfigRepository,
  organizationRepository,
} = require("../persistence/repositories");

const MAX_TIMESTAMP_AGE_MS =
  5 * 60 * 1000;

/**
 * SHA-256 helper used for API-key credential verification.
 *
 * This matches the hashing scheme currently used by
 * tenantService when creating/rotating machine credentials.
 */
function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex");
}

/**
 * Generate HMAC signature for request verification.
 */
function createRequestSignature(
  value,
  secret
) {
  return crypto
    .createHmac(
      "sha256",
      secret
    )
    .update(value)
    .digest("hex");
}

function verifyTimestamp(
  timestamp,
  maxAgeMs = MAX_TIMESTAMP_AGE_MS
) {
  const parsedTimestamp =
    Number(timestamp);

  if (
    !Number.isFinite(parsedTimestamp) ||
    !Number.isInteger(parsedTimestamp)
  ) {
    return false;
  }

  const age =
    Math.abs(
      Date.now() -
        parsedTimestamp
    );

  return age <= maxAgeMs;
}

/**
 * Timing-safe string comparison.
 *
 * Returns false instead of throwing when lengths differ.
 */
function timingSafeEqualString(
  left,
  right
) {
  if (
    typeof left !== "string" ||
    typeof right !== "string"
  ) {
    return false;
  }

  const leftBuffer =
    Buffer.from(
      left,
      "utf8"
    );

  const rightBuffer =
    Buffer.from(
      right,
      "utf8"
    );

  if (
    leftBuffer.length !==
    rightBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    leftBuffer,
    rightBuffer
  );
}

async function authMiddleware(
  req,
  res,
  next
) {
  try {
    /*
     * CORS preflight requests must not
     * be blocked by authentication.
     */
    if (req.method === "OPTIONS") {
      return next();
    }

    /*
     * ----------------------------------------------------------------
     * TENANT IDENTIFICATION
     * ----------------------------------------------------------------
     *
     * Legacy machine-auth routes currently identify
     * the tenant using:
     *
     * /tenants/:tenantId/...
     */
    const tenantId =
      req.params.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        error:
          "Missing tenantId in URL path",
        code:
          "MISSING_TENANT_ID",
      });
    }

    /*
     * ----------------------------------------------------------------
     * AUTHORIZATION HEADER
     * ----------------------------------------------------------------
     *
     * Current protocol:
     *
     * Authorization: Bearer keyId:secret
     *
     * The supplied secret is verified against
     * TenantConfig.apiKeys.secretHash below.
     */
    const authHeader =
      req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error:
          "Missing Authorization header",
        code:
          "MISSING_AUTH_HEADER",
      });
    }

    const firstSpaceIndex =
      authHeader.indexOf(" ");

    if (firstSpaceIndex === -1) {
      return res.status(401).json({
        error:
          "Malformed Authorization header",
        code:
          "MALFORMED_AUTH_HEADER",
      });
    }

    const scheme =
      authHeader.slice(
        0,
        firstSpaceIndex
      );

    const credentials =
      authHeader
        .slice(
          firstSpaceIndex + 1
        )
        .trim();

    if (scheme !== "Bearer") {
      return res.status(401).json({
        error:
          `Invalid auth scheme "${scheme}", expected "Bearer"`,
        code:
          "INVALID_AUTH_SCHEME",
      });
    }

    if (
      !credentials ||
      !credentials.includes(":")
    ) {
      return res.status(401).json({
        error:
          "Malformed credentials: expected keyId:secret",
        code:
          "MALFORMED_CREDENTIALS",
      });
    }

    /*
     * Split only on the first colon so secrets
     * containing colons are not truncated.
     */
    const separatorIndex =
      credentials.indexOf(":");

    const keyId =
      credentials
        .slice(
          0,
          separatorIndex
        )
        .trim();

    const secret =
      credentials.slice(
        separatorIndex + 1
      );

    if (!keyId || !secret) {
      return res.status(401).json({
        error:
          "Missing keyId or secret",
        code:
          "MISSING_CREDENTIALS",
      });
    }

    /*
     * ----------------------------------------------------------------
     * TIMESTAMP / REPLAY WINDOW
     * ----------------------------------------------------------------
     */
    const timestamp =
      req.headers["x-timestamp"];

    if (!timestamp) {
      return res.status(400).json({
        error:
          "Missing X-Timestamp header",
        code:
          "MISSING_TIMESTAMP",
      });
    }

    if (
      !verifyTimestamp(
        timestamp
      )
    ) {
      return res.status(401).json({
        error:
          "Invalid or stale request timestamp",
        code:
          "STALE_TIMESTAMP",
      });
    }

    const parsedTimestamp =
      Number(timestamp);

    /*
     * ----------------------------------------------------------------
     * IDEMPOTENCY
     * ----------------------------------------------------------------
     *
     * State-changing machine operations require
     * an idempotency key.
     */
    const idempotencyKey =
      req.headers[
        "x-idempotency-key"
      ];

    const isReadOnlyMethod =
      ["GET", "HEAD"].includes(
        req.method
      );

    if (
      !isReadOnlyMethod &&
      !idempotencyKey
    ) {
      return res.status(400).json({
        error:
          "Missing X-Idempotency-Key header",
        code:
          "MISSING_IDEMPOTENCY_KEY",
      });
    }

    /*
     * ----------------------------------------------------------------
     * TENANT CONFIG
     * ----------------------------------------------------------------
     */
    const tenant =
      await tenantConfigRepository.findOne({
        tenantId,
        status: "active",
      });

    if (!tenant) {
      return res.status(403).json({
        error:
          "Tenant not found or inactive",
        code:
          "TENANT_NOT_FOUND",
      });
    }

    /*
     * ----------------------------------------------------------------
     * CANONICAL ORGANIZATION
     * ----------------------------------------------------------------
     *
     * Organization._id is now the canonical enterprise
     * ownership boundary.
     *
     * tenantId remains for backwards-compatible
     * machine APIs.
     */
    const organization =
      await organizationRepository.findOne({
        tenantId,
        status: "active",
      });

    if (!organization) {
      return res.status(403).json({
        error:
          "Organization not found or inactive",
        code:
          "ORGANIZATION_NOT_FOUND",
      });
    }

    /*
     * ----------------------------------------------------------------
     * API KEY LOOKUP
     * ----------------------------------------------------------------
     */
    const apiKey =
      tenant.apiKeys?.find(
        (key) =>
          key.keyId === keyId &&
          key.active === true &&
          key.status !== "retired"
      );

    if (!apiKey) {
      return res.status(401).json({
        error:
          "API key not found or inactive",
        code:
          "API_KEY_NOT_FOUND",
      });
    }

    /*
     * ----------------------------------------------------------------
     * KEY-ID HASH VERIFICATION
     * ----------------------------------------------------------------
     *
     * keyHash protects against inconsistent/tampered
     * API-key records.
     */
    const suppliedKeyHash =
      sha256(keyId);

    if (
      !timingSafeEqualString(
        suppliedKeyHash,
        apiKey.keyHash
      )
    ) {
      console.warn(
        `[auth] API key hash mismatch | tenant=${tenantId} | key=${keyId}`
      );

      return res.status(401).json({
        error:
          "Invalid API credentials",
        code:
          "INVALID_API_CREDENTIALS",
      });
    }

    /*
     * ----------------------------------------------------------------
     * SECRET VERIFICATION
     * ----------------------------------------------------------------
     *
     * This is the critical authentication check.
     *
     * The plaintext secret sent by the client must
     * hash to the secretHash stored in MongoDB.
     */
    const suppliedSecretHash =
      sha256(secret);

    if (
      !timingSafeEqualString(
        suppliedSecretHash,
        apiKey.secretHash
      )
    ) {
      console.warn(
        `[auth] API secret verification failed | tenant=${tenantId} | key=${keyId}`
      );

      return res.status(401).json({
        error:
          "Invalid API credentials",
        code:
          "INVALID_API_CREDENTIALS",
      });
    }

    /*
     * ----------------------------------------------------------------
     * ROTATION DEADLINE
     * ----------------------------------------------------------------
     */
    if (
      apiKey.rotationDeadline &&
      new Date() >
        new Date(
          apiKey.rotationDeadline
        )
    ) {
      return res.status(401).json({
        error:
          "API key rotation deadline has passed",
        code:
          "API_KEY_ROTATED",
      });
    }

    /*
     * ----------------------------------------------------------------
     * REQUEST SIGNATURE
     * ----------------------------------------------------------------
     *
     * Existing signing protocol:
     *
     * HMAC_SHA256(
     *   JSON(body) + timestamp,
     *   secret
     * )
     */
    let body = "";

    if (
      req.body &&
      typeof req.body ===
        "object" &&
      Object.keys(req.body)
        .length > 0
    ) {
      body =
        JSON.stringify(
          req.body
        );
    }

    const messageToSign =
      body + timestamp;

    const expectedSignature =
      createRequestSignature(
        messageToSign,
        secret
      );

    const providedSignature =
      req.headers[
        "x-signature"
      ];

    if (!providedSignature) {
      return res.status(401).json({
        error:
          "Missing X-Signature header",
        code:
          "MISSING_SIGNATURE",
      });
    }

    if (
      !timingSafeEqualString(
        expectedSignature,
        providedSignature
      )
    ) {
      console.warn(
        `[auth] Signature mismatch | tenant=${tenantId} | key=${keyId}`
      );

      return res.status(401).json({
        error:
          "Invalid signature",
        code:
          "INVALID_SIGNATURE",
      });
    }

    /*
     * ----------------------------------------------------------------
     * LEGACY TENANT CONTEXT
     * ----------------------------------------------------------------
     *
     * Existing playbook/runbook/execution code still
     * consumes req.tenant, so preserve it during
     * Phase 1 migration.
     */
    req.tenant = {
      id:
        tenantId,

      config:
        tenant,

      keyId,

      scopes:
        Array.isArray(
          apiKey.scopes
        )
          ? [...apiKey.scopes]
          : [],

      timestamp:
        parsedTimestamp,

      idempotencyKey:
        idempotencyKey || null,
    };

    /*
     * ----------------------------------------------------------------
     * CANONICAL AUTH CONTEXT
     * ----------------------------------------------------------------
     *
     * Browser and machine identities now both
     * produce req.auth.
     */
    req.auth = {
      authenticationType:
        "machine_hmac",

      userId:
        null,

      sessionId:
        null,

      organizationId:
        organization._id,

      tenantId:
        organization.tenantId,

      membershipId:
        null,

      role:
        null,

      assuranceLevel:
        "machine",

      machineKeyId:
        keyId,

      scopes:
        Array.isArray(
          apiKey.scopes
        )
          ? [...apiKey.scopes]
          : [],

      /*
       * Internal references.
       * Never serialize directly to API clients.
       */
      _organization:
        organization,

      _tenantConfig:
        tenant,

      _apiKey:
        apiKey,
    };

    /*
     * Never log:
     *
     * - secret
     * - secretHash
     * - Authorization
     * - request signature
     */
    console.log(
      `[auth] ✓ ${req.method} ${req.path} | tenant=${tenantId} | org=${organization._id} | key=${keyId}`
    );

    return next();
  } catch (error) {
    console.error(
      "[auth] Middleware error:",
      error.message
    );

    return res.status(500).json({
      error:
        "Authentication service error",
      code:
        "AUTH_ERROR",
    });
  }
}

module.exports =
  authMiddleware;