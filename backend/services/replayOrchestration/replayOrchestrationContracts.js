"use strict";

/*
 * ============================================================================
 * AIRA PHASE 11.4.1
 * RECOVERY / REPLAY ORCHESTRATION CONTRACTS
 * ============================================================================
 *
 * Replay is NOT:
 *
 *   "run the incident again"
 *
 * Replay means:
 *
 *   inspect durable state
 *        ↓
 *   determine what actually completed
 *        ↓
 *   determine what may safely resume
 *        ↓
 *   reconstruct only the required next operation
 *
 *
 * CRITICAL SAFETY RULE
 * --------------------
 *
 * Replay NEVER creates execution authorization.
 *
 * A replayed ExecutionWorker job must still pass the same:
 *
 * - immutable-plan validation
 * - persisted authorization validation
 * - policy boundary
 * - idempotency boundary
 *
 * ============================================================================
 */


// ============================================================================
// REPLAY REQUEST SOURCE
// ============================================================================

const REPLAY_SOURCE =
  Object.freeze({
    /*
     * AIRA detected an interrupted workflow automatically.
     */
    AUTOMATIC_RECOVERY:
      "AUTOMATIC_RECOVERY",

    /*
     * Human explicitly requested recovery/replay.
     */
    MANUAL:
      "MANUAL",

    /*
     * System startup discovered resumable work.
     */
    PROCESS_RESTART:
      "PROCESS_RESTART",

    /*
     * Operator intentionally replays a dead-letter / failed workflow.
     */
    DEAD_LETTER:
      "DEAD_LETTER",

    /*
     * Administrative repair operation.
     */
    ADMIN_REPAIR:
      "ADMIN_REPAIR",
  });


// ============================================================================
// REPLAY MODE
// ============================================================================

const REPLAY_MODE =
  Object.freeze({
    /*
     * Resume from the first incomplete safe stage.
     */
    RESUME:
      "RESUME",

    /*
     * Re-evaluate durable state without executing anything.
     */
    INSPECT_ONLY:
      "INSPECT_ONLY",

    /*
     * Reconcile ambiguous state before replay.
     *
     * Particularly important around infrastructure execution.
     */
    RECONCILE:
      "RECONCILE",

    /*
     * Operator-authorized repair mode.
     *
     * IMPORTANT:
     * This still does NOT grant infrastructure execution authorization.
     */
    MANUAL_REPLAY:
      "MANUAL_REPLAY",
  });


// ============================================================================
// REPLAY DECISION
// ============================================================================

const REPLAY_DECISION =
  Object.freeze({
    /*
     * Replay/resume is deterministic and safe.
     */
    RESUME:
      "RESUME",

    /*
     * Nothing remains to replay.
     */
    NO_ACTION:
      "NO_ACTION",

    /*
     * State must first be reconciled with authoritative infrastructure /
     * persisted business state.
     */
    RECONCILE:
      "RECONCILE",

    /*
     * Human decision required.
     */
    MANUAL_REVIEW:
      "MANUAL_REVIEW",

    /*
     * Replay is forbidden.
     */
    BLOCK:
      "BLOCK",
  });


// ============================================================================
// REPLAY SAFETY
// ============================================================================

const REPLAY_SAFETY =
  Object.freeze({
    /*
     * Re-running/resuming the selected logical operation is protected by
     * deterministic identity + idempotency.
     */
    SAFE:
      "SAFE",

    /*
     * Safe only after reconciliation.
     */
    RECONCILE_REQUIRED:
      "RECONCILE_REQUIRED",

    /*
     * Requires explicit human decision.
     */
    MANUAL_REQUIRED:
      "MANUAL_REQUIRED",

    /*
     * Replay must never occur automatically.
     */
    UNSAFE:
      "UNSAFE",

    /*
     * Durable evidence is insufficient to determine safety.
     */
    UNKNOWN:
      "UNKNOWN",
  });


// ============================================================================
// REPLAY STATUS
// ============================================================================

