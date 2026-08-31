"use strict";


const PROBE_VERSION =
  "21.10B-live-provider-v1";


const STATES =
  Object.freeze({
    HEALTHY:
      "HEALTHY",

    DEGRADED:
      "DEGRADED",

    SATURATED:
      "SATURATED",

    BROKEN:
      "BROKEN",

    LOAD_GENERATOR_LIMIT:
      "LOAD_GENERATOR_LIMIT",
  });


// ============================================================================
// PROBE
// ============================================================================

class LiveProviderCapacityProbe {
  constructor(
    options = {}
  ) {
    if (
      typeof options.executor !==
      "function"
    ) {
      throw probeError(
        "PHASE21_CAPACITY_EXECUTOR_REQUIRED",

        "Live provider capacity probe requires an executor"
      );
    }


    this.provider =
      options.provider ||
      "unknown";


    this.operation =
      options.operation ||
      "unknown";


    this.executor =
      options.executor;


    this.baselineRatePerSecond =
      positiveNumber(
        options.baselineRatePerSecond,
        2
      );


    this.stageDurationSeconds =
      positiveNumber(
        options.stageDurationSeconds,
        10
      );


    this.maxConcurrency =
      positiveInteger(
        options.maxConcurrency,
        64
      );


    this.requestTimeoutMs =
      positiveInteger(
        options.requestTimeoutMs,
        10000
      );


    this.tickMs =
      positiveInteger(
        options.tickMs,
        10
      );
  }


  async run(
    rates = []
  ) {
    const normalizedRates =
      normalizeRates(
        rates
      );


    if (
      normalizedRates.length ===
      0
    ) {
      throw probeError(
        "PHASE21_CAPACITY_RATES_REQUIRED",

        "At least one capacity rate is required"
      );
    }


    const startedAt =
      new Date();


    const baseline =
      await this.runStage(
        "BASELINE",
        this.baselineRatePerSecond
      );


    const baselineHealthy =
      baseline.successRate >=
        0.99 &&
      baseline.errorRate <=
        0.01 &&
      baseline.timedOutRequests ===
        0 &&
      baseline.generatorDroppedRequests ===
        0;


    if (
      !baselineHealthy
    ) {
      throw probeError(
        "PHASE21_CAPACITY_BASELINE_UNHEALTHY",

        `${this.provider} baseline is unhealthy`
      );
    }


    const stages = [];


    let safeSustainedRatePerSecond =
      baseline
        .successfulRatePerSecond;


    let degradationPoint =
      null;


    let saturationPoint =
      null;


    let breakingPoint =
      null;


    let loadGeneratorLimit =
      null;


    for (
      const rate
      of normalizedRates
    ) {
      const stage =
        await this.runStage(
          "CAPACITY_RAMP",
          rate
        );


      const evaluation =
        evaluateStage(
          baseline,
          stage
        );


      const enriched = {
        ...stage,

        capacityState:
          evaluation.state,

        capacitySignals:
          evaluation.signals,

        executionAuthorized:
          false,
      };


      stages.push(
        enriched
      );


      if (
        evaluation.state ===
        STATES.HEALTHY
      ) {
        safeSustainedRatePerSecond =
          enriched
            .successfulRatePerSecond;
      }


      if (
        !degradationPoint &&
        [
          STATES.DEGRADED,
          STATES.SATURATED,
          STATES.BROKEN,
        ].includes(
          evaluation.state
        )
      ) {
        degradationPoint =
          pointFromStage(
            enriched
          );
      }


      if (
        !saturationPoint &&
        [
          STATES.SATURATED,
          STATES.BROKEN,
        ].includes(
          evaluation.state
        )
      ) {
        saturationPoint =
          pointFromStage(
            enriched
          );
      }


      if (
        !breakingPoint &&
        evaluation.state ===
          STATES.BROKEN
      ) {
        breakingPoint =
          pointFromStage(
            enriched
          );
      }


      if (
        !loadGeneratorLimit &&
        evaluation.state ===
          STATES.LOAD_GENERATOR_LIMIT
      ) {
        loadGeneratorLimit =
          pointFromStage(
            enriched
          );
      }


      /*
       * Stop after a hard system failure or after the load
       * generator itself becomes the limiting factor.
       */
      if (
        [
          STATES.BROKEN,
          STATES.LOAD_GENERATOR_LIMIT,
        ].includes(
          evaluation.state
        )
      ) {
        break;
      }
    }


    const recoveryStarted =
      Date.now();


    const recoveryMetrics =
      await this.runStage(
        "RECOVERY",
        this.baselineRatePerSecond
      );


    const recoveryEvaluation =
      evaluateRecovery(
        baseline,
        recoveryMetrics,
        Date.now() -
          recoveryStarted
      );


    return {
      probeVersion:
        PROBE_VERSION,

      provider:
        this.provider,

      operation:
        this.operation,

      startedAt:
        startedAt
          .toISOString(),

      completedAt:
        new Date()
          .toISOString(),

      baseline,

      stages,

      safeSustainedRatePerSecond,

      degradationPoint,

      saturationPoint,

      breakingPoint,

      loadGeneratorLimit,

      recovery: {
        metrics:
          recoveryMetrics,

        evaluation:
          recoveryEvaluation,
      },

      executionAuthorized:
        false,
    };
  }


