"use strict";

/**
 * AIRA Incident Lifecycle Contracts
 *
 * Phase 10.1
 *
 * Canonical lifecycle vocabulary for incident finalization,
 * continuous recovery control, regression and escalation.
 *
 * IMPORTANT:
 *
 * These contracts describe lifecycle intent.
 * They DO NOT authorize infrastructure execution.
 */

// ============================================================================
// INCIDENT LIFECYCLE STATE
// ============================================================================

const INCIDENT_LIFECYCLE_STATE =
  Object.freeze({
    OPEN:
      "OPEN",

    RECOVERY_IN_PROGRESS:
      "RECOVERY_IN_PROGRESS",

    VERIFYING:
      "VERIFYING",

    RECOVERED:
      "RECOVERED",

    STABILITY_OBSERVATION:
      "STABILITY_OBSERVATION",

    RESOLVED:
      "RESOLVED",

    CLOSED:
      "CLOSED",

    REGRESSED:
      "REGRESSED",

    RETRY_PENDING:
      "RETRY_PENDING",

    ROLLBACK_PENDING:
      "ROLLBACK_PENDING",

    ESCALATED:
      "ESCALATED",

    MANUAL_INTERVENTION:
      "MANUAL_INTERVENTION",
  });

// ============================================================================
// LIFECYCLE ACTION
// ============================================================================

const LIFECYCLE_ACTION =
  Object.freeze({
    BEGIN_VERIFICATION:
      "BEGIN_VERIFICATION",

    BEGIN_STABILITY_OBSERVATION:
      "BEGIN_STABILITY_OBSERVATION",

    MARK_RESOLVED:
      "MARK_RESOLVED",

    CLOSE_INCIDENT:
      "CLOSE_INCIDENT",

    REOPEN_INCIDENT:
      "REOPEN_INCIDENT",

    REQUEST_RETRY:
      "REQUEST_RETRY",

    REQUEST_ROLLBACK:
      "REQUEST_ROLLBACK",

    ESCALATE:
      "ESCALATE",

    REQUIRE_MANUAL_INTERVENTION:
      "REQUIRE_MANUAL_INTERVENTION",

    NO_ACTION:
      "NO_ACTION",
  });

// ============================================================================
// LIFECYCLE EVENT
// ============================================================================

const LIFECYCLE_EVENT =
  Object.freeze({
    VERIFICATION_RECOVERED:
      "lifecycle.verification.recovered",

    VERIFICATION_FAILED:
      "lifecycle.verification.failed",

    VERIFICATION_INCONCLUSIVE:
      "lifecycle.verification.inconclusive",

    STABILITY_STARTED:
      "lifecycle.stability.started",

    STABILITY_PASSED:
      "lifecycle.stability.passed",

    STABILITY_FAILED:
      "lifecycle.stability.failed",

    INCIDENT_RESOLVED:
      "lifecycle.incident.resolved",

    INCIDENT_CLOSED:
      "lifecycle.incident.closed",

    INCIDENT_REOPENED:
      "lifecycle.incident.reopened",

    RETRY_REQUESTED:
      "lifecycle.retry.requested",

    ROLLBACK_REQUESTED:
      "lifecycle.rollback.requested",

    ESCALATED:
      "lifecycle.escalated",

    MANUAL_INTERVENTION_REQUIRED:
      "lifecycle.manual_intervention.required",
  });

// ============================================================================
// STABILITY RESULT
// ============================================================================

const STABILITY_RESULT =
  Object.freeze({
    STABLE:
      "STABLE",

    UNSTABLE:
      "UNSTABLE",

    INCONCLUSIVE:
      "INCONCLUSIVE",

    EXPIRED:
      "EXPIRED",
  });

// ============================================================================
// CLOSURE DECISION
// ============================================================================

const CLOSURE_DECISION =
  Object.freeze({
    ELIGIBLE:
      "ELIGIBLE",

    NOT_ELIGIBLE:
      "NOT_ELIGIBLE",

    WAIT_FOR_STABILITY:
      "WAIT_FOR_STABILITY",

    BLOCKED:
      "BLOCKED",
  });

// ============================================================================
// ESCALATION REASON
// ============================================================================

const ESCALATION_REASON =
  Object.freeze({
    RETRIES_EXHAUSTED:
      "RETRIES_EXHAUSTED",

    ROLLBACK_UNAVAILABLE:
      "ROLLBACK_UNAVAILABLE",

    ROLLBACK_FAILED:
      "ROLLBACK_FAILED",

    VERIFICATION_INCONCLUSIVE:
      "VERIFICATION_INCONCLUSIVE",

    STABILITY_REGRESSION:
      "STABILITY_REGRESSION",

    POLICY_BLOCKED:
      "POLICY_BLOCKED",

    MANUAL_APPROVAL_REQUIRED:
      "MANUAL_APPROVAL_REQUIRED",

    UNKNOWN_FAILURE:
      "UNKNOWN_FAILURE",
  });

// ============================================================================
// VALID STATE TRANSITIONS
// ============================================================================

