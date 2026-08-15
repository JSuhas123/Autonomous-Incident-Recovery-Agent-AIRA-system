"use strict";

/**
 * AIRA Metrics Verification Service
 *
 * Phase 9.4
 *
 * Verifies post-execution metrics against:
 *
 * - explicit thresholds
 * - expected values
 * - optional pre-incident baselines
 *
 * Supports:
 *
 * - CPU
 * - memory
 * - latency
 * - error rate
 * - saturation
 * - throughput
 * - generic custom numeric metrics
 *
 * DOES NOT:
 *
 * - mark incident recovered
 * - trigger rollback
 * - authorize execution
 */

const {
  VERIFICATION_DIMENSION,
  VERIFICATION_CHECK_STATUS,
  createVerificationCheckResult,
} =
  require(
    "./verificationContracts"
  );

class MetricsVerificationService {
  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async verify(
    input = {},
    dependencies = {}
  ) {
    this.assertInput(
      input
    );

    const metricChecks =
      input.verificationPlan
        .checks
        .filter(
          (
            check
          ) =>
            check.dimension ===
            VERIFICATION_DIMENSION
              .METRICS
        );

    const results =
      [];

    for (
      const check
      of metricChecks
    ) {
      results.push(
        await this.verifyCheck(
          check,
          input,
          dependencies
        )
      );
    }

    return {
      dimension:
        VERIFICATION_DIMENSION
          .METRICS,

      checkCount:
        results.length,

      passedCount:
        results.filter(
          (
            result
          ) =>
            result.passed ===
            true
        )
          .length,

      failedCount:
        results.filter(
          (
            result
          ) =>
            result.failed ===
            true
        )
          .length,

      inconclusiveCount:
        results.filter(
          (
            result
          ) =>
            result.inconclusive ===
            true
        )
          .length,

      checks:
        results,

      executionAuthorized:
        false,

      verificationVersion:
        "phase9.4-v1",
    };
  }

  // ==========================================================================
  // CHECK ROUTER
  // ==========================================================================

  async verifyCheck(
    check,
    input,
    dependencies
  ) {
    const type =
      normalizeText(
        check.type
      );

    if (
      [
        "cpu_recovery",
        "cpu",
      ].includes(
        type
      )
    ) {
      return this.verifyUpperBoundMetric(
        check,
        input,
        dependencies,
        {
          metric:
            "cpu",

          defaultThreshold:
            80,

          unit:
            "%",
        }
      );
    }

    if (
      [
        "memory_recovery",
        "memory",
      ].includes(
        type
      )
    ) {
      return this.verifyUpperBoundMetric(
        check,
        input,
        dependencies,
        {
          metric:
            "memory",

          defaultThreshold:
            85,

          unit:
            "%",
        }
      );
    }

    if (
      [
        "latency_recovery",
        "latency",
      ].includes(
        type
      )
    ) {
      return this.verifyUpperBoundMetric(
        check,
        input,
        dependencies,
        {
          metric:
            "latency",

          defaultThreshold:
            null,

          unit:
            "ms",
        }
      );
    }

    if (
      [
        "error_rate_recovery",
        "error_rate",
      ].includes(
        type
      )
    ) {
      return this.verifyUpperBoundMetric(
        check,
        input,
        dependencies,
        {
          metric:
            "error_rate",

          defaultThreshold:
            null,

          unit:
            "%",
        }
      );
    }

    if (
      [
        "saturation_recovery",
        "saturation",
      ].includes(
        type
      )
    ) {
      return this.verifyUpperBoundMetric(
        check,
        input,
        dependencies,
        {
          metric:
            "saturation",

          defaultThreshold:
            null,

          unit:
            "%",
        }
      );
    }

    if (
      [
        "throughput_recovery",
        "throughput",
      ].includes(
        type
      )
    ) {
      return this.verifyLowerBoundMetric(
        check,
        input,
        dependencies,
        {
          metric:
            "throughput",

          defaultThreshold:
            null,
        }
      );
    }

    if (
      [
        "metric_threshold",
        "custom_metric",
      ].includes(
        type
      )
    ) {
      return this.verifyCustomMetric(
        check,
        input,
        dependencies
      );
    }

    return createVerificationCheckResult({
      checkId:
        check.checkId,

      dimension:
        VERIFICATION_DIMENSION
          .METRICS,

      status:
        VERIFICATION_CHECK_STATUS
          .INCONCLUSIVE,

      reasons: [
        `Unsupported metrics verification type: ${check.type}`,
      ],

      warnings: [
        "No matching metric verifier is registered.",
      ],

      metadata: {
        verifier:
          "metricsVerificationService",
      },
    });
  }

  // ==========================================================================
  // UPPER-BOUND METRIC
  // ==========================================================================

