"use strict";

const {
  IdempotentWorkerService,
} =
  require(
    "../idempotentWorkerService"
  );

const {
  IDEMPOTENCY_DECISION,
  IDEMPOTENCY_OPERATION,
} =
  require(
    "../idempotencyContracts"
  );

function identity() {
  return {
    organizationId:
      "org-1",

    environmentId:
      "prod",

    operation:
      IDEMPOTENCY_OPERATION
        .EXECUTION,

    executionRequestId:
      "execution-1",

    executionPlanId:
      "plan-1",

    executionPlanHash:
      "hash-1",
  };
}

function dependencies({
  claim,
  heartbeatError,
} = {}) {
  return {
    keyService: {
      generate:
        jest.fn(
          () => ({
            idempotencyKey:
              "idem_v1_test",
          })
        ),

      fingerprint:
        jest.fn(
          () =>
            "fingerprint_sha256_test"
        ),
    },

    claimService: {
      acquire:
        jest.fn(
          async () =>
            claim || {
              acquired:
                true,

              decision:
                IDEMPOTENCY_DECISION
                  .ACQUIRED,

              claimToken:
                "claim-1",
            }
        ),
    },

    completionService: {
      complete:
        jest.fn(
          async () => ({
            finalized:
              true,
          })
        ),

      fail:
        jest.fn(
          async () => ({
            finalized:
              true,
          })
        ),
    },

    leaseService: {
      heartbeat:
        jest.fn(
          async () => {
            if (
              heartbeatError
            ) {
              throw heartbeatError;
            }

            return {
              renewed:
                true,
            };
          }
        ),
    },
  };
}

