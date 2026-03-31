const mongoose = require("mongoose");

/**
 * ActionLog Model (Stub)
 * 
 * @deprecated Consolidated into AuditEvent during Phase 2 refactoring.
 * This stub model provides backward compatibility for code that references ActionLog.
 * New code should use AuditEvent with eventType: "action_executed" instead.
 */

const actionLogSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      default: "default",
    },
    actionId: {
      type: String,
      required: true,
    },
    correlationId: String,
    action: {
      type: String,
      enum: ["restart", "scale", "retry", "database-failover", "cache-invalidation", "queue-recovery"],
      required: true,
    },
    executionStatus: {
      type: String,
      enum: ["queued", "executing", "executed", "failed", "skipped"],
      default: "queued",
    },
    outcome: mongoose.Schema.Types.Mixed,
    executedAt: {
      type: Date,
      default: Date.now,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
    },
    durationMs: {
      type: Number,
      min: 0,
    },
    success: Boolean,
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

// Index for multi-tenant queries
actionLogSchema.index({ tenantId: 1, executedAt: -1 });
actionLogSchema.index({ correlationId: 1 });

// TTL index for automatic cleanup (30 days)
actionLogSchema.index(
  { executedAt: 1 },
  { expireAfterSeconds: 2592000 } // 30 days
);

module.exports = mongoose.model("ActionLog", actionLogSchema);
