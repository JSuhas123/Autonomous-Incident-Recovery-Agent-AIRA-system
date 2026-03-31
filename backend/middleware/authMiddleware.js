const TenantConfig = require("../models/TenantConfig");
const crypto = require("crypto");

function hashWithSecret(value, secret) {
  return crypto
    .createHmac("sha256", secret || "")
    .update(value)
    .digest("hex");
}

function verifyTimestamp(timestamp, maxAgeMs = 5 * 60 * 1000) {
  const now = Date.now();
  const age = Math.abs(now - parseInt(timestamp));
  return age <= maxAgeMs;
}

async function authMiddleware(req, res, next) {
  try {
    // Extract tenantId from URL
    const tenantId = req.params.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        error: "Missing tenantId in URL path",
        code: "MISSING_TENANT_ID",
      });
    }

    // Get Authorization header
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      return res.status(401).json({
        error: "Missing Authorization header",
        code: "MISSING_AUTH_HEADER",
      });
    }

    // Parse "Bearer keyId:secret" format
    const [scheme, credentials] = authHeader.split(" ");
    if (scheme !== "Bearer") {
      return res.status(401).json({
        error: `Invalid auth scheme "${scheme}", expected "Bearer"`,
        code: "INVALID_AUTH_SCHEME",
      });
    }

    if (!credentials || !credentials.includes(":")) {
      return res.status(401).json({
        error: "Malformed credentials: expected keyId:secret",
        code: "MALFORMED_CREDENTIALS",
      });
    }

    const [keyId, secret] = credentials.split(":");
    if (!keyId || !secret) {
      return res.status(401).json({
        error: "Missing keyId or secret",
        code: "MISSING_CREDENTIALS",
      });
    }

    // Verify timestamp freshness
    const timestamp = req.headers["x-timestamp"];
    if (!timestamp) {
      return res.status(400).json({
        error: "Missing X-Timestamp header",
        code: "MISSING_TIMESTAMP",
      });
    }

    if (!verifyTimestamp(timestamp)) {
      return res.status(401).json({
        error: "Request timestamp too old (max 5 minutes)",
        code: "STALE_TIMESTAMP",
      });
    }

    // Verify idempotency key
    const idempotencyKey = req.headers["x-idempotency-key"];
    if (!idempotencyKey) {
      return res.status(400).json({
        error: "Missing X-Idempotency-Key header",
        code: "MISSING_IDEMPOTENCY_KEY",
      });
    }

    // Look up tenant
    const tenant = await TenantConfig.findOne({
      tenantId,
      status: "active",
    });

    if (!tenant) {
      return res.status(403).json({
        error: `Tenant "${tenantId}" not found or inactive`,
        code: "TENANT_NOT_FOUND",
      });
    }

    // Find API key
    const apiKey = tenant.apiKeys.find((k) => k.keyId === keyId && k.active);
    if (!apiKey) {
      return res.status(401).json({
        error: `API key "${keyId}" not found or inactive`,
        code: "API_KEY_NOT_FOUND",
      });
    }

    // Check key rotation deadline
    if (apiKey.rotationDeadline && new Date() > apiKey.rotationDeadline) {
      return res.status(401).json({
        error: "API key has rotated; please use new key",
        code: "API_KEY_ROTATED",
      });
    }

    // Verify signature
    // For GET requests or empty bodies, use empty string for consistency
    let body = "";
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      // Only stringify if there's actual content
      body = JSON.stringify(req.body);
    }
    const messageToSign = body + timestamp;
    const expectedSignature = hashWithSecret(messageToSign, secret);
    const providedSignature = req.headers["x-signature"];

    if (!providedSignature) {
      return res.status(401).json({
        error: "Missing X-Signature header",
        code: "MISSING_SIGNATURE",
      });
    }

    // Use timing-safe comparison to prevent timing attacks
    const signatureMatches = crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(providedSignature)
    );

    if (!signatureMatches) {
      console.warn(
        `[auth] Signature mismatch for tenant ${tenantId} key ${keyId}`
      );
      return res.status(401).json({
        error: "Invalid signature",
        code: "INVALID_SIGNATURE",
      });
    }

    // Attach tenant context to request
    req.tenant = {
      id: tenantId,
      config: tenant,
      keyId,
      timestamp: parseInt(timestamp),
      idempotencyKey,
    };

    // Audit log this request
    console.log(
      `[auth] ✓ ${req.method} ${req.path} | tenant=${tenantId} | key=${keyId}`
    );

    next();
  } catch (error) {
    console.error("[auth] Middleware error:", error.message);
    res.status(500).json({
      error: "Authentication service error",
      code: "AUTH_ERROR",
    });
  }
}

module.exports = authMiddleware;
