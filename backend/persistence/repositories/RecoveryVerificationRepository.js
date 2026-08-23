"use strict";

class RecoveryVerificationRepository {
  async findCurrent(
    _scope,
    _transaction = null
  ) {
    throw new Error(
      "RecoveryVerificationRepository.findCurrent() is not implemented"
    );
  }

  async findByIdentifier(
    _scope,
    _identifier,
    _transaction = null
  ) {
    throw new Error(
      "RecoveryVerificationRepository.findByIdentifier() is not implemented"
    );
  }

  async findHistory(
    _scope,
    _options = {},
    _transaction = null
  ) {
    throw new Error(
      "RecoveryVerificationRepository.findHistory() is not implemented"
    );
  }

  async findRuns(
    _scope,
    _options = {},
    _transaction = null
  ) {
    throw new Error(
      "RecoveryVerificationRepository.findRuns() is not implemented"
    );
  }

  async createRun(
    _data,
    _transaction = null
  ) {
    throw new Error(
      "RecoveryVerificationRepository.createRun() is not implemented"
    );
  }

  async saveRun(
    _run,
    _transaction = null
  ) {
    throw new Error(
      "RecoveryVerificationRepository.saveRun() is not implemented"
    );
  }

  async createVerification(
    _data,
    _transaction = null
  ) {
    throw new Error(
      "RecoveryVerificationRepository.createVerification() is not implemented"
    );
  }

  async saveVerification(
    _verification,
    _transaction = null
  ) {
    throw new Error(
      "RecoveryVerificationRepository.saveVerification() is not implemented"
    );
  }

  async markRunFailed(
    _verificationRunId,
    _error,
    _transaction = null
  ) {
    throw new Error(
      "RecoveryVerificationRepository.markRunFailed() is not implemented"
    );
  }
}

module.exports =
  RecoveryVerificationRepository;