const REPLAY_STATUS =
  Object.freeze({
    REQUESTED:
      "REQUESTED",

    DISCOVERING:
      "DISCOVERING",

    PLANNING:
      "PLANNING",

    READY:
      "READY",

    RUNNING:
      "RUNNING",

    WAITING_RECONCILIATION:
      "WAITING_RECONCILIATION",

    WAITING_MANUAL_REVIEW:
      "WAITING_MANUAL_REVIEW",

    COMPLETED:
      "COMPLETED",

    BLOCKED:
      "BLOCKED",

    FAILED:
      "FAILED",

    CANCELLED:
      "CANCELLED",
  });


// ============================================================================
// REPLAY REASON
// ============================================================================

const REPLAY_REASON =
  Object.freeze({
    PROCESS_CRASH:
      "PROCESS_CRASH",

    WORKER_REPLACED:
      "WORKER_REPLACED",

    EXPIRED_LEASE:
      "EXPIRED_LEASE",

    RETRYABLE_FAILURE:
      "RETRYABLE_FAILURE",

    OUTBOX_INTERRUPTION:
      "OUTBOX_INTERRUPTION",

    DEAD_LETTER_REPLAY:
      "DEAD_LETTER_REPLAY",

    MANUAL_REQUEST:
      "MANUAL_REQUEST",

    STALE_OPERATION:
      "STALE_OPERATION",

    AMBIGUOUS_EXECUTION_STATE:
      "AMBIGUOUS_EXECUTION_STATE",

    MISSING_DURABLE_EVIDENCE:
      "MISSING_DURABLE_EVIDENCE",

    WORKFLOW_ALREADY_COMPLETE:
      "WORKFLOW_ALREADY_COMPLETE",
  });


// ============================================================================
// REPLAY ERROR CODES
// ============================================================================

const REPLAY_ERROR_CODE =
  Object.freeze({
    REQUEST_REQUIRED:
      "REPLAY_REQUEST_REQUIRED",

    SCOPE_REQUIRED:
      "REPLAY_SCOPE_REQUIRED",

    MODE_INVALID:
      "REPLAY_MODE_INVALID",

    SOURCE_INVALID:
      "REPLAY_SOURCE_INVALID",

    DECISION_INVALID:
      "REPLAY_DECISION_INVALID",

    SAFETY_INVALID:
      "REPLAY_SAFETY_INVALID",

    STATUS_INVALID:
      "REPLAY_STATUS_INVALID",

    STAGE_REQUIRED:
      "REPLAY_STAGE_REQUIRED",

    AUTHORITY_FORBIDDEN:
      "REPLAY_EXECUTION_AUTHORITY_FORBIDDEN",

    PLAN_INVALID:
      "REPLAY_PLAN_INVALID",
  });


// ============================================================================
// TERMINAL STATUS
// ============================================================================

const TERMINAL_REPLAY_STATUS =
  Object.freeze(
    new Set([
      REPLAY_STATUS
        .COMPLETED,

      REPLAY_STATUS
        .BLOCKED,

      REPLAY_STATUS
        .FAILED,

      REPLAY_STATUS
        .CANCELLED,
    ])
  );


// ============================================================================
// HELPERS
// ============================================================================

function isReplaySource(
  value
) {
  return Object
    .values(
      REPLAY_SOURCE
    )
    .includes(
      value
    );
}


function isReplayMode(
  value
) {
  return Object
    .values(
      REPLAY_MODE
    )
    .includes(
      value
    );
}


function isReplayDecision(
  value
) {
  return Object
    .values(
      REPLAY_DECISION
    )
    .includes(
      value
    );
}


function isReplaySafety(
  value
) {
  return Object
    .values(
      REPLAY_SAFETY
    )
    .includes(
      value
    );
}


function isReplayStatus(
  value
) {
  return Object
    .values(
      REPLAY_STATUS
    )
    .includes(
      value
    );
}


function isTerminalReplayStatus(
  value
) {
  return TERMINAL_REPLAY_STATUS
    .has(
      value
    );
}


// ============================================================================
// AUTHORITY FIREWALL
// ============================================================================

