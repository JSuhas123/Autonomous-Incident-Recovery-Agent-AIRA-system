"use strict";

const mongoose =
  require(
    "mongoose"
  );

const executionAuthorizationSchema =
  new mongoose.Schema(
    {
      authorizationId: {
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

        index:
          true,
      },

      decision: {
        type:
          String,

        required:
          true,
      },

      status: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      authorizationGranted: {
        type:
          Boolean,

        required:
          true,

        default:
          false,
      },

      approvalState: {
        type:
          String,

        default:
          null,
      },

      policyState: {
        type:
          String,

        default:
          null,
      },

      freshnessState: {
        type:
          String,

        default:
          null,
      },

      killSwitchState: {
        type:
          String,

        default:
          null,
      },

      lockState: {
        type:
          String,

        default:
          null,
      },

      idempotencyState: {
        type:
          String,

        default:
          null,
      },

      validFrom: {
        type:
          Date,

        default:
          null,
      },

      expiresAt: {
        type:
          Date,

        default:
          null,

        index:
          true,
      },

      authorizedAt: {
        type:
          Date,

        default:
          null,
      },

      reasons: {
        type: [
          String,
        ],

        default:
          [],
      },

      warnings: {
        type: [
          String,
        ],

        default:
          [],
      },

      executionPlan: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          null,
      },

      planId: {
        type:
          String,

        default:
          null,

        index:
          true,
      },

      planHash: {
        type:
          String,

        default:
          null,
      },

      idempotencyKey: {
        type:
          String,

        default:
          null,

        index:
          true,
      },

      leaseKey: {
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

      stageTrace: {
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

      consumedAt: {
        type:
          Date,

        default:
          null,
      },

      revokedAt: {
        type:
          Date,

        default:
          null,
      },

      revokedReason: {
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
    },
    {
      timestamps:
        true,

      versionKey:
        false,
    }
  );

executionAuthorizationSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  incidentId:
    1,

  createdAt:
    -1,
});

executionAuthorizationSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  recoveryDecisionId:
    1,

  createdAt:
    -1,
});

module.exports =
  mongoose.model(
    "ExecutionAuthorization",
    executionAuthorizationSchema
  );