  async runStage(
    stage,
    targetRatePerSecond
  ) {
    const durationMs =
      Math.round(
        this.stageDurationSeconds *
        1000
      );


    const expectedRequests =
      Math.max(
        1,

        Math.floor(
          targetRatePerSecond *
          this.stageDurationSeconds
        )
      );


    const started =
      Date.now();


    const latencies = [];


    let launchedRequests =
      0;

    let completedRequests =
      0;

    let successfulRequests =
      0;

    let failedRequests =
      0;

    let timedOutRequests =
      0;

    let rateLimitedRequests =
      0;

    let providerRejectedRequests =
      0;

    let generatorDroppedRequests =
      0;

    let active =
      0;


    const pending =
      new Set();


    const launch =
      () => {
        if (
          launchedRequests >=
          expectedRequests
        ) {
          return;
        }


        if (
          active >=
          this.maxConcurrency
        ) {
          generatorDroppedRequests +=
            1;

          launchedRequests +=
            1;

          return;
        }


        launchedRequests +=
          1;

        active +=
          1;


        const requestStarted =
          process
            .hrtime
            .bigint();


        const task =
          withTimeout(
            Promise.resolve()
              .then(
                () =>
                  this.executor({
                    provider:
                      this.provider,

                    operation:
                      this.operation,

                    stage,

                    targetRatePerSecond,

                    sequence:
                      launchedRequests,

                    executionAuthorized:
                      false,
                  })
              ),

            this.requestTimeoutMs
          )
            .then(
              (
                result
              ) => {
                successfulRequests +=
                  1;


                const elapsed =
                  Number(
                    process
                      .hrtime
                      .bigint() -
                    requestStarted
                  ) /
                  1_000_000;


                latencies.push(
                  elapsed
                );


                return result;
              }
            )
            .catch(
              (
                error
              ) => {
                failedRequests +=
                  1;


                if (
                  error
                    ?.code ===
                    "PHASE21_CAPACITY_REQUEST_TIMEOUT" ||
                  /timeout/i.test(
                    String(
                      error
                        ?.message ||
                      ""
                    )
                  )
                ) {
                  timedOutRequests +=
                    1;
                }


                if (
                  error
                    ?.statusCode ===
                    429 ||
                  error
                    ?.code ===
                    "WEBHOOK_RATE_LIMITED"
                ) {
                  rateLimitedRequests +=
                    1;
                }


                if (
                  error
                    ?.code ===
                    "CAPACITY_REJECTED" ||
                  error
                    ?.code ===
                    "WEBHOOK_REMOTE_ERROR"
                ) {
                  providerRejectedRequests +=
                    1;
                }
              }
            )
            .finally(
              () => {
                active -=
                  1;

                completedRequests +=
                  1;
              }
            );


        pending.add(
          task
        );


        task.finally(
          () => {
            pending.delete(
              task
            );
          }
        );
      };


    while (
      Date.now() -
        started <
      durationMs
    ) {
      const elapsedSeconds =
        (
          Date.now() -
          started
        ) /
        1000;


      const shouldHaveLaunched =
        Math.min(
          expectedRequests,

          Math.floor(
            elapsedSeconds *
            targetRatePerSecond
          )
        );


      let due =
        shouldHaveLaunched -
        launchedRequests;


      while (
        due >
          0
      ) {
        launch();

        due -=
          1;
      }


      await sleep(
        this.tickMs
      );
    }


    while (
      launchedRequests <
      expectedRequests
    ) {
      launch();
    }


    await Promise.allSettled(
      [
        ...pending,
      ]
    );


    const actualDurationMs =
      Math.max(
        1,

        Date.now() -
        started
      );


    const accountedRequests =
      successfulRequests +
      failedRequests +
      generatorDroppedRequests;


    const successRate =
      accountedRequests >
        0
        ? successfulRequests /
          accountedRequests
        : 0;


    const errorRate =
      accountedRequests >
        0
        ? (
            failedRequests +
            generatorDroppedRequests
          ) /
          accountedRequests
        : 1;


    return {
      metricsVersion:
        PROBE_VERSION,

      stage,

      targetRatePerSecond,

      durationMs:
        actualDurationMs,

      expectedRequests,

      launchedRequests,

      completedRequests,

      totalRequests:
        accountedRequests,

      successfulRequests,

      failedRequests,

      rejectedRequests:
        providerRejectedRequests,

      timedOutRequests,

      rateLimitedRequests,

      generatorDroppedRequests,

      achievedRatePerSecond:
        accountedRequests /
        (
          actualDurationMs /
          1000
        ),

      successfulRatePerSecond:
        successfulRequests /
        (
          actualDurationMs /
          1000
        ),

      successRate,

      errorRate,

      p50LatencyMs:
        percentile(
          latencies,
          50
        ),

      p95LatencyMs:
        percentile(
          latencies,
          95
        ),

      p99LatencyMs:
        percentile(
          latencies,
          99
        ),

      minLatencyMs:
        latencies.length
          ? Math.min(
              ...latencies
            )
          : null,

      maxLatencyMs:
        latencies.length
          ? Math.max(
              ...latencies
            )
          : null,

      executionAuthorized:
        false,
    };
  }
}


