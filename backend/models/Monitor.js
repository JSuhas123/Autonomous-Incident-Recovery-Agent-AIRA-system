"use strict";

const mongoose = require("mongoose");

const MONITOR_TYPES    = ["http", "https", "ssl"];
const HTTP_METHODS     = ["GET", "HEAD", "POST", "PUT", "PATCH"];
const MONITOR_STATUSES = ["healthy", "degraded", "down", "unknown"];

// Headers that could leak credentials — reject silently before storage
const BLOCKED_HEADER_NAMES = new Set([
  "authorization", "cookie", "set-cookie", "proxy-authorization",
  "x-api-key", "x-auth-token", "x-access-token",
]);

const monitorSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId, ref: "Organization",
      required: true, index: true,
    },
    tenantId:  { type: String, required: true, index: true },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId, ref: "Service",
      required: true, index: true,
    },
    name:    { type: String, required: true, trim: true, maxlength: 100 },
    type:    { type: String, enum: MONITOR_TYPES, required: true },
    url:     { type: String, required: true, trim: true, maxlength: 2048 },
    method:  { type: String, enum: HTTP_METHODS, default: "GET" },
    enabled: { type: Boolean, default: true },

    intervalSeconds:            { type: Number, default: 60, min: 30, max: 86400 },
    timeoutMs:                  { type: Number, default: 10000, min: 1000, max: 30000 },
    expectedStatusCodes:        { type: [Number], default: [200] },
    expectedText:               { type: String, default: null, maxlength: 500 },
    // Only non-sensitive request headers (auth/cookie names blocked at write time)
    requestHeaders:             { type: Map, of: String, default: () => new Map() },
    requestBody:                { type: String, default: null, maxlength: 10240 },
    followRedirects:            { type: Boolean, default: true },
    maximumRedirects:           { type: Number, default: 5, min: 0, max: 10 },
    sslExpiryWarningDays:       { type: Number, default: 30, min: 1, max: 90 },
    consecutiveFailureThreshold: { type: Number, default: 3, min: 1, max: 10 },
    recoverySuccessThreshold:   { type: Number, default: 2, min: 1, max: 5 },
    regions:                    { type: [String], default: ["default"] },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId, ref: "User", required: true,
    },

    // ── Runtime health state (updated by executor) ─────────────────────────
    lastStatus:          { type: String, enum: [...MONITOR_STATUSES, null], default: "unknown" },
    lastCheckedAt:       { type: Date, default: null },
    lastStatusCode:      { type: Number, default: null },
    lastResponseTimeMs:  { type: Number, default: null },
    consecutiveFailures: { type: Number, default: 0 },
    consecutiveSuccesses: { type: Number, default: 0 },

    // ── Scheduler lock ─────────────────────────────────────────────────────
    nextCheckAt: { type: Date, default: () => new Date(), index: true },
    lockedAt:    { type: Date, default: null },
    lockedBy:    { type: String, default: null },  // worker UUID
  },
  { versionKey: false, timestamps: true }
);

monitorSchema.index({ organizationId: 1, serviceId: 1 });
monitorSchema.index({ enabled: 1, nextCheckAt: 1, lockedAt: 1 });

/** Strip auth/cookie headers before persisting. */
function sanitizeHeaders(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!BLOCKED_HEADER_NAMES.has(k.toLowerCase())) {
      out[k] = String(v).slice(0, 512);
    }
  }
  return out;
}

const Monitor = mongoose.model("Monitor", monitorSchema);

module.exports = Monitor;
module.exports.MONITOR_TYPES    = MONITOR_TYPES;
module.exports.HTTP_METHODS     = HTTP_METHODS;
module.exports.MONITOR_STATUSES = MONITOR_STATUSES;
module.exports.sanitizeHeaders  = sanitizeHeaders;
