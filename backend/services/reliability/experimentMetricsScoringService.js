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