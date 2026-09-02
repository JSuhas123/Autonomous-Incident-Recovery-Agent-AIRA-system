"use strict";


/**
 * ============================================================================
 * AIRA PHASE 23.9
 * FINAL CLOSED-LOOP CERTIFICATION CONTRACT
 * ============================================================================
 *
 * PHASE 23 controls HUMAN OPERATIONS.
 *
 * PHASE 23 NEVER grants infrastructure execution authorization.
 *
 * ============================================================================
 */


const PHASE23_FINAL_INVARIANTS =
  Object.freeze({
    CAPABILITY_IS_NOT_AUTHORITY:
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

    ACTIVE_POSTGRES_LEASE_IS_HUMAN_CONTROL_AUTHORITY:
      true,

    HUMAN_CONTROL_IS_NOT_EXECUTION_AUTHORIZATION:
      true,

    EXACTLY_ONE_ACTIVE_LEASE_PER_INCIDENT:
      true,

    LEASE_EXPIRY_FAILS_SAFE:
      true,

    RETURN_CONTROL_IS_NOT_RESUME:
      true,

    RELEASE_REQUIRES_FRESH_EVALUATION:
      true,

    EXPIRY_REQUIRES_FRESH_EVALUATION:
      true,

    REVOCATION_REQUIRES_FRESH_EVALUATION:
      true,

    STALE_PLAN_RESUME_PROHIBITED:
      true,

    POSTGRES_IS_CONTROL_AUTHORITY:
      true,

    PHASE23_EXECUTION_AUTHORITY_MUST_REMAIN_ZERO:
      true,
  });


const REQUIRED_PHASE23_CERTIFICATIONS =
  Object.freeze([
    "PHASE23_1_LIVE_CONTROL_FOUNDATION",

    "PHASE23_1F_DURABLE_LEASE_EXPIRY",

    "PHASE23_8_TENANT_ADVERSARIAL",

    "PHASE23_DATABASE_SCHEMA",

    "PHASE23_DATABASE_RLS",

    "PHASE23_ACTIVE_LEASE_UNIQUENESS",

    "PHASE23_RETURN_CONTROL_FENCE",

    "PHASE23_STALE_PLAN_FENCE",

    "PHASE23_EXECUTION_AUTHORITY_AUDIT",

    "PHASE23_FINAL_FREEZE",
  ]);


function certificationError(
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

      stalePlanResumeAllowed:
        false,

      executionAuthorized:
        false,

      ...details,
    }
  );
}


function normalizeCertification(
  input =
    {}
) {
  return {
    id:
      input.id ||
      null,

    passed:
      input.passed ===
      true,

    detail:
      input.detail ||
      null,

    expected:
      input.expected ??
      null,

    observed:
      input.observed ??
      null,
  };
}


function certifyPhase23Final(
  certifications =
    []
) {
  if (
    !Array.isArray(
      certifications
    )
  ) {
    throw certificationError(
      "Phase 23 final certifications must be an array",
      "PHASE23_FINAL_RESULTS_INVALID"
    );
  }


  const normalized =
    certifications.map(
      normalizeCertification
    );


  const byId =
    new Map(
      normalized.map(
        (
          item
        ) => [
          item.id,
          item,
        ]
      )
    );


  const missing =
    REQUIRED_PHASE23_CERTIFICATIONS
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
    throw certificationError(
      "Phase 23 final certification is incomplete",
      "PHASE23_FINAL_CERTIFICATIONS_MISSING",
      {
        missing,
      }
    );
  }


  const failed =
    normalized.filter(
      (
        item
      ) =>
        item.passed !==
        true
    );


  return {
    phase:
      "23",

    subphase:
      "23.9",

    certification:
      failed.length ===
        0
        ? "PASS"
        : "FAIL",

    frozen:
      failed.length ===
        0,

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
          item
        ) =>
          item.id
      ),

    certifications:
      normalized,

    humanControlIsExecutionAuthorization:
      false,

    stalePlanResumeAllowed:
      false,

    executionAuthorized:
      false,
  };
}


function certifyAuthorityCount(
  count
) {
  const observed =
    Number(
      count ||
      0
    );


  return {
    id:
      "PHASE23_EXECUTION_AUTHORITY_AUDIT",

    passed:
      observed ===
      0,

    expected:
      0,

    observed,

    executionAuthorized:
      false,
  };
}


function certifyRlsState({
  expectedTables =
    [],
  observedTables =
    [],
} = {}) {
  const observed =
    new Map(
      observedTables.map(
        (
          row
        ) => [
          row.tableName,
          row,
        ]
      )
    );


  const failures =
    [];


  for (
    const tableName
    of expectedTables
  ) {
    const row =
      observed.get(
        tableName
      );


    if (
      !row
    ) {
      failures.push({
        tableName,
        reason:
          "MISSING",
      });

      continue;
    }


    if (
      row.rlsEnabled !==
        true
    ) {
      failures.push({
        tableName,
        reason:
          "RLS_DISABLED",
      });
    }


    if (
      row.rlsForced !==
        true
    ) {
      failures.push({
        tableName,
        reason:
          "RLS_NOT_FORCED",
      });
    }
  }


  return {
    id:
      "PHASE23_DATABASE_RLS",

    passed:
      failures.length ===
      0,

    expected:
      "RLS ENABLED + FORCE RLS on every authoritative Phase-23 table",

    observed:
      failures.length ===
        0
        ? "PASS"
        : failures,

    executionAuthorized:
      false,
  };
}


function certifySchemaState({
  expectedTables =
    [],
  existingTables =
    [],
} = {}) {
  const existing =
    new Set(
      existingTables
    );


  const missing =
    expectedTables.filter(
      (
        tableName
      ) =>
        !existing.has(
          tableName
        )
    );


  return {
    id:
      "PHASE23_DATABASE_SCHEMA",

    passed:
      missing.length ===
      0,

    expected:
      expectedTables,

    observed: {
      existing:
        existingTables,

      missing,
    },

    executionAuthorized:
      false,
  };
}


module.exports = {
  PHASE23_FINAL_INVARIANTS,

  REQUIRED_PHASE23_CERTIFICATIONS,

  certifyPhase23Final,

  certifyAuthorityCount,

  certifyRlsState,

  certifySchemaState,
};