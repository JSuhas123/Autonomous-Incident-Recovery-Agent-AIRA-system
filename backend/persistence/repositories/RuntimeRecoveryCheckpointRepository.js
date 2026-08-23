"use strict";

class RuntimeRecoveryCheckpointRepository {
  async create(
    _data,
    _transaction = null
  ) {
    throw new Error(
      "RuntimeRecoveryCheckpointRepository.create() is not implemented"
    );
  }

  async findOneAndUpdate(
    _filter,
    _update,
    _transaction = null
  ) {
    throw new Error(
      "RuntimeRecoveryCheckpointRepository.findOneAndUpdate() is not implemented"
    );
  }

  async findOne(
    _filter,
    _transaction = null
  ) {
    throw new Error(
      "RuntimeRecoveryCheckpointRepository.findOne() is not implemented"
    );
  }
}

module.exports =
  RuntimeRecoveryCheckpointRepository;