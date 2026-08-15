"use strict";

const mongoose =
  require(
    "mongoose"
  );

const {
  OUTBOX_STATUS,
  OUTBOX_EVENT_TYPE,
  OUTBOX_AGGREGATE_TYPE,
} =
  require(
    "../services/workflowOutbox/workflowOutboxContracts"
  );

const workflowOutboxEventSchema =
  new mongoose.Schema(
    {
      eventId: {
        type:
          String,

        required:
          true,

        unique:
          true,

        index:
          true,

        trim:
          true,
      },

      eventKey: {
        type:
          String,

        required:
          true,

        unique:
          true,

        index:
          true,

        trim:
          true,
      },
     
      payloadFingerprint: {
  type:
    String,

  required:
    true,

  index:
    true,

  trim:
    true,
},

      organizationId: {
        type:
          String,

        required:
          true,

        index:
          true,

        trim:
          true,
      },

      environmentId: {
        type:
          String,

        required:
          true,

        index:
          true,

        trim:
          true,
      },

      incidentId: {
        type:
          String,

        required:
          true,

        index:
          true,

        trim:
          true,
      },

      aggregateType: {
        type:
          String,

        required:
          true,

        enum:
          Object.values(
            OUTBOX_AGGREGATE_TYPE
          ),

        index:
          true,
      },

      aggregateId: {
        type:
          String,

        required:
          true,

        index:
          true,

        trim:
          true,
      },

      eventType: {
        type:
          String,

        required:
          true,

        enum:
          Object.values(
            OUTBOX_EVENT_TYPE
          ),

        index:
          true,
      },

      payload: {
        type:
          mongoose.Schema.Types
            .Mixed,

        required:
          true,

        default:
          {},
      },

      metadata: {
        type:
          mongoose.Schema.Types
            .Mixed,

        default:
          {},
      },

      status: {
        type:
          String,

        required:
          true,

        enum:
          Object.values(
            OUTBOX_STATUS
          ),

        default:
          OUTBOX_STATUS
            .PENDING,

        index:
          true,
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

          index:
            true,
        },
      },

      attempts: {
        count: {
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
            10,

          min:
            1,
        },

        lastAttemptAt: {
          type:
            Date,

          default:
            null,
        },

        nextAttemptAt: {
          type:
            Date,

          default:
            null,

          index:
            true,
        },
      },

      delivery: {
        deliveredAt: {
          type:
            Date,

          default:
            null,
        },

        messageId: {
          type:
            String,

          default:
            null,
        },

        queue: {
          type:
            String,

          default:
            null,
        },

        exchange: {
          type:
            String,

          default:
            null,
        },

        routingKey: {
          type:
            String,

          default:
            null,
        },
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

      deadLetter: {
        reason: {
          type:
            String,

          default:
            null,
        },

        deadLetteredAt: {
          type:
            Date,

          default:
            null,
        },
      },

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

      versionKey:
        false,
    }
  );

// ============================================================================
// INDEXES
// ============================================================================

workflowOutboxEventSchema
  .index({
    status:
      1,

    "attempts.nextAttemptAt":
      1,

    "owner.leaseExpiresAt":
      1,
  });

workflowOutboxEventSchema
  .index({
    organizationId:
      1,

    environmentId:
      1,

    incidentId:
      1,

    eventType:
      1,
  });

workflowOutboxEventSchema
  .index({
    aggregateType:
      1,

    aggregateId:
      1,

    eventType:
      1,
  });

// ============================================================================
// SAFETY VALIDATION
// ============================================================================

workflowOutboxEventSchema
  .pre(
    "validate",
    function (
      next
    ) {
      if (
        this.executionAuthorized ===
        true
      ) {
        const error =
          new Error(
            "Workflow outbox event cannot contain execution authorization"
          );

        error.code =
          "OUTBOX_UNSAFE_AUTHORITY";

        return next(
          error
        );
      }

      if (
        this.payload &&
        (
          this.payload
            .executionAuthorized ===
            true ||
          this.payload
            .authorizationGranted ===
            true
        )
      ) {
        const error =
          new Error(
            "Workflow outbox payload cannot grant execution authority"
          );

        error.code =
          "OUTBOX_UNSAFE_AUTHORITY";

        return next(
          error
        );
      }

      return next();
    }
  );

// ============================================================================
// INSTANCE HELPERS
// ============================================================================

workflowOutboxEventSchema
  .methods
  .isDelivered =
  function () {
    return (
      this.status ===
      OUTBOX_STATUS
        .DELIVERED
    );
  };

workflowOutboxEventSchema
  .methods
  .isDeadLetter =
  function () {
    return (
      this.status ===
      OUTBOX_STATUS
        .DEAD_LETTER
    );
  };

workflowOutboxEventSchema
  .methods
  .hasActiveLease =
  function (
    now =
      new Date()
  ) {
    return Boolean(
      this.owner
        ?.leaseExpiresAt &&
      this.owner
        .leaseExpiresAt >
        now
    );
  };

workflowOutboxEventSchema
  .methods
  .canAttempt =
  function (
    now =
      new Date()
  ) {
    if (
      this.status ===
        OUTBOX_STATUS
          .DELIVERED ||
      this.status ===
        OUTBOX_STATUS
          .DEAD_LETTER
    ) {
      return false;
    }

    if (
      this.attempts
        ?.count >=
      this.attempts
        ?.maxAttempts
    ) {
      return false;
    }

    if (
      this.attempts
        ?.nextAttemptAt &&
      this.attempts
        .nextAttemptAt >
        now
    ) {
      return false;
    }

    return true;
  };

// ============================================================================
// MODEL
// ============================================================================

const WorkflowOutboxEvent =
  mongoose.models
    .WorkflowOutboxEvent ||
  mongoose.model(
    "WorkflowOutboxEvent",
    workflowOutboxEventSchema
  );

module.exports =
  WorkflowOutboxEvent;

module.exports
  .workflowOutboxEventSchema =
  workflowOutboxEventSchema;