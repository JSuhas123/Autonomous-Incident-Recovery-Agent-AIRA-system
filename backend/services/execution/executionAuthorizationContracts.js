"use strict";

/**
 * AIRA Execution Authorization Contracts
 *
 * Phase 8.1
 *
 * Canonical contracts for authorization and controlled execution.
 *
 * Core rule:
 *
 * Recovery decisions do NOT authorize execution.
 *
 * Only Phase 8 may produce an authorization state, and even then
 * the authorization must satisfy all gates before an execution
 * request can move forward.
 */

// ============================================================================
// AUTHORIZATION DECISION
// ============================================================================

const AUTHORIZATION_DECISION =
  Object.freeze({
    AUTHORIZED:
      "AUTHORIZED",

    REQUIRES_APPROVAL:
      "REQUIRES_APPROVAL",

    BLOCKED:
      "BLOCKED",

    EXPIRED:
      "EXPIRED",

    STALE:
      "STALE",

    MANUAL_ONLY:
      "MANUAL_ONLY",
  });

// ============================================================================
// AUTHORIZATION STATUS
// ============================================================================

const AUTHORIZATION_STATUS =
  Object.freeze({
    PENDING:
      "PENDING",

    VALIDATING:
      "VALIDATING",

    AUTHORIZED:
      "AUTHORIZED",

    BLOCKED:
      "BLOCKED",

    EXPIRED:
      "EXPIRED",

    REVOKED:
      "REVOKED",

    CONSUMED:
      "CONSUMED",
  });

// ============================================================================
// APPROVAL STATE
// ============================================================================

const EXECUTION_APPROVAL_STATE =
  Object.freeze({
    NOT_REQUIRED:
      "NOT_REQUIRED",

    REQUIRED:
      "REQUIRED",

    PENDING:
      "PENDING",

    APPROVED:
      "APPROVED",

    REJECTED:
      "REJECTED",

    EXPIRED:
      "EXPIRED",
  });

// ============================================================================
// POLICY STATE
// ============================================================================

const EXECUTION_POLICY_STATE =
  Object.freeze({
    ALLOWED:
      "ALLOWED",

    DENIED:
      "DENIED",

    REQUIRES_APPROVAL:
      "REQUIRES_APPROVAL",

    UNKNOWN:
      "UNKNOWN",
  });

// ============================================================================
// FRESHNESS STATE
// ============================================================================

const EXECUTION_FRESHNESS_STATE =
  Object.freeze({
    FRESH:
      "FRESH",

    STALE:
      "STALE",

    EXPIRED:
      "EXPIRED",

    UNKNOWN:
      "UNKNOWN",
  });

// ============================================================================
// KILL SWITCH STATE
// ============================================================================

const KILL_SWITCH_STATE =
  Object.freeze({
    ENABLED:
      "ENABLED",

    DISABLED:
      "DISABLED",

    EMERGENCY_MODE:
      "EMERGENCY_MODE",

    UNKNOWN:
      "UNKNOWN",
  });

// ============================================================================
// LOCK STATE
// ============================================================================

const EXECUTION_LOCK_STATE =
  Object.freeze({
    NOT_REQUIRED:
      "NOT_REQUIRED",

    PENDING:
      "PENDING",

    ACQUIRED:
      "ACQUIRED",

    DENIED:
      "DENIED",

    EXPIRED:
      "EXPIRED",

    RELEASED:
      "RELEASED",
  });

// ============================================================================
// IDEMPOTENCY STATE
// ============================================================================

const IDEMPOTENCY_STATE =
  Object.freeze({
    NEW:
      "NEW",

    DUPLICATE:
      "DUPLICATE",

    COMPLETED:
      "COMPLETED",

    FAILED:
      "FAILED",

    UNKNOWN:
      "UNKNOWN",
  });

// ============================================================================
// EXECUTION REQUEST STATE
// ============================================================================