// ============================================================================
// EVALUATION
// ============================================================================

function evaluateStage(
  baseline,
  stage
) {
  const baselineP95 =
    finiteOr(
      baseline
        .p95LatencyMs,
      1
    );


  const latencyFactor =
    stage.p95LatencyMs ===
      null
      ? null
      : stage.p95LatencyMs /
        Math.max(
          baselineP95,
          1
        );


  const throughputEfficiency =
    stage.targetRatePerSecond >
      0
      ? stage
          .successfulRatePerSecond /
        stage
          .targetRatePerSecond
      : 0;


  const signals = {
    successRate:
      stage.successRate,

    errorRate:
      stage.errorRate,

    latencyFactor,

    throughputEfficiency,

    timedOutRequests:
      stage.timedOutRequests,

    rejectedRequests:
      stage.rejectedRequests,

    rateLimitedRequests:
      stage.rateLimitedRequests,

    generatorDroppedRequests:
      stage.generatorDroppedRequests,
  };


  /*
   * Load-generator pressure is reported separately from
   * provider/AIRA saturation.
   */
  if (
    stage.generatorDroppedRequests >
      0 ||
    throughputEfficiency <
      0.75 &&
    stage.failedRequests ===
      0
  ) {
    return {
      state:
        STATES.LOAD_GENERATOR_LIMIT,

      signals,
    };
  }


  if (
    stage.successRate <
      0.80 ||
    stage.errorRate >
      0.20 ||
    stage.timedOutRequests >
      Math.max(
        1,
        stage.totalRequests *
          0.05
      )
  ) {
    return {
      state:
        STATES.BROKEN,

      signals,
    };
  }


  if (
    stage.successRate <
      0.95 ||
    stage.errorRate >
      0.05 ||
    throughputEfficiency <
      0.75 ||
    (
      latencyFactor !==
        null &&
      latencyFactor >
        6
    )
  ) {
    return {
      state:
        STATES.SATURATED,

      signals,
    };
  }


  if (
    stage.successRate <
      0.99 ||
    stage.errorRate >
      0.01 ||
    throughputEfficiency <
      0.90 ||
    stage.rejectedRequests >
      0 ||
    stage.rateLimitedRequests >
      0 ||
    (
      latencyFactor !==
        null &&
      latencyFactor >
        3
    )
  ) {
    return {
      state:
        STATES.DEGRADED,

      signals,
    };
  }


  return {
    state:
      STATES.HEALTHY,

    signals,
  };
}


