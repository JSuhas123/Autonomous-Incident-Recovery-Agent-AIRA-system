"use strict";


const {
  CERTIFICATION_STATISTICS_VERSION,
} =
  require(
    "../../constants/recoveryCertificationMetrics"
  );


class RecoveryOutcomeStatisticsService {
  calculate(
    input = {}
  ) {
    const samples =
      normalizeSamples(
        input.samples
      );


    if (
      samples.length ===
        0
    ) {
      return emptyStatistics();
    }


    const diagnosis =
      booleanMetric(
        samples,
        "diagnosisCorrect"
      );


    const recoverySelection =
      booleanMetric(
        samples,
        "recoverySelectionCorrect"
      );


    const execution =
      conditionalBooleanMetric(
        samples,
        sample =>
          sample.executionAttempted ===
            true,
        "executionSucceeded"
      );


    const verifiedRecovery =
      conditionalBooleanMetric(
        samples,
        sample =>
          sample.executionAttempted ===
            true,
        "recoveryVerified"
      );


    const falseRecovery =
      booleanMetric(
        samples,
        "falseRecovery"
      );


    const recurrence =
      booleanMetric(
        samples,
        "recurrenceDetected"
      );


    const rollback =
      conditionalBooleanMetric(
        samples,
        sample =>
          sample.rollbackAttempted ===
            true,
        "rollbackSucceeded"
      );


    const escalation =
      booleanMetric(
        samples,
        "manualEscalation"
      );


    const verificationCoverage =
      coverageMetric(
        samples,
        "verificationPerformed"
      );


    const evidenceCompleteness =
      coverageMetric(
        samples,
        "evidenceComplete"
      );


    const unauthorizedActionCount =
      countTrue(
        samples,
        "unauthorizedAction"
      );


    const authorityLeakCount =
      countTrue(
        samples,
        "authorityLeak"
      );


    const safetyViolationCount =
      countTrue(
        samples,
        "safetyViolation"
      );


    const experimentIds =
      uniqueNonEmpty(
        samples.map(
          sample =>
            sample.experimentRunId
        )
      );


    const failureModes =
      uniqueNonEmpty(
        samples.map(
          sample =>
            sample.failureMode
        )
      );


    const infrastructureContexts =
      uniqueNonEmpty(
        samples.map(
          sample =>
            sample.infrastructureContext
        )
      );


    const timestamps =
      samples
        .map(
          sample =>
            sample.observedAt
        )
        .filter(
          Boolean
        )
        .map(
          value =>
            new Date(
              value
            )
        )
        .filter(
          value =>
            !Number.isNaN(
              value.getTime()
            )
        );


    const evidenceWindow =
      calculateEvidenceWindow(
        timestamps
      );


    return Object.freeze({
      statisticsVersion:
        CERTIFICATION_STATISTICS_VERSION,

      totalTests:
        samples.length,

      independentExperimentCount:
        experimentIds.length,

      failureModeCount:
        failureModes.length,

      infrastructureContextCount:
        infrastructureContexts.length,

      experimentRunIds:
        experimentIds,

      failureModes,

      infrastructureContexts,

      evidenceWindow,

      rates: {
        diagnosisCorrect:
          diagnosis,

        recoverySelectionCorrect:
          recoverySelection,

        executionSuccess:
          execution,

        verifiedRecovery,

        falseRecovery,

        recurrence,

        rollbackSuccess:
          rollback,

        manualEscalation:
          escalation,

        verificationCoverage,

        evidenceCompleteness,
      },

      safety: {
        unauthorizedActionCount,

        authorityLeakCount,

        safetyViolationCount,

        clean:
          unauthorizedActionCount ===
            0 &&

          authorityLeakCount ===
            0 &&

          safetyViolationCount ===
            0,
      },

      executionAuthorized:
        false,

      productionCertified:
        false,
    });
  }
}


function normalizeSamples(
  input
) {
  if (
    !Array.isArray(
      input
    )
  ) {
    throw statisticsError(
      "CERTIFICATION_SAMPLES_REQUIRED",

      "samples must be an array"
    );
  }


  return input.map(
    (
      sample,
      index
    ) => {
      if (
        !sample ||
        typeof sample !==
          "object" ||
        Array.isArray(
          sample
        )
      ) {
        throw statisticsError(
          "CERTIFICATION_SAMPLE_INVALID",

          `samples[${index}] must be an object`
        );
      }


      if (
        sample.executionAuthorized ===
          true
      ) {
        throw statisticsError(
          "CERTIFICATION_STATISTICS_AUTHORITY_LEAK",

          "Phase-22 statistics input cannot grant execution authorization"
        );
      }


      return sample;
    }
  );
}


function booleanMetric(
  samples,
  field
) {
  const assessed =
    samples.filter(
      sample =>
        typeof sample[field] ===
          "boolean"
    );


  const numerator =
    assessed.filter(
      sample =>
        sample[field] ===
          true
    ).length;


  return rateMetric(
    numerator,
    assessed.length
  );
}


