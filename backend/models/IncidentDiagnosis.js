"use strict";

const mongoose =
  require(
    "mongoose"
  );

// ============================================================================
// CONSTANTS
// ============================================================================

const DIAGNOSIS_STATUSES = [
  "pending",
  "analyzing",
  "completed",
  "insufficient_evidence",
  "manual_required",
  "failed",
  "superseded",
];

const DIAGNOSIS_OUTCOMES = [
  "ROOT_CAUSE_IDENTIFIED",
  "PROBABLE_CAUSE_IDENTIFIED",
  "MULTIPLE_PLAUSIBLE_CAUSES",
  "INSUFFICIENT_EVIDENCE",
  "CONTRADICTORY_EVIDENCE",
  "FALSE_POSITIVE_SUSPECTED",
  "UNKNOWN",
];

const HYPOTHESIS_STATUSES = [
  "PROPOSED",
  "SUPPORTED",
  "WEAKLY_SUPPORTED",
  "CONTRADICTED",
  "REJECTED",
  "VERIFIED",
  "UNRESOLVED",
];

const CONTRADICTION_TYPES = [
  "EVIDENCE_CONFLICT",
  "TEMPORAL_CONFLICT",
  "TOPOLOGY_CONFLICT",
  "METRIC_CONFLICT",
  "LOG_CONFLICT",
  "TRACE_CONFLICT",
  "HISTORICAL_CONFLICT",
  "CAUSALITY_CONFLICT",
  "UNKNOWN",
];

const RISK_LEVELS = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];

const NEXT_STEP_TYPES = [
  "COLLECT_MORE_EVIDENCE",
  "EVALUATE_PLAYBOOK",
  "MANUAL_INVESTIGATION",
  "MONITOR",
  "NO_ACTION",
];

// ============================================================================
// SYMPTOM
// ============================================================================

const symptomSchema =
  new mongoose.Schema(
    {
      symptomId: {
        type:
          String,

        required:
          true,
      },

      type: {
        type:
          String,

        default:
          "unknown",
      },

      title: {
        type:
          String,

        required:
          true,

        maxlength:
          512,
      },

      description: {
        type:
          String,

        maxlength:
          2048,

        default:
          null,
      },

      severity: {
        type:
          String,

        enum: [
          "info",
          "warning",
          "critical",
          "unknown",
        ],

        default:
          "unknown",
      },

      firstObservedAt: {
        type:
          Date,

        default:
          null,
      },

      lastObservedAt: {
        type:
          Date,

        default:
          null,
      },

      affectedServiceIds: {
        type: [
          mongoose.Schema.Types.ObjectId,
        ],

        ref:
          "Service",

        default:
          [],
      },

      affectedResourceIds: {
        type: [
          mongoose.Schema.Types.ObjectId,
        ],

        ref:
          "InfrastructureResource",

        default:
          [],
      },

      evidenceIds: {
        type:
          [String],

        default:
          [],
      },

      confidence: {
        type:
          Number,

        min:
          0,

        max:
          1,

        default:
          0,
      },
    },
    {
      _id:
        false,
    }
  );

// ============================================================================
// CONTRADICTION
// ============================================================================

const contradictionSchema =
  new mongoose.Schema(
    {
      contradictionId: {
        type:
          String,

        required:
          true,
      },

      type: {
        type:
          String,

        enum:
          CONTRADICTION_TYPES,

        default:
          "UNKNOWN",
      },

      hypothesisId: {
        type:
          String,

        default:
          null,
      },

      summary: {
        type:
          String,

        required:
          true,

        maxlength:
          2048,
      },

      evidenceIds: {
        type:
          [String],

        default:
          [],
      },

      severity: {
        type:
          String,

        enum: [
          "info",
          "warning",
          "critical",
        ],

        default:
          "warning",
      },

      confidence: {
        type:
          Number,

        min:
          0,

        max:
          1,

        default:
          0,
      },

      resolved: {
        type:
          Boolean,

        default:
          false,
      },
    },
    {
      _id:
        false,
    }
  );

// ============================================================================
// HYPOTHESIS
// ============================================================================

