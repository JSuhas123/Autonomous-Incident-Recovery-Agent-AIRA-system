"use strict";

const {
  RealityEnvironmentReplayBindingService,
} = require(
  "../../services/reality/realityEnvironmentReplayBindingService"
);

const {
  REALITY_KUBERNETES_REPLAY_RUNNER_VERSION,
  CANONICAL_REALITY_KUBERNETES_PROFILE,
  RealityKubernetesReplayRunner,
  assertCanonicalTarget,
  buildSafeTarget,
} = require(
  "../../services/reality/realityKubernetesReplayRunner"
);

function makeTarget(
  overrides = {}
) {
  return {
    namespace:
      "aira-reliability-lab",

    resourceType:
      "kubernetes.pod",

    resourceName:
      "aira-reliability-target",

    podName:
      "aira-reliability-target-abc123",

    production:
      false,

    executionAuthorized:
      false,

    labels: {
      "aira.reliability-lab":
        "true",

      "aira.safety-class":
        "LAB_ONLY",
    },

    ...overrides,
  };
}

function makeBinding(
  overrides = {}
) {
  return {
    environmentReplayRunId:
      "envreplay_001",

    replayRunId:
      "replay_001",

    caseId:
      "case_001",

    labEnvironmentId:
      "lab_001",

    experimentRunId:
      null,

    correlationId:
      "phase23r:replay_001:case_001",

    mode:
      "KUBERNETES",

    stage:
      "LAB_RESERVED",

    groundTruthAgentVisible:
      false,

    productionCertified:
      false,

    executionAuthorized:
      false,

    ...overrides,
  };
}

function makeLiveResult(
  overrides = {}
) {
  return {
    experimentRunId:
      "exprun_001",

    experimentKey:
      "kubernetes.pod.crash",

    experimentVersion:
      "1",

    correlationId:
      "phase23r:replay_001:case_001",

    phase21Status:
      "WAITING_FOR_DIAGNOSIS",

    baseline: {
      healthy:
        true,
    },

    injection: {
      failureInjectionId:
        "failure_001",

      executionAuthorized:
        false,
    },

    correlation: {
      correlationId:
        "phase23r:replay_001:case_001",

      executionAuthorized:
        false,
    },

    evaluator: {
      groundTruthAvailable:
        true,

      groundTruthPassedToAira:
        false,
    },

    productionCertified:
      false,

    executionAuthorized:
      false,

    ...overrides,
  };
}

function makeInput(
  overrides = {}
) {
  return {
    organizationId:
      "org_test",

    environmentId:
      "env_test",

    labEnvironmentId:
      "lab_001",

    replayRunId:
      "replay_001",

    realityCaseId:
      "case_001",

    realityCaseVersion:
      1,

    evidenceGrade:
      "E1",

    replaySeed:
      23,

    target:
      makeTarget(),

    ...overrides,
  };
}

