"use strict";


const {
  DEFAULT_EVIDENCE_REQUIREMENTS,

  EVIDENCE_SUFFICIENCY_STATUS,

  EVIDENCE_SUFFICIENCY_VERSION,
} =
  require(
    "../../constants/recoveryCertificationMetrics"
  );


class EvidenceSufficiencyService {
  evaluate(
    input = {}
  ) {
    const statistics =
      input.statistics;


    if (
      !statistics ||
      typeof statistics !==
        "object"
    ) {
      throw sufficiencyError(
        "CERTIFICATION_STATISTICS_REQUIRED",

        "statistics are required"
      );
    }


    if (
      statistics.executionAuthorized ===
        true
    ) {
      throw sufficiencyError(
        "CERTIFICATION_SUFFICIENCY_AUTHORITY_LEAK",

        "Evidence sufficiency cannot consume an authorizing statistics result"
      );
    }


    const requirements =
      normalizeRequirements(
        input.requirements
      );


    const now =
      input.now
        ? new Date(
            input.now
          )
        : new Date();


    if (
      Number.isNaN(
        now.getTime()
      )
    ) {
      throw sufficiencyError(
        "CERTIFICATION_NOW_INVALID",

        "now must be a valid date"
      );
    }


    const checks =
      [];


    checks.push(
      thresholdCheck({
        key:
          "MINIMUM_SAMPLE_COUNT",

        actual:
          statistics.totalTests,

        expected:
          requirements
            .minimumSamples,

        pass:
          statistics.totalTests >=
          requirements
            .minimumSamples,
      })
    );


    checks.push(
      thresholdCheck({
        key:
          "INDEPENDENT_EXPERIMENT_COUNT",

        actual:
          statistics
            .independentExperimentCount,

        expected:
          requirements
            .minimumIndependentExperiments,

        pass:
          statistics
            .independentExperimentCount >=
          requirements
            .minimumIndependentExperiments,
      })
    );


    checks.push(
      thresholdCheck({
        key:
          "FAILURE_MODE_DIVERSITY",

        actual:
          statistics
            .failureModeCount,

        expected:
          requirements
            .minimumFailureModes,

        pass:
          statistics
            .failureModeCount >=
          requirements
            .minimumFailureModes,
      })
    );


    checks.push(
      thresholdCheck({
        key:
          "INFRASTRUCTURE_CONTEXT_DIVERSITY",

        actual:
          statistics
            .infrastructureContextCount,

        expected:
          requirements
            .minimumInfrastructureContexts,

        pass:
          statistics
            .infrastructureContextCount >=
          requirements
            .minimumInfrastructureContexts,
      })
    );


    checks.push(
      rateThresholdCheck({
        key:
          "VERIFICATION_COVERAGE",

        metric:
          statistics
            .rates
            ?.verificationCoverage,

        minimum:
          requirements
            .minimumVerificationCoverage,
      })
    );


    checks.push(
      rateThresholdCheck({
        key:
          "EVIDENCE_COMPLETENESS",

        metric:
          statistics
            .rates
            ?.evidenceCompleteness,

        minimum:
          requirements
            .minimumEvidenceCompleteness,
      })
    );


    const criticalMetrics = [
      [
        "DIAGNOSIS_SAMPLE_COUNT",
        statistics
          .rates
          ?.diagnosisCorrect,
      ],

      [
        "RECOVERY_VERIFICATION_SAMPLE_COUNT",
        statistics
          .rates
          ?.verifiedRecovery,
      ],

      [
        "FALSE_RECOVERY_SAMPLE_COUNT",
        statistics
          .rates
          ?.falseRecovery,
      ],
    ];


    for (
      const [
        key,
        metric,
      ]
      of criticalMetrics
    ) {
      checks.push(
        thresholdCheck({
          key,

          actual:
            metric
              ?.denominator ||
            0,

          expected:
            requirements
              .minimumCriticalMetricSamples,

          pass:
            (
              metric
                ?.denominator ||
              0
            ) >=
            requirements
              .minimumCriticalMetricSamples,
        })
      );
    }


    checks.push(
      evidenceAgeCheck({
        latestEvidence:
          statistics
            .evidenceWindow
            ?.latest,

        now,

        maximumAgeDays:
          requirements
            .maximumEvidenceAgeDays,
      })
    );


    const safetyChecks =
      createSafetyChecks(
        statistics,
        requirements
      );


    const safetyBlocked =
      safetyChecks.some(
        check =>
          check.pass ===
            false
      );


    const evidenceChecksPassed =
      checks.every(
        check =>
          check.pass ===
            true
      );


    const status =
      safetyBlocked
        ? EVIDENCE_SUFFICIENCY_STATUS
            .SAFETY_BLOCKED

        : evidenceChecksPassed
          ? EVIDENCE_SUFFICIENCY_STATUS
              .SUFFICIENT

          : EVIDENCE_SUFFICIENCY_STATUS
              .INSUFFICIENT_EVIDENCE;


    return Object.freeze({
      sufficiencyVersion:
        EVIDENCE_SUFFICIENCY_VERSION,

      status,

      sufficient:
        status ===
        EVIDENCE_SUFFICIENCY_STATUS
          .SUFFICIENT,

      safetyBlocked,

      requirements,

      checks:
        Object.freeze(
          checks
        ),

      safetyChecks:
        Object.freeze(
          safetyChecks
        ),

      failedChecks:
        Object.freeze([
          ...checks,

          ...safetyChecks,
        ]
          .filter(
            check =>
              check.pass ===
                false
          )
          .map(
            check =>
              check.key
          )),

      confidenceSummary:
        buildConfidenceSummary(
          statistics
        ),

      /*
       * Evidence sufficiency is not an autonomy level.
       * It is also never execution authority.
       */
      qualifiedLevel:
        null,

      executionAuthorized:
        false,

      productionCertified:
        false,
    });
  }
}


