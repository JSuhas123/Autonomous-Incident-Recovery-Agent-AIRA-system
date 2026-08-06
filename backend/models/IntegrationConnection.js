"use strict";

const mongoose = require("mongoose");

const CONNECTION_STATUSES = ["draft", "connected", "degraded", "disconnected", "disabled"];
const HEALTH_STATUSES     = ["unknown", "healthy", "degraded", "unhealthy"];
const CAPABILITIES        = ["receive_events", "normalize_events", "send_notifications", "get_health", "revoke"];

const nonSecretConfigSchema = new mongoose.Schema({}, {
  _id: false,
  strict: false,   // allow arbitrary provider-specific keys
});

const integrationConnectionSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  tenantId:       { type: String, required: true, index: true },

  provider:   { type: String, required: true },
  name:       { type: String, required: true, maxlength: 128 },
  serviceIds: { type: [mongoose.Schema.Types.ObjectId], ref: "Service", default: [] },

  status:       { type: String, enum: CONNECTION_STATUSES, default: "draft", index: true },
  capabilities: { type: [String], enum: CAPABILITIES, default: [] },

  // Non-sensitive config (URLs, channel names, headers without auth values)
  nonSecretConfig: { type: nonSecretConfigSchema, default: {} },

  // AES-256-GCM encrypted blob — decrypted value is never returned to frontend
  encryptedSecretReference: { type: String, default: null },

  // Metadata from the last event received/sent
  lastEventAt:             { type: Date, default: null },
  lastSuccessfulEventAt:   { type: Date, default: null },

  healthStatus:  { type: String, enum: HEALTH_STATUSES, default: "unknown" },
  errorSummary:  { type: String, maxlength: 512, default: null },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  disabledAt: { type: Date, default: null },
}, {
  timestamps: true,
});

integrationConnectionSchema.index({ organizationId: 1, provider: 1 });
integrationConnectionSchema.index({ organizationId: 1, status: 1 });

const IntegrationConnection = mongoose.model("IntegrationConnection", integrationConnectionSchema);

module.exports = { IntegrationConnection, CONNECTION_STATUSES, HEALTH_STATUSES };
