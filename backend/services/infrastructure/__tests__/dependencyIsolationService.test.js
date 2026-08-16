"use strict";

const {
  DependencyIsolationService,
  DEPENDENCY_CLASS,
  FAILURE_MODE,
} =
  require(
    "../dependencyIsolationService"
  );


describe(
  "DependencyIsolationService",
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
    // CRITICAL DEPENDENCIES
    // ========================================================================

    test(
      "critical dependency fails closed",
      async () => {
        const service =
          createService();

        await expect(
          service.execute(
            "kubernetes",

            async () => {
              throw Object.assign(
                new Error(
                  "Kubernetes API unavailable"
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
    // DURABLE ASYNC DEPENDENCIES
    // ========================================================================

    test(
      "rabbitmq failure becomes durable retry decision",
      async () => {
        const service =
          createService();

        const result =
          await service
            .execute(
              "rabbitmq",

              async () => {
                throw Object.assign(
                  new Error(
                    "broker unavailable"
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
          });
      }
    );


    // ========================================================================
    // REDIS DEGRADATION
    // ========================================================================

    test(
      "redis failure degrades instead of granting success",
      async () => {
        const service =
          createService();

        const result =
          await service
            .execute(
              "redis",

              async () => {
                throw Object.assign(
                  new Error(
                    "redis unavailable"
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


        /*
         * IMPORTANT:
         *
         * Dependency isolation must never convert Redis
         * degradation into successful execution.
         */
        expect(
          result.ok
        )
          .toBe(
            false
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
      "redis degradation preserves original dependency error",
      async () => {
        const service =
          createService();

        const result =
          await service
            .execute(
              "redis",

              async () => {
                throw Object.assign(
                  new Error(
                    "Redis connection refused"
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

            executionAuthorized:
              false,

            error: {
              code:
                "ECONNREFUSED",

              message:
                "Redis connection refused",
            },
          });
      }
    );


    test(
      "redis circuit opens and suppresses repeated dependency calls",
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
                2,

              successThreshold:
                1,

              timeout:
                60000,
            },
          });


        const redisOperation =
          jest.fn(
            async () => {
              throw Object.assign(
                new Error(
                  "Redis down"
                ),
                {
                  code:
                    "ECONNREFUSED",
                }
              );
            }
          );


        const first =
          await service
            .execute(
              "redis",
              redisOperation
            );


        const second =
          await service
            .execute(
              "redis",
              redisOperation
            );


        const third =
          await service
            .execute(
              "redis",
              redisOperation
            );


        expect(
          first.decision
        )
          .toBe(
            "DEGRADED"
          );


        expect(
          second.decision
        )
          .toBe(
            "DEGRADED"
          );


        /*
         * Third call must fail fast.
         *
         * The protected Redis operation must not execute
         * after the circuit has opened.
         */
        expect(
          redisOperation
        )
          .toHaveBeenCalledTimes(
            2
          );


        const status =
          service
            .getStatus(
              "redis"
            );


        expect(
          status
            .circuit
            .state
        )
          .toBe(
            "OPEN"
          );


        expect(
          third
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

            executionAuthorized:
              false,
          });
      }
    );


    // ========================================================================
    // OPTIONAL DEPENDENCIES
    // ========================================================================

    test(
      "optional notification failure does not terminate workflow",
      async () => {
        const service =
          createService();

        const result =
          await service
            .execute(
              "notifications",

              async () => {
                throw new Error(
                  "Slack unavailable"
                );
              }
            );

        expect(
          result
            .decision
        )
          .toBe(
            "CONTINUE"
          );

        expect(
          result.ok
        )
          .toBe(
            false
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    // ========================================================================
    // HEALTHY DEPENDENCY
    // ========================================================================

    test(
      "healthy dependency returns result",
      async () => {
        const service =
          createService();

        const result =
          await service
            .execute(
              "mongodb",

              async () => ({
                connected:
                  true,
              })
            );

        expect(
          result
        )
          .toMatchObject({
            ok:
              true,

            degraded:
              false,

            result: {
              connected:
                true,
            },

            executionAuthorized:
              false,
          });
      }
    );


    // ========================================================================
    // CIRCUIT OPENING
    // ========================================================================

    test(
      "repeated failures open dependency circuit",
      async () => {
        const service =
          createService({
            "test-api": {
              dependencyClass:
                DEPENDENCY_CLASS
                  .DEGRADABLE,

              failureMode:
                FAILURE_MODE
                  .DEGRADE,

              failureThreshold:
                2,

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
                "down"
              );
            }
          );

        await service.execute(
          "test-api",
          operation
        );

        await service.execute(
          "test-api",
          operation
        );

        const third =
          await service
            .execute(
              "test-api",
              operation
            );

        expect(
          service
            .getStatus(
              "test-api"
            )
            .circuit
            .state
        )
          .toBe(
            "OPEN"
          );

        /*
         * Third call must fail fast.
         *
         * The protected operation ran only for the first
         * two attempts.
         */
        expect(
          operation
        )
          .toHaveBeenCalledTimes(
            2
          );

        expect(
          third.decision
        )
          .toBe(
            "DEGRADED"
          );

        expect(
          third.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    // ========================================================================
    // UNKNOWN DEPENDENCIES
    // ========================================================================

    test(
      "unknown dependency fails closed instead of inventing policy",
      async () => {
        const service =
          createService();

        await expect(
          service.execute(
            "unknown-system",

            async () =>
              true
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
    // EXECUTION AUTHORITY BOUNDARY
    // ========================================================================

    test(
      "dependency layer never returns execution authority",
      async () => {
        const service =
          createService();

        const result =
          await service
            .execute(
              "mongodb",

              async () =>
                "ok"
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
    // PHASE 11.5 — DEPENDENCY HEALTH SUMMARY
    // ========================================================================

    test(
      "healthy dependency summary reports no degraded dependencies",
      () => {
        const service =
          createService();


        const summary =
          service
            .getSummary();


        expect(
          summary
        )
          .toMatchObject({
            degraded:
              0,

            open:
              0,

            halfOpen:
              0,

            healthy:
              true,

            executionAuthorized:
              false,
          });


        expect(
          summary
            .criticalUnavailable
        )
          .toEqual(
            []
          );
      }
    );


    test(
      "redis open circuit is degraded but not critical unavailable",
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


        await service.execute(
          "redis",

          async () => {
            throw new Error(
              "Redis unavailable"
            );
          }
        );


        const summary =
          service
            .getSummary();


        expect(
          summary.open
        )
          .toBe(
            1
          );


        expect(
          summary.degraded
        )
          .toBe(
            1
          );


        expect(
          summary
            .criticalUnavailable
        )
          .not
          .toContain(
            "redis"
          );


        /*
         * Redis is DEGRADABLE.
         *
         * Therefore dependency health can remain operational
         * even while Redis functionality is degraded.
         *
         * systemHealthService remains responsible for deciding
         * whether loss of Redis coordination requires AIRA
         * safe mode.
         */
        expect(
          summary.healthy
        )
          .toBe(
            true
          );


        expect(
          summary.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "critical dependency open circuit makes dependency summary unhealthy",
      async () => {
        const service =
          createService({
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
          summary.open
        )
          .toBe(
            1
          );


        expect(
          summary.degraded
        )
          .toBe(
            1
          );


        expect(
          summary
            .criticalUnavailable
        )
          .toContain(
            "kubernetes"
          );


        expect(
          summary.healthy
        )
          .toBe(
            false
          );


        expect(
          summary.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "summary distinguishes degradable and critical dependency failures",
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
              "Redis down"
            );
          }
        );


        await expect(
          service.execute(
            "kubernetes",

            async () => {
              throw new Error(
                "Kubernetes down"
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
          summary.open
        )
          .toBe(
            2
          );


        expect(
          summary.degraded
        )
          .toBe(
            2
          );


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


        expect(
          summary.healthy
        )
          .toBe(
            false
          );


        expect(
          summary.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    // ========================================================================
    // STATUS VISIBILITY
    // ========================================================================

    test(
      "getAllStatuses exposes registered dependency isolation state",
      () => {
        const service =
          createService();


        const statuses =
          service
            .getAllStatuses();


        expect(
          Array.isArray(
            statuses
          )
        )
          .toBe(
            true
          );


        const redis =
          statuses.find(
            (
              dependency
            ) =>
              dependency.name ===
              "redis"
          );


        const kubernetes =
          statuses.find(
            (
              dependency
            ) =>
              dependency.name ===
              "kubernetes"
          );


        const rabbitmq =
          statuses.find(
            (
              dependency
            ) =>
              dependency.name ===
              "rabbitmq"
          );


        expect(
          redis
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
          kubernetes
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
          rabbitmq
        )
          .toMatchObject({
            dependencyClass:
              DEPENDENCY_CLASS
                .DURABLE_ASYNC,

            failureMode:
              FAILURE_MODE
                .DURABLE_RETRY,
          });
      }
    );
  }
);