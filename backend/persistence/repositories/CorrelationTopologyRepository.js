"use strict";

class CorrelationTopologyRepository {
  async hasServiceDependency(
    _scope,
    _firstServiceId,
    _secondServiceId,
    _transaction = null
  ) {
    throw new Error(
      "CorrelationTopologyRepository.hasServiceDependency() is not implemented"
    );
  }

  async hasResourceRelationship(
    _scope,
    _firstNode,
    _secondNode,
    _transaction = null
  ) {
    throw new Error(
      "CorrelationTopologyRepository.hasResourceRelationship() is not implemented"
    );
  }
}

module.exports =
  CorrelationTopologyRepository;