"use strict";

const Contract =
  require(
    "../repositories/EmailVerificationTokenRepository"
  );

const Model =
  require(
    "../../models/EmailVerificationToken"
  );

const support =
  require(
    "./MongoIdentityRepositorySupport"
  );

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
      set || {}
    );

  const invalid =
    keys.filter(
      (key) =>
        !TERMINAL_FIELDS.has(
          key
        )
    );

  if (
    invalid.length
  ) {
    throw Object.assign(
      new Error(
        "Email verification tokens are immutable except for terminal used/revoked state"
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

class MongoEmailVerificationTokenRepository
  extends Contract {
  findOne(
    filter = {},
    options = {},
    transaction =
      null
  ) {
    const parsed =
      support.mutationOptions(
        options,
        transaction
      );

    let query =
      Model.findOne(
        filter
      );

    if (
      parsed.options
        .includeTokenHash ===
      true
    ) {
      query =
        query.select(
          "+tokenHash"
        );
    }

    return support
      .applySession(
        query,
        parsed.transaction
      );
  }

  findMany(
    filter = {},
    options = {},
    transaction =
      null
  ) {
    const parsed =
      support.mutationOptions(
        options,
        transaction
      );

    let query =
      Model.find(
        filter
      );

    if (
      parsed.options
        .includeTokenHash ===
      true
    ) {
      query =
        query.select(
          "+tokenHash"
        );
    }

    return support
      .applySession(
        query,
        parsed.transaction
      );
  }

  create(
    data,
    transaction =
      null
  ) {
    return support.create(
      Model,
      data,
      transaction
    );
  }

  updateOne(
    filter,
    update,
    options = {},
    transaction =
      null
  ) {
    assertTerminalOnlyUpdate(
      update
    );

    return support.updateOne(
      Model,
      filter,
      update,
      options,
      transaction
    );
  }

  async consumeActiveToken(
    tokenHash,
    usedAt =
      new Date(),
    transaction =
      null
  ) {
    let query =
      Model
        .findOneAndUpdate(
          {
            tokenHash,

            usedAt:
              null,

            revokedAt:
              null,

            expiresAt: {
              $gt:
                usedAt,
            },
          },

          {
            $set: {
              usedAt,
            },
          },

          {
            new:
              true,
          }
        )
        .select(
          "+tokenHash"
        );

    query =
      support.applySession(
        query,
        transaction
      );

    return query;
  }
}

module.exports =
  MongoEmailVerificationTokenRepository;