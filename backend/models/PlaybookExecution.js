"use strict";

const mongoose = require("mongoose");

const {
  EXECUTION_STATUS_VALUES,
  STAGE_EXECUTION_STATUS_VALUES,
  PLAYBOOK_EXECUTION_STATUS,
} = require("../constants/playbook");

// ============================================================================
// SUB-SCHEMAS
// ============================================================================

const rbExecRefSchema = new mongoose.Schema(
  {
    runbookId: {
      type: String,
    },

    runbookVersion: {
      type: String,
    },

    // → RunbookExecution.executionId
    executionId: {
      type: String,
    },

    status: {
      type: String,
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

    mappedParams: {
      type: mongoose.Schema.Types.Mixed,
    },

    output: {
      type: mongoose.Schema.Types.Mixed,
    },

    error: {
      type: String,
    },
  },
  {
    _id: false,
  }
);

// ============================================================================
// STAGE EXECUTION
// ============================================================================

const stageExecutionSchema = new mongoose.Schema(
  {
    stageId: {
      type: String,
      required: true,
    },

    stageName: {
      type: String,
    },

    stageType: {
      type: String,
    },

    status: {
      type: String,
      enum: STAGE_EXECUTION_STATUS_VALUES,
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

    runbookExecutions: [
      rbExecRefSchema,
    ],

    output: {
      type: mongoose.Schema.Types.Mixed,
    },

    error: {
      type: String,
    },

    skipped: {
      type: Boolean,
      default: false,
    },

    skippedReason: {
      type: String,
    },
  },
  {
    _id: false,
  }
);

// ============================================================================
// RESOLVED MAPPING
// ============================================================================

const resolvedMappingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
    },

    rawExpr: {
      type: String,
    },

    value: {
      type: mongoose.Schema.Types.Mixed,
    },

    source: {
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

// ============================================================================
// APPROVAL
// ============================================================================

const approvalRecordSchema = new mongoose.Schema(
  {
    approvalId: {
      type: String,
    },

    approver: {
      type: String,
    },

    approvedAt: {
      type: Date,
    },

    mode: {
      type: String,
    },

    decision: {
      type: String,
    },
  },
  {
    _id: false,
  }
);

// ============================================================================
// ESCALATION
// ============================================================================

const escalationSchema = new mongoose.Schema(
  {
    triggered: {
      type: Boolean,
      default: false,
    },

    triggeredAt: {
      type: Date,
    },

    reason: {
      type: String,
    },

    escalatedTo: {
      type: String,
    },

    notified: {
      type: Boolean,
      default: false,
    },

    channels: [
      {
        type: String,
      },
    ],
  },
  {
    _id: false,
  }
);

// ============================================================================
// ROLLBACK
// ============================================================================

const rollbackRecordSchema = new mongoose.Schema(
  {
    strategy: {
      type: String,
    },

    triggeredAt: {
      type: Date,
    },

    completedAt: {
      type: Date,
    },

    success: {
      type: Boolean,
    },

    reason: {
      type: String,
    },

    stageResults: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    _id: false,
  }
);

// ============================================================================
// OUTCOME
// ============================================================================

const outcomeSchema = new mongoose.Schema(
  {
    successful: {
      type: Boolean,
    },

    recoveryTimeMs: {
      type: Number,
    },

    learningCaptured: {
      type: Boolean,
      default: false,
    },

    incidentMemoryUpdated: {
      type: Boolean,
      default: false,
    },

    summary: {
      type: String,
    },

    failureReason: {
      type: String,
    },

    humanInvolved: {
      type: Boolean,
      default: false,
    },

    rootContext: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    _id: false,
  }
);

// ============================================================================
// MAIN SCHEMA
// ============================================================================

const playbookExecutionSchema = new mongoose.Schema(
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
     * Older code may still populate orgId.
     * New code must use organizationId.
     */
    orgId: {
      type: String,
      default: null,
    },

    // -----------------------------------------------------------------------
    // Playbook identity + immutable snapshot
    // -----------------------------------------------------------------------

    playbookId: {
      type: String,
      required: true,
      index: true,
    },

    playbookVersion: {
      type: String,
      required: true,
    },

    playbookSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    playbookChecksum: {
      type: String,
      required: true,
    },

    versionRef: {
      type: String,
    },

    // -----------------------------------------------------------------------
    // Incident execution context
    // -----------------------------------------------------------------------

    incidentContext: {
      type: mongoose.Schema.Types.Mixed,
    },

    // -----------------------------------------------------------------------
    // Resolved mappings
    // -----------------------------------------------------------------------

    resolvedMappings: [
      resolvedMappingSchema,
    ],

    // -----------------------------------------------------------------------
    // Policy / approval
    // -----------------------------------------------------------------------

    policyDecision: {
      type: mongoose.Schema.Types.Mixed,
    },

    approval: {
      type: approvalRecordSchema,
    },

    // -----------------------------------------------------------------------
    // Status
    // -----------------------------------------------------------------------

    status: {
      type: String,
      enum: EXECUTION_STATUS_VALUES,
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
    // Stage executions
    // -----------------------------------------------------------------------

    stageExecutions: [
      stageExecutionSchema,
    ],

    // -----------------------------------------------------------------------
    // Rollback
    // -----------------------------------------------------------------------

    rollback: {
      type: rollbackRecordSchema,
    },

    // -----------------------------------------------------------------------
    // Escalation
    // -----------------------------------------------------------------------

    escalation: {
      type: escalationSchema,
    },

    // -----------------------------------------------------------------------
    // Outcome
    // -----------------------------------------------------------------------

    outcome: {
      type: outcomeSchema,
    },

    // -----------------------------------------------------------------------
    // Failure context
    // -----------------------------------------------------------------------

    failedStageId: {
      type: String,
    },

    errorMessage: {
      type: String,
    },

    errorCode: {
      type: String,
    },

    // -----------------------------------------------------------------------
    // Audit
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
    // Safety / matching
    // -----------------------------------------------------------------------

    requiresHumanReview: {
      type: Boolean,
      default: false,
    },

    matchScore: {
      type: Number,
    },

    matchReasons: [
      {
        type: String,
      },
    ],
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

playbookExecutionSchema.pre(
  "validate",
  function validateExecutionOwnership(next) {
    if (!this.organizationId) {
      return next(
        new Error(
          "PlaybookExecution requires organizationId"
        )
      );
    }

    if (!this.environmentId) {
      return next(
        new Error(
          "PlaybookExecution requires environmentId"
        )
      );
    }

    if (!this.tenantId) {
      return next(
        new Error(
          "PlaybookExecution requires tenantId"
        )
      );
    }

    return next();
  }
);

// ============================================================================
// ENVIRONMENT-SCOPED INDEXES
// ============================================================================

playbookExecutionSchema.index({
  organizationId: 1,
  environmentId: 1,
  createdAt: -1,
});

playbookExecutionSchema.index({
  organizationId: 1,
  environmentId: 1,
  playbookId: 1,
  status: 1,
});

playbookExecutionSchema.index({
  organizationId: 1,
  environmentId: 1,
  incidentId: 1,
  createdAt: -1,
});

playbookExecutionSchema.index({
  organizationId: 1,
  environmentId: 1,
  correlationId: 1,
});

playbookExecutionSchema.index({
  organizationId: 1,
  environmentId: 1,
  status: 1,
  createdAt: -1,
});

/**
 * Compatibility index while older tenant-oriented queries
 * are migrated.
 */
playbookExecutionSchema.index({
  tenantId: 1,
  environmentId: 1,
  playbookId: 1,
  status: 1,
});

// TTL — 90 days.
playbookExecutionSchema.index(
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

playbookExecutionSchema.statics.EXECUTION_STATUS =
  PLAYBOOK_EXECUTION_STATUS;

// ============================================================================
// MODEL
// ============================================================================

const PlaybookExecution =
  mongoose.model(
    "PlaybookExecution",
    playbookExecutionSchema
  );

module.exports =
  PlaybookExecution;

module.exports.PLAYBOOK_EXECUTION_STATUS =
  PLAYBOOK_EXECUTION_STATUS;