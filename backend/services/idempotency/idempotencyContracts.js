"use strict";

/**
 * AIRA Idempotency Contracts
 *
 * Phase 11.1
 *
 * Shared contracts for duplicate-event protection across:
 *
 * - recovery decisions
 * - execution requests
 * - verification jobs
 * - lifecycle jobs
 * - queue redeliveries
 * - webhook/event replays
 *
 * IMPORTANT:
 * Idempotency does not authorize an operation.
 * It only determines whether an operation may be processed
 * from a duplicate-processing perspective.
 */

const IDEMPOTENCY_STATUS =
  Object.freeze({
    PROCESSING:
      "PROCESSING",

    COMPLETED:
      "COMPLETED",

    FAILED:
      "FAILED",

    EXPIRED:
      "EXPIRED",
  });

const IDEMPOTENCY_DECISION =
  Object.freeze({
    ACQUIRED:
      "ACQUIRED",

    DUPLICATE_COMPLETED:
      "DUPLICATE_COMPLETED",

    DUPLICATE_PROCESSING:
      "DUPLICATE_PROCESSING",

    RETRY_FAILED:
      "RETRY_FAILED",

    RECLAIM_STALE:
      "RECLAIM_STALE",

    REJECTED:
      "REJECTED",
  });

const IDEMPOTENCY_OPERATION =
  Object.freeze({
    RECOVERY_DECISION:
      "RECOVERY_DECISION",

    EXECUTION:
      "EXECUTION",

    VERIFICATION:
      "VERIFICATION",

    LIFECYCLE:
      "LIFECYCLE",

    QUEUE_EVENT:
      "QUEUE_EVENT",

    WEBHOOK:
      "WEBHOOK",
  });

const IDEMPOTENCY_RESULT =
  Object.freeze({
    SUCCESS:
      "SUCCESS",

    FAILURE:
      "FAILURE",

    DUPLICATE:
      "DUPLICATE",

    IN_PROGRESS:
      "IN_PROGRESS",
  });

const TERMINAL_IDEMPOTENCY_STATUSES =
  Object.freeze([
    IDEMPOTENCY_STATUS
      .COMPLETED,

    IDEMPOTENCY_STATUS
      .FAILED,

    IDEMPOTENCY_STATUS
      .EXPIRED,
  ]);

const VALID_STATUS =
  new Set(
    Object.values(
      IDEMPOTENCY_STATUS
    )
  );

const VALID_DECISION =
  new Set(
    Object.values(
      IDEMPOTENCY_DECISION
    )
  );

const VALID_OPERATION =
  new Set(
    Object.values(
      IDEMPOTENCY_OPERATION
    )
  );

function isValidIdempotencyStatus(
  value
) {
  return VALID_STATUS
    .has(
      value
    );
}

function isValidIdempotencyDecision(
  value
) {
  return VALID_DECISION
    .has(
      value
    );
}

function isValidIdempotencyOperation(
  value
) {
  return VALID_OPERATION
    .has(
      value
    );
}

function isTerminalIdempotencyStatus(
  value
) {
  return TERMINAL_IDEMPOTENCY_STATUSES
    .includes(
      value
    );
}

function assertValidIdempotencyStatus(
  value
) {
  if (
    !isValidIdempotencyStatus(
      value
    )
  ) {
    throw createContractError(
      "Invalid idempotency status",
      "IDEMPOTENCY_STATUS_INVALID"
    );
  }

  return value;
}

function assertValidIdempotencyOperation(
  value
) {
  if (
    !isValidIdempotencyOperation(
      value
    )
  ) {
    throw createContractError(
      "Invalid idempotency operation",
      "IDEMPOTENCY_OPERATION_INVALID"
    );
  }

  return value;
}

function createContractError(
  message,
  code
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,
    }
  );
}

module.exports = {
  IDEMPOTENCY_STATUS,
  IDEMPOTENCY_DECISION,
  IDEMPOTENCY_OPERATION,
  IDEMPOTENCY_RESULT,
  TERMINAL_IDEMPOTENCY_STATUSES,

  isValidIdempotencyStatus,
  isValidIdempotencyDecision,
  isValidIdempotencyOperation,
  isTerminalIdempotencyStatus,

  assertValidIdempotencyStatus,
  assertValidIdempotencyOperation,
};