const mongoose = require("mongoose");

const runbookSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: String,
    incidentType: {
      type: String,
      required: true,
    },
    serviceId: {
      type: String,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    autoTrigger: {
      type: Boolean,
      default: false, // If true, automatically trigger this runbook for matching incidents
    },
    triggerConditions: {
      minConfidence: { type: Number, default: 80 },
      severityLevels: [String], // ['high', 'critical']
      incidentTypes: [String],
    },

    // Ordered steps to execute
    steps: [
      {
        stepNumber: Number,
        name: String,
        type: {
          type: String,
          enum: ["kubernetes", "api", "shell", "script", "notification", "wait"],
        },
        action: String, // cordon_node, drain, notify, etc.
        params: mongoose.Schema.Types.Mixed,
        retryPolicy: {
          maxRetries: { type: Number, default: 3 },
          backoffMs: { type: Number, default: 1000 },
        },
        onSuccess: String, // Next step number or 'continue'
        onFailure: String, // 'rollback' or step number
        timeout: { type: Number, default: 30000 }, // ms
      },
    ],

    // Rollback steps (execute in reverse order if action fails)
    rollback: [
      {
        stepNumber: Number,
        name: String,
        type: String, // kubernetes, api, shell, etc.
        action: String,
        params: mongoose.Schema.Types.Mixed,
        timeout: { type: Number, default: 30000 },
      },
    ],

    // Success criteria to verify after execution
    successCriteria: [
      {
        type: String,
        enum: ["error_rate_below", "latency_below", "service_healthy", "custom"],
        param: mongoose.Schema.Types.Mixed,
      },
    ],

    // Execution history
    executionHistory: [
      {
        executionId: String,
        correlationId: String,
        startedAt: Date,
        completedAt: Date,
        status: String, // success, partial_success, failed, aborted
        successCriteriaMet: Boolean,
        rollbackExecuted: Boolean,
        duration: Number, // ms
        logs: [String],
        executionErrors: [String],
      },
    ],

    // Version control
    version: { type: Number, default: 1 },
    active: { type: Boolean, default: true },
    createdBy: String,
    lastModifiedBy: String,
    lastExecuted: Date,
    totalExecutions: { type: Number, default: 0 },
    successfulExecutions: { type: Number, default: 0 },
    successRate: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

// Indexes
runbookSchema.index({ tenantId: 1, incidentType: 1 });
runbookSchema.index({ tenantId: 1, serviceId: 1, enabled: 1 });
runbookSchema.index({ tenantId: 1, autoTrigger: 1 });

const Runbook = mongoose.model("Runbook", runbookSchema);

module.exports = Runbook;
