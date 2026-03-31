const mongoose = require("mongoose");

/**
 * DecisionTrace Model - Explicit decision tracing for explainability
 * Every decision made by the system is logged as a trace with full reasoning
 */

const decisionTraceSchema = new mongoose.Schema(
  {
    decisionId: {
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

    // INPUT CONTEXT
    inputs: {
      signals: {
        errorRate: Number,
        responseTime: Number,
        affectedServices: [String],
        logSample: [Object],
      },
      severity: {
        type: String,
        enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      },
      confidence: Number,
      incidentMemory: {
        previousOccurrences: Number,
        lastResolution: String,
        successRate: Number,
        pattern: String,
      },
    },

    // REASONING TRACE
    reasoning: {
      hypothesis: String,
      evidenceFor: [String],
      evidenceAgainst: [String],
      confidenceFactors: [
        {
          name: String,
          value: Number,
          weight: Number,
          contribution: Number,
        },
      ],
    },

    // RULES TRIGGERED
    rulesTriggered: [
      {
        rule: String,
        condition: String,
        result: Boolean,
        details: Object,
      },
    ],

    // ALTERNATIVES CONSIDERED
    alternatives: [
      {
        action: String,
        riskScore: Number,
        expectedSuccess: Number,
        blastRadius: String,
        reversible: Boolean,
        status: {
          type: String,
          enum: ["CHOSEN", "REJECTED"],
        },
        reason: String,
      },
    ],

    // FINAL DECISION
    decision: {
      type: String,
      enum: ["EXECUTE_ACTION", "ALERT_HUMAN", "SKIP_ACTION", "TIERED_DECISION"],
    },
    recommendedAction: String,
    tier: {
      type: String,
      enum: ["execute", "safe_fallback", "escalate", "observe"],
      default: "observe",
    },

    // ACTION SAFETY ASSESSMENT
    actionRisk: {
      blastRadius: String,
      affectedServiceCount: Number,
      reversible: Boolean,
      dryRunAvailable: Boolean,
      dryRunRequired: Boolean,
      estimatedRecoveryTime: String,
      circuitBreakerStatus: Object,
    },

    // POLICY CHECK (populated after policy agent evaluates)
    // CRITICAL FIX: Stores policyVersionId + snapshot for reproducibility and audit
    policyCheck: {
      policyVersionId: {
        type: String,
        description: "Unique ID of the policy version used for this decision (enables replay/audit)",
      },
      policyVersion: String,
      // CRITICAL: Immutable snapshot of the EXACT policy used (full content)
      // Stored to enable replay: can re-evaluate this decision with original policy even if policy changed
      policySnapshot: {
        type: mongoose.Schema.Types.Mixed,
        description: "Full policy content snapshot at decision time (immutable for reproducibility)",
      },
      timestamp: Date,
      verdict: {
        type: String,
        enum: ["APPROVED", "REJECTED", "PENDING"],
      },
      checks: [
        {
          ruleId: String,
          ruleName: String,
          passed: Boolean,
          reason: String,
        },
      ],
      reason: [String],
    },

    // ACTION EXECUTION RESULT (populated after action agent executes)
    actionResult: {
      actionId: String,
      status: {
        type: String,
        enum: ["SUCCESS", "FAILURE", "PENDING", "DRY_RUN_ONLY"],
      },
      durationMs: Number,
      dryRunPerformed: Boolean,
      dryRunResult: Object,
      outcome: String,
      error: String,
      timestamp: Date,
    },

    // MEMORY UPDATE (populated after action completes)
    memoryUpdate: {
      patternId: String,
      pattern: String,
      actionRecorded: String,
      successRecorded: Boolean,
      recoveryTime: Number,
      timestamp: Date,
    },

    // AUDIT
    auditTrail: [
      {
        stage: String, // decision_made, policy_checked, action_executed, memory_updated
        timestamp: Date,
        status: String,
      },
    ],

    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "decision_traces",
  }
);

// Index for common queries
decisionTraceSchema.index({ tenantId: 1, createdAt: -1 });
decisionTraceSchema.index({ tenantId: 1, correlationId: 1 });
decisionTraceSchema.index({ tenantId: 1, decision: 1 });
decisionTraceSchema.index({ tenantId: 1, "actionResult.status": 1 });

// TTL index for automatic cleanup (30 days)
decisionTraceSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 2592000 } // 30 days
);

module.exports = mongoose.model("DecisionTrace", decisionTraceSchema);
