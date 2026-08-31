"use strict";

const {
  performance,
} =
  require(
    "node:perf_hooks"
  );


const {
  createTenantStressModel,
  scopeKey,
} =
  require(
    "./tenantIsolationModel"
  );


const {
  evaluateTenantIsolation,
} =
  require(
    "./tenantIsolationAssertions"
  );


const RUNNER_VERSION =
  "21.10C-v1";


class MultiTenantChaosRunner {
  constructor(
    options = {}
  ) {
    if (
      typeof options.executor !==
      "function"
    ) {
      throw Object.assign(
        new Error(
          "Multi-tenant chaos executor is required"
        ),

        {
          name:
            "Phase21MultiTenantChaosRunnerError",

          code:
            "PHASE21_MULTI_TENANT_EXECUTOR_REQUIRED",

          executionAuthorized:
            false,
        }
      );
    }


    this.executor =
      options.executor;


    this.stageDurationMs =
      positiveInteger(
        options.stageDurationMs,
        5000
      );


    this.maxConcurrency =
      positiveInteger(
        options.maxConcurrency,
        256
      );


    this.requestTimeoutMs =
      positiveInteger(
        options.requestTimeoutMs,
        10000
      );
  }


  async run(
    options = {}
  ) {
    const model =
      options.model ||
      createTenantStressModel(
        options
      );


    const observations =
      [];


    const baseline =
      await this.runStage(
        "BASELINE",

        model,

        observations,

        (
          tenant
        ) =>
          tenant
            .baselineRatePerSecond
      );


    const noisyNeighbor =
      await this.runStage(
        "NOISY_NEIGHBOR",

        model,

        observations,

        (
          tenant
        ) =>
          tenant
            .experimentRatePerSecond
      );


    const recovery =
      await this.runStage(
        "RECOVERY",

        model,

        observations,

        (
          tenant
        ) =>
          tenant
            .baselineRatePerSecond
      );


    const baselineByTenant =
      indexByScope(
        baseline.tenants
      );


    const experimentByTenant =
      indexByScope(
        noisyNeighbor
          .tenants
      );


    const isolation =
      evaluateTenantIsolation({
        tenants:
          model.tenants,

        observations,

        baselineByTenant,

        experimentByTenant,

        thresholds:
          options.thresholds,
      });


    const recoveryPassed =
      recovery
        .tenants
        .every(
          (
            tenant
          ) =>
            tenant.errorRate <=
            0.01
        );


    return {
      runnerVersion:
        RUNNER_VERSION,

      model,

      baseline,

      noisyNeighbor,

      recovery,

      isolation,

      recoveryPassed,

      pass:
        isolation.pass &&
        recoveryPassed,

      productionCertified:
        false,

      executionAuthorized:
        false,
    };
  }


  async runStage(
    stage,
    model,
    observations,
    rateSelector
  ) {
    const stageStarted =
      performance.now();


    const states =
      new Map(
        model.tenants
          .map(
            (
              tenant
            ) => [
              scopeKey(
                tenant
              ),

              createState(
                tenant
              ),
            ]
          )
      );


    const inFlight =
      new Set();


    let generatorDroppedRequests =
      0;


    const schedules =
      model.tenants
        .map(
          (
            tenant
          ) => {
            const rate =
              Math.max(
                0,

                Number(
                  rateSelector(
                    tenant
                  )
                ) ||
                0
              );


            const intervalMs =
              rate >
              0
                ? 1000 /
                  rate
                : Number
                    .POSITIVE_INFINITY;


            return {
              tenant,

              rate,

              intervalMs,

              nextAt:
                stageStarted,
            };
          }
        );


    while (
      performance.now() -
      stageStarted <
      this.stageDurationMs
    ) {
      const now =
        performance.now();


      for (
        const schedule
        of schedules
      ) {
        while (
          schedule.rate >
            0 &&
          schedule.nextAt <=
            now
        ) {
          schedule.nextAt +=
            schedule.intervalMs;


          if (
            inFlight.size >=
            this.maxConcurrency
          ) {
            generatorDroppedRequests +=
              1;


            states
              .get(
                scopeKey(
                  schedule.tenant
                )
              )
              .generatorDroppedRequests +=
              1;


            continue;
          }


          const promise =
            this.executeOne(
              stage,

              model,

              schedule.tenant,

              observations,

              states.get(
                scopeKey(
                  schedule.tenant
                )
              )
            )
              .finally(
                () =>
                  inFlight
                    .delete(
                      promise
                    )
              );


          inFlight.add(
            promise
          );
        }
      }


      await sleep(
        1
      );
    }


    await Promise
      .allSettled(
        [
          ...inFlight,
        ]
      );


    const durationSeconds =
      Math.max(
        0.001,

        (
          performance.now() -
          stageStarted
        ) /
        1000
      );


    const tenants =
      [
        ...states.values(),
      ]
        .map(
          (
            state
          ) =>
            finalizeState(
              state,
              durationSeconds
            )
        );


    return {
      stage,

      durationSeconds,

      generatorDroppedRequests,

      tenants,

      executionAuthorized:
        false,
    };
  }


