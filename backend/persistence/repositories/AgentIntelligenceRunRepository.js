"use strict";

class AgentIntelligenceRunRepository {
  async create(
    _data,
    _transaction = null
  ) {
    throw new Error(
      "AgentIntelligenceRunRepository.create() is not implemented"
    );
  }

  async save(
    _run,
    _transaction = null
  ) {
    throw new Error(
      "AgentIntelligenceRunRepository.save() is not implemented"
    );
  }

  async findLatestForIncident(
    _scope,
    _transaction = null
  ) {
    throw new Error(
      "AgentIntelligenceRunRepository.findLatestForIncident() is not implemented"
    );
  }
}

module.exports =
  AgentIntelligenceRunRepository;