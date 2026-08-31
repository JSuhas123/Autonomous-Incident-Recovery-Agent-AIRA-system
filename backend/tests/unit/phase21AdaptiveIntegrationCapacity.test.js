"use strict";


const {
  CAPACITY_STATE,

  evaluateCapacityStage,

  calculateThroughputEfficiency,
} =
  require(
    "../../services/reliability/chaos/capacityThresholdEvaluator"
  );


const {
  AdaptiveCapacityRunner,

  DEFAULT_RATE_STEPS,

  validateRates,
} =
  require(
    "../../services/reliability/chaos/adaptiveCapacityRunner"
  );


const {
  createCapacityDriver,

  buildProviderPayload,
} =
  require(
    "../../services/reliability/chaos/integrationCapacityDriverRegistry"
  );


function labContext(
  overrides =
    {}
) {
  return {
    reliabilityLab:
      true,

    safetyClass:
      "LAB_ONLY",

    production:
      false,

    organizationId:
      "aira-dev-org",

    environmentId:
      "env_aira_development",

    labEnvironmentId:
      "lab_primary",

    executionAuthorized:
      false,

    ...overrides,
  };
}


describe(
  "Phase 21.10B capacity threshold evaluation",

  () => {
    const baseline = {
      targetRatePerSecond:
        100,

      successfulRatePerSecond:
        100,

      successRate:
        1,

      errorRate:
        0,

      timedOutRequests:
        0,

      rejectedRequests:
        0,

      rateLimitedRequests:
        0,

      p95LatencyMs:
        10,
    };


    test(
      "healthy stage remains healthy",

      () => {
        const result =
          evaluateCapacityStage({
            baseline,

            current: {
              targetRatePerSecond:
                100,

              successfulRatePerSecond:
                99,

              successRate:
                0.995,

              errorRate:
                0.005,

              timedOutRequests:
                0,

              rejectedRequests:
                0,

              rateLimitedRequests:
                0,

              p95LatencyMs:
                15,
            },
          });


        expect(
          result.state
        ).toBe(
          CAPACITY_STATE
            .HEALTHY
        );
      }
    );


    test(
      "latency degradation is detected",

      () => {
        const result =
          evaluateCapacityStage({
            baseline,

            current: {
              targetRatePerSecond:
                100,

              successfulRatePerSecond:
                100,

              successRate:
                1,

              errorRate:
                0,

              timedOutRequests:
                0,

              rejectedRequests:
                0,

              rateLimitedRequests:
                0,

              p95LatencyMs:
                25,
            },
          });


        expect(
          result.state
        ).toBe(
          CAPACITY_STATE
            .DEGRADED
        );
      }
    );


    test(
      "timeout is considered broken capacity",

      () => {
        const result =
          evaluateCapacityStage({
            baseline,

            current: {
              targetRatePerSecond:
                100,

              successfulRatePerSecond:
                99,

              successRate:
                0.99,

              errorRate:
                0.01,

              timedOutRequests:
                1,

              rejectedRequests:
                0,

              rateLimitedRequests:
                0,

              p95LatencyMs:
                15,
            },
          });


        expect(
          result.state
        ).toBe(
          CAPACITY_STATE
            .BROKEN
        );
      }
    );


    test(
      "throughput efficiency compares successful throughput to requested load",

      () => {
        expect(
          calculateThroughputEfficiency({
            targetRatePerSecond:
              1000,

            successfulRatePerSecond:
              750,
          })
        ).toBe(
          0.75
        );
      }
    );
  }
);


describe(
  "Phase 21.10B adaptive rate definition",

  () => {
    test(
      "default capacity steps are strictly increasing",

      () => {
        expect(
          () =>
            validateRates(
              DEFAULT_RATE_STEPS
            )
        ).not.toThrow();
      }
    );


    test(
      "duplicate or descending rates fail closed",

      () => {
        expect(
          () =>
            validateRates([
              10,
              100,
              100,
              50,
            ])
        ).toThrow(
          expect.objectContaining({
            code:
              "CAPACITY_RATES_INVALID",
          })
        );
      }
    );
  }
);


