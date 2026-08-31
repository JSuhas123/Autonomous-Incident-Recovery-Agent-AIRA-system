"use strict";


const {
  calculateStageMetrics,

  calculateRecovery,
} =
  require(
    "./chaosMetrics"
  );


const {
  evaluateCapacityStage,

  CAPACITY_STATE,
} =
  require(
    "./capacityThresholdEvaluator"
  );


const ADAPTIVE_CAPACITY_RUNNER_VERSION =
  "21.10B-v1";


const DEFAULT_RATE_STEPS =
  Object.freeze([
    10,
    25,
    50,
    100,
    250,
    500,
    750,
    1000,
    1500,
    2000,
    3000,
    5000,
    7500,
    10000,
  ]);


class AdaptiveCapacityRunner {
  constructor(
    options =
      {}
  ) {
    if (
      typeof options.executor !==
        "function"
    ) {
      throw runnerError(
        "CAPACITY_EXECUTOR_REQUIRED",
        "Adaptive Capacity Runner requires an executor"
      );
    }


    this.executor =
      options.executor;


    this.now =
      options.now ||
      (() =>
        Date.now());


    this.sleep =
      options.sleep ||
      (
        (
          ms
        ) =>
          new Promise(
            (
              resolve
            ) =>
              setTimeout(
                resolve,
                ms
              )
          )
      );


    this.maxConcurrency =
      options.maxConcurrency ||
      512;


    this.defaultStageDurationSeconds =
      options
        .stageDurationSeconds ||
      15;


    this.baselineRatePerSecond =
      options
        .baselineRatePerSecond ||
      5;
  }


  async run({
    provider,

    context,

    payloadFactory,

    rates =
      DEFAULT_RATE_STEPS,

    stageDurationSeconds,

    stopAtBroken =
      true,
  } = {}) {
    requireLabContext(
      context
    );


    requireString(
      provider,
      "provider"
    );


    if (
      typeof payloadFactory !==
        "function"
    ) {
      throw runnerError(
        "CAPACITY_PAYLOAD_FACTORY_REQUIRED",
        "payloadFactory is required"
      );
    }


    validateRates(
      rates
    );


    const durationSeconds =
      stageDurationSeconds ||
      this
        .defaultStageDurationSeconds;


    const startedAt =
      new Date(
        this.now()
      ).toISOString();


    const baseline =
      await this
        .runRate({
          provider,

          rate:
            this
              .baselineRatePerSecond,

          durationSeconds,

          context,

          payloadFactory,

          stage:
            "BASELINE",
        });


    const stages =
      [];


    let degradationPoint =
      null;

    let saturationPoint =
      null;

    let breakingPoint =
      null;

    let safeSustainedRate =
      baseline
        .successfulRatePerSecond;


    for (
      const rate
      of rates
    ) {
      const metrics =
        await this
          .runRate({
            provider,

            rate,

            durationSeconds,

            context,

            payloadFactory,

            stage:
              "CAPACITY_RAMP",
          });


      const evaluation =
        evaluateCapacityStage({
          baseline,

          current:
            metrics,
        });


      const stageResult =
        Object.freeze({
          ...metrics,

          capacityState:
            evaluation.state,

          capacitySignals:
            evaluation.signals,

          executionAuthorized:
            false,
        });


      stages.push(
        stageResult
      );


      if (
        evaluation.state ===
          CAPACITY_STATE
            .HEALTHY
      ) {
        safeSustainedRate =
          metrics
            .successfulRatePerSecond;
      }


      if (
        !degradationPoint &&

        evaluation.state !==
          CAPACITY_STATE
            .HEALTHY
      ) {
        degradationPoint =
          createCapacityPoint(
            stageResult
          );
      }


      if (
        !saturationPoint &&

        [
          CAPACITY_STATE
            .SATURATED,

          CAPACITY_STATE
            .BROKEN,
        ].includes(
          evaluation.state
        )
      ) {
        saturationPoint =
          createCapacityPoint(
            stageResult
          );
      }


      if (
        evaluation.state ===
          CAPACITY_STATE
            .BROKEN
      ) {
        breakingPoint =
          createCapacityPoint(
            stageResult
          );


        if (
          stopAtBroken
        ) {
          break;
        }
      }


      /*
       * Small isolation pause prevents one ramp stage from contaminating
       * the next merely because promises or event-loop work are still
       * settling.
       */

      await this.sleep(
        250
      );
    }


    const recoveryStarted =
      this.now();


    const recovery =
      await this
        .runRate({
          provider,

          rate:
            this
              .baselineRatePerSecond,

          durationSeconds,

          context,

          payloadFactory,

          stage:
            "RECOVERY",
        });


    const recoveryFinished =
      this.now();


    const recoveryEvaluation =
      calculateRecovery({
        baseline,

        recovery,

        recoveryDurationMs:
          Math.max(
            recoveryFinished -
            recoveryStarted,
            0
          ),
      });


    return deepFreeze({
      runnerVersion:
        ADAPTIVE_CAPACITY_RUNNER_VERSION,

      provider,

      startedAt,

      completedAt:
        new Date(
          this.now()
        ).toISOString(),

      baseline,

      stages,

      safeSustainedRatePerSecond:
        round(
          safeSustainedRate
        ),

      degradationPoint,

      saturationPoint,

      breakingPoint,

      recovery: {
        metrics:
          recovery,

        evaluation:
          recoveryEvaluation,
      },

      executionAuthorized:
        false,
    });
  }


