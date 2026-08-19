"use strict";

class DecisionTraceRepository {
  async create(
    _data
  ) {
    throw new Error(
      "DecisionTraceRepository.create() is not implemented"
    );
  }

  async updateOne(
    _filter,
    _update
  ) {
    throw new Error(
      "DecisionTraceRepository.updateOne() is not implemented"
    );
  }

  async findOne(
    _filter
  ) {
    throw new Error(
      "DecisionTraceRepository.findOne() is not implemented"
    );
  }

  async list(
    _filter,
    _options = {}
  ) {
    throw new Error(
      "DecisionTraceRepository.list() is not implemented"
    );
  }
}

module.exports =
  DecisionTraceRepository;