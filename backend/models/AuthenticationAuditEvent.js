"use strict";

const mongoose =
  require(
    "mongoose"
  );

const {
  AUTH_EVENT_TYPE_VALUES,
  AUTH_EVENT_OUTCOME_VALUES,
} =
  require(
    "../constants/authEvents"
  );


const authenticationAuditEventSchema =
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


      eventType: {
        type:
          String,

        enum:
          AUTH_EVENT_TYPE_VALUES,

        required:
          true,

        immutable:
          true,
      },


      userId: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref:
          "User",

        default:
          null,

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


      sessionId: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref:
          "UserSession",

        default:
          null,

        immutable:
          true,
      },


      outcome: {
        type:
          String,

        enum:
          AUTH_EVENT_OUTCOME_VALUES,

        required:
          true,

        immutable:
          true,
      },


      reasonCode: {
        type:
          String,

        default:
          null,

        immutable:
          true,
      },


      requestId: {
        type:
          String,

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


      ipHash: {
        type:
          String,

        default:
          null,

        immutable:
          true,
      },


      userAgentHash: {
        type:
          String,

        default:
          null,

        immutable:
          true,
      },


      /*
       * Identity audit events are chained globally.
       *
       * Identity events may not always have an organization yet
       * (e.g. failed login for an unknown user), so organization
       * cannot be the chain partition.
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


      previousEventHash: {
        type:
          String,

        default:
          null,

        immutable:
          true,
      },


      signature: {
        type:
          String,

        required:
          true,

        immutable:
          true,
      },


      eventHash: {
        type:
          String,

        required:
          true,

        immutable:
          true,
      },


      /*
       * Never store passwords, tokens, secrets or authorization
       * headers here. identityAuditService sanitizes recursively.
       */
      metadata: {
        type:
          mongoose.Schema.Types
            .Mixed,

        default:
          null,

        immutable:
          true,
      },
    },
    {
      versionKey:
        false,

      timestamps: {
        createdAt:
          true,

        updatedAt:
          false,
      },
    }
  );


// ============================================================================
// INDEXES
// ============================================================================

authenticationAuditEventSchema
  .index({
    userId:
      1,

    createdAt:
      -1,
  });


authenticationAuditEventSchema
  .index({
    organizationId:
      1,

    createdAt:
      -1,
  });


authenticationAuditEventSchema
  .index({
    eventType:
      1,

    createdAt:
      -1,
  });


authenticationAuditEventSchema
  .index({
    createdAt:
      -1,
  });


authenticationAuditEventSchema
  .index(
    {
      chainIndex:
        1,
    },
    {
      unique:
        true,
    }
  );


// ============================================================================
// APPEND-ONLY GUARDS
// ============================================================================

function immutableIdentityAuditError() {
  return Object.assign(
    new Error(
      "AuthenticationAuditEvent records are append-only and immutable"
    ),
    {
      code:
        "AUTH_AUDIT_EVENT_IMMUTABLE",

      executionAuthorized:
        false,
    }
  );
}


authenticationAuditEventSchema.pre(
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
  function guardImmutable() {
    throw immutableIdentityAuditError();
  }
);


authenticationAuditEventSchema.pre(
  "save",
  function guardExistingDocumentMutation(
    next
  ) {
    if (
      !this.isNew &&
      this.isModified()
    ) {
      return next(
        immutableIdentityAuditError()
      );
    }

    return next();
  }
);


module.exports =
  mongoose.model(
    "AuthenticationAuditEvent",
    authenticationAuditEventSchema
  );