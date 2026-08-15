"use strict";

const mongoose =
  require(
    "mongoose"
  );

const recoveryVerificationSchema =
  new mongoose.Schema(
    {
      verificationId: {
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

      executionRequestId: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      authorizationId: {
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

        index:
          true,
      },

      executionPlanId: {
        type:
          String,

        default:
          null,
      },

      executionPlanHash: {
        type:
          String,

        default:
          null,
      },

      verificationPlanId: {
        type:
          String,

        required:
          true,
      },

      verificationPlanHash: {
        type:
          String,

        required:
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
        ],

        default:
          "current",
      },

      decision: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      confidence: {
        type:
          String,

        default:
          null,
      },

      nextAction: {
        type:
          String,

        default:
          null,
      },

      recovered: {
        type:
          Boolean,

        default:
          false,
      },

      recoveryConfirmed: {
        type:
          Boolean,

        default:
          false,

        index:
          true,
      },

      incidentClosureEligible: {
        type:
          Boolean,

        default:
          false,

        index:
          true,
      },

      overallScore: {
        type:
          Number,

        default:
          null,

        min:
          0,

        max:
          1,
      },

      verificationPlan: {
        type:
          mongoose.Schema.Types.Mixed,

        required:
          true,
      },

      evidencePackage: {
        type:
          mongoose.Schema.Types.Mixed,

        required:
          true,
      },

      decisionResult: {
        type:
          mongoose.Schema.Types.Mixed,

        required:
          true,
      },

      criticResult: {
        type:
          mongoose.Schema.Types.Mixed,

        required:
          true,
      },

      routingResult: {
        type:
          mongoose.Schema.Types.Mixed,

        required:
          true,
      },

      previousVerificationId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "RecoveryVerification",

        default:
          null,
      },

      supersededByVerificationId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "RecoveryVerification",

        default:
          null,
      },

      verifiedAt: {
        type:
          Date,

        default:
          Date.now,
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

recoveryVerificationSchema.index(
  {
    organizationId:
      1,

    environmentId:
      1,

    incidentId:
      1,

    revision:
      1,
  },
  {
    unique:
      true,
  }
);

recoveryVerificationSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  incidentId:
    1,

  isCurrent:
    1,
});

recoveryVerificationSchema.index({
  executionRequestId:
    1,

  createdAt:
    -1,
});

module.exports =
  mongoose.model(
    "RecoveryVerification",
    recoveryVerificationSchema
  );