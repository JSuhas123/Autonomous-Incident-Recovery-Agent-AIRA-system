"use strict";

const mongoose =
  require(
    "mongoose"
  );

const incidentLifecycleTransitionSchema =
  new mongoose.Schema(
    {
      transitionId: {
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

      revision: {
        type:
          Number,

        required:
          true,

        min:
          1,
      },

      fromState: {
        type:
          String,

        required:
          true,
      },

      toState: {
        type:
          String,

        required:
          true,
      },

      reason: {
        type:
          String,

        default:
          null,
      },

      actor: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          {},
      },

      source: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          {},
      },

      verificationId: {
        type:
          String,

        default:
          null,
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

      metadata: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          {},
      },

      transitionedAt: {
        type:
          Date,

        required:
          true,
      },
    },
    {
      timestamps:
        true,

      versionKey:
        false,
    }
  );

incidentLifecycleTransitionSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  incidentId:
    1,

  revision:
    1,
});

module.exports =
  mongoose.model(
    "IncidentLifecycleTransition",
    incidentLifecycleTransitionSchema
  );