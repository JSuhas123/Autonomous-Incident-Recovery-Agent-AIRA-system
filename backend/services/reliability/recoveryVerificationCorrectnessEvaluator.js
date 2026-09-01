"use strict";

/**
 * ============================================================================
 * AIRA PHASE 21.17
 * RECOVERY VERIFICATION CORRECTNESS EVALUATOR
 * ============================================================================
 *
 * Purpose:
 *
 * Independently evaluate whether an executed recovery actually restored the
 * target system.
 *
 * CRITICAL SAFETY LAW:
 *
 *      command success != recovery success
 *
 * This evaluator:
 *
 * - never executes infrastructure changes
 * - never authorizes execution
 * - never closes an incident
 * - never performs rollback
 * - never grants production certification
 *
 * It may only classify independently observed evidence and recommend the
 * appropriate next action.
 * ============================================================================
 */


const VERIFICATION_OUTCOME =
  Object.freeze({
    VERIFIED_RECOVERY:
      "VERIFIED_RECOVERY",

    FAILED_RECOVERY:
      "FAILED_RECOVERY",

    INCONCLUSIVE:
      "INCONCLUSIVE",
  });


const NEXT_ACTION =
  Object.freeze({
    NONE:
      "NONE",

    ROLLBACK_REQUIRED:
      "ROLLBACK_REQUIRED",

    ESCALATION_REQUIRED:
      "ESCALATION_REQUIRED",

    RETRY_ELIGIBLE:
      "RETRY_ELIGIBLE",

    COLLECT_MORE_EVIDENCE:
      "COLLECT_MORE_EVIDENCE",
  });


const ASSERTION_STATUS =
  Object.freeze({
    PASS:
      "PASS",

    FAIL:
      "FAIL",

    UNKNOWN:
      "UNKNOWN",
  });