function conditionalBooleanMetric(
  samples,
  predicate,
  field
) {
  const eligible =
    samples.filter(
      predicate
    );


  const assessed =
    eligible.filter(
      sample =>
        typeof sample[field] ===
          "boolean"
    );


  const numerator =
    assessed.filter(
      sample =>
        sample[field] ===
          true
    ).length;


  return rateMetric(
    numerator,
    assessed.length
  );
}


function coverageMetric(
  samples,
  field
) {
  const numerator =
    samples.filter(
      sample =>
        sample[field] ===
          true
    ).length;


  return rateMetric(
    numerator,
    samples.length
  );
}


function rateMetric(
  numerator,
  denominator
) {
  const rate =
    denominator >
      0
      ? numerator /
        denominator
      : null;


  const confidence =
    denominator >
      0
      ? wilsonInterval(
          numerator,
          denominator
        )
      : {
          lower:
            null,

          upper:
            null,

          confidenceLevel:
            0.95,
        };


  return Object.freeze({
    numerator,

    denominator,

    rate,

    percentage:
      rate ===
        null
        ? null
        : rate *
          100,

    confidence,
  });
}


function wilsonInterval(
  successes,
  total,
  z =
    1.959963984540054
) {
  if (
    !Number.isInteger(
      successes
    ) ||
    !Number.isInteger(
      total
    ) ||
    total <=
      0 ||
    successes <
      0 ||
    successes >
      total
  ) {
    throw statisticsError(
      "CERTIFICATION_WILSON_INPUT_INVALID",

      "Wilson interval requires 0 <= successes <= total and total > 0"
    );
  }


  const p =
    successes /
    total;


  const zSquared =
    z *
    z;


  const denominator =
    1 +
    zSquared /
      total;


  const centre =
    p +
    zSquared /
      (
        2 *
        total
      );


  const margin =
    z *
    Math.sqrt(
      (
        p *
        (
          1 -
          p
        ) +
        zSquared /
          (
            4 *
            total
          )
      ) /
      total
    );


  return Object.freeze({
    lower:
      clamp01(
        (
          centre -
          margin
        ) /
        denominator
      ),

    upper:
      clamp01(
        (
          centre +
          margin
        ) /
        denominator
      ),

    confidenceLevel:
      0.95,
  });
}


function countTrue(
  samples,
  field
) {
  return samples.filter(
    sample =>
      sample[field] ===
        true
  ).length;
}


function uniqueNonEmpty(
  values
) {
  return [
    ...new Set(
      values.filter(
        value =>
          value !==
            undefined &&

          value !==
            null &&

          value !==
            ""
      )
    ),
  ];
}


function calculateEvidenceWindow(
  timestamps
) {
  if (
    timestamps.length ===
      0
  ) {
    return Object.freeze({
      earliest:
        null,

      latest:
        null,

      durationMs:
        null,
    });
  }


  const milliseconds =
    timestamps.map(
      value =>
        value.getTime()
    );


  const earliest =
    Math.min(
      ...milliseconds
    );


  const latest =
    Math.max(
      ...milliseconds
    );


  return Object.freeze({
    earliest:
      new Date(
        earliest
      )
        .toISOString(),

    latest:
      new Date(
        latest
      )
        .toISOString(),

    durationMs:
      latest -
      earliest,
  });
}


function emptyStatistics() {
  return Object.freeze({
    statisticsVersion:
      CERTIFICATION_STATISTICS_VERSION,

    totalTests:
      0,

    independentExperimentCount:
      0,

    failureModeCount:
      0,

    infrastructureContextCount:
      0,

    experimentRunIds:
      [],

    failureModes:
      [],

    infrastructureContexts:
      [],

    evidenceWindow: {
      earliest:
        null,

      latest:
        null,

      durationMs:
        null,
    },

    rates: {
      diagnosisCorrect:
        rateMetric(
          0,
          0
        ),

      recoverySelectionCorrect:
        rateMetric(
          0,
          0
        ),

      executionSuccess:
        rateMetric(
          0,
          0
        ),

      verifiedRecovery:
        rateMetric(
          0,
          0
        ),

      falseRecovery:
        rateMetric(
          0,
          0
        ),

      recurrence:
        rateMetric(
          0,
          0
        ),

      rollbackSuccess:
        rateMetric(
          0,
          0
        ),

      manualEscalation:
        rateMetric(
          0,
          0
        ),

      verificationCoverage:
        rateMetric(
          0,
          0
        ),

      evidenceCompleteness:
        rateMetric(
          0,
          0
        ),
    },

    safety: {
      unauthorizedActionCount:
        0,

      authorityLeakCount:
        0,

      safetyViolationCount:
        0,

      clean:
        true,
    },

    executionAuthorized:
      false,

    productionCertified:
      false,
  });
}


function clamp01(
  value
) {
  return Math.max(
    0,

    Math.min(
      1,
      value
    )
  );
}


function statisticsError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "RecoveryOutcomeStatisticsError",

      code,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}


module.exports = {
  RecoveryOutcomeStatisticsService,

  wilsonInterval,

  rateMetric,
};