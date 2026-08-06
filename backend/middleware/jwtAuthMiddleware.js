"use strict";

/**
 * JWT Authentication Middleware
 * Verifies JWT tokens issued by devAuthRoutes (or production auth provider).
 * Attaches req.user if valid.
 */

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-change-in-production-32chars";

function jwtAuthMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"] || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header", code: "MISSING_TOKEN" });
  }
  const token = authHeader.slice(7);
  // Skip HMAC-style tokens (keyId:secret) for backward compat
  if (token.includes(":")) {
    // Legacy HMAC token - pass through to next middleware
    return next();
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    // Make tenantId available for tenant-scoped routes
    if (!req.params.tenantId && payload.tenantId) {
      req.jwtTenantId = payload.tenantId;
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token", code: "INVALID_TOKEN" });
  }
}

module.exports = jwtAuthMiddleware;
