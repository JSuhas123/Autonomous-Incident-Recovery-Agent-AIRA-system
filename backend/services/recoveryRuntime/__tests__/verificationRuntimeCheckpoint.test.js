"use strict";

const {
  VerificationWorker,
} =
  require(
    "../../../workers/verificationWorker"
  );

const {
  RUNTIME_STAGE,
  RESUME_SAFETY,
} =
  require(
    "../recoveryRuntimeContracts"
  );

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

    verificationId:
      "verification-1",

    verificationPlanId:
      "verification-plan-1",

    verificationPlanHash:
      "verification-hash-1",

    verificationPlan: {
      planId:
        "verification-plan-1",

      planHash:
        "verification-hash-1",
    },

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
            "verification-runtime-claim-1",

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
            "verification-idem-1",

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

  verificationResult = {
    processed:
      true,

    verificationStarted:
      true,

    verificationId:
      "verification-1",

    executionAuthorized:
      false,
  },

  verificationError =
    null,
} = {}) {
  const worker =
    new VerificationWorker({
      runtimeCheckpoint:
        checkpoint,

      runtimeCheckpointEnabled:
        true,

      idempotentWorker,

      idempotencyEnabled:
        true,

      workerId:
        "verification-test-worker",

      ExecutionRequest: {
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

  worker.processVerification =
    jest.fn(
      async () => {
        if (
          verificationError
        ) {
          throw verificationError;
        }

        return verificationResult;
      }
    );

  return worker;
}

describe(
  "VerificationWorker Runtime Checkpoint",
  () => {
    test(
      "ensures VERIFICATION checkpoint before verification processing",
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
                  .VERIFICATION,

              workflowIdentity:
                expect.objectContaining({
                  executionRequestId:
                    "execution-request-1",

                  verificationId:
                    "verification-1",

                  verificationPlanId:
                    "verification-plan-1",

                  verificationPlanHash:
                    "verification-hash-1",
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
                      "verification-runtime-claim-1",
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
                    "verification-idem-1",

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
      "successful verification completes checkpoint as SAFE",
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
                  .VERIFICATION,

              workerId:
                "verification-test-worker",

              claimToken:
                "verification-runtime-claim-1",

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
      "verification failure is persisted as SAFE to reconstruct",
      async () => {
        const checkpoint =
          checkpointMock();

        const error =
          Object.assign(
            new Error(
              "Metrics provider timeout"
            ),
            {
              code:
                "METRICS_PROVIDER_TEMPORARY_FAILURE",

              retryable:
                true,
            }
          );

        const worker =
          createWorker({
            checkpoint,

            verificationError:
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
              "METRICS_PROVIDER_TEMPORARY_FAILURE",
          });

        expect(
          checkpoint.fail
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              stage:
                RUNTIME_STAGE
                  .VERIFICATION,

              claimToken:
                "verification-runtime-claim-1",

              error:
                expect.objectContaining({
                  code:
                    "METRICS_PROVIDER_TEMPORARY_FAILURE",

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

        expect(
          checkpoint.complete
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "non-retryable verification failure still remains observationally safe",
      async () => {
        const checkpoint =
          checkpointMock();

        const error =
          Object.assign(
            new Error(
              "Verification evidence invalid"
            ),
            {
              code:
                "VERIFICATION_EVIDENCE_INVALID",
            }
          );

        const worker =
          createWorker({
            checkpoint,

            verificationError:
              error,
          });

        await expect(
          worker.process(
            baseJob()
          )
        )
          .rejects
          .toThrow(
            "Verification evidence invalid"
          );

        expect(
          checkpoint.fail
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              resumeSafety:
                RESUME_SAFETY
                  .SAFE,

              error:
                expect.objectContaining({
                  retryable:
                    false,
                }),
            })
          );
      }
    );

    test(
      "unclaimed verification checkpoint prevents idempotency processing",
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
            .processVerification
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
          result.verificationStarted
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
      "duplicate completed verification does not rerun verification pipeline",
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
                  "verification-idem-1",

                previousResult: {
                  verificationId:
                    "verification-1",
                },

                executionAuthorized:
                  false,
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
            .processVerification
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
          result.verificationPerformed
        )
          .toBe(
            false
          );

        /*
         * The runtime checkpoint owner completed normally because the
         * underlying logical verification had already completed durably.
         */
        expect(
          checkpoint.complete
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );

    test(
      "checkpoint operation key contains immutable verification identity",
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
            "execution-request-1"
          );

        expect(
          input.operationKey
        )
          .toContain(
            "verification-plan-1"
          );

        expect(
          input.operationKey
        )
          .toContain(
            "verification-hash-1"
          );
      }
    );

    test(
      "missing immutable verification identity fails before checkpoint creation",
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
              verificationPlanHash:
                null,

              verificationPlan: {
                planId:
                  "verification-plan-1",
              },
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "VERIFICATION_JOB_IDENTITY_REQUIRED",
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
      "checkpoint persistence failure never masks original verification error",
      async () => {
        const originalError =
          Object.assign(
            new Error(
              "Original verification failure"
            ),
            {
              code:
                "ORIGINAL_VERIFICATION_FAILURE",
            }
          );

        const checkpointError =
          new Error(
            "Checkpoint storage unavailable"
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

            verificationError:
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
      "verification checkpoint result never grants execution authorization",
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
      }
    );
  }
);