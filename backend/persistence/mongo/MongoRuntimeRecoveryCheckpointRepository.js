"use strict";

const RuntimeRecoveryCheckpointRepository =
  require(
    "../repositories/RuntimeRecoveryCheckpointRepository"
  );

const RuntimeRecoveryCheckpoint =
  require(
    "../../models/RuntimeRecoveryCheckpoint"
  );

class MongoRuntimeRecoveryCheckpointRepository
  extends RuntimeRecoveryCheckpointRepository {
  async create(
    data
  ) {
    return RuntimeRecoveryCheckpoint
      .create(
        data
      );
  }

  async findOneAndUpdate(
    filter,
    update
  ) {
    return RuntimeRecoveryCheckpoint
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
    return RuntimeRecoveryCheckpoint
      .findOne(
        filter
      );
  }
}

module.exports =
  MongoRuntimeRecoveryCheckpointRepository;