const mongoose = require("mongoose");

/**
 * RunbookExecution Schema (Phase 2 Sprint 3)
 * Tracks execution of runbook automation with step-level details
 */

const runbookExecutionSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
    },
    correlationId: {
      type: String,
      required: true,
    },
    runbookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Runbook",
      required: true,
    },
    runbookName: String,
    version: Number,
    status: {
      type: String,
      enum: ["running", "success", "partial_success", "failed", "rolled_back"],
      default: "running",
    },
    startTime: {
      type: Date,
      default: Date.now,
    },
    endTime: Date,
    duration: Number, // milliseconds
    steps: [
      {
        stepNumber: Number,
        type: String, // kubernetes, api, shell, etc.
        action: String,
        status: {
          type: String,
          enum: ["pending", "running", "success", "failed"],
        },
        startTime: Date,
        endTime: Date,
        result: mongoose.Schema.Types.Mixed,
        error: String,
      },
    ],
    failedStepNumber: Number,
    errorMessage: String,
    rollbackExecuted: Boolean,
    successCriteriaMet: Boolean,
    successCriteriaValidated: Number,
    warnings: [String],
    executedByAgent: {
      type: String,
      default: "automated",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
runbookExecutionSchema.index({ tenantId: 1, correlationId: 1 });
runbookExecutionSchema.index({ tenantId: 1, runbookId: 1 });
runbookExecutionSchema.index({ tenantId: 1, status: 1 });
runbookExecutionSchema.index({ startTime: 1 }); // For cleanup

// TTL index: Delete old executions after 90 days
runbookExecutionSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 7776000, // 90 days
  }
);

module.exports = mongoose.model("RunbookExecution", runbookExecutionSchema);
