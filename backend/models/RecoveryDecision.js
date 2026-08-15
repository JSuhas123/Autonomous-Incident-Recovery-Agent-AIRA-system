"use strict";

const mongoose =
  require(
    "mongoose"
  );

const recoveryDecisionSchema =
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

      organizationId: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      environmentId: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      incidentId: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      diagnosisId: {
        type:
          String,

        default:
          null,

        index:
          true,
      },

      diagnosisRevision: {
        type:
          Number,

        default:
          null,
      },

      runId: {
        type:
          String,

        default:
          null,

        index:
          true,
      },

      revision: {
        type:
          Number,

        required:
          true,

        min:
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

      status: {
        type:
          String,

        enum: [
          "current",
          "superseded",
          "rejected",
          "manual_review",
        ],

        default:
          "current",
      },

      decision: {
        type:
          String,

        required:
          true,
      },

      selectedCandidateId: {
        type:
          String,

        default:
          null,
      },

      selectedPlaybookId: {
        type:
          String,

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

      candidates: {
        type: [
          mongoose.Schema.Types.Mixed,
        ],

        default:
          [],
      },

      rejectedCandidates: {
        type: [
          mongoose.Schema.Types.Mixed,
        ],

        default:
          [],
      },

      reasons: {
        type: [
          String,
        ],

        default:
          [],
      },

      unknowns: {
        type: [
          String,
        ],

        default:
          [],
      },

      policyStatus: {
        type:
          String,

        default:
          null,
      },

      riskLevel: {
        type:
          String,

        default:
          null,
      },

      approvalRequired: {
        type:
          Boolean,

        default:
          false,
      },

      approvalMode: {
        type:
          String,

        default:
          null,
      },

      rollbackAvailable: {
        type:
          Boolean,

        default:
          false,
      },

      reversibility: {
        type:
          String,

        default:
          null,
      },

      criticResult: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          null,
      },

      supersedesDecisionId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "RecoveryDecision",

        default:
          null,
      },

      supersededByDecisionId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "RecoveryDecision",

        default:
          null,
      },

      generatedAt: {
        type:
          Date,

        default:
          Date.now,
      },

      executionAuthorized: {
        type:
          Boolean,

        default:
          false,

        immutable:
          true,
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

recoveryDecisionSchema.index(
  {
    organizationId:
      1,

    environmentId:
      1,

    incidentId:
      1,

    revision:
      -1,
  }
);

recoveryDecisionSchema.index(
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
    partialFilterExpression: {
      isCurrent:
        true,
    },
  }
);

module.exports =
  mongoose.model(
    "RecoveryDecision",
    recoveryDecisionSchema
  );