"use strict";

const {
  LIVE_WIRING_VERSION,

  ReliabilityBaselineProviderAdapter,

  ReliabilityFailureInjectorAdapter,

  buildBaselineMeasurements,

  bindFailureInjectionEngine,

  assertLabOnlyInput,

  assertNonAuthorizing,
} =
  require(
    "../../services/reliability/liveExperimentWiringAdapters"
  );


describe(
  "Phase 21.11/21.12 live experiment wiring",

  () => {
    test(
      "live wiring contract is versioned",

      () => {
        expect(
          LIVE_WIRING_VERSION
        )
          .toBe(
            "21.11-12-live-wiring-v1"
          );
      }
    );


    test(
      "baseline measurement builder creates Phase 21.7-compatible measurements",

      () => {
        const measurements =
          buildBaselineMeasurements({
            cpu:
              0.1,

            memory:
              0.2,

            latency:
              12,

            errorRate:
              0,

            podState:
              "Running",

            restartCount:
              0,

            dbConnections:
              3,

            queueDepth:
              0,

            dependencyHealthy:
              true,

            healthy:
              true,

            ready:
              true,

            observedAt:
              "2026-08-31T12:00:00.000Z",
          });


        expect(
          measurements.HEALTH
        )
          .toMatchObject({
            status:
              "OBSERVED",

            value:
              true,

            executionAuthorized:
              false,
          });


        expect(
          measurements.READINESS.value
        )
          .toBe(
            true
          );


        expect(
          measurements.ERROR_RATE.value
        )
          .toBe(
            0
          );


        expect(
          measurements.POD_STATE.value
        )
          .toBe(
            "Running"
          );
      }
    );


    test(
      "missing baseline measurement is explicitly UNAVAILABLE",

      () => {
        const measurements =
          buildBaselineMeasurements({
            healthy:
              true,

            ready:
              true,

            dependencyHealthy:
              true,
          });


        expect(
          measurements.CPU.status
        )
          .toBe(
            "UNAVAILABLE"
          );


        expect(
          measurements.CPU.value
        )
          .toBeNull();
      }
    );


    test(
      "baseline adapter uses existing observability baseline service",

      async () => {
        const baselineService = {
          buildBaseline:
            jest.fn(
              (
                input
              ) => ({
                baselineVersion:
                  "21.7-v1",

                labEnvironmentId:
                  input.labEnvironmentId,

                labKind:
                  input.labKind,

                healthy:
                  true,

                healthReasons:
                  [],

                measurements:
                  input.measurements,

                executionAuthorized:
                  false,
              })
            ),
        };


        const lifecycleService = {
          requireEnvironment:
            jest.fn(
              async () => ({
                kind:
                  "KIND",

                status:
                  "AVAILABLE",

                production:
                  false,

                executionAuthorized:
                  false,
              })
            ),
        };


        const collect =
          jest.fn(
            async () =>
              buildBaselineMeasurements({
                cpu:
                  0.1,

                memory:
                  0.2,

                latency:
                  10,

                errorRate:
                  0,

                podState:
                  "Running",

                restartCount:
                  0,

                dbConnections:
                  2,

                queueDepth:
                  0,

                dependencyHealthy:
                  true,

                healthy:
                  true,

                ready:
                  true,
              })
          );


        const adapter =
          new ReliabilityBaselineProviderAdapter({
            baselineService,

            lifecycleService,

            collect,
          });


        const result =
          await adapter.capture({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            labEnvironmentId:
              "lab-a",

            experimentRunId:
              "run-a",
          });


        expect(
          lifecycleService
            .requireEnvironment
        )
          .toHaveBeenCalledTimes(
            1
          );


        expect(
          collect
        )
          .toHaveBeenCalledTimes(
            1
          );


        expect(
          baselineService
            .buildBaseline
        )
          .toHaveBeenCalledTimes(
            1
          );


        expect(
          result.healthy
        )
          .toBe(
            true
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "unhealthy baseline is rejected",

      async () => {
        const adapter =
          new ReliabilityBaselineProviderAdapter({
            lifecycleService: {
              requireEnvironment:
                jest.fn(
                  async () => ({
                    kind:
                      "KIND",

                    status:
                      "AVAILABLE",

                    production:
                      false,
                  })
                ),
            },

            baselineService: {
              buildBaseline:
                jest.fn(
                  () => ({
                    healthy:
                      false,

                    healthReasons: [
                      "READINESS_NOT_HEALTHY",
                    ],

                    executionAuthorized:
                      false,
                  })
                ),
            },

            collect:
              jest.fn(
                async () => ({})
              ),
          });


        await expect(
          adapter.capture({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            labEnvironmentId:
              "lab-a",
          })
        )
          .rejects
          .toMatchObject({
            code:
              "PHASE21_LIVE_BASELINE_UNHEALTHY",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "failure injector adapter preserves explicit certified injection",

      async () => {
        const invoke =
          jest.fn(
            async (
              input
            ) => ({
              injectionId:
                "inj-1",

              injected:
                true,

              injectedAt:
                "2026-08-31T12:00:00.000Z",

              safetyClass:
                input.safetyClass,

              executionAuthorized:
                false,
            })
          );


        const adapter =
          new ReliabilityFailureInjectorAdapter({
            invoke,
          });


        const result =
          await adapter.inject({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            tenantId:
              "tenant-a",

            labEnvironmentId:
              "lab-a",

            experimentRunId:
              "run-a",

            failureKey:
              "kubernetes.pod.crash",
          });


        expect(
          invoke
        )
          .toHaveBeenCalledTimes(
            1
          );


        expect(
          result.injectionId
        )
          .toBe(
            "inj-1"
          );


        expect(
          result.injected
        )
          .toBe(
            true
          );


        expect(
          result.safetyClass
        )
          .toBe(
            "LAB_ONLY"
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "production target is rejected before invoking injector",

      async () => {
        const invoke =
          jest.fn();


        const adapter =
          new ReliabilityFailureInjectorAdapter({
            invoke,
          });


        await expect(
          adapter.inject({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            labEnvironmentId:
              "lab-a",

            experimentRunId:
              "run-a",

            production:
              true,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "PHASE21_PRODUCTION_TARGET_FORBIDDEN",
          });


        expect(
          invoke
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "execution authorization is rejected",

      () => {
        expect(
          () =>
            assertLabOnlyInput({
              organizationId:
                "org-a",

              environmentId:
                "env-a",

              labEnvironmentId:
                "lab-a",

              experimentRunId:
                "run-a",

              executionAuthorized:
                true,
            })
        )
          .toThrow(
            "cannot grant execution authorization"
          );
      }
    );


    test(
      "nested authority escalation is rejected",

      () => {
        expect(
          () =>
            assertNonAuthorizing(
              {
                result: {
                  executionAuthorized:
                    true,
                },
              },

              "test result"
            )
        )
          .toThrow(
            "forbidden execution/production authority"
          );
      }
    );


    test(
      "canonical inject method can be bound",

      async () => {
        const engine = {
          inject:
            jest.fn(
              async () => ({
                injectionId:
                  "inj-bound",

                injected:
                  true,

                executionAuthorized:
                  false,
              })
            ),
        };


        const adapter =
          bindFailureInjectionEngine({
            engine,
          });


        const result =
          await adapter.inject({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            labEnvironmentId:
              "lab-a",

            experimentRunId:
              "run-a",
          });


        expect(
          result.injectionId
        )
          .toBe(
            "inj-bound"
          );
      }
    );


    test(
      "unknown failure engine API fails closed instead of guessing",

      () => {
        expect(
          () =>
            bindFailureInjectionEngine({
              engine: {
                execute:
                  jest.fn(),

                run:
                  jest.fn(),
              },
            })
        )
          .toThrow(
            "bind its certified API explicitly"
          );
      }
    );
  }
);