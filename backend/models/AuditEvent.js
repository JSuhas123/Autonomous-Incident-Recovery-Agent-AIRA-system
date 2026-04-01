const mongoose = require("mongoose");

const auditEventSchema = new mongoose.Schema(
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
    },
    timestamp: {
      type: Date,
      default: Date.now,
      expires: 63072000, // 2 years default, configurable per tenant
    },
    eventType: {
      type: String,
      enum: [
        "decision_made",
        "action_executed",
        "policy_enforced",
        "approval_given",
        "approval_rejected",
        "rollback_triggered",
        "policy_updated",
        "api_call",
      ],
      required: true,
    },
    principal: {
      type: String,
      enum: ["system", "human"],
      required: true,
    },
    principalId: String,
    action: String,
    serviceId: String,
    
    // ✅ NEW: Action execution details (consolidated from ActionLog)
    actionDetails: {
      actionType: String, // restart, scale, drain, alert, etc.
      executionStatus: {
        type: String,
        enum: ["pending", "success", "failed", "rolled_back"],
      },
      outcome: String,
      duration: Number, // milliseconds
      rollbackPossible: Boolean,
      rollbackPlan: mongoose.Schema.Types.Mixed,
      confidenceScore: Number,
    },
    
    payload: mongoose.Schema.Types.Mixed,
    signature: {
      type: String,
      required: true,
    },
    previousEventHash: String,
    eventHash: String,  // Hash of this event for chain-of-custody
    metadata: mongoose.Schema.Types.Mixed,
    status: {
      type: String,
      enum: ["created", "verified", "tampered"],
      default: "created",
    },
  },
  {
    versionKey: false,
    timestamps: false, // We use custom timestamp
  }
);

// Compound indexes for common queries
auditEventSchema.index({ tenantId: 1, timestamp: -1 });
auditEventSchema.index({ correlationId: 1, timestamp: -1 });
auditEventSchema.index({ tenantId: 1, eventType: 1, timestamp: -1 });

// Enable TTL per tenant's config (set from audit service)
auditEventSchema.index(
  { timestamp: 1 },
  {
    expireAfterSeconds: 63072000, // 2 years default
    partialFilterExpression: { status: { $ne: "tampered" } },
  }
);

module.exports = mongoose.model("AuditEvent", auditEventSchema);
