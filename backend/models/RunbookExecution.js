"use strict";

const mongoose = require("mongoose");

/**
 * RunbookExecution
 *
 * Forensic-grade record of one runbook execution.
 *
 * Canonical ownership:
 *
 * organizationId
 * + environmentId
 * + tenantId
 * + incidentId
 * + executionId
 */

const EXECUTION_STATUS = [
  "CREATED",
  "VALIDATING",
  "WAITING_FOR_APPROVAL",
  "RUNNING",
  "VERIFYING",
  "SUCCEEDED",
  "FAILED",
  "ROLLBACK_PENDING",
  "ROLLING_BACK",
  "ROLLED_BACK",
  "ROLLBACK_FAILED",
  "ESCALATED",
  "CANCELLED",
];

const STEP_STATUS = [
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "SKIPPED",
  "TIMED_OUT",
];

// ============================================================================
// SUB-SCHEMAS
// ============================================================================

const resolvedParameterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    value: {
      type: mongoose.Schema.Types.Mixed,
    },

    source: {
      type: String,
    },

    confidence: {
      type: Number,
    },

    resolvedAt: {
      type: String,
    },

    sensitive: {
      type: Boolean,
      default: false,
    },

    redacted: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: false,
  }
);

const stepAttemptSchema = new mongoose.Schema(
  {
    stepId: {
      type: String,
      required: true,
    },

    attemptNumber: {
      type: Number,
      default: 1,
    },

    type: {
      type: String,
    },

    action: {
      type: String,
    },

    status: {
      type: String,
      enum: STEP_STATUS,
      default: "PENDING",
    },

    startedAt: {
      type: Date,
    },

    completedAt: {
      type: Date,
    },

    durationMs: {
      type: Number,
    },

    params: {
      type: mongoose.Schema.Types.Mixed,
    },

    output: {
      type: mongoose.Schema.Types.Mixed,
    },

    preState: {
      type: mongoose.Schema.Types.Mixed,
    },

    postState: {
      type: mongoose.Schema.Types.Mixed,
    },

    error: {
      type: String,
    },

    timedOut: {
      type: Boolean,
      default: false,
    },

    evidence: [
      {
        type: String,
      },
    ],
  },
  {
    _id: false,
  }
);

const rollbackStepResultSchema = new mongoose.Schema(
  {
    stepId: String,

    status: String,

    result: {
      type: mongoose.Schema.Types.Mixed,
    },

    error: String,

    message: String,
  },
  {
    _id: false,
  }
);

const rollbackStateSchema = new mongoose.Schema(
  {
    strategy: String,

    triggeredAt: Date,

    completedAt: Date,

    success: Boolean,

    skipped: Boolean,

    reason: String,

    stepResults: [
      rollbackStepResultSchema,
    ],
  },
  {
    _id: false,
  }
);

const verificationCheckSchema = new mongoose.Schema(
  {
    id: String,

    type: String,

    result: String,

    observedValue: {
      type: mongoose.Schema.Types.Mixed,
    },

    expected: {
      type: mongoose.Schema.Types.Mixed,
    },

    evidence: {
      type: mongoose.Schema.Types.Mixed,
    },

    error: String,

    durationMs: Number,

    timestamp: String,
  },
  {
    _id: false,
  }
);

const verificationResultSchema = new mongoose.Schema(
  {
    passed: Boolean,

    strategy: String,

    summary: String,

    skipped: Boolean,

    checks: [
      verificationCheckSchema,
    ],
  },
  {
    _id: false,
  }
);

const policyDecisionSchema = new mongoose.Schema(
  {
    allowed: Boolean,

    policyId: String,

    reason: String,

    decidedAt: Date,

    decidedBy: String,
  },
  {
    _id: false,
  }
);

// ============================================================================
// MAIN SCHEMA
// ============================================================================

