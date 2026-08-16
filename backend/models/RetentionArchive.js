"use strict";

const mongoose =
  require(
    "mongoose"
  );


const retentionArchiveSchema =
  new mongoose.Schema(
    {
      tenantId: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        index:
          true,
      },


      sourceModel: {
        type:
          String,

        required:
          true,

        immutable:
          true,
      },


      sourceId: {
        type:
          String,

        required:
          true,

        immutable:
          true,
      },


      sourceTimestamp: {
        type:
          Date,

        default:
          null,

        immutable:
          true,
      },


      /*
       * Immutable snapshot of the original record.
       */
      payload: {
        type:
          mongoose.Schema.Types
            .Mixed,

        required:
          true,

        immutable:
          true,
      },


      /*
       * SHA-256 over canonicalized archive payload.
       *
       * Phase 11.11 archival integrity is independent from
       * Phase 11.9's audit hash chain.
       */
      checksum: {
        type:
          String,

        required:
          true,

        immutable:
          true,
      },


      archiveReason: {
        type:
          String,

        required:
          true,

        immutable:
          true,
      },


      archivedAt: {
        type:
          Date,

        default:
          Date.now,

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
// IDEMPOTENT ARCHIVAL
// ============================================================================

retentionArchiveSchema
  .index(
    {
      sourceModel:
        1,

      sourceId:
        1,
    },
    {
      unique:
        true,
    }
  );


retentionArchiveSchema
  .index({
    tenantId:
      1,

    archivedAt:
      -1,
  });


retentionArchiveSchema
  .index({
    sourceModel:
      1,

    archivedAt:
      -1,
  });


// ============================================================================
// IMMUTABILITY
// ============================================================================

function archiveImmutableError() {
  return Object.assign(
    new Error(
      "RetentionArchive records are immutable"
    ),
    {
      code:
        "RETENTION_ARCHIVE_IMMUTABLE",

      executionAuthorized:
        false,
    }
  );
}


retentionArchiveSchema.pre(
  [
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "replaceOne",
    "findOneAndReplace",
    "deleteOne",
    "deleteMany",
    "findOneAndDelete",
    "findByIdAndDelete",
  ],
  function guardArchiveMutation() {
    throw archiveImmutableError();
  }
);


retentionArchiveSchema.pre(
  "save",
  function guardExistingArchiveMutation(
    next
  ) {
    if (
      !this.isNew &&
      this.isModified()
    ) {
      return next(
        archiveImmutableError()
      );
    }

    return next();
  }
);


module.exports =
  mongoose.model(
    "RetentionArchive",
    retentionArchiveSchema
  );