describe(
  "AIRA Phase 23R.10D — Live Kubernetes Reality replay runner",
  () => {
    test(
      "exports the 23R.10D runner version and frozen first-live profile",
      () => {
        expect(
          REALITY_KUBERNETES_REPLAY_RUNNER_VERSION
        ).toBe(
          "23R.10D.0"
        );

        expect(
          CANONICAL_REALITY_KUBERNETES_PROFILE
        ).toMatchObject({
          mode:
            "KUBERNETES",

          namespace:
            "aira-reliability-lab",

          experimentKey:
            "kubernetes.pod.crash",

          failureKey:
            "kubernetes.pod.crash",

          targetResourceType:
            "kubernetes.pod",
        });
      }
    );

    test(
      "accepts only a registered LAB_ONLY Kubernetes pod target",
      () => {
        expect(
          assertCanonicalTarget(
            makeTarget()
          )
        ).toBe(
          true
        );

        const safe =
          buildSafeTarget(
            makeTarget({
              executionAuthorized:
                false,
            })
          );

        expect(
          safe
        ).toMatchObject({
          namespace:
            "aira-reliability-lab",

          resourceType:
            "kubernetes.pod",

          production:
            false,

          executionAuthorized:
            false,
        });
      }
    );

    test(
      "persists binding, delegates live execution to Phase 21, binds experiment, then reaches OBSERVING",
      async () => {
        const bindingService = {
          createBinding:
            jest
              .fn()
              .mockResolvedValue(
                makeBinding()
              ),

          bindExperimentRun:
            jest
              .fn()
              .mockResolvedValue(
                makeBinding({
                  experimentRunId:
                    "exprun_001",

                  stage:
                    "EXPERIMENT_BOUND",
                })
              ),

          transitionStage:
            jest
              .fn()
              .mockResolvedValue(
                makeBinding({
                  experimentRunId:
                    "exprun_001",

                  stage:
                    "OBSERVING",
                })
              ),
        };

        const liveOrchestrator = {
          start:
            jest
              .fn()
              .mockResolvedValue(
                makeLiveResult()
              ),
        };

        const runner =
          new RealityKubernetesReplayRunner({
            bindingService,

            liveOrchestrator,
          });

        const result =
          await runner.start(
            makeInput()
          );

        expect(
          bindingService
            .createBinding
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          liveOrchestrator.start
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          liveOrchestrator.start
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            experimentKey:
              "kubernetes.pod.crash",

            experimentVersion:
              "1",

            failureKey:
              "kubernetes.pod.crash",

            production:
              false,

            executionAuthorized:
              false,

            target:
              expect.objectContaining({
                namespace:
                  "aira-reliability-lab",

                resourceType:
                  "kubernetes.pod",

                production:
                  false,

                executionAuthorized:
                  false,
              }),
          })
        );

        expect(
          bindingService
            .bindExperimentRun
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            environmentReplayRunId:
              "envreplay_001",

            experimentRunId:
              "exprun_001",
          })
        );

        expect(
          bindingService
            .transitionStage
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            environmentReplayRunId:
              "envreplay_001",

            stage:
              "OBSERVING",
          })
        );

        expect(
          result
        ).toMatchObject({
          stage:
            "OBSERVING",

          phase21Status:
            "WAITING_FOR_DIAGNOSIS",

          environmentReplayRunId:
            "envreplay_001",

          experimentRunId:
            "exprun_001",

          groundTruthAgentVisible:
            false,

          productionCertified:
            false,

          executionAuthorized:
            false,
        });
      }
    );

    test(
      "10C binding service exposes additive safe stage transition for 10D",
      async () => {
        const repository = {
          transitionStage:
            jest
              .fn()
              .mockResolvedValue(
                makeBinding({
                  stage:
                    "OBSERVING",
                })
              ),
        };

        const service =
          new RealityEnvironmentReplayBindingService({
            repository,
          });

        const result =
          await service
            .transitionStage({
              organizationId:
                "org_test",

              environmentId:
                "env_test",

              environmentReplayRunId:
                "envreplay_001",

              stage:
                "OBSERVING",
            });

        expect(
          repository
            .transitionStage
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            stage:
              "OBSERVING",
          })
        );

        expect(
          result
        ).toMatchObject({
          stage:
            "OBSERVING",

          executionAuthorized:
            false,

          productionCertified:
            false,
        });
      }
    );

    test(
      "rejects any namespace outside the canonical Reliability Lab",
      async () => {
        const runner =
          new RealityKubernetesReplayRunner({
            bindingService:
              {},

            liveOrchestrator:
              {},
          });

        await expect(
          runner.start(
            makeInput({
              target:
                makeTarget({
                  namespace:
                    "production",
                }),
            })
          )
        ).rejects.toMatchObject({
          code:
            "REALITY_KUBERNETES_REPLAY_NAMESPACE_FORBIDDEN",
        });
      }
    );

    test(
      "rejects production or authority-bearing targets before Phase 21",
      async () => {
        const liveOrchestrator = {
          start:
            jest.fn(),
        };

        const runner =
          new RealityKubernetesReplayRunner({
            bindingService:
              {},

            liveOrchestrator,
          });

        await expect(
          runner.start(
            makeInput({
              target:
                makeTarget({
                  executionAuthorized:
                    true,
                }),
            })
          )
        ).rejects.toMatchObject({
          code:
            "REALITY_KUBERNETES_REPLAY_TARGET_AUTHORITY_FORBIDDEN",
        });

        expect(
          liveOrchestrator.start
        ).not.toHaveBeenCalled();
      }
    );

    test(
      "rejects evaluator ground truth before environment mutation",
      async () => {
        const bindingService = {
          createBinding:
            jest.fn(),
        };

        const runner =
          new RealityKubernetesReplayRunner({
            bindingService,

            liveOrchestrator:
              {},
          });

        await expect(
          runner.start(
            makeInput({
              groundTruth: {
                expectedDiagnosis:
                  "KUBERNETES_POD_CRASH",
              },
            })
          )
        ).rejects.toMatchObject({
          code:
            "REALITY_KUBERNETES_REPLAY_GROUND_TRUTH_FORBIDDEN",
        });

        expect(
          bindingService
            .createBinding
        ).not.toHaveBeenCalled();
      }
    );

    test(
      "does not allow callers to substitute a different failure scenario",
      async () => {
        const runner =
          new RealityKubernetesReplayRunner({
            bindingService:
              {},

            liveOrchestrator:
              {},
          });

        await expect(
          runner.start(
            makeInput({
              failureKey:
                "kubernetes.bad.deployment",
            })
          )
        ).rejects.toMatchObject({
          code:
            "REALITY_KUBERNETES_REPLAY_FAILURE_FORBIDDEN",
        });
      }
    );

    test(
      "fails closed if Phase 21 does not stop at WAITING_FOR_DIAGNOSIS",
      async () => {
        const bindingService = {
          createBinding:
            jest
              .fn()
              .mockResolvedValue(
                makeBinding()
              ),

          transitionStage:
            jest
              .fn()
              .mockResolvedValue(
                makeBinding({
                  stage:
                    "FAILED",
                })
              ),
        };

        const liveOrchestrator = {
          start:
            jest
              .fn()
              .mockResolvedValue(
                makeLiveResult({
                  phase21Status:
                    "COMPLETE",
                })
              ),
        };

        const runner =
          new RealityKubernetesReplayRunner({
            bindingService,

            liveOrchestrator,
          });

        await expect(
          runner.start(
            makeInput()
          )
        ).rejects.toMatchObject({
          code:
            "REALITY_KUBERNETES_REPLAY_PHASE21_STATUS_INVALID",
        });

        expect(
          bindingService
            .transitionStage
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            stage:
              "FAILED",

            failureCode:
              "REALITY_KUBERNETES_REPLAY_PHASE21_STATUS_INVALID",
          })
        );
      }
    );

    test(
      "fails closed if Phase 21 reports evaluator leakage or authority",
      async () => {
        const bindingService = {
          createBinding:
            jest
              .fn()
              .mockResolvedValue(
                makeBinding()
              ),

          transitionStage:
            jest
              .fn()
              .mockResolvedValue(
                makeBinding({
                  stage:
                    "FAILED",
                })
              ),
        };

        const runner =
          new RealityKubernetesReplayRunner({
            bindingService,

            liveOrchestrator: {
              start:
                jest
                  .fn()
                  .mockResolvedValue(
                    makeLiveResult({
                      evaluator: {
                        groundTruthAvailable:
                          true,

                        groundTruthPassedToAira:
                          true,
                      },
                    })
                  ),
            },
          });

        await expect(
          runner.start(
            makeInput()
          )
        ).rejects.toMatchObject({
          code:
            "REALITY_KUBERNETES_REPLAY_LIVE_RESULT_UNSAFE",
        });
      }
    );
  }
);