function normalizeRequirements(
  overrides
) {
  const value = {
    ...DEFAULT_EVIDENCE_REQUIREMENTS,

    ...(
      overrides ||
      {}
    ),
  };


  const numericFields = [
    "minimumSamples",

    "minimumIndependentExperiments",

    "minimumFailureModes",

    "minimumInfrastructureContexts",

    "minimumVerificationCoverage",

    "minimumEvidenceCompleteness",

    "minimumCriticalMetricSamples",

    "maximumEvidenceAgeDays",
  ];


  for (
    const field
    of numericFields
  ) {
    if (
      typeof value[field] !==
        "number" ||

      !Number.isFinite(
        value[field]
      ) ||

      value[field] <
        0
    ) {
      throw sufficiencyError(
        "CERTIFICATION_REQUIREMENT_INVALID",

        `${field} must be a non-negative finite number`
      );
    }
  }


  if (
    value.minimumVerificationCoverage >
      1 ||

    value.minimumEvidenceCompleteness >
      1
  ) {
    throw sufficiencyError(
      "CERTIFICATION_RATE_REQUIREMENT_INVALID",

      "coverage requirements must be between 0 and 1"
    );
  }


  return Object.freeze(
    value
  );
}


function thresholdCheck({
  key,
  actual,
  expected,
  pass,
}) {
  return Object.freeze({
    key,

    actual,

    expected,

    pass:
      pass ===
      true,
  });
}


function rateThresholdCheck({
  key,
  metric,
  minimum,
}) {
  const actual =
    metric?.rate ??
    null;


  return thresholdCheck({
    key,

    actual,

    expected:
      minimum,

    pass:
      actual !==
        null &&

      actual >=
        minimum,
  });
}


function evidenceAgeCheck({
  latestEvidence,
  now,
  maximumAgeDays,
}) {
  if (
    !latestEvidence
  ) {
    return thresholdCheck({
      key:
        "EVIDENCE_FRESHNESS",

      actual:
        null,

      expected:
        maximumAgeDays,

      pass:
        false,
    });
  }


  const latest =
    new Date(
      latestEvidence
    );


  if (
    Number.isNaN(
      latest.getTime()
    )
  ) {
    return thresholdCheck({
      key:
        "EVIDENCE_FRESHNESS",

      actual:
        null,

      expected:
        maximumAgeDays,

      pass:
        false,
    });
  }


  const ageMs =
    Math.max(
      0,

      now.getTime() -
      latest.getTime()
    );


  const ageDays =
    ageMs /
    (
      24 *
      60 *
      60 *
      1000
    );


  return thresholdCheck({
    key:
      "EVIDENCE_FRESHNESS",

    actual:
      ageDays,

    expected:
      maximumAgeDays,

    pass:
      ageDays <=
      maximumAgeDays,
  });
}


function createSafetyChecks(
  statistics,
  requirements
) {
  const checks =
    [];


  if (
    requirements
      .requireZeroUnauthorizedActions
  ) {
    checks.push(
      thresholdCheck({
        key:
          "ZERO_UNAUTHORIZED_ACTIONS",

        actual:
          statistics
            .safety
            ?.unauthorizedActionCount ??
          0,

        expected:
          0,

        pass:
          (
            statistics
              .safety
              ?.unauthorizedActionCount ??
            0
          ) ===
          0,
      })
    );
  }


  if (
    requirements
      .requireZeroAuthorityLeaks
  ) {
    checks.push(
      thresholdCheck({
        key:
          "ZERO_AUTHORITY_LEAKS",

        actual:
          statistics
            .safety
            ?.authorityLeakCount ??
          0,

        expected:
          0,

        pass:
          (
            statistics
              .safety
              ?.authorityLeakCount ??
            0
          ) ===
          0,
      })
    );
  }


  if (
    requirements
      .requireZeroSafetyViolations
  ) {
    checks.push(
      thresholdCheck({
        key:
          "ZERO_SAFETY_VIOLATIONS",

        actual:
          statistics
            .safety
            ?.safetyViolationCount ??
          0,

        expected:
          0,

        pass:
          (
            statistics
              .safety
              ?.safetyViolationCount ??
            0
          ) ===
          0,
      })
    );
  }


  return checks;
}


function buildConfidenceSummary(
  statistics
) {
  const keys = [
    "diagnosisCorrect",

    "recoverySelectionCorrect",

    "executionSuccess",

    "verifiedRecovery",

    "falseRecovery",

    "recurrence",

    "rollbackSuccess",
  ];


  return Object.freeze(
    Object.fromEntries(
      keys.map(
        key => [
          key,

          Object.freeze({
            samples:
              statistics
                .rates
                ?.[key]
                ?.denominator ??
              0,

            observedRate:
              statistics
                .rates
                ?.[key]
                ?.rate ??
              null,

            lower95:
              statistics
                .rates
                ?.[key]
                ?.confidence
                ?.lower ??
              null,

            upper95:
              statistics
                .rates
                ?.[key]
                ?.confidence
                ?.upper ??
              null,
          }),
        ]
      )
    )
  );
}


function sufficiencyError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "EvidenceSufficiencyError",

      code,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}


module.exports = {
  EvidenceSufficiencyService,

  normalizeRequirements,
};