"use strict";


const {
  CHAOS_LOAD_STAGE,

  getChaosLoadProfile,

  validateChaosLoadProfile,
} =
  require(
    "../../services/reliability/chaos/chaosLoadProfiles"
  );


const {
  calculateStageMetrics,

  calculateDegradation,

  calculateRecovery,

  percentile,
} =
  require(
    "../../services/reliability/chaos/chaosMetrics"
  );


const {
  ChaosLoadHarness,

  assertLabContext,
} =
  require(
    "../../services/reliability/chaos/chaosLoadHarness"
  );


const {
  CAPACITY_TEST_MODE,

  buildIntegrationCapacityRegistry,

  requireProvider,
} =
  require(
    "../../services/reliability/chaos/integrationCapacityRegistry"
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
  "Phase 21.10A chaos load profiles",

  () => {
    test(
      "certification profile always starts with baseline and ends with recovery",

      () => {
        const profile =
          getChaosLoadProfile(
            "CERTIFICATION"
          );


        expect(
          validateChaosLoadProfile(
            profile
          )
        ).toBe(
          true
        );


        expect(
          profile.stages[0]
            .stage
        ).toBe(
          CHAOS_LOAD_STAGE
            .BASELINE
        );


        expect(
          profile.stages[
            profile.stages.length -
            1
          ].stage
        ).toBe(
          CHAOS_LOAD_STAGE
            .RECOVERY
        );
      }
    );


    test(
      "unknown load profile fails closed",

      () => {
        expect(
          () =>
            getChaosLoadProfile(
              "PRODUCTION_ATTACK"
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "CHAOS_LOAD_PROFILE_UNKNOWN",

            executionAuthorized:
              false,
          })
        );
      }
    );
  }
);


describe(
  "Phase 21.10A capacity metrics",

  () => {
    test(
      "calculates deterministic latency percentiles",

      () => {
        expect(
          percentile(
            [
              10,
              20,
              30,
              40,
              50,
            ],
            50
          )
        ).toBe(
          30
        );


        expect(
          percentile(
            [
              10,
              20,
              30,
              40,
              50,
            ],
            95
          )
        ).toBe(
          48
        );
      }
    );


    test(
      "records success failure timeout rejection and rate limiting separately",

      () => {
        const result =
          calculateStageMetrics({
            stage:
              "OVERLOAD",

            targetRatePerSecond:
              100,

            durationMs:
              1000,

            samples: [
              {
                success:
                  true,

                latencyMs:
                  10,
              },

              {
                success:
                  true,

                latencyMs:
                  20,
              },

              {
                success:
                  false,

                rejected:
                  true,

                latencyMs:
                  1,
              },

              {
                success:
                  false,

                timedOut:
                  true,

                latencyMs:
                  5000,
              },

              {
                success:
                  false,

                rateLimited:
                  true,

                latencyMs:
                  5,
              },
            ],
          });


        expect(
          result.totalRequests
        ).toBe(
          5
        );


        expect(
          result.successfulRequests
        ).toBe(
          2
        );


        expect(
          result.failedRequests
        ).toBe(
          3
        );


        expect(
          result.rejectedRequests
        ).toBe(
          1
        );


        expect(
          result.timedOutRequests
        ).toBe(
          1
        );


        expect(
          result.rateLimitedRequests
        ).toBe(
          1
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "computes degradation against baseline",

      () => {
        const degradation =
          calculateDegradation({
            baseline: {
              p95LatencyMs:
                100,

              successRate:
                1,

              errorRate:
                0,

              successfulRatePerSecond:
                100,
            },

            current: {
              p95LatencyMs:
                250,

              successRate:
                0.95,

              errorRate:
                0.05,

              successfulRatePerSecond:
                200,
            },
          });


        expect(
          degradation
            .latencyDegradationFactor
        ).toBe(
          2.5
        );


        expect(
          degradation
            .successRateDelta
        ).toBe(
          -0.05
        );
      }
    );


    test(
      "evaluates return to baseline",

      () => {
        const recovery =
          calculateRecovery({
            baseline: {
              p95LatencyMs:
                100,

              successRate:
                1,
            },

            recovery: {
              p95LatencyMs:
                110,

              successRate:
                0.995,
            },

            recoveryDurationMs:
              42000,
          });


        expect(
          recovery.recovered
        ).toBe(
          true
        );


        expect(
          recovery
            .recoveryDurationMs
        ).toBe(
          42000
        );
      }
    );
  }
);


describe(
  "Phase 21.10A hard chaos safety boundary",

  () => {
    test(
      "accepts Reliability Lab context",

      () => {
        expect(
          assertLabContext(
            labContext()
          )
        ).toBeUndefined();
      }
    );


    test(
      "rejects production",

      () => {
        expect(
          () =>
            assertLabContext(
              labContext({
                production:
                  true,
              })
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "CHAOS_PRODUCTION_FORBIDDEN",
          })
        );
      }
    );


    test(
      "rejects non LAB_ONLY environment",

      () => {
        expect(
          () =>
            assertLabContext(
              labContext({
                safetyClass:
                  "PRODUCTION",
              })
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "CHAOS_LAB_ONLY_REQUIRED",
          })
        );
      }
    );
  }
);


