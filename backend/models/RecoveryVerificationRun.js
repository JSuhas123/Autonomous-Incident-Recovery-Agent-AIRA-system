"use strict";

const mongoose =
  require(
    "mongoose"
  );

const recoveryVerificationRunSchema =
  new mongoose.Schema(
    {
      verificationRunId: {
        type:
          String,

        required:
          true,

        unique:
          true,

        index:
          true,
      },

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

      state: {
        type:
          String,

        enum: [
          "CREATED",
          "RUNNING",
          "COMPLETED",
          "FAILED",
          "CANCELLED",
        ],

        required:
          true,
      },

      attempt: {
        type:
          Number,

        default:
          0,

        min:
          0,
      },

      maxAttempts: {
        type:
          Number,

        default:
          1,

        min:
          1,
      },

      verificationPlanId: {
        type:
          String,

        default:
          null,
      },

      verificationPlanHash: {
        type:
          String,

        default:
          null,
      },

      resultVerificationDocumentId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "RecoveryVerification",

        default:
          null,
      },

      requestedAt: {
        type:
          Date,

        default:
          Date.now,
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

      failure: {
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

recoveryVerificationRunSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  incidentId:
    1,

  createdAt:
    -1,
});

module.exports =
  mongoose.model(
    "RecoveryVerificationRun",
    recoveryVerificationRunSchema
  );