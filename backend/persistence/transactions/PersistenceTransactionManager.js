"use strict";

/**
 * Phase 13 — Enterprise Data Architecture
 *
 * Database-neutral transactional execution boundary.
 *
 * Transaction context is deliberately opaque to business services.
 */
class PersistenceTransactionManager {
  async run(
    _work
  ) {
    throw new Error(
      "PersistenceTransactionManager.run() is not implemented"
    );
  }
}

module.exports =
  PersistenceTransactionManager;