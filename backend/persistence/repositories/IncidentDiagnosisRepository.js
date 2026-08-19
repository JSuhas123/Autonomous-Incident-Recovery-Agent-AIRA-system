"use strict";

class IncidentDiagnosisRepository {
  async findCurrent(
    _scope,
    _transaction = null
  ) {
    throw new Error(
      "IncidentDiagnosisRepository.findCurrent() is not implemented"
    );
  }

  async create(
    _data,
    _transaction = null
  ) {
    throw new Error(
      "IncidentDiagnosisRepository.create() is not implemented"
    );
  }

  async save(
    _diagnosis,
    _transaction = null
  ) {
    throw new Error(
      "IncidentDiagnosisRepository.save() is not implemented"
    );
  }
}

module.exports =
  IncidentDiagnosisRepository;