  async runRate({
    provider,

    rate,

    durationSeconds,

    context,

    payloadFactory,

    stage,
  }) {
    const started =
      this.now();


    const stopAt =
      started +
      (
        durationSeconds *
        1000
      );


    const intervalMs =
      1000 /
      rate;


    let nextAt =
      started;


    let sequence =
      0;


    const active =
      new Set();


    const samples =
      [];


    while (
      this.now() <
      stopAt
    ) {
      if (
        active.size >=
        this.maxConcurrency
      ) {
        samples.push({
          success:
            false,

          rejected:
            true,

          timedOut:
            false,

          rateLimited:
            false,

          latencyMs:
            0,

          errorCode:
            "CAPACITY_RUNNER_CONCURRENCY_LIMIT",

          executionAuthorized:
            false,
        });


        sequence +=
          1;


        await this.sleep(
          Math.max(
            1,

            intervalMs
          )
        );


        continue;
      }


      const delay =
        nextAt -
        this.now();


      if (
        delay >
        0
      ) {
        await this.sleep(
          delay
        );
      }


      if (
        this.now() >=
        stopAt
      ) {
        break;
      }


      nextAt +=
        intervalMs;


      const currentSequence =
        sequence++;


      let promise;


      promise =
        this.executeOne({
          provider,

          stage,

          rate,

          sequence:
            currentSequence,

          context,

          payloadFactory,
        })
          .then(
            (
              sample
            ) => {
              samples.push(
                sample
              );
            }
          )
          .finally(
            () => {
              active.delete(
                promise
              );
            }
          );


      active.add(
        promise
      );
    }


    await Promise.allSettled(
      [...active]
    );


    const ended =
      this.now();


    return calculateStageMetrics({
      stage,

      targetRatePerSecond:
        rate,

      durationMs:
        Math.max(
          ended -
          started,
          1
        ),

      samples,
    });
  }


  async executeOne({
    provider,

    stage,

    rate,

    sequence,

    context,

    payloadFactory,
  }) {
    const started =
      this.now();


    try {
      const payload =
        payloadFactory({
          provider,

          stage,

          rate,

          sequence,

          context,
        });


      const result =
        await this.executor({
          provider,

          payload,

          sequence,

          stage,

          context: {
            ...context,

            executionAuthorized:
              false,
          },
        });


      return {
        success:
          result?.success ===
          true,

        rejected:
          result?.rejected ===
          true,

        timedOut:
          result?.timedOut ===
          true,

        rateLimited:
          result?.rateLimited ===
          true,

        statusCode:
          result?.statusCode ||
          null,

        errorCode:
          result?.errorCode ||
          null,

        latencyMs:
          Math.max(
            this.now() -
            started,
            0
          ),

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      return {
        success:
          false,

        rejected:
          error.rejected ===
          true,

        timedOut:
          error.timedOut ===
            true ||
          error.code ===
            "ETIMEDOUT",

        rateLimited:
          error.rateLimited ===
            true ||
          error.statusCode ===
            429 ||
          error.status ===
            429,

        statusCode:
          error.statusCode ||
          error.status ||
          null,

        errorCode:
          error.code ||
          "CAPACITY_EXECUTION_FAILED",

        latencyMs:
          Math.max(
            this.now() -
            started,
            0
          ),

        executionAuthorized:
          false,
      };
    }
  }
}


function createCapacityPoint(
  stage
) {
  return Object.freeze({
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
  });
}


function requireLabContext(
  context
) {
  if (
    !context ||

    context.reliabilityLab !==
      true
  ) {
    throw runnerError(
      "CAPACITY_RELIABILITY_LAB_REQUIRED",
      "Capacity testing requires Reliability Lab context"
    );
  }


  if (
    context.safetyClass !==
      "LAB_ONLY"
  ) {
    throw runnerError(
      "CAPACITY_LAB_ONLY_REQUIRED",
      "Capacity testing requires LAB_ONLY safety class"
    );
  }


  if (
    context.production ===
      true
  ) {
    throw runnerError(
      "CAPACITY_PRODUCTION_FORBIDDEN",
      "Capacity testing cannot target production"
    );
  }


  if (
    context.executionAuthorized ===
      true
  ) {
    throw runnerError(
      "CAPACITY_CANNOT_AUTHORIZE_EXECUTION",
      "Capacity testing cannot grant execution authorization"
    );
  }
}


function validateRates(
  rates
) {
  if (
    !Array.isArray(
      rates
    ) ||

    rates.length ===
      0
  ) {
    throw runnerError(
      "CAPACITY_RATES_REQUIRED",
      "At least one capacity rate is required"
    );
  }


  let previous =
    0;


  for (
    const rate
    of rates
  ) {
    if (
      !Number.isFinite(
        rate
      ) ||

      rate <=
        previous
    ) {
      throw runnerError(
        "CAPACITY_RATES_INVALID",
        "Capacity rates must be positive and strictly increasing"
      );
    }


    previous =
      rate;
  }
}


function requireString(
  value,
  field
) {
  if (
    typeof value !==
      "string" ||

    !value.trim()
  ) {
    throw runnerError(
      "CAPACITY_FIELD_REQUIRED",
      `${field} is required`
    );
  }
}


function round(
  value
) {
  return Number(
    Number(
      value
    ).toFixed(
      4
    )
  );
}


function deepFreeze(
  value
) {
  if (
    !value ||

    typeof value !==
      "object" ||

    Object.isFrozen(
      value
    )
  ) {
    return value;
  }


  Object.freeze(
    value
  );


  Object.values(
    value
  ).forEach(
    deepFreeze
  );


  return value;
}


function runnerError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "AdaptiveCapacityRunnerError",

      code,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  ADAPTIVE_CAPACITY_RUNNER_VERSION,

  DEFAULT_RATE_STEPS,

  AdaptiveCapacityRunner,

  createCapacityPoint,

  validateRates,

  runnerError,
};