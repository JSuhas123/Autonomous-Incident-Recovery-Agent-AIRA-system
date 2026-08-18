"use strict";

const mongoose =
  require(
    "mongoose"
  );

// ============================================================================
// CONSTANTS
// ============================================================================

const RUN_STATUSES = [
  "pending",
  "running",
  "partial",
  "completed",
  "manual_required",
  "failed",
];

const RUN_PHASES = [
  "context_building",
  "evidence_collection",
  "symptom_analysis",
  "topology_analysis",
  "change_analysis",
  "historical_analysis",
  "hypothesis_generation",
  "verification",
  "risk_analysis",
  "confidence_aggregation",
  "completed",
];

const AGENT_RESULT_STATUSES = [
  "SUCCESS",
  "PARTIAL",
  "INSUFFICIENT_EVIDENCE",
  "MANUAL_REQUIRED",
  "FAILED",
  "SKIPPED",
];

// ============================================================================
// AGENT TRACE ENTRY
// ============================================================================

const agentTraceEntrySchema =
  new mongoose.Schema(
    {
            schemaVersion: {
        type:
          String,

        default:
          "12.3-v1",
      },

      agent: {
        type:
          String,

        required:
          true,

        trim:
          true,
      },

      version: {
        type:
          String,

        default:
          null,
      },

      phase: {
        type:
          String,

        default:
          null,
      },

      status: {
        type:
          String,

        enum:
          AGENT_RESULT_STATUSES,

        required:
          true,
      },

      startedAt: {
        type:
          Date,

        required:
          true,
      },

      completedAt: {
        type:
          Date,

        default:
          null,
      },

      durationMs: {
        type:
          Number,

        min:
          0,

        default:
          null,
      },

      confidence: {
        type:
          Number,

        min:
          0,

        max:
          1,

        default:
          null,
      },

            /**
       * Agent-specific typed payload.
       *
       * AgentResult outer structure is canonical; the inner result remains
       * agent-specific.
       */
      result: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          null,
      },

      evidenceUsed: {
        type:
          [String],

        default:
          [],
      },

      findingIds: {
        type:
          [String],

        default:
          [],
      },

            evidenceMissing: {
        type:
          [String],

        default:
          [],
      },

      assumptions: {
        type:
          [String],

        default:
          [],
      },

      warnings: {
        type:
          [String],

        default:
          [],
      },

            nextRecommendedStage: {
        type:
          String,

        default:
          null,
      },


      error: {
        type:
          String,

        maxlength:
          2048,

        default:
          null,
      },

            modelMetadata: {
        provider: {
          type:
            String,

          default:
            null,
        },

        model: {
          type:
            String,

          default:
            null,
        },

        inputTokens: {
          type:
            Number,

          min:
            0,

          default:
            null,
        },

        outputTokens: {
          type:
            Number,

          min:
            0,

          default:
            null,
        },

        totalTokens: {
          type:
            Number,

          min:
            0,

          default:
            null,
        },

        latencyMs: {
          type:
            Number,

          min:
            0,

          default:
            null,
        },

        estimatedCost: {
          type:
            Number,

          min:
            0,

          default:
            null,
        },
      },

      model: {
        type:
          String,

        default:
          null,
      },

      provider: {
        type:
          String,

        default:
          null,
      },

      fallbackUsed: {
        type:
          Boolean,

        default:
          false,
      },

      tokenEstimate: {
        type:
          Number,

        min:
          0,

        default:
          null,
      },

      metadata: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          {},
      },
    },
    {
      _id:
        true,
    }
  );

// ============================================================================
// CONFIDENCE SNAPSHOT
// ============================================================================