  async verifyUpperBoundMetric(
    check,
    input,
    dependencies,
    options
  ) {
    const observation =
      await this.getMetricObservation(
        check,
        input,
        dependencies,
        options.metric
      );

    if (
      observation.error
    ) {
      return observation.error;
    }

    const threshold =
      firstFiniteNumber(
        check.threshold,
        check.expectedValue,
        observation.baselineThreshold,
        options.defaultThreshold
      );

    if (
      threshold ===
      null
    ) {
      return createVerificationCheckResult({
        checkId:
          check.checkId,

        dimension:
          VERIFICATION_DIMENSION
            .METRICS,

        status:
          VERIFICATION_CHECK_STATUS
            .INCONCLUSIVE,

        observedValue:
          observation.value,

        baselineValue:
          observation.baseline,

        evidence:
          observation.evidence,

        reasons: [
          `No recovery threshold is available for metric ${options.metric}.`,
        ],

        metadata: {
          metric:
            options.metric,

          verifier:
            "upper_bound_metric",
        },
      });
    }

    const passed =
      observation.value <=
      threshold;

    return createVerificationCheckResult({
      checkId:
        check.checkId,

      dimension:
        VERIFICATION_DIMENSION
          .METRICS,

      status:
        passed
          ? VERIFICATION_CHECK_STATUS
              .PASSED
          : VERIFICATION_CHECK_STATUS
              .FAILED,

      score:
        this.calculateUpperBoundScore(
          observation.value,
          threshold
        ),

      observedValue:
        observation.value,

      expectedValue:
        threshold,

      baselineValue:
        observation.baseline,

      evidence:
        observation.evidence,

      reasons: [
        passed
          ? `${options.metric} is within recovery threshold.`
          : `${options.metric} remains above recovery threshold.`,
      ],

      metadata: {
        metric:
          options.metric,

        unit:
          options.unit ||
          null,

        comparison:
          "<=",

        threshold,

        verifier:
          "upper_bound_metric",
      },
    });
  }

  // ==========================================================================
  // LOWER-BOUND METRIC
  // ==========================================================================

  async verifyLowerBoundMetric(
    check,
    input,
    dependencies,
    options
  ) {
    const observation =
      await this.getMetricObservation(
        check,
        input,
        dependencies,
        options.metric
      );

    if (
      observation.error
    ) {
      return observation.error;
    }

    const threshold =
      firstFiniteNumber(
        check.threshold,
        check.expectedValue,
        observation.baselineThreshold,
        options.defaultThreshold
      );

    if (
      threshold ===
      null
    ) {
      return createVerificationCheckResult({
        checkId:
          check.checkId,

        dimension:
          VERIFICATION_DIMENSION
            .METRICS,

        status:
          VERIFICATION_CHECK_STATUS
            .INCONCLUSIVE,

        observedValue:
          observation.value,

        baselineValue:
          observation.baseline,

        evidence:
          observation.evidence,

        reasons: [
          `No recovery threshold is available for metric ${options.metric}.`,
        ],

        metadata: {
          metric:
            options.metric,

          verifier:
            "lower_bound_metric",
        },
      });
    }

    const passed =
      observation.value >=
      threshold;

    return createVerificationCheckResult({
      checkId:
        check.checkId,

      dimension:
        VERIFICATION_DIMENSION
          .METRICS,

      status:
        passed
          ? VERIFICATION_CHECK_STATUS
              .PASSED
          : VERIFICATION_CHECK_STATUS
              .FAILED,

      score:
        this.calculateLowerBoundScore(
          observation.value,
          threshold
        ),

      observedValue:
        observation.value,

      expectedValue:
        threshold,

      baselineValue:
        observation.baseline,

      evidence:
        observation.evidence,

      reasons: [
        passed
          ? `${options.metric} satisfies recovery threshold.`
          : `${options.metric} remains below recovery threshold.`,
      ],

      metadata: {
        metric:
          options.metric,

        comparison:
          ">=",

        threshold,

        verifier:
          "lower_bound_metric",
      },
    });
  }

  // ==========================================================================
  // CUSTOM METRIC
  // ==========================================================================

