"use strict";

/**
 * Phase 13 — read-only persistence boundary used by signal correlation.
 *
 * The correlation engine should know that topology relationships exist,
 * but must not know whether those relationships live in MongoDB,
 * PostgreSQL, a graph store, or another future implementation.
 */
class CorrelationTopologyRepository {
  async hasServiceDependency(
    _scope,
    _firstServiceId,
    _secondServiceId
  ) {
    throw new Error(
      "CorrelationTopologyRepository.hasServiceDependency() is not implemented"
    );
  }

  async hasResourceRelationship(
    _scope,
    _firstNode,
    _secondNode
  ) {
    throw new Error(
      "CorrelationTopologyRepository.hasResourceRelationship() is not implemented"
    );
  }
}

module.exports =
  CorrelationTopologyRepository;