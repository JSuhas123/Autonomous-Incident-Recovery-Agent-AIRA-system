"use strict";


const {
  LiveProviderCapacityProbe,
  STATES,
  evaluateStage,
  evaluateRecovery,
} =
  require(
    "../../services/reliability/chaos/liveProviderCapacityProbe"
  );


describe(
  "Phase 21.10B remaining live provider capacity",
  () => {
    test(
      "healthy stage remains healthy",
      () => {
        const result =
          evaluateStage(
            {
              p95LatencyMs:
                10,
            },

            {
              targetRatePerSecond:
                100,

              successfulRatePerSecond:
                99.5,

              successRate:
                0.995,

              errorRate:
                0.005,

              p95LatencyMs:
                12,

              timedOutRequests:
                0,

              rejectedRequests:
                0,

              rateLimitedRequests:
                0,

              generatorDroppedRequests:
                0,

              failedRequests:
                0,

              totalRequests:
                1000,
            }
          );


        expect(
          result.state
        ).toBe(
          STATES.HEALTHY
        );
      }
    );


    test(
      "load generator saturation is not misreported as provider failure",
      () => {
        const result =
          evaluateStage(
            {
              p95LatencyMs:
                10,
            },

            {
              targetRatePerSecond:
                1000,

              successfulRatePerSecond:
                600,

              successRate:
                0.6,

              errorRate:
                0.4,

              p95LatencyMs:
                10,

              timedOutRequests:
                0,

              rejectedRequests:
                0,

              rateLimitedRequests:
                0,

              generatorDroppedRequests:
                400,

              failedRequests:
                0,

              totalRequests:
                1000,
            }
          );


        expect(
          result.state
        ).toBe(
          STATES.LOAD_GENERATOR_LIMIT
        );
      }
    );


    test(
      "unhealthy baseline can never be marked recovered",
      () => {
        const result =
          evaluateRecovery(
            {
              successRate:
                0,

              errorRate:
                1,

              timedOutRequests:
                0,

              p95LatencyMs:
                null,
            },

            {
              successRate:
                0,

              errorRate:
                1,

              timedOutRequests:
                0,

              generatorDroppedRequests:
                0,

              p95LatencyMs:
                null,
            },

            1000
          );


        expect(
          result.recovered
        ).toBe(
          false
        );


        expect(
          result.baselineHealthy
        ).toBe(
          false
        );
      }
    );


    test(
      "probe remains non-authorizing",
      async () => {
        const probe =
          new LiveProviderCapacityProbe({
            provider:
              "test",

            operation:
              "health",

            baselineRatePerSecond:
              1,

            stageDurationSeconds:
              0.05,

            maxConcurrency:
              4,

            executor:
              async () => ({
                success:
                  true,

                executionAuthorized:
                  false,
              }),
          });


        const result =
          await probe.run([
            2,
          ]);


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );


        expect(
          result.baseline
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          result.recovery
            .evaluation
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "production cannot use outgoing webhook loopback exception",
      async () => {
        const adapter =
          require(
            "../../services/integrations/adapters/webhookOutgoingAdapter"
          );


        const previousNodeEnv =
          process.env.NODE_ENV;


        const previousLab =
          process.env
            .AIRA_RELIABILITY_LAB;


        try {
          process.env.NODE_ENV =
            "production";


          process.env
            .AIRA_RELIABILITY_LAB =
            "true";


          const allowed =
            adapter
              .isExplicitReliabilityLabLoopback(
                new URL(
                  "http://127.0.0.1:19081/test"
                ),

                {
                  nonSecretConfig: {
                    reliabilityLab:
                      true,

                    reliabilityLabLoopback:
                      true,

                    safetyClass:
                      "LAB_ONLY",
                  },

                  metadata: {
                    reliabilityLab:
                      true,

                    safetyClass:
                      "LAB_ONLY",

                    production:
                      false,
                  },
                }
              );


          expect(
            allowed
          ).toBe(
            false
          );
        } finally {
          process.env.NODE_ENV =
            previousNodeEnv;


          if (
            previousLab ===
            undefined
          ) {
            delete process
              .env
              .AIRA_RELIABILITY_LAB;
          } else {
            process.env
              .AIRA_RELIABILITY_LAB =
              previousLab;
          }
        }
      }
    );


    test(
      "explicit non-production Reliability Lab may use loopback only",
      () => {
        const adapter =
          require(
            "../../services/integrations/adapters/webhookOutgoingAdapter"
          );


        const previousNodeEnv =
          process.env.NODE_ENV;


        const previousLab =
          process.env
            .AIRA_RELIABILITY_LAB;


        try {
          process.env.NODE_ENV =
            "test";


          process.env
            .AIRA_RELIABILITY_LAB =
            "true";


          const connection = {
            nonSecretConfig: {
              reliabilityLab:
                true,

              reliabilityLabLoopback:
                true,

              safetyClass:
                "LAB_ONLY",
            },

            metadata: {
              reliabilityLab:
                true,

              safetyClass:
                "LAB_ONLY",

              production:
                false,
            },
          };


          expect(
            adapter
              .isExplicitReliabilityLabLoopback(
                new URL(
                  "http://127.0.0.1:19081/test"
                ),

                connection
              )
          ).toBe(
            true
          );


          expect(
            adapter
              .isExplicitReliabilityLabLoopback(
                new URL(
                  "http://192.168.1.5:19081/test"
                ),

                connection
              )
          ).toBe(
            false
          );
        } finally {
          process.env.NODE_ENV =
            previousNodeEnv;


          if (
            previousLab ===
            undefined
          ) {
            delete process
              .env
              .AIRA_RELIABILITY_LAB;
          } else {
            process.env
              .AIRA_RELIABILITY_LAB =
              previousLab;
          }
        }
      }
    );
  }
);