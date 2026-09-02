"use strict";


/**
 * ============================================================================
 * AIRA PHASE 23.8
 * TENANT + ADVERSARIAL CERTIFICATION SERVICE
 * ============================================================================
 *
 * This service contains deterministic certification helpers only.
 *
 * It does NOT:
 *
 * - execute infrastructure recovery;
 * - grant control;
 * - grant execution authority;
 * - bypass PostgreSQL;
 * - manufacture tenant context.
 *
 * ============================================================================
 */


const PHASE23_ADVERSARIAL_INVARIANTS =
  Object.freeze({
    CROSS_TENANT_READ_PROHIBITED:
      true,

    CROSS_TENANT_WRITE_PROHIBITED:
      true,

    CROSS_TENANT_CONTROL_PROHIBITED:
      true,

    FORGED_EXECUTION_AUTHORITY_PROHIBITED:
      true,

    ASSIGNMENT_IS_NOT_CONTROL:
      true,

    ACKNOWLEDGEMENT_IS_NOT_CONTROL:
      true,

    NOTIFICATION_IS_NOT_CONTROL:
      true,

    HANDOFF_IS_NOT_CONTROL:
      true,

    TAKEOVER_REQUEST_IS_NOT_CONTROL:
      true,

    TAKEOVER_AUTHORIZATION_IS_NOT_CONTROL:
      true,

    ACTIVE_LEASE_IS_CONTROL_AUTHORITY:
      true,

    EXACTLY_ONE_ACTIVE_LEASE_PER_INCIDENT:
      true,

    LEASE_THEFT_PROHIBITED:
      true,

    STALE_LEASE_HEARTBEAT_PROHIBITED:
      true,

    RETURN_CONTROL_IS_NOT_RESUME:
      true,

    RETURN_CONTROL_REQUIRES_FRESH_EVALUATION:
      true,

    STALE_PLAN_RESUME_PROHIBITED:
      true,

    HUMAN_CONTROL_NEVER_AUTHORIZES_EXECUTION:
      true,

    POSTGRES_IS_CONTROL_AUTHORITY:
      true,
  });


const REQUIRED_ADVERSARIAL_CASES =
  Object.freeze([
    "SOURCE_SCOPE_READ",

    "FOREIGN_SCOPE_READ",

    "FOREIGN_SCOPE_WRITE",

    "DATABASE_AUTHORITY_FORGERY",

    "CONCURRENT_CONTROL_ACQUISITION",

    "LEASE_OWNER_MISMATCH",

    "EXPIRED_LEASE_HEARTBEAT",

    "RETURN_CONTROL_FENCE",

    "STALE_PLAN_RESUME",

    "FINAL_EXECUTION_AUTHORITY_AUDIT",
  ]);


function createError(
  message,
  code,
  details =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      executionAuthorized:
        false,

      ...details,
    }
  );
}


function normalizeResult(
  input =
    {}
) {
  return {
    id:
      input.id,

    passed:
      input.passed ===
      true,

    detail:
      input.detail ||
      null,

    observed:
      input.observed ??
      null,

    expected:
      input.expected ??
      null,
  };
}


function certifyResults(
  results =
    []
) {
  if (
    !Array.isArray(
      results
    )
  ) {
    throw createError(
      "Certification results must be an array",
      "PHASE23_ADVERSARIAL_RESULTS_INVALID"
    );
  }


  const normalized =
    results.map(
      normalizeResult
    );


  const byId =
    new Map(
      normalized.map(
        (
          result
        ) => [
          result.id,
          result,
        ]
      )
    );


  const missing =
    REQUIRED_ADVERSARIAL_CASES
      .filter(
        (
          id
        ) =>
          !byId.has(
            id
          )
      );


  if (
    missing.length >
    0
  ) {
    throw createError(
      "Phase 23.8 certification is incomplete",
      "PHASE23_ADVERSARIAL_CASES_MISSING",
      {
        missing,
      }
    );
  }


  const failed =
    normalized.filter(
      (
        result
      ) =>
        result.passed !==
        true
    );


  return {
    phase:
      "23.8",

    certification:
      failed.length ===
        0
        ? "PASS"
        : "FAIL",

    passed:
      failed.length ===
        0,

    total:
      normalized.length,

    passedCount:
      normalized.length -
      failed.length,

    failedCount:
      failed.length,

    failedCases:
      failed.map(
        (
          result
        ) =>
          result.id
      ),

    results:
      normalized,

    stalePlanResumeAllowed:
      false,

    executionAuthorized:
      false,
  };
}


function certifyConcurrency({
  winners,
  losers,
  activeLeaseCount,
} = {}) {
  const winnerCount =
    Number(
      winners ??
      0
    );


  const loserCount =
    Number(
      losers ??
      0
    );


  const activeCount =
    Number(
      activeLeaseCount ??
      0
    );


  const passed =
    winnerCount ===
      1 &&
    loserCount ===
      1 &&
    activeCount ===
      1;


  return {
    id:
      "CONCURRENT_CONTROL_ACQUISITION",

    passed,

    expected: {
      winners:
        1,

      losers:
        1,

      activeLeaseCount:
        1,
    },

    observed: {
      winners:
        winnerCount,

      losers:
        loserCount,

      activeLeaseCount:
        activeCount,
    },

    stalePlanResumeAllowed:
      false,

    executionAuthorized:
      false,
  };
}


function certifyForeignScope({
  readCount,
  writeCount,
} = {}) {
  const reads =
    Number(
      readCount ??
      0
    );


  const writes =
    Number(
      writeCount ??
      0
    );


  return [
    {
      id:
        "FOREIGN_SCOPE_READ",

      passed:
        reads ===
        0,

      expected:
        0,

      observed:
        reads,
    },

    {
      id:
        "FOREIGN_SCOPE_WRITE",

      passed:
        writes ===
        0,

      expected:
        0,

      observed:
        writes,
    },
  ];
}


function certifyAuthorityAudit(
  authorityCount
) {
  const count =
    Number(
      authorityCount ??
      0
    );


  return {
    id:
      "FINAL_EXECUTION_AUTHORITY_AUDIT",

    passed:
      count ===
      0,

    expected:
      0,

    observed:
      count,

    stalePlanResumeAllowed:
      false,

    executionAuthorized:
      false,
  };
}


module.exports = {
  PHASE23_ADVERSARIAL_INVARIANTS,

  REQUIRED_ADVERSARIAL_CASES,

  certifyResults,

  certifyConcurrency,

  certifyForeignScope,

  certifyAuthorityAudit,
};