function assertNoReplayExecutionAuthority(
  value,
  context =
    "replay"
) {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return true;
  }

  if (
    value.executionAuthorized ===
      true ||
    value.authorizationGranted ===
      true
  ) {
    throw Object.assign(
      new Error(
        `${context} cannot grant infrastructure execution authority`
      ),
      {
        code:
          REPLAY_ERROR_CODE
            .AUTHORITY_FORBIDDEN,

        context,

        retryable:
          false,
      }
    );
  }

  return true;
}


// ============================================================================
// REPLAY REQUEST VALIDATION
// ============================================================================

function assertReplayRequest(
  request
) {
  if (
    !request ||
    typeof request !==
      "object" ||
    Array.isArray(
      request
    )
  ) {
    throw Object.assign(
      new Error(
        "Replay request is required"
      ),
      {
        code:
          REPLAY_ERROR_CODE
            .REQUEST_REQUIRED,
      }
    );
  }

  for (
    const field
    of [
      "organizationId",
      "environmentId",
      "incidentId",
    ]
  ) {
    if (
      request[field] ===
        undefined ||
      request[field] ===
        null ||
      request[field] ===
        ""
    ) {
      throw Object.assign(
        new Error(
          `Replay request requires ${field}`
        ),
        {
          code:
            REPLAY_ERROR_CODE
              .SCOPE_REQUIRED,

          field,
        }
      );
    }
  }

  if (
    !isReplaySource(
      request.source
    )
  ) {
    throw Object.assign(
      new Error(
        "Replay request source is invalid"
      ),
      {
        code:
          REPLAY_ERROR_CODE
            .SOURCE_INVALID,

        source:
          request.source,
      }
    );
  }

  if (
    !isReplayMode(
      request.mode
    )
  ) {
    throw Object.assign(
      new Error(
        "Replay request mode is invalid"
      ),
      {
        code:
          REPLAY_ERROR_CODE
            .MODE_INVALID,

        mode:
          request.mode,
      }
    );
  }

  assertNoReplayExecutionAuthority(
    request,
    "Replay request"
  );

  return true;
}


// ============================================================================
// CAN AUTO-RESUME?
// ============================================================================

function canAutoResume({
  decision,
  safety,
} = {}) {
  return (
    decision ===
      REPLAY_DECISION
        .RESUME &&
    safety ===
      REPLAY_SAFETY
        .SAFE
  );
}


// ============================================================================
// CAN EXECUTE REPLAY PLAN?
// ============================================================================

function assertExecutableReplayPlan(
  plan
) {
  if (
    !plan ||
    typeof plan !==
      "object"
  ) {
    throw Object.assign(
      new Error(
        "Replay plan is required"
      ),
      {
        code:
          REPLAY_ERROR_CODE
            .PLAN_INVALID,
      }
    );
  }

  assertNoReplayExecutionAuthority(
    plan,
    "Replay plan"
  );

  if (
    !canAutoResume({
      decision:
        plan.decision,

      safety:
        plan.safety,
    })
  ) {
    throw Object.assign(
      new Error(
        "Replay plan is not eligible for automatic resume"
      ),
      {
        code:
          REPLAY_ERROR_CODE
            .PLAN_INVALID,

        decision:
          plan.decision,

        safety:
          plan.safety,

        retryable:
          false,
      }
    );
  }

  if (
    !plan.resumeStage
  ) {
    throw Object.assign(
      new Error(
        "Replay plan requires resumeStage"
      ),
      {
        code:
          REPLAY_ERROR_CODE
            .STAGE_REQUIRED,
      }
    );
  }

  return true;
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  REPLAY_SOURCE,

  REPLAY_MODE,

  REPLAY_DECISION,

  REPLAY_SAFETY,

  REPLAY_STATUS,

  REPLAY_REASON,

  REPLAY_ERROR_CODE,

  TERMINAL_REPLAY_STATUS,

  isReplaySource,

  isReplayMode,

  isReplayDecision,

  isReplaySafety,

  isReplayStatus,

  isTerminalReplayStatus,

  assertNoReplayExecutionAuthority,

  assertReplayRequest,

  canAutoResume,

  assertExecutableReplayPlan,
};