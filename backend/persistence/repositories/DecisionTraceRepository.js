"use strict";

class DecisionTraceRepository {
  async create(
    _data,
    _transaction = null
  ) {
    throw new Error(
      "DecisionTraceRepository.create() is not implemented"
    );
  }

  async updateOne(
    _filter,
    _update,
    _transaction = null
  ) {
    throw new Error(
      "DecisionTraceRepository.updateOne() is not implemented"
    );
  }

  async findOne(
    _filter,
    _transaction = null
  ) {
    throw new Error(
      "DecisionTraceRepository.findOne() is not implemented"
    );
  }

  async list(
    _filter,
    _options = {},
    _transaction = null
  ) {
    throw new Error(
      "DecisionTraceRepository.list() is not implemented"
    );
  }
}

module.exports =
  DecisionTraceRepository;