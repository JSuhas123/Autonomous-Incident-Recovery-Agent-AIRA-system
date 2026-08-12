"use strict";

const mongoose =
  require("mongoose");

/**
 * DecisionTrace
 *
 * Canonical ownership:
 *
 * organizationId
 * + environmentId
 * + tenantId
 * + incidentId
 * + decisionId
 *
 * This record may contain policy snapshots, reasoning,
 * recommended actions, execution results, and memory updates,
 * so it must never be queryable across environments.
 */

const decisionTraceSchema =
  new mongoose.Schema(
    {
      decisionId: {
        type:
          String,
        required:
          true,
        unique:
          true,
        index:
          true,
      },

      tenantId: {
        type:
          String,
        required:
          true,
        trim:
          true,
        lowercase:
          true,
        index:
          true,
      },

      organizationId: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref:
          "Organization",
        required:
          true,
        index:
          true,
      },

      environmentId: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref:
          "Environment",
        required:
          true,
        index:
          true,
      },

      incidentId: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref:
          "Incident",
        default:
          null,
        index:
          true,
      },

      correlationId: {
        type:
          String,
        index:
          true,
      },

      // ---------------------------------------------------------------------
      // INPUT CONTEXT
      // ---------------------------------------------------------------------

      inputs: {
        signals: {
          errorRate:
            Number,

          responseTime:
            Number,

          affectedServices: [
            String,
          ],

          logSample: [
            Object,
          ],
        },

        severity: {
          type:
            String,

          enum: [
            "LOW",
            "MEDIUM",
            "HIGH",
            "CRITICAL",
          ],
        },

        confidence:
          Number,

        incidentMemory: {
          previousOccurrences:
            Number,

          lastResolution:
            String,

          successRate:
            Number,

          pattern:
            String,
        },
      },

      // ---------------------------------------------------------------------
      // REASONING TRACE
      // ---------------------------------------------------------------------

      reasoning: {
        hypothesis:
          String,

        evidenceFor: [
          String,
        ],

        evidenceAgainst: [
          String,
        ],

        confidenceFactors: [
          {
            name:
              String,

            value:
              Number,

            weight:
              Number,

            contribution:
              Number,
          },
        ],
      },

      // ---------------------------------------------------------------------
      // RULES TRIGGERED
      // ---------------------------------------------------------------------

      rulesTriggered: [
        {
          rule:
            String,

          condition:
            String,

          result:
            Boolean,

          details:
            mongoose.Schema.Types.Mixed,
        },
      ],

      // ---------------------------------------------------------------------
      // ALTERNATIVES
      // ---------------------------------------------------------------------

      alternatives: [
        {
          action:
            String,

          riskScore:
            Number,

          expectedSuccess:
            Number,

          blastRadius:
            String,

          reversible:
            Boolean,

          status: {
            type:
              String,

            enum: [
              "CHOSEN",
              "REJECTED",
            ],
          },

          reason:
            String,
        },
      ],

      // ---------------------------------------------------------------------
      // FINAL DECISION
      // ---------------------------------------------------------------------

      decision: {
        type:
          String,

        enum: [
          "EXECUTE_ACTION",
          "ALERT_HUMAN",
          "SKIP_ACTION",
          "TIERED_DECISION",
        ],
      },

      recommendedAction:
        String,

      tier: {
        type:
          String,

        enum: [
          "execute",
          "safe_fallback",
          "escalate",
          "observe",
        ],

        default:
          "observe",
      },

      // ---------------------------------------------------------------------
      // SAFETY
      // ---------------------------------------------------------------------

      actionRisk: {
        blastRadius:
          String,

        affectedServiceCount:
          Number,

        reversible:
          Boolean,

        dryRunAvailable:
          Boolean,

        dryRunRequired:
          Boolean,

        estimatedRecoveryTime:
          String,

        circuitBreakerStatus:
          mongoose.Schema.Types.Mixed,
      },

      // ---------------------------------------------------------------------
      // POLICY
      // ---------------------------------------------------------------------

      policyCheck: {
        policyVersionId: {
          type:
            String,
        },

        policyVersion:
          String,

        /**
         * Immutable policy snapshot used for replay/audit.
         */
        policySnapshot:
          mongoose.Schema.Types.Mixed,

        timestamp:
          Date,

        verdict: {
          type:
            String,

          enum: [
            "APPROVED",
            "REJECTED",
            "PENDING",
          ],
        },

        checks: [
          {
            ruleId:
              String,

            ruleName:
              String,

            passed:
              Boolean,

            reason:
              String,
          },
        ],

        reason: [
          String,
        ],
      },

      // ---------------------------------------------------------------------
      // ACTION RESULT
      // ---------------------------------------------------------------------

      actionResult: {
        actionId:
          String,

        status: {
          type:
            String,

          enum: [
            "SUCCESS",
            "FAILURE",
            "PENDING",
            "DRY_RUN_ONLY",
          ],
        },

        durationMs:
          Number,

        dryRunPerformed:
          Boolean,

        dryRunResult:
          mongoose.Schema.Types.Mixed,

        outcome:
          String,

        error:
          String,

        timestamp:
          Date,
      },

      // ---------------------------------------------------------------------
      // MEMORY UPDATE
      // ---------------------------------------------------------------------

      memoryUpdate: {
        patternId:
          String,

        pattern:
          String,

        actionRecorded:
          String,

        successRecorded:
          Boolean,

        recoveryTime:
          Number,

        timestamp:
          Date,
      },

      // ---------------------------------------------------------------------
      // AUDIT
      // ---------------------------------------------------------------------

      auditTrail: [
        {
          stage:
            String,

          timestamp:
            Date,

          status:
            String,
        },
      ],

      createdAt: {
        type:
          Date,

        default:
          Date.now,
      },

      updatedAt: {
        type:
          Date,

        default:
          Date.now,
      },
    },
    {
      collection:
        "decision_traces",

      versionKey:
        false,
    }
  );

// ============================================================================
// TIMESTAMP MAINTENANCE
// ============================================================================

decisionTraceSchema.pre(
  "save",
  function beforeSave(
    next
  ) {
    this.updatedAt =
      new Date();

    next();
  }
);

// ============================================================================
// ENVIRONMENT-SCOPED INDEXES
// ============================================================================

decisionTraceSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  createdAt:
    -1,
});

decisionTraceSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  incidentId:
    1,

  createdAt:
    -1,
});

decisionTraceSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  correlationId:
    1,
});

decisionTraceSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  decision:
    1,

  createdAt:
    -1,
});

decisionTraceSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  "actionResult.status":
    1,

  createdAt:
    -1,
});

/**
 * Legacy tenant-oriented lookup.
 *
 * Keep temporarily for compatibility, but new application code
 * should prefer organizationId + environmentId.
 */
decisionTraceSchema.index({
  tenantId:
    1,

  environmentId:
    1,

  createdAt:
    -1,
});

// TTL — purge after 30 days.
decisionTraceSchema.index(
  {
    createdAt:
      1,
  },
  {
    expireAfterSeconds:
      2592000,
  }
);

module.exports =
  mongoose.model(
    "DecisionTrace",
    decisionTraceSchema
  );