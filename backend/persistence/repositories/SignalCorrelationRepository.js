"use strict";

class SignalCorrelationRepository {
  async upsertGroup(
    _scope,
    _correlationGroupId,
    _update,
    _transaction = null
  ) {
    throw new Error(
      "SignalCorrelationRepository.upsertGroup() is not implemented"
    );
  }

  async findGroup(
    _scope,
    _correlationGroupId,
    _transaction = null
  ) {
    throw new Error(
      "SignalCorrelationRepository.findGroup() is not implemented"
    );
  }

  async updateOne(
    _filter,
    _update,
    _transaction = null
  ) {
    throw new Error(
      "SignalCorrelationRepository.updateOne() is not implemented"
    );
  }
}

module.exports =
  SignalCorrelationRepository;