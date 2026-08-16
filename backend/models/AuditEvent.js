"use strict";

const mongoose =
  require(
    "mongoose"
  );


const auditEventSchema =
  new mongoose.Schema(
    {
      eventId: {
        type:
          String,

        required:
          true,

        unique:
          true,

        immutable:
          true,
      },


      tenantId: {
        type:
          String,

        required:
          true,

        immutable:
          true,
      },


      organizationId: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref:
          "Organization",

        default:
          null,

        immutable:
          true,
      },


      environmentId: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref:
          "Environment",

        default:
          null,

        immutable:
          true,
      },


      correlationId: {
        type:
          String,

        default:
          null,

        immutable:
          true,
      },


      timestamp: {
        type:
          Date,

        required:
          true,

        default:
          Date.now,

        immutable:
          true,
      },


      /*
       * Monotonic position inside one tenant's audit chain.
       *
       * The unique compound index below prevents concurrent
       * writers from committing the same chain position.
       */
      chainIndex: {
        type:
          Number,

        required:
          true,

        min:
          1,

        immutable:
          true,
      },


      eventType: {
        type:
          String,

        enum: [
          "decision_made",
          "action_executed",
          "policy_enforced",
          "approval_given",
          "approval_rejected",
          "rollback_triggered",
          "policy_updated",
          "api_call",
        ],

        required:
          true,

        immutable:
          true,
      },


      principal: {
        type:
          String,

        enum: [
          "system",
          "human",
        ],

        required:
          true,

        immutable:
          true,
      },


      principalId: {
        type:
          String,

        default:
          null,

        immutable:
          true,
      },


      action: {
        type:
          String,

        default:
          null,

        immutable:
          true,
      },


      serviceId: {
        type:
          String,

        default:
          null,

        immutable:
          true,
      },


      actionDetails: {
        type: {
          actionType:
            String,

          executionStatus: {
            type:
              String,

            enum: [
              "pending",
              "success",
              "failed",
              "rolled_back",
            ],
          },

          outcome:
            String,

          duration:
            Number,

          rollbackPossible:
            Boolean,

          rollbackPlan:
            mongoose.Schema.Types
              .Mixed,

          confidenceScore:
            Number,
        },

        default:
          null,

        immutable:
          true,
      },


      payload: {
        type:
          mongoose.Schema.Types
            .Mixed,

        default:
          null,

        immutable:
          true,
      },


      metadata: {
        type:
          mongoose.Schema.Types
            .Mixed,

        default:
          null,

        immutable:
          true,
      },


      previousEventHash: {
        type:
          String,

        default:
          null,

        immutable:
          true,
      },


      /*
       * HMAC over canonical immutable event content.
       */
      signature: {
        type:
          String,

        required:
          true,

        immutable:
          true,
      },


      /*
       * SHA-256 of canonical event content + signature.
       *
       * This becomes the predecessor reference for the
       * next chain event.
       */
      eventHash: {
        type:
          String,

        required:
          true,

        immutable:
          true,
      },


      status: {
        type:
          String,

        enum: [
          "created",
          "verified",
          "tampered",
        ],

        default:
          "created",

        immutable:
          true,
      },
    },
    {
      versionKey:
        false,

      timestamps:
        false,
    }
  );


// ============================================================================
// INDEXES
// ============================================================================

auditEventSchema
  .index({
    tenantId:
      1,

    timestamp:
      -1,
  });


auditEventSchema
  .index({
    correlationId:
      1,

    timestamp:
      -1,
  });


auditEventSchema
  .index({
    tenantId:
      1,

    eventType:
      1,

    timestamp:
      -1,
  });


/*
 * Fork protection.
 *
 * Two concurrent writers may read the same predecessor, but
 * only one may commit the next chain position.
 *
 * The loser retries against the new tail.
 */
auditEventSchema
  .index(
    {
      tenantId:
        1,

      chainIndex:
        1,
    },
    {
      unique:
        true,
    }
  );


/*
 * IMPORTANT:
 *
 * No TTL index here.
 *
 * Deleting the beginning/middle of a cryptographic custody
 * chain makes downstream links impossible to verify.
 *
 * Phase 11.11 retention will archive complete chain segments
 * safely instead of MongoDB independently expiring rows.
 */


// ============================================================================
// APPEND-ONLY PROTECTION
// ============================================================================

function immutableAuditError() {
  return Object.assign(
    new Error(
      "AuditEvent records are append-only and immutable"
    ),
    {
      code:
        "AUDIT_EVENT_IMMUTABLE",

      executionAuthorized:
        false,
    }
  );
}


auditEventSchema.pre(
  [
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "findOneAndReplace",
    "replaceOne",
    "findOneAndDelete",
    "findByIdAndDelete",
    "deleteOne",
    "deleteMany",
  ],
  function guardAuditMutation() {
    throw immutableAuditError();
  }
);


auditEventSchema.pre(
  "save",
  function guardExistingDocumentMutation(
    next
  ) {
    if (
      !this.isNew &&
      this.isModified()
    ) {
      return next(
        immutableAuditError()
      );
    }

    return next();
  }
);


module.exports =
  mongoose.model(
    "AuditEvent",
    auditEventSchema
  );