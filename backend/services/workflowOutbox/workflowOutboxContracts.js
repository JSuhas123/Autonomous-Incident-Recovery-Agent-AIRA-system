"use strict";

/*
 * ============================================================================
 * AIRA PHASE 11.3
 * WORKFLOW OUTBOX CONTRACTS
 * ============================================================================
 *
 * The workflow outbox provides durable cross-worker handoff intent.
 *
 * IMPORTANT:
 *
 * An outbox event is NOT execution authorization.
 *
 * An outbox event may only cause work to enter an existing protected
 * worker boundary.
 *
 * Infrastructure mutation must still pass through ExecutionWorker and
 * its persisted authorization + immutable-plan validation.
 * ============================================================================
 */

const OUTBOX_STATUS =
  Object.freeze({
    PENDING:
      "PENDING",

    PROCESSING:
      "PROCESSING",

    DELIVERED:
      "DELIVERED",

    FAILED:
      "FAILED",

    DEAD_LETTER:
      "DEAD_LETTER",
  });

const OUTBOX_EVENT_TYPE =
  Object.freeze({
    RECOVERY_DECISION_COMPLETED:
      "RECOVERY_DECISION_COMPLETED",

    EXECUTION_REQUEST_READY:
      "EXECUTION_REQUEST_READY",

    EXECUTION_COMPLETED:
      "EXECUTION_COMPLETED",

    EXECUTION_FAILED:
      "EXECUTION_FAILED",

    VERIFICATION_REQUESTED:
      "VERIFICATION_REQUESTED",

    VERIFICATION_COMPLETED:
      "VERIFICATION_COMPLETED",

    VERIFICATION_FAILED:
      "VERIFICATION_FAILED",

    LIFECYCLE_REQUESTED:
      "LIFECYCLE_REQUESTED",

    LIFECYCLE_COMPLETED:
      "LIFECYCLE_COMPLETED",

    LIFECYCLE_FAILED:
      "LIFECYCLE_FAILED",
  });

const OUTBOX_AGGREGATE_TYPE =
  Object.freeze({
    RECOVERY_DECISION:
      "RECOVERY_DECISION",

    EXECUTION_REQUEST:
      "EXECUTION_REQUEST",

    VERIFICATION:
      "VERIFICATION",

    LIFECYCLE:
      "LIFECYCLE",
  });

const OUTBOX_DELIVERY_DECISION =
  Object.freeze({
    DELIVER:
      "DELIVER",

    WAIT:
      "WAIT",

    RETRY:
      "RETRY",

    SKIP_DELIVERED:
      "SKIP_DELIVERED",

    DEAD_LETTER:
      "DEAD_LETTER",

    BLOCK:
      "BLOCK",
  });

const OUTBOX_FAILURE_CLASS =
  Object.freeze({
    RETRYABLE:
      "RETRYABLE",

    NON_RETRYABLE:
      "NON_RETRYABLE",

    UNKNOWN:
      "UNKNOWN",
  });

const OUTBOX_ERROR_CODE =
  Object.freeze({
    EVENT_REQUIRED:
      "OUTBOX_EVENT_REQUIRED",

    EVENT_ID_REQUIRED:
      "OUTBOX_EVENT_ID_REQUIRED",

    EVENT_KEY_REQUIRED:
      "OUTBOX_EVENT_KEY_REQUIRED",

    EVENT_TYPE_REQUIRED:
      "OUTBOX_EVENT_TYPE_REQUIRED",

    AGGREGATE_REQUIRED:
      "OUTBOX_AGGREGATE_REQUIRED",

    TENANT_SCOPE_REQUIRED:
      "OUTBOX_TENANT_SCOPE_REQUIRED",

    PAYLOAD_INVALID:
      "OUTBOX_PAYLOAD_INVALID",

    CLAIM_CONFLICT:
      "OUTBOX_CLAIM_CONFLICT",

    CLAIM_TOKEN_REQUIRED:
      "OUTBOX_CLAIM_TOKEN_REQUIRED",

    CLAIM_TOKEN_MISMATCH:
      "OUTBOX_CLAIM_TOKEN_MISMATCH",

    LEASE_ACTIVE:
      "OUTBOX_LEASE_ACTIVE",

    ALREADY_DELIVERED:
      "OUTBOX_ALREADY_DELIVERED",

    DELIVERY_FAILED:
      "OUTBOX_DELIVERY_FAILED",

    DELIVERY_STATE_UNKNOWN:
      "OUTBOX_DELIVERY_STATE_UNKNOWN",

    RETRY_EXHAUSTED:
      "OUTBOX_RETRY_EXHAUSTED",

    UNSAFE_AUTHORITY:
      "OUTBOX_UNSAFE_AUTHORITY",
  });

const DEFAULT_OUTBOX_LEASE_MS =
  60 * 1000;

const DEFAULT_OUTBOX_MAX_ATTEMPTS =
  10;

const DEFAULT_OUTBOX_RETRY_BASE_MS =
  1000;

function isKnownOutboxStatus(
  value
) {
  return Object.values(
    OUTBOX_STATUS
  ).includes(
    value
  );
}

function isKnownOutboxEventType(
  value
) {
  return Object.values(
    OUTBOX_EVENT_TYPE
  ).includes(
    value
  );
}

function isKnownOutboxAggregateType(
  value
) {
  return Object.values(
    OUTBOX_AGGREGATE_TYPE
  ).includes(
    value
  );
}

function assertNoExecutionAuthority(
  payload = {}
) {
  if (
    payload?.executionAuthorized ===
      true ||
    payload?.authorizationGranted ===
      true
  ) {
    throw Object.assign(
      new Error(
        "Workflow outbox payload cannot grant execution authority"
      ),
      {
        code:
          OUTBOX_ERROR_CODE
            .UNSAFE_AUTHORITY,
      }
    );
  }

  return true;
}

module.exports = {
  OUTBOX_STATUS,

  OUTBOX_EVENT_TYPE,

  OUTBOX_AGGREGATE_TYPE,

  OUTBOX_DELIVERY_DECISION,

  OUTBOX_FAILURE_CLASS,

  OUTBOX_ERROR_CODE,

  DEFAULT_OUTBOX_LEASE_MS,

  DEFAULT_OUTBOX_MAX_ATTEMPTS,

  DEFAULT_OUTBOX_RETRY_BASE_MS,

  isKnownOutboxStatus,

  isKnownOutboxEventType,

  isKnownOutboxAggregateType,

  assertNoExecutionAuthority,
};