const runbookExecutionSchema = new mongoose.Schema(
  {
    // -----------------------------------------------------------------------
    // Execution identity
    // -----------------------------------------------------------------------

    executionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    correlationId: {
      type: String,
      required: true,
      index: true,
    },

    // -----------------------------------------------------------------------
    // Canonical ownership
    // -----------------------------------------------------------------------

    tenantId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    environmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Environment",
      required: true,
      index: true,
    },

    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Incident",
      default: null,
      index: true,
    },

    /**
     * Temporary compatibility field.
     *
     * Older execution code may still use orgId.
     * New code should use organizationId.
     */
    orgId: {
      type: String,
      default: null,
    },

    // -----------------------------------------------------------------------
    // Runbook identity
    // -----------------------------------------------------------------------

    runbookId: {
      type: String,
      required: true,
      index: true,
    },

    runbookVersion: {
      type: String,
      required: true,
    },

    /**
     * Immutable copy of the exact runbook executed.
     */
    runbookSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    runbookChecksum: {
      type: String,
      required: true,
    },

    versionRef: {
      type: String,
    },

    // -----------------------------------------------------------------------
    // Parameters
    // -----------------------------------------------------------------------

    resolvedParameters: [
      resolvedParameterSchema,
    ],

    // -----------------------------------------------------------------------
    // Policy / approval
    // -----------------------------------------------------------------------

    policyDecision: {
      type: policyDecisionSchema,
    },

    approvalId: {
      type: String,
    },

    approver: {
      type: String,
    },

    approvedAt: {
      type: Date,
    },

    // -----------------------------------------------------------------------
    // Status
    // -----------------------------------------------------------------------

    status: {
      type: String,
      enum: EXECUTION_STATUS,
      default: "CREATED",
      required: true,
    },

    statusReason: {
      type: String,
    },

    // -----------------------------------------------------------------------
    // Timing
    // -----------------------------------------------------------------------

    startedAt: {
      type: Date,
    },

    completedAt: {
      type: Date,
    },

    durationMs: {
      type: Number,
    },

    // -----------------------------------------------------------------------
    // Initiator
    // -----------------------------------------------------------------------

    initiatedBy: {
      type: String,
    },

    initiatorType: {
      type: String,

      enum: [
        "user",
        "agent",
        "system",
        "api",
      ],

      default: "api",
    },

    // -----------------------------------------------------------------------
    // Execution trace
    // -----------------------------------------------------------------------

    stepAttempts: [
      stepAttemptSchema,
    ],

    // -----------------------------------------------------------------------
    // Verification
    // -----------------------------------------------------------------------

    verificationResult: {
      type: verificationResultSchema,
    },

    // -----------------------------------------------------------------------
    // Rollback
    // -----------------------------------------------------------------------

    rollbackState: {
      type: rollbackStateSchema,
    },

    // -----------------------------------------------------------------------
    // State capture
    // -----------------------------------------------------------------------

    preExecutionState: {
      type: mongoose.Schema.Types.Mixed,
    },

    postExecutionState: {
      type: mongoose.Schema.Types.Mixed,
    },

    // -----------------------------------------------------------------------
    // Audit references
    // -----------------------------------------------------------------------

    auditEventIds: [
      {
        type: String,
      },
    ],

    decisionTraceId: {
      type: String,
    },

    // -----------------------------------------------------------------------
    // Failure context
    // -----------------------------------------------------------------------

    failedStepId: {
      type: String,
    },

    errorMessage: {
      type: String,
    },

    errorCode: {
      type: String,
    },

    // -----------------------------------------------------------------------
    // Safety flags
    // -----------------------------------------------------------------------

    requiresHumanReview: {
      type: Boolean,
      default: false,
    },

    escalated: {
      type: Boolean,
      default: false,
    },

    escalatedAt: {
      type: Date,
    },

    escalationReason: {
      type: String,
    },
  },
  {
    timestamps: true,
    strict: true,
    versionKey: false,
  }
);

// ============================================================================
// OWNERSHIP VALIDATION
// ============================================================================

runbookExecutionSchema.pre(
  "validate",
  function validateExecutionOwnership(next) {
    if (!this.organizationId) {
      return next(
        new Error(
          "RunbookExecution requires organizationId"
        )
      );
    }

    if (!this.environmentId) {
      return next(
        new Error(
          "RunbookExecution requires environmentId"
        )
      );
    }

    if (!this.tenantId) {
      return next(
        new Error(
          "RunbookExecution requires tenantId"
        )
      );
    }

    return next();
  }
);

// ============================================================================
// INDEXES
// ============================================================================

runbookExecutionSchema.index({
  organizationId: 1,
  environmentId: 1,
  createdAt: -1,
});

runbookExecutionSchema.index({
  organizationId: 1,
  environmentId: 1,
  runbookId: 1,
  status: 1,
});

runbookExecutionSchema.index({
  organizationId: 1,
  environmentId: 1,
  incidentId: 1,
  createdAt: -1,
});

runbookExecutionSchema.index({
  organizationId: 1,
  environmentId: 1,
  correlationId: 1,
});

runbookExecutionSchema.index({
  organizationId: 1,
  environmentId: 1,
  status: 1,
  createdAt: -1,
});

/**
 * Compatibility lookup while tenant-scoped execution code
 * is migrated to canonical environment ownership.
 */
runbookExecutionSchema.index({
  tenantId: 1,
  environmentId: 1,
  runbookId: 1,
  status: 1,
});

/**
 * Execution history TTL — 90 days.
 */
runbookExecutionSchema.index(
  {
    createdAt: 1,
  },
  {
    expireAfterSeconds: 7776000,
  }
);

// ============================================================================
// STATICS
// ============================================================================

runbookExecutionSchema.statics.EXECUTION_STATUS =
  EXECUTION_STATUS;

runbookExecutionSchema.statics.STEP_STATUS =
  STEP_STATUS;

// ============================================================================
// MODEL
// ============================================================================

const RunbookExecution =
  mongoose.model(
    "RunbookExecution",
    runbookExecutionSchema
  );

module.exports =
  RunbookExecution;

module.exports.EXECUTION_STATUS =
  EXECUTION_STATUS;

module.exports.STEP_STATUS =
  STEP_STATUS;