  async verifyCustomMetric(
    check,
    input,
    dependencies
  ) {
    const metric =
      check.parameters
        ?.metric ||
      check.metric ||
      null;

    if (
      !metric
    ) {
      return createVerificationCheckResult({
        checkId:
          check.checkId,

        dimension:
          VERIFICATION_DIMENSION
            .METRICS,

        status:
          VERIFICATION_CHECK_STATUS
            .INCONCLUSIVE,

        reasons: [
          "Custom metric verification requires metric name.",
        ],
      });
    }

    const observation =
      await this.getMetricObservation(
        check,
        input,
        dependencies,
        metric
      );

    if (
      observation.error
    ) {
      return observation.error;
    }

    const operator =
      normalizeOperator(
        check.parameters
          ?.operator ||
        check.operator ||
        "<="
      );

    const threshold =
      firstFiniteNumber(
        check.threshold,
        check.expectedValue,
        check.parameters
          ?.threshold
      );

    if (
      threshold ===
      null
    ) {
      return createVerificationCheckResult({
        checkId:
          check.checkId,

        dimension:
          VERIFICATION_DIMENSION
            .METRICS,

        status:
          VERIFICATION_CHECK_STATUS
            .INCONCLUSIVE,

        observedValue:
          observation.value,

        evidence:
          observation.evidence,

        reasons: [
          "Custom metric verification requires numeric threshold.",
        ],
      });
    }

    const passed =
      compareNumeric(
        observation.value,
        threshold,
        operator
      );

    return createVerificationCheckResult({
      checkId:
        check.checkId,

      dimension:
        VERIFICATION_DIMENSION
          .METRICS,

      status:
        passed
          ? VERIFICATION_CHECK_STATUS
              .PASSED
          : VERIFICATION_CHECK_STATUS
              .FAILED,

      score:
        passed
          ? 1
          : 0,

      observedValue:
        observation.value,

      expectedValue:
        threshold,

      baselineValue:
        observation.baseline,

      evidence:
        observation.evidence,

      reasons: [
        passed
          ? `Metric ${metric} satisfied ${operator} ${threshold}.`
          : `Metric ${metric} failed ${operator} ${threshold}.`,
      ],

      metadata: {
        metric,

        comparison:
          operator,

        threshold,

        verifier:
          "custom_metric",
      },
    });
  }

  // ==========================================================================
  // OBSERVATION
  // ==========================================================================

  async getMetricObservation(
    check,
    input,
    dependencies,
    metric
  ) {
    if (
      typeof dependencies
        .getMetricValue !==
      "function"
    ) {
      return {
        error:
          createVerificationCheckResult({
            checkId:
              check.checkId,

            dimension:
              VERIFICATION_DIMENSION
                .METRICS,

            status:
              VERIFICATION_CHECK_STATUS
                .INCONCLUSIVE,

            reasons: [
              "Metric provider is unavailable.",
            ],

            metadata: {
              metric,

              verifier:
                "metricsVerificationService",
            },
          }),
      };
    }

    const startedAt =
      new Date();

    try {
      const result =
        await this.withTimeout(
          dependencies
            .getMetricValue({
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              incidentId:
                input.incidentId,

              executionRequestId:
                input.executionRequestId,

              metric,

              serviceId:
                input.context
                  ?.service
                  ?.id ||
                null,

              resourceId:
                input.context
                  ?.resource
                  ?.id ||
                null,

              parameters:
                check.parameters ||
                {},
            }),

          check.timeoutMs
        );

      const value =
        Number(
          result
            ?.value ??
          result
            ?.currentValue
        );

      if (
        !Number.isFinite(
          value
        )
      ) {
        return {
          error:
            createVerificationCheckResult({
              checkId:
                check.checkId,

              dimension:
                VERIFICATION_DIMENSION
                  .METRICS,

              status:
                VERIFICATION_CHECK_STATUS
                  .INCONCLUSIVE,

              reasons: [
                `Metric ${metric} did not return a numeric value.`,
              ],

              evidence:
                result
                  ?.evidence ||
                [],

              startedAt,

              completedAt:
                new Date(),

              metadata: {
                metric,
              },
            }),
        };
      }

      let baseline =
        null;

      let baselineThreshold =
        null;

      if (
        Number.isFinite(
          Number(
            result
              ?.baseline
          )
        )
      ) {
        baseline =
          Number(
            result.baseline
          );
      } else if (
        typeof dependencies
          .getMetricBaseline ===
        "function"
      ) {
        const baselineResult =
          await dependencies
            .getMetricBaseline({
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              incidentId:
                input.incidentId,

              metric,

              serviceId:
                input.context
                  ?.service
                  ?.id ||
                null,

              parameters:
                check.parameters ||
                {},
            });

        if (
          Number.isFinite(
            Number(
              baselineResult
                ?.value
            )
          )
        ) {
          baseline =
            Number(
              baselineResult.value
            );
        }

        if (
          Number.isFinite(
            Number(
              baselineResult
                ?.recoveryThreshold
            )
          )
        ) {
          baselineThreshold =
            Number(
              baselineResult
                .recoveryThreshold
            );
        }
      }

      return {
        value,

        baseline,

        baselineThreshold,

        evidence:
          result
            ?.evidence ||
          [],

        startedAt,

        completedAt:
          new Date(),
      };
    } catch (
      error
    ) {
      const timedOut =
        error.code ===
        "METRICS_VERIFICATION_TIMEOUT";

      return {
        error:
          createVerificationCheckResult({
            checkId:
              check.checkId,

            dimension:
              VERIFICATION_DIMENSION
                .METRICS,

            status:
              timedOut
                ? VERIFICATION_CHECK_STATUS
                    .TIMED_OUT
                : VERIFICATION_CHECK_STATUS
                    .ERROR,

            reasons: [
              String(
                error.message ||
                "Metrics verification failed"
              ),
            ],

            warnings: [
              error.code ||
              "METRICS_VERIFICATION_ERROR",
            ],

            startedAt,

            completedAt:
              new Date(),

            metadata: {
              metric,
            },
          }),
      };
    }
  }

