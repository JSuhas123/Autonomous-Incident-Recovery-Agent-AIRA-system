"use strict";

const {
  runtimeRecoveryCheckpointRepository,
  executionAuthorizationRepository,
  incidentLifecycleRepository,
} = require("../repositories");

const {
  recoveryVerificationRepository,
} = require(
  "../repositories/recoveryVerificationProvider"
);

class Query {
  constructor(executor) {
    this.executor = executor;
    this.options = {};
  }

  sort(value) {
    this.options.sort = value;
    return this;
  }

  limit(value) {
    this.options.limit = value;
    return this;
  }

  lean() {
    return this.exec();
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  exec() {
    return this.executor(this.options);
  }
}

const RuntimeRecoveryCheckpoint = {
  find(filter) {
    return new Query(
      (options) =>
        runtimeRecoveryCheckpointRepository.list(
          filter,
          options
        )
    );
  },
};

const ExecutionRequest = {
  findOne(filter) {
    return new Query(
      async () => {
        const rows =
          await executionAuthorizationRepository
            .findIncidentExecutionHistory(
              filter,
              {
                limit: 1,
              }
            );

        return Array.isArray(rows)
          ? rows[0] || null
          : null;
      }
    );
  },
};

const RecoveryVerification = {
  findOne(filter) {
    return new Query(
      () =>
        recoveryVerificationRepository
          .findCurrent(filter)
    );
  },
};

const IncidentLifecycle = {
  findOne(filter) {
    return new Query(
      () =>
        incidentLifecycleRepository
          .findCurrent(filter)
    );
  },
};

module.exports = {
  RuntimeRecoveryCheckpoint,
  ExecutionRequest,
  RecoveryVerification,
  IncidentLifecycle,
};
