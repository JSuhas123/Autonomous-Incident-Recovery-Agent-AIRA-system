"use strict";

const DecisionTraceRepository =
  require(
    "../repositories/DecisionTraceRepository"
  );

const DecisionTrace =
  require(
    "../../models/DecisionTrace"
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

class MongoDecisionTraceRepository
  extends DecisionTraceRepository {
  async create(
    data,
    transaction = null
  ) {
    const session =
      sessionFrom(
        transaction
      );

    if (!session) {
      return DecisionTrace
        .create(
          data
        );
    }

    const [
      created,
    ] =
      await DecisionTrace
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

  async updateOne(
    filter,
    update,
    transaction = null
  ) {
    let query =
      DecisionTrace
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

    if (session) {
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
      DecisionTrace
        .findOne(
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

  async list(
    filter,
    {
      sort = {
        createdAt:
          -1,
      },

      limit = 50,
    } = {},
    transaction = null
  ) {
    const safeLimit =
      Math.min(
        Math.max(
          Number.parseInt(
            limit,
            10
          ) ||
          50,
          1
        ),
        200
      );

    let query =
      DecisionTrace
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

    return query;
  }
}

module.exports =
  MongoDecisionTraceRepository;