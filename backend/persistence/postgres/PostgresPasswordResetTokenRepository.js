"use strict";

const Contract =
  require(
    "../repositories/PasswordResetTokenRepository"
  );

const Base =
  require(
    "./PostgresIdentityRepositoryBase"
  );

/*
 * Password-reset credential material is immutable.
 *
 * Only lifecycle terminal fields may ever change:
 *
 * usedAt
 * revokedAt
 */
const TERMINAL_FIELDS =
  new Set([
    "usedAt",

    "revokedAt",
  ]);

function assertTerminalOnlyUpdate(
  update = {}
) {
  const set =
    update.$set ||
    update;

  const keys =
    Object.keys(
      set ||
      {}
    );

  const invalid =
    keys.filter(
      (
        key
      ) =>
        !TERMINAL_FIELDS
          .has(
            key
          )
    );

  if (
    invalid.length
  ) {
    throw Object.assign(
      new Error(
        "Password reset tokens are immutable except for terminal used/revoked state"
      ),

      {
        code:
          "TOKEN_IMMUTABLE_FIELD",

        fields:
          invalid,
      }
    );
  }
}

class PostgresPasswordResetTokenRepository
  extends Contract {
  constructor(
    options = {}
  ) {
    super();

    this.repository =
      new Base(
        options,

        {
          table:
            "identity.password_reset_tokens",

          columns: [
            "legacy_mongo_id",

            "user_id",

            "token_hash",

            "expires_at",

            "used_at",

            "revoked_at",

            "created_at",
          ],

          hiddenColumns: [
            "token_hash",
          ],

          secretOptions: {
            token_hash:
              "includeTokenHash",
          },

          foreignKeyColumns: {
            user_id:
              "identity.users",
          },

          identifierColumns: [
            "legacy_mongo_id",

            "id::text",
          ],
        }
      );
  }

  findOne(
    ...args
  ) {
    return this
      .repository
      .findOne(
        ...args
      );
  }

  findMany(
    ...args
  ) {
    return this
      .repository
      .findMany(
        ...args
      );
  }

  create(
    ...args
  ) {
    return this
      .repository
      .create(
        ...args
      );
  }

  updateOne(
    filter,

    update,

    ...args
  ) {
    assertTerminalOnlyUpdate(
      update
    );

    return this
      .repository
      .updateOne(
        filter,

        update,

        ...args
      );
  }
}

module.exports =
  PostgresPasswordResetTokenRepository;