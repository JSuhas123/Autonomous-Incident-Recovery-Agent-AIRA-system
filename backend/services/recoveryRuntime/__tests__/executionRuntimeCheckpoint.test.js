"use strict";

const {
  ExecutionWorker,
} =
  require(
    "../../../workers/executionWorker"
  );

const {
  RUNTIME_STAGE,
  RESUME_SAFETY,
} =
  require(
    "../recoveryRuntimeContracts"
  );

// ============================================================================
// FIXTURES
// ============================================================================

function baseJob(
  overrides = {}
) {
  return {
    executionRequestId:
      "execution-request-1",

    organizationId:
      "org-1",

    environmentId:
      "prod",

    incidentId:
      "incident-1",

    recoveryDecisionId:
      "recovery-decision-1",

    authorizationId:
      "authorization-1",

    executionPlanId:
      "plan-1",

    executionPlanHash:
      "hash-1",

    executionPlan: {
      planId:
        "plan-1",

      planHash:
        "hash-1",
    },

    ...overrides,
  };
}

function checkpointMock(
  overrides = {}
) {
  return {
    ensureCheckpoint:
      jest.fn(
        async () => ({
          created:
            true,
        })
      ),

    claim:
      jest.fn(
        async () => ({
          claimed:
            true,

          claimToken:
            "execution-claim-1",
        })
      ),

    complete:
      jest.fn(
        async () => ({
          completed:
            true,
        })
      ),

    fail:
      jest.fn(
        async () => ({
          failed:
            true,
        })
      ),

    ...overrides,
  };
}

function idempotentWorkerMock(
  overrides = {}
) {
  return {
    run:
      jest.fn(
        async (
          input
        ) => ({
          executed:
            true,

          duplicate:
            false,

          decision:
            "ACQUIRED",

          idempotencyKey:
            "execution-idempotency-1",

          result:
            await input.handler(),
        })
      ),

    ...overrides,
  };
}

/*
 * For checkpoint tests we do not need to exercise MongoDB or the complete
 * Phase 8 executor again. Those are already covered by the execution tests.
 *
 * We replace processAuthorizedExecution on the worker instance so these tests
 * specifically verify:
 *
 * checkpoint
 *      ↓
 * idempotency
 *      ↓
 * execution boundary
 */
function createWorker({
  checkpoint =
    checkpointMock(),

  idempotentWorker =
    idempotentWorkerMock(),

  authorizedExecutionResult = {
    success:
      true,

    executionPerformed:
      true,
  },

  authorizedExecutionError =
    null,
} = {}) {
  const worker =
    new ExecutionWorker({
      runtimeCheckpoint:
        checkpoint,

      runtimeCheckpointEnabled:
        true,

      idempotentWorker,

      workerId:
        "execution-test-worker",

      ExecutionRequest: {
        findOne:
          jest.fn(),
      },

      ExecutionAuthorization: {
        findOne:
          jest.fn(),
      },

      queue: {
        publishStarted:
          jest.fn(),

        publishCompleted:
          jest.fn(),

        publishFailed:
          jest.fn(),

        publishBlocked:
          jest.fn(),
      },
    });

  worker.processAuthorizedExecution =
    jest.fn(
      async () => {
        if (
          authorizedExecutionError
        ) {
          throw authorizedExecutionError;
        }

        return authorizedExecutionResult;
      }
    );

  return worker;
}

// ============================================================================
// TESTS
// ============================================================================