const hypothesisSchema =
  new mongoose.Schema(
    {
      hypothesisId: {
        type:
          String,

        required:
          true,
      },

      rank: {
        type:
          Number,

        min:
          1,

        default:
          null,
      },

      rootCause: {
        type:
          String,

        required:
          true,

        maxlength:
          2048,
      },

      title: {
        type:
          String,

        maxlength:
          512,

        default:
          null,
      },

      category: {
        type:
          String,

        maxlength:
          128,

        default:
          null,
      },

      status: {
        type:
          String,

        enum:
          HYPOTHESIS_STATUSES,

        default:
          "PROPOSED",
      },

      confidence: {
        type:
          Number,

        min:
          0,

        max:
          1,

        default:
          0,
      },

      supportingEvidenceIds: {
        type:
          [String],

        default:
          [],
      },

      contradictingEvidenceIds: {
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

      affectedServiceIds: {
        type: [
          mongoose.Schema.Types.ObjectId,
        ],

        ref:
          "Service",

        default:
          [],
      },

      affectedResourceIds: {
        type: [
          mongoose.Schema.Types.ObjectId,
        ],

        ref:
          "InfrastructureResource",

        default:
          [],
      },

      explanation: {
        type:
          String,

        maxlength:
          4096,

        default:
          null,
      },

      causalChain: {
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

      unknowns: {
        type:
          [String],

        default:
          [],
      },

      verified: {
        type:
          Boolean,

        default:
          false,
      },
    },
    {
      _id:
        false,
    }
  );

// ============================================================================
// AGENT FINDING
// ============================================================================

const findingSchema =
  new mongoose.Schema(
    {
      findingId: {
        type:
          String,

        required:
          true,
      },

      agent: {
        type:
          String,

        required:
          true,
      },

      findingType: {
        type:
          String,

        default:
          "observation",
      },

      title: {
        type:
          String,

        required:
          true,

        maxlength:
          512,
      },

      summary: {
        type:
          String,

        maxlength:
          4096,

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
          0,
      },

      evidenceIds: {
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

      affectedServiceIds: {
        type: [
          mongoose.Schema.Types.ObjectId,
        ],

        ref:
          "Service",

        default:
          [],
      },

      affectedResourceIds: {
        type: [
          mongoose.Schema.Types.ObjectId,
        ],

        ref:
          "InfrastructureResource",

        default:
          [],
      },

      metadata: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          {},
      },

      createdAt: {
        type:
          Date,

        default:
          Date.now,
      },
    },
    {
      _id:
        false,
    }
  );

// ============================================================================
// CONFIDENCE
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
// RISK
// ============================================================================

const riskSchema =
  new mongoose.Schema(
    {
      level: {
        type:
          String,

        enum:
          RISK_LEVELS,

        default:
          "MEDIUM",
      },

      score: {
        type:
          Number,

        min:
          0,

        max:
          1,

        default:
          0,
      },

      userFacing: {
        type:
          Boolean,

        default:
          false,
      },

      blastRadiusServiceCount: {
        type:
          Number,

        min:
          0,

        default:
          0,
      },

      blastRadiusResourceCount: {
        type:
          Number,

        min:
          0,

        default:
          0,
      },

      criticality: {
        type:
          Number,

        min:
          0,

        max:
          10,

        default:
          0,
      },

      availabilityRisk: {
        type:
          Boolean,

        default:
          false,
      },

      dataRisk: {
        type:
          Boolean,

        default:
          false,
      },

      securityRisk: {
        type:
          Boolean,

        default:
          false,
      },

      financialRisk: {
        type:
          Boolean,

        default:
          false,
      },

      reasons: {
        type:
          [String],

        default:
          [],
      },
    },
    {
      _id:
        false,
    }
  );

// ============================================================================
// NEXT STEP
// ============================================================================

const nextStepSchema =
  new mongoose.Schema(
    {
      type: {
        type:
          String,

        enum:
          NEXT_STEP_TYPES,

        default:
          "MANUAL_INVESTIGATION",
      },

      target: {
        type:
          String,

        maxlength:
          512,

        default:
          null,
      },

      reason: {
        type:
          String,

        maxlength:
          2048,

        default:
          null,
      },

      evidenceRequired: {
        type:
          [String],

        default:
          [],
      },

      /*
       * Hard Phase-6 safety boundary.
       *
       * Diagnosis is never execution authority.
       */
      executionAuthorized: {
        type:
          Boolean,

        default:
          false,

        immutable:
          true,
      },
    },
    {
      _id:
        false,
    }
  );

// ============================================================================
// DIAGNOSIS MODEL
// ============================================================================

const incidentDiagnosisSchema =
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

      // ======================================================================
      // DIAGNOSIS IDENTITY
      // ======================================================================

      diagnosisId: {
        type:
          String,

        required:
          true,

        unique:
          true,

        index:
          true,
      },

      revision: {
        type:
          Number,

        min:
          1,

        default:
          1,
      },

      isCurrent: {
        type:
          Boolean,

        default:
          true,

        index:
          true,
      },

      supersedesDiagnosisId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "IncidentDiagnosis",

        default:
          null,
      },

      supersededByDiagnosisId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "IncidentDiagnosis",

        default:
          null,
      },

      // ======================================================================
      // RUN
      // ======================================================================

      runId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "AgentIntelligenceRun",

        default:
          null,

        index:
          true,
      },

      runExternalId: {
        type:
          String,

        default:
          null,
      },

      // ======================================================================
      // STATUS
      // ======================================================================

      status: {
        type:
          String,

        enum:
          DIAGNOSIS_STATUSES,

        default:
          "pending",

        index:
          true,
      },

      outcome: {
        type:
          String,

        enum:
          DIAGNOSIS_OUTCOMES,

        default:
          "UNKNOWN",

        index:
          true,
      },

      // ======================================================================
      // SUMMARY
      // ======================================================================

      title: {
        type:
          String,

        maxlength:
          512,

        default:
          null,
      },

      summary: {
        type:
          String,

        maxlength:
          8192,

        default:
          null,
      },

      probableRootCause: {
        type:
          String,

        maxlength:
          4096,

        default:
          null,
      },

      rootCauseCategory: {
        type:
          String,

        maxlength:
          128,

        default:
          null,
      },

      // ======================================================================
      // SYMPTOMS
      // ======================================================================

      symptoms: {
        type:
          [symptomSchema],

        default:
          [],
      },

      // ======================================================================
      // FINDINGS
      // ======================================================================

      findings: {
        type:
          [findingSchema],

        default:
          [],
      },

      // ======================================================================
      // HYPOTHESES
      // ======================================================================

      hypotheses: {
        type:
          [hypothesisSchema],

        default:
          [],
      },

      primaryHypothesisId: {
        type:
          String,

        default:
          null,

        index:
          true,
      },

      // ======================================================================
      // CONTRADICTIONS
      // ======================================================================

      contradictions: {
        type:
          [contradictionSchema],

        default:
          [],
      },

      unresolvedQuestions: {
        type:
          [String],

        default:
          [],
      },

      unknowns: {
        type:
          [String],

        default:
          [],
      },

      falsePositiveSuspected: {
        type:
          Boolean,

        default:
          false,

        index:
          true,
      },

      // ======================================================================
      // EVIDENCE SUMMARY
      // ======================================================================

      evidenceSummary: {
        totalEvidenceCount: {
          type:
            Number,

          min:
            0,

          default:
            0,
        },

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

        metricCount: {
          type:
            Number,

          min:
            0,

          default:
            0,
        },

        logCount: {
          type:
            Number,

          min:
            0,

          default:
            0,
        },

        traceCount: {
          type:
            Number,

          min:
            0,

          default:
            0,
        },

        alertCount: {
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

        providers: {
          type:
            [String],

          default:
            [],
        },

        evidenceIds: {
          type:
            [String],

          default:
            [],
        },

        missingEvidence: {
          type:
            [String],

          default:
            [],
        },

        staleEvidence: {
          type:
            [String],

          default:
            [],
        },
      },

      // ======================================================================
      // TOPOLOGY / IMPACT SNAPSHOT
      // ======================================================================

      impactSnapshot: {
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

        userFacingImpact: {
          type:
            Boolean,

          default:
            false,
        },

        maxCriticality: {
          type:
            Number,

          min:
            0,

          max:
            10,

          default:
            0,
        },

        affectedServiceIds: {
          type: [
            mongoose.Schema.Types.ObjectId,
          ],

          ref:
            "Service",

          default:
            [],
        },

        affectedResourceIds: {
          type: [
            mongoose.Schema.Types.ObjectId,
          ],

          ref:
            "InfrastructureResource",

          default:
            [],
        },
      },

      // ======================================================================
      // RISK
      // ======================================================================

      risk: {
        type:
          riskSchema,

        default:
          {},
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
      // NEXT STEP
      // ======================================================================

      recommendedNextStep: {
        type:
          nextStepSchema,

        default:
          () => ({
            type:
              "MANUAL_INVESTIGATION",

            executionAuthorized:
              false,
          }),
      },

      // ======================================================================
      // ANALYSIS TIMING
      // ======================================================================

      analysisStartedAt: {
        type:
          Date,

        default:
          null,
      },

      analysisCompletedAt: {
        type:
          Date,

        default:
          null,
      },

      // ======================================================================
      // ENGINE INFORMATION
      // ======================================================================

      coordinatorVersion: {
        type:
          String,

        default:
          "phase6-v1",
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

      // ======================================================================
      // SAFETY
      // ======================================================================

      /*
       * Phase 6 can recommend that Phase 7 evaluate a playbook.
       *
       * It cannot authorize execution.
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
      // METADATA
      // ======================================================================

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
// SAFETY VALIDATION
// ============================================================================

incidentDiagnosisSchema.pre(
  "validate",
  function validateDiagnosisSafety(
    next
  ) {
    /*
     * Defence in depth.
     *
     * Even if a caller attempts to set these fields manually,
     * a Phase 6 diagnosis cannot authorize execution.
     */
    this.executionAuthorized =
      false;

    if (
      this
        .recommendedNextStep
    ) {
      this
        .recommendedNextStep
        .executionAuthorized =
        false;
    }

    next();
  }
);

// ============================================================================
// INDEXES
// ============================================================================

incidentDiagnosisSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  incidentId:
    1,

  createdAt:
    -1,
});

incidentDiagnosisSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  incidentId:
    1,

  isCurrent:
    1,
});

incidentDiagnosisSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  status:
    1,

  createdAt:
    -1,
});

incidentDiagnosisSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  outcome:
    1,

  createdAt:
    -1,
});

incidentDiagnosisSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  falsePositiveSuspected:
    1,

  createdAt:
    -1,
});

incidentDiagnosisSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  "confidence.overallConfidence":
    -1,
});

// ============================================================================
// ONLY ONE CURRENT DIAGNOSIS PER INCIDENT
// ============================================================================

incidentDiagnosisSchema.index(
  {
    organizationId:
      1,

    environmentId:
      1,

    incidentId:
      1,

    isCurrent:
      1,
  },
  {
    unique:
      true,

    partialFilterExpression: {
      isCurrent:
        true,
    },

    name:
      "one_current_diagnosis_per_incident",
  }
);

// ============================================================================
// EXPORT
// ============================================================================

const IncidentDiagnosis =
  mongoose.model(
    "IncidentDiagnosis",
    incidentDiagnosisSchema
  );

module.exports =
  IncidentDiagnosis;

module.exports.DIAGNOSIS_STATUSES =
  DIAGNOSIS_STATUSES;

module.exports.DIAGNOSIS_OUTCOMES =
  DIAGNOSIS_OUTCOMES;

module.exports.HYPOTHESIS_STATUSES =
  HYPOTHESIS_STATUSES;

module.exports.CONTRADICTION_TYPES =
  CONTRADICTION_TYPES;

module.exports.RISK_LEVELS =
  RISK_LEVELS;

module.exports.NEXT_STEP_TYPES =
  NEXT_STEP_TYPES;