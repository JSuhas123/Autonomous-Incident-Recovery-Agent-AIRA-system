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

/**
 * Mongo compatibility implementation for Phase 13.
 *
 * Mongo remains authoritative during repository extraction.
 */
class MongoSignalRepository
  extends SignalRepository {
  async create(
    data
  ) {
    return Signal
      .create(
        data
      );
  }

  async findByDatabaseId(
    id
  ) {
    return Signal
      .findById(
        id
      );
  }

  async findOne(
    filter
  ) {
    return Signal
      .findOne(
        filter
      );
  }

  async findOneLean(
    filter
  ) {
    return Signal
      .findOne(
        filter
      )
      .lean();
  }

  async findLatestDuplicate(
    filter
  ) {
    return Signal
      .findOne(
        filter
      )
      .sort({
        lastSeenAt:
          -1,
      });
  }

  async list(
    filter,
    {
      sort = {
        observedAt:
          -1,
      },
      limit = 100,
    } = {}
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

    return Signal
      .find(
        filter
      )
      .sort(
        sort
      )
      .limit(
        safeLimit
      )
      .lean();
  }

  async updateOne(
    filter,
    update
  ) {
    return Signal
      .updateOne(
        filter,
        update
      );
  }

  async updateMany(
  filter,
  update
) {
  return Signal
    .updateMany(
      filter,
      update
    );
}


  async save(
    signal
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

    return signal
      .save();
  }
}

module.exports =
  MongoSignalRepository;