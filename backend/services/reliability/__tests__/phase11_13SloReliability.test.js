"use strict";

const {
  SloService,
  RELIABILITY_STATE,
} =
  require(
    "../sloService"
  );

const {
  MetricsService,
} =
  require(
    "../../infrastructure/metricsService"
  );


describe(
  "Phase 11.13 SLO / Reliability Metrics",
  () => {
    // ========================================================================
    // BASIC HEALTHY SLO
    // ========================================================================

    test(
      "healthy objective remains within error budget",
      () => {
        let now =
          1000000;

        const service =
          new SloService({
            now:
              () =>
                now,

            objectives: {
              api: {
                target:
                  0.99,

                latencyTargetMs:
                  1000,

                latencyComplianceTarget:
                  0.95,

                windowMs:
                  60000,

                minimumSamples:
                  10,
              },
            },
          });


        for (
          let index =
            0;
          index <
            100;
          index++
        ) {
          service
            .recordObservation(
              "api",
              {
                success:
                  true,

                latencyMs:
                  100,

                timestamp:
                  now,
              }
            );
        }


        const result =
          service
            .evaluateObjective(
              "api"
            );


        expect(
          result
        )
          .toMatchObject({
            state:
              RELIABILITY_STATE
                .HEALTHY,

            sampleCount:
              100,

            successes:
              100,

            failures:
              0,

            availability:
              1,

            budgetRemainingRatio:
              1,

            executionAuthorized:
              false,
          });


        expect(
          result
            .burnRate
        )
          .toBe(
            0
          );
      }
    );


    // ========================================================================
    // ERROR BUDGET
    // ========================================================================

    test(
      "error budget is exhausted when failures exceed allowed budget",
      () => {
        const service =
          new SloService({
            objectives: {
              execution: {
                target:
                  0.99,

                latencyTargetMs:
                  30000,

                latencyComplianceTarget:
                  0.95,

                windowMs:
                  60000,

                minimumSamples:
                  10,
              },
            },
          });


        for (
          let index =
            0;
          index <
            98;
          index++
        ) {
          service
            .recordObservation(
              "execution",
              {
                success:
                  true,

                latencyMs:
                  1000,
              }
            );
        }


        for (
          let index =
            0;
          index <
            2;
          index++
        ) {
          service
            .recordObservation(
              "execution",
              {
                success:
                  false,

                latencyMs:
                  1000,
              }
            );
        }


        const result =
          service
            .evaluateObjective(
              "execution"
            );


        expect(
          result
            .sampleCount
        )
          .toBe(
            100
          );


        expect(
          result
            .failures
        )
          .toBe(
            2
          );


        expect(
          result
            .allowedFailures
        )
          .toBeCloseTo(
            1,
            5
          );


        expect(
          result
            .burnRate
        )
          .toBeCloseTo(
            2,
            5
          );


        expect(
          result
            .budgetRemainingRatio
        )
          .toBe(
            0
          );


        expect(
          result
            .state
        )
          .toBe(
            RELIABILITY_STATE
              .EXHAUSTED
          );


        expect(
          result
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    // ========================================================================
    // LATENCY SLO
    // ========================================================================

    test(
      "latency compliance can mark otherwise successful SLO as burning",
      () => {
        const service =
          new SloService({
            objectives: {
              decision: {
                target:
                  0.99,

                latencyTargetMs:
                  100,

                latencyComplianceTarget:
                  0.95,

                windowMs:
                  60000,

                minimumSamples:
                  10,
              },
            },
          });


        for (
          let index =
            0;
          index <
            10;
          index++
        ) {
          service
            .recordObservation(
              "decision",
              {
                success:
                  true,

                latencyMs:
                  index <
                    8
                    ? 50
                    : 500,
              }
            );
        }


        const result =
          service
            .evaluateObjective(
              "decision"
            );


        expect(
          result
            .availability
        )
          .toBe(
            1
          );


        expect(
          result
            .latencyCompliance
        )
          .toBeCloseTo(
            0.8,
            5
          );


        expect(
          result
            .state
        )
          .toBe(
            RELIABILITY_STATE
              .BURNING
          );
      }
    );


    // ========================================================================
    // INSUFFICIENT DATA
    // ========================================================================

    test(
      "objective remains insufficient until minimum sample count is reached",
      () => {
        const service =
          new SloService({
            objectives: {
              verification: {
                target:
                  0.99,

                latencyTargetMs:
                  1000,

                latencyComplianceTarget:
                  0.95,

                windowMs:
                  60000,

                minimumSamples:
                  10,
              },
            },
          });


        for (
          let index =
            0;
          index <
            5;
          index++
        ) {
          service
            .recordObservation(
              "verification",
              {
                success:
                  true,

                latencyMs:
                  100,
              }
            );
        }


        const result =
          service
            .evaluateObjective(
              "verification"
            );


        expect(
          result
            .sufficientSamples
        )
          .toBe(
            false
          );


        expect(
          result
            .state
        )
          .toBe(
            RELIABILITY_STATE
              .INSUFFICIENT_DATA
          );
      }
    );


    // ========================================================================
    // ROLLING WINDOW
    // ========================================================================

    test(
      "old observations are pruned outside evaluation window",
      () => {
        let now =
          100000;

        const service =
          new SloService({
            now:
              () =>
                now,

            objectives: {
              api: {
                target:
                  0.99,

                latencyTargetMs:
                  1000,

                latencyComplianceTarget:
                  0.95,

                windowMs:
                  60000,

                minimumSamples:
                  1,
              },
            },
          });


        service
          .recordObservation(
            "api",
            {
              success:
                false,

              latencyMs:
                100,

              timestamp:
                now,
            }
          );


        now +=
          61000;


        service
          .recordObservation(
            "api",
            {
              success:
                true,

              latencyMs:
                50,

              timestamp:
                now,
            }
          );


        const result =
          service
            .evaluateObjective(
              "api"
            );


        expect(
          result
            .sampleCount
        )
          .toBe(
            1
          );


        expect(
          result
            .failures
        )
          .toBe(
            0
          );


        expect(
          result
            .availability
        )
          .toBe(
            1
          );
      }
    );


    // ========================================================================
    // UNKNOWN OBJECTIVE
    // ========================================================================

    test(
      "unknown objective fails closed",
      () => {
        const service =
          new SloService();


        expect(
          () =>
            service
              .recordObservation(
                "unknown-objective",
                {
                  success:
                    true,
                }
              )
        )
          .toThrow(
            expect
              .objectContaining({
                code:
                  "SLO_OBJECTIVE_NOT_REGISTERED",

                executionAuthorized:
                  false,
              })
          );
      }
    );


    // ========================================================================
    // OVERALL STATE
    // ========================================================================

    test(
      "overall reliability reflects the worst sufficiently sampled objective",
      () => {
        const service =
          new SloService({
            objectives: {
              api: {
                target:
                  0.99,

                latencyTargetMs:
                  1000,

                latencyComplianceTarget:
                  0.95,

                windowMs:
                  60000,

                minimumSamples:
                  10,
              },

              execution: {
                target:
                  0.99,

                latencyTargetMs:
                  1000,

                latencyComplianceTarget:
                  0.95,

                windowMs:
                  60000,

                minimumSamples:
                  10,
              },
            },
          });


        for (
          let index =
            0;
          index <
            10;
          index++
        ) {
          service
            .recordObservation(
              "api",
              {
                success:
                  true,

                latencyMs:
                  100,
              }
            );
        }


        for (
          let index =
            0;
          index <
            8;
          index++
        ) {
          service
            .recordObservation(
              "execution",
              {
                success:
                  true,

                latencyMs:
                  100,
              }
            );
        }


        for (
          let index =
            0;
          index <
            2;
          index++
        ) {
          service
            .recordObservation(
              "execution",
              {
                success:
                  false,

                latencyMs:
                  100,
              }
            );
        }


        const result =
          service
            .evaluateAll();


        expect(
          result
            .objectives
            .api
            .state
        )
          .toBe(
            RELIABILITY_STATE
              .HEALTHY
          );


        expect(
          result
            .objectives
            .execution
            .state
        )
          .toBe(
            RELIABILITY_STATE
              .EXHAUSTED
          );


        expect(
          result
            .state
        )
          .toBe(
            RELIABILITY_STATE
              .EXHAUSTED
          );


        expect(
          result
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    // ========================================================================
    // METRICS BRIDGE
    // ========================================================================

    test(
      "canonical metrics exports reliability gauges",
      async () => {
        const metrics =
          new MetricsService();


        metrics
          .updateSloReliability({
            state:
              "BURNING",

            objectives: {
              api: {
                state:
                  "BURNING",

                availability:
                  0.98,

                target:
                  0.99,

                latencyCompliance:
                  0.9,

                budgetRemainingRatio:
                  0.2,

                burnRate:
                  2,

                sampleCount:
                  100,

                failures:
                  2,
              },
            },
          });


        const output =
          await metrics
            .getMetrics();


        expect(
          output
        )
          .toContain(
            "aira_slo_availability_ratio"
          );


        expect(
          output
        )
          .toContain(
            "aira_slo_error_budget_remaining_ratio"
          );


        expect(
          output
        )
          .toContain(
            "aira_slo_burn_rate"
          );


        expect(
          output
        )
          .toContain(
            "aira_reliability_overall_state"
          );
      }
    );


    // ========================================================================
    // RESET
    // ========================================================================

    test(
      "reset clears reliability observations without granting authority",
      () => {
        const service =
          new SloService();


        service
          .recordApi(
            true,
            100
          );


        const result =
          service
            .reset();


        expect(
          result
        )
          .toMatchObject({
            reset:
              true,

            executionAuthorized:
              false,
          });


        expect(
          service
            .getStatus()
            .recordCount
        )
          .toBe(
            0
          );
      }
    );


    // ========================================================================
    // SAFETY INVARIANT
    // ========================================================================

    test(
      "even exhausted reliability state never grants execution authority",
      () => {
        const service =
          new SloService({
            objectives: {
              execution: {
                target:
                  0.99,

                latencyTargetMs:
                  1000,

                latencyComplianceTarget:
                  0.95,

                windowMs:
                  60000,

                minimumSamples:
                  1,
              },
            },
          });


        service
          .recordObservation(
            "execution",
            {
              success:
                false,

              latencyMs:
                100,
            }
          );


        const result =
          service
            .evaluateAll();


        expect(
          result
            .state
        )
          .toBe(
            RELIABILITY_STATE
              .EXHAUSTED
          );


        expect(
          result
            .executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          result
            .objectives
            .execution
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);