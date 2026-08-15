"use strict";

const mongoose =
  require(
    "mongoose"
  );

const {
  RUNTIME_STAGE,
  CHECKPOINT_STATUS,
  INTERRUPTION_REASON,
  RESUME_SAFETY,
} =
  require(
    "../services/recoveryRuntime/recoveryRuntimeContracts"
  );

const runtimeRecoveryCheckpointSchema =
  new mongoose.Schema(
    {
      organizationId: {
        type:
          mongoose.Schema.Types.ObjectId,

        required:
          true,

        index:
          true,
      },

      environmentId: {
        type:
          mongoose.Schema.Types.ObjectId,

        required:
          true,

        index:
          true,
      },

      incidentId: {
        type:
          mongoose.Schema.Types.ObjectId,

        required:
          true,

        index:
          true,
      },

      /**
       * Deterministic identity of this particular
       * workflow operation.
       *
       * Example:
       *
       * incident + stage + immutable revision
       */
      operationKey: {
        type:
          String,

        required:
          true,

        trim:
          true,
      },

      stage: {
        type:
          String,

        required:
          true,

        enum:
          Object.values(
            RUNTIME_STAGE
          ),

        index:
          true,
      },

      status: {
        type:
          String,

        required:
          true,

        enum:
          Object.values(
            CHECKPOINT_STATUS
          ),

        default:
          CHECKPOINT_STATUS
            .PENDING,

        index:
          true,
      },

      /**
       * Immutable workflow identity.
       *
       * These fields allow restart recovery to prove
       * exactly which version/revision of an operation
       * was interrupted.
       */
      workflowIdentity: {
        diagnosisId: {
          type:
            String,

          default:
            null,
        },

        diagnosisRevision: {
          type:
            Number,

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

        executionPlanHash: {
          type:
            String,

          default:
            null,
        },

        verificationId: {
          type:
            String,

          default:
            null,
        },

        lifecycleId: {
          type:
            String,

          default:
            null,
        },
      },

      /**
       * Worker ownership.
       *
       * This does NOT authorize infrastructure
       * execution.
       *
       * It only records which runtime worker currently
       * owns this checkpoint.
       */
      owner: {
        workerId: {
          type:
            String,

          default:
            null,
        },

        claimToken: {
          type:
            String,

          default:
            null,
        },

        claimedAt: {
          type:
            Date,

          default:
            null,
        },

        heartbeatAt: {
          type:
            Date,

          default:
            null,
        },

        leaseExpiresAt: {
          type:
            Date,

          default:
            null,
        },
      },

      attempt: {
        type:
          Number,

        default:
          0,

        min:
          0,
      },

      interruption: {
        interrupted: {
          type:
            Boolean,

          default:
            false,
        },

        reason: {
          type:
            String,

          enum: [
            ...Object.values(
              INTERRUPTION_REASON
            ),

            null,
          ],

          default:
            null,
        },

        detectedAt: {
          type:
            Date,

          default:
            null,
        },
      },

      resumeSafety: {
        type:
          String,

        enum:
          Object.values(
            RESUME_SAFETY
          ),

        default:
          RESUME_SAFETY
            .UNKNOWN,
      },

      /**
       * Last safe durable output from this stage.
       *
       * Must never contain reusable execution
       * authorization.
       */
      result: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          null,
      },

      error: {
        code: {
          type:
            String,

          default:
            null,
        },

        message: {
          type:
            String,

          default:
            null,
        },

        retryable: {
          type:
            Boolean,

          default:
            false,
        },
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

      lastTransitionAt: {
        type:
          Date,

        default:
          null,
      },

      /**
       * Critical safety invariant.
       *
       * Runtime recovery checkpoints NEVER contain
       * infrastructure execution authorization.
       */
      executionAuthorized: {
        type:
          Boolean,

        default:
          false,

        immutable:
          true,

        validate: {
          validator:
            function (
              value
            ) {
              return (
                value !==
                true
              );
            },

          message:
            "Runtime recovery checkpoint cannot contain execution authorization",
        },
      },
    },
    {
      timestamps:
        true,

      minimize:
        false,

      versionKey:
        "__v",
    }
  );

/**
 * Exactly one durable checkpoint may exist for a
 * particular scoped workflow operation.
 */
runtimeRecoveryCheckpointSchema
  .index(
    {
      organizationId:
        1,

      environmentId:
        1,

      incidentId:
        1,

      stage:
        1,

      operationKey:
        1,
    },
    {
      unique:
        true,

      name:
        "runtime_recovery_checkpoint_identity",
    }
  );

/**
 * Supports restart scanning for unfinished work.
 */
runtimeRecoveryCheckpointSchema
  .index(
    {
      status:
        1,

      "owner.leaseExpiresAt":
        1,
    },
    {
      name:
        "runtime_recovery_checkpoint_resume_scan",
    }
  );

module.exports =
  mongoose.models
    .RuntimeRecoveryCheckpoint ||
  mongoose.model(
    "RuntimeRecoveryCheckpoint",
    runtimeRecoveryCheckpointSchema
  );