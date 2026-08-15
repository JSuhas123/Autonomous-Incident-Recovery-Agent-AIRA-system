"use strict";

/**
 * AIRA Verification Contracts
 *
 * Phase 9.1
 *
 * Defines the canonical contracts for post-execution verification.
 *
 * Core rule:
 *
 * Execution success != incident recovery.
 *
 * Phase 9 must independently verify whether the remediation
 * actually improved or restored the affected system.
 */

// ============================================================================
// VERIFICATION DIMENSIONS
// ============================================================================

const VERIFICATION_DIMENSION =
  Object.freeze({
    HEALTH:
      "HEALTH",

    METRICS:
      "METRICS",

    LOGS:
      "LOGS",

    INCIDENT_STATE:
      "INCIDENT_STATE",

    RESOURCE_STATE:
      "RESOURCE_STATE",

    DEPENDENCY_STATE:
      "DEPENDENCY_STATE",
  });

// ============================================================================
// CHECK STATUS
// ============================================================================

const VERIFICATION_CHECK_STATUS =
  Object.freeze({
    PENDING:
      "PENDING",

    RUNNING:
      "RUNNING",

    PASSED:
      "PASSED",

    FAILED:
      "FAILED",

    INCONCLUSIVE:
      "INCONCLUSIVE",

    SKIPPED:
      "SKIPPED",

    TIMED_OUT:
      "TIMED_OUT",

    ERROR:
      "ERROR",
  });

// ============================================================================
// OVERALL VERIFICATION DECISION
// ============================================================================

const VERIFICATION_DECISION =
  Object.freeze({
    RECOVERED:
      "RECOVERED",

    PARTIALLY_RECOVERED:
      "PARTIALLY_RECOVERED",

    NOT_RECOVERED:
      "NOT_RECOVERED",

    INCONCLUSIVE:
      "INCONCLUSIVE",

    REGRESSED:
      "REGRESSED",

    MANUAL_REVIEW:
      "MANUAL_REVIEW",
  });

// ============================================================================
// VERIFICATION CONFIDENCE
// ============================================================================

const VERIFICATION_CONFIDENCE =
  Object.freeze({
    HIGH:
      "HIGH",

    MEDIUM:
      "MEDIUM",

    LOW:
      "LOW",

    UNKNOWN:
      "UNKNOWN",
  });

// ============================================================================
// NEXT ACTION
// ============================================================================

const VERIFICATION_NEXT_ACTION =
  Object.freeze({
    CLOSE_INCIDENT:
      "CLOSE_INCIDENT",

    CONTINUE_MONITORING:
      "CONTINUE_MONITORING",

    RETRY_RECOVERY:
      "RETRY_RECOVERY",

    ROLLBACK:
      "ROLLBACK",

    ESCALATE:
      "ESCALATE",

    COLLECT_MORE_EVIDENCE:
      "COLLECT_MORE_EVIDENCE",

    MANUAL_INTERVENTION:
      "MANUAL_INTERVENTION",

    NONE:
      "NONE",
  });

// ============================================================================
// VERIFICATION RUN STATE
// ============================================================================

const VERIFICATION_RUN_STATE =
  Object.freeze({
    CREATED:
      "CREATED",

    RUNNING:
      "RUNNING",

    COMPLETED:
      "COMPLETED",

    FAILED:
      "FAILED",

    CANCELLED:
      "CANCELLED",
  });

// ============================================================================
// CREATE CHECK RESULT
// ============================================================================

function createVerificationCheckResult(
  input = {}
) {
  const status =
    normalizeEnum(
      input.status,
      VERIFICATION_CHECK_STATUS,
      VERIFICATION_CHECK_STATUS
        .INCONCLUSIVE
    );

  return {
    checkId:
      input.checkId ||
      null,

    dimension:
      normalizeEnum(
        input.dimension,
        VERIFICATION_DIMENSION,
        null
      ),

    status,

    passed:
      status ===
      VERIFICATION_CHECK_STATUS
        .PASSED,

    failed:
      status ===
      VERIFICATION_CHECK_STATUS
        .FAILED,

    inconclusive:
      [
        VERIFICATION_CHECK_STATUS
          .INCONCLUSIVE,

        VERIFICATION_CHECK_STATUS
          .TIMED_OUT,

        VERIFICATION_CHECK_STATUS
          .ERROR,
      ].includes(
        status
      ),

    score:
      normalizeScore(
        input.score
      ),

    observedValue:
      input.observedValue ??
      null,

    expectedValue:
      input.expectedValue ??
      null,

    baselineValue:
      input.baselineValue ??
      null,

    evidence:
      normalizeArray(
        input.evidence
      ),

    reasons:
      uniqueStrings(
        input.reasons
      ),

    warnings:
      uniqueStrings(
        input.warnings
      ),

    startedAt:
      input.startedAt ||
      null,

    completedAt:
      input.completedAt ||
      null,

    metadata: {
      ...(
        input.metadata ||
        {}
      ),

      contractVersion:
        "phase9.1-v1",
    },
  };
}

// ============================================================================
// CREATE VERIFICATION RESULT
// ============================================================================