class RecoveryVerificationCorrectnessEvaluator {
  evaluate(
    input = {}
  ) {
    assertNoAuthorityLeak(
      input
    );


    const execution =
      normalizeExecution(
        input.execution
      );


    const before =
      normalizeObservation(
        input.before
      );


    const after =
      normalizeObservation(
        input.after
      );


    const stability =
      normalizeStability(
        input.stability
      );


    const recurrence =
      normalizeRecurrence(
        input.recurrence
      );


    const rollback =
      normalizeRollback(
        input.rollback
      );


    const assertions = [];


    // ------------------------------------------------------------------------
    // Execution observation
    // ------------------------------------------------------------------------

    assertions.push(
      assertion({
        name:
          "EXECUTION_OBSERVED",

        status:
          execution.executed ===
            true
            ? ASSERTION_STATUS.PASS
            : ASSERTION_STATUS.FAIL,

        expected:
          true,

        actual:
          execution.executed,

        reason:
          execution.executed ===
            true
            ? "A recovery execution was observed."
            : "No recovery execution was observed.",
      })
    );


    /*
     * This assertion is intentionally informational.
     *
     * A successful command is NOT sufficient to mark recovery verified.
     */
    assertions.push(
      assertion({
        name:
          "COMMAND_SUCCEEDED",

        status:
          execution.commandSucceeded ===
            true
            ? ASSERTION_STATUS.PASS
            : ASSERTION_STATUS.FAIL,

        expected:
          true,

        actual:
          execution.commandSucceeded,

        reason:
          execution.commandSucceeded ===
            true
            ? "The execution command reported success."
            : "The execution command did not report success.",
      })
    );


    // ------------------------------------------------------------------------
    // Independent observation
    // ------------------------------------------------------------------------

    const independentObservationPresent =
      after.observed ===
        true &&
      after.independent ===
        true;


    assertions.push(
      assertion({
        name:
          "INDEPENDENT_POST_ACTION_OBSERVATION",

        status:
          independentObservationPresent
            ? ASSERTION_STATUS.PASS
            : ASSERTION_STATUS.FAIL,

        expected:
          true,

        actual:
          independentObservationPresent,

        reason:
          independentObservationPresent
            ? "Post-action state was independently observed."
            : "Independent post-action observation is missing.",
      })
    );


    // ------------------------------------------------------------------------
    // Target health
    // ------------------------------------------------------------------------

    const healthyAfter =
      after.healthy;


    assertions.push(
      assertion({
        name:
          "TARGET_HEALTHY_AFTER_ACTION",

        status:
          healthyAfter ===
            true
            ? ASSERTION_STATUS.PASS
            : healthyAfter ===
                false
              ? ASSERTION_STATUS.FAIL
              : ASSERTION_STATUS.UNKNOWN,

        expected:
          true,

        actual:
          healthyAfter,

        reason:
          healthyAfter ===
            true
            ? "Target is healthy after recovery."
            : healthyAfter ===
                false
              ? "Target remains unhealthy after recovery."
              : "Target health could not be determined.",
      })
    );


    // ------------------------------------------------------------------------
    // Readiness
    // ------------------------------------------------------------------------

    assertions.push(
      assertion({
        name:
          "TARGET_READY_AFTER_ACTION",

        status:
          after.ready ===
            true
            ? ASSERTION_STATUS.PASS
            : after.ready ===
                false
              ? ASSERTION_STATUS.FAIL
              : ASSERTION_STATUS.UNKNOWN,

        expected:
          true,

        actual:
          after.ready,

        reason:
          after.ready ===
            true
            ? "Target reached Ready state."
            : after.ready ===
                false
              ? "Target did not reach Ready state."
              : "Readiness was not observed.",
      })
    );


    // ------------------------------------------------------------------------
    // Behavioral recovery
    // ------------------------------------------------------------------------

    assertions.push(
      assertion({
        name:
          "BEHAVIOR_RECOVERED",

        status:
          after.behaviorRecovered ===
            true
            ? ASSERTION_STATUS.PASS
            : after.behaviorRecovered ===
                false
              ? ASSERTION_STATUS.FAIL
              : ASSERTION_STATUS.UNKNOWN,

        expected:
          true,

        actual:
          after.behaviorRecovered,

        reason:
          after.behaviorRecovered ===
            true
            ? "Observed service behavior recovered."
            : after.behaviorRecovered ===
                false
              ? "Observed service behavior remains degraded."
              : "Behavioral recovery was not independently established.",
      })
    );


    // ------------------------------------------------------------------------
    // Dependency reachability
    // ------------------------------------------------------------------------

    assertions.push(
      assertion({
        name:
          "DEPENDENCIES_REACHABLE",

        status:
          after.dependenciesReachable ===
            true
            ? ASSERTION_STATUS.PASS
            : after.dependenciesReachable ===
                false
              ? ASSERTION_STATUS.FAIL
              : ASSERTION_STATUS.UNKNOWN,

        expected:
          true,

        actual:
          after.dependenciesReachable,

        reason:
          after.dependenciesReachable ===
            true
            ? "Required dependencies are reachable."
            : after.dependenciesReachable ===
                false
              ? "One or more required dependencies are unreachable."
              : "Dependency reachability was not established.",
      })
    );


    // ------------------------------------------------------------------------
    // Latency / SLO
    // ------------------------------------------------------------------------

    assertions.push(
      assertion({
        name:
          "LATENCY_ACCEPTABLE",

        status:
          after.latencyAcceptable ===
            true
            ? ASSERTION_STATUS.PASS
            : after.latencyAcceptable ===
                false
              ? ASSERTION_STATUS.FAIL
              : ASSERTION_STATUS.UNKNOWN,

        expected:
          true,

        actual:
          after.latencyAcceptable,

        reason:
          after.latencyAcceptable ===
            true
            ? "Post-recovery latency is within the accepted threshold."
            : after.latencyAcceptable ===
                false
              ? "Post-recovery latency exceeds the accepted threshold."
              : "Post-recovery latency was not established.",
      })
    );


    // ------------------------------------------------------------------------
    // Stability window
    // ------------------------------------------------------------------------

    const stabilityPassed =
      stability.observed ===
        true &&
      stability.stable ===
        true;


    assertions.push(
      assertion({
        name:
          "STABILITY_WINDOW_PASSED",

        status:
          stability.observed !==
            true
            ? ASSERTION_STATUS.UNKNOWN
            : stability.stable ===
                true
              ? ASSERTION_STATUS.PASS
              : ASSERTION_STATUS.FAIL,

        expected:
          true,

        actual:
          stabilityPassed,

        reason:
          stability.observed !==
            true
            ? "Required stability window was not observed."
            : stability.stable ===
                true
              ? "Target remained stable for the verification window."
              : "Target became unstable during the verification window.",
      })
    );


    // ------------------------------------------------------------------------
    // Recurrence
    // ------------------------------------------------------------------------

    assertions.push(
      assertion({
        name:
          "NO_IMMEDIATE_RECURRENCE",

        status:
          recurrence.observed !==
            true
            ? ASSERTION_STATUS.UNKNOWN
            : recurrence.detected ===
                false
              ? ASSERTION_STATUS.PASS
              : ASSERTION_STATUS.FAIL,

        expected:
          false,

        actual:
          recurrence.detected,

        reason:
          recurrence.observed !==
            true
            ? "Recurrence window was not observed."
            : recurrence.detected ===
                true
              ? "Failure recurrence was detected."
              : "No immediate failure recurrence was detected.",
      })
    );


    const hardFailure =
      execution.executed !==
        true ||
      execution.commandSucceeded !==
        true ||
      after.healthy ===
        false ||
      after.ready ===
        false ||
      after.behaviorRecovered ===
        false ||
      after.dependenciesReachable ===
        false ||
      after.latencyAcceptable ===
        false ||
      stability.stable ===
        false ||
      recurrence.detected ===
        true;


    const unknownEvidence =
      independentObservationPresent !==
        true ||
      after.healthy ===
        null ||
      after.ready ===
        null ||
      after.behaviorRecovered ===
        null ||
      after.dependenciesReachable ===
        null ||
      after.latencyAcceptable ===
        null ||
      stability.observed !==
        true ||
      recurrence.observed !==
        true;


    let outcome;


    if (
      hardFailure
    ) {
      outcome =
        VERIFICATION_OUTCOME
          .FAILED_RECOVERY;
    } else if (
      unknownEvidence
    ) {
      outcome =
        VERIFICATION_OUTCOME
          .INCONCLUSIVE;
    } else {
      outcome =
        VERIFICATION_OUTCOME
          .VERIFIED_RECOVERY;
    }


    const nextAction =
      determineNextAction({
        outcome,

        execution,

        rollback,

        recurrence,
      });


    const recovered =
      outcome ===
      VERIFICATION_OUTCOME
        .VERIFIED_RECOVERY;


    const recoveryConfirmed =
      recovered;


    const incidentClosureEligible =
      recovered;


    const rollbackRequired =
      nextAction ===
      NEXT_ACTION
        .ROLLBACK_REQUIRED;


    const escalationRequired =
      nextAction ===
      NEXT_ACTION
        .ESCALATION_REQUIRED;


    const retryEligible =
      nextAction ===
      NEXT_ACTION
        .RETRY_ELIGIBLE;


    const result = {
      phase:
        "21.17",

      evaluator:
        "RecoveryVerificationCorrectnessEvaluator",

      outcome,

      recovered,

      recoveryConfirmed,

      incidentClosureEligible,

      nextAction,

      rollbackRequired,

      escalationRequired,

      retryEligible,

      commandSucceeded:
        execution.commandSucceeded,

      independentVerificationObserved:
        independentObservationPresent,

      recurrenceDetected:
        recurrence.detected ===
        true,

      assertions,

      summary:
        buildSummary({
          outcome,

          nextAction,

          execution,

          recurrence,
        }),

      /*
       * Phase 21 evaluation evidence is NEVER authority.
       */
      executionAuthorized:
        false,

      productionCertified:
        false,
    };


    assertResultSafety(
      result
    );


    return Object.freeze(
      result
    );
  }
}


