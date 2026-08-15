"use strict";

/**
 * AIRA Executor Contracts
 *
 * Phase 8.13
 *
 * Defines the controlled boundary between execution plans
 * and infrastructure-specific executor adapters.
 */

const EXECUTOR_DOMAIN =
  Object.freeze({
    KUBERNETES:
      "kubernetes",

    DOCKER:
      "docker",

    CLOUD:
      "cloud",

    DATABASE:
      "database",

    NETWORK:
      "network",

    CICD:
      "cicd",

    OBSERVABILITY:
      "observability",

    SECURITY:
      "security",

    SYSTEM:
      "system",
  });

const EXECUTOR_RESULT_STATUS =
  Object.freeze({
    SUCCEEDED:
      "SUCCEEDED",

    FAILED:
      "FAILED",

    SKIPPED:
      "SKIPPED",

    BLOCKED:
      "BLOCKED",
  });

const EXECUTOR_ERROR =
  Object.freeze({
    CAPABILITY_REQUIRED:
      "EXECUTOR_CAPABILITY_REQUIRED",

    CAPABILITY_NOT_REGISTERED:
      "EXECUTOR_CAPABILITY_NOT_REGISTERED",

    CAPABILITY_DISABLED:
      "EXECUTOR_CAPABILITY_DISABLED",

    INVALID_INPUT:
      "EXECUTOR_INVALID_INPUT",

    EXECUTION_FAILED:
      "EXECUTOR_EXECUTION_FAILED",

    UNSAFE_INPUT:
      "EXECUTOR_UNSAFE_INPUT",
  });

function createExecutorResult(
  input = {}
) {
  return {
    capability:
      input.capability ||
      null,

    status:
      input.status ||
      EXECUTOR_RESULT_STATUS
        .FAILED,

    success:
      input.success ===
      true,

    changed:
      input.changed ===
      true,

    output:
      input.output ||
      null,

    error:
      input.error ||
      null,

    startedAt:
      input.startedAt ||
      null,

    completedAt:
      input.completedAt ||
      null,

    durationMs:
      Number.isFinite(
        input.durationMs
      )
        ? input.durationMs
        : null,

    metadata:
      input.metadata &&
      typeof input.metadata ===
        "object"
        ? input.metadata
        : {},

    executionAuthorized:
      false,
  };
}

module.exports = {
  EXECUTOR_DOMAIN,
  EXECUTOR_RESULT_STATUS,
  EXECUTOR_ERROR,
  createExecutorResult,
};