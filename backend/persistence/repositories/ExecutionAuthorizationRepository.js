"use strict";

/**
 * Phase 13 — Enterprise Data Architecture
 *
 * Persistence contract for:
 * - ExecutionAuthorization
 * - ExecutionRequest
 *
 * Implementations must preserve atomic creation when used
 * inside a persistence transaction.
 */
class ExecutionAuthorizationRepository {
  async createAuthorization(
    _data,
    _transaction = null
  ) {
    throw new Error(
      "ExecutionAuthorizationRepository.createAuthorization() is not implemented"
    );
  }

  async createExecutionRequest(
    _data,
    _transaction = null
  ) {
    throw new Error(
      "ExecutionAuthorizationRepository.createExecutionRequest() is not implemented"
    );
  }

  async findAuthorizationByIdentifier(
    _scope,
    _identifier,
    _transaction = null
  ) {
    throw new Error(
      "ExecutionAuthorizationRepository.findAuthorizationByIdentifier() is not implemented"
    );
  }

  async findExecutionRequestByIdentifier(
    _scope,
    _identifier,
    _transaction = null
  ) {
    throw new Error(
      "ExecutionAuthorizationRepository.findExecutionRequestByIdentifier() is not implemented"
    );
  }

  async findIncidentExecutionHistory(
    _scope,
    _options = {},
    _transaction = null
  ) {
    throw new Error(
      "ExecutionAuthorizationRepository.findIncidentExecutionHistory() is not implemented"
    );
  }

  async saveExecutionRequest(
    _request,
    _transaction = null
  ) {
    throw new Error(
      "ExecutionAuthorizationRepository.saveExecutionRequest() is not implemented"
    );
  }
}

module.exports =
  ExecutionAuthorizationRepository;