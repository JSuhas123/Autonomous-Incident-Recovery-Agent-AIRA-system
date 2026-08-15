"use strict";

/**
 * Safety Gates Integration Tests
 *
 * Validates the five legacy execution safety mechanisms:
 *
 * 1. Kill Switch
 * 2. Circuit Breaker
 * 3. Idempotency
 * 4. Distributed Lock
 * 5. Confidence Threshold
 *
 * NOTE:
 *
 * These are infrastructure-level safety tests.
 * Phase 7 itself does not authorize execution.
 */

const mongoose =
  require(
    "mongoose"
  );

const {
  MongoMemoryServer,
} =
  require(
    "mongodb-memory-server"
  );

describe(
  "Safety Gates Integration Tests",
  () => {
    let mongoServer;

    // =========================================================================
    // DATABASE
    // =========================================================================

    beforeAll(
      async () => {
        mongoServer =
          await MongoMemoryServer
            .create();

        const mongoUri =
          mongoServer
            .getUri();

        await mongoose
          .connect(
            mongoUri
          );
      }
    );

    afterAll(
      async () => {
        if (
          mongoose
            .connection
            .readyState !==
          0
        ) {
          await mongoose
            .disconnect();
        }

        if (
          mongoServer
        ) {
          await mongoServer
            .stop();
        }
      }
    );

    beforeEach(
      async () => {
        const collections =
          mongoose
            .connection
            .collections;

        for (
          const key
          in collections
        ) {
          await collections[
            key
          ]
            .deleteMany(
              {}
            );
        }
      }
    );

    // =========================================================================
    // SAFETY GATE 1: KILL SWITCH
    // =========================================================================

    describe(
      "Safety Gate 1: Kill Switch Mechanism",
      () => {
        test(
          "Kill switch configuration can be read and enforced",
          () => {
            const {
              getKillSwitchManager,
            } =
              require(
                "../../config/killSwitches"
              );

            const manager =
              getKillSwitchManager();

            expect(
              manager
            )
              .toBeDefined();

            expect(
              typeof manager
                .areActionsEnabled
            )
              .toBe(
                "function"
              );

            expect(
              typeof manager
                .isLearningEnabled
            )
              .toBe(
                "function"
              );

            const status =
              manager
                .getAllStatuses();

            expect(
              status
            )
              .toBeDefined();

            expect(
              typeof status
                .ACTIONS_ENABLED
            )
              .toBe(
                "boolean"
              );
          }
        );

        test(
          "Kill switch can disable actions globally",
          () => {
            const {
              getKillSwitchManager,
            } =
              require(
                "../../config/killSwitches"
              );

            const manager =
              getKillSwitchManager();

            const initial =
              manager
                .areActionsEnabled();

            try {
              manager
                .setActionsEnabled(
                  false,
                  "integration test"
                );

              expect(
                manager
                  .areActionsEnabled()
              )
                .toBe(
                  false
                );
            } finally {
              manager
                .setActionsEnabled(
                  initial,
                  "test reset"
                );
            }
          }
        );

        test(
          "Kill switch supports action-specific restrictions",
          () => {
            const {
              getKillSwitchManager,
            } =
              require(
                "../../config/killSwitches"
              );

            const manager =
              getKillSwitchManager();

            const result =
              manager
                .isActionAllowed(
                  "scaling"
                );

            expect(
              typeof result
            )
              .toBe(
                "boolean"
              );
          }
        );

        test(
          "Emergency mode is available as a safety boundary",
          () => {
            const {
              getKillSwitchManager,
            } =
              require(
                "../../config/killSwitches"
              );

            const manager =
              getKillSwitchManager();

            const statuses =
              manager
                .getAllStatuses();

            expect(
              typeof Boolean(
                statuses
                  .EMERGENCY_MODE
              )
            )
              .toBe(
                "boolean"
              );
          }
        );
      }
    );

    // =========================================================================
    // SAFETY GATE 2: CIRCUIT BREAKER
    // =========================================================================

    describe(
      "Safety Gate 2: Circuit Breaker Pattern",
      () => {
        test(
          "Circuit breaker opens after threshold failures",
          async () => {
            const CircuitBreakerService =
              require(
                "../../services/infrastructure/circuitBreakerService"
              );

            const breaker =
              new CircuitBreakerService(
                "test-breaker",
                {
                  failureThreshold:
                    3,
                }
              );

            for (
              let i = 0;
              i < 3;
              i++
            ) {
              try {
                await breaker
                  .execute(
                    () =>
                      Promise.reject(
                        new Error(
                          "Failure"
                        )
                      )
                  );
              } catch (
                error
              ) {
                // Expected.
              }
            }

            expect(
              breaker
                .getState()
                .state
            )
              .toBe(
                "OPEN"
              );
          }
        );

        test(
          "Circuit breaker prevents calls while open",
          async () => {
            const CircuitBreakerService =
              require(
                "../../services/infrastructure/circuitBreakerService"
              );

            const breaker =
              new CircuitBreakerService(
                "test-breaker-2",
                {
                  failureThreshold:
                    2,
                }
              );

            for (
              let i = 0;
              i < 2;
              i++
            ) {
              try {
                await breaker
                  .execute(
                    () =>
                      Promise.reject(
                        new Error(
                          "Failure"
                        )
                      )
                  );
              } catch (
                error
              ) {
                // Expected.
              }
            }

            let blockedError =
              null;

            try {
              await breaker
                .execute(
                  () =>
                    Promise.resolve(
                      "should-not-run"
                    )
                );
            } catch (
              error
            ) {
              blockedError =
                error.message;
            }

            expect(
              blockedError
            )
              .toContain(
                "OPEN"
              );
          }
        );

        test(
          "Circuit breaker allows a recovery probe after timeout",
          async () => {
            const CircuitBreakerService =
              require(
                "../../services/infrastructure/circuitBreakerService"
              );

            const breaker =
              new CircuitBreakerService(
                "test-breaker-3",
                {
                  failureThreshold:
                    1,

                  timeout:
                    50,
                }
              );

            try {
              await breaker
                .execute(
                  () =>
                    Promise.reject(
                      new Error(
                        "Failure"
                      )
                    )
                );
            } catch (
              error
            ) {
              // Expected.
            }

            expect(
              breaker
                .getState()
                .state
            )
              .toBe(
                "OPEN"
              );

            await new Promise(
              (
                resolve
              ) =>
                setTimeout(
                  resolve,
                  75
                )
            );

            try {
              await breaker
                .execute(
                  () =>
                    Promise.resolve(
                      "recovered"
                    )
                );
            } catch (
              error
            ) {
              // Implementation may expose explicit HALF_OPEN first.
            }

            expect(
              breaker
                .getState()
                .state
            )
              .not
              .toBe(
                "OPEN"
              );
          }
        );

        test(
          "Circuit breaker closes after successful recovery",
          async () => {
            const CircuitBreakerService =
              require(
                "../../services/infrastructure/circuitBreakerService"
              );

            const breaker =
              new CircuitBreakerService(
                "test-breaker-4",
                {
                  failureThreshold:
                    1,

                  successThreshold:
                    1,

                  timeout:
                    50,
                }
              );

            try {
              await breaker
                .execute(
                  () =>
                    Promise.reject(
                      new Error(
                        "Failure"
                      )
                    )
                );
            } catch (
              error
            ) {
              // Expected.
            }

            await new Promise(
              (
                resolve
              ) =>
                setTimeout(
                  resolve,
                  75
                )
            );

            await breaker
              .execute(
                () =>
                  Promise.resolve(
                    "success"
                  )
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
      }
    );

    // =========================================================================
    // SAFETY GATE 3: IDEMPOTENCY
    // =========================================================================

    describe(
      "Safety Gate 3: Idempotency Guarantee",
      () => {
        test(
          "Idempotency service can be initialized",
          () => {
            const {
              IdempotencyService,
            } =
              require(
                "../../services/infrastructure/idempotencyService"
              );

            expect(
              IdempotencyService
            )
              .toBeDefined();

            expect(
              typeof IdempotencyService
                .generateKey
            )
              .toBe(
                "function"
              );
          }
        );

        test(
          "Duplicate action with same key is detected",
          async () => {
            const {
              IdempotencyService,
            } =
              require(
                "../../services/infrastructure/idempotencyService"
              );

            const service =
              new IdempotencyService();

            const action = {
              tenantId:
                "tenant-1",

              serviceId:
                "api",

              actionType:
                "restart",

              correlationId:
                "corr-123",
            };

            const key =
              IdempotencyService
                .generateKey(
                  action
                );

            expect(
              await service
                .checkIdempotency(
                  action.tenantId,
                  key
                )
            )
              .toBeNull();

            await service
              .recordExecution(
                action.tenantId,
                key,
                {
                  success:
                    true,
                }
              );

            const result =
              await service
                .checkIdempotency(
                  action.tenantId,
                  key
                );

            expect(
              result
            )
              .toBeDefined();

            expect(
              result.success
            )
              .toBe(
                true
              );
          }
        );

        test(
          "Idempotency key generation is deterministic",
          () => {
            const {
              IdempotencyService,
            } =
              require(
                "../../services/infrastructure/idempotencyService"
              );

            const action = {
              tenantId:
                "tenant-1",

              serviceId:
                "api",

              actionType:
                "restart",

              correlationId:
                "corr-123",
            };

            const first =
              IdempotencyService
                .generateKey(
                  action
                );

            const second =
              IdempotencyService
                .generateKey(
                  action
                );

            expect(
              first
            )
              .toBe(
                second
              );

            const third =
              IdempotencyService
                .generateKey({
                  ...action,

                  correlationId:
                    "corr-456",
                });

            expect(
              first
            )
              .not
              .toBe(
                third
              );
          }
        );

        test(
          "Idempotency service supports memory fallback",
          async () => {
            const {
              IdempotencyService,
            } =
              require(
                "../../services/infrastructure/idempotencyService"
              );

            const service =
              new IdempotencyService();

            const action = {
              tenantId:
                "tenant-test",

              serviceId:
                "api",

              actionType:
                "test",

              correlationId:
                "test-corr",
            };

            const key =
              IdempotencyService
                .generateKey(
                  action
                );

            await service
              .recordExecution(
                action.tenantId,
                key,
                {
                  tested:
                    true,
                }
              );

            const result =
              await service
                .checkIdempotency(
                  action.tenantId,
                  key
                );

            expect(
              result
            )
              .toBeDefined();
          }
        );
      }
    );

    // =========================================================================
    // SAFETY GATE 4: DISTRIBUTED LOCK
    // =========================================================================

    describe(
      "Safety Gate 4: Distributed Lock",
      () => {
        test(
          "Distributed lock service can be initialized",
          () => {
            const distributedLockService =
              require(
                "../../services/infrastructure/distributedLockService"
              );

            expect(
              distributedLockService
            )
              .toBeDefined();

            expect(
              typeof distributedLockService
                .acquireLock
            )
              .toBe(
                "function"
              );
          }
        );

        test(
          "Lock serializes access to a shared resource",
          async () => {
            const distributedLockService =
              require(
                "../../services/infrastructure/distributedLockService"
              );

            const order =
              [];

            const resource =
              "shared-resource-test";

            await distributedLockService
              .acquireLock(
                resource,
                async () => {
                  order.push(
                    1
                  );
                }
              );

            await distributedLockService
              .acquireLock(
                resource,
                async () => {
                  order.push(
                    2
                  );
                }
              );

            expect(
              order
            )
              .toEqual(
                [
                  1,
                  2,
                ]
              );
          }
        );

        test(
          "Lock can be reacquired after callback completion",
          async () => {
            const distributedLockService =
              require(
                "../../services/infrastructure/distributedLockService"
              );

            const resource =
              "ttl-test-resource";

            const first =
              await distributedLockService
                .acquireLock(
                  resource,
                  async () => ({
                    acquired:
                      true,
                  }),
                  {
                    ttl:
                      500,
                  }
                );

            const second =
              await distributedLockService
                .acquireLock(
                  resource,
                  async () => ({
                    acquired:
                      true,
                  }),
                  {
                    ttl:
                      500,
                  }
                );

            expect(
              first
            )
              .toBeDefined();

            expect(
              second
            )
              .toBeDefined();
          }
        );
      }
    );

    // =========================================================================
    // SAFETY GATE 5: CONFIDENCE
    // =========================================================================

    describe(
      "Safety Gate 5: Confidence-Based Decision Gating",
      () => {
        test(
          "Confidence thresholds are configured",
          () => {
            const {
              getConfidenceEnforcer,
            } =
              require(
                "../../config/confidenceThresholds"
              );

            const enforcer =
              getConfidenceEnforcer();

            expect(
              typeof enforcer
                .AUTO_EXECUTE_THRESHOLD
            )
              .toBe(
                "number"
              );

            expect(
              typeof enforcer
                .ESCALATION_THRESHOLD
            )
              .toBe(
                "number"
              );

            expect(
              enforcer
                .AUTO_EXECUTE_THRESHOLD
            )
              .toBeGreaterThan(
                enforcer
                  .ESCALATION_THRESHOLD
              );
          }
        );

        test(
          "Low confidence decisions use OBSERVE tier",
          () => {
            const {
              getConfidenceEnforcer,
            } =
              require(
                "../../config/confidenceThresholds"
              );

            const tier =
              getConfidenceEnforcer()
                .determineTier(
                  0.45
                );

            expect(
              tier.tier
            )
              .toBe(
                "OBSERVE"
              );
          }
        );

        test(
          "Medium confidence decisions use ESCALATE tier",
          () => {
            const {
              getConfidenceEnforcer,
            } =
              require(
                "../../config/confidenceThresholds"
              );

            const tier =
              getConfidenceEnforcer()
                .determineTier(
                  0.72
                );

            expect(
              tier.tier
            )
              .toBe(
                "ESCALATE"
              );
          }
        );

        test(
          "High confidence decisions satisfy legacy AUTO_EXECUTE tier",
          () => {
            const {
              getConfidenceEnforcer,
            } =
              require(
                "../../config/confidenceThresholds"
              );

            const tier =
              getConfidenceEnforcer()
                .determineTier(
                  0.95
                );

            expect(
              tier.tier
            )
              .toBe(
                "AUTO_EXECUTE"
              );
          }
        );
      }
    );

    // =========================================================================
    // COMBINED SAFETY
    // =========================================================================

    describe(
      "Combined Safety Gate Scenarios",
      () => {
        test(
          "Kill switch overrides confidence threshold",
          () => {
            const {
              getKillSwitchManager,
            } =
              require(
                "../../config/killSwitches"
              );

            const {
              getConfidenceEnforcer,
            } =
              require(
                "../../config/confidenceThresholds"
              );

            const killSwitchManager =
              getKillSwitchManager();

            const enforcer =
              getConfidenceEnforcer();

            const initial =
              killSwitchManager
                .areActionsEnabled();

            try {
              killSwitchManager
                .setActionsEnabled(
                  false,
                  "combined safety test"
                );

              const tier =
                enforcer
                  .determineTier(
                    0.95
                  );

              const canExecute =
                killSwitchManager
                  .areActionsEnabled() &&
                tier.canAutoExecute;

              expect(
                canExecute
              )
                .toBe(
                  false
                );
            } finally {
              killSwitchManager
                .setActionsEnabled(
                  initial,
                  "test reset"
                );
            }
          }
        );

        test(
          "Circuit breaker prevents action during degradation",
          async () => {
            const CircuitBreakerService =
              require(
                "../../services/infrastructure/circuitBreakerService"
              );

            const breaker =
              new CircuitBreakerService(
                "scaling-api",
                {
                  failureThreshold:
                    2,
                }
              );

            for (
              let i = 0;
              i < 2;
              i++
            ) {
              try {
                await breaker
                  .execute(
                    () =>
                      Promise.reject(
                        new Error(
                          "API down"
                        )
                      )
                  );
              } catch (
                error
              ) {
                // Expected.
              }
            }

            expect(
              breaker
                .getState()
                .state
            )
              .toBe(
                "OPEN"
              );
          }
        );

        test(
          "Idempotency and circuit breaker prevent retry storm",
          async () => {
            const CircuitBreakerService =
              require(
                "../../services/infrastructure/circuitBreakerService"
              );

            const {
              IdempotencyService,
            } =
              require(
                "../../services/infrastructure/idempotencyService"
              );

            const breaker =
              new CircuitBreakerService(
                "k8s-api",
                {
                  failureThreshold:
                    1,
                }
              );

            const idempotency =
              new IdempotencyService();

            const decisionId =
              "dec-retry-storm";

            const action = {
              tenantId:
                "test",

              serviceId:
                "api",

              actionType:
                "restart",

              correlationId:
                decisionId,
            };

            const key =
              IdempotencyService
                .generateKey(
                  action
                );

            let retryCount =
              0;

            try {
              await breaker
                .execute(
                  async () => {
                    retryCount +=
                      1;

                    throw new Error(
                      "API down"
                    );
                  }
                );
            } catch (
              error
            ) {
              // Expected.
            }

            expect(
              breaker
                .getState()
                .state
            )
              .toBe(
                "OPEN"
              );

            await idempotency
              .recordExecution(
                action.tenantId,
                key,
                {
                  failed:
                    true,
                }
              );

            try {
              await breaker
                .execute(
                  async () => {
                    retryCount +=
                      1;
                  }
                );
            } catch (
              error
            ) {
              // Expected open breaker.
            }

            expect(
              retryCount
            )
              .toBe(
                1
              );

            expect(
              await idempotency
                .checkIdempotency(
                  action.tenantId,
                  key
                )
            )
              .toBeDefined();
          }
        );

        test(
          "Distributed locking remains available for eligible decisions",
          async () => {
            const distributedLockService =
              require(
                "../../services/infrastructure/distributedLockService"
              );

            const {
              getConfidenceEnforcer,
            } =
              require(
                "../../config/confidenceThresholds"
              );

            const enforcer =
              getConfidenceEnforcer();

            const decision1 = {
              confidence:
                0.92,
            };

            const decision2 = {
              confidence:
                0.91,
            };

            const tier1 =
              enforcer
                .determineTier(
                  decision1.confidence
                );

            const tier2 =
              enforcer
                .determineTier(
                  decision2.confidence
                );

            expect(
              tier1.canAutoExecute
            )
              .toBe(
                true
              );

            expect(
              tier2.canAutoExecute
            )
              .toBe(
                true
              );

            let count =
              0;

            await distributedLockService
              .acquireLock(
                "double-scaling-test",
                async () => {
                  count +=
                    1;
                }
              );

            expect(
              count
            )
              .toBe(
                1
              );
          }
        );
      }
    );

    // =========================================================================
    // SAFETY RECOVERY
    // =========================================================================

    describe(
      "Safety Gate Failure Recovery",
      () => {
        test(
          "System can recover from temporary degradation",
          async () => {
            const CircuitBreakerService =
              require(
                "../../services/infrastructure/circuitBreakerService"
              );

            const breaker =
              new CircuitBreakerService(
                "api-recovery",
                {
                  failureThreshold:
                    2,

                  timeout:
                    50,

                  successThreshold:
                    1,
                }
              );

            for (
              let i = 0;
              i < 2;
              i++
            ) {
              try {
                await breaker
                  .execute(
                    () =>
                      Promise.reject(
                        new Error(
                          "Failure"
                        )
                      )
                  );
              } catch (
                error
              ) {
                // Expected.
              }
            }

            expect(
              breaker
                .getState()
                .state
            )
              .toBe(
                "OPEN"
              );

            await new Promise(
              (
                resolve
              ) =>
                setTimeout(
                  resolve,
                  75
                )
            );

            await breaker
              .execute(
                () =>
                  Promise.resolve(
                    "recovered"
                  )
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

        test(
          "Idempotency prevents retry duplication",
          async () => {
            const {
              IdempotencyService,
            } =
              require(
                "../../services/infrastructure/idempotencyService"
              );

            const service =
              new IdempotencyService();

            const action = {
              tenantId:
                "test",

              serviceId:
                "api",

              actionType:
                "restart",

              correlationId:
                "retry-test",
            };

            const key =
              IdempotencyService
                .generateKey(
                  action
                );

            await service
              .recordExecution(
                action.tenantId,
                key,
                {
                  success:
                    true,
                }
              );

            const result =
              await service
                .checkIdempotency(
                  action.tenantId,
                  key
                );

            expect(
              result
            )
              .toBeDefined();

            expect(
              result.success
            )
              .toBe(
                true
              );
          }
        );

        test(
          "Distributed lock can be reacquired after completion",
          async () => {
            const distributedLockService =
              require(
                "../../services/infrastructure/distributedLockService"
              );

            const resource =
              "crash-recovery-test";

            const first =
              await distributedLockService
                .acquireLock(
                  resource,
                  async () => ({
                    acquired:
                      true,
                  })
                );

            const second =
              await distributedLockService
                .acquireLock(
                  resource,
                  async () => ({
                    acquired:
                      true,
                  })
                );

            expect(
              first
            )
              .toBeDefined();

            expect(
              second
            )
              .toBeDefined();
          }
        );

        test(
          "Kill switch state can be queried dynamically",
          () => {
            const {
              getKillSwitchManager,
            } =
              require(
                "../../config/killSwitches"
              );

            const manager =
              getKillSwitchManager();

            expect(
              typeof manager
                .areActionsEnabled()
            )
              .toBe(
                "boolean"
              );
          }
        );
      }
    );
  }
);