"use strict";

const mongoose = require("mongoose");

const INCIDENT_STATUSES  = ["open", "acknowledged", "investigating", "recovering", "resolved", "closed"];
const INCIDENT_SEVERITIES = ["info", "warning", "critical"];
const INCIDENT_SOURCES   = ["monitor", "manual", "alert", "integration"];

const evidenceSchema = new mongoose.Schema({
  checkedAt:            Date,
  status:               String,
  statusCode:           Number,
  responseTimeMs:       Number,
  errorCode:            String,
  sanitizedErrorMessage: String,
  checkerRegion:        String,
}, { _id: false });

const timelineEventSchema = new mongoose.Schema({
  occurredAt:  { type: Date, required: true, default: Date.now },
  eventType:   { type: String, required: true },  // opened, acknowledged, note, status_changed, resolved, closed, reopened
  actor:       { type: String, enum: ["system", "user"], default: "system" },
  actorId:     { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  description: { type: String, required: true },
  metadata:    { type: mongoose.Schema.Types.Mixed },
}, { _id: true });

const incidentSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  tenantId:       { type: String, required: true, index: true },
  serviceId:      { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true, index: true },
  monitorId:      { type: mongoose.Schema.Types.ObjectId, ref: "Monitor" },

  // Deduplication
  source:         { type: String, enum: INCIDENT_SOURCES, default: "monitor" },
  sourceEventId:  { type: String },  // monitorId + errorCode for grouping
  fingerprint:    { type: String, required: true, index: true },  // deterministic hash

  // Description
  title:       { type: String, required: true, maxlength: 256 },
  description: { type: String, maxlength: 2048 },
  severity:    { type: String, enum: INCIDENT_SEVERITIES, default: "warning" },
  status:      { type: String, enum: INCIDENT_STATUSES, default: "open", index: true },
  impact:      { type: String, maxlength: 512 },

  // Timing
  startedAt:      { type: Date, required: true },
  detectedAt:     { type: Date, required: true },
  acknowledgedAt: Date,
  resolvedAt:     Date,
  lastObservedAt: { type: Date, required: true },

  // Occurrence tracking (for repeated failures)
  occurrenceCount: { type: Number, default: 1, min: 1 },

  // Sanitized evidence from monitor checks (last N results)
  evidence: { type: [evidenceSchema], default: [] },

  // Assignment & resolution
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  resolution: { type: String, maxlength: 2048 },
  tags:       { type: [String], default: [] },

  // Full event timeline
  timeline: { type: [timelineEventSchema], default: [] },
}, {
  timestamps: true,
});

// Compound index: one open incident per (org + fingerprint)
incidentSchema.index({ organizationId: 1, fingerprint: 1 });
incidentSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
incidentSchema.index({ organizationId: 1, serviceId: 1, status: 1 });

/** Build a deterministic fingerprint string for this failure. */
function buildFingerprint({ organizationId, serviceId, monitorId, errorCode }) {
  return [organizationId, serviceId, monitorId, errorCode || "http_failure"]
    .map(String)
    .join("::");
}

const Incident = mongoose.model("Incident", incidentSchema);

module.exports = { Incident, INCIDENT_STATUSES, INCIDENT_SEVERITIES, buildFingerprint };