const EXECUTION_REQUEST_STATE =
  Object.freeze({
    CREATED:
      "CREATED",

    AUTHORIZED:
      "AUTHORIZED",

    QUEUED:
      "QUEUED",

    RUNNING:
      "RUNNING",

    SUCCEEDED:
      "SUCCEEDED",

    FAILED:
      "FAILED",

    ROLLBACK_REQUIRED:
      "ROLLBACK_REQUIRED",

    ROLLED_BACK:
      "ROLLED_BACK",

    CANCELLED:
      "CANCELLED",

    BLOCKED:
      "BLOCKED",
  });

// ============================================================================
// CREATE AUTHORIZATION RESULT
// ============================================================================

function createExecutionAuthorization(
  input = {}
) {
  const decision =
    normalizeEnum(
      input.decision,
      AUTHORIZATION_DECISION,
      AUTHORIZATION_DECISION
        .BLOCKED
    );

  const status =
    normalizeEnum(
      input.status,
      AUTHORIZATION_STATUS,
      decision ===
        AUTHORIZATION_DECISION
          .AUTHORIZED
        ? AUTHORIZATION_STATUS
            .AUTHORIZED
        : AUTHORIZATION_STATUS
            .BLOCKED
    );

  const approvalState =
    normalizeEnum(
      input.approvalState,
      EXECUTION_APPROVAL_STATE,
      EXECUTION_APPROVAL_STATE
        .NOT_REQUIRED
    );

  const policyState =
    normalizeEnum(
      input.policyState,
      EXECUTION_POLICY_STATE,
      EXECUTION_POLICY_STATE
        .UNKNOWN
    );

  const freshnessState =
    normalizeEnum(
      input.freshnessState,
      EXECUTION_FRESHNESS_STATE,
      EXECUTION_FRESHNESS_STATE
        .UNKNOWN
    );

  const killSwitchState =
    normalizeEnum(
      input.killSwitchState,
      KILL_SWITCH_STATE,
      KILL_SWITCH_STATE
        .UNKNOWN
    );

  const lockState =
    normalizeEnum(
      input.lockState,
      EXECUTION_LOCK_STATE,
      EXECUTION_LOCK_STATE
        .NOT_REQUIRED
    );

  const idempotencyState =
    normalizeEnum(
      input.idempotencyState,
      IDEMPOTENCY_STATE,
      IDEMPOTENCY_STATE
        .UNKNOWN
    );

  const authorized =
    decision ===
      AUTHORIZATION_DECISION
        .AUTHORIZED &&
    status ===
      AUTHORIZATION_STATUS
        .AUTHORIZED;

  return {
    authorizationId:
      input.authorizationId ||
      null,

    organizationId:
      input.organizationId ||
      null,

    environmentId:
      input.environmentId ||
      null,

    incidentId:
      input.incidentId ||
      null,

    recoveryDecisionId:
      input.recoveryDecisionId ||
      null,

    recoveryDecisionRevision:
      input.recoveryDecisionRevision ??
      null,

    selectedCandidateId:
      input.selectedCandidateId ||
      null,

    selectedPlaybookId:
      input.selectedPlaybookId ||
      null,

    decision,

    status,

    authorizationGranted:
      authorized,

    approvalState,

    policyState,

    freshnessState,

    killSwitchState,

    lockState,

    idempotencyState,

    validFrom:
      input.validFrom ||
      null,

    expiresAt:
      input.expiresAt ||
      null,

    authorizedAt:
      authorized
        ? (
            input.authorizedAt ||
            new Date()
          )
        : null,

    reasons:
      uniqueStrings(
        input.reasons
      ),

    warnings:
      uniqueStrings(
        input.warnings
      ),

    metadata: {
      ...(
        input.metadata ||
        {}
      ),

      contractVersion:
        "phase8.1-v1",
    },
  };
}

// ============================================================================
// CREATE EXECUTION REQUEST
// ============================================================================