  // ==========================================================================
  // SCORE
  // ==========================================================================

  calculateUpperBoundScore(
    value,
    threshold
  ) {
    if (
      threshold <=
      0
    ) {
      return value <=
        threshold
        ? 1
        : 0;
    }

    if (
      value <=
      threshold
    ) {
      return 1;
    }

    return Math.max(
      0,
      Math.min(
        1,
        threshold /
        value
      )
    );
  }

  calculateLowerBoundScore(
    value,
    threshold
  ) {
    if (
      threshold <=
      0
    ) {
      return 1;
    }

    if (
      value >=
      threshold
    ) {
      return 1;
    }

    return Math.max(
      0,
      Math.min(
        1,
        value /
        threshold
      )
    );
  }

  // ==========================================================================
  // TIMEOUT
  // ==========================================================================

  async withTimeout(
    promise,
    timeoutMs
  ) {
    const timeout =
      Number.isFinite(
        Number(
          timeoutMs
        )
      )
        ? Math.max(
            1,
            Number(
              timeoutMs
            )
          )
        : 60000;

    let timer;

    try {
      return await Promise.race([
        promise,

        new Promise(
          (
            _resolve,
            reject
          ) => {
            timer =
              setTimeout(
                () => {
                  reject(
                    Object.assign(
                      new Error(
                        `Metrics verification timed out after ${timeout}ms`
                      ),
                      {
                        code:
                          "METRICS_VERIFICATION_TIMEOUT",
                      }
                    )
                  );
                },
                timeout
              );
          }
        ),
      ]);
    } finally {
      if (
        timer
      ) {
        clearTimeout(
          timer
        );
      }
    }
  }

  // ==========================================================================
  // INPUT
  // ==========================================================================

  assertInput(
    input
  ) {
    if (
      !input ||
      typeof input !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Metrics verification input is required"
        ),
        {
          code:
            "METRICS_VERIFICATION_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.organizationId ||
      !input.environmentId ||
      !input.incidentId
    ) {
      throw Object.assign(
        new Error(
          "Metrics verification requires organization, environment and incident scope"
        ),
        {
          code:
            "METRICS_VERIFICATION_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !input.executionRequestId
    ) {
      throw Object.assign(
        new Error(
          "Metrics verification requires executionRequestId"
        ),
        {
          code:
            "METRICS_VERIFICATION_EXECUTION_REQUEST_REQUIRED",
        }
      );
    }

    if (
      !input.verificationPlan ||
      !Array.isArray(
        input
          .verificationPlan
          .checks
      )
    ) {
      throw Object.assign(
        new Error(
          "Metrics verification requires verification plan"
        ),
        {
          code:
            "METRICS_VERIFICATION_PLAN_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Metrics verification cannot authorize execution"
        ),
        {
          code:
            "METRICS_VERIFICATION_UNSAFE_INPUT",
        }
      );
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeText(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return "";
  }

  return String(
    value
  )
    .trim()
    .toLowerCase();
}

function firstFiniteNumber(
  ...values
) {
  for (
    const value
    of values
  ) {
    if (
      value ===
        null ||
      value ===
        undefined ||
      value ===
        ""
    ) {
      continue;
    }

    const numeric =
      Number(
        value
      );

    if (
      Number.isFinite(
        numeric
      )
    ) {
      return numeric;
    }
  }

  return null;
}

function normalizeOperator(
  value
) {
  const operator =
    String(
      value ||
      "<="
    )
      .trim();

  const allowed = [
    "<",
    "<=",
    ">",
    ">=",
    "==",
    "!=",
  ];

  return allowed.includes(
    operator
  )
    ? operator
    : "<=";
}

function compareNumeric(
  observed,
  threshold,
  operator
) {
  switch (
    operator
  ) {
    case "<":
      return observed <
        threshold;

    case "<=":
      return observed <=
        threshold;

    case ">":
      return observed >
        threshold;

    case ">=":
      return observed >=
        threshold;

    case "==":
      return observed ===
        threshold;

    case "!=":
      return observed !==
        threshold;

    default:
      return false;
  }
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  new MetricsVerificationService();

module.exports
  .MetricsVerificationService =
  MetricsVerificationService;