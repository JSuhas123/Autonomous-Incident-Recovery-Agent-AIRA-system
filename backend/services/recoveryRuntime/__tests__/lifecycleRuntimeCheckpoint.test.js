"use strict";

const {
  LifecycleWorker,
} =
  require(
    "../../../workers/lifecycleWorker"
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
    organizationId:
      "org-1",

    environmentId:
      "prod",

    incidentId:
      "incident-1",

    verificationId:
      "verification-1",

    lifecycleId:
      "lifecycle-1",

    lifecycleIntent:
      "PROCESS_VERIFICATION_OUTCOME",

    executionAuthorized:
      false,

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

          executionAuthorized:
            false,
        })
      ),

    claim:
      jest.fn(
        async () => ({
          claimed:
            true,

          claimToken:
            "lifecycle-runtime-claim-1",

          executionAuthorized:
            false,
        })
      ),

    complete:
      jest.fn(
        async () => ({
          completed:
            true,

          executionAuthorized:
            false,
        })
      ),

    fail:
      jest.fn(
        async () => ({
          failed:
            true,

          executionAuthorized:
            false,
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
            "lifecycle-idem-1",

          result:
            await input.handler(),

          executionAuthorized:
            false,
        })
      ),

    ...overrides,
  };
}

function createWorker({
  checkpoint =
    checkpointMock(),

  idempotentWorker =
    idempotentWorkerMock(),

  lifecycleResult = {
    processed:
      true,

    type:
      "NO_ACTION",

    recoveryStarted:
      false,

    rollbackStarted:
      false,

    executionStarted:
      false,

    executionAuthorized:
      false,
  },

  lifecycleError =
    null,
} = {}) {
  const worker =
    new LifecycleWorker({
      runtimeCheckpoint:
        checkpoint,

      runtimeCheckpointEnabled:
        true,

      idempotentWorker,

      idempotencyEnabled:
        true,

      workerId:
        "lifecycle-test-worker",

      RecoveryVerification: {
        findOne:
          jest.fn(),
      },

      IncidentLifecycle: {
        findOne:
          jest.fn(),
      },

      queue: {
        publishStarted:
          jest.fn(),

        publishFailed:
          jest.fn(),
      },
    });

  worker.processLifecycle =
    jest.fn(
      async () => {
        if (
          lifecycleError
        ) {
          throw lifecycleError;
        }

        return lifecycleResult;
      }
    );

  return worker;
}

// ============================================================================
// TESTS
// ============================================================================

describe(
  "LifecycleWorker Runtime Checkpoint",
  () => {
    test(
      "ensures LIFECYCLE checkpoint before lifecycle processing",
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
                  .LIFECYCLE,

              workflowIdentity:
                expect.objectContaining({
                  verificationId:
                    "verification-1",

                  lifecycleId:
                    "lifecycle-1",

                  lifecycleIntent:
                    "PROCESS_VERIFICATION_OUTCOME",
                }),

              executionAuthorized:
                false,
            })
          );
      }
    );

    test(
      "checkpoint claim occurs before idempotency",
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
                      "lifecycle-runtime-claim-1",
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
                    "lifecycle-idem-1",

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
      "successful lifecycle completes checkpoint as SAFE",
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
          .toHaveBeenCalledWith(
            expect.objectContaining({
              stage:
                RUNTIME_STAGE
                  .LIFECYCLE,

              workerId:
                "lifecycle-test-worker",

              claimToken:
                "lifecycle-runtime-claim-1",

              resumeSafety:
                RESUME_SAFETY
                  .SAFE,

              executionAuthorized:
                false,
            })
          );

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
      "lifecycle failure is persisted as SAFE to resume",
      async () => {
        const checkpoint =
          checkpointMock();

        const error =
          Object.assign(
            new Error(
              "Notification provider timeout"
            ),
            {
              code:
                "NOTIFICATION_TEMPORARY_FAILURE",

              retryable:
                true,
            }
          );

        const worker =
          createWorker({
            checkpoint,

            lifecycleError:
              error,
          });

        await expect(
          worker.process(
            baseJob()
          )
        )
          .rejects
          .toMatchObject({
            code:
              "NOTIFICATION_TEMPORARY_FAILURE",
          });

        expect(
          checkpoint.fail
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              stage:
                RUNTIME_STAGE
                  .LIFECYCLE,

              claimToken:
                "lifecycle-runtime-claim-1",

              error:
                expect.objectContaining({
                  retryable:
                    true,
                }),

              resumeSafety:
                RESUME_SAFETY
                  .SAFE,

              executionAuthorized:
                false,
            })
          );
      }
    );

    test(
      "unclaimed lifecycle checkpoint prevents idempotency processing",
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
            .processLifecycle
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.lifecyclePerformed
        )
          .toBe(
            false
          );

        expect(
          result.executionStarted
        )
          .toBe(
            false
          );
      }
    );

    test(
      "duplicate completed lifecycle does not rerun Phase 10 processor",
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
                  "lifecycle-idem-1",

                previousResult: {
                  type:
                    "NO_ACTION",
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
            .processLifecycle
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
          result.lifecyclePerformed
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
      "runtime lifecycle resume never directly starts retry",
      async () => {
        const worker =
          createWorker({
            lifecycleResult: {
              processed:
                true,

              type:
                "RETRY_REQUESTED",

              recoveryStarted:
                false,

              rollbackStarted:
                false,

              executionStarted:
                false,

              executionAuthorized:
                false,
            },
          });

        const result =
          await worker.process(
            baseJob()
          );

        expect(
          result.executionStarted
        )
          .toBe(
            false
          );

        expect(
          result.result
            ?.recoveryStarted
        )
          .toBe(
            false
          );
      }
    );

    test(
      "runtime lifecycle resume never directly starts rollback",
      async () => {
        const worker =
          createWorker({
            lifecycleResult: {
              processed:
                true,

              type:
                "ROLLBACK_REQUESTED",

              recoveryStarted:
                false,

              rollbackStarted:
                false,

              executionStarted:
                false,

              executionAuthorized:
                false,
            },
          });

        const result =
          await worker.process(
            baseJob()
          );

        expect(
          result.executionStarted
        )
          .toBe(
            false
          );

        expect(
          result.result
            ?.rollbackStarted
        )
          .toBe(
            false
          );
      }
    );

    test(
      "checkpoint operation key contains verification and lifecycle intent",
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

        const input =
          checkpoint
            .ensureCheckpoint
            .mock
            .calls[0][0];

        expect(
          input.operationKey
        )
          .toContain(
            "verification-1"
          );

        expect(
          input.operationKey
        )
          .toContain(
            "PROCESS_VERIFICATION_OUTCOME"
          );
      }
    );

    test(
      "missing verification id fails before checkpoint creation",
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
              verificationId:
                null,
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "LIFECYCLE_JOB_VERIFICATION_REQUIRED",
          });

        expect(
          checkpoint
            .ensureCheckpoint
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "runtime checkpoint failure does not mask original lifecycle error",
      async () => {
        const originalError =
          Object.assign(
            new Error(
              "Original lifecycle failure"
            ),
            {
              code:
                "ORIGINAL_LIFECYCLE_FAILURE",
            }
          );

        const checkpointError =
          new Error(
            "Checkpoint persistence failed"
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

            lifecycleError:
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
      "runtime checkpoint layer never receives execution authorization",
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
      "lifecycle runtime result never grants execution authorization",
      async () => {
        const worker =
          createWorker();

        const result =
          await worker.process(
            baseJob()
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.executionStarted
        )
          .toBe(
            false
          );
      }
    );
  }
);