// ============================================================================
// DECISION LOGIC
// ============================================================================

function determineNextAction({
  outcome,
  execution,
  rollback,
  recurrence,
}) {
  if (
    outcome ===
    VERIFICATION_OUTCOME
      .VERIFIED_RECOVERY
  ) {
    return NEXT_ACTION
      .NONE;
  }


  if (
    outcome ===
    VERIFICATION_OUTCOME
      .INCONCLUSIVE
  ) {
    return NEXT_ACTION
      .COLLECT_MORE_EVIDENCE;
  }


  /*
   * Execution never happened.
   *
   * There is nothing to rollback.
   */
  if (
    execution.executed !==
      true
  ) {
    return NEXT_ACTION
      .ESCALATION_REQUIRED;
  }


  /*
   * If the action executed and the resulting state is unhealthy, rollback is
   * preferred only when rollback is explicitly known to be available and safe.
   */
  if (
    rollback.available ===
      true &&
    rollback.safe ===
      true
  ) {
    return NEXT_ACTION
      .ROLLBACK_REQUIRED;
  }


  /*
   * A recurrence can be retry-eligible only when explicitly declared safe.
   * The evaluator does not perform the retry.
   */
  if (
    recurrence.detected ===
      true &&
    recurrence.retrySafe ===
      true
  ) {
    return NEXT_ACTION
      .RETRY_ELIGIBLE;
  }


  return NEXT_ACTION
    .ESCALATION_REQUIRED;
}


