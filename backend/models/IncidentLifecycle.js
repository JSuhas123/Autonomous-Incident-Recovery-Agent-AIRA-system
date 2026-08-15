"use strict";

const mongoose =
  require(
    "mongoose"
  );

const incidentLifecycleSchema =
  new mongoose.Schema(
    {
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

      lifecycleState: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      revision: {
        type:
          Number,

        required:
          true,

        default:
          1,

        min:
          1,
      },

      verificationId: {
        type:
          String,

        default:
          null,

        index:
          true,
      },

      recoveryDecisionId: {
        type:
          String,

        default:
          null,
      },

      executionRequestId: {
        type:
          String,

        default:
          null,
      },

      retryRequestId: {
        type:
          String,

        default:
          null,
      },

      rollbackRequestId: {
        type:
          String,

        default:
          null,
      },

      escalationId: {
        type:
          String,

        default:
          null,
      },

      stabilityObservation: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          null,
      },

      closureEligibility: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          null,
      },

      latestTransition: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          null,
      },

      lastReason: {
        type:
          String,

        default:
          null,
      },

      resolvedAt: {
        type:
          Date,

        default:
          null,
      },

      closedAt: {
        type:
          Date,

        default:
          null,
      },

      regressedAt: {
        type:
          Date,

        default:
          null,
      },

      escalatedAt: {
        type:
          Date,

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

incidentLifecycleSchema.index(
  {
    organizationId:
      1,

    environmentId:
      1,

    incidentId:
      1,
  },
  {
    unique:
      true,
  }
);

module.exports =
  mongoose.model(
    "IncidentLifecycle",
    incidentLifecycleSchema
  );