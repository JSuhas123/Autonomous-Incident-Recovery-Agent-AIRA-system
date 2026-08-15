"use strict";

const {
  RecoveryDecisionWorker,
} =
  require(
    "../../../workers/recoveryDecisionWorker"
  );

const {
  RUNTIME_STAGE,
  RESUME_SAFETY,
} =
  require(
    "../recoveryRuntimeContracts"
  );

function baseJob() {
  return {
    organizationId:
      "org-1",

    environmentId:
      "prod",

    incidentId:
      "incident-1",

    diagnosisId:
      "diagnosis-1",

    diagnosisRevision:
      2,

    diagnosis: {
      diagnosisId:
        "diagnosis-1",

      revision:
        2,
    },

    executionAuthorized:
      false,
  };
}

function runtimeCheckpoint(
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
            "runtime-claim-1",

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

describe(
  "RecoveryDecisionWorker Runtime Checkpoint",
  () => {
    test(
      "ensures recovery-decision checkpoint before processing",
      async () => {
        const checkpoint =
          runtimeCheckpoint();

        const worker =
          new RecoveryDecisionWorker({
            runtimeCheckpoint:
              checkpoint,

            runtimeCheckpointEnabled:
              true,

            idempotentWorker: {
              run:
                jest.fn(
                  async (
                    input
                  ) => ({
                    executed:
                      true,

                    decision:
                      "ACQUIRED",

                    result:
                      await input.handler(),

                    executionAuthorized:
                      false,
                  })
                ),
            },

            lifecycle: {
              run:
                jest.fn(
                  async () => ({
                    decision:
                      "NO_SAFE_ACTION",
                  })
                ),
            },

            queue: {
              publishCompleted:
                jest.fn(),

              publishFailed:
                jest.fn(),
            },

            workerId:
              "recovery-test",
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
              stage:
                RUNTIME_STAGE
                  .RECOVERY_DECISION,

              workflowIdentity:
                expect.objectContaining({
                  diagnosisId:
                    "diagnosis-1",

                  diagnosisRevision:
                    2,
                }),

              executionAuthorized:
                false,
            })
          );
      }
    );

    test(
      "claims checkpoint before idempotent recovery flow",
      async () => {
        const order =
          [];

        const checkpoint =
          runtimeCheckpoint({
            claim:
              jest.fn(
                async () => {
                  order.push(
                    "checkpoint-claim"
                  );

                  return {
                    claimed:
                      true,

                    claimToken:
                      "runtime-claim-1",
                  };
                }
              ),
          });

        const worker =
          new RecoveryDecisionWorker({
            runtimeCheckpoint:
              checkpoint,

            runtimeCheckpointEnabled:
              true,

            idempotentWorker: {
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

                      decision:
                        "ACQUIRED",

                      result:
                        await input.handler(),
                    };
                  }
                ),
            },

            lifecycle: {
              run:
                jest.fn(
                  async () => ({
                    success:
                      true,
                  })
                ),
            },

            queue: {
              publishCompleted:
                jest.fn(),

              publishFailed:
                jest.fn(),
            },
          });

        await worker.process(
          baseJob()
        );

        expect(
          order
        )
          .toEqual([
            "checkpoint-claim",
            "idempotency",
          ]);
      }
    );

    test(
      "successful recovery completes checkpoint",
      async () => {
        const checkpoint =
          runtimeCheckpoint();

        const worker =
          new RecoveryDecisionWorker({
            runtimeCheckpoint:
              checkpoint,

            runtimeCheckpointEnabled:
              true,

            idempotentWorker: {
              run:
                jest.fn(
                  async (
                    input
                  ) => ({
                    executed:
                      true,

                    decision:
                      "ACQUIRED",

                    result:
                      await input.handler(),
                  })
                ),
            },

            lifecycle: {
              run:
                jest.fn(
                  async () => ({
                    decision:
                      "NO_SAFE_ACTION",
                  })
                ),
            },

            queue: {
              publishCompleted:
                jest.fn(),

              publishFailed:
                jest.fn(),
            },

            workerId:
              "recovery-test",
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
              workerId:
                "recovery-test",

              claimToken:
                "runtime-claim-1",

              resumeSafety:
                RESUME_SAFETY
                  .SAFE,

              executionAuthorized:
                false,
            })
          );

        expect(
          result.checkpointCompleted
        )
          .toBe(
            true
          );
      }
    );

    test(
      "failed recovery marks checkpoint failed",
      async () => {
        const checkpoint =
          runtimeCheckpoint();

        const worker =
          new RecoveryDecisionWorker({
            runtimeCheckpoint:
              checkpoint,

            runtimeCheckpointEnabled:
              true,

            idempotentWorker: {
              run:
                jest.fn(
                  async () => {
                    throw Object.assign(
                      new Error(
                        "temporary failure"
                      ),
                      {
                        code:
                          "ETIMEDOUT",

                        retryable:
                          true,
                      }
                    );
                  }
                ),
            },

            queue: {
              publishCompleted:
                jest.fn(),

              publishFailed:
                jest.fn(),
            },

            workerId:
              "recovery-test",
          });

        await expect(
          worker.process(
            baseJob()
          )
        )
          .rejects
          .toThrow(
            "temporary failure"
          );

        expect(
          checkpoint.fail
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              claimToken:
                "runtime-claim-1",

              error:
                expect.objectContaining({
                  code:
                    "ETIMEDOUT",

                  retryable:
                    true,
                }),

              resumeSafety:
                RESUME_SAFETY
                  .SAFE,
            })
          );
      }
    );

    test(
      "unclaimed checkpoint prevents recovery processing",
      async () => {
        const idempotentWorker = {
          run:
            jest.fn(),
        };

        const checkpoint =
          runtimeCheckpoint({
            claim:
              jest.fn(
                async () => ({
                  claimed:
                    false,

                  checkpoint: {
                    status:
                      "PROCESSING",
                  },

                  reason:
                    "STATUS_PROCESSING",
                })
              ),
          });

        const worker =
          new RecoveryDecisionWorker({
            runtimeCheckpoint:
              checkpoint,

            runtimeCheckpointEnabled:
              true,

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
          result.checkpointClaimed
        )
          .toBe(
            false
          );
      }
    );

    test(
      "checkpoint integration never grants execution authorization",
      async () => {
        const worker =
          new RecoveryDecisionWorker({
            runtimeCheckpoint:
              runtimeCheckpoint(),

            runtimeCheckpointEnabled:
              true,

            idempotentWorker: {
              run:
                jest.fn(
                  async (
                    input
                  ) => ({
                    executed:
                      true,

                    decision:
                      "ACQUIRED",

                    result:
                      await input.handler(),
                  })
                ),
            },

            lifecycle: {
              run:
                jest.fn(
                  async () => ({
                    success:
                      true,
                  })
                ),
            },

            queue: {
              publishCompleted:
                jest.fn(),

              publishFailed:
                jest.fn(),
            },
          });

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