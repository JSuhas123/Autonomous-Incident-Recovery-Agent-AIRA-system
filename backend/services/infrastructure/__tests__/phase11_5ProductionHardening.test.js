"use strict";

const CircuitBreakerService =
  require(
    "../circuitBreakerService"
  );

const {
  DependencyIsolationService,
  DEPENDENCY_CLASS,
  FAILURE_MODE,
} =
  require(
    "../dependencyIsolationService"
  );


describe(
  "Phase 11.5 Production Hardening Certification",
  () => {
    function createService(
      dependencies = {}
    ) {
      return new DependencyIsolationService({
        metrics: {
          recordCircuitBreakerState:
            jest.fn(),
        },

        dependencies,
      });
    }


    // ========================================================================
    // 1. CANONICAL CIRCUIT BREAKER
    // ========================================================================

    test(
      "canonical breaker opens, suppresses traffic, and recovers",
      async () => {
        let now =
          1000;

        const breaker =
          new CircuitBreakerService(
            "certification-api",
            {
              failureThreshold:
                1,

              successThreshold:
                1,

              timeout:
                100,

              now:
                () =>
                  now,
            }
          );


        await expect(
          breaker.execute(
            async () => {
              throw new Error(
                "dependency-down"
              );
            }
          )
        )
          .rejects
          .toThrow(
            "dependency-down"
          );


        expect(
          breaker
            .getState()
            .state
        )
          .toBe(
            "OPEN"
          );


        const blockedOperation =
          jest.fn(
            async () =>
              "must-not-run"
          );


        await expect(
          breaker.execute(
            blockedOperation
          )
        )
          .rejects
          .toMatchObject({
            code:
              "DEPENDENCY_CIRCUIT_OPEN",

            state:
              "OPEN",
          });


        expect(
          blockedOperation
        )
          .not
          .toHaveBeenCalled();


        now =
          1101;


        const result =
          await breaker.execute(
            async () =>
              "recovered"
          );


        expect(
          result
        )
          .toBe(
            "recovered"
          );


        expect(
          breaker
            .getState()
            .state
        )
          .toBe(
            "CLOSED"
          );
      }
    );


    // ========================================================================
    // 2. CRITICAL DEPENDENCIES — FAIL CLOSED
    // ========================================================================

    test(
      "critical infrastructure dependency fails closed",
      async () => {
        const service =
          createService();


        await expect(
          service.execute(
            "kubernetes",

            async () => {
              throw Object.assign(
                new Error(
                  "Kubernetes unavailable"
                ),
                {
                  code:
                    "ECONNREFUSED",
                }
              );
            }
          )
        )
          .rejects
          .toMatchObject({
            dependency:
              "kubernetes",

            failureMode:
              FAILURE_MODE
                .FAIL_CLOSED,

            executionAuthorized:
              false,
          });
      }
    );


    // ========================================================================
    // 3. DURABLE ASYNC DEPENDENCIES — RETRY
    // ========================================================================

    test(
      "durable asynchronous dependency becomes retry decision",
      async () => {
        const service =
          createService();


        const result =
          await service.execute(
            "rabbitmq",

            async () => {
              throw Object.assign(
                new Error(
                  "RabbitMQ unavailable"
                ),
                {
                  code:
                    "ECONNREFUSED",
                }
              );
            }
          );


        expect(
          result
        )
          .toMatchObject({
            ok:
              false,

            degraded:
              true,

            dependency:
              "rabbitmq",

            decision:
              "DURABLE_RETRY",

            retryable:
              true,

            executionAuthorized:
              false,

            error: {
              code:
                "ECONNREFUSED",
            },
          });
      }
    );


    // ========================================================================
    // 4. DEGRADABLE DEPENDENCIES
    // ========================================================================

    test(
      "Redis degradation never becomes successful execution",
      async () => {
        const service =
          createService();


        const result =
          await service.execute(
            "redis",

            async () => {
              throw Object.assign(
                new Error(
                  "Redis unavailable"
                ),
                {
                  code:
                    "ECONNREFUSED",
                }
              );
            }
          );


        expect(
          result
        )
          .toMatchObject({
            ok:
              false,

            degraded:
              true,

            dependency:
              "redis",

            decision:
              "DEGRADED",

            retryable:
              true,

            executionAuthorized:
              false,
          });
      }
    );


    // ========================================================================
    // 5. OPTIONAL DEPENDENCIES
    // ========================================================================

    test(
      "optional dependency failure allows workflow continuation without authority",
      async () => {
        const service =
          createService();


        const result =
          await service.execute(
            "notifications",

            async () => {
              throw new Error(
                "Notification provider unavailable"
              );
            }
          );


        expect(
          result
        )
          .toMatchObject({
            ok:
              false,

            dependency:
              "notifications",

            decision:
              "CONTINUE",

            executionAuthorized:
              false,
          });
      }
    );


    // ========================================================================
    // 6. OPEN CIRCUIT SUPPRESSION
    // ========================================================================

    test(
      "dependency circuit suppresses repeated calls after threshold",
      async () => {
        const service =
          createService({
            redis: {
              dependencyClass:
                DEPENDENCY_CLASS
                  .DEGRADABLE,

              failureMode:
                FAILURE_MODE
                  .DEGRADE,

              failureThreshold:
                1,

              successThreshold:
                1,

              timeout:
                60000,
            },
          });


        const operation =
          jest.fn(
            async () => {
              throw new Error(
                "Redis down"
              );
            }
          );


        await service.execute(
          "redis",
          operation
        );


        const second =
          await service.execute(
            "redis",
            operation
          );


        expect(
          operation
        )
          .toHaveBeenCalledTimes(
            1
          );


        expect(
          service
            .getStatus(
              "redis"
            )
            .circuit
            .state
        )
          .toBe(
            "OPEN"
          );


        expect(
          second
        )
          .toMatchObject({
            ok:
              false,

            degraded:
              true,

            decision:
              "DEGRADED",

            executionAuthorized:
              false,
          });
      }
    );


    // ========================================================================
    // 7. UNKNOWN DEPENDENCY SAFETY
    // ========================================================================

    test(
      "unknown dependency cannot invent recovery policy",
      async () => {
        const service =
          createService();


        await expect(
          service.execute(
            "unknown-production-service",

            async () =>
              "unsafe"
          )
        )
          .rejects
          .toMatchObject({
            code:
              "DEPENDENCY_NOT_REGISTERED",

            retryable:
              false,

            executionAuthorized:
              false,
          });
      }
    );


    // ========================================================================
    // 8. DEPENDENCY HEALTH MATRIX
    // ========================================================================

    test(
      "health summary distinguishes degradation from critical unavailability",
      async () => {
        const service =
          createService({
            redis: {
              dependencyClass:
                DEPENDENCY_CLASS
                  .DEGRADABLE,

              failureMode:
                FAILURE_MODE
                  .DEGRADE,

              failureThreshold:
                1,

              successThreshold:
                1,

              timeout:
                60000,
            },

            kubernetes: {
              dependencyClass:
                DEPENDENCY_CLASS
                  .CRITICAL,

              failureMode:
                FAILURE_MODE
                  .FAIL_CLOSED,

              failureThreshold:
                1,

              successThreshold:
                1,

              timeout:
                60000,
            },
          });


        await service.execute(
          "redis",

          async () => {
            throw new Error(
              "Redis unavailable"
            );
          }
        );


        await expect(
          service.execute(
            "kubernetes",

            async () => {
              throw new Error(
                "Kubernetes unavailable"
              );
            }
          )
        )
          .rejects
          .toBeDefined();


        const summary =
          service
            .getSummary();


        expect(
          summary
        )
          .toMatchObject({
            open:
              2,

            degraded:
              2,

            healthy:
              false,

            executionAuthorized:
              false,
          });


        expect(
          summary
            .criticalUnavailable
        )
          .toContain(
            "kubernetes"
          );


        expect(
          summary
            .criticalUnavailable
        )
          .not
          .toContain(
            "redis"
          );
      }
    );


    // ========================================================================
    // 9. REGISTERED PRODUCTION FAILURE MATRIX
    // ========================================================================

    test(
      "production dependency classifications remain frozen",
      () => {
        const service =
          createService();


        const statuses =
          service
            .getAllStatuses();


        const byName =
          Object.fromEntries(
            statuses.map(
              (
                dependency
              ) => [
                dependency.name,
                dependency,
              ]
            )
          );


        expect(
          byName.kubernetes
        )
          .toMatchObject({
            dependencyClass:
              DEPENDENCY_CLASS
                .CRITICAL,

            failureMode:
              FAILURE_MODE
                .FAIL_CLOSED,
          });


        expect(
          byName.mongodb
        )
          .toMatchObject({
            dependencyClass:
              DEPENDENCY_CLASS
                .CRITICAL,

            failureMode:
              FAILURE_MODE
                .FAIL_CLOSED,
          });


        expect(
          byName.rabbitmq
        )
          .toMatchObject({
            dependencyClass:
              DEPENDENCY_CLASS
                .DURABLE_ASYNC,

            failureMode:
              FAILURE_MODE
                .DURABLE_RETRY,
          });


        expect(
          byName.redis
        )
          .toMatchObject({
            dependencyClass:
              DEPENDENCY_CLASS
                .DEGRADABLE,

            failureMode:
              FAILURE_MODE
                .DEGRADE,
          });


        expect(
          byName.notifications
        )
          .toMatchObject({
            dependencyClass:
              DEPENDENCY_CLASS
                .OPTIONAL,

            failureMode:
              FAILURE_MODE
                .CONTINUE,
          });
      }
    );


    // ========================================================================
    // 10. GLOBAL SAFETY INVARIANT
    // ========================================================================

    test(
      "dependency isolation never grants execution authority",
      async () => {
        const service =
          createService();


        const healthy =
          await service.execute(
            "mongodb",

            async () => ({
              connected:
                true,
            })
          );


        const degraded =
          await service.execute(
            "redis",

            async () => {
              throw new Error(
                "Redis unavailable"
              );
            }
          );


        const durableRetry =
          await service.execute(
            "rabbitmq",

            async () => {
              throw new Error(
                "RabbitMQ unavailable"
              );
            }
          );


        const optional =
          await service.execute(
            "notifications",

            async () => {
              throw new Error(
                "Notification unavailable"
              );
            }
          );


        expect(
          healthy
            .executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          degraded
            .executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          durableRetry
            .executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          optional
            .executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          service
            .getSummary()
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);