"use strict";

/**
 * AIRA Runtime Recovery Contracts
 *
 * Phase 11.2.1
 *
 * Defines the durable workflow-resume vocabulary used when AIRA itself
 * restarts, crashes, loses a worker, or discovers abandoned processing.
 *
 * IMPORTANT:
 *
 * Runtime recovery is NOT infrastructure recovery.
 *
 * These contracts:
 *
 * - do not authorize execution
 * - do not execute playbooks/runbooks
 * - do not retry infrastructure mutations
 * - do not assume an interrupted operation is safe to replay
 */

const RUNTIME_STAGE =
  Object.freeze({
    RECOVERY_DECISION:
      "RECOVERY_DECISION",

    EXECUTION:
      "EXECUTION",

    VERIFICATION:
      "VERIFICATION",

    LIFECYCLE:
      "LIFECYCLE",
  });

const CHECKPOINT_STATUS =
  Object.freeze({
    PENDING:
      "PENDING",

    PROCESSING:
      "PROCESSING",

    WAITING:
      "WAITING",

    COMPLETED:
      "COMPLETED",

    FAILED:
      "FAILED",

    ABANDONED:
      "ABANDONED",

    INCONCLUSIVE:
      "INCONCLUSIVE",
  });

const RESUME_DECISION =
  Object.freeze({
    START:
      "START",

    RESUME:
      "RESUME",

    WAIT:
      "WAIT",

    SKIP_COMPLETED:
      "SKIP_COMPLETED",

    RETRY_SAFE:
      "RETRY_SAFE",

    MANUAL_INTERVENTION:
      "MANUAL_INTERVENTION",

    BLOCK:
      "BLOCK",
  });

const INTERRUPTION_REASON =
  Object.freeze({
    PROCESS_RESTARTED:
      "PROCESS_RESTARTED",

    WORKER_CRASHED:
      "WORKER_CRASHED",

    LEASE_EXPIRED:
      "LEASE_EXPIRED",

    HEARTBEAT_LOST:
      "HEARTBEAT_LOST",

    DEPENDENCY_INTERRUPTED:
      "DEPENDENCY_INTERRUPTED",

    SHUTDOWN_INTERRUPTED:
      "SHUTDOWN_INTERRUPTED",

    UNKNOWN:
      "UNKNOWN",
  });

const RESUME_SAFETY =
  Object.freeze({
    SAFE:
      "SAFE",

    REQUIRES_RECONCILIATION:
      "REQUIRES_RECONCILIATION",

    UNSAFE:
      "UNSAFE",

    UNKNOWN:
      "UNKNOWN",
  });

const TERMINAL_CHECKPOINT_STATUSES =
  Object.freeze([
    CHECKPOINT_STATUS
      .COMPLETED,

    CHECKPOINT_STATUS
      .FAILED,
  ]);

const ACTIVE_CHECKPOINT_STATUSES =
  Object.freeze([
    CHECKPOINT_STATUS
      .PENDING,

    CHECKPOINT_STATUS
      .PROCESSING,

    CHECKPOINT_STATUS
      .WAITING,
  ]);

const RESUMABLE_STAGES =
  Object.freeze([
    RUNTIME_STAGE
      .RECOVERY_DECISION,

    RUNTIME_STAGE
      .EXECUTION,

    RUNTIME_STAGE
      .VERIFICATION,

    RUNTIME_STAGE
      .LIFECYCLE,
  ]);

// ============================================================================
// VALIDATORS
// ============================================================================

function assertRuntimeStage(
  value
) {
  assertEnumValue(
    value,
    RUNTIME_STAGE,
    "runtime stage",
    "RUNTIME_STAGE_INVALID"
  );

  return value;
}

function assertCheckpointStatus(
  value
) {
  assertEnumValue(
    value,
    CHECKPOINT_STATUS,
    "checkpoint status",
    "RUNTIME_CHECKPOINT_STATUS_INVALID"
  );

  return value;
}

function assertResumeDecision(
  value
) {
  assertEnumValue(
    value,
    RESUME_DECISION,
    "resume decision",
    "RUNTIME_RESUME_DECISION_INVALID"
  );

  return value;
}

function assertResumeSafety(
  value
) {
  assertEnumValue(
    value,
    RESUME_SAFETY,
    "resume safety",
    "RUNTIME_RESUME_SAFETY_INVALID"
  );

  return value;
}

// ============================================================================
// HELPERS
// ============================================================================

function isTerminalCheckpointStatus(
  status
) {
  return TERMINAL_CHECKPOINT_STATUSES
    .includes(
      status
    );
}

function isActiveCheckpointStatus(
  status
) {
  return ACTIVE_CHECKPOINT_STATUSES
    .includes(
      status
    );
}

function isResumableStage(
  stage
) {
  return RESUMABLE_STAGES
    .includes(
      stage
    );
}

/**
 * Mutating execution is the highest-risk resume boundary.
 *
 * We must never assume that an interrupted execution can simply be
 * replayed.
 */
function requiresReconciliationBeforeResume(
  stage,
  status
) {
  if (
    stage !==
      RUNTIME_STAGE
        .EXECUTION
  ) {
    return false;
  }

  return [
    CHECKPOINT_STATUS
      .PROCESSING,

    CHECKPOINT_STATUS
      .ABANDONED,

    CHECKPOINT_STATUS
      .INCONCLUSIVE,
  ].includes(
    status
  );
}

function assertNoExecutionAuthorization(
  input
) {
  if (
    input?.executionAuthorized ===
    true
  ) {
    throw createError(
      "Runtime recovery cannot receive or grant execution authorization",
      "RUNTIME_RECOVERY_UNSAFE_AUTHORIZATION"
    );
  }

  return true;
}

function assertEnumValue(
  value,
  enumObject,
  label,
  code
) {
  if (
    !Object.values(
      enumObject
    ).includes(
      value
    )
  ) {
    throw createError(
      `Invalid ${label}: ${value}`,
      code
    );
  }
}

function createError(
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
  RUNTIME_STAGE,

  CHECKPOINT_STATUS,

  RESUME_DECISION,

  INTERRUPTION_REASON,

  RESUME_SAFETY,

  TERMINAL_CHECKPOINT_STATUSES,

  ACTIVE_CHECKPOINT_STATUSES,

  RESUMABLE_STAGES,

  assertRuntimeStage,

  assertCheckpointStatus,

  assertResumeDecision,

  assertResumeSafety,

  isTerminalCheckpointStatus,

  isActiveCheckpointStatus,

  isResumableStage,

  requiresReconciliationBeforeResume,

  assertNoExecutionAuthorization,
};