describe(
  "Phase 21.10B Phase-20 adapter capacity drivers",

  () => {
    test(
      "incoming webhook uses actual adapter boundary",

      async () => {
        const driver =
          createCapacityDriver(
            "webhook_incoming"
          );


        const result =
          await driver.execute({
            payload:
              buildProviderPayload(
                "webhook_incoming",
                1
              ),
          });


        expect(
          result.success
        ).toBe(
          true
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "Prometheus uses actual normalization adapter",

      async () => {
        const driver =
          createCapacityDriver(
            "prometheus_alertmanager"
          );


        const result =
          await driver.execute({
            payload:
              buildProviderPayload(
                "prometheus_alertmanager",
                1
              ),
          });


        expect(
          result.success
        ).toBe(
          true
        );


        expect(
          result.providerResultPresent
        ).toBe(
          true
        );
      }
    );


    test(
      "contract-only provider is not disguised as live",

      async () => {
        const driver =
          createCapacityDriver(
            "pagerduty"
          );


        const result =
          await driver
            .execute({
              payload: {},
            });


        expect(
          driver.mode
        ).toBe(
          "CONTRACT_ONLY"
        );


        expect(
          result.contractOnly
        ).toBe(
          true
        );
      }
    );
  }
);


describe(
  "Phase 21.10B Adaptive Capacity Runner",

  () => {
    test(
      "discovers degradation and breaking point",

      async () => {
        let clock =
          0;


        let activeRate =
          0;


        const runner =
          new AdaptiveCapacityRunner({
            now:
              () =>
                clock,

            sleep:
              async (
                ms
              ) => {
                clock +=
                  Math.max(
                    ms,
                    1
                  );
              },

            stageDurationSeconds:
              1,

            baselineRatePerSecond:
              2,

            maxConcurrency:
              32,

            executor:
              async (
                input
              ) => {
                activeRate =
                  input.context
                    .testRate ||
                  activeRate;


                clock +=
                  activeRate >=
                    8
                    ? 100
                    : 5;


                if (
                  activeRate >=
                    16
                ) {
                  return {
                    success:
                      false,

                    timedOut:
                      true,

                    errorCode:
                      "TEST_TIMEOUT",
                  };
                }


                return {
                  success:
                    true,

                  statusCode:
                    200,
                };
              },
          });


        /*
         * Use an executor wrapper so the synthetic rate is observable by
         * the test without coupling production runner code to test internals.
         */

        runner.executor =
          async (
            input
          ) => {
            const rate =
              input.payload
                .rate;


            clock +=
              rate >=
                8
                ? 100
                : 5;


            if (
              rate >=
                16
            ) {
              return {
                success:
                  false,

                timedOut:
                  true,

                errorCode:
                  "TEST_TIMEOUT",
              };
            }


            return {
              success:
                true,

              statusCode:
                200,
            };
          };


        const result =
          await runner.run({
            provider:
              "test-provider",

            context:
              labContext(),

            rates: [
              4,
              8,
              16,
            ],

            stageDurationSeconds:
              1,

            payloadFactory:
              ({
                stage,
              }) => ({
                stage,

                /*
                 * Map stage to deterministic synthetic load.
                 */
                rate:
                  stage ===
                    "BASELINE"
                    ? 2
                    : stage ===
                        "RECOVERY"
                      ? 2
                      : activeRate,
              }),
          });


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );


        expect(
          result.baseline
        ).toBeDefined();


        expect(
          result.recovery
        ).toBeDefined();
      }
    );


    test(
      "production context is rejected",

      async () => {
        const runner =
          new AdaptiveCapacityRunner({
            executor:
              async () => ({
                success:
                  true,
              }),
          });


        await expect(
          runner.run({
            provider:
              "webhook_incoming",

            context:
              labContext({
                production:
                  true,
              }),

            rates: [
              10,
            ],

            payloadFactory:
              () => ({}),
          })
        ).rejects.toMatchObject({
          code:
            "CAPACITY_PRODUCTION_FORBIDDEN",

          executionAuthorized:
            false,
        });
      }
    );
  }
);