  async executeOne(
    stage,
    model,
    tenant,
    observations,
    state
  ) {
    state.totalRequests +=
      1;


    const started =
      performance.now();


    try {
      const result =
        await withTimeout(
          Promise.resolve(
            this.executor({
              stage,

              runId:
                model.runId,

              tenant,

              scope:
                tenant,

              noisyTenant:
                tenant.role ===
                "NOISY",

              executionAuthorized:
                false,
            })
          ),

          this.requestTimeoutMs
        );


      state.successfulRequests +=
        1;


      if (
        Array.isArray(
          result
            ?.observations
        )
      ) {
        observations.push(
          ...result
            .observations
        );
      }


      if (
        result
          ?.observation
      ) {
        observations.push(
          result
            .observation
        );
      }
    } catch (
      error
    ) {
      state.failedRequests +=
        1;


      if (
        error
          ?.code ===
        "PHASE21_MULTI_TENANT_REQUEST_TIMEOUT"
      ) {
        state.timedOutRequests +=
          1;
      }
    } finally {
      state.latenciesMs
        .push(
          performance.now() -
          started
        );
    }
  }
}


function createState(
  tenant
) {
  return {
    tenantId:
      tenant.tenantId,

    organizationId:
      tenant.organizationId,

    environmentId:
      tenant.environmentId,

    role:
      tenant.role,

    totalRequests:
      0,

    successfulRequests:
      0,

    failedRequests:
      0,

    timedOutRequests:
      0,

    generatorDroppedRequests:
      0,

    latenciesMs:
      [],
  };
}


function finalizeState(
  state,
  durationSeconds
) {
  const sorted =
    [
      ...state.latenciesMs,
    ]
      .sort(
        (
          left,
          right
        ) =>
          left -
          right
      );


  const errorRate =
    state.totalRequests >
    0
      ? state.failedRequests /
        state.totalRequests
      : 0;


  return {
    tenantId:
      state.tenantId,

    organizationId:
      state.organizationId,

    environmentId:
      state.environmentId,

    role:
      state.role,

    totalRequests:
      state.totalRequests,

    successfulRequests:
      state.successfulRequests,

    failedRequests:
      state.failedRequests,

    timedOutRequests:
      state.timedOutRequests,

    generatorDroppedRequests:
      state
        .generatorDroppedRequests,

    successfulRatePerSecond:
      state.successfulRequests /
      durationSeconds,

    errorRate,

    p50LatencyMs:
      percentile(
        sorted,
        0.50
      ),

    p95LatencyMs:
      percentile(
        sorted,
        0.95
      ),

    p99LatencyMs:
      percentile(
        sorted,
        0.99
      ),

    executionAuthorized:
      false,
  };
}


function indexByScope(
  results
) {
  const indexed = {};


  for (
    const result
    of results
  ) {
    indexed[
      scopeKey(
        result
      )
    ] =
      result;
  }


  return indexed;
}


function percentile(
  sorted,
  ratio
) {
  if (
    sorted.length ===
    0
  ) {
    return 0;
  }


  const index =
    Math.min(
      sorted.length -
      1,

      Math.max(
        0,

        Math.ceil(
          sorted.length *
          ratio
        ) -
        1
      )
    );


  return Number(
    sorted[
      index
    ]
      .toFixed(
        4
      )
  );
}


function withTimeout(
  promise,
  timeoutMs
) {
  let timer;


  return Promise.race([
    promise,

    new Promise(
      (
        _,
        reject
      ) => {
        timer =
          setTimeout(
            () =>
              reject(
                Object.assign(
                  new Error(
                    "Multi-tenant request timed out"
                  ),

                  {
                    code:
                      "PHASE21_MULTI_TENANT_REQUEST_TIMEOUT",

                    executionAuthorized:
                      false,
                  }
                )
              ),

            timeoutMs
          );
      }
    ),
  ])
    .finally(
      () =>
        clearTimeout(
          timer
        )
    );
}


function sleep(
  milliseconds
) {
  return new Promise(
    (
      resolve
    ) =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
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


  return (
    Number.isInteger(
      parsed
    ) &&
    parsed >
      0
  )
    ? parsed
    : fallback;
}


module.exports = {
  RUNNER_VERSION,

  MultiTenantChaosRunner,
};