describe(
  "ExecutionWorker Runtime Checkpoint",
  () => {
    test(
      "ensures EXECUTION checkpoint before execution processing",
      async () => {
        const checkpoint =
          checkpointMock();

        const worker =
          createWorker({
            checkpoint,
          });

        await worker.process(
          baseJob()
        );

        expect(
          checkpoint
            .ensureCheckpoint
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          checkpoint
            .ensureCheckpoint
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              organizationId:
                "org-1",

              environmentId:
                "prod",

              incidentId:
                "incident-1",

              stage:
                RUNTIME_STAGE
                  .EXECUTION,

              workflowIdentity:
                expect.objectContaining({
                  recoveryDecisionId:
                    "recovery-decision-1",

                  executionRequestId:
                    "execution-request-1",

                  executionPlanHash:
                    "hash-1",
                }),

              executionAuthorized:
                false,
            })
          );
      }
    );

    test(
      "checkpoint is claimed before idempotency boundary",
      async () => {
        const order =
          [];

        const checkpoint =
          checkpointMock({
            claim:
              jest.fn(
                async () => {
                  order.push(
                    "checkpoint"
                  );

                  return {
                    claimed:
                      true,

                    claimToken:
                      "execution-claim-1",
                  };
                }
              ),
          });

        const idempotentWorker = {
          run:
            jest.fn(
              async (
                input
              ) => {
                order.push(
                  "idempotency"
                );

                return {
                  executed:
                    true,

                  duplicate:
                    false,

                  decision:
                    "ACQUIRED",

                  idempotencyKey:
                    "idem-1",

                  result:
                    await input.handler(),
                };
              }
            ),
        };

        const worker =
          createWorker({
            checkpoint,
            idempotentWorker,
          });

        await worker.process(
          baseJob()
        );

        expect(
          order
        )
          .toEqual([
            "checkpoint",
            "idempotency",
          ]);
      }
    );

    test(
      "successful execution completes runtime checkpoint",
      async () => {
        const checkpoint =
          checkpointMock();

        const worker =
          createWorker({
            checkpoint,
          });

        const result =
          await worker.process(
            baseJob()
          );

        expect(
          checkpoint.complete
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          checkpoint.complete
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              stage:
                RUNTIME_STAGE
                  .EXECUTION,

              workerId:
                "execution-test-worker",

              claimToken:
                "execution-claim-1",

              resumeSafety:
                RESUME_SAFETY
                  .SAFE,

              executionAuthorized:
                false,
            })
          );

        expect(
          checkpoint.fail
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.checkpointClaimed
        )
          .toBe(
            true
          );

        expect(
          result.checkpointCompleted
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
      "execution failure requires reconciliation instead of safe runtime replay",
      async () => {
        const checkpoint =
          checkpointMock();

        const executionError =
          Object.assign(
            new Error(
              "Executor connection lost"
            ),
            {
              code:
                "ECONNRESET",

              retryable:
                true,
            }
          );

        const worker =
          createWorker({
            checkpoint,

            authorizedExecutionError:
              executionError,
          });

        await expect(
          worker.process(
            baseJob()
          )
        )
          .rejects
          .toMatchObject({
            code:
              "ECONNRESET",
          });

        expect(
          checkpoint.fail
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          checkpoint.fail
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              stage:
                RUNTIME_STAGE
                  .EXECUTION,

              claimToken:
                "execution-claim-1",

              error:
                expect.objectContaining({
                  code:
                    "ECONNRESET",

                  retryable:
                    true,
                }),

              resumeSafety:
                RESUME_SAFETY
                  .REQUIRES_RECONCILIATION,

              executionAuthorized:
                false,
            })
          );

        expect(
          checkpoint.complete
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "non retryable execution failure still requires reconciliation",
      async () => {
        const checkpoint =
          checkpointMock();

        const executionError =
          Object.assign(
            new Error(
              "Executor failed after mutation boundary"
            ),
            {
              code:
                "EXECUTION_FAILED",
            }
          );

        const worker =
          createWorker({
            checkpoint,

            authorizedExecutionError:
              executionError,
          });

        await expect(
          worker.process(
            baseJob()
          )
        )
          .rejects
          .toThrow(
            "Executor failed after mutation boundary"
          );

        expect(
          checkpoint.fail
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              resumeSafety:
                RESUME_SAFETY
                  .REQUIRES_RECONCILIATION,
            })
          );
      }
    );

    test(
      "unclaimed execution checkpoint prevents idempotency and execution",
      async () => {
        const checkpoint =
          checkpointMock({
            claim:
              jest.fn(
                async () => ({
                  claimed:
                    false,

                  reason:
                    "STATUS_PROCESSING",

                  checkpoint: {
                    status:
                      "PROCESSING",
                  },
                })
              ),
          });

        const idempotentWorker =
          idempotentWorkerMock();

        const worker =
          createWorker({
            checkpoint,
            idempotentWorker,
          });

        const result =
          await worker.process(
            baseJob()
          );

        expect(
          idempotentWorker.run
        )
          .not
          .toHaveBeenCalled();

        expect(
          worker
            .processAuthorizedExecution
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.checkpointClaimed
        )
          .toBe(
            false
          );

        expect(
          result.executionPerformed
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
      "abandoned execution checkpoint requires mutation reconciliation",
      async () => {
        const checkpoint =
          checkpointMock({
            claim:
              jest.fn(
                async () => ({
                  claimed:
                    false,

                  reason:
                    "STATUS_ABANDONED",

                  checkpoint: {
                    status:
                      "ABANDONED",
                  },
                })
              ),
          });

        const worker =
          createWorker({
            checkpoint,
          });

        const result =
          await worker.process(
            baseJob()
          );

        expect(
          result
            .mutationReconciliationRequired
        )
          .toBe(
            true
          );

        expect(
          result.executionPerformed
        )
          .toBe(
            false
          );

        expect(
          worker
            .processAuthorizedExecution
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "checkpoint identity contains immutable execution plan hash",
      async () => {
        const checkpoint =
          checkpointMock();

        const worker =
          createWorker({
            checkpoint,
          });

        await worker.process(
          baseJob()
        );

        const call =
          checkpoint
            .ensureCheckpoint
            .mock
            .calls[0][0];

        expect(
          call.workflowIdentity
            .executionRequestId
        )
          .toBe(
            "execution-request-1"
          );

        expect(
          call.workflowIdentity
            .executionPlanHash
        )
          .toBe(
            "hash-1"
          );
      }
    );

    test(
      "runtime checkpoint never receives execution authorization",
      async () => {
        const checkpoint =
          checkpointMock();

        const worker =
          createWorker({
            checkpoint,
          });

        await worker.process(
          baseJob()
        );

        for (
          const method
          of [
            "ensureCheckpoint",
            "claim",
            "complete",
          ]
        ) {
          for (
            const call
            of checkpoint[
              method
            ].mock.calls
          ) {
            expect(
              call[0]
                .executionAuthorized
            )
              .toBe(
                false
              );
          }
        }
      }
    );

    test(
      "runtime checkpoint failure never masks original execution failure",
      async () => {
        const originalError =
          Object.assign(
            new Error(
              "Original executor failure"
            ),
            {
              code:
                "ORIGINAL_FAILURE",
            }
          );

        const checkpointError =
          new Error(
            "Checkpoint database unavailable"
          );

        const checkpoint =
          checkpointMock({
            fail:
              jest.fn(
                async () => {
                  throw checkpointError;
                }
              ),
          });

        const worker =
          createWorker({
            checkpoint,

            authorizedExecutionError:
              originalError,
          });

        let caught;

        try {
          await worker.process(
            baseJob()
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
          .toBe(
            originalError
          );

        expect(
          caught
            .runtimeCheckpointError
        )
          .toBe(
            checkpointError
          );
      }
    );

    test(
      "duplicate completed execution does not invoke execution again",
      async () => {
        const checkpoint =
          checkpointMock();

        const idempotentWorker = {
          run:
            jest.fn(
              async () => ({
                executed:
                  false,

                duplicate:
                  true,

                decision:
                  "DUPLICATE_COMPLETED",

                idempotencyKey:
                  "idem-1",

                previousResult: {
                  success:
                    true,
                },
              })
            ),
        };

        const worker =
          createWorker({
            checkpoint,
            idempotentWorker,
          });

        const result =
          await worker.process(
            baseJob()
          );

        expect(
          worker
            .processAuthorizedExecution
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.duplicate
        )
          .toBe(
            true
          );

        expect(
          result.executionPerformed
        )
          .toBe(
            false
          );

        expect(
          checkpoint.complete
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );

    test(
      "missing immutable execution identity fails before checkpoint creation",
      async () => {
        const checkpoint =
          checkpointMock();

        const worker =
          createWorker({
            checkpoint,
          });

        await expect(
          worker.process(
            baseJob({
              executionPlanHash:
                null,

              executionPlan: {
                planId:
                  "plan-1",
              },
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "EXECUTION_JOB_IDENTITY_REQUIRED",
          });

        expect(
          checkpoint
            .ensureCheckpoint
        )
          .not
          .toHaveBeenCalled();

        expect(
          checkpoint.claim
        )
          .not
          .toHaveBeenCalled();
      }
    );
  }
);