describe(
  "IdempotentWorkerService",
  () => {
    test(
      "acquired claim executes handler",
      async () => {
        const deps =
          dependencies();

        const service =
          new IdempotentWorkerService(
            deps
          );

        const handler =
          jest.fn(
            async () => ({
              success:
                true,
            })
          );

        const result =
          await service.run({
            identity:
              identity(),

            ownerId:
              "worker-1",

            payload: {
              action:
                "restart",
            },

            handler,
          });

        expect(
          handler
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result.executed
        )
          .toBe(
            true
          );

        expect(
          result.result
        )
          .toEqual({
            success:
              true,
          });
      }
    );

    test(
      "successful handler completes claim",
      async () => {
        const deps =
          dependencies();

        const service =
          new IdempotentWorkerService(
            deps
          );

        await service.run({
          identity:
            identity(),

          ownerId:
            "worker-1",

          payload: {},

          handler:
            async () =>
              "done",
        });

        expect(
          deps
            .completionService
            .complete
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          deps
            .completionService
            .fail
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "handler receives idempotency context",
      async () => {
        const deps =
          dependencies();

        const service =
          new IdempotentWorkerService(
            deps
          );

        const handler =
          jest.fn(
            async () =>
              true
          );

        await service.run({
          identity:
            identity(),

          ownerId:
            "worker-1",

          payload: {
            hello:
              "world",
          },

          handler,
        });

        expect(
          handler
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              payload: {
                hello:
                  "world",
              },

              idempotency:
                expect.objectContaining({
                  idempotencyKey:
                    "idem_v1_test",

                  claimToken:
                    "claim-1",

                  ownerId:
                    "worker-1",
                }),
            })
          );
      }
    );

    test(
      "duplicate completed does not execute handler",
      async () => {
        const deps =
          dependencies({
            claim: {
              acquired:
                false,

              decision:
                IDEMPOTENCY_DECISION
                  .DUPLICATE_COMPLETED,

              previousResult: {
                success:
                  true,
              },
            },
          });

        const service =
          new IdempotentWorkerService(
            deps
          );

        const handler =
          jest.fn();

        const result =
          await service.run({
            identity:
              identity(),

            ownerId:
              "worker-2",

            payload: {},

            handler,
          });

        expect(
          handler
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.executed
        )
          .toBe(
            false
          );

        expect(
          result.duplicate
        )
          .toBe(
            true
          );

        expect(
          result.previousResult
        )
          .toEqual({
            success:
              true,
          });
      }
    );

    test(
      "duplicate processing does not execute handler",
      async () => {
        const deps =
          dependencies({
            claim: {
              acquired:
                false,

              decision:
                IDEMPOTENCY_DECISION
                  .DUPLICATE_PROCESSING,
            },
          });

        const service =
          new IdempotentWorkerService(
            deps
          );

        const handler =
          jest.fn();

        const result =
          await service.run({
            identity:
              identity(),

            ownerId:
              "worker-2",

            payload: {},

            handler,
          });

        expect(
          handler
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.decision
        )
          .toBe(
            IDEMPOTENCY_DECISION
              .DUPLICATE_PROCESSING
          );
      }
    );

    test(
      "rejected claim does not execute handler",
      async () => {
        const deps =
          dependencies({
            claim: {
              acquired:
                false,

              decision:
                IDEMPOTENCY_DECISION
                  .REJECTED,

              reason:
                "fingerprint mismatch",
            },
          });

        const service =
          new IdempotentWorkerService(
            deps
          );

        const handler =
          jest.fn();

        const result =
          await service.run({
            identity:
              identity(),

            ownerId:
              "worker-1",

            payload: {},

            handler,
          });

        expect(
          handler
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.executed
        )
          .toBe(
            false
          );
      }
    );

    test(
      "handler failure marks claim failed",
      async () => {
        const deps =
          dependencies();

        const service =
          new IdempotentWorkerService(
            deps
          );

        const error =
          Object.assign(
            new Error(
              "dependency failed"
            ),
            {
              code:
                "DEPENDENCY_FAILED",

              retryable:
                true,
            }
          );

        await expect(
          service.run({
            identity:
              identity(),

            ownerId:
              "worker-1",

            payload: {},

            handler:
              async () => {
                throw error;
              },
          })
        )
          .rejects
          .toThrow(
            "dependency failed"
          );

        expect(
          deps
            .completionService
            .fail
        )
          .toHaveBeenCalledTimes(
            1
          );

        const failureInput =
          deps
            .completionService
            .fail
            .mock
            .calls[0][0];

        expect(
          failureInput.failure
        )
          .toMatchObject({
            code:
              "DEPENDENCY_FAILED",

            retryable:
              true,
          });
      }
    );

    test(
      "failed handler is never completed",
      async () => {
        const deps =
          dependencies();

        const service =
          new IdempotentWorkerService(
            deps
          );

        await expect(
          service.run({
            identity:
              identity(),

            ownerId:
              "worker-1",

            payload: {},

            handler:
              async () => {
                throw new Error(
                  "boom"
                );
              },
          })
        )
          .rejects
          .toThrow(
            "boom"
          );

        expect(
          deps
            .completionService
            .complete
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "custom retryability policy is supported",
      async () => {
        const deps =
          dependencies();

        const service =
          new IdempotentWorkerService(
            deps
          );

        await expect(
          service.run({
            identity:
              identity(),

            ownerId:
              "worker-1",

            payload: {},

            isRetryable:
              () =>
                true,

            handler:
              async () => {
                throw new Error(
                  "temporary"
                );
              },
          })
        )
          .rejects
          .toThrow();

        const failure =
          deps
            .completionService
            .fail
            .mock
            .calls[0][0]
            .failure;

        expect(
          failure.retryable
        )
          .toBe(
            true
          );
      }
    );

    test(
      "claim receives deterministic key and fingerprint",
      async () => {
        const deps =
          dependencies();

        const service =
          new IdempotentWorkerService(
            deps
          );

        await service.run({
          identity:
            identity(),

          ownerId:
            "worker-1",

          payload: {
            action:
              "restart",
          },

          handler:
            async () =>
              true,
        });

        expect(
          deps
            .claimService
            .acquire
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              idempotencyKey:
                "idem_v1_test",

              requestFingerprint:
                "fingerprint_sha256_test",

              ownerId:
                "worker-1",
            })
          );
      }
    );

    test(
      "wrapper never grants execution authorization",
      async () => {
        const deps =
          dependencies();

        const service =
          new IdempotentWorkerService(
            deps
          );

        const result =
          await service.run({
            identity:
              identity(),

            ownerId:
              "worker-1",

            payload: {},

            handler:
              async () =>
                true,
        });

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "unsafe authorization input is rejected",
      async () => {
        const service =
          new IdempotentWorkerService(
            dependencies()
          );

        await expect(
          service.run({
            identity:
              identity(),

            ownerId:
              "worker-1",

            executionAuthorized:
              true,

            handler:
              async () =>
                true,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "IDEMPOTENT_WORKER_UNSAFE_INPUT",
          });
      }
    );

    test(
      "requires handler",
      async () => {
        const service =
          new IdempotentWorkerService(
            dependencies()
          );

        await expect(
          service.run({
            identity:
              identity(),

            ownerId:
              "worker-1",
          })
        )
          .rejects
          .toMatchObject({
            code:
              "IDEMPOTENT_WORKER_HANDLER_REQUIRED",
          });
      }
    );

    test(
      "requires owner",
      async () => {
        const service =
          new IdempotentWorkerService(
            dependencies()
          );

        await expect(
          service.run({
            identity:
              identity(),

            handler:
              async () =>
                true,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "IDEMPOTENT_WORKER_OWNER_REQUIRED",
          });
      }
    );

    test(
      "retry failed claim may execute handler",
      async () => {
        const deps =
          dependencies({
            claim: {
              acquired:
                true,

              decision:
                IDEMPOTENCY_DECISION
                  .RETRY_FAILED,

              claimToken:
                "claim-retry",
            },
          });

        const service =
          new IdempotentWorkerService(
            deps
          );

        const handler =
          jest.fn(
            async () =>
              "recovered"
          );

        const result =
          await service.run({
            identity:
              identity(),

            ownerId:
              "worker-2",

            payload: {},

            handler,
          });

        expect(
          handler
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result.executed
        )
          .toBe(
            true
          );

        expect(
          result.decision
        )
          .toBe(
            IDEMPOTENCY_DECISION
              .RETRY_FAILED
          );
      }
    );

    test(
      "stale reclaimed claim may execute handler",
      async () => {
        const deps =
          dependencies({
            claim: {
              acquired:
                true,

              decision:
                IDEMPOTENCY_DECISION
                  .RECLAIM_STALE,

              claimToken:
                "claim-new",
            },
          });

        const service =
          new IdempotentWorkerService(
            deps
          );

        const handler =
          jest.fn(
            async () =>
              true
          );

        const result =
          await service.run({
            identity:
              identity(),

            ownerId:
              "worker-2",

            payload: {},

            handler,
          });

        expect(
          handler
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result.decision
        )
          .toBe(
            IDEMPOTENCY_DECISION
              .RECLAIM_STALE
          );
      }
    );
  }
);