describe(
  "Phase 21.10A load harness",

  () => {
    test(
      "requires explicit request executor",

      () => {
        expect(
          () =>
            new ChaosLoadHarness()
        ).toThrow(
          expect.objectContaining({
            code:
              "CHAOS_REQUEST_EXECUTOR_REQUIRED",
          })
        );
      }
    );


    test(
      "runs baseline load and recovery without granting authorization",

      async () => {
        let now =
          0;


        const harness =
          new ChaosLoadHarness({
            now:
              () =>
                now,

            sleep:
              async (
                ms
              ) => {
                now +=
                  Math.max(
                    ms,
                    1
                  );
              },

            requestExecutor:
              async () => {
                now +=
                  5;


                return {
                  success:
                    true,

                  statusCode:
                    202,

                  executionAuthorized:
                    false,
                };
              },

            maxConcurrency:
              8,
          });


        const result =
          await harness.run({
            profile: {
              key:
                "UNIT",

              stages: [
                {
                  stage:
                    CHAOS_LOAD_STAGE
                      .BASELINE,

                  targetRatePerSecond:
                    2,

                  durationSeconds:
                    1,
                },

                {
                  stage:
                    CHAOS_LOAD_STAGE
                      .NORMAL,

                  targetRatePerSecond:
                    4,

                  durationSeconds:
                    1,
                },

                {
                  stage:
                    CHAOS_LOAD_STAGE
                      .RECOVERY,

                  targetRatePerSecond:
                    2,

                  durationSeconds:
                    1,
                },
              ],
            },

            context:
              labContext(),

            payloadFactory:
              ({
                sequence,
              }) => ({
                sequence,
              }),
          });


        expect(
          result
            .startedFromHealthyBaseline
        ).toBe(
          true
        );


        expect(
          result.stages
        ).toHaveLength(
          3
        );


        expect(
          result.recovery
            .recovered
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
  }
);


describe(
  "Phase 21.10B integration capacity registry foundation",

  () => {
    test(
      "every canonical Phase 20 catalogue provider enters capacity certification",

      () => {
        const registry =
          buildIntegrationCapacityRegistry();


        expect(
          registry
        ).toHaveLength(
          33
        );


        const providers =
          new Set(
            registry.map(
              (
                entry
              ) =>
                entry.provider
            )
          );


        expect(
          providers.size
        ).toBe(
          33
        );


        for (
          const entry
          of registry
        ) {
          expect(
            entry
              .measureAiraSide
          ).toBe(
            true
          );


          expect(
            entry
              .executionAuthorized
          ).toBe(
            false
          );
        }
      }
    );


    test(
      "currently available integrations are mapped to LIVE capacity mode",

      () => {
        expect(
          requireProvider(
            "prometheus_alertmanager"
          ).testMode
        ).toBe(
          CAPACITY_TEST_MODE
            .LIVE
        );


        expect(
          requireProvider(
            "grafana_alerting"
          ).testMode
        ).toBe(
          CAPACITY_TEST_MODE
            .LIVE
        );


        expect(
          requireProvider(
            "webhook_incoming"
          ).testMode
        ).toBe(
          CAPACITY_TEST_MODE
            .LIVE
        );


        expect(
          requireProvider(
            "opentelemetry"
          ).testMode
        ).toBe(
          CAPACITY_TEST_MODE
            .LIVE
        );


        expect(
          requireProvider(
            "kubernetes"
          ).testMode
        ).toBe(
          CAPACITY_TEST_MODE
            .LIVE
        );
      }
    );


    test(
      "beta provider is not falsely reported as live certified",

      () => {
        expect(
          requireProvider(
            "datadog"
          ).testMode
        ).toBe(
          CAPACITY_TEST_MODE
            .LAB_SIMULATED_PROVIDER
        );
      }
    );


    test(
      "coming-soon provider cannot be represented as live-tested",

      () => {
        expect(
          requireProvider(
            "aws_cloudwatch"
          ).testMode
        ).toBe(
          CAPACITY_TEST_MODE
            .CONTRACT_ONLY
        );
      }
    );

    test(
  "broken baseline can never be reported as recovered",

  () => {
    const recovery =
      calculateRecovery({
        baseline: {
          p95LatencyMs:
            null,

          successRate:
            0,

          errorRate:
            1,

          timedOutRequests:
            0,
        },

        recovery: {
          p95LatencyMs:
            null,

          successRate:
            0,

          errorRate:
            1,

          timedOutRequests:
            0,
        },

        recoveryDurationMs:
          10000,
      });


    expect(
      recovery.baselineHealthy
    ).toBe(
      false
    );


    expect(
      recovery.recovered
    ).toBe(
      false
    );
  }
);

  }
);