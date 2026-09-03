"use strict";

const {
  REALITY_RECOVERY_VERIFICATION_RESET_VERSION,

  RealityRecoveryVerificationResetBridge,
} = require(
  "../../services/reality/realityRecoveryVerificationResetBridge"
);


function makeInput(
  overrides = {}
) {
  return {
    organizationId:
      "org_test",

    environmentId:
      "env_test",

    tenantId:
      "org_test",

    labEnvironmentId:
      "lab_001",

    environmentReplayRunId:
      "envreplay_001",

    experimentRunId:
      "exprun_001",

    incidentId:
      "incident_001",

    diagnosis: {
      selectedFailureMode:
        "kubernetes.pod.crash",
    },

    recoveryDecision: {
      decision:
        "RECOMMEND_PLAYBOOK",
    },

    recoveryExecutor: {
      execute:
        jest
          .fn()
          .mockResolvedValue({
            executed:
              true,

            success:
              true,

            executionAuthorized:
              false,
          }),
    },

    afterObservation: {
      observed:
        true,

      independent:
        true,

      healthy:
        true,

      ready:
        true,

      behaviorRecovered:
        true,

      dependenciesReachable:
        true,

      latencyAcceptable:
        true,
    },

    stability: {
      observed:
        true,

      stable:
        true,

      windowMs:
        1000,
    },

    recurrence: {
      observed:
        true,

      detected:
        false,

      windowMs:
        1000,
    },

    rollback: {
      available:
        false,

      safe:
        false,
    },

    resetter: {
      reset:
        jest.fn(),
    },

    baselineProvider: {
      capture:
        jest.fn(),
    },

    executionAuthorized:
      false,

    production:
      false,

    ...overrides,
  };
}


