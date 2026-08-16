"use strict";

const {
  ChaosTestFramework,
  DatabaseChaosInjector,
  QueueChaosInjector,
  DependencyChaosInjector,
  RedisChaosInjector,
  KubernetesChaosInjector,
  ExternalServiceChaosInjector,
  LoadChaosInjector,
  runChaosScenario,
  CHAOS_STATE,
  CHAOS_ERROR,
  ABSOLUTE_MAX_DURATION_MS,
} =
  require(
    "../chaosTestFramework"
  );


const {
  failureScenarios,
  SimulationScenarioRunner,
  validateFailureScenarioCatalog,
  EXPECTED_RESPONSE,
} =
  require(
    "../../simulation/failureScenarios"
  );


describe(
  "Phase 11.15 Controlled Chaos / Failure Injection",
  () => {
    // ========================================================================
    // CHAOS DEFAULT SAFETY
    // ========================================================================

    test(
      "chaos is disabled by default",
      () => {
        const framework =
          new ChaosTestFramework({
            enabled:
              false,

            nodeEnv:
              "test",
          });


        expect(
          framework
            .getStatus()
        )
          .toMatchObject({
            state:
              CHAOS_STATE
                .DISABLED,

            enabled:
              false,

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "disabled chaos fails closed",
      () => {
        const framework =
          new ChaosTestFramework({
            enabled:
              false,

            nodeEnv:
              "test",
          });


        let caught;


        try {
          framework
            .registerFailure(
              "database-unavailable",
              "UNAVAILABLE"
            );
        } catch (
          error
        ) {
          caught =
            error;
        }


        expect(
          caught
        )
          .toMatchObject({
            code:
              CHAOS_ERROR
                .DISABLED,

            executionAuthorized:
              false,
          });


        expect(
          framework
            .activeFailures
            .size
        )
          .toBe(
            0
          );
      }
    );


    // ========================================================================
    // PRODUCTION GUARDRAILS
    // ========================================================================

    test(
      "production chaos requires explicit production opt-in",
      () => {
        const framework =
          new ChaosTestFramework({
            enabled:
              true,

            productionAllowed:
              false,

            nodeEnv:
              "production",
          });


        let caught;


        try {
          framework
            .assertChaosAllowed();
        } catch (
          error
        ) {
          caught =
            error;
        }


        expect(
          caught
        )
          .toMatchObject({
            code:
              CHAOS_ERROR
                .PRODUCTION_FORBIDDEN,

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "production chaos requires matching authorization token",
      () => {
        const framework =
          new ChaosTestFramework({
            enabled:
              true,

            productionAllowed:
              true,

            authorizationToken:
              "expected-chaos-token",

            nodeEnv:
              "production",
          });


        let caught;


        try {
          framework
            .assertChaosAllowed({
              authorizationToken:
                "wrong-token",
            });
        } catch (
          error
        ) {
          caught =
            error;
        }


        expect(
          caught
        )
          .toMatchObject({
            code:
              CHAOS_ERROR
                .AUTHORIZATION_REQUIRED,

            executionAuthorized:
              false,
          });


        expect(
          framework
            .assertChaosAllowed({
              authorizationToken:
                "expected-chaos-token",
            })
        )
          .toMatchObject({
            allowed:
              true,

            executionAuthorized:
              false,
          });
      }
    );


    // ========================================================================
    // UNKNOWN SCENARIO
    // ========================================================================

    test(
      "unknown chaos scenario fails closed",
      () => {
        const framework =
          new ChaosTestFramework({
            enabled:
              true,

            nodeEnv:
              "test",
          });


        let caught;


        try {
          framework
            .registerFailure(
              "invented-chaos-scenario",
              "FAILURE"
            );
        } catch (
          error
        ) {
          caught =
            error;
        }


        expect(
          caught
        )
          .toMatchObject({
            code:
              CHAOS_ERROR
                .UNKNOWN_SCENARIO,

            executionAuthorized:
              false,
          });
      }
    );


    // ========================================================================
    // BOUNDED DURATION
    // ========================================================================

    test(
      "failure duration is bounded by configured and absolute maximum",
      async () => {
        const framework =
          new ChaosTestFramework({
            enabled:
              true,

            nodeEnv:
              "test",

            maxDurationMs:
              ABSOLUTE_MAX_DURATION_MS *
              10,
          });


        const result =
          framework
            .registerFailure(
              "database-unavailable",
              "UNAVAILABLE",
              {
                duration:
                  ABSOLUTE_MAX_DURATION_MS *
                  100,

                autoRestore:
                  false,
              }
            );


        expect(
          result.duration
        )
          .toBeLessThanOrEqual(
            ABSOLUTE_MAX_DURATION_MS
          );


        expect(
          result
            .executionAuthorized
        )
          .toBe(
            false
          );


        await framework
          .restoreAll();
      }
    );


    // ========================================================================
    // DATABASE CHAOS
    // ========================================================================

    test(
      "database unavailability is injected and deterministically restored",
      async () => {
        const originalFind =
          jest.fn(
            async () => [
              "healthy",
            ]
          );


        const database = {
          find:
            originalFind,
        };


        const injector =
          new DatabaseChaosInjector(
            database
          );


        const result =
          injector
            .injectUnavailability(
              60000
            );


        expect(
          result
        )
          .toMatchObject({
            injected:
              true,

            type:
              "database-unavailable",

            executionAuthorized:
              false,
          });


        await expect(
          database
            .find()
        )
          .rejects
          .toMatchObject({
            code:
              "DATABASE_UNAVAILABLE",
          });


        await injector
          .restore();


        await expect(
          database
            .find()
        )
          .resolves
          .toEqual([
            "healthy",
          ]);


        expect(
          database
            .find
        )
          .toBe(
            originalFind
          );
      }
    );


    test(
      "intermittent database failure can be deterministic",
      async () => {
        const database = {
          find:
            jest.fn(
              async () =>
                "ok"
            ),
        };


        const injector =
          new DatabaseChaosInjector(
            database
          );


        injector
          .injectIntermittent(
            0.5,
            60000,
            () =>
              0.1
          );


        await expect(
          database
            .find()
        )
          .rejects
          .toMatchObject({
            code:
              "DATABASE_INTERMITTENT_FAILURE",
          });


        await injector
          .restore();


        await expect(
          database
            .find()
        )
          .resolves
          .toBe(
            "ok"
          );
      }
    );


    // ========================================================================
    // RABBITMQ / QUEUE CHAOS
    // ========================================================================

    test(
      "RabbitMQ unavailability is retry-safe and grants no authority",
      async () => {
        const originalPublish =
          jest.fn(
            async () => ({
              published:
                true,
            })
          );


        const queue = {
          publishEvent:
            originalPublish,
        };


        const injector =
          new QueueChaosInjector(
            queue
          );


        injector
          .injectUnavailability(
            60000
          );


        await expect(
          queue
            .publishEvent(
              "test.topic",
              {
                id:
                  "event-1",
              }
            )
        )
          .rejects
          .toMatchObject({
            code:
              "ECONNREFUSED",

            dependency:
              "rabbitmq",

            executionAuthorized:
              false,
          });


        await injector
          .restore();


        await expect(
          queue
            .publishEvent(
              "test.topic",
              {
                id:
                  "event-2",
              }
            )
        )
          .resolves
          .toEqual({
            published:
              true,
          });
      }
    );


    test(
      "queue saturation applies bounded backpressure",
      async () => {
        const queue = {
          publishEvent:
            jest.fn(
              async () => ({
                published:
                  true,
              })
            ),
        };


        const injector =
          new QueueChaosInjector(
            queue
          );


        injector
          .injectSaturation(
            1,
            60000
          );


        await expect(
          queue
            .publishEvent(
              "topic",
              {
                id:
                  1,
              }
            )
        )
          .resolves
          .toEqual({
            published:
              true,
          });


        await expect(
          queue
            .publishEvent(
              "topic",
              {
                id:
                  2,
              }
            )
        )
          .rejects
          .toMatchObject({
            code:
              "QUEUE_SATURATED",

            retryable:
              true,

            executionAuthorized:
              false,
          });


        await injector
          .restore();
      }
    );


    // ========================================================================
    // REDIS CHAOS
    // ========================================================================

    test(
      "Redis failure injector produces canonical dependency failure",
      async () => {
        const redis = {
          get:
            jest.fn(
              async () =>
                "value"
            ),
        };


        const injector =
          new RedisChaosInjector(
            redis
          );


        const result =
          injector
            .injectUnavailability(
              "get",
              60000
            );


        expect(
          result
        )
          .toMatchObject({
            dependency:
              "redis",

            executionAuthorized:
              false,
          });


        await expect(
          redis
            .get(
              "key"
            )
        )
          .rejects
          .toMatchObject({
            code:
              "REDIS_UNAVAILABLE",

            dependency:
              "redis",

            executionAuthorized:
              false,
          });


        await injector
          .restore();


        await expect(
          redis
            .get(
              "key"
            )
        )
          .resolves
          .toBe(
            "value"
          );
      }
    );


    // ========================================================================
    // KUBERNETES UNKNOWN OUTCOME
    // ========================================================================

    test(
      "Kubernetes timeout becomes unknown outcome requiring reconciliation",
      async () => {
        const kubernetes = {
          restartPod:
            jest.fn(
              async () => ({
                restarted:
                  true,
              })
            ),
        };


        const injector =
          new KubernetesChaosInjector(
            kubernetes
          );


        injector
          .injectTimeout(
            "restartPod",
            {
              duration:
                60000,

              timeoutMs:
                1,
            }
          );


        await expect(
          kubernetes
            .restartPod()
        )
          .rejects
          .toMatchObject({
            code:
              "DEPENDENCY_TIMEOUT",

            dependency:
              "kubernetes",

            executionOutcome:
              "UNKNOWN",

            requiresReconciliation:
              true,

            executionAuthorized:
              false,
          });


        await injector
          .restore();


        await expect(
          kubernetes
            .restartPod()
        )
          .resolves
          .toEqual({
            restarted:
              true,
          });
      }
    );


    // ========================================================================
    // GENERIC DEPENDENCY RESTORATION
    // ========================================================================

    test(
      "dependency injector always restores original target method",
      async () => {
        const original =
          jest.fn(
            async () =>
              "healthy"
          );


        const dependency = {
          call:
            original,
        };


        const injector =
          new DependencyChaosInjector(
            dependency
          );


        injector
          .injectUnavailability(
            "call",
            {
              dependency:
                "example",

              duration:
                60000,

              code:
                "EXAMPLE_DOWN",
            }
          );


        await expect(
          dependency
            .call()
        )
          .rejects
          .toMatchObject({
            code:
              "EXAMPLE_DOWN",
          });


        await injector
          .restore();


        expect(
          dependency
            .call
        )
          .toBe(
            original
          );


        await expect(
          dependency
            .call()
        )
          .resolves
          .toBe(
            "healthy"
          );
      }
    );


    // ========================================================================
    // EXTERNAL SERVICE CHAOS
    // ========================================================================

    test(
      "external service timeout is reversible",
      async () => {
        const originalFetch =
          jest.fn(
            async () => ({
              ok:
                true,
            })
          );


        const fetchTarget = {
          fetch:
            originalFetch,
        };


        const injector =
          new ExternalServiceChaosInjector({
            fetchTarget,
          });


        injector
          .injectTimeout(
            60000
          );


        await expect(
          fetchTarget
            .fetch(
              "https://example.com"
            )
        )
          .rejects
          .toMatchObject({
            code:
              "EXTERNAL_SERVICE_TIMEOUT",

            retryable:
              true,

            executionAuthorized:
              false,
          });


        injector
          .restore();


        expect(
          fetchTarget
            .fetch
        )
          .toBe(
            originalFetch
          );


        await expect(
          fetchTarget
            .fetch(
              "https://example.com"
            )
        )
          .resolves
          .toEqual({
            ok:
              true,
          });
      }
    );


    // ========================================================================
    // INCIDENT STORM
    // ========================================================================

    test(
      "incident storm generation is bounded",
      async () => {
        const incidents =
          await LoadChaosInjector
            .injectIncidentStorm(
              50000
            );


        /*
         * Framework hard-cap protects tests and runtime memory.
         */
        expect(
          incidents
            .length
        )
          .toBe(
            10000
          );


        expect(
          incidents[0]
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "load measurement contains decision failures without crashing the run",
      async () => {
        const incidents = [
          {
            id:
              "incident-1",
          },

          {
            id:
              "incident-2",
          },
        ];


        let calls =
          0;


        const decisionEngine = {
          makeDecision:
            jest.fn(
              async () => {
                calls +=
                  1;


                if (
                  calls ===
                  2
                ) {
                  throw Object.assign(
                    new Error(
                      "decision failed"
                    ),
                    {
                      code:
                        "DECISION_FAILED",
                    }
                  );
                }


                return {
                  action:
                    "restart",
                };
              }
            ),
        };


        const result =
          await LoadChaosInjector
            .measureLoadResponse(
              incidents,
              decisionEngine,
              {
                concurrency:
                  1,
              }
            );


        expect(
          result
        )
          .toMatchObject({
            totalIncidents:
              2,

            successfulDecisions:
              1,

            failedDecisions:
              1,

            executionAuthorized:
              false,
          });


        expect(
          result.results[1]
        )
          .toMatchObject({
            success:
              false,

            code:
              "DECISION_FAILED",

            executionAuthorized:
              false,
          });
      }
    );


    // ========================================================================
    // CONTROLLED SCENARIO HELPER
    // ========================================================================

    test(
      "runChaosScenario restores injected failure after successful verification",
      async () => {
        const framework =
          new ChaosTestFramework({
            enabled:
              true,

            nodeEnv:
              "test",
          });


        const inject =
          jest.fn(
            async () => ({
              injected:
                true,
            })
          );


        const verify =
          jest.fn(
            async () => ({
              passed:
                true,

              message:
                "system degraded safely",
            })
          );


        const restore =
          jest.fn(
            async () => ({
              restored:
                true,
            })
          );


        const result =
          await runChaosScenario({
            framework,

            scenario:
              "redis-unavailable",

            inject,

            verify,

            restore,
          });


        expect(
          result
        )
          .toMatchObject({
            passed:
              true,

            scenario:
              "redis-unavailable",

            executionAuthorized:
              false,
          });


        expect(
          inject
        )
          .toHaveBeenCalledTimes(
            1
          );


        expect(
          verify
        )
          .toHaveBeenCalledTimes(
            1
          );


        expect(
          restore
        )
          .toHaveBeenCalledTimes(
            1
          );


        expect(
          framework
            .getReport()
            .summary
        )
          .toMatchObject({
            total:
              1,

            passed:
              1,

            failed:
              0,
          });
      }
    );


    test(
      "runChaosScenario restores after verification failure",
      async () => {
        const framework =
          new ChaosTestFramework({
            enabled:
              true,

            nodeEnv:
              "test",
          });


        const restore =
          jest.fn(
            async () => ({
              restored:
                true,
            })
          );


        await expect(
          runChaosScenario({
            framework,

            scenario:
              "rabbitmq-unavailable",

            inject:
              async () => ({
                injected:
                  true,
              }),

            verify:
              async () => {
                throw Object.assign(
                  new Error(
                    "verification failed"
                  ),
                  {
                    code:
                      "CHAOS_VERIFICATION_FAILED",
                  }
                );
              },

            restore,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "CHAOS_VERIFICATION_FAILED",

            executionAuthorized:
              false,
          });


        expect(
          restore
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );


    // ========================================================================
    // FAILURE SCENARIO CATALOG
    // ========================================================================

    test(
      "failure scenario catalog is fully valid",
      () => {
        const result =
          validateFailureScenarioCatalog();


        expect(
          result
        )
          .toMatchObject({
            valid:
              true,

            scenarioCount:
              15,

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "critical infrastructure scenarios encode fail-safe behavior",
      () => {
        expect(
          failureScenarios
            .redisUnavailable
            .expectedSafetyBehavior
            .multiInstance
            .allowExecution
        )
          .toBe(
            false
          );


        expect(
          failureScenarios
            .rabbitmqUnavailable
            .expectedSafetyBehavior
            .durableRetry
        )
          .toBe(
            true
          );


        expect(
          failureScenarios
            .kubernetesUnavailable
            .expectedResponse
        )
          .toBe(
            EXPECTED_RESPONSE
              .BLOCK
          );


        expect(
          failureScenarios
            .kubernetesTimeout
            .expectedSafetyBehavior
            .requiresReconciliation
        )
          .toBe(
            true
          );


        expect(
          failureScenarios
            .retentionArchiveFailure
            .expectedSafetyBehavior
            .deleteSource
        )
          .toBe(
            false
          );
      }
    );


    // ========================================================================
    // SIMULATION SAFETY
    // ========================================================================

    test(
      "simulation result never grants infrastructure execution authority",
      () => {
        const runner =
          new SimulationScenarioRunner();


        const result =
          runner
            .runScenario(
              "degradedObservability",
              {
                pattern:
                  "resource-exhaustion",

                action:
                  "scale-down",
              }
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


    test(
      "blocked scenario detects unsafe executed decision",
      () => {
        const runner =
          new SimulationScenarioRunner();


        const result =
          runner
            .testScenarioHandling(
              {
                pattern:
                  "high-error-rate",

                action:
                  "restart",

                confidence:
                  0.9,

                executed:
                  true,
              },
              "raceCondition"
            );


        expect(
          result
            .scenarioHandled
            .safetyBoundaryPreserved
        )
          .toBe(
            false
          );


        expect(
          result
            .success
        )
          .toBe(
            false
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
    // FRAMEWORK RESTORE ALL
    // ========================================================================

    test(
      "restoreAll clears every active registered failure",
      async () => {
        const framework =
          new ChaosTestFramework({
            enabled:
              true,

            nodeEnv:
              "test",
          });


        framework
          .registerFailure(
            "redis-unavailable",
            "UNAVAILABLE",
            {
              duration:
                60000,

              autoRestore:
                false,
            }
          );


        framework
          .registerFailure(
            "rabbitmq-unavailable",
            "UNAVAILABLE",
            {
              duration:
                60000,

              autoRestore:
                false,
            }
          );


        expect(
          framework
            .activeFailures
            .size
        )
          .toBe(
            2
          );


        const result =
          await framework
            .restoreAll();


        expect(
          result
        )
          .toMatchObject({
            restored:
              2,

            failed:
              0,

            executionAuthorized:
              false,
          });


        expect(
          framework
            .activeFailures
            .size
        )
          .toBe(
            0
          );


        expect(
          framework
            .state
        )
          .toBe(
            CHAOS_STATE
              .READY
          );
      }
    );


    // ========================================================================
    // GLOBAL SAFETY INVARIANT
    // ========================================================================

    test(
      "chaos status and reporting never grant execution authority",
      () => {
        const framework =
          new ChaosTestFramework({
            enabled:
              true,

            nodeEnv:
              "test",
          });


        expect(
          framework
            .getStatus()
            .executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          framework
            .getReport()
            .executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          framework
            .clearResults()
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);