// ============================================================================
// NORMALIZATION
// ============================================================================

function normalizeExecution(
  value
) {
  const input =
    isObject(
      value
    )
      ? value
      : {};


  return Object.freeze({
    executed:
      toBooleanOrNull(
        input.executed
      ) ===
        true,

    commandSucceeded:
      toBooleanOrNull(
        input.commandSucceeded ??
        input.success
      ) ===
        true,

    executionId:
      optionalText(
        input.executionId
      ),

    authorizationId:
      optionalText(
        input.authorizationId
      ),

    executionRequestId:
      optionalText(
        input.executionRequestId
      ),
  });
}


function normalizeObservation(
  value
) {
  const input =
    isObject(
      value
    )
      ? value
      : {};


  return Object.freeze({
    observed:
      toBooleanOrNull(
        input.observed
      ) ===
        true,

    independent:
      toBooleanOrNull(
        input.independent
      ) ===
        true,

    healthy:
      toBooleanOrNull(
        input.healthy
      ),

    ready:
      toBooleanOrNull(
        input.ready
      ),

    behaviorRecovered:
      toBooleanOrNull(
        input.behaviorRecovered
      ),

    dependenciesReachable:
      toBooleanOrNull(
        input.dependenciesReachable
      ),

    latencyAcceptable:
      toBooleanOrNull(
        input.latencyAcceptable
      ),

    observedAt:
      normalizeTimestamp(
        input.observedAt
      ),

    evidence:
      cloneJson(
        input.evidence
      ),
  });
}


function normalizeStability(
  value
) {
  const input =
    isObject(
      value
    )
      ? value
      : {};


  return Object.freeze({
    observed:
      toBooleanOrNull(
        input.observed
      ) ===
        true,

    stable:
      toBooleanOrNull(
        input.stable
      ),

    windowMs:
      normalizeNonNegativeNumber(
        input.windowMs
      ),
  });
}


function normalizeRecurrence(
  value
) {
  const input =
    isObject(
      value
    )
      ? value
      : {};


  return Object.freeze({
    observed:
      toBooleanOrNull(
        input.observed
      ) ===
        true,

    detected:
      toBooleanOrNull(
        input.detected
      ),

    retrySafe:
      toBooleanOrNull(
        input.retrySafe
      ) ===
        true,

    windowMs:
      normalizeNonNegativeNumber(
        input.windowMs
      ),
  });
}


function normalizeRollback(
  value
) {
  const input =
    isObject(
      value
    )
      ? value
      : {};


  return Object.freeze({
    available:
      toBooleanOrNull(
        input.available
      ) ===
        true,

    safe:
      toBooleanOrNull(
        input.safe
      ) ===
        true,

    strategy:
      optionalText(
        input.strategy
      ),
  });
}