function evaluateRecovery(
  baseline,
  recovery,
  recoveryDurationMs
) {
  const baselineHealthy =
    baseline.successRate >=
      0.99 &&
    baseline.errorRate <=
      0.01 &&
    baseline.timedOutRequests ===
      0;


  const recoveryHealthy =
    recovery.successRate >=
      0.99 &&
    recovery.errorRate <=
      0.01 &&
    recovery.timedOutRequests ===
      0 &&
    recovery.generatorDroppedRequests ===
      0;


  const baselineP95 =
    finiteOr(
      baseline
        .p95LatencyMs,
      1
    );


  const recoveryP95 =
    finiteOr(
      recovery
        .p95LatencyMs,
      baselineP95
    );


  const latencyRestored =
    recoveryP95 <=
      Math.max(
        baselineP95 *
          2,
        baselineP95 +
          10
      );


  const successRateRestored =
    recovery.successRate >=
      Math.max(
        0.99,
        baseline.successRate -
          0.01
      );


  return {
    recovered:
      baselineHealthy &&
      recoveryHealthy &&
      latencyRestored &&
      successRateRestored,

    baselineHealthy,

    recoveryHealthy,

    latencyRestored,

    successRateRestored,

    recoveryDurationMs,

    baselineP95LatencyMs:
      baseline
        .p95LatencyMs,

    recoveryP95LatencyMs:
      recovery
        .p95LatencyMs,

    baselineSuccessRate:
      baseline
        .successRate,

    recoverySuccessRate:
      recovery
        .successRate,

    executionAuthorized:
      false,
  };
}


// ============================================================================
// HELPERS
// ============================================================================

function pointFromStage(
  stage
) {
  return {
    targetRatePerSecond:
      stage
        .targetRatePerSecond,

    achievedRatePerSecond:
      stage
        .achievedRatePerSecond,

    successfulRatePerSecond:
      stage
        .successfulRatePerSecond,

    successRate:
      stage
        .successRate,

    errorRate:
      stage
        .errorRate,

    p95LatencyMs:
      stage
        .p95LatencyMs,

    p99LatencyMs:
      stage
        .p99LatencyMs,

    capacityState:
      stage
        .capacityState,

    executionAuthorized:
      false,
  };
}


function percentile(
  values,
  percentage
) {
  if (
    !Array.isArray(
      values
    ) ||
    values.length ===
      0
  ) {
    return null;
  }


  const sorted =
    [
      ...values,
    ].sort(
      (
        left,
        right
      ) =>
        left -
        right
    );


  const index =
    Math.min(
      sorted.length -
        1,

      Math.max(
        0,

        Math.ceil(
          (
            percentage /
            100
          ) *
          sorted.length
        ) -
          1
      )
    );


  return Number(
    sorted[
      index
    ].toFixed(
      4
    )
  );
}


function normalizeRates(
  rates
) {
  return [
    ...new Set(
      (
        Array.isArray(
          rates
        )
          ? rates
          : []
      )
        .map(
          Number
        )
        .filter(
          (
            value
          ) =>
            Number.isFinite(
              value
            ) &&
            value >
              0
        )
    ),
  ];
}


function positiveNumber(
  value,
  fallback
) {
  const parsed =
    Number(
      value
    );


  return Number.isFinite(
    parsed
  ) &&
    parsed >
      0
    ? parsed
    : fallback;
}


function positiveInteger(
  value,
  fallback
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );


  return Number.isInteger(
    parsed
  ) &&
    parsed >
      0
    ? parsed
    : fallback;
}


function finiteOr(
  value,
  fallback
) {
  return Number.isFinite(
    Number(
      value
    )
  )
    ? Number(
        value
      )
    : fallback;
}


function sleep(
  milliseconds
) {
  return new Promise(
    (
      resolve
    ) => {
      setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}


function withTimeout(
  promise,
  timeoutMs
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const timer =
        setTimeout(
          () => {
            reject(
              probeError(
                "PHASE21_CAPACITY_REQUEST_TIMEOUT",

                `Capacity request exceeded ${timeoutMs}ms`
              )
            );
          },

          timeoutMs
        );


      Promise.resolve(
        promise
      )
        .then(
          (
            value
          ) => {
            clearTimeout(
              timer
            );

            resolve(
              value
            );
          }
        )
        .catch(
          (
            error
          ) => {
            clearTimeout(
              timer
            );

            reject(
              error
            );
          }
        );
    }
  );
}


function probeError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "LiveProviderCapacityProbeError",

      code,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  LiveProviderCapacityProbe,

  PROBE_VERSION,

  STATES,

  evaluateStage,

  evaluateRecovery,
};