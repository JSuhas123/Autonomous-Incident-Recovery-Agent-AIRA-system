"use strict";

const DecisionTraceRepository =
  require(
    "../repositories/DecisionTraceRepository"
  );

const DecisionTrace =
  require(
    "../../models/DecisionTrace"
  );

class MongoDecisionTraceRepository
  extends DecisionTraceRepository {
  async create(
    data
  ) {
    return DecisionTrace
      .create(
        data
      );
  }

  async updateOne(
    filter,
    update
  ) {
    return DecisionTrace
      .findOneAndUpdate(
        filter,
        update,
        {
          new:
            true,
        }
      );
  }

  async findOne(
    filter
  ) {
    return DecisionTrace
      .findOne(
        filter
      );
  }

  async list(
    filter,
    {
      sort = {
        createdAt:
          -1,
      },

      limit = 50,
    } = {}
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

    return DecisionTrace
      .find(
        filter
      )
      .sort(
        sort
      )
      .limit(
        safeLimit
      );
  }
}

module.exports =
  MongoDecisionTraceRepository;