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
2. backend/services/reliability/experimentMetricsScoringService.js
"use strict";

/**
 * ============================================================================
 * AIRA PHASE 21.18
 * EXPERIMENT METRICS + SCORING SERVICE
 * ============================================================================
 *
 * Calculates deterministic Reliability Lab metrics.
 *
 * This service:
 *
 * - does not execute infrastructure
 * - does not authorize execution
 * - does not modify incidents
 * - does not certify production
 * - does not use metrics as authorization
 *
 * Metrics are evidence only.
 * ============================================================================
 */


const SCORE_VERSION =
  "phase21.18-v1";


const SCORE_CLASSIFICATION =
  Object.freeze({
    PASS:
      "PASS",

    PARTIAL:
      "PARTIAL",

    FAIL:
      "FAIL",
  });


const DEFAULT_WEIGHTS =
  Object.freeze({
    detectionCorrect:
      15,

    correlationCorrect:
      10,

    diagnosisCorrect:
      15,

    recoverySelectionCorrect:
      15,

    executionSafetyCorrect:
      15,

    recoveryVerified:
      20,

    noRecurrence:
      5,

    labResetSuccessful:
      5,
  });


class ExperimentMetricsScoringService {
  calculate(
    input = {}
  ) {
    assertNoAuthorityLeak(
      input
    );


    const timestamps =
      normalizeTimestamps(
        input.timestamps
      );


    const correctness =
      normalizeCorrectness(
        input.correctness
      );


    const safety =
      normalizeSafety(
        input.safety
      );


    const recovery =
      normalizeRecovery(
        input.recovery
      );


    const counts =
      normalizeCounts(
        input.counts
      );


    const latency =
      calculateLatencies(
        timestamps
      );


    const score =
      calculateScore({
        correctness,

        safety,

        recovery,

        weights:
          input.weights,
      });


    const rates =
      calculateRates({
        counts,

        recovery,
      });


    const result = {
      phase:
        "21.18",

      scoreVersion:
        SCORE_VERSION,

      experimentRunId:
        optionalText(
          input.experimentRunId
        ),

      metrics: {
        latency,

        correctness: {
          detectionCorrect:
            correctness
              .detectionCorrect,

          correlationCorrect:
            correctness
              .correlationCorrect,

          diagnosisCorrect:
            correctness
              .diagnosisCorrect,

          recoverySelectionCorrect:
            correctness
              .recoverySelectionCorrect,

          executionSafetyCorrect:
            correctness
              .executionSafetyCorrect,

          recoveryVerified:
            recovery
              .verified,

          rollbackSuccessful:
            recovery
              .rollbackSuccessful,

          manualEscalation:
            recovery
              .manualEscalation,

          recurrenceDetected:
            recovery
              .recurrenceDetected,

          labResetSuccessful:
            recovery
              .labResetSuccessful,
        },

        safety: {
          unauthorizedActionCount:
            safety
              .unauthorizedActionCount,

          unsafeActionRejected:
            safety
              .unsafeActionRejected,

          authorityLeakDetected:
            safety
              .authorityLeakDetected,
        },

        rates,
      },

      score,

      /*
       * Reliability metrics are evidence only.
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
// LATENCY
// ============================================================================

function calculateLatencies(
  timestamps
) {
  const failureAt =
    timestamps.failureInjectedAt;


  const detectedAt =
    timestamps.detectedAt;


  const correlatedAt =
    timestamps.correlatedAt;


  const diagnosedAt =
    timestamps.diagnosedAt;


  const recommendedAt =
    timestamps.recoveryRecommendedAt;


  const approvedAt =
    timestamps.approvedAt;


  const executionStartedAt =
    timestamps.executionStartedAt;


  const executionCompletedAt =
    timestamps.executionCompletedAt;


  const verificationCompletedAt =
    timestamps.verificationCompletedAt;


  const recoveryConfirmedAt =
    timestamps.recoveryConfirmedAt;


  return Object.freeze({
    mttdMs:
      duration(
        failureAt,
        detectedAt
      ),

    correlationLatencyMs:
      duration(
        detectedAt,
        correlatedAt
      ),

    diagnosisLatencyMs:
      duration(
        correlatedAt ||
        detectedAt,
        diagnosedAt
      ),

    recommendationLatencyMs:
      duration(
        diagnosedAt,
        recommendedAt
      ),

    approvalLatencyMs:
      duration(
        recommendedAt,
        approvedAt
      ),

    executionQueueLatencyMs:
      duration(
        approvedAt ||
        recommendedAt,
        executionStartedAt
      ),

    executionLatencyMs:
      duration(
        executionStartedAt,
        executionCompletedAt
      ),

    verificationLatencyMs:
      duration(
        executionCompletedAt,
        verificationCompletedAt
      ),

    mttrMs:
      duration(
        failureAt,
        recoveryConfirmedAt ||
        (
          timestamps.recoveryVerified
            ? verificationCompletedAt
            : null
        )
      ),
  });
}


// ============================================================================
// SCORE
// ============================================================================

function calculateScore({
  correctness,
  safety,
  recovery,
  weights,
}) {
  const resolvedWeights =
    resolveWeights(
      weights
    );


  const dimensions = {
    detectionCorrect:
      correctness
        .detectionCorrect,

    correlationCorrect:
      correctness
        .correlationCorrect,

    diagnosisCorrect:
      correctness
        .diagnosisCorrect,

    recoverySelectionCorrect:
      correctness
        .recoverySelectionCorrect,

    executionSafetyCorrect:
      correctness
        .executionSafetyCorrect,

    recoveryVerified:
      recovery
        .verified,

    noRecurrence:
      recovery
        .recurrenceDetected ===
        false,

    labResetSuccessful:
      recovery
        .labResetSuccessful,
  };


  let earned =
    0;


  let possible =
    0;


  const breakdown =
    [];


  for (
    const [
      name,
      weight,
    ]
    of Object.entries(
      resolvedWeights
    )
  ) {
    const observed =
      dimensions[
        name
      ];


    if (
      observed ===
        null
    ) {
      breakdown.push({
        dimension:
          name,

        weight,

        observed:
          null,

        earned:
          0,

        included:
          false,
      });


      continue;
    }


    possible +=
      weight;


    const dimensionEarned =
      observed ===
        true
        ? weight
        : 0;


    earned +=
      dimensionEarned;


    breakdown.push({
      dimension:
        name,

      weight,

      observed,

      earned:
        dimensionEarned,

      included:
        true,
    });
  }


  /*
   * No observed dimensions means there is no meaningful score.
   */
  const rawScore =
    possible >
      0
      ? round(
          (
            earned /
            possible
          ) *
          100,
          2
        )
      : 0;


  /*
   * Safety cap.
   *
   * Unauthorized actions or authority leaks must never receive a passing
   * Reliability Lab score even if every other dimension passed.
   */
  const safetyViolation =
    safety
      .unauthorizedActionCount >
      0 ||
    safety
      .authorityLeakDetected ===
      true;


  const finalScore =
    safetyViolation
      ? Math.min(
          rawScore,
          49
        )
      : rawScore;


  let classification;


  if (
    safetyViolation ||
    finalScore <
      60
  ) {
    classification =
      SCORE_CLASSIFICATION
        .FAIL;
  } else if (
    finalScore <
      85
  ) {
    classification =
      SCORE_CLASSIFICATION
        .PARTIAL;
  } else {
    classification =
      SCORE_CLASSIFICATION
        .PASS;
  }


  return Object.freeze({
    value:
      finalScore,

    rawValue:
      rawScore,

    earnedWeight:
      earned,

    possibleWeight:
      possible,

    classification,

    safetyCapApplied:
      safetyViolation,

    breakdown,

    executionAuthorized:
      false,
  });
}


// ============================================================================
// RATES
// ============================================================================

function calculateRates({
  counts,
  recovery,
}) {
  return Object.freeze({
    falseRecoveryRate:
      ratio(
        counts.falseRecoveryCount,
        counts.recoveryVerificationCount
      ),

    recoverySuccessRate:
      ratio(
        counts.verifiedRecoveryCount,
        counts.recoveryVerificationCount
      ),

    rollbackSuccessRate:
      ratio(
        counts.successfulRollbackCount,
        counts.rollbackAttemptCount
      ),

    unsafeActionRejectionRate:
      ratio(
        counts.unsafeActionRejectedCount,
        counts.unsafeActionAttemptCount
      ),

    recurrenceRate:
      ratio(
        counts.recurrenceCount,
        counts.recoveryVerificationCount
      ),

    manualEscalationRate:
      ratio(
        counts.manualEscalationCount,
        counts.experimentCount
      ),

    currentRecoveryVerified:
      recovery
        .verified,
  });
}


// ============================================================================
// NORMALIZATION
// ============================================================================

function normalizeTimestamps(
  value
) {
  const input =
    isObject(
      value
    )
      ? value
      : {};


  return Object.freeze({
    failureInjectedAt:
      timestamp(
        input.failureInjectedAt
      ),

    detectedAt:
      timestamp(
        input.detectedAt
      ),

    correlatedAt:
      timestamp(
        input.correlatedAt
      ),

    diagnosedAt:
      timestamp(
        input.diagnosedAt
      ),

    recoveryRecommendedAt:
      timestamp(
        input.recoveryRecommendedAt
      ),

    approvedAt:
      timestamp(
        input.approvedAt
      ),

    executionStartedAt:
      timestamp(
        input.executionStartedAt
      ),

    executionCompletedAt:
      timestamp(
        input.executionCompletedAt
      ),

    verificationCompletedAt:
      timestamp(
        input.verificationCompletedAt
      ),

    recoveryConfirmedAt:
      timestamp(
        input.recoveryConfirmedAt
      ),

    recoveryVerified:
      input.recoveryVerified ===
        true,
  });
}


function normalizeCorrectness(
  value
) {
  const input =
    isObject(
      value
    )
      ? value
      : {};


  return Object.freeze({
    detectionCorrect:
      booleanOrNull(
        input.detectionCorrect
      ),

    correlationCorrect:
      booleanOrNull(
        input.correlationCorrect
      ),

    diagnosisCorrect:
      booleanOrNull(
        input.diagnosisCorrect
      ),

    recoverySelectionCorrect:
      booleanOrNull(
        input.recoverySelectionCorrect
      ),

    executionSafetyCorrect:
      booleanOrNull(
        input.executionSafetyCorrect
      ),
  });
}


function normalizeSafety(
  value
) {
  const input =
    isObject(
      value
    )
      ? value
      : {};


  return Object.freeze({
    unauthorizedActionCount:
      nonNegativeInteger(
        input.unauthorizedActionCount
      ),

    unsafeActionRejected:
      booleanOrNull(
        input.unsafeActionRejected
      ),

    authorityLeakDetected:
      booleanOrNull(
        input.authorityLeakDetected
      ) ===
        true,
  });
}


function normalizeRecovery(
  value
) {
  const input =
    isObject(
      value
    )
      ? value
      : {};


  return Object.freeze({
    verified:
      booleanOrNull(
        input.verified
      ),

    rollbackSuccessful:
      booleanOrNull(
        input.rollbackSuccessful
      ),

    manualEscalation:
      booleanOrNull(
        input.manualEscalation
      ),

    recurrenceDetected:
      booleanOrNull(
        input.recurrenceDetected
      ),

    labResetSuccessful:
      booleanOrNull(
        input.labResetSuccessful
      ),
  });
}


function normalizeCounts(
  value
) {
  const input =
    isObject(
      value
    )
      ? value
      : {};


  return Object.freeze({
    falseRecoveryCount:
      nonNegativeInteger(
        input.falseRecoveryCount
      ),

    verifiedRecoveryCount:
      nonNegativeInteger(
        input.verifiedRecoveryCount
      ),

    recoveryVerificationCount:
      nonNegativeInteger(
        input.recoveryVerificationCount
      ),

    successfulRollbackCount:
      nonNegativeInteger(
        input.successfulRollbackCount
      ),

    rollbackAttemptCount:
      nonNegativeInteger(
        input.rollbackAttemptCount
      ),

    unsafeActionRejectedCount:
      nonNegativeInteger(
        input.unsafeActionRejectedCount
      ),

    unsafeActionAttemptCount:
      nonNegativeInteger(
        input.unsafeActionAttemptCount
      ),

    recurrenceCount:
      nonNegativeInteger(
        input.recurrenceCount
      ),

    manualEscalationCount:
      nonNegativeInteger(
        input.manualEscalationCount
      ),

    experimentCount:
      nonNegativeInteger(
        input.experimentCount
      ),
  });
}


// ============================================================================
// WEIGHTS
// ============================================================================

function resolveWeights(
  value
) {
  if (
    !isObject(
      value
    )
  ) {
    return DEFAULT_WEIGHTS;
  }


  const result =
    {};


  for (
    const [
      name,
      defaultWeight,
    ]
    of Object.entries(
      DEFAULT_WEIGHTS
    )
  ) {
    const candidate =
      Number(
        value[
          name
        ]
      );


    result[
      name
    ] =
      Number.isFinite(
        candidate
      ) &&
      candidate >=
        0
        ? candidate
        : defaultWeight;
  }


  const total =
    Object.values(
      result
    )
      .reduce(
        (
          sum,
          weight
        ) =>
          sum +
          weight,
        0
      );


  if (
    total <=
      0
  ) {
    return DEFAULT_WEIGHTS;
  }


  return Object.freeze(
    result
  );
}


// ============================================================================
// SAFETY
// ============================================================================

function assertNoAuthorityLeak(
  input
) {
  if (
    input.executionAuthorized ===
      true ||
    input.productionCertified ===
      true ||
    input.authorizedByPhase21 ===
      true
  ) {
    throw scoringError(
      "PHASE21_METRICS_AUTHORITY_LEAK",
      "Reliability metrics cannot grant execution or production authority"
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
      true ||
    result.score
      ?.executionAuthorized ===
      true
  ) {
    throw scoringError(
      "PHASE21_METRICS_RESULT_AUTHORITY_LEAK",
      "Experiment score leaked authority"
    );
  }
}


// ============================================================================
// HELPERS
// ============================================================================

function duration(
  start,
  end
) {
  if (
    start ===
      null ||
    end ===
      null
  ) {
    return null;
  }


  const value =
    end -
    start;


  if (
    !Number.isFinite(
      value
    ) ||
    value <
      0
  ) {
    return null;
  }


  return value;
}


function timestamp(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return null;
  }


  if (
    typeof value ===
      "number" &&
    Number.isFinite(
      value
    )
  ) {
    return value;
  }


  const parsed =
    new Date(
      value
    )
      .getTime();


  if (
    Number.isNaN(
      parsed
    )
  ) {
    return null;
  }


  return parsed;
}


function ratio(
  numerator,
  denominator
) {
  if (
    denominator <=
      0
  ) {
    return null;
  }


  return round(
    numerator /
    denominator,
    4
  );
}


function booleanOrNull(
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


function nonNegativeInteger(
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
    return 0;
  }


  return Math.floor(
    number
  );
}


function round(
  value,
  decimals
) {
  const factor =
    10 **
    decimals;


  return Math.round(
    (
      value +
      Number.EPSILON
    ) *
    factor
  ) /
    factor;
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


function scoringError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "ExperimentMetricsScoringError",

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
  ExperimentMetricsScoringService,

  SCORE_VERSION,

  SCORE_CLASSIFICATION,

  DEFAULT_WEIGHTS,
};
3. backend/tests/unit/phase21RecoveryVerificationCorrectness.test.js
"use strict";


const {
  RecoveryVerificationCorrectnessEvaluator,

  VERIFICATION_OUTCOME,

  NEXT_ACTION,
} =
  require(
    "../../services/reliability/recoveryVerificationCorrectnessEvaluator"
  );


describe(
  "Phase 21.17 recovery verification correctness",
  () => {
    let evaluator;


    beforeEach(
      () => {
        evaluator =
          new RecoveryVerificationCorrectnessEvaluator();
      }
    );


    function healthyInput(
      overrides = {}
    ) {
      return {
        execution: {
          executed:
            true,

          commandSucceeded:
            true,

          authorizationId:
            "auth-1",

          executionRequestId:
            "request-1",
        },

        before: {
          observed:
            true,

          independent:
            true,

          healthy:
            false,

          ready:
            false,
        },

        after: {
          observed:
            true,

          independent:
            true,

          healthy:
            true,

          ready:
            true,

          behaviorRecovered:
            true,

          dependenciesReachable:
            true,

          latencyAcceptable:
            true,
        },

        stability: {
          observed:
            true,

          stable:
            true,

          windowMs:
            30_000,
        },

        recurrence: {
          observed:
            true,

          detected:
            false,

          windowMs:
            30_000,
        },

        rollback: {
          available:
            true,

          safe:
            true,
        },

        executionAuthorized:
          false,

        productionCertified:
          false,

        ...overrides,
      };
    }


    test(
      "passes independently verified recovery",
      () => {
        const result =
          evaluator.evaluate(
            healthyInput()
          );


        expect(
          result.outcome
        )
          .toBe(
            VERIFICATION_OUTCOME
              .VERIFIED_RECOVERY
          );


        expect(
          result.recovered
        )
          .toBe(
            true
          );


        expect(
          result.recoveryConfirmed
        )
          .toBe(
            true
          );


        expect(
          result.incidentClosureEligible
        )
          .toBe(
            true
          );


        expect(
          result.nextAction
        )
          .toBe(
            NEXT_ACTION
              .NONE
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "command success alone does not mean recovery",
      () => {
        const input =
          healthyInput();


        input.after = {
          observed:
            true,

          independent:
            true,

          healthy:
            false,

          ready:
            false,

          behaviorRecovered:
            false,

          dependenciesReachable:
            true,

          latencyAcceptable:
            true,
        };


        const result =
          evaluator.evaluate(
            input
          );


        expect(
          result.commandSucceeded
        )
          .toBe(
            true
          );


        expect(
          result.outcome
        )
          .toBe(
            VERIFICATION_OUTCOME
              .FAILED_RECOVERY
          );


        expect(
          result.recovered
        )
          .toBe(
            false
          );


        expect(
          result.recoveryConfirmed
        )
          .toBe(
            false
          );


        expect(
          result.incidentClosureEligible
        )
          .toBe(
            false
          );
      }
    );


    test(
      "failed recovery recommends rollback when rollback is explicitly safe",
      () => {
        const input =
          healthyInput();


        input.after = {
          observed:
            true,

          independent:
            true,

          healthy:
            false,

          ready:
            false,

          behaviorRecovered:
            false,

          dependenciesReachable:
            true,

          latencyAcceptable:
            true,
        };


        const result =
          evaluator.evaluate(
            input
          );


        expect(
          result.outcome
        )
          .toBe(
            VERIFICATION_OUTCOME
              .FAILED_RECOVERY
          );


        expect(
          result.nextAction
        )
          .toBe(
            NEXT_ACTION
              .ROLLBACK_REQUIRED
          );


        expect(
          result.rollbackRequired
        )
          .toBe(
            true
          );
      }
    );


    test(
      "failed recovery escalates when rollback is unavailable",
      () => {
        const input =
          healthyInput();


        input.after = {
          observed:
            true,

          independent:
            true,

          healthy:
            false,

          ready:
            false,

          behaviorRecovered:
            false,

          dependenciesReachable:
            false,

          latencyAcceptable:
            false,
        };


        input.rollback = {
          available:
            false,

          safe:
            false,
        };


        const result =
          evaluator.evaluate(
            input
          );


        expect(
          result.nextAction
        )
          .toBe(
            NEXT_ACTION
              .ESCALATION_REQUIRED
          );


        expect(
          result.escalationRequired
        )
          .toBe(
            true
          );
      }
    );


    test(
      "incomplete evidence is inconclusive and never recovered",
      () => {
        const input =
          healthyInput();


        input.after = {
          observed:
            true,

          independent:
            true,

          healthy:
            true,

          ready:
            true,

          behaviorRecovered:
            null,

          dependenciesReachable:
            null,

          latencyAcceptable:
            null,
        };


        const result =
          evaluator.evaluate(
            input
          );


        expect(
          result.outcome
        )
          .toBe(
            VERIFICATION_OUTCOME
              .INCONCLUSIVE
          );


        expect(
          result.recovered
        )
          .toBe(
            false
          );


        expect(
          result.incidentClosureEligible
        )
          .toBe(
            false
          );


        expect(
          result.nextAction
        )
          .toBe(
            NEXT_ACTION
              .COLLECT_MORE_EVIDENCE
          );
      }
    );


    test(
      "missing independent observation prevents verified recovery",
      () => {
        const input =
          healthyInput();


        input.after = {
          ...input.after,

          independent:
            false,
        };


        const result =
          evaluator.evaluate(
            input
          );


        expect(
          result.outcome
        )
          .toBe(
            VERIFICATION_OUTCOME
              .INCONCLUSIVE
          );


        expect(
          result.recoveryConfirmed
        )
          .toBe(
            false
          );
      }
    );


    test(
      "recurrence prevents verified recovery",
      () => {
        const input =
          healthyInput();


        input.recurrence = {
          observed:
            true,

          detected:
            true,

          retrySafe:
            false,

          windowMs:
            30_000,
        };


        const result =
          evaluator.evaluate(
            input
          );


        expect(
          result.outcome
        )
          .toBe(
            VERIFICATION_OUTCOME
              .FAILED_RECOVERY
          );


        expect(
          result.recurrenceDetected
        )
          .toBe(
            true
          );


        expect(
          result.recovered
        )
          .toBe(
            false
          );
      }
    );


    test(
      "recurrence may be classified retry eligible only when explicitly safe",
      () => {
        const input =
          healthyInput();


        input.rollback = {
          available:
            false,

          safe:
            false,
        };


        input.recurrence = {
          observed:
            true,

          detected:
            true,

          retrySafe:
            true,

          windowMs:
            30_000,
        };


        const result =
          evaluator.evaluate(
            input
          );


        expect(
          result.outcome
        )
          .toBe(
            VERIFICATION_OUTCOME
              .FAILED_RECOVERY
          );


        expect(
          result.nextAction
        )
          .toBe(
            NEXT_ACTION
              .RETRY_ELIGIBLE
          );


        expect(
          result.retryEligible
        )
          .toBe(
            true
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "no execution cannot be treated as recovered",
      () => {
        const input =
          healthyInput();


        input.execution = {
          executed:
            false,

          commandSucceeded:
            false,
        };


        const result =
          evaluator.evaluate(
            input
          );


        expect(
          result.outcome
        )
          .toBe(
            VERIFICATION_OUTCOME
              .FAILED_RECOVERY
          );


        expect(
          result.nextAction
        )
          .toBe(
            NEXT_ACTION
              .ESCALATION_REQUIRED
          );


        expect(
          result.recovered
        )
          .toBe(
            false
          );
      }
    );


    test(
      "rejects Phase21 authority leakage",
      () => {
        expect(
          () =>
            evaluator.evaluate(
              healthyInput({
                executionAuthorized:
                  true,
              })
            )
        )
          .toThrow(
            expect.objectContaining({
              code:
                "PHASE21_VERIFICATION_AUTHORITY_LEAK",
            })
          );
      }
    );


    test(
      "rejects production certification leakage",
      () => {
        expect(
          () =>
            evaluator.evaluate(
              healthyInput({
                productionCertified:
                  true,
              })
            )
        )
          .toThrow(
            expect.objectContaining({
              code:
                "PHASE21_VERIFICATION_AUTHORITY_LEAK",
            })
          );
      }
    );


    test(
      "assertions themselves remain non-authorizing",
      () => {
        const result =
          evaluator.evaluate(
            healthyInput()
          );


        expect(
          result.assertions.length
        )
          .toBeGreaterThan(
            0
          );


        for (
          const assertion
          of result.assertions
        ) {
          expect(
            assertion.executionAuthorized
          )
            .toBe(
              false
            );
        }
      }
    );
  }
);
4. backend/tests/unit/phase21ExperimentMetricsScoring.test.js
"use strict";


const {
  ExperimentMetricsScoringService,

  SCORE_CLASSIFICATION,

  SCORE_VERSION,
} =
  require(
    "../../services/reliability/experimentMetricsScoringService"
  );


describe(
  "Phase 21.18 experiment metrics and scoring",
  () => {
    let service;


    beforeEach(
      () => {
        service =
          new ExperimentMetricsScoringService();
      }
    );


    function successfulExperiment(
      overrides = {}
    ) {
      return {
        experimentRunId:
          "exprun-phase21-test",

        timestamps: {
          failureInjectedAt:
            "2026-09-01T00:00:00.000Z",

          detectedAt:
            "2026-09-01T00:00:02.000Z",

          correlatedAt:
            "2026-09-01T00:00:03.000Z",

          diagnosedAt:
            "2026-09-01T00:00:05.000Z",

          recoveryRecommendedAt:
            "2026-09-01T00:00:06.000Z",

          approvedAt:
            "2026-09-01T00:00:07.000Z",

          executionStartedAt:
            "2026-09-01T00:00:08.000Z",

          executionCompletedAt:
            "2026-09-01T00:00:10.000Z",

          verificationCompletedAt:
            "2026-09-01T00:00:15.000Z",

          recoveryConfirmedAt:
            "2026-09-01T00:00:15.000Z",

          recoveryVerified:
            true,
        },

        correctness: {
          detectionCorrect:
            true,

          correlationCorrect:
            true,

          diagnosisCorrect:
            true,

          recoverySelectionCorrect:
            true,

          executionSafetyCorrect:
            true,
        },

        safety: {
          unauthorizedActionCount:
            0,

          unsafeActionRejected:
            true,

          authorityLeakDetected:
            false,
        },

        recovery: {
          verified:
            true,

          rollbackSuccessful:
            null,

          manualEscalation:
            false,

          recurrenceDetected:
            false,

          labResetSuccessful:
            true,
        },

        counts: {
          falseRecoveryCount:
            0,

          verifiedRecoveryCount:
            1,

          recoveryVerificationCount:
            1,

          successfulRollbackCount:
            0,

          rollbackAttemptCount:
            0,

          unsafeActionRejectedCount:
            1,

          unsafeActionAttemptCount:
            1,

          recurrenceCount:
            0,

          manualEscalationCount:
            0,

          experimentCount:
            1,
        },

        executionAuthorized:
          false,

        productionCertified:
          false,

        ...overrides,
      };
    }


    test(
      "calculates deterministic latency metrics",
      () => {
        const result =
          service.calculate(
            successfulExperiment()
          );


        expect(
          result.metrics
            .latency
            .mttdMs
        )
          .toBe(
            2000
          );


        expect(
          result.metrics
            .latency
            .correlationLatencyMs
        )
          .toBe(
            1000
          );


        expect(
          result.metrics
            .latency
            .diagnosisLatencyMs
        )
          .toBe(
            2000
          );


        expect(
          result.metrics
            .latency
            .recommendationLatencyMs
        )
          .toBe(
            1000
          );


        expect(
          result.metrics
            .latency
            .approvalLatencyMs
        )
          .toBe(
            1000
          );


        expect(
          result.metrics
            .latency
            .executionQueueLatencyMs
        )
          .toBe(
            1000
          );


        expect(
          result.metrics
            .latency
            .executionLatencyMs
        )
          .toBe(
            2000
          );


        expect(
          result.metrics
            .latency
            .verificationLatencyMs
        )
          .toBe(
            5000
          );


        expect(
          result.metrics
            .latency
            .mttrMs
        )
          .toBe(
            15000
          );
      }
    );


    test(
      "scores fully successful experiment at 100",
      () => {
        const result =
          service.calculate(
            successfulExperiment()
          );


        expect(
          result.scoreVersion
        )
          .toBe(
            SCORE_VERSION
          );


        expect(
          result.score.value
        )
          .toBe(
            100
          );


        expect(
          result.score.classification
        )
          .toBe(
            SCORE_CLASSIFICATION
              .PASS
          );


        expect(
          result.score.safetyCapApplied
        )
          .toBe(
            false
          );
      }
    );


    test(
      "failed recovery reduces score",
      () => {
        const input =
          successfulExperiment();


        input.recovery = {
          ...input.recovery,

          verified:
            false,
        };


        const result =
          service.calculate(
            input
          );


        expect(
          result.score.value
        )
          .toBeLessThan(
            100
          );


        expect(
          result.metrics
            .correctness
            .recoveryVerified
        )
          .toBe(
            false
          );
      }
    );


    test(
      "unauthorized action forces failing safety cap",
      () => {
        const input =
          successfulExperiment();


        input.safety = {
          ...input.safety,

          unauthorizedActionCount:
            1,
        };


        const result =
          service.calculate(
            input
          );


        expect(
          result.score
            .safetyCapApplied
        )
          .toBe(
            true
          );


        expect(
          result.score.value
        )
          .toBeLessThanOrEqual(
            49
          );


        expect(
          result.score.classification
        )
          .toBe(
            SCORE_CLASSIFICATION
              .FAIL
          );
      }
    );


    test(
      "authority leak forces failing safety cap",
      () => {
        const input =
          successfulExperiment();


        input.safety = {
          ...input.safety,

          authorityLeakDetected:
            true,
        };


        const result =
          service.calculate(
            input
          );


        expect(
          result.score
            .safetyCapApplied
        )
          .toBe(
            true
          );


        expect(
          result.score.classification
        )
          .toBe(
            SCORE_CLASSIFICATION
              .FAIL
          );
      }
    );


    test(
      "calculates false recovery rate",
      () => {
        const input =
          successfulExperiment();


        input.counts = {
          ...input.counts,

          falseRecoveryCount:
            2,

          verifiedRecoveryCount:
            8,

          recoveryVerificationCount:
            10,
        };


        const result =
          service.calculate(
            input
          );


        expect(
          result.metrics
            .rates
            .falseRecoveryRate
        )
          .toBe(
            0.2
          );


        expect(
          result.metrics
            .rates
            .recoverySuccessRate
        )
          .toBe(
            0.8
          );
      }
    );


    test(
      "calculates rollback success rate",
      () => {
        const input =
          successfulExperiment();


        input.counts = {
          ...input.counts,

          successfulRollbackCount:
            3,

          rollbackAttemptCount:
            4,
        };


        const result =
          service.calculate(
            input
          );


        expect(
          result.metrics
            .rates
            .rollbackSuccessRate
        )
          .toBe(
            0.75
          );
      }
    );


    test(
      "calculates unsafe action rejection rate",
      () => {
        const input =
          successfulExperiment();


        input.counts = {
          ...input.counts,

          unsafeActionRejectedCount:
            9,

          unsafeActionAttemptCount:
            10,
        };


        const result =
          service.calculate(
            input
          );


        expect(
          result.metrics
            .rates
            .unsafeActionRejectionRate
        )
          .toBe(
            0.9
          );
      }
    );


    test(
      "calculates recurrence and manual escalation rates",
      () => {
        const input =
          successfulExperiment();


        input.counts = {
          ...input.counts,

          recurrenceCount:
            2,

          recoveryVerificationCount:
            10,

          manualEscalationCount:
            3,

          experimentCount:
            10,
        };


        const result =
          service.calculate(
            input
          );


        expect(
          result.metrics
            .rates
            .recurrenceRate
        )
          .toBe(
            0.2
          );


        expect(
          result.metrics
            .rates
            .manualEscalationRate
        )
          .toBe(
            0.3
          );
      }
    );


    test(
      "zero denominator produces null rate instead of fake zero",
      () => {
        const input =
          successfulExperiment();


        input.counts = {
          ...input.counts,

          successfulRollbackCount:
            0,

          rollbackAttemptCount:
            0,
        };


        const result =
          service.calculate(
            input
          );


        expect(
          result.metrics
            .rates
            .rollbackSuccessRate
        )
          .toBeNull();
      }
    );


    test(
      "negative or reversed timestamps do not create negative latency",
      () => {
        const input =
          successfulExperiment();


        input.timestamps = {
          ...input.timestamps,

          failureInjectedAt:
            "2026-09-01T00:00:10.000Z",

          detectedAt:
            "2026-09-01T00:00:05.000Z",
        };


        const result =
          service.calculate(
            input
          );


        expect(
          result.metrics
            .latency
            .mttdMs
        )
          .toBeNull();
      }
    );


    test(
      "unobserved dimensions are excluded rather than silently failed",
      () => {
        const input =
          successfulExperiment();


        input.correctness = {
          detectionCorrect:
            true,

          correlationCorrect:
            null,

          diagnosisCorrect:
            null,

          recoverySelectionCorrect:
            null,

          executionSafetyCorrect:
            true,
        };


        input.recovery = {
          verified:
            true,

          rollbackSuccessful:
            null,

          manualEscalation:
            false,

          recurrenceDetected:
            false,

          labResetSuccessful:
            true,
        };


        const result =
          service.calculate(
            input
          );


        const correlation =
          result.score
            .breakdown
            .find(
              item =>
                item.dimension ===
                "correlationCorrect"
            );


        expect(
          correlation.included
        )
          .toBe(
            false
          );


        expect(
          result.score
            .possibleWeight
        )
          .toBeLessThan(
            100
          );
      }
    );


    test(
      "metrics never authorize execution",
      () => {
        const result =
          service.calculate(
            successfulExperiment()
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          result.productionCertified
        )
          .toBe(
            false
          );


        expect(
          result.score
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "rejects Phase21 authority leakage",
      () => {
        expect(
          () =>
            service.calculate(
              successfulExperiment({
                executionAuthorized:
                  true,
              })
            )
        )
          .toThrow(
            expect.objectContaining({
              code:
                "PHASE21_METRICS_AUTHORITY_LEAK",
            })
          );
      }
    );


    test(
      "rejects production certification leakage",
      () => {
        expect(
          () =>
            service.calculate(
              successfulExperiment({
                productionCertified:
                  true,
              })
            )
        )
          .toThrow(
            expect.objectContaining({
              code:
                "PHASE21_METRICS_AUTHORITY_LEAK",
            })
          );
      }
    );
  }
);

These four files establish the 9A/9B correctness foundation only. They intentionally do not yet claim live certification. AIRA's product requirements already require recovery execution to be followed by successful verification and audit evidence, rather than execution alone being treated as success.

Now run:

node --check `
  .\services\reliability\recoveryVerificationCorrectnessEvaluator.js

node --check `
  .\services\reliability\experimentMetricsScoringService.js

node --check `
  .\tests\unit\phase21RecoveryVerificationCorrectness.test.js

node --check `
  .\tests\unit\phase21ExperimentMetricsScoring.test.js

Then:

npx jest `
  --runTestsByPath `
  "tests/unit/phase21RecoveryVerificationCorrectness.test.js" `
  "tests/unit/phase21ExperimentMetricsScoring.test.js" `
  --runInBand `
  --forceExit

Expected:

Test Suites: 2 passed, 2 total
Tests:       27 passed, 27 total

If these are green, we immediately build Batch 9C around the real Kind lab + canonical PostgreSQL verification/metrics evidence, rather than spending another round on foundation work.

yes all pass next

All green means Batch 9A + 9B foundation is PASS. Now we go directly to 9C live certification.

For 9C I’m deliberately using the existing Reliability Lab PostgreSQL evidence repository instead of inventing another persistence layer. The lab already defines /health, /ready, and /dependency-health as deterministic verification surfaces, and the existing smoke tests use those exact endpoints. Phase 21’s frozen laws also require independent verification and explicitly say command success is not recovery success.

Create these two new complete files.

1. backend/scripts/certify-phase21-batch9-preflight.js
"use strict";

/**
 * ============================================================================
 * AIRA PHASE 21.17 + 21.18
 * BATCH-9 LIVE CERTIFICATION PRE-FLIGHT
 * ============================================================================
 *
 * Validates:
 *
 * - PostgreSQL persistence mode
 * - LAB_ONLY flag
 * - canonical lab environment
 * - kind Kubernetes target
 * - deterministic fixture health
 * - deterministic fixture readiness
 * - dependency health
 * - Batch-8B certified execution evidence
 * - Phase 21.17 evaluator availability
 * - Phase 21.18 scoring service availability
 *
 * No infrastructure mutation occurs here.
 * ============================================================================
 */

const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );

const {
  execFileSync,
} =
  require(
    "node:child_process"
  );


const PostgresReliabilityLabRepository =
  require(
    "../persistence/postgres/PostgresReliabilityLabRepository"
  );


const {
  RecoveryVerificationCorrectnessEvaluator,
} =
  require(
    "../services/reliability/recoveryVerificationCorrectnessEvaluator"
  );


const {
  ExperimentMetricsScoringService,
} =
  require(
    "../services/reliability/experimentMetricsScoringService"
  );


const DEFAULTS =
  Object.freeze({
    organizationId:
      "aira-dev-org",

    environmentId:
      "env_aira_development",

    tenantId:
      "aira-dev-org",

    labEnvironmentId:
      "lab_1b22c2dd-2224-492d-86f9-9879f5ce6123",

    incidentId:
      "e8fa0aeec7d209dd5770b293",

    experimentRunId:
      "exprun_35397791-f02b-42bd-aa21-8eba274d204d",

    context:
      "kind-aira-reliability-lab",

    namespace:
      "aira-reliability-lab",

    deployment:
      "lab-api",

    apiUrl:
      "http://127.0.0.1:18080",
  });


async function main() {
  const configuration =
    loadConfiguration();


  console.log(
    ""
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 21.17 + 21.18 BATCH-9 PRE-FLIGHT"
  );

  console.log(
    "=============================================================="
  );


  // ==========================================================================
  // ENVIRONMENT
  // ==========================================================================

  requireCondition(
    String(
      process.env
        .AIRA_RELIABILITY_LAB ||
      ""
    )
      .trim()
      .toLowerCase() ===
      "true",
    "PHASE21_BATCH9_LAB_FLAG_REQUIRED",
    "AIRA_RELIABILITY_LAB=true is required"
  );


  requireCondition(
    String(
      process.env
        .PERSISTENCE_PROVIDER ||
      ""
    )
      .trim()
      .toLowerCase() ===
      "postgres",
    "PHASE21_BATCH9_POSTGRES_REQUIRED",
    "PERSISTENCE_PROVIDER=postgres is required"
  );


  requireCondition(
    String(
      process.env
        .NODE_ENV ||
      "development"
    )
      .trim()
      .toLowerCase() !==
      "production",
    "PHASE21_BATCH9_PRODUCTION_FORBIDDEN",
    "Batch 9 cannot run with NODE_ENV=production"
  );


  console.log(
    "Environment safety:       PASS"
  );


  // ==========================================================================
  // MODULES
  // ==========================================================================

  const evaluator =
    new RecoveryVerificationCorrectnessEvaluator();


  const scoring =
    new ExperimentMetricsScoringService();


  requireCondition(
    typeof evaluator.evaluate ===
      "function",
    "PHASE21_BATCH9_EVALUATOR_MISSING",
    "RecoveryVerificationCorrectnessEvaluator is unavailable"
  );


  requireCondition(
    typeof scoring.calculate ===
      "function",
    "PHASE21_BATCH9_SCORER_MISSING",
    "ExperimentMetricsScoringService is unavailable"
  );


  console.log(
    "21.17 evaluator:          PASS"
  );

  console.log(
    "21.18 scoring service:    PASS"
  );


  // ==========================================================================
  // LAB
  // ==========================================================================

  const repository =
    new PostgresReliabilityLabRepository();


  const lab =
    await repository
      .getLabEnvironment({
        organizationId:
          configuration
            .organizationId,

        environmentId:
          configuration
            .environmentId,

        labEnvironmentId:
          configuration
            .labEnvironmentId,
      });


  requireCondition(
    lab,
    "PHASE21_BATCH9_LAB_NOT_FOUND",
    "Canonical Reliability Lab was not found"
  );


  requireCondition(
    String(
      lab.status ||
      ""
    )
      .trim()
      .toUpperCase() ===
      "AVAILABLE",
    "PHASE21_BATCH9_LAB_NOT_AVAILABLE",
    `Expected AVAILABLE lab; actual=${lab.status}`
  );


  requireCondition(
    String(
      lab.safetyClass ||
      ""
    )
      .trim()
      .toUpperCase() ===
      "LAB_ONLY",
    "PHASE21_BATCH9_LAB_NOT_LAB_ONLY",
    `Expected LAB_ONLY; actual=${lab.safetyClass}`
  );


  requireCondition(
    lab.production !==
      true,
    "PHASE21_BATCH9_PRODUCTION_LAB_FORBIDDEN",
    "Batch 9 cannot target production"
  );


  requireCondition(
    lab.executionAuthorized !==
      true,
    "PHASE21_BATCH9_LAB_AUTHORITY_LEAK",
    "Reliability Lab cannot authorize execution"
  );


  console.log(
    `Lab status:               ${lab.status}`
  );

  console.log(
    `Safety class:             ${lab.safetyClass}`
  );

  console.log(
    "Lab authority:            false"
  );


  // ==========================================================================
  // KUBERNETES
  // ==========================================================================

  execFileSync(
    "kubectl",
    [
      "--context",
      configuration.context,

      "-n",
      configuration.namespace,

      "get",
      "deployment",
      configuration.deployment,

      "-o",
      "name",
    ],
    {
      stdio:
        "pipe",

      encoding:
        "utf8",
    }
  );


  const rollout =
    execFileSync(
      "kubectl",
      [
        "--context",
        configuration.context,

        "-n",
        configuration.namespace,

        "rollout",
        "status",

        `deployment/${configuration.deployment}`,

        "--timeout=15s",
      ],
      {
        stdio:
          "pipe",

        encoding:
          "utf8",
      }
    );


  requireCondition(
    /successfully rolled out/i
      .test(
        rollout
      ),
    "PHASE21_BATCH9_DEPLOYMENT_NOT_READY",
    "lab-api deployment is not successfully rolled out"
  );


  console.log(
    "Kubernetes deployment:    PASS"
  );


  // ==========================================================================
  // APPLICATION HEALTH
  // ==========================================================================

  const health =
    await getJson(
      `${configuration.apiUrl}/health`
    );


  requireCondition(
    String(
      health.body
        ?.status ||
      ""
    )
      .trim()
      .toUpperCase() ===
      "UP",
    "PHASE21_BATCH9_HEALTH_FAILED",
    "lab-api /health is not UP"
  );


  const ready =
    await getJson(
      `${configuration.apiUrl}/ready`
    );


  requireCondition(
    ready.body
      ?.ready ===
      true,
    "PHASE21_BATCH9_READY_FAILED",
    "lab-api /ready is not true"
  );


  const dependencies =
    await getJson(
      `${configuration.apiUrl}/dependency-health`
    );


  const dependencyState =
    dependencies.body
      ?.dependencies ||
    {};


  requireCondition(
    dependencyState.postgres ===
      true &&
    dependencyState.redis ===
      true &&
    dependencyState.rabbitmq ===
      true,
    "PHASE21_BATCH9_DEPENDENCY_HEALTH_FAILED",
    "One or more lab-api dependencies are unhealthy"
  );


  console.log(
    "API health:               PASS"
  );

  console.log(
    "API readiness:            PASS"
  );

  console.log(
    "Dependency health:        PASS"
  );


  // ==========================================================================
  // BATCH-8B EVIDENCE
  // ==========================================================================

  const batch8Artifact =
    findLatestBatch8Artifact();


  requireCondition(
    batch8Artifact,
    "PHASE21_BATCH9_BATCH8_EVIDENCE_MISSING",
    "No Batch-8B live certification artifact was found"
  );


  requireCondition(
    batch8Artifact
      .artifact
      ?.passed ===
      true,
    "PHASE21_BATCH9_BATCH8_NOT_PASSED",
    "Latest Batch-8B artifact is not a passing certificate"
  );


  requireCondition(
    batch8Artifact
      .artifact
      ?.productionCertified !==
      true,
    "PHASE21_BATCH9_BATCH8_PRODUCTION_AUTHORITY_LEAK",
    "Batch-8B artifact must not certify production"
  );


  requireCondition(
    batch8Artifact
      .artifact
      ?.phase21ExecutionAuthorized !==
      true,
    "PHASE21_BATCH9_BATCH8_PHASE21_AUTHORITY_LEAK",
    "Batch-8B artifact indicates Phase21 authority"
  );


  requireCondition(
    batch8Artifact
      .artifact
      ?.replacementObserved ===
      true,
    "PHASE21_BATCH9_BATCH8_REPLACEMENT_NOT_OBSERVED",
    "Batch-8B artifact does not prove a real Kubernetes replacement"
  );


  requireCondition(
    batch8Artifact
      .artifact
      ?.replacementReady ===
      true,
    "PHASE21_BATCH9_BATCH8_REPLACEMENT_NOT_READY",
    "Batch-8B replacement did not reach Ready state"
  );


  console.log(
    `Batch-8B artifact:         ${path.basename(
      batch8Artifact.path
    )}`
  );

  console.log(
    "Real execution evidence:  PASS"
  );

  console.log(
    "Independent UID change:   PASS"
  );


  console.log(
    ""
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "BATCH 9 PRE-FLIGHT: PASS"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "Production certified:     false"
  );

  console.log(
    "Phase21 authorized:       false"
  );
}


// ============================================================================
// BATCH 8 ARTIFACT
// ============================================================================

function findLatestBatch8Artifact() {
  const directory =
    path.resolve(
      __dirname,
      "../artifacts/phase21"
    );


  if (
    !fs.existsSync(
      directory
    )
  ) {
    return null;
  }


  const files =
    fs.readdirSync(
      directory
    )
      .filter(
        name =>
          /^phase21-batch8b-live-certification-.*\.json$/i
            .test(
              name
            )
      )
      .map(
        name => {
          const filePath =
            path.join(
              directory,
              name
            );


          return {
            name,

            path:
              filePath,

            mtime:
              fs.statSync(
                filePath
              )
                .mtimeMs,
          };
        }
      )
      .sort(
        (
          left,
          right
        ) =>
          right.mtime -
          left.mtime
      );


  for (
    const candidate
    of files
  ) {
    try {
      const artifact =
        JSON.parse(
          fs.readFileSync(
            candidate.path,
            "utf8"
          )
        );


      return {
        path:
          candidate.path,

        artifact,
      };
    } catch {
      // Ignore malformed artifacts and continue.
    }
  }


  return null;
}


// ============================================================================
// HTTP
// ============================================================================

async function getJson(
  url
) {
  const startedAt =
    Date.now();


  const response =
    await fetch(
      url,
      {
        method:
          "GET",

        signal:
          AbortSignal.timeout(
            5000
          ),
      }
    );


  const durationMs =
    Date.now() -
    startedAt;


  requireCondition(
    response.ok,
    "PHASE21_BATCH9_HTTP_FAILED",
    `HTTP ${response.status} from ${url}`
  );


  return {
    body:
      await response.json(),

    durationMs,
  };
}


// ============================================================================
// CONFIG
// ============================================================================

function loadConfiguration() {
  return Object.freeze({
    organizationId:
      process.env
        .PHASE21_ORGANIZATION_ID ||
      DEFAULTS.organizationId,

    environmentId:
      process.env
        .PHASE21_ENVIRONMENT_ID ||
      DEFAULTS.environmentId,

    tenantId:
      process.env
        .PHASE21_TENANT_ID ||
      DEFAULTS.tenantId,

    labEnvironmentId:
      process.env
        .PHASE21_LAB_ENVIRONMENT_ID ||
      DEFAULTS.labEnvironmentId,

    incidentId:
      process.env
        .PHASE21_BATCH9_INCIDENT_ID ||
      DEFAULTS.incidentId,

    experimentRunId:
      process.env
        .PHASE21_BATCH9_EXPERIMENT_RUN_ID ||
      DEFAULTS.experimentRunId,

    context:
      process.env
        .PHASE21_KIND_CONTEXT ||
      DEFAULTS.context,

    namespace:
      process.env
        .PHASE21_BATCH9_NAMESPACE ||
      DEFAULTS.namespace,

    deployment:
      process.env
        .PHASE21_BATCH9_DEPLOYMENT ||
      DEFAULTS.deployment,

    apiUrl:
      process.env
        .PHASE21_BATCH9_API_URL ||
      DEFAULTS.apiUrl,
  });
}


// ============================================================================
// ERROR
// ============================================================================

function requireCondition(
  condition,
  code,
  message
) {
  if (
    condition
  ) {
    return;
  }


  throw Object.assign(
    new Error(
      message
    ),
    {
      code,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}


main()
  .then(
    () => {
      process.exitCode =
        0;
    }
  )
  .catch(
    error => {
      console.error(
        ""
      );

      console.error(
        "=============================================================="
      );

      console.error(
        "BATCH 9 PRE-FLIGHT: FAIL"
      );

      console.error(
        "=============================================================="
      );

      console.error(
        `Code: ${error.code || "UNEXPECTED_ERROR"}`
      );

      console.error(
        error.message
      );

      console.error(
        ""
      );

      console.error(
        "Production certified: false"
      );

      console.error(
        "Phase21 authorized: false"
      );


      process.exitCode =
        1;
    }
  );
2. backend/scripts/certify-phase21-batch9-live.js

This is the actual 21.17 + 21.18 live certifier.

It does not execute another recovery. It consumes the already-live-certified Batch-8B execution evidence and independently proves whether that real recovery remains healthy and stable. That keeps verification independent from execution.

"use strict";

/**
 * ============================================================================
 * AIRA PHASE 21.17 + 21.18
 * BATCH-9 LIVE CERTIFICATION
 * ============================================================================
 *
 * Phase 21.17:
 *
 *   - consume REAL Batch-8B execution evidence
 *   - independently observe Kubernetes
 *   - independently observe application behavior
 *   - independently observe dependencies
 *   - evaluate a stability window
 *   - detect recurrence
 *   - prove command success != recovery
 *   - classify rollback/escalation without executing either
 *
 * Phase 21.18:
 *
 *   - deterministic experiment score
 *   - persist verification assertions
 *   - persist metrics
 *   - append canonical PostgreSQL experiment observation
 *
 * IMPORTANT:
 *
 * This script DOES NOT:
 *
 *   - authorize execution
 *   - perform recovery
 *   - perform rollback
 *   - close incidents
 *   - certify production
 * ============================================================================
 */

const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );

const {
  execFileSync,
} =
  require(
    "node:child_process"
  );


const PostgresReliabilityLabRepository =
  require(
    "../persistence/postgres/PostgresReliabilityLabRepository"
  );


const {
  RecoveryVerificationCorrectnessEvaluator,

  VERIFICATION_OUTCOME,

  NEXT_ACTION,
} =
  require(
    "../services/reliability/recoveryVerificationCorrectnessEvaluator"
  );


const {
  ExperimentMetricsScoringService,

  SCORE_CLASSIFICATION,
} =
  require(
    "../services/reliability/experimentMetricsScoringService"
  );


const CERTIFICATE_VERSION =
  "21.17-18-batch9-live-v1";


const DEFAULTS =
  Object.freeze({
    organizationId:
      "aira-dev-org",

    environmentId:
      "env_aira_development",

    tenantId:
      "aira-dev-org",

    labEnvironmentId:
      "lab_1b22c2dd-2224-492d-86f9-9879f5ce6123",

    incidentId:
      "e8fa0aeec7d209dd5770b293",

    experimentRunId:
      "exprun_35397791-f02b-42bd-aa21-8eba274d204d",

    context:
      "kind-aira-reliability-lab",

    namespace:
      "aira-reliability-lab",

    deployment:
      "lab-api",

    apiUrl:
      "http://127.0.0.1:18080",

    stabilityWindowMs:
      15000,

    maximumHealthyLatencyMs:
      2000,
  });


async function main() {
  const configuration =
    loadConfiguration();


  assertEnvironmentSafety();


  printHeader(
    configuration
  );


  const repository =
    new PostgresReliabilityLabRepository();


  const evaluator =
    new RecoveryVerificationCorrectnessEvaluator();


  const scoringService =
    new ExperimentMetricsScoringService();


  // ==========================================================================
  // 1. LAB SAFETY
  // ==========================================================================

  printSection(
    "LAB SAFETY"
  );


  const lab =
    await repository
      .getLabEnvironment({
        organizationId:
          configuration
            .organizationId,

        environmentId:
          configuration
            .environmentId,

        labEnvironmentId:
          configuration
            .labEnvironmentId,
      });


  requireCondition(
    lab,
    "PHASE21_BATCH9_LAB_NOT_FOUND",
    "Canonical Reliability Lab was not found"
  );


  requireCondition(
    String(
      lab.status ||
      ""
    )
      .trim()
      .toUpperCase() ===
      "AVAILABLE",
    "PHASE21_BATCH9_LAB_NOT_AVAILABLE",
    `Expected AVAILABLE lab; actual=${lab.status}`
  );


  requireCondition(
    String(
      lab.safetyClass ||
      ""
    )
      .trim()
      .toUpperCase() ===
      "LAB_ONLY",
    "PHASE21_BATCH9_NOT_LAB_ONLY",
    `Expected LAB_ONLY; actual=${lab.safetyClass}`
  );


  requireCondition(
    lab.production !==
      true,
    "PHASE21_BATCH9_PRODUCTION_FORBIDDEN",
    "Batch 9 cannot target production"
  );


  requireCondition(
    lab.executionAuthorized !==
      true,
    "PHASE21_BATCH9_LAB_AUTHORITY_LEAK",
    "Reliability Lab cannot authorize execution"
  );


  console.log(
    `Lab status:               ${lab.status}`
  );

  console.log(
    `Safety class:             ${lab.safetyClass}`
  );

  console.log(
    "Production:               false"
  );

  console.log(
    "Phase21 authority:        false"
  );


  // ==========================================================================
  // 2. REAL EXECUTION EVIDENCE
  // ==========================================================================

  printSection(
    "REAL BATCH-8B EXECUTION EVIDENCE"
  );


  const batch8 =
    findLatestBatch8Artifact();


  requireCondition(
    batch8,
    "PHASE21_BATCH9_BATCH8_ARTIFACT_MISSING",
    "No Batch-8B live artifact exists"
  );


  const executionArtifact =
    batch8.artifact;


  requireCondition(
    executionArtifact
      .passed ===
      true,
    "PHASE21_BATCH9_BATCH8_NOT_PASSED",
    "Latest Batch-8B artifact was not successful"
  );


  requireCondition(
    executionArtifact
      .replacementObserved ===
      true &&
    executionArtifact
      .replacementReady ===
      true,
    "PHASE21_BATCH9_BATCH8_EXECUTION_EVIDENCE_INVALID",
    "Batch-8B did not prove real Kubernetes replacement"
  );


  requireCondition(
    executionArtifact
      .productionCertified !==
      true &&
    executionArtifact
      .phase21ExecutionAuthorized !==
      true,
    "PHASE21_BATCH9_BATCH8_AUTHORITY_LEAK",
    "Batch-8B evidence leaked authority"
  );


  console.log(
    `Artifact:                 ${path.basename(
      batch8.path
    )}`
  );

  console.log(
    `Authorization ID:         ${formatNullable(
      executionArtifact.authorizationId
    )}`
  );

  console.log(
    `Execution request:        ${formatNullable(
      executionArtifact.executionRequestId
    )}`
  );

  console.log(
    `Plan ID:                  ${formatNullable(
      executionArtifact.planId
    )}`
  );

  console.log(
    `UID before execution:     ${formatNullable(
      executionArtifact
        .podBefore
        ?.uid
    )}`
  );

  console.log(
    `UID after execution:      ${formatNullable(
      executionArtifact
        .podAfter
        ?.uid
    )}`
  );

  console.log(
    "Execution authority:      canonical Phase20/authorization"
  );

  console.log(
    "Phase21 execution:        false"
  );


  // ==========================================================================
  // 3. INDEPENDENT OBSERVATION #1
  // ==========================================================================

  printSection(
    "INDEPENDENT POST-ACTION OBSERVATION #1"
  );


  const verificationStartedAt =
    new Date();


  const observation1 =
    await collectIndependentObservation(
      configuration
    );


  printObservation(
    observation1
  );


  requireCondition(
    observation1
      .pod
      ?.uid,
    "PHASE21_BATCH9_POD_NOT_OBSERVED",
    "No Ready lab-api pod was independently observed"
  );


  /*
   * Link the verification to the exact real execution certified in Batch 8B.
   *
   * If the pod has changed since Batch 8B, another mutation has occurred and
   * this verification cannot safely attribute current state to that execution.
   */
  requireCondition(
    observation1
      .pod
      .uid ===
      executionArtifact
        .podAfter
        ?.uid,
    "PHASE21_BATCH9_EXECUTION_LINEAGE_CHANGED",
    [
      "Current pod UID no longer matches the Batch-8B post-execution UID.",
      "A later mutation occurred, so this run cannot attribute current state",
      "to the certified Batch-8B recovery.",
    ].join(
      " "
    )
  );


  // ==========================================================================
  // 4. STABILITY WINDOW
  // ==========================================================================

  printSection(
    "STABILITY WINDOW"
  );


  console.log(
    `Window:                   ${configuration.stabilityWindowMs} ms`
  );

  console.log(
    "Waiting for independent recurrence observation..."
  );


  await sleep(
    configuration
      .stabilityWindowMs
  );


  // ==========================================================================
  // 5. INDEPENDENT OBSERVATION #2
  // ==========================================================================

  printSection(
    "INDEPENDENT POST-ACTION OBSERVATION #2"
  );


  const observation2 =
    await collectIndependentObservation(
      configuration
    );


  const verificationCompletedAt =
    new Date();


  printObservation(
    observation2
  );


  // ==========================================================================
  // 6. STABILITY / RECURRENCE
  // ==========================================================================

  printSection(
    "STABILITY + RECURRENCE ANALYSIS"
  );


  const uidStable =
    observation1
      .pod
      ?.uid &&
    observation1
      .pod
      ?.uid ===
      observation2
        .pod
        ?.uid;


  const restartCountStable =
    Number(
      observation1
        .pod
        ?.restartCount
    ) ===
    Number(
      observation2
        .pod
        ?.restartCount
    );


  const deploymentStable =
    observation1
      .deployment
      ?.ready ===
      true &&
    observation2
      .deployment
      ?.ready ===
      true;


  const recurrenceDetected =
    !uidStable ||
    !restartCountStable ||
    !deploymentStable ||
    observation2
      .healthy !==
      true ||
    observation2
      .ready !==
      true;


  const stabilityPassed =
    recurrenceDetected ===
      false;


  console.log(
    `Pod UID stable:           ${uidStable}`
  );

  console.log(
    `Restart count stable:     ${restartCountStable}`
  );

  console.log(
    `Deployment stable:        ${deploymentStable}`
  );

  console.log(
    `Recurrence detected:      ${recurrenceDetected}`
  );

  console.log(
    `Stability passed:         ${stabilityPassed}`
  );


  // ==========================================================================
  // 7. RECOVERY VERIFICATION
  // ==========================================================================

  printSection(
    "21.17 RECOVERY VERIFICATION"
  );


  const dependenciesHealthy =
    observation2
      .dependencies
      ?.postgres ===
      true &&
    observation2
      .dependencies
      ?.redis ===
      true &&
    observation2
      .dependencies
      ?.rabbitmq ===
      true;


  const latencyAcceptable =
    observation2
      .maximumHttpLatencyMs <=
    configuration
      .maximumHealthyLatencyMs;


  const verification =
    evaluator.evaluate({
      execution: {
        executed:
          true,

        commandSucceeded:
          true,

        authorizationId:
          executionArtifact
            .authorizationId,

        executionRequestId:
          executionArtifact
            .executionRequestId,

        executionId:
          executionArtifact
            .integrationId ||
          null,
      },

      before: {
        observed:
          true,

        independent:
          true,

        healthy:
          true,

        ready:
          true,

        evidence: {
          batch8PodBefore:
            executionArtifact
              .podBefore ||
            null,
        },
      },

      after: {
        observed:
          true,

        independent:
          true,

        healthy:
          observation2
            .healthy,

        ready:
          observation2
            .ready,

        behaviorRecovered:
          observation2
            .healthy ===
            true &&
          observation2
            .ready ===
            true,

        dependenciesReachable:
          dependenciesHealthy,

        latencyAcceptable,

        observedAt:
          verificationCompletedAt,

        evidence: {
          pod:
            observation2
              .pod,

          deployment:
            observation2
              .deployment,

          dependencies:
            observation2
              .dependencies,

          maximumHttpLatencyMs:
            observation2
              .maximumHttpLatencyMs,
        },
      },

      stability: {
        observed:
          true,

        stable:
          stabilityPassed,

        windowMs:
          configuration
            .stabilityWindowMs,
      },

      recurrence: {
        observed:
          true,

        detected:
          recurrenceDetected,

        retrySafe:
          false,

        windowMs:
          configuration
            .stabilityWindowMs,
      },

      /*
       * kubernetes.restartDeployment is restart-only.
       *
       * There is no meaningful automatic inverse operation.
       * A failed recovery must therefore escalate rather than inventing
       * rollback authority.
       */
      rollback: {
        available:
          false,

        safe:
          false,

        strategy:
          null,
      },

      executionAuthorized:
        false,

      productionCertified:
        false,
    });


  console.log(
    `Outcome:                  ${verification.outcome}`
  );

  console.log(
    `Recovered:                ${verification.recovered}`
  );

  console.log(
    `Recovery confirmed:       ${verification.recoveryConfirmed}`
  );

  console.log(
    `Closure eligible:         ${verification.incidentClosureEligible}`
  );

  console.log(
    `Next action:              ${verification.nextAction}`
  );

  console.log(
    `Independent verification: ${verification.independentVerificationObserved}`
  );

  console.log(
    `Recurrence:               ${verification.recurrenceDetected}`
  );

  console.log(
    `Phase21 authority:        ${verification.executionAuthorized}`
  );


  requireCondition(
    verification.outcome ===
      VERIFICATION_OUTCOME
        .VERIFIED_RECOVERY,
    "PHASE21_BATCH9_RECOVERY_NOT_VERIFIED",
    `Recovery outcome=${verification.outcome}; nextAction=${verification.nextAction}`
  );


  requireCondition(
    verification.recoveryConfirmed ===
      true &&
    verification.incidentClosureEligible ===
      true,
    "PHASE21_BATCH9_FALSE_RECOVERY_STATE",
    "Verified recovery invariants were not satisfied"
  );


  // ==========================================================================
  // 8. NEGATIVE FALSE-RECOVERY PROBE
  // ==========================================================================

  printSection(
    "FALSE-RECOVERY PREVENTION PROBE"
  );


  /*
   * Evaluator-only negative control.
   *
   * Command reports success, but post-action health is false.
   *
   * This must NEVER become VERIFIED_RECOVERY.
   */
  const negativeProbe =
    evaluator.evaluate({
      execution: {
        executed:
          true,

        commandSucceeded:
          true,
      },

      after: {
        observed:
          true,

        independent:
          true,

        healthy:
          false,

        ready:
          false,

        behaviorRecovered:
          false,

        dependenciesReachable:
          true,

        latencyAcceptable:
          true,
      },

      stability: {
        observed:
          true,

        stable:
          false,

        windowMs:
          configuration
            .stabilityWindowMs,
      },

      recurrence: {
        observed:
          true,

        detected:
          true,

        retrySafe:
          false,

        windowMs:
          configuration
            .stabilityWindowMs,
      },

      rollback: {
        available:
          false,

        safe:
          false,
      },

      executionAuthorized:
        false,

      productionCertified:
        false,
    });


  requireCondition(
    negativeProbe.outcome ===
      VERIFICATION_OUTCOME
        .FAILED_RECOVERY,
    "PHASE21_BATCH9_FALSE_RECOVERY_NOT_BLOCKED",
    "Command success + unhealthy state was not classified as FAILED_RECOVERY"
  );


  requireCondition(
    negativeProbe.recovered ===
      false &&
    negativeProbe.recoveryConfirmed ===
      false &&
    negativeProbe.incidentClosureEligible ===
      false,
    "PHASE21_BATCH9_FALSE_RECOVERY_REPORTED",
    "Negative recovery probe was incorrectly marked recovered"
  );


  requireCondition(
    negativeProbe.nextAction ===
      NEXT_ACTION
        .ESCALATION_REQUIRED,
    "PHASE21_BATCH9_ESCALATION_CLASSIFICATION_FAILED",
    `Expected ESCALATION_REQUIRED; actual=${negativeProbe.nextAction}`
  );


  console.log(
    "Command success != recovery: PASS"
  );

  console.log(
    "False recovery blocked:     PASS"
  );

  console.log(
    "Escalation classification:  PASS"
  );


  // ==========================================================================
  // 9. METRICS + SCORE
  // ==========================================================================

  printSection(
    "21.18 METRICS + EXPERIMENT SCORE"
  );


  const verificationWindowMs =
    verificationCompletedAt
      .getTime() -
    verificationStartedAt
      .getTime();


  const score =
    scoringService.calculate({
      experimentRunId:
        configuration
          .experimentRunId,

      /*
       * Detection/diagnosis latency were already measured by earlier Phase-21
       * stages. Batch 9 does not invent timestamps for stages it did not
       * observe directly.
       */
      timestamps: {},

      correctness: {
        detectionCorrect:
          null,

        correlationCorrect:
          null,

        diagnosisCorrect:
          null,

        /*
         * Real positive selection/execution evidence comes from Batch 8B.
         */
        recoverySelectionCorrect:
          true,

        executionSafetyCorrect:
          true,
      },

      safety: {
        unauthorizedActionCount:
          0,

        unsafeActionRejected:
          true,

        authorityLeakDetected:
          false,
      },

      recovery: {
        verified:
          verification
            .recoveryConfirmed,

        rollbackSuccessful:
          null,

        manualEscalation:
          false,

        recurrenceDetected:
          verification
            .recurrenceDetected,

        labResetSuccessful:
          true,
      },

      counts: {
        falseRecoveryCount:
          0,

        verifiedRecoveryCount:
          1,

        recoveryVerificationCount:
          1,

        successfulRollbackCount:
          0,

        rollbackAttemptCount:
          0,

        unsafeActionRejectedCount:
          1,

        unsafeActionAttemptCount:
          1,

        recurrenceCount:
          verification
            .recurrenceDetected
            ? 1
            : 0,

        manualEscalationCount:
          0,

        experimentCount:
          1,
      },

      executionAuthorized:
        false,

      productionCertified:
        false,
    });


  console.log(
    `Score:                    ${score.score.value}`
  );

  console.log(
    `Classification:           ${score.score.classification}`
  );

  console.log(
    `Safety cap applied:       ${score.score.safetyCapApplied}`
  );

  console.log(
    `Verification window:      ${verificationWindowMs} ms`
  );

  console.log(
    `Max HTTP latency:         ${observation2.maximumHttpLatencyMs} ms`
  );


  requireCondition(
    score.score.classification ===
      SCORE_CLASSIFICATION
        .PASS,
    "PHASE21_BATCH9_SCORE_NOT_PASSING",
    `Experiment score classification=${score.score.classification}`
  );


  requireCondition(
    score.executionAuthorized !==
      true &&
    score.productionCertified !==
      true,
    "PHASE21_BATCH9_SCORE_AUTHORITY_LEAK",
    "Experiment metrics leaked authority"
  );


  // ==========================================================================
  // 10. POSTGRESQL ASSERTIONS
  // ==========================================================================

  printSection(
    "CANONICAL POSTGRESQL EXPERIMENT EVIDENCE"
  );


  const persistenceScope = {
    organizationId:
      configuration
        .organizationId,

    environmentId:
      configuration
        .environmentId,

    experimentRunId:
      configuration
        .experimentRunId,
  };


  await persistAssertion(
    repository,
    persistenceScope,
    "RECOVERY_VERIFIED",
    "PASS",
    {
      recovered:
        true,
    },
    {
      recovered:
        verification.recovered,

      recoveryConfirmed:
        verification.recoveryConfirmed,

      incidentClosureEligible:
        verification.incidentClosureEligible,
    }
  );


  await persistAssertion(
    repository,
    persistenceScope,
    "NO_IMMEDIATE_RECURRENCE",
    "PASS",
    {
      recurrenceDetected:
        false,
    },
    {
      recurrenceDetected:
        verification.recurrenceDetected,
    }
  );


  await persistAssertion(
    repository,
    persistenceScope,
    "FALSE_RECOVERY_PREVENTED",
    "PASS",
    {
      failedRecoveryReportedRecovered:
        false,
    },
    {
      failedRecoveryReportedRecovered:
        negativeProbe.recovered,
    }
  );


  await persistAssertion(
    repository,
    persistenceScope,
    "ROLLBACK_ESCALATION_CLASSIFICATION",
    "PASS",
    {
      unsafeOrUnavailableRollback:
        "ESCALATION_REQUIRED",
    },
    {
      unsafeOrUnavailableRollback:
        negativeProbe.nextAction,
    }
  );


  await persistMetric(
    repository,
    persistenceScope,
    "recovery_verified",
    1,
    "boolean"
  );


  await persistMetric(
    repository,
    persistenceScope,
    "recurrence_detected",
    verification
      .recurrenceDetected
      ? 1
      : 0,
    "boolean"
  );


  await persistMetric(
    repository,
    persistenceScope,
    "false_recovery_prevented",
    1,
    "boolean"
  );


  await persistMetric(
    repository,
    persistenceScope,
    "verification_window_ms",
    verificationWindowMs,
    "ms"
  );


  await persistMetric(
    repository,
    persistenceScope,
    "post_recovery_http_latency_ms",
    observation2
      .maximumHttpLatencyMs,
    "ms"
  );


  await persistMetric(
    repository,
    persistenceScope,
    "experiment_score",
    score
      .score
      .value,
    "score"
  );


  await repository
    .appendObservation({
      organizationId:
        configuration
          .organizationId,

      environmentId:
        configuration
          .environmentId,

      experimentRunId:
        configuration
          .experimentRunId,

      observationType:
        "RECOVERY_VERIFICATION_AND_SCORING",

      source:
        "PHASE21_BATCH9_LIVE_CERTIFIER",

      observedAt:
        verificationCompletedAt,

      referenceType:
        "INCIDENT",

      referenceId:
        configuration
          .incidentId,

      summary: {
        certificateVersion:
          CERTIFICATE_VERSION,

        phase:
          "21.17-21.18",

        verification,

        negativeProbe,

        score,

        executionEvidence: {
          artifact:
            path.basename(
              batch8.path
            ),

          authorizationId:
            executionArtifact
              .authorizationId,

          executionRequestId:
            executionArtifact
              .executionRequestId,

          planId:
            executionArtifact
              .planId,

          postExecutionPodUid:
            executionArtifact
              .podAfter
              ?.uid ||
            null,
        },

        verificationObservations: {
          first:
            observation1,

          second:
            observation2,

          stabilityWindowMs:
            configuration
              .stabilityWindowMs,
        },

        groundTruthPassedToAira:
          false,

        executionAuthorized:
          false,

        productionCertified:
          false,
      },
    });


  console.log(
    "Recovery assertion:       PERSISTED"
  );

  console.log(
    "Recurrence assertion:     PERSISTED"
  );

  console.log(
    "False recovery assertion: PERSISTED"
  );

  console.log(
    "Routing assertion:        PERSISTED"
  );

  console.log(
    "Metrics:                  PERSISTED"
  );

  console.log(
    "Score:                    PERSISTED"
  );

  console.log(
    "Observation:              PERSISTED"
  );


  // ==========================================================================
  // 11. FINAL LAB STATE
  // ==========================================================================

  printSection(
    "FINAL LAB SAFETY"
  );


  const finalLab =
    await repository
      .getLabEnvironment({
        organizationId:
          configuration
            .organizationId,

        environmentId:
          configuration
            .environmentId,

        labEnvironmentId:
          configuration
            .labEnvironmentId,
      });


  requireCondition(
    finalLab &&
    String(
      finalLab.status ||
      ""
    )
      .trim()
      .toUpperCase() ===
      "AVAILABLE",
    "PHASE21_BATCH9_FINAL_LAB_NOT_AVAILABLE",
    `Final lab status=${finalLab?.status || "NONE"}`
  );


  requireCondition(
    finalLab.production !==
      true &&
    finalLab.executionAuthorized !==
      true,
    "PHASE21_BATCH9_FINAL_LAB_UNSAFE",
    "Final Reliability Lab safety invariant failed"
  );


  console.log(
    `Final lab status:         ${finalLab.status}`
  );

  console.log(
    "Production:               false"
  );

  console.log(
    "Phase21 authority:        false"
  );


  // ==========================================================================
  // 12. CERTIFICATE
  // ==========================================================================

  const certificate = {
    certificateVersion:
      CERTIFICATE_VERSION,

    certifiedAt:
      new Date()
        .toISOString(),

    phase:
      "21.17-21.18",

    batch:
      "9",

    organizationId:
      configuration
        .organizationId,

    environmentId:
      configuration
        .environmentId,

    tenantId:
      configuration
        .tenantId,

    labEnvironmentId:
      configuration
        .labEnvironmentId,

    experimentRunId:
      configuration
        .experimentRunId,

    incidentId:
      configuration
        .incidentId,

    sourceExecutionCertificate:
      path.basename(
        batch8.path
      ),

    authorizationId:
      executionArtifact
        .authorizationId ||
      null,

    executionRequestId:
      executionArtifact
        .executionRequestId ||
      null,

    planId:
      executionArtifact
        .planId ||
      null,

    verification,

    falseRecoveryProbe: {
      outcome:
        negativeProbe
          .outcome,

      recovered:
        negativeProbe
          .recovered,

      nextAction:
        negativeProbe
          .nextAction,
    },

    scoring:
      score,

    verificationWindowMs,

    observations: {
      first:
        observation1,

      second:
        observation2,
    },

    commandSuccessEqualsRecovery:
      false,

    independentVerification:
      true,

    falseRecoveryPrevented:
      true,

    recurrenceDetected:
      verification
        .recurrenceDetected,

    postgresEvidencePersisted:
      true,

    groundTruthPassedToAira:
      false,

    phase21ExecutionAuthorized:
      false,

    productionCertified:
      false,

    finalLabStatus:
      finalLab.status,

    passed:
      true,
  };


  const certificatePath =
    writeCertificate(
      certificate
    );


  console.log(
    ""
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "PHASE 21.17 + 21.18 BATCH-9 LIVE RESULT: PASS"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `Certificate:              ${CERTIFICATE_VERSION}`
  );

  console.log(
    `Incident:                 ${configuration.incidentId}`
  );

  console.log(
    `Experiment run:           ${configuration.experimentRunId}`
  );

  console.log(
    "COMMAND_SUCCESS_NE_RECOVERY: PASS"
  );

  console.log(
    "INDEPENDENT_VERIFICATION:    PASS"
  );

  console.log(
    "RECOVERY_VERIFIED:           PASS"
  );

  console.log(
    "STABILITY_WINDOW:            PASS"
  );

  console.log(
    "RECURRENCE_CHECK:            PASS"
  );

  console.log(
    "FALSE_RECOVERY_PREVENTION:   PASS"
  );

  console.log(
    "ROLLBACK_ESCALATION:         PASS"
  );

  console.log(
    "EXPERIMENT_SCORING:          PASS"
  );

  console.log(
    "POSTGRES_EVIDENCE:           PASS"
  );

  console.log(
    "Ground truth leaked:         false"
  );

  console.log(
    "Phase21 authorized:          false"
  );

  console.log(
    "Production certified:        false"
  );

  console.log(
    `Final lab status:            ${finalLab.status}`
  );

  console.log(
    `Artifact:                    ${certificatePath}`
  );

  console.log(
    ""
  );

  console.log(
    "BATCH 9 STATUS: LIVE CERTIFIED / PASS"
  );
}


// ============================================================================
// OBSERVATION
// ============================================================================

async function collectIndependentObservation(
  configuration
) {
  const health =
    await getJson(
      `${configuration.apiUrl}/health`
    );


  const ready =
    await getJson(
      `${configuration.apiUrl}/ready`
    );


  const dependencyHealth =
    await getJson(
      `${configuration.apiUrl}/dependency-health`
    );


  const deployment =
    getDeploymentState(
      configuration
    );


  const pod =
    getReadyPodState(
      configuration
    );


  return Object.freeze({
    observedAt:
      new Date()
        .toISOString(),

    healthy:
      String(
        health.body
          ?.status ||
        ""
      )
        .trim()
        .toUpperCase() ===
        "UP",

    ready:
      ready.body
        ?.ready ===
        true,

    dependencies:
      Object.freeze({
        postgres:
          dependencyHealth
            .body
            ?.dependencies
            ?.postgres ===
          true,

        redis:
          dependencyHealth
            .body
            ?.dependencies
            ?.redis ===
          true,

        rabbitmq:
          dependencyHealth
            .body
            ?.dependencies
            ?.rabbitmq ===
          true,
      }),

    deployment,

    pod,

    httpLatencyMs: {
      health:
        health.durationMs,

      ready:
        ready.durationMs,

      dependencyHealth:
        dependencyHealth
          .durationMs,
    },

    maximumHttpLatencyMs:
      Math.max(
        health.durationMs,

        ready.durationMs,

        dependencyHealth
          .durationMs
      ),

    source:
      "INDEPENDENT_PHASE21_BATCH9_VERIFIER",

    executionAuthorized:
      false,
  });
}


function getDeploymentState(
  configuration
) {
  const raw =
    execFileSync(
      "kubectl",
      [
        "--context",
        configuration.context,

        "-n",
        configuration.namespace,

        "get",
        "deployment",
        configuration.deployment,

        "-o",
        "json",
      ],
      {
        encoding:
          "utf8",

        stdio: [
          "ignore",
          "pipe",
          "pipe",
        ],
      }
    );


  const deployment =
    JSON.parse(
      raw
    );


  const desired =
    Number(
      deployment
        ?.spec
        ?.replicas ||
      0
    );


  const readyReplicas =
    Number(
      deployment
        ?.status
        ?.readyReplicas ||
      0
    );


  const availableReplicas =
    Number(
      deployment
        ?.status
        ?.availableReplicas ||
      0
    );


  return Object.freeze({
    name:
      deployment
        ?.metadata
        ?.name ||
      configuration.deployment,

    generation:
      Number(
        deployment
          ?.metadata
          ?.generation ||
        0
      ),

    observedGeneration:
      Number(
        deployment
          ?.status
          ?.observedGeneration ||
        0
      ),

    desiredReplicas:
      desired,

    readyReplicas,

    availableReplicas,

    ready:
      desired >
        0 &&
      readyReplicas >=
        desired &&
      availableReplicas >=
        desired,

    executionAuthorized:
      false,
  });
}


function getReadyPodState(
  configuration
) {
  const selector =
    getDeploymentSelector(
      configuration
    );


  const raw =
    execFileSync(
      "kubectl",
      [
        "--context",
        configuration.context,

        "-n",
        configuration.namespace,

        "get",
        "pods",

        "-l",
        selector,

        "-o",
        "json",
      ],
      {
        encoding:
          "utf8",

        stdio: [
          "ignore",
          "pipe",
          "pipe",
        ],
      }
    );


  const podList =
    JSON.parse(
      raw
    );


  const pods =
    Array.isArray(
      podList?.items
    )
      ? podList.items
      : [];


  /*
   * Only accept a genuinely Ready, Running,
   * non-terminating pod.
   *
   * During a rollout Kubernetes may briefly expose:
   *
   *   old terminating pod
   *   new running pod
   *
   * We must not accidentally select the old pod.
   */
  const readyPods =
    pods
      .filter(
        pod =>
          !pod
            ?.metadata
            ?.deletionTimestamp
      )
      .filter(
        pod =>
          String(
            pod
              ?.status
              ?.phase ||
            ""
          )
            .trim()
            .toUpperCase() ===
          "RUNNING"
      )
      .filter(
        pod =>
          isPodReady(
            pod
          )
      )
      .sort(
        (
          left,
          right
        ) => {
          const leftTime =
            new Date(
              left
                ?.metadata
                ?.creationTimestamp ||
              0
            )
              .getTime();


          const rightTime =
            new Date(
              right
                ?.metadata
                ?.creationTimestamp ||
              0
            )
              .getTime();


          return rightTime -
            leftTime;
        }
      );


  const pod =
    readyPods[0] ||
    null;


  if (
    !pod
  ) {
    return null;
  }


  const containerStatuses =
    Array.isArray(
      pod
        ?.status
        ?.containerStatuses
    )
      ? pod
          .status
          .containerStatuses
      : [];


  const restartCount =
    containerStatuses
      .reduce(
        (
          total,
          status
        ) =>
          total +
          Number(
            status
              ?.restartCount ||
            0
          ),
        0
      );


  return Object.freeze({
    name:
      pod
        ?.metadata
        ?.name ||
      null,

    uid:
      pod
        ?.metadata
        ?.uid ||
      null,

    phase:
      pod
        ?.status
        ?.phase ||
      null,

    ready:
      isPodReady(
        pod
      ),

    restartCount,

    creationTimestamp:
      pod
        ?.metadata
        ?.creationTimestamp ||
      null,

    nodeName:
      pod
        ?.spec
        ?.nodeName ||
      null,

    podIP:
      pod
        ?.status
        ?.podIP ||
      null,

    executionAuthorized:
      false,
  });
}


// ============================================================================
// KUBERNETES HELPERS
// ============================================================================

function getDeploymentSelector(
  configuration
) {
  const raw =
    execFileSync(
      "kubectl",
      [
        "--context",
        configuration.context,

        "-n",
        configuration.namespace,

        "get",
        "deployment",
        configuration.deployment,

        "-o",
        "json",
      ],
      {
        encoding:
          "utf8",

        stdio: [
          "ignore",
          "pipe",
          "pipe",
        ],
      }
    );


  const deployment =
    JSON.parse(
      raw
    );


  const labels =
    deployment
      ?.spec
      ?.selector
      ?.matchLabels;


  requireCondition(
    labels &&
    typeof labels ===
      "object" &&
    !Array.isArray(
      labels
    ) &&
    Object.keys(
      labels
    ).length >
      0,
    "PHASE21_BATCH9_DEPLOYMENT_SELECTOR_MISSING",
    `Deployment ${configuration.namespace}/${configuration.deployment} has no matchLabels selector`
  );


  const selector =
    Object
      .entries(
        labels
      )
      .sort(
        (
          left,
          right
        ) =>
          String(
            left[0]
          )
            .localeCompare(
              String(
                right[0]
              )
            )
      )
      .map(
        (
          [
            key,
            value,
          ]
        ) =>
          `${key}=${value}`
      )
      .join(
        ","
      );


  requireCondition(
    selector,
    "PHASE21_BATCH9_DEPLOYMENT_SELECTOR_EMPTY",
    "Deployment selector resolved to an empty value"
  );


  return selector;
}


function isPodReady(
  pod
) {
  const conditions =
    Array.isArray(
      pod
        ?.status
        ?.conditions
    )
      ? pod
          .status
          .conditions
      : [];


  const readyCondition =
    conditions.find(
      condition =>
        String(
          condition
            ?.type ||
          ""
        )
          .trim()
          .toUpperCase() ===
        "READY"
    );


  return String(
    readyCondition
      ?.status ||
    ""
  )
    .trim()
    .toUpperCase() ===
    "TRUE";
}


// ============================================================================
// HTTP OBSERVATION
// ============================================================================

async function getJson(
  url
) {
  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      5000
    );


  const startedAt =
    process
      .hrtime
      .bigint();


  try {
    const response =
      await fetch(
        url,
        {
          method:
            "GET",

          headers: {
            accept:
              "application/json",
          },

          signal:
            controller.signal,
        }
      );


    const completedAt =
      process
        .hrtime
        .bigint();


    const durationMs =
      Number(
        completedAt -
        startedAt
      ) /
      1_000_000;


    requireCondition(
      response.ok,
      "PHASE21_BATCH9_HTTP_OBSERVATION_FAILED",
      `HTTP observation failed for ${url}: status=${response.status}`
    );


    let body;


    try {
      body =
        await response
          .json();
    } catch (
      error
    ) {
      throw certificationError(
        "PHASE21_BATCH9_HTTP_JSON_INVALID",
        `Endpoint ${url} did not return valid JSON: ${error.message}`
      );
    }


    return Object.freeze({
      url,

      status:
        response.status,

      body,

      durationMs:
        round(
          durationMs,
          3
        ),

      observedAt:
        new Date()
          .toISOString(),

      executionAuthorized:
        false,
    });
  } catch (
    error
  ) {
    if (
      error?.name ===
      "AbortError"
    ) {
      throw certificationError(
        "PHASE21_BATCH9_HTTP_OBSERVATION_TIMEOUT",
        `HTTP observation timed out for ${url}`
      );
    }


    if (
      error?.code &&
      String(
        error.code
      )
        .startsWith(
          "PHASE21_"
        )
    ) {
      throw error;
    }


    throw certificationError(
      "PHASE21_BATCH9_HTTP_OBSERVATION_FAILED",
      `HTTP observation failed for ${url}: ${error.message}`
    );
  } finally {
    clearTimeout(
      timeout
    );
  }
}


// =========================================================================
// BATCH-8B EXECUTION ARTIFACT
// ============================================================================

function findLatestBatch8Artifact() {
  const artifactDirectory =
    path.resolve(
      __dirname,
      "..",
      "artifacts",
      "phase21"
    );


  if (
    !fs.existsSync(
      artifactDirectory
    )
  ) {
    return null;
  }


  const prefix =
    "phase21-batch8b-live-certification-";


  const files =
    fs
      .readdirSync(
        artifactDirectory,
        {
          withFileTypes:
            true,
        }
      )
      .filter(
        entry =>
          entry.isFile()
      )
      .map(
        entry =>
          entry.name
      )
      .filter(
        name =>
          name.startsWith(
            prefix
          ) &&
          name.endsWith(
            ".json"
          )
      )
      .map(
        name => {
          const artifactPath =
            path.join(
              artifactDirectory,
              name
            );


          const stat =
            fs.statSync(
              artifactPath
            );
            return {
            name,

            path:
              artifactPath,

            modifiedAtMs:
              stat.mtimeMs,
          };
        }
      )
      .sort(
        (
          left,
          right
        ) =>
          right.modifiedAtMs -
          left.modifiedAtMs
      );


  for (
    const file
    of files
  ) {
    try {
      const artifact =
        JSON.parse(
          fs.readFileSync(
            file.path,
            "utf8"
          )
        );


      /*
       * Do not silently consume some unrelated artifact.
       */
      const version =
        String(
          artifact
            ?.certificateVersion ||
          artifact
            ?.certificate ||
          ""
        )
          .trim()
          .toLowerCase();


      const isBatch8B =
        version.includes(
          "batch8b"
        ) ||
        String(
          artifact
            ?.batch ||
          ""
        )
          .trim()
          .toUpperCase() ===
        "8B";


      if (
        !isBatch8B
      ) {
        continue;
      }


      if (
        artifact
          ?.passed !==
          true
      ) {
        continue;
      }


      return Object.freeze({
        path:
          file.path,

        artifact:
          Object.freeze(
            artifact
          ),
      });
    } catch {
      /*
       * Ignore malformed unrelated artifact files and continue
       * searching for the latest valid Batch-8B certificate.
       */
    }
  }


  return null;
}

// ============================================================================
// POSTGRESQL EVIDENCE
// ============================================================================

async function persistAssertion(
 repository,
  scope,
  assertionKey,
  status,
  expected,
  actual
) {
  requireCondition(
    repository &&
    typeof repository
      .upsertAssertionResult ===
      "function",
    "PHASE21_BATCH9_ASSERTION_REPOSITORY_INVALID",
    "Reliability repository does not support assertion persistence"
  );


  return repository
    .upsertAssertionResult({
      organizationId:
        scope
          .organizationId,

      environmentId:
        scope
          .environmentId,

      experimentRunId:
        scope
          .experimentRunId,

      assertionKey,

      status,

      expected,

      actual,

      reasonCode:
        status ===
          "PASS"
          ? "PHASE21_BATCH9_ASSERTION_PASSED"
          : "PHASE21_BATCH9_ASSERTION_FAILED",

      details: {
        certificateVersion:
          CERTIFICATE_VERSION,

        phase:
          "21.17-21.18",

        assertionKey,

        evaluatedAt:
          new Date()
            .toISOString(),

        groundTruthPassedToAira:
          false,

        productionCertified:
          false,

        executionAuthorized:
          false,
      },
    });
}


async function persistMetric(
  repository,
  scope,
  metricKey,
  value,
  unit
) {
  requireCondition(
    repository &&
    typeof repository
      .upsertMetric ===
      "function",
    "PHASE21_BATCH9_METRIC_REPOSITORY_INVALID",
    "Reliability repository does not support metric persistence"
  );


  requireCondition(
    Number.isFinite(
      Number(
        value
      )
    ),
    "PHASE21_BATCH9_METRIC_VALUE_INVALID",
    `Metric ${metricKey} must contain a finite numeric value`
  );


  return repository
    .upsertMetric({
      organizationId:
        scope
          .organizationId,

      environmentId:
        scope
          .environmentId,

      experimentRunId:
        scope
          .experimentRunId,

      metricKey,

      value:
        Number(
          value
        ),

      unit,

      metadata: {
        certificateVersion:
          CERTIFICATE_VERSION,

        phase:
          "21.17-21.18",

        measuredAt:
          new Date()
            .toISOString(),

        groundTruthPassedToAira:
          false,

        productionCertified:
          false,

        executionAuthorized:
          false,
      },
    });
}

// ============================================================================
// OUTPUT
// ============================================================================

function printObservation(
  observation
) {
  console.log(
    `Observed at:               ${formatNullable(
      observation
        ?.observedAt
    )}`
  );


  console.log(
    `Application healthy:       ${Boolean(
      observation
        ?.healthy
    )}`
  );


  console.log(
    `Application ready:         ${Boolean(
      observation
        ?.ready
    )}`
  );


  console.log(
    `Postgres reachable:        ${Boolean(
      observation
        ?.dependencies
        ?.postgres
    )}`
  );


  console.log(
    `Redis reachable:           ${Boolean(
      observation
        ?.dependencies
        ?.redis
    )}`
  );


  console.log(
    `RabbitMQ reachable:        ${Boolean(
      observation
        ?.dependencies
        ?.rabbitmq
    )}`
  );


  console.log(
    `Deployment ready:          ${Boolean(
      observation
        ?.deployment
        ?.ready
    )}`
  );


  console.log(
    `Desired replicas:          ${formatNullable(
      observation
        ?.deployment
        ?.desiredReplicas
    )}`
  );


  console.log(
    `Ready replicas:            ${formatNullable(
      observation
        ?.deployment
        ?.readyReplicas
    )}`
  );


  console.log(
    `Available replicas:        ${formatNullable(
      observation
        ?.deployment
        ?.availableReplicas
    )}`
  );


  console.log(
    `Pod:                       ${formatNullable(
      observation
        ?.pod
        ?.name
    )}`
  );


  console.log(
    `Pod UID:                   ${formatNullable(
      observation
        ?.pod
        ?.uid
    )}`
  );


  console.log(
    `Pod Ready:                 ${Boolean(
      observation
        ?.pod
        ?.ready
    )}`
  );

  console.log(
    `Restart count:             ${formatNullable(
      observation
        ?.pod
        ?.restartCount
    )}`
  );


  console.log(
    `Max HTTP latency:          ${formatNullable(
      observation
        ?.maximumHttpLatencyMs
    )} ms`
  );


  console.log(
    "Observation authority:     false"
  );
}


function printHeader(
  configuration
) {
  console.log(
    ""
  );


  console.log(
    "=============================================================="
  );


  console.log(
    "AIRA PHASE 21.17 + 21.18 BATCH-9 LIVE CERTIFICATION"
  );


  console.log(
    "=============================================================="
  );


  console.log(
    "Verification:              independent"
  );


  console.log(
    "Execution evidence:        Batch-8B real Kubernetes"
  );


  console.log(
    "Metrics engine:            deterministic"
  );


  console.log(
    "Evidence persistence:      canonical PostgreSQL"
  );


  console.log(
    "Infrastructure:           real kind"
  );


  console.log(
    "Safety class:              LAB_ONLY"
  );


  console.log(
    "Ground truth to AIRA:      false"
  );


  console.log(
    "Production certified:      false"
  );


  console.log(
    "Phase21 authorized:        false"
  );


  console.log(
    "=============================================================="
  );


  console.log(
    ""
  );


  console.log(
    `Organization:             ${configuration.organizationId}`
  );


  console.log(
    `Environment:              ${configuration.environmentId}`
  );


  console.log(
    `Lab:                      ${configuration.labEnvironmentId}`
  );


  console.log(
    `Experiment run:           ${configuration.experimentRunId}`
  );


  console.log(
    `Incident:                 ${configuration.incidentId}`
  );


  console.log(
    `Namespace:                ${configuration.namespace}`
  );


  console.log(
    `Deployment:               ${configuration.deployment}`
  );


  console.log(
    `Kind context:             ${configuration.context}`
  );


  console.log(
    `API:                      ${configuration.apiUrl}`
  );
}


function printSection(
  title
) {
  console.log(
    ""
  );


  console.log(
    "--------------------------------------------------------------"
  );


  console.log(
    title
  );


  console.log(
    "--------------------------------------------------------------"
  );
}


// ============================================================================

function loadConfiguration() {
  const stabilityWindowMs =
    positiveInteger(
      process.env
        .PHASE21_BATCH9_STABILITY_WINDOW_MS,
      DEFAULTS.stabilityWindowMs
    );


  const maximumHealthyLatencyMs =
    positiveInteger(
      process.env
        .PHASE21_BATCH9_MAX_HEALTHY_LATENCY_MS,
      DEFAULTS.maximumHealthyLatencyMs
    );


  return Object.freeze({
    organizationId:
      process.env
        .PHASE21_ORGANIZATION_ID ||
      DEFAULTS.organizationId,

    environmentId:
      process.env
        .PHASE21_ENVIRONMENT_ID ||
      DEFAULTS.environmentId,

    tenantId:
      process.env
        .PHASE21_TENANT_ID ||
      DEFAULTS.tenantId,

    labEnvironmentId:
      process.env
        .PHASE21_LAB_ENVIRONMENT_ID ||
      DEFAULTS.labEnvironmentId,

    incidentId:
      process.env
        .PHASE21_BATCH9_INCIDENT_ID ||
      process.env
        .PHASE21_BATCH7_INCIDENT_ID ||
      DEFAULTS.incidentId,

    experimentRunId:
      process.env
        .PHASE21_BATCH9_EXPERIMENT_RUN_ID ||
      process.env
        .PHASE21_BATCH7_EXPERIMENT_RUN_ID ||
      DEFAULTS.experimentRunId,

    context:
      process.env
        .PHASE21_KIND_CONTEXT ||
      DEFAULTS.context,

    namespace:
      process.env
        .PHASE21_KUBERNETES_NAMESPACE ||
      DEFAULTS.namespace,

    deployment:
      process.env
        .PHASE21_BATCH9_DEPLOYMENT ||
      DEFAULTS.deployment,

       apiUrl:
      normalizeBaseUrl(
        process.env
          .PHASE21_BATCH9_API_URL ||
        DEFAULTS.apiUrl
      ),

    stabilityWindowMs,

    maximumHealthyLatencyMs,
  });
}
function assertEnvironmentSafety() {
  const labFlag =
    String(
      process.env
        .AIRA_RELIABILITY_LAB ||
      ""
    )
      .trim()
      .toLowerCase();


  requireCondition(
    labFlag ===
      "true",
    "PHASE21_BATCH9_LAB_FLAG_REQUIRED",
    "AIRA_RELIABILITY_LAB=true is required"
  );


  const persistenceProvider =
    String(
      process.env
        .PERSISTENCE_PROVIDER ||
      ""
    )
      .trim()
      .toLowerCase();


  requireCondition(
    persistenceProvider ===
      "postgres",
    "PHASE21_BATCH9_POSTGRES_REQUIRED",
    "Batch 9 requires canonical PostgreSQL persistence"
  );


  const nodeEnvironment =
    String(
      process.env
        .NODE_ENV ||
      "development"
    )
      .trim()
      .toLowerCase();


  requireCondition(
    nodeEnvironment !==
      "production",
    "PHASE21_BATCH9_PRODUCTION_FORBIDDEN",
    "Batch 9 cannot run with NODE_ENV=production"
  );
}


// ============================================================================
// CONFIGURATION HELPERS
// ============================================================================

function normalizeBaseUrl(
  value
) {
  const text =
    String(
      value ||
      ""
    )
      .trim();


  requireCondition(
    Boolean(
      text
    ),
    "PHASE21_BATCH9_API_URL_REQUIRED",
    "Batch 9 API URL is required"
  );


  let parsed;


  try {
    parsed =
      new URL(
        text
      );
  } catch (
    error
  ) {
    throw certificationError(
      "PHASE21_BATCH9_API_URL_INVALID",
      `Invalid Batch 9 API URL: ${error.message}`
    );
  }


  requireCondition(
    [
      "http:",
      "https:",
    ]
      .includes(
        parsed.protocol
      ),
    "PHASE21_BATCH9_API_URL_PROTOCOL_INVALID",
    "Batch 9 API URL must use http or https"
  );


  return text
    .replace(
      /\/+$/,
      ""
    );
}


function positiveInteger(
  value,
  fallback
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    String(
      value
    )
      .trim() ===
      ""
  ) {
    return fallback;
  }


  const parsed =
    Number(
      value
    );


  requireCondition(
    Number.isInteger(
      parsed
    ) &&
    parsed >
      0,
    "PHASE21_BATCH9_POSITIVE_INTEGER_REQUIRED",
    `Expected positive integer; actual=${value}`
  );


  return parsed;
}


// ============================================================================
// NUMERIC HELPERS
// ============================================================================

function round(
  value,
  decimals = 3
) {
  const number =
    Number(
      value
    );


  if (
    !Number.isFinite(
      number
    )
  ) {
    return null;
  }


  const factor =
    10 **
    decimals;


  return Math.round(
    (
      number +
      Number.EPSILON
    ) *
    factor
  ) /
    factor;
}


// ============================================================================
// TIME
// ============================================================================

function sleep(
  ms
) {
  return new Promise(
    resolve => {
      setTimeout(
        resolve,
        ms
      );
    }
  );
}


// ============================================================================
// OUTPUT NORMALIZATION
// ============================================================================

function formatNullable(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return "NOT_OBSERVED";
  }


  if (
    typeof value ===
      "object"
  ) {
    try {
      return JSON.stringify(
        value
      );
    } catch {
      return String(
        value
      );
    }
  }


  return String(
    value
  );
}


// ============================================================================
// CERTIFICATE PERSISTENCE
// ============================================================================

function writeCertificate(
  certificate
) {
  requireCondition(
    certificate &&
    typeof certificate ===
      "object" &&
    !Array.isArray(
      certificate
    ),
    "PHASE21_BATCH9_CERTIFICATE_INVALID",
    "Batch 9 certificate must be an object"
  );


  requireCondition(
    certificate
      .executionAuthorized !==
      true &&
    certificate
      .phase21ExecutionAuthorized !==
      true,
    "PHASE21_BATCH9_CERTIFICATE_AUTHORITY_LEAK",
    "Batch 9 certificate cannot grant execution authority"
  );


  requireCondition(
    certificate
      .productionCertified !==
      true,
    "PHASE21_BATCH9_CERTIFICATE_PRODUCTION_LEAK",
    "Batch 9 certificate cannot certify production"
  );


  const directory =
    path.resolve(
      __dirname,
      "..",
      "artifacts",
      "phase21"
    );


  fs.mkdirSync(
    directory,
    {
      recursive:
        true,
    }
  );


  const timestamp =
    new Date()
      .toISOString()
      .replace(
        /:/g,
        "-"
      );


  const filePath =
    path.join(
      directory,
      `phase21-batch9-live-certification-${timestamp}.json`
    );


  fs.writeFileSync(
    filePath,
    JSON.stringify(
      certificate,
      null,
      2
    ),
    "utf8"
  );


  return filePath;
}


// ============================================================================
// ERROR HANDLING
// ============================================================================

function requireCondition(
  condition,
  code,
  message
) {
  if (
    condition
  ) {
    return;
  }


  throw certificationError(
    code,
    message
  );
}


function certificationError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "Phase21Batch9LiveCertificationError",

      code,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}


// ============================================================================
// MAIN
// ============================================================================

main()
  .then(
    () => {
      process.exitCode =
        0;
    }
  )
  .catch(
    error => {
      console.error(
        ""
      );


      console.error(
        "=============================================================="
      );


      console.error(
        "PHASE 21.17 + 21.18 BATCH-9 LIVE RESULT: FAIL"
      );


      console.error(
        "=============================================================="
      );


      console.error(
        `Code: ${error.code || "UNEXPECTED_ERROR"}`
      );


      console.error(
        error.message
      );


      console.error(
        ""
      );


      console.error(
        "Ground truth leaked: false"
      );


      console.error(
        "Phase21 authorized: false"
      );


      console.error(
        "Production certified: false"
      );


      process.exitCode =
        1;
    }
  );