describe(
  "AIRA Phase 23R.10F — recovery verification reset bridge",
  () => {
    test(
      "exports the 23R.10F version",
      () => {
        expect(
          REALITY_RECOVERY_VERIFICATION_RESET_VERSION
        ).toBe(
          "23R.10F.0"
        );
      }
    );


    test(
      "executes recovery, independently verifies it, resets the lab, and completes",
      async () => {
        const bindingService = {
          transitionStage:
            jest
              .fn()
              .mockResolvedValueOnce({
                stage:
                  "RECOVERING",
              })
              .mockResolvedValueOnce({
                stage:
                  "VERIFYING",
              })
              .mockResolvedValueOnce({
                stage:
                  "RESETTING",
              })
              .mockResolvedValueOnce({
                stage:
                  "COMPLETED",
              }),
        };

        const liveOrchestrator = {
          reset:
            jest
              .fn()
              .mockResolvedValue({
                resetSucceeded:
                  true,

                baselineRestored:
                  true,

                executionAuthorized:
                  false,
              }),
        };

        const verificationEvaluator = {
          evaluate:
            jest
              .fn()
              .mockReturnValue({
                outcome:
                  "VERIFIED_RECOVERY",

                recovered:
                  true,

                executionAuthorized:
                  false,

                productionCertified:
                  false,
              }),
        };

        const bridge =
          new RealityRecoveryVerificationResetBridge({
            bindingService,

            liveOrchestrator,

            verificationEvaluator,
          });

        const input =
          makeInput();

        const result =
          await bridge.run(
            input
          );

        expect(
          input
            .recoveryExecutor
            .execute
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            incidentId:
              "incident_001",

            experimentRunId:
              "exprun_001",

            executionAuthorized:
              false,

            production:
              false,
          })
        );

        expect(
          verificationEvaluator
            .evaluate
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            executionAuthorized:
              false,

            after:
              expect.objectContaining({
                healthy:
                  true,

                ready:
                  true,
              }),
          })
        );

        expect(
          liveOrchestrator.reset
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            experimentRunId:
              "exprun_001",

            resetter:
              input.resetter,

            baselineProvider:
              input.baselineProvider,
          })
        );

        expect(
          bindingService
            .transitionStage
            .mock
            .calls
            .map(
              (
                call
              ) =>
                call[
                  0
                ].stage
            )
        ).toEqual([
          "RECOVERING",
          "VERIFYING",
          "RESETTING",
          "COMPLETED",
        ]);

        expect(
          result
        ).toMatchObject({
          stage:
            "COMPLETED",

          baselineRestored:
            true,

          productionCertified:
            false,

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "rejects ground truth before recovery execution",
      async () => {
        const input =
          makeInput({
            groundTruth: {
              expectedRecovery:
                "restart",
            },
          });

        const bridge =
          new RealityRecoveryVerificationResetBridge({
            bindingService:
              {},

            liveOrchestrator:
              {},

            verificationEvaluator:
              {},
          });

        await expect(
          bridge.run(
            input
          )
        ).rejects.toMatchObject({
          code:
            "REALITY_RECOVERY_VERIFICATION_GROUND_TRUTH_FORBIDDEN",
        });

        expect(
          input
            .recoveryExecutor
            .execute
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "fails closed when canonical executor does not observe execution",
      async () => {
        const bindingService = {
          transitionStage:
            jest
              .fn()
              .mockResolvedValue({
                stage:
                  "FAILED",
              }),
        };

        const input =
          makeInput({
            recoveryExecutor: {
              execute:
                jest
                  .fn()
                  .mockResolvedValue({
                    executed:
                      false,

                    success:
                      false,

                    executionAuthorized:
                      false,
                  }),
            },
          });

        const bridge =
          new RealityRecoveryVerificationResetBridge({
            bindingService,

            liveOrchestrator:
              {},

            verificationEvaluator:
              {},
          });

        await expect(
          bridge.run(
            input
          )
        ).rejects.toMatchObject({
          code:
            "REALITY_RECOVERY_EXECUTION_NOT_OBSERVED",
        });

        expect(
          bindingService
            .transitionStage
        ).toHaveBeenLastCalledWith(
          expect.objectContaining({
            stage:
              "FAILED",

            failureCode:
              "REALITY_RECOVERY_EXECUTION_NOT_OBSERVED",
          })
        );
      }
    );


    test(
      "fails closed when independent verification does not prove recovery",
      async () => {
        const bindingService = {
          transitionStage:
            jest
              .fn()
              .mockResolvedValue({
                stage:
                  "FAILED",
              }),
        };

        const bridge =
          new RealityRecoveryVerificationResetBridge({
            bindingService,

            liveOrchestrator:
              {},

            verificationEvaluator: {
              evaluate:
                jest
                  .fn()
                  .mockReturnValue({
                    outcome:
                      "FAILED_RECOVERY",

                    executionAuthorized:
                      false,

                    productionCertified:
                      false,
                  }),
            },
          });

        await expect(
          bridge.run(
            makeInput()
          )
        ).rejects.toMatchObject({
          code:
            "REALITY_RECOVERY_VERIFICATION_FAILED",
        });

        expect(
          bindingService
            .transitionStage
        ).toHaveBeenLastCalledWith(
          expect.objectContaining({
            stage:
              "FAILED",
          })
        );
      }
    );


    test(
      "fails closed when reset does not restore baseline",
      async () => {
        const bindingService = {
          transitionStage:
            jest
              .fn()
              .mockResolvedValue({
                stage:
                  "RESETTING",
              }),
        };

        const bridge =
          new RealityRecoveryVerificationResetBridge({
            bindingService,

            liveOrchestrator: {
              reset:
                jest
                  .fn()
                  .mockResolvedValue({
                    resetSucceeded:
                      true,

                    baselineRestored:
                      false,

                    executionAuthorized:
                      false,
                  }),
            },

            verificationEvaluator: {
              evaluate:
                jest
                  .fn()
                  .mockReturnValue({
                    outcome:
                      "VERIFIED_RECOVERY",

                    executionAuthorized:
                      false,

                    productionCertified:
                      false,
                  }),
            },
          });

        await expect(
          bridge.run(
            makeInput()
          )
        ).rejects.toMatchObject({
          code:
            "REALITY_RECOVERY_RESET_INCOMPLETE",
        });
      }
    );


    test(
      "rejects authority-bearing recovery results",
      async () => {
        const bindingService = {
          transitionStage:
            jest
              .fn()
              .mockResolvedValue({
                stage:
                  "RECOVERING",
              }),
        };

        const input =
          makeInput({
            recoveryExecutor: {
              execute:
                jest
                  .fn()
                  .mockResolvedValue({
                    executed:
                      true,

                    success:
                      true,

                    executionAuthorized:
                      true,
                  }),
            },
          });

        const bridge =
          new RealityRecoveryVerificationResetBridge({
            bindingService,

            liveOrchestrator:
              {},

            verificationEvaluator:
              {},
          });

        await expect(
          bridge.run(
            input
          )
        ).rejects.toMatchObject({
          code:
            "REALITY_RECOVERY_VERIFICATION_AUTHORITY_VIOLATION",
        });
      }
    );
  }
);