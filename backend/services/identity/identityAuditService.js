"use strict";

const AuthenticationAuditEvent = require("../../models/AuthenticationAuditEvent");

// Keys whose presence in audit metadata indicates a security mistake
const FORBIDDEN_KEYS = new Set([
  "password", "passwd", "secret", "token", "hash", "passwordhash",
  "authorization", "cookie", "csrftoken", "apikey", "apisecret",
  "accesstoken", "refreshtoken", "sessiontoken", "bearertoken",
]);

function sanitizeMetadata(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 4) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (FORBIDDEN_KEYS.has(k.toLowerCase())) continue;
    out[k] = typeof v === "object" ? sanitizeMetadata(v, depth + 1) : v;
  }
  return out;
}

async function record(eventType, outcome, opts = {}) {
  try {
    await AuthenticationAuditEvent.create({
      eventType,
      outcome,
      userId: opts.userId || null,
      organizationId: opts.organizationId || null,
      sessionId: opts.sessionId || null,
      reasonCode: opts.reasonCode || null,
      requestId: opts.requestId || null,
      correlationId: opts.correlationId || null,
      ipHash: opts.ipHash || null,
      userAgentHash: opts.userAgentHash || null,
      metadata: opts.metadata ? sanitizeMetadata(opts.metadata) : null,
    });
  } catch (err) {
    // Audit failures must never crash auth flows
    console.error("[identity-audit] Failed to record event:", err.message);
  }
}

module.exports = { record, sanitizeMetadata };