const confidenceSchema =
  new mongoose.Schema(
    {
      correlationConfidence: {
        type:
          Number,

        min:
          0,

        max:
          1,

        default:
          null,
      },

      evidenceCompleteness: {
        type:
          Number,

        min:
          0,

        max:
          1,

        default:
          null,
      },

      symptomConfidence: {
        type:
          Number,

        min:
          0,

        max:
          1,

        default:
          null,
      },

      topologyConfidence: {
        type:
          Number,

        min:
          0,

        max:
          1,

        default:
          null,
      },

      changeConfidence: {
        type:
          Number,

        min:
          0,

        max:
          1,

        default:
          null,
      },

      historicalConfidence: {
        type:
          Number,

        min:
          0,

        max:
          1,

        default:
          null,
      },

      diagnosisConfidence: {
        type:
          Number,

        min:
          0,

        max:
          1,

        default:
          null,
      },

      verificationConfidence: {
        type:
          Number,

        min:
          0,

        max:
          1,

        default:
          null,
      },

      riskConfidence: {
        type:
          Number,

        min:
          0,

        max:
          1,

        default:
          null,
      },

      overallConfidence: {
        type:
          Number,

        min:
          0,

        max:
          1,

        default:
          null,
      },
    },
    {
      _id:
        false,
    }
  );

// ============================================================================
// MODEL
// ============================================================================

const agentIntelligenceRunSchema =
  new mongoose.Schema(
    {
      // ======================================================================
      // OWNERSHIP
      // ======================================================================

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

      tenantId: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      // ======================================================================
      // INCIDENT
      // ======================================================================

      incidentId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Incident",

        required:
          true,

        index:
          true,
      },

      correlationId: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      correlationGroupId: {
        type:
          String,

        default:
          null,

        index:
          true,
      },

      diagnosisId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "IncidentDiagnosis",

        default:
          null,

        index:
          true,
      },

      // ======================================================================
      // RUN IDENTITY
      // ======================================================================

      runId: {
        type:
          String,

        required:
          true,

        unique:
          true,

        index:
          true,
      },

      status: {
        type:
          String,

        enum:
          RUN_STATUSES,

        default:
          "pending",

        index:
          true,
      },

      phase: {
        type:
          String,

        enum:
          RUN_PHASES,

        default:
          "context_building",

        index:
          true,
      },

      // ======================================================================
      // TIMING
      // ======================================================================

      startedAt: {
        type:
          Date,

        default:
          null,
      },

      completedAt: {
        type:
          Date,

        default:
          null,
      },

      failedAt: {
        type:
          Date,

        default:
          null,
      },

      durationMs: {
        type:
          Number,

        min:
          0,

        default:
          null,
      },

      // ======================================================================
      // CONTEXT SNAPSHOT
      // ======================================================================

      contextSummary: {
        signalCount: {
          type:
            Number,

          min:
            0,

          default:
            0,
        },

        incidentEventCount: {
          type:
            Number,

          min:
            0,

          default:
            0,
        },

        providerCount: {
          type:
            Number,

          min:
            0,

          default:
            0,
        },

        affectedServiceCount: {
          type:
            Number,

          min:
            0,

          default:
            0,
        },

        affectedResourceCount: {
          type:
            Number,

          min:
            0,

          default:
            0,
        },

        historicalIncidentCount: {
          type:
            Number,

          min:
            0,

          default:
            0,
        },

        changeCount: {
          type:
            Number,

          min:
            0,

          default:
            0,
        },
      },

      // ======================================================================
      // CONFIDENCE
      // ======================================================================

      confidence: {
        type:
          confidenceSchema,

        default:
          {},
      },

      // ======================================================================
      // AGENT TRACE
      // ======================================================================

      agentTrace: {
        type:
          [agentTraceEntrySchema],

        default:
          [],
      },
      
            // ======================================================================
      // PHASE 12.14 — CANONICAL DECISION TRACE
      // ======================================================================

      decisionTraceSchemaVersion: {
        type:
          String,

        default:
          "12.14-v1",

        index:
          true,
      },

      decisionTrace: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          null,
      },

      budgetUsage: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          null,
      },

      securityFindings: {
        type:
          [
            mongoose.Schema.Types.Mixed,
          ],

        default:
          [],
      },
      // ======================================================================
      // FINDINGS
      // ======================================================================

      findingIds: {
        type:
          [String],

        default:
          [],
      },

      hypothesisIds: {
        type:
          [String],

        default:
          [],
      },

      contradictionIds: {
        type:
          [String],

        default:
          [],
      },

      // ======================================================================
      // OUTCOME
      // ======================================================================

      outcome: {
        type:
          String,

        enum: [
          "ROOT_CAUSE_IDENTIFIED",
          "PROBABLE_CAUSE_IDENTIFIED",
          "MULTIPLE_PLAUSIBLE_CAUSES",
          "INSUFFICIENT_EVIDENCE",
          "CONTRADICTORY_EVIDENCE",
          "FALSE_POSITIVE_SUSPECTED",
          "UNKNOWN",
          null,
        ],

        default:
          null,

        index:
          true,
      },

      summary: {
        type:
          String,

        maxlength:
          4096,

        default:
          null,
      },

      manualReason: {
        type:
          String,

        maxlength:
          2048,

        default:
          null,
      },

      warnings: {
        type:
          [String],

        default:
          [],
      },

      error: {
        type:
          String,

        maxlength:
          4096,

        default:
          null,
      },

      // ======================================================================
      // SAFETY
      // ======================================================================

      /*
       * Phase 6 must never authorize execution.
       */
      executionAuthorized: {
        type:
          Boolean,

        default:
          false,

        immutable:
          true,
      },

      // ======================================================================
      // ENGINE METADATA
      // ======================================================================

      coordinatorVersion: {
        type:
          String,

        default:
          "phase6-v1",
      },

            /**
       * Canonical AgentContext contract version used by this intelligence run.
       *
       * Phase 12.2 introduces this independently of coordinatorVersion because
       * orchestration implementation versions and domain-contract versions are
       * different concepts.
       */
      contextSchemaVersion: {
        type:
          String,

        default:
          "12.2-v1",

        index:
          true,
      },

      reasoningProvider: {
        type:
          String,

        default:
          null,
      },

      model: {
        type:
          String,

        default:
          null,
      },

      fallbackUsed: {
        type:
          Boolean,

        default:
          false,
      },

      metadata: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          {},
      },
    },
    {
      timestamps:
        true,

      versionKey:
        false,
    }
  );

