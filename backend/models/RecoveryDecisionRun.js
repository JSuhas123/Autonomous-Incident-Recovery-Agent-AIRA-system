"use strict";

const mongoose =
  require(
    "mongoose"
  );

const recoveryDecisionRunSchema =
  new mongoose.Schema(
    {
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

      decisionId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "RecoveryDecision",

        default:
          null,
      },

      decisionType: {
        type:
          String,

        default:
          null,
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

      stageTrace: {
        type: [
          mongoose.Schema.Types.Mixed,
        ],

        default:
          [],
      },

      candidateSnapshot: {
        type: [
          mongoose.Schema.Types.Mixed,
        ],

        default:
          [],
      },

      criticResult: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          null,
      },

      status: {
        type:
          String,

        enum: [
          "running",
          "completed",
          "failed",
        ],

        default:
          "running",
      },

      error: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          null,
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

        default:
          null,
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

recoveryDecisionRunSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  incidentId:
    1,

  startedAt:
    -1,
});

recoveryDecisionRunSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  diagnosisId:
    1,

  startedAt:
    -1,
});

module.exports =
  mongoose.model(
    "RecoveryDecisionRun",
    recoveryDecisionRunSchema
  );