const VALID_TRANSITIONS =
  Object.freeze({
    [INCIDENT_LIFECYCLE_STATE.OPEN]:
      Object.freeze([
        INCIDENT_LIFECYCLE_STATE
          .RECOVERY_IN_PROGRESS,

        INCIDENT_LIFECYCLE_STATE
          .VERIFYING,

        INCIDENT_LIFECYCLE_STATE
          .ESCALATED,

        INCIDENT_LIFECYCLE_STATE
          .MANUAL_INTERVENTION,
      ]),

    [INCIDENT_LIFECYCLE_STATE.RECOVERY_IN_PROGRESS]:
      Object.freeze([
        INCIDENT_LIFECYCLE_STATE
          .VERIFYING,

        INCIDENT_LIFECYCLE_STATE
          .RETRY_PENDING,

        INCIDENT_LIFECYCLE_STATE
          .ROLLBACK_PENDING,

        INCIDENT_LIFECYCLE_STATE
          .ESCALATED,

        INCIDENT_LIFECYCLE_STATE
          .MANUAL_INTERVENTION,
      ]),

    [INCIDENT_LIFECYCLE_STATE.VERIFYING]:
      Object.freeze([
        INCIDENT_LIFECYCLE_STATE
          .RECOVERED,

        INCIDENT_LIFECYCLE_STATE
          .RETRY_PENDING,

        INCIDENT_LIFECYCLE_STATE
          .ROLLBACK_PENDING,

        INCIDENT_LIFECYCLE_STATE
          .ESCALATED,

        INCIDENT_LIFECYCLE_STATE
          .MANUAL_INTERVENTION,
      ]),

    [INCIDENT_LIFECYCLE_STATE.RECOVERED]:
      Object.freeze([
        INCIDENT_LIFECYCLE_STATE
          .STABILITY_OBSERVATION,

        INCIDENT_LIFECYCLE_STATE
          .REGRESSED,

        INCIDENT_LIFECYCLE_STATE
          .ESCALATED,
      ]),

    [INCIDENT_LIFECYCLE_STATE.STABILITY_OBSERVATION]:
      Object.freeze([
        INCIDENT_LIFECYCLE_STATE
          .RESOLVED,

        INCIDENT_LIFECYCLE_STATE
          .REGRESSED,

        INCIDENT_LIFECYCLE_STATE
          .ESCALATED,

        INCIDENT_LIFECYCLE_STATE
          .MANUAL_INTERVENTION,
      ]),

    [INCIDENT_LIFECYCLE_STATE.RESOLVED]:
      Object.freeze([
        INCIDENT_LIFECYCLE_STATE
          .CLOSED,

        INCIDENT_LIFECYCLE_STATE
          .REGRESSED,
      ]),

    [INCIDENT_LIFECYCLE_STATE.REGRESSED]:
      Object.freeze([
        INCIDENT_LIFECYCLE_STATE
          .RECOVERY_IN_PROGRESS,

        INCIDENT_LIFECYCLE_STATE
          .RETRY_PENDING,

        INCIDENT_LIFECYCLE_STATE
          .ROLLBACK_PENDING,

        INCIDENT_LIFECYCLE_STATE
          .ESCALATED,

        INCIDENT_LIFECYCLE_STATE
          .MANUAL_INTERVENTION,
      ]),

    [INCIDENT_LIFECYCLE_STATE.RETRY_PENDING]:
      Object.freeze([
        INCIDENT_LIFECYCLE_STATE
          .RECOVERY_IN_PROGRESS,

        INCIDENT_LIFECYCLE_STATE
          .ESCALATED,

        INCIDENT_LIFECYCLE_STATE
          .MANUAL_INTERVENTION,
      ]),

    [INCIDENT_LIFECYCLE_STATE.ROLLBACK_PENDING]:
      Object.freeze([
        INCIDENT_LIFECYCLE_STATE
          .VERIFYING,

        INCIDENT_LIFECYCLE_STATE
          .ESCALATED,

        INCIDENT_LIFECYCLE_STATE
          .MANUAL_INTERVENTION,
      ]),

    [INCIDENT_LIFECYCLE_STATE.ESCALATED]:
      Object.freeze([
        INCIDENT_LIFECYCLE_STATE
          .RECOVERY_IN_PROGRESS,

        INCIDENT_LIFECYCLE_STATE
          .MANUAL_INTERVENTION,

        INCIDENT_LIFECYCLE_STATE
          .RESOLVED,
      ]),

    [INCIDENT_LIFECYCLE_STATE.MANUAL_INTERVENTION]:
      Object.freeze([
        INCIDENT_LIFECYCLE_STATE
          .RECOVERY_IN_PROGRESS,

        INCIDENT_LIFECYCLE_STATE
          .VERIFYING,

        INCIDENT_LIFECYCLE_STATE
          .RESOLVED,
      ]),

    /*
     * CLOSED is intentionally terminal inside the automated lifecycle.
     *
     * A future incident with the same symptom should normally become a new
     * incident instead of silently mutating historical closed state.
     */
    [INCIDENT_LIFECYCLE_STATE.CLOSED]:
      Object.freeze([]),
  });

// ============================================================================
// HELPERS
// ============================================================================

function isValidLifecycleState(
  state
) {
  return Object.values(
    INCIDENT_LIFECYCLE_STATE
  )
    .includes(
      state
    );
}

function canTransition(
  fromState,
  toState
) {
  if (
    !isValidLifecycleState(
      fromState
    ) ||
    !isValidLifecycleState(
      toState
    )
  ) {
    return false;
  }

  return (
    VALID_TRANSITIONS[
      fromState
    ] ||
    []
  )
    .includes(
      toState
    );
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  INCIDENT_LIFECYCLE_STATE,
  LIFECYCLE_ACTION,
  LIFECYCLE_EVENT,
  STABILITY_RESULT,
  CLOSURE_DECISION,
  ESCALATION_REASON,
  VALID_TRANSITIONS,
  isValidLifecycleState,
  canTransition,
};