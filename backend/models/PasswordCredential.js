"use strict";

const mongoose =
  require(
    "mongoose"
  );


const passwordCredentialSchema =
  new mongoose.Schema(
    {
      userId: {
        type:
          mongoose.Schema
            .Types
            .ObjectId,

        ref:
          "User",

        required:
          true,

        immutable:
          true,
      },


      /*
       * Password material must never appear in normal queries.
       *
       * Authentication code must explicitly request:
       *
       *   .select("+passwordHash")
       */
      passwordHash: {
        type:
          String,

        required:
          true,

        select:
          false,
      },


      algorithm: {
        type:
          String,

        enum: [
          "argon2id",
        ],

        default:
          "argon2id",

        immutable:
          true,
      },


      hashVersion: {
        type:
          Number,

        default:
          1,

        min:
          1,
      },


      passwordChangedAt: {
        type:
          Date,

        default:
          Date.now,
      },


      failedAttempts: {
        type:
          Number,

        default:
          0,

        min:
          0,
      },


      lockedUntil: {
        type:
          Date,

        default:
          null,
      },


      lastFailedAt: {
        type:
          Date,

        default:
          null,
      },
    },
    {
      versionKey:
        false,

      timestamps:
        true,
    }
  );


// ============================================================================
// INDEXES
// ============================================================================

/*
 * Exactly one password credential record per user.
 */
passwordCredentialSchema
  .index(
    {
      userId:
        1,
    },
    {
      unique:
        true,
    }
  );


// ============================================================================
// SECRET REDACTION
// ============================================================================

function removeSensitiveFields(
  _doc,
  ret
) {
  if (
    !ret
  ) {
    return ret;
  }


  delete ret
    .passwordHash;

  delete ret
    .__v;


  /*
   * Explicit credential-boundary invariant.
   *
   * Authentication state is fine to expose internally, but
   * password material never is.
   */
  return ret;
}


passwordCredentialSchema
  .set(
    "toJSON",
    {
      transform:
        removeSensitiveFields,
    }
  );


passwordCredentialSchema
  .set(
    "toObject",
    {
      transform:
        removeSensitiveFields,
    }
  );


// ============================================================================
// DEFENSIVE SAVE VALIDATION
// ============================================================================

passwordCredentialSchema
  .pre(
    "save",
    function credentialSecretGuard(
      next
    ) {
      if (
        typeof this.passwordHash !==
          "string" ||
        !this.passwordHash
          .startsWith(
            "$argon2"
          )
      ) {
        return next(
          Object.assign(
            new Error(
              "PasswordCredential requires an Argon2 password hash"
            ),
            {
              code:
                "INVALID_PASSWORD_HASH",

              executionAuthorized:
                false,
            }
          )
        );
      }


      return next();
    }
  );


module.exports =
  mongoose.model(
    "PasswordCredential",
    passwordCredentialSchema
  );