function createExecutionRequest(
  input = {}
) {
  const state =
    normalizeEnum(
      input.state,
      EXECUTION_REQUEST_STATE,
      EXECUTION_REQUEST_STATE
        .CREATED
    );

  return {
    executionRequestId:
      input.executionRequestId ||
      null,

    authorizationId:
      input.authorizationId ||
      null,

    organizationId:
      input.organizationId ||
      null,

    environmentId:
      input.environmentId ||
      null,

    incidentId:
      input.incidentId ||
      null,

    recoveryDecisionId:
      input.recoveryDecisionId ||
      null,

    recoveryDecisionRevision:
      input.recoveryDecisionRevision ??
      null,

    candidateId:
      input.candidateId ||
      null,

    playbookId:
      input.playbookId ||
      null,

    state,

    requestedAt:
      input.requestedAt ||
      new Date(),

    queuedAt:
      input.queuedAt ||
      null,

    startedAt:
      input.startedAt ||
      null,

    completedAt:
      input.completedAt ||
      null,

    attempt:
      Number.isFinite(
        Number(
          input.attempt
        )
      )
        ? Math.max(
            0,
            Number(
              input.attempt
            )
          )
        : 0,

    maxAttempts:
      Number.isFinite(
        Number(
          input.maxAttempts
        )
      )
        ? Math.max(
            1,
            Number(
              input.maxAttempts
            )
          )
        : 1,

    idempotencyKey:
      input.idempotencyKey ||
      null,

    lockKey:
      input.lockKey ||
      null,

    parameters:
      input.parameters ||
      {},

    context:
      input.context ||
      {},

    reasons:
      uniqueStrings(
        input.reasons
      ),

    metadata: {
      ...(
        input.metadata ||
        {}
      ),

      contractVersion:
        "phase8.1-v1",
    },
  };
}

// ============================================================================
// AUTHORIZATION INVARIANTS
// ============================================================================

function assertExecutionAuthorization(
  authorization
) {
  if (
    !authorization ||
    typeof authorization !==
      "object"
  ) {
    throw Object.assign(
      new Error(
        "Execution authorization is required"
      ),
      {
        code:
          "EXECUTION_AUTHORIZATION_REQUIRED",
      }
    );
  }

  if (
    !authorization.organizationId ||
    !authorization.environmentId ||
    !authorization.incidentId
  ) {
    throw Object.assign(
      new Error(
        "Execution authorization requires organization, environment and incident scope"
      ),
      {
        code:
          "EXECUTION_AUTHORIZATION_SCOPE_REQUIRED",
      }
    );
  }

  if (
    !authorization
      .recoveryDecisionId
  ) {
    throw Object.assign(
      new Error(
        "Execution authorization requires recoveryDecisionId"
      ),
      {
        code:
          "EXECUTION_AUTHORIZATION_RECOVERY_DECISION_REQUIRED",
      }
    );
  }

  if (
    authorization
      .authorizationGranted ===
      true &&
    authorization
      .decision !==
      AUTHORIZATION_DECISION
        .AUTHORIZED
  ) {
    throw Object.assign(
      new Error(
        "Authorization invariant violated: authorizationGranted without AUTHORIZED decision"
      ),
      {
        code:
          "EXECUTION_AUTHORIZATION_INVARIANT_VIOLATION",
      }
    );
  }

  if (
    authorization
      .authorizationGranted ===
      true &&
    authorization
      .status !==
      AUTHORIZATION_STATUS
        .AUTHORIZED
  ) {
    throw Object.assign(
      new Error(
        "Authorization invariant violated: authorizationGranted without AUTHORIZED status"
      ),
      {
        code:
          "EXECUTION_AUTHORIZATION_STATUS_INVALID",
      }
    );
  }

  return true;
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeEnum(
  value,
  enumObject,
  fallback
) {
  const values =
    Object.values(
      enumObject
    );

  return values.includes(
    value
  )
    ? value
    : fallback;
}

function uniqueStrings(
  values
) {
  return [
    ...new Set(
      (
        Array.isArray(
          values
        )
          ? values
          : []
      )
        .filter(
          Boolean
        )
        .map(
          String
        )
    ),
  ];
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  AUTHORIZATION_DECISION,
  AUTHORIZATION_STATUS,
  EXECUTION_APPROVAL_STATE,
  EXECUTION_POLICY_STATE,
  EXECUTION_FRESHNESS_STATE,
  KILL_SWITCH_STATE,
  EXECUTION_LOCK_STATE,
  IDEMPOTENCY_STATE,
  EXECUTION_REQUEST_STATE,

  createExecutionAuthorization,
  createExecutionRequest,
  assertExecutionAuthorization,
};