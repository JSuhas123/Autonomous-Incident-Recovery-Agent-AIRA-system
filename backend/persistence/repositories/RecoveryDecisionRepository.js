"use strict";

/**
 * Phase 13 — Enterprise Data Architecture
 *
 * Persistence contract for recovery decision state.
 *
 * Owns:
 * - RecoveryDecisionRun
 * - current RecoveryDecision
 * - revision/superseding persistence
 *
 * All revision operations may participate in one transaction.
 */
class RecoveryDecisionRepository {
  async createRun(
    _data,
    _transaction = null
  ) {
    throw new Error(
      "RecoveryDecisionRepository.createRun() is not implemented"
    );
  }

  async findCurrent(
    _scope,
    _transaction = null
  ) {
    throw new Error(
      "RecoveryDecisionRepository.findCurrent() is not implemented"
    );
  }

  async saveDecision(
    _decision,
    _transaction = null
  ) {
    throw new Error(
      "RecoveryDecisionRepository.saveDecision() is not implemented"
    );
  }

  async createDecision(
    _data,
    _transaction = null
  ) {
    throw new Error(
      "RecoveryDecisionRepository.createDecision() is not implemented"
    );
  }

  async saveRun(
    _run,
    _transaction = null
  ) {
    throw new Error(
      "RecoveryDecisionRepository.saveRun() is not implemented"
    );
  }
}

module.exports =
  RecoveryDecisionRepository;