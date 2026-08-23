"use strict";

const {
  executionAuthorizationRepository,
} = require("../repositories");

const ExecutionRequest = {
  async findOne(filter = {}) {
    const {
      organizationId,
      environmentId,
      executionRequestId,
    } = filter;

    if (
      !organizationId ||
      !environmentId ||
      !executionRequestId
    ) {
      return null;
    }

    return executionAuthorizationRepository
      .findExecutionRequestByIdentifier(
        {
          organizationId,
          environmentId,
        },
        executionRequestId
      );
  },
};

const ExecutionAuthorization = {
  async findOne(filter = {}) {
    const {
      organizationId,
      environmentId,
      authorizationId,
    } = filter;

    if (
      !organizationId ||
      !environmentId ||
      !authorizationId
    ) {
      return null;
    }

    return executionAuthorizationRepository
      .findAuthorizationByIdentifier(
        {
          organizationId,
          environmentId,
        },
        authorizationId
      );
  },
};

module.exports = {
  ExecutionRequest,
  ExecutionAuthorization,
};
