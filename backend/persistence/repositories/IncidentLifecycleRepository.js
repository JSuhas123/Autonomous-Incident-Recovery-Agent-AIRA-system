"use strict";

class IncidentLifecycleRepository {
  async findCurrent(
    _scope,
    _transaction = null
  ) {
    throw new Error(
      "IncidentLifecycleRepository.findCurrent() is not implemented"
    );
  }

  async createTransition(
    _transition,
    _transaction = null
  ) {
    throw new Error(
      "IncidentLifecycleRepository.createTransition() is not implemented"
    );
  }

  async upsertCurrent(
    _scope,
    _update,
    _transaction = null
  ) {
    throw new Error(
      "IncidentLifecycleRepository.upsertCurrent() is not implemented"
    );
  }

  async updateCurrent(
    _scope,
    _update,
    _transaction = null
  ) {
    throw new Error(
      "IncidentLifecycleRepository.updateCurrent() is not implemented"
    );
  }

  async getHistory(
    _scope,
    _limit = 100,
    _transaction = null
  ) {
    throw new Error(
      "IncidentLifecycleRepository.getHistory() is not implemented"
    );
  }
}

module.exports =
  IncidentLifecycleRepository;