function createVerificationResult(
  input = {}
) {
  const decision =
    normalizeEnum(
      input.decision,
      VERIFICATION_DECISION,
      VERIFICATION_DECISION
        .INCONCLUSIVE
    );

  const confidence =
    normalizeEnum(
      input.confidence,
      VERIFICATION_CONFIDENCE,
      VERIFICATION_CONFIDENCE
        .UNKNOWN
    );

  const nextAction =
    normalizeEnum(
      input.nextAction,
      VERIFICATION_NEXT_ACTION,
      VERIFICATION_NEXT_ACTION
        .NONE
    );

  const checks =
    normalizeArray(
      input.checks
    );

  return {
    verificationId:
      input.verificationId ||
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

    executionRequestId:
      input.executionRequestId ||
      null,

    authorizationId:
      input.authorizationId ||
      null,

    recoveryDecisionId:
      input.recoveryDecisionId ||
      null,

    planId:
      input.planId ||
      null,

    planHash:
      input.planHash ||
      null,

    decision,

    confidence,

    nextAction,

    recovered:
      decision ===
      VERIFICATION_DECISION
        .RECOVERED,

    checks,

    passedCheckCount:
      checks.filter(
        (
          check
        ) =>
          check.passed ===
          true
      )
        .length,

    failedCheckCount:
      checks.filter(
        (
          check
        ) =>
          check.failed ===
          true
      )
        .length,

    inconclusiveCheckCount:
      checks.filter(
        (
          check
        ) =>
          check.inconclusive ===
          true
      )
        .length,

    overallScore:
      normalizeScore(
        input.overallScore
      ),

    reasons:
      uniqueStrings(
        input.reasons
      ),

    warnings:
      uniqueStrings(
        input.warnings
      ),

    startedAt:
      input.startedAt ||
      null,

    completedAt:
      input.completedAt ||
      null,

    metadata: {
      ...(
        input.metadata ||
        {}
      ),

      contractVersion:
        "phase9.1-v1",
    },

    /*
     * Phase 9 does not authorize infrastructure execution.
     */
    executionAuthorized:
      false,
  };
}

// ============================================================================
// CREATE VERIFICATION RUN
// ============================================================================

function createVerificationRun(
  input = {}
) {
  return {
    verificationRunId:
      input.verificationRunId ||
      null,

    verificationId:
      input.verificationId ||
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

    executionRequestId:
      input.executionRequestId ||
      null,

    state:
      normalizeEnum(
        input.state,
        VERIFICATION_RUN_STATE,
        VERIFICATION_RUN_STATE
          .CREATED
      ),

    attempt:
      normalizeInteger(
        input.attempt,
        0
      ),

    maxAttempts:
      Math.max(
        1,
        normalizeInteger(
          input.maxAttempts,
          1
        )
      ),

    requestedAt:
      input.requestedAt ||
      new Date(),

    startedAt:
      input.startedAt ||
      null,

    completedAt:
      input.completedAt ||
      null,

    metadata: {
      ...(
        input.metadata ||
        {}
      ),

      contractVersion:
        "phase9.1-v1",
    },
  };
}

// ============================================================================
// VERIFICATION INVARIANTS
// ============================================================================

function assertVerificationResult(
  result
) {
  if (
    !result ||
    typeof result !==
      "object"
  ) {
    throw Object.assign(
      new Error(
        "Verification result is required"
      ),
      {
        code:
          "VERIFICATION_RESULT_REQUIRED",
      }
    );
  }

  if (
    !result.organizationId ||
    !result.environmentId ||
    !result.incidentId
  ) {
    throw Object.assign(
      new Error(
        "Verification result requires organization, environment and incident scope"
      ),
      {
        code:
          "VERIFICATION_SCOPE_REQUIRED",
      }
    );
  }

  if (
    !result.executionRequestId
  ) {
    throw Object.assign(
      new Error(
        "Verification result requires executionRequestId"
      ),
      {
        code:
          "VERIFICATION_EXECUTION_REQUEST_REQUIRED",
      }
    );
  }

  if (
    result.executionAuthorized ===
    true
  ) {
    throw Object.assign(
      new Error(
        "Verification result cannot authorize execution"
      ),
      {
        code:
          "VERIFICATION_EXECUTION_AUTHORIZATION_FORBIDDEN",
      }
    );
  }

  if (
    result.recovered ===
      true &&
    result.decision !==
      VERIFICATION_DECISION
        .RECOVERED
  ) {
    throw Object.assign(
      new Error(
        "Verification invariant violated: recovered=true without RECOVERED decision"
      ),
      {
        code:
          "VERIFICATION_RECOVERY_INVARIANT_VIOLATION",
      }
    );
  }

  if (
    result.decision ===
      VERIFICATION_DECISION
        .RECOVERED &&
    result.failedCheckCount >
      0
  ) {
    throw Object.assign(
      new Error(
        "Verification invariant violated: RECOVERED result contains failed checks"
      ),
      {
        code:
          "VERIFICATION_FAILED_CHECK_INVARIANT_VIOLATION",
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
  return Object
    .values(
      enumObject
    )
    .includes(
      value
    )
      ? value
      : fallback;
}

function normalizeArray(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : [];
}

function normalizeScore(
  value
) {
  const numeric =
    Number(
      value
    );

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.min(
      1,
      numeric
    )
  );
}

function normalizeInteger(
  value,
  fallback
) {
  const numeric =
    Number(
      value
    );

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return fallback;
  }

  return Math.max(
    0,
    Math.floor(
      numeric
    )
  );
}

function uniqueStrings(
  values
) {
  return [
    ...new Set(
      normalizeArray(
        values
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
// EXPORT
// ============================================================================

module.exports = {
  VERIFICATION_DIMENSION,
  VERIFICATION_CHECK_STATUS,
  VERIFICATION_DECISION,
  VERIFICATION_CONFIDENCE,
  VERIFICATION_NEXT_ACTION,
  VERIFICATION_RUN_STATE,

  createVerificationCheckResult,
  createVerificationResult,
  createVerificationRun,
  assertVerificationResult,
};