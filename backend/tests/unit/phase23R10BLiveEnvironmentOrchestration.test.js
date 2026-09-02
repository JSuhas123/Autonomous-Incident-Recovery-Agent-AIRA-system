"use strict";

const {
  REALITY_ENVIRONMENT_REPLAY_LIVE_VERSION,

  RealityEnvironmentReplayLiveOrchestrator,

  buildCorrelationId,
} =
  require(
    "../../services/reality/realityEnvironmentReplayLiveOrchestrator"
  );


describe(
  "AIRA Phase 23R.10B — Live Environment Replay Orchestration Bridge",
  () => {
    function buildPhase21Result(
      overrides = {}
    ) {
      return {
        orchestratorVersion:
          "21.11-v1",

        experimentRunId:
          "exp_run_001",

        experimentKey:
          "kubernetes.pod.crash",

        experimentVersion:
          "1",

        correlationId:
          "phase23r:replay_001:case_001",

        status:
          "WAITING_FOR_DIAGNOSIS",

        baseline: {
          healthy:
            true,

          executionAuthorized:
            false,
        },

        injection: {
          referenceId:
            "inj_001",

          injected:
            true,

          executionAuthorized:
            false,
        },

        correlation: {
          correlationId:
            "corr_001",

          executionAuthorized:
            false,
        },

        evaluator: {
          groundTruthAvailable:
            true,

          groundTruthPassedToAira:
            false,

          evaluationPerformed:
            false,
        },

        productionCertified:
          false,

        executionAuthorized:
          false,

        ...overrides,
      };
    }


    function buildInput(
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
          "lab_kind_001",

        replayRunId:
          "replay_001",

        realityCaseId:
          "case_001",

        realityCaseVersion:
          "1",

        evidenceGrade:
          "E1",

        replaySeed:
          23,

        experimentKey:
          "kubernetes.pod.crash",

        experimentVersion:
          "1",

        failureKey:
          "kubernetes.pod.crash",

        target: {
          namespace:
            "aira-reliability-lab",

          resourceType:
            "kubernetes.pod",

          resourceName:
            "aira-reliability-target",

          production:
            false,

          executionAuthorized:
            false,
        },

        injectionParameters: {},

        metadata: {
          test:
            true,
        },

        executionAuthorized:
          false,

        ...overrides,
      };
    }


    test(
      "exports the 23R.10B live bridge version",
      () => {
        expect(
          REALITY_ENVIRONMENT_REPLAY_LIVE_VERSION
        )
          .toBe(
            "23R.10B.0"
          );
      }
    );


    test(
      "builds deterministic Phase-23R correlation identity",
      () => {
        expect(
          buildCorrelationId({
            replayRunId:
              "replay_001",

            realityCaseId:
              "case_001",
          })
        )
          .toBe(
            "phase23r:replay_001:case_001"
          );
      }
    );


    test(
      "delegates canonical experiment creation and injection to Phase 21",
      async () => {
        const runToCorrelation =
          jest.fn(
            async () =>
              buildPhase21Result()
          );


        const bridge =
          new RealityEnvironmentReplayLiveOrchestrator({
            phase21Orchestrator: {
              runToCorrelation,

              resetAfterPartialRun:
                jest.fn(),
            },
          });


        const result =
          await bridge.start(
            buildInput()
          );


        expect(
          runToCorrelation
        )
          .toHaveBeenCalledTimes(
            1
          );


        const invocation =
          runToCorrelation
            .mock
            .calls[
              0
            ][
              0
            ];


        expect(
          invocation.organizationId
        )
          .toBe(
            "org_test"
          );


        expect(
          invocation.environmentId
        )
          .toBe(
            "env_test"
          );


        expect(
          invocation.labEnvironmentId
        )
          .toBe(
            "lab_kind_001"
          );


        expect(
          invocation.experimentKey
        )
          .toBe(
            "kubernetes.pod.crash"
          );


        expect(
          invocation.experimentVersion
        )
          .toBe(
            "1"
          );


        expect(
          invocation.correlationId
        )
          .toBe(
            "phase23r:replay_001:case_001"
          );


        expect(
          invocation.metadata.replayRunId
        )
          .toBe(
            "replay_001"
          );


        expect(
          invocation.metadata.realityCaseId
        )
          .toBe(
            "case_001"
          );


        expect(
          invocation.metadata.phase21AuthorityPreserved
        )
          .toBe(
            true
          );


        expect(
          invocation.executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          result.experimentRunId
        )
          .toBe(
            "exp_run_001"
          );


        expect(
          result.phase21Status
        )
          .toBe(
            "WAITING_FOR_DIAGNOSIS"
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          result.productionCertified
        )
          .toBe(
            false
          );
      }
    );


    test(
      "forces the Phase-21 target to remain non-production and non-authorizing",
      async () => {
        const runToCorrelation =
          jest.fn(
            async () =>
              buildPhase21Result()
          );


        const bridge =
          new RealityEnvironmentReplayLiveOrchestrator({
            phase21Orchestrator: {
              runToCorrelation,

              resetAfterPartialRun:
                jest.fn(),
            },
          });


        await bridge.start(
          buildInput()
        );


        const invocation =
          runToCorrelation
            .mock
            .calls[
              0
            ][
              0
            ];


        expect(
          invocation.target.production
        )
          .toBe(
            false
          );


        expect(
          invocation.target.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "rejects production replay before Phase 21 is invoked",
      async () => {
        const runToCorrelation =
          jest.fn();


        const bridge =
          new RealityEnvironmentReplayLiveOrchestrator({
            phase21Orchestrator: {
              runToCorrelation,

              resetAfterPartialRun:
                jest.fn(),
            },
          });


        await expect(
          bridge.start(
            buildInput({
              production:
                true,
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "REALITY_ENVIRONMENT_REPLAY_PRODUCTION_FORBIDDEN",

            executionAuthorized:
              false,
          });


        expect(
          runToCorrelation
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "rejects a production target before Phase 21 is invoked",
      async () => {
        const runToCorrelation =
          jest.fn();


        const bridge =
          new RealityEnvironmentReplayLiveOrchestrator({
            phase21Orchestrator: {
              runToCorrelation,

              resetAfterPartialRun:
                jest.fn(),
            },
          });


        await expect(
          bridge.start(
            buildInput({
              target: {
                namespace:
                  "production",

                resourceType:
                  "kubernetes.pod",

                production:
                  true,
              },
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "REALITY_ENVIRONMENT_REPLAY_TARGET_PRODUCTION_FORBIDDEN",
          });


        expect(
          runToCorrelation
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "rejects replay-derived execution authority",
      async () => {
        const bridge =
          new RealityEnvironmentReplayLiveOrchestrator({
            phase21Orchestrator: {
              runToCorrelation:
                jest.fn(),

              resetAfterPartialRun:
                jest.fn(),
            },
          });


        await expect(
          bridge.start(
            buildInput({
              executionAuthorized:
                true,
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "REALITY_ENVIRONMENT_REPLAY_AUTHORITY_FORBIDDEN",
          });
      }
    );


    test(
      "rejects ground truth in agent context",
      async () => {
        const runToCorrelation =
          jest.fn();


        const bridge =
          new RealityEnvironmentReplayLiveOrchestrator({
            phase21Orchestrator: {
              runToCorrelation,

              resetAfterPartialRun:
                jest.fn(),
            },
          });


        await expect(
          bridge.start(
            buildInput({
              agentContext: {
                incident: {
                  expectedDiagnosis:
                    "pod crash",
                },
              },
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "REALITY_ENVIRONMENT_REPLAY_GROUND_TRUTH_LEAKAGE",
          });


        expect(
          runToCorrelation
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "rejects sealed evaluator data at the bridge boundary",
      async () => {
        const bridge =
          new RealityEnvironmentReplayLiveOrchestrator({
            phase21Orchestrator: {
              runToCorrelation:
                jest.fn(),

              resetAfterPartialRun:
                jest.fn(),
            },
          });


        await expect(
          bridge.start(
            buildInput({
              sealedEvaluation: {
                knownFault:
                  "pod terminated",
              },
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "REALITY_ENVIRONMENT_REPLAY_GROUND_TRUTH_FORBIDDEN",
          });
      }
    );


    test(
      "fails closed if Phase 21 reports ground truth reached AIRA",
      async () => {
        const bridge =
          new RealityEnvironmentReplayLiveOrchestrator({
            phase21Orchestrator: {
              runToCorrelation:
                jest.fn(
                  async () =>
                    buildPhase21Result({
                      evaluator: {
                        groundTruthAvailable:
                          true,

                        groundTruthPassedToAira:
                          true,

                        evaluationPerformed:
                          false,
                      },
                    })
                ),

              resetAfterPartialRun:
                jest.fn(),
            },
          });


        await expect(
          bridge.start(
            buildInput()
          )
        )
          .rejects
          .toMatchObject({
            code:
              "REALITY_ENVIRONMENT_REPLAY_GROUND_TRUTH_LEAKAGE",
          });
      }
    );


    test(
      "fails closed if Phase 21 result grants execution authority",
      async () => {
        const bridge =
          new RealityEnvironmentReplayLiveOrchestrator({
            phase21Orchestrator: {
              runToCorrelation:
                jest.fn(
                  async () =>
                    buildPhase21Result({
                      executionAuthorized:
                        true,
                    })
                ),

              resetAfterPartialRun:
                jest.fn(),
            },
          });


        await expect(
          bridge.start(
            buildInput()
          )
        )
          .rejects
          .toMatchObject({
            code:
              "REALITY_ENVIRONMENT_REPLAY_PHASE21_AUTHORITY_FORBIDDEN",
          });
      }
    );


    test(
      "fails closed if lab evidence is represented as production proof",
      async () => {
        const bridge =
          new RealityEnvironmentReplayLiveOrchestrator({
            phase21Orchestrator: {
              runToCorrelation:
                jest.fn(
                  async () =>
                    buildPhase21Result({
                      productionCertified:
                        true,
                    })
                ),

              resetAfterPartialRun:
                jest.fn(),
            },
          });


        await expect(
          bridge.start(
            buildInput()
          )
        )
          .rejects
          .toMatchObject({
            code:
              "REALITY_ENVIRONMENT_REPLAY_PHASE21_PRODUCTION_FORBIDDEN",
          });
      }
    );


    test(
      "delegates reset to the canonical Phase-21 partial-run reset path",
      async () => {
        const resetter = {
          reset:
            jest.fn(),
        };


        const resetAfterPartialRun =
          jest.fn(
            async () => ({
              resetSucceeded:
                true,

              baselineRestored:
                true,

              executionAuthorized:
                false,
            })
          );


        const bridge =
          new RealityEnvironmentReplayLiveOrchestrator({
            phase21Orchestrator: {
              runToCorrelation:
                jest.fn(),

              resetAfterPartialRun,
            },
          });


        const result =
          await bridge.reset({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            labEnvironmentId:
              "lab_kind_001",

            replayRunId:
              "replay_001",

            experimentRunId:
              "exp_run_001",

            resetter,

            executionAuthorized:
              false,
          });


        expect(
          resetAfterPartialRun
        )
          .toHaveBeenCalledTimes(
            1
          );


        expect(
          resetAfterPartialRun
            .mock
            .calls[
              0
            ][
              0
            ]
            .experimentRunId
        )
          .toBe(
            "exp_run_001"
          );


        expect(
          result.resetSucceeded
        )
          .toBe(
            true
          );


        expect(
          result.baselineRestored
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
      "requires canonical resetter for cleanup",
      async () => {
        const bridge =
          new RealityEnvironmentReplayLiveOrchestrator({
            phase21Orchestrator: {
              runToCorrelation:
                jest.fn(),

              resetAfterPartialRun:
                jest.fn(),
            },
          });


        await expect(
          bridge.reset({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            labEnvironmentId:
              "lab_kind_001",

            experimentRunId:
              "exp_run_001",
          })
        )
          .rejects
          .toMatchObject({
            code:
              "REALITY_ENVIRONMENT_REPLAY_RESETTER_REQUIRED",
          });
      }
    );
  }
);