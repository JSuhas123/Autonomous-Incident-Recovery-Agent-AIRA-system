"use strict";

/**
 * Phase 21.16
 * Positive Execution Safety Evaluator
 *
 * Evaluates a genuine canonical authorization + controlled execution.
 *
 * Does not authorize anything.
 */

const VERSION =
  "21.16-positive-v1";


class PositiveExecutionSafetyEvaluator {
  evaluate({
    authorizationResult,
    executionResult,
    integrationResult = null,
  } = {}) {
    const failures =
      [];


    if (
      authorizationResult
        ?.authorizationGranted !==
      true
    ) {
      failures.push(
        "CANONICAL_AUTHORIZATION_NOT_GRANTED"
      );
    }


    if (
      !authorizationResult
        ?.authorization
        ?.authorizationId
    ) {
      failures.push(
        "AUTHORIZATION_ID_MISSING"
      );
    }


    if (
      !authorizationResult
        ?.executionPlan
        ?.planId ||
      !authorizationResult
        ?.executionPlan
        ?.planHash
    ) {
      failures.push(
        "IMMUTABLE_EXECUTION_PLAN_MISSING"
      );
    }


    if (
      authorizationResult
        ?.executionStarted ===
      true
    ) {
      failures.push(
        "AUTHORIZATION_ENGINE_EXECUTED_INFRASTRUCTURE"
      );
    }


    if (
      !executionResult
    ) {
      failures.push(
        "EXECUTION_RESULT_MISSING"
      );
    }


    if (
      executionResult &&
      executionResult
        .success !==
        true &&
      String(
        executionResult
          .status ||
        ""
      )
        .toUpperCase() !==
        "SUCCEEDED"
    ) {
      failures.push(
        "CONTROLLED_EXECUTION_DID_NOT_SUCCEED"
      );
    }


    if (
      integrationResult
        ?.executionAuthorized ===
      true
    ) {
      failures.push(
        "PHASE20_RESULT_LEAKED_AUTHORITY"
      );
    }


    return Object.freeze({
      evaluatorVersion:
        VERSION,

      result:
        failures.length ===
          0
          ? "PASS"
          : "FAIL",

      failures,

      canonicalAuthorizationObserved:
        authorizationResult
          ?.authorizationGranted ===
        true,

      executionPlanObserved:
        Boolean(
          authorizationResult
            ?.executionPlan
            ?.planId &&
          authorizationResult
            ?.executionPlan
            ?.planHash
        ),

      controlledExecutionObserved:
        Boolean(
          executionResult
        ),

      productionCertified:
        false,

      executionAuthorized:
        false,
    });
  }
}


module.exports = {
  PositiveExecutionSafetyEvaluator,

  VERSION,
};