// ============================================================================
// INDEXES
// ============================================================================

agentIntelligenceRunSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  incidentId:
    1,

  createdAt:
    -1,
});

agentIntelligenceRunSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  status:
    1,

  createdAt:
    -1,
});

agentIntelligenceRunSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  phase:
    1,

  status:
    1,
});

agentIntelligenceRunSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  correlationGroupId:
    1,

  createdAt:
    -1,
});

agentIntelligenceRunSchema.index({
  incidentId:
    1,

  completedAt:
    -1,
});

// ============================================================================
// RETENTION
// ============================================================================

const AGENT_INTELLIGENCE_RETENTION_SECONDS =
  Number(
    process.env
      .AGENT_INTELLIGENCE_RETENTION_SECONDS
  ) ||
  180 * 24 * 60 * 60;

/*
 * Keep active/failed investigation history.
 *
 * Only explicitly archived runs should eventually expire.
 *
 * We intentionally do NOT add an unconditional TTL here.
 * Phase 10 / compliance policy can archive runs first.
 */

// ============================================================================
// EXPORT
// ============================================================================

const AgentIntelligenceRun =
  mongoose.model(
    "AgentIntelligenceRun",
    agentIntelligenceRunSchema
  );

module.exports =
  AgentIntelligenceRun;

module.exports.RUN_STATUSES =
  RUN_STATUSES;

module.exports.RUN_PHASES =
  RUN_PHASES;

module.exports.AGENT_RESULT_STATUSES =
  AGENT_RESULT_STATUSES;

module.exports.AGENT_INTELLIGENCE_RETENTION_SECONDS =
  AGENT_INTELLIGENCE_RETENTION_SECONDS;