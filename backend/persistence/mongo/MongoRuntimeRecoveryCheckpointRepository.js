"use strict";

const RuntimeRecoveryCheckpointRepository =
  require(
    "../repositories/RuntimeRecoveryCheckpointRepository"
  );

const RuntimeRecoveryCheckpoint =
  require(
    "../../models/RuntimeRecoveryCheckpoint"
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

class MongoRuntimeRecoveryCheckpointRepository
  extends RuntimeRecoveryCheckpointRepository {
  async create(
    data,
    transaction = null
  ) {
    const session =
      sessionFrom(
        transaction
      );

    if (!session) {
      return RuntimeRecoveryCheckpoint
        .create(
          data
        );
    }

    const [
      created,
    ] =
      await RuntimeRecoveryCheckpoint
        .create(
          [
            data,
          ],
          {
            session,
          }
        );

    return created;
  }

  async findOneAndUpdate(
    filter,
    update,
    transaction = null
  ) {
    let query =
      RuntimeRecoveryCheckpoint
        .findOneAndUpdate(
          filter,
          update,
          {
            new:
              true,
          }
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

  async findOne(
    filter,
    transaction = null
  ) {
    let query =
      RuntimeRecoveryCheckpoint
        .findOne(
          filter
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
}

module.exports =
  MongoRuntimeRecoveryCheckpointRepository;