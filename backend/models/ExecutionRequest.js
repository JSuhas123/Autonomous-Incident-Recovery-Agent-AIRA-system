"use strict";

const mongoose =
  require(
    "mongoose"
  );

const executionRequestSchema =
  new mongoose.Schema(
    {
      executionRequestId: {
        type:
          String,

        required:
          true,

        unique:
          true,

        index:
          true,
      },

      authorizationId: {
        type:
          String,

        required:
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

      recoveryDecisionId: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      recoveryDecisionRevision: {
        type:
          Number,

        default:
          null,
      },

      candidateId: {
        type:
          String,

        default:
          null,
      },

      playbookId: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      state: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      planId: {
        type:
          String,

        default:
          null,
      },

      planHash: {
        type:
          String,

        default:
          null,
      },

      executionPlan: {
        type:
          mongoose.Schema.Types.Mixed,

        required:
          true,
      },

      idempotencyKey: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      lockKey: {
        type:
          String,

        default:
          null,
      },

      leaseOwnerId: {
        type:
          String,

        default:
          null,
      },

      attempt: {
        type:
          Number,

        min:
          0,

        default:
          0,
      },

      maxAttempts: {
        type:
          Number,

        min:
          1,

        default:
          1,
      },

      requestedAt: {
        type:
          Date,

        default:
          Date.now,
      },

      queuedAt: {
        type:
          Date,

        default:
          null,
      },

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

      cancelledAt: {
        type:
          Date,

        default:
          null,
      },

      failure: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          null,
      },

      result: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          null,
      },

      rollback: {
        type:
          mongoose.Schema.Types.Mixed,

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
      timestamps:
        true,

      versionKey:
        false,
    }
  );

executionRequestSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  incidentId:
    1,

  createdAt:
    -1,
});

executionRequestSchema.index(
  {
    organizationId:
      1,

    environmentId:
      1,

    idempotencyKey:
      1,
  },
  {
    unique:
      true,
  }
);

module.exports =
  mongoose.models
    .ExecutionRequest ||
  mongoose.model(
    "ExecutionRequest",
    executionRequestSchema
  );