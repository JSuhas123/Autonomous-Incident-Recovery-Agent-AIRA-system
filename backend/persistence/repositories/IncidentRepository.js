"use strict";

class IncidentRepository {
  async findOne(
    _filter,
    _transaction = null
  ) {
    throw new Error(
      "IncidentRepository.findOne() is not implemented"
    );
  }

  async findMany(
    _filter,
    _transaction = null
  ) {
    throw new Error(
      "IncidentRepository.findMany() is not implemented"
    );
  }

  async create(
    _data,
    _transaction = null
  ) {
    throw new Error(
      "IncidentRepository.create() is not implemented"
    );
  }

  async save(
    _incident,
    _transaction = null
  ) {
    throw new Error(
      "IncidentRepository.save() is not implemented"
    );
  }
}

module.exports =
  IncidentRepository;