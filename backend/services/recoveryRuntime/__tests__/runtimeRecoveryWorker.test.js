"use strict";

const {
  RuntimeRecoveryWorker,
} =
  require(
    "../../../workers/runtimeRecoveryWorker"
  );

const {
  RUNTIME_STAGE,
  RESUME_DECISION,
} =
  require(
    "../recoveryRuntimeContracts"
  );

function plan(
  overrides = {}
) {
  return {
    organizationId:
      "org-1",

    environmentId:
      "prod",

    incidentId:
      "incident-1",

    operationKey:
      "operation-1",

    stage:
      RUNTIME_STAGE
        .VERIFICATION,

    decision:
      RESUME_DECISION
        .RESUME,

    workflowIdentity: {
      executionRequestId:
        "execution-1",

      verificationId:
        "verification-1",
    },

    resumePayload: {
      verificationPlanId:
        "verify-plan-1",

      verificationPlanHash:
        "verify-hash-1",

      verificationPlan: {
        planId:
          "verify-plan-1",

        planHash:
          "verify-hash-1",
      },
    },

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "RuntimeRecoveryWorker",
  () => {
    test(
      "safe verification resume dispatches through protected verification worker",
      async () => {
        const verificationWorker = {
          process:
            jest.fn(
              async () => ({
                processed:
                  true,
              })
            ),
        };

        const worker =
          new RuntimeRecoveryWorker({
            verificationWorker,

            recoveryDecisionWorker: {
              process:
                jest.fn(),
            },

            lifecycleWorker: {
              process:
                jest.fn(),
            },
          });

        const result =
          await worker.process(
            plan()
          );

        expect(
          verificationWorker
            .process
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result.dispatched
        )
          .toBe(
            true
          );
      }
    );

    test(
      "verification resume reconstructs immutable identity",
      async () => {
        const verificationWorker = {
          process:
            jest.fn(
              async () => ({
                processed:
                  true,
              })
            ),
        };

        const worker =
          new RuntimeRecoveryWorker({
            verificationWorker,

            recoveryDecisionWorker: {
              process:
                jest.fn(),
            },

            lifecycleWorker: {
              process:
                jest.fn(),
            },
          });

        await worker.process(
          plan()
        );

        const job =
          verificationWorker
            .process
            .mock
            .calls[0][0];

        expect(
          job
        )
          .toMatchObject({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            incidentId:
              "incident-1",

            executionRequestId:
              "execution-1",

            verificationId:
              "verification-1",

            verificationPlanId:
              "verify-plan-1",

            verificationPlanHash:
              "verify-hash-1",

            executionAuthorized:
              false,
          });
      }
    );

    test(
      "safe lifecycle resume dispatches through lifecycle worker",
      async () => {
        const lifecycleWorker = {
          process:
            jest.fn(
              async () => ({
                processed:
                  true,
              })
            ),
        };

        const worker =
          new RuntimeRecoveryWorker({
            verificationWorker: {
              process:
                jest.fn(),
            },

            recoveryDecisionWorker: {
              process:
                jest.fn(),
            },

            lifecycleWorker,
          });

        const result =
          await worker.process(
            plan({
              stage:
                RUNTIME_STAGE
                  .LIFECYCLE,

              workflowIdentity: {
                verificationId:
                  "verification-1",

                lifecycleId:
                  "lifecycle-1",
              },

              resumePayload: {
                lifecycleIntent:
                  "PROCESS_VERIFICATION_OUTCOME",
              },
            })
          );

        expect(
          lifecycleWorker
            .process
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result.dispatched
        )
          .toBe(
            true
          );
      }
    );

    test(
      "safe recovery decision resume dispatches through recovery worker",
      async () => {
        const recoveryDecisionWorker = {
          process:
            jest.fn(
              async () => ({
                processed:
                  true,
              })
            ),
        };

        const worker =
          new RuntimeRecoveryWorker({
            recoveryDecisionWorker,

            verificationWorker: {
              process:
                jest.fn(),
            },

            lifecycleWorker: {
              process:
                jest.fn(),
            },
          });

        const result =
          await worker.process(
            plan({
              stage:
                RUNTIME_STAGE
                  .RECOVERY_DECISION,

              decision:
                RESUME_DECISION
                  .RESUME,

              workflowIdentity: {
                diagnosisId:
                  "diagnosis-1",

                diagnosisRevision:
                  2,
              },

              resumePayload: {
                diagnosis: {
                  diagnosisId:
                    "diagnosis-1",
                },
              },
            })
          );

        expect(
          recoveryDecisionWorker
            .process
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result.dispatched
        )
          .toBe(
            true
          );
      }
    );

    test(
      "execution stage is never automatically dispatched",
      async () => {
        const recoveryDecisionWorker = {
          process:
            jest.fn(),
        };

        const verificationWorker = {
          process:
            jest.fn(),
        };

        const lifecycleWorker = {
          process:
            jest.fn(),
        };

        const worker =
          new RuntimeRecoveryWorker({
            recoveryDecisionWorker,
            verificationWorker,
            lifecycleWorker,
          });

        const result =
          await worker.process(
            plan({
              stage:
                RUNTIME_STAGE
                  .EXECUTION,

              decision:
                RESUME_DECISION
                  .START,

              workflowIdentity: {
                executionRequestId:
                  "execution-1",
              },
            })
          );

        expect(
          result.dispatched
        )
          .toBe(
            false
          );

        expect(
          result.manualIntervention
        )
          .toBe(
            true
          );

        expect(
          result.reason
        )
          .toBe(
            "EXECUTION_RUNTIME_REPLAY_FORBIDDEN"
          );

        expect(
          recoveryDecisionWorker
            .process
        )
          .not
          .toHaveBeenCalled();

        expect(
          verificationWorker
            .process
        )
          .not
          .toHaveBeenCalled();

        expect(
          lifecycleWorker
            .process
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "manual intervention performs no dispatch",
      async () => {
        const verificationWorker = {
          process:
            jest.fn(),
        };

        const worker =
          new RuntimeRecoveryWorker({
            verificationWorker,

            recoveryDecisionWorker: {
              process:
                jest.fn(),
            },

            lifecycleWorker: {
              process:
                jest.fn(),
            },
          });

        const result =
          await worker.process(
            plan({
              decision:
                RESUME_DECISION
                  .MANUAL_INTERVENTION,
            })
          );

        expect(
          result.dispatched
        )
          .toBe(
            false
          );

        expect(
          result.manualIntervention
        )
          .toBe(
            true
          );

        expect(
          verificationWorker
            .process
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "blocked plan performs no dispatch",
      async () => {
        const verificationWorker = {
          process:
            jest.fn(),
        };

        const worker =
          new RuntimeRecoveryWorker({
            verificationWorker,

            recoveryDecisionWorker: {
              process:
                jest.fn(),
            },

            lifecycleWorker: {
              process:
                jest.fn(),
            },
          });

        const result =
          await worker.process(
            plan({
              decision:
                RESUME_DECISION
                  .BLOCK,
            })
          );

        expect(
          result.blocked
        )
          .toBe(
            true
          );

        expect(
          result.dispatched
        )
          .toBe(
            false
          );

        expect(
          verificationWorker
            .process
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "waiting plan performs no dispatch",
      async () => {
        const verificationWorker = {
          process:
            jest.fn(),
        };

        const worker =
          new RuntimeRecoveryWorker({
            verificationWorker,

            recoveryDecisionWorker: {
              process:
                jest.fn(),
            },

            lifecycleWorker: {
              process:
                jest.fn(),
            },
          });

        const result =
          await worker.process(
            plan({
              decision:
                RESUME_DECISION
                  .WAIT,
            })
          );

        expect(
          result.waiting
        )
          .toBe(
            true
          );

        expect(
          result.dispatched
        )
          .toBe(
            false
          );
      }
    );

    test(
      "completed plan is skipped without dispatch",
      async () => {
        const verificationWorker = {
          process:
            jest.fn(),
        };

        const worker =
          new RuntimeRecoveryWorker({
            verificationWorker,

            recoveryDecisionWorker: {
              process:
                jest.fn(),
            },

            lifecycleWorker: {
              process:
                jest.fn(),
            },
          });

        const result =
          await worker.process(
            plan({
              decision:
                RESUME_DECISION
                  .SKIP_COMPLETED,

              previousResult: {
                success:
                  true,
              },
            })
          );

        expect(
          result.skipped
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

        expect(
          verificationWorker
            .process
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "retry safe verification may dispatch",
      async () => {
        const verificationWorker = {
          process:
            jest.fn(
              async () => ({
                processed:
                  true,
              })
            ),
        };

        const worker =
          new RuntimeRecoveryWorker({
            verificationWorker,

            recoveryDecisionWorker: {
              process:
                jest.fn(),
            },

            lifecycleWorker: {
              process:
                jest.fn(),
            },
          });

        const result =
          await worker.process(
            plan({
              decision:
                RESUME_DECISION
                  .RETRY_SAFE,
            })
          );

        expect(
          result.dispatched
        )
          .toBe(
            true
          );

        expect(
          verificationWorker
            .process
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );

    test(
      "worker rejects execution authorization",
      async () => {
        const worker =
          new RuntimeRecoveryWorker();

        await expect(
          worker.process(
            plan({
              executionAuthorized:
                true,
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "RUNTIME_RECOVERY_UNSAFE_AUTHORIZATION",
          });
      }
    );

    test(
      "worker rejects pre-started execution",
      async () => {
        const worker =
          new RuntimeRecoveryWorker();

        await expect(
          worker.process(
            plan({
              executionStarted:
                true,
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "RUNTIME_RECOVERY_WORKER_UNSAFE_EXECUTION",
          });
      }
    );

    test(
      "worker result never grants execution authorization",
      async () => {
        const verificationWorker = {
          process:
            jest.fn(
              async () => ({
                processed:
                  true,
              })
            ),
        };

        const worker =
          new RuntimeRecoveryWorker({
            verificationWorker,

            recoveryDecisionWorker: {
              process:
                jest.fn(),
            },

            lifecycleWorker: {
              process:
                jest.fn(),
            },
          });

        const result =
          await worker.process(
            plan()
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