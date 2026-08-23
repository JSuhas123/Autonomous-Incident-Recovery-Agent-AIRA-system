"use strict";

/**
 * Recovery Verification Repository Provider
 *
 * Phase 13
 * Selects the active persistence implementation while exposing the
 * existing transaction manager used throughout AIRA.
 */

const {
  persistenceProvider,
  persistenceTransactionManager,
} = require("./index");

let recoveryVerificationRepository;

if (persistenceProvider === "postgres") {
  const PostgresRecoveryVerificationRepository = require(
    "../postgres/PostgresRecoveryVerificationRepository"
  );

  recoveryVerificationRepository =
    new PostgresRecoveryVerificationRepository();
} else {
  const MongoRecoveryVerificationRepository = require(
    "../mongo/MongoRecoveryVerificationRepository"
  );

  recoveryVerificationRepository =
    new MongoRecoveryVerificationRepository();
}

module.exports = {
  recoveryVerificationRepository,
  persistenceTransactionManager,
};