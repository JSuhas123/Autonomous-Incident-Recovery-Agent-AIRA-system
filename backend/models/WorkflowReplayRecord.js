"use strict";

const mongoose =
  require(
    "mongoose"
  );

const {
  Schema,
} =
  mongoose;


/*
 * ============================================================================
 * AIRA PHASE 11.4.4
 * WORKFLOW REPLAY RECORD
 * ============================================================================
 *
 * One record represents one logical replay/resume request.
 *
 * IMPORTANT:
 *
 * replay ownership
 *      ≠
 * execution authorization
 *
 * This model stores orchestration state only.
 * ============================================================================
 */


const replayHistorySchema =
  new Schema(
    {
      type: {
        type:
          String,

        required:
          true,
      },

      occurredAt: {
        type:
          Date,

        required:
          true,

        default:
          Date.now,
      },

      actorType: {
        type:
          String,

        default:
          "system",
      },

      actorId: {
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

      metadata: {
        type:
          Schema.Types.Mixed,

        default:
          {},
      },
    },
    {
      _id:
        false,
    }
  );


const workflowReplayRecordSchema =
  new Schema(
    {
      replayId: {
        type:
          String,

        required:
          true,

        unique:
          true,

        index:
          true,
      },

      replayKey: {
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

      correlationId: {
        type:
          String,

        default:
          null,

        index:
          true,
      },

      source: {
        type:
          String,

        required:
          true,
      },

      mode: {
        type:
          String,

        required:
          true,
      },

      requestedStage: {
        type:
          String,

        default:
          null,
      },

      status: {
        type:
          String,

        required:
          true,

        default:
          "REQUESTED",

        index:
          true,
      },

      decision: {
        type:
          String,

        default:
          null,
      },

      safety: {
        type:
          String,

        default:
          null,
      },

      resumeStage: {
        type:
          String,

        default:
          null,
      },

      reason: {
        type:
          String,

        default:
          null,
      },

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

        leaseExpiresAt: {
          type:
            Date,

          default:
            null,
        },
      },

      attempts: {
        count: {
          type:
            Number,

          default:
            0,
        },

        maxAttempts: {
          type:
            Number,

          default:
            5,
        },
      },

      dispatch: {
        dispatched: {
          type:
            Boolean,

          default:
            false,
        },

        dispatchedAt: {
          type:
            Date,

          default:
            null,
        },

        stage: {
          type:
            String,

          default:
            null,
        },

        durableEventId: {
          type:
            String,

          default:
            null,
        },

        duplicate: {
          type:
            Boolean,

          default:
            false,
        },
      },

      result: {
        type:
          Schema.Types.Mixed,

        default:
          null,
      },

      failure: {
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

        failedAt: {
          type:
            Date,

          default:
            null,
        },
      },

      history: {
        type: [
          replayHistorySchema,
        ],

        default:
          [],
      },

      completedAt: {
        type:
          Date,

        default:
          null,
      },

      /*
       * SAFETY SENTINEL
       *
       * Replay records must never become execution authority.
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
      timestamps:
        true,

      minimize:
        false,
    }
  );


workflowReplayRecordSchema
  .index(
    {
      organizationId:
        1,

      environmentId:
        1,

      incidentId:
        1,

      status:
        1,
    }
  );


workflowReplayRecordSchema
  .index(
    {
      "owner.leaseExpiresAt":
        1,
    }
  );


module.exports =
  mongoose.models
    .WorkflowReplayRecord ||
  mongoose.model(
    "WorkflowReplayRecord",
    workflowReplayRecordSchema
  );