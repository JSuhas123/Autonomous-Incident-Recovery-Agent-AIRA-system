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
}

module.exports =
  ExecutionAuthorizationRepository;