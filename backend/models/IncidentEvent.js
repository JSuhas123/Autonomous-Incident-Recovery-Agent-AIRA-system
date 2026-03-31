const mongoose = require("mongoose");

// Generic event store for tracking incident pipeline events
const incidentEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
    },
    tenantId: {
      type: String,
      required: true,
    },
    correlationId: {
      type: String,
      required: true,
    },
    eventType: {
      type: String,
      enum: [
        "incident.detected",
        "incident.analyzed",
        "decision.proposed",
        "action.approved",
        "action.rejected",
        "action.executed",
        "action.failed",
      ],
      required: true,
    },
    serviceId: String,
    timestamp: {
      type: Date,
      default: Date.now,
    },
    issue: String,
    severity: {
      type: String,
      enum: ["low", "medium", "high"],
    },
    confidenceScore: Number,
    suggestedAction: String,
    actionTier: String,
    payload: mongoose.Schema.Types.Mixed,
    processingTime: Number, // milliseconds from previous event
    status: {
      type: String,
      enum: ["pending", "processed", "failed", "archived"],
      default: "pending",
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    error: String,
    metadata: mongoose.Schema.Types.Mixed,
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

// Indexes for efficient querying
incidentEventSchema.index({ tenantId: 1, timestamp: -1 });
incidentEventSchema.index({ correlationId: 1, timestamp: 1 });
incidentEventSchema.index({ tenantId: 1, eventType: 1, status: 1 });
incidentEventSchema.index({ status: 1, timestamp: 1 }); // For retry processing

// TTL index for old events (1 year default)
incidentEventSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 31536000, partialFilterExpression: { status: "archived" } }
);

module.exports = mongoose.model("IncidentEvent", incidentEventSchema);