// ============================================================================
// ASSERTIONS
// ============================================================================

function assertion({
  name,
  status,
  expected,
  actual,
  reason,
}) {
  return Object.freeze({
    name,

    status,

    passed:
      status ===
      ASSERTION_STATUS
        .PASS,

    expected,

    actual,

    reason,

    executionAuthorized:
      false,
  });
}


// ============================================================================
// SAFETY
// ============================================================================

function assertNoAuthorityLeak(
  input
) {
  const dangerous =
    [
      input.executionAuthorized,
      input.authorizedByPhase21,
      input.productionCertified,
      input?.groundTruth?.executionAuthorized,
      input?.groundTruth?.authorized,
    ];


  if (
    dangerous.some(
      value =>
        value ===
        true
    )
  ) {
    throw evaluatorError(
      "PHASE21_VERIFICATION_AUTHORITY_LEAK",
      "Recovery verification evidence cannot grant execution or production authority"
    );
  }
}


function assertResultSafety(
  result
) {
  if (
    result.executionAuthorized ===
      true ||
    result.productionCertified ===
      true
  ) {
    throw evaluatorError(
      "PHASE21_VERIFICATION_RESULT_AUTHORITY_LEAK",
      "Recovery verification result leaked authority"
    );
  }


  if (
    result.outcome !==
      VERIFICATION_OUTCOME
        .VERIFIED_RECOVERY &&
    (
      result.recovered ===
        true ||
      result.recoveryConfirmed ===
        true ||
      result.incidentClosureEligible ===
        true
    )
  ) {
    throw evaluatorError(
      "PHASE21_FALSE_RECOVERY",
      "Failed or inconclusive recovery cannot be reported as recovered"
    );
  }
}


// ============================================================================
// SUMMARY
// ============================================================================

function buildSummary({
  outcome,
  nextAction,
  execution,
  recurrence,
}) {
  if (
    outcome ===
    VERIFICATION_OUTCOME
      .VERIFIED_RECOVERY
  ) {
    return "Recovery independently verified; target is stable and no immediate recurrence was observed.";
  }


  if (
    outcome ===
    VERIFICATION_OUTCOME
      .INCONCLUSIVE
  ) {
    return "Recovery cannot be confirmed because required independent verification evidence is incomplete.";
  }


  if (
    execution.commandSucceeded ===
      true
  ) {
    if (
      recurrence.detected ===
        true
    ) {
      return `Execution command succeeded but recovery verification failed because the failure recurred; next action=${nextAction}.`;
    }


    return `Execution command succeeded but independent verification did not confirm recovery; next action=${nextAction}.`;
  }


  return `Recovery verification failed; next action=${nextAction}.`;
}


// ============================================================================
// HELPERS
// ============================================================================

function isObject(
  value
) {
  return Boolean(
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  );
}


function toBooleanOrNull(
  value
) {
  if (
    value ===
      true ||
    value ===
      false
  ) {
    return value;
  }


  return null;
}


function optionalText(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }


  const text =
    String(
      value
    )
      .trim();


  return text ||
    null;
}


function normalizeTimestamp(
  value
) {
  if (
    !value
  ) {
    return null;
  }


  const date =
    new Date(
      value
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }


  return date
    .toISOString();
}


function normalizeNonNegativeNumber(
  value
) {
  const number =
    Number(
      value
    );


  if (
    !Number.isFinite(
      number
    ) ||
    number <
      0
  ) {
    return null;
  }


  return number;
}


function cloneJson(
  value
) {
  if (
    value ===
      undefined
  ) {
    return null;
  }


  try {
    return JSON.parse(
      JSON.stringify(
        value
      )
    );
  } catch {
    return null;
  }
}


function evaluatorError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "RecoveryVerificationCorrectnessEvaluatorError",

      code,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  RecoveryVerificationCorrectnessEvaluator,

  VERIFICATION_OUTCOME,

  NEXT_ACTION,

  ASSERTION_STATUS,
};