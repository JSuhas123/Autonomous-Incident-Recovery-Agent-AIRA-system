"use strict";


const {
  CHAOS_LOAD_STAGE,

  validateChaosLoadProfile,
} =
  require(
    "./chaosLoadProfiles"
  );


const {
  calculateStageMetrics,

  calculateDegradation,

  calculateRecovery,
} =
  require(
    "./chaosMetrics"
  );


const CHAOS_LOAD_HARNESS_VERSION =
  "21.10A-v1";


class ChaosLoadHarness {
  constructor(
    options =
      {}
  ) {
    if (
      typeof options
        .requestExecutor !==
        "function"
    ) {
      throw harnessError(
        "CHAOS_REQUEST_EXECUTOR_REQUIRED",
        "Chaos Load Harness requires an explicit requestExecutor"
      );
    }


    this.requestExecutor =
      options.requestExecutor;


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
      256;
  }


  async run({
    profile,

    context,

    payloadFactory,
  } = {}) {
    validateChaosLoadProfile(
      profile
    );


    assertLabContext(
      context
    );


    if (
      typeof payloadFactory !==
        "function"
    ) {
      throw harnessError(
        "CHAOS_PAYLOAD_FACTORY_REQUIRED",
        "Chaos Load Harness requires a payloadFactory"
      );
    }


    const stageResults =
      [];


    for (
      const stage
      of profile.stages
    ) {
      const result =
        await this
          .runStage({
            stage,

            context,

            payloadFactory,
          });


      stageResults.push(
        result
      );
    }


    const baseline =
      stageResults.find(
        (
          result
        ) =>
          result.stage ===
          CHAOS_LOAD_STAGE
            .BASELINE
      );


    const recovery =
      stageResults.find(
        (
          result
        ) =>
          result.stage ===
          CHAOS_LOAD_STAGE
            .RECOVERY
      );


    const degradation =
      stageResults
        .filter(
          (
            result
          ) =>
            result.stage !==
              CHAOS_LOAD_STAGE
                .BASELINE &&

            result.stage !==
              CHAOS_LOAD_STAGE
                .RECOVERY
        )
        .map(
          (
            result
          ) => ({
            stage:
              result.stage,

            ...calculateDegradation({
              baseline,

              current:
                result,
            }),
          })
        );


    const recoveryEvaluation =
      calculateRecovery({
        baseline,

        recovery,

        recoveryDurationMs:
          recovery
            ?.durationMs,
      });


    return deepFreeze({
      harnessVersion:
        CHAOS_LOAD_HARNESS_VERSION,

      profileKey:
        profile.key,

      startedFromHealthyBaseline:
        true,

      stages:
        stageResults,

      degradation,

      recovery:
        recoveryEvaluation,

      executionAuthorized:
        false,
    });
  }


  async runStage({
    stage,

    context,

    payloadFactory,
  }) {
    const startedAt =
      this.now();


    const durationMs =
      stage.durationSeconds *
      1000;


    const stopAt =
      startedAt +
      durationMs;


    const intervalMs =
      1000 /
      stage.targetRatePerSecond;


    const samples =
      [];


    const active =
      new Set();


    let sequence =
      0;


    let nextScheduledAt =
      startedAt;


    while (
      this.now() <
      stopAt
    ) {
      /*
       * Hard concurrency protection.
       *
       * When the target becomes slower than the offered load, we do not
       * allocate an unbounded number of promises and accidentally benchmark
       * the load generator instead of AIRA.
       */

      if (
        active.size >=
        this.maxConcurrency
      ) {
        samples.push({
          sequence:
            sequence++,

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
            "CHAOS_GENERATOR_CONCURRENCY_LIMIT",
        });


        await this.sleep(
          Math.max(
            1,
            intervalMs
          )
        );


        continue;
      }


      const scheduledAt =
        nextScheduledAt;


      nextScheduledAt +=
        intervalMs;


      const delay =
        scheduledAt -
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


      const currentSequence =
        sequence++;


      const promise =
        this.executeOne({
          stage,

          context,

          payloadFactory,

          sequence:
            currentSequence,
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


    const endedAt =
      this.now();


    return calculateStageMetrics({
      stage:
        stage.stage,

      targetRatePerSecond:
        stage.targetRatePerSecond,

      durationMs:
        Math.max(
          endedAt -
          startedAt,
          1
        ),

      samples,
    });
  }


  async executeOne({
    stage,

    context,

    payloadFactory,

    sequence,
  }) {
    const startedAt =
      this.now();


    try {
      const payload =
        payloadFactory({
          stage:
            stage.stage,

          sequence,

          context,
        });


      const result =
        await this
          .requestExecutor({
            stage:
              stage.stage,

            sequence,

            payload,

            context: {
              ...context,

              executionAuthorized:
                false,
            },
          });


      const latencyMs =
        Math.max(
          this.now() -
          startedAt,
          0
        );


      return {
        sequence,

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

        latencyMs,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      return {
        sequence,

        success:
          false,

        rejected:
          error?.rejected ===
          true,

        timedOut:
          error?.timedOut ===
            true ||
          error?.code ===
            "ETIMEDOUT",

        rateLimited:
          error?.rateLimited ===
            true ||
          error?.statusCode ===
            429,

        statusCode:
          error?.statusCode ||
          null,

        errorCode:
          error?.code ||
          "CHAOS_REQUEST_FAILED",

        latencyMs:
          Math.max(
            this.now() -
            startedAt,
            0
          ),

        executionAuthorized:
          false,
      };
    }
  }
}


function assertLabContext(
  context
) {
  if (
    !context ||

    typeof context !==
      "object"
  ) {
    throw harnessError(
      "CHAOS_LAB_CONTEXT_REQUIRED",
      "Chaos Load Harness requires lab context"
    );
  }


  if (
    context.reliabilityLab !==
      true
  ) {
    throw harnessError(
      "CHAOS_RELIABILITY_LAB_ONLY",
      "Chaos testing is restricted to the Reliability Lab"
    );
  }


  if (
    context.safetyClass !==
      "LAB_ONLY"
  ) {
    throw harnessError(
      "CHAOS_LAB_ONLY_REQUIRED",
      "Chaos testing requires LAB_ONLY safety class"
    );
  }


  if (
    context.production ===
      true
  ) {
    throw harnessError(
      "CHAOS_PRODUCTION_FORBIDDEN",
      "Chaos/load certification cannot target production"
    );
  }


  if (
    context.executionAuthorized ===
      true
  ) {
    throw harnessError(
      "CHAOS_CANNOT_AUTHORIZE_EXECUTION",
      "Chaos testing cannot grant execution authorization"
    );
  }
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


function harnessError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "ReliabilityChaosLoadHarnessError",

      code,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  CHAOS_LOAD_HARNESS_VERSION,

  ChaosLoadHarness,

  assertLabContext,

  harnessError,
};