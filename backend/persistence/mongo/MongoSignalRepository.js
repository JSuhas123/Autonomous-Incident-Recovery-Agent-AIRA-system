"use strict";

const SignalRepository =
  require(
    "../repositories/SignalRepository"
  );

const {
  Signal,
} =
  require(
    "../../models/Signal"
  );

function sessionFrom(
  transaction
) {
  return transaction
    ?.kind ===
    "mongo"
    ? transaction.session
    : null;
}

class MongoSignalRepository
  extends SignalRepository {
  async create(
    data,
    transaction = null
  ) {
    const session =
      sessionFrom(
        transaction
      );

    if (!session) {
      return Signal.create(
        data
      );
    }

    const [
      created,
    ] =
      await Signal.create(
        [
          data,
        ],
        {
          session,
        }
      );

    return created;
  }

  async findByDatabaseId(
  contextOrId,
  id = null,
  transaction = null
) {
  /*
   * Legacy Mongo contract:
   *
   * findByDatabaseId(id)
   */
  if (
    !contextOrId ||
    typeof contextOrId !==
      "object" ||
    Array.isArray(
      contextOrId
    )
  ) {
    return Signal
      .findById(
        contextOrId
      );
  }

  /*
   * Phase 13 scoped contract:
   *
   * findByDatabaseId(
   *   { organizationId, environmentId },
   *   id
   * )
   */
  let query =
    Signal.findOne({
      _id:
        id,

      organizationId:
        contextOrId
          .organizationId,

      environmentId:
        contextOrId
          .environmentId,
    });

  const session =
    sessionFrom(
      transaction
    );

  if (
    session &&
    typeof query.session ===
      "function"
  ) {
    query =
      query.session(
        session
      );
  }

  return query;
}

  async findOne(
    filter,
    transaction = null
  ) {
    let query =
      Signal.findOne(
        filter
      );

    const session =
      sessionFrom(
        transaction
      );

    if (session) {
      query =
        query.session(
          session
        );
    }

    return query;
  }

  async findOneLean(
    filter,
    transaction = null
  ) {
    let query =
      Signal.findOne(
        filter
      );

    const session =
      sessionFrom(
        transaction
      );

    if (session) {
      query =
        query.session(
          session
        );
    }

    return query.lean();
  }

  async findLatestDuplicate(
    filter,
    transaction = null
  ) {
    let query =
      Signal
        .findOne(
          filter
        )
        .sort({
          lastSeenAt:
            -1,
        });

    const session =
      sessionFrom(
        transaction
      );

    if (session) {
      query =
        query.session(
          session
        );
    }

    return query;
  }

  async list(
    filter,
    {
      sort = {
        observedAt:
          -1,
      },

      limit = 100,
    } = {},
    transaction = null
  ) {
    const safeLimit =
      Math.min(
        500,
        Math.max(
          1,
          Number(
            limit
          ) ||
          100
        )
      );

    let query =
      Signal
        .find(
          filter
        )
        .sort(
          sort
        )
        .limit(
          safeLimit
        );

    const session =
      sessionFrom(
        transaction
      );

    if (session) {
      query =
        query.session(
          session
        );
    }

    return query.lean();
  }

  async updateOne(
    filter,
    update,
    transaction = null
  ) {
    let query =
      Signal.updateOne(
        filter,
        update
      );

    const session =
      sessionFrom(
        transaction
      );

    if (
      session &&
      typeof query.session ===
        "function"
    ) {
      query =
        query.session(
          session
        );
    }

    return query;
  }

  async updateMany(
    filter,
    update,
    transaction = null
  ) {
    let query =
      Signal.updateMany(
        filter,
        update
      );

    const session =
      sessionFrom(
        transaction
      );

    if (
      session &&
      typeof query.session ===
        "function"
    ) {
      query =
        query.session(
          session
        );
    }

    return query;
  }

  async save(
    signal,
    transaction = null
  ) {
    if (
      !signal ||
      typeof signal.save !==
        "function"
    ) {
      throw Object.assign(
        new Error(
          "MongoSignalRepository.save() requires a Mongoose Signal document"
        ),
        {
          code:
            "INVALID_SIGNAL_DOCUMENT",
        }
      );
    }

    const session =
      sessionFrom(
        transaction
      );

    return signal.save(
      session
        ? {
            session,
          }
        : undefined
    );
  }
}

module.exports =
  MongoSignalRepository;