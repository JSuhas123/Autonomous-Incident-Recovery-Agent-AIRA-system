"use strict";


const {
  RealityEnvironmentReplayService,

  resolveReplayMode,

  sanitizeFailureInjectionResult,
} =
  require(
    "../../services/reality/realityEnvironmentReplayService"
  );


const {
  LAB_ENVIRONMENT_KIND,

  LAB_ENVIRONMENT_STATUS,

  LAB_SAFETY_CLASS,

  EXPERIMENT_RUN_STATUS,
} =
  require(
    "../../constants/reliabilityLab"
  );


const {
  ENVIRONMENT_REPLAY_MODE,

  ENVIRONMENT_REPLAY_STAGE,
} =
  require(
    "../../constants/realityEnvironmentReplay"
  );


function makeReplayRun() {
  return {
    runId:
      "replay_23r5",

    caseId:
      "case_k8s_pod_crash",

    caseRevision:
      1,

    caseContentHash:
      "a".repeat(
        64
      ),

    status:
      "READY",

    groundTruthAgentVisible:
      false,

    executionAuthorized:
      false,
  };
}


function makeLabEnvironment(
  overrides =
    {}
) {
  return {
    id:
      "lab-db-id",

    publicId:
      "lab_kind_1",

    kind:
      LAB_ENVIRONMENT_KIND
        .KIND,

    status:
      LAB_ENVIRONMENT_STATUS
        .AVAILABLE,

    safetyClass:
      LAB_SAFETY_CLASS
        .LAB_ONLY,

    production:
      false,

    executionAuthorized:
      false,

    ...overrides,
  };
}


function makeExperimentRun(
  overrides =
    {}
) {
  return {
    publicId:
      "exprun_1",

    labEnvironmentId:
      "lab-db-id",

    status:
      EXPERIMENT_RUN_STATUS
        .INJECTING,

    executionAuthorized:
      false,

    ...overrides,
  };
}


function makeTarget(
  overrides =
    {}
) {
  return {
    resourcePublicId:
      "resource_pod_1",

    resourceType:
      "kubernetes.pod",

    namespace:
      "aira-reliability-lab",

    podName:
      "aira-fixture-abc123",

    production:
      false,

    executionAuthorized:
      false,

    ...overrides,
  };
}


describe(
  "Phase 23R.5 Environment Replay Engine",

  () => {
    test(
      "maps Docker and Kubernetes-family Reliability Labs without creating a new execution stack",

      () => {
        expect(
          resolveReplayMode(
            LAB_ENVIRONMENT_KIND
              .DOCKER
          )
        ).toBe(
          ENVIRONMENT_REPLAY_MODE
            .DOCKER
        );


        expect(
          resolveReplayMode(
            LAB_ENVIRONMENT_KIND
              .KIND
          )
        ).toBe(
          ENVIRONMENT_REPLAY_MODE
            .KUBERNETES
        );


        expect(
          resolveReplayMode(
            LAB_ENVIRONMENT_KIND
              .KUBERNETES
          )
        ).toBe(
          ENVIRONMENT_REPLAY_MODE
            .KUBERNETES
        );
      }
    );


    test(
      "prepare binds a 23R replay run to a Phase 21 LAB_ONLY environment without granting authority",

      async () => {
        const replayService = {
          getRun:
            jest
              .fn()
              .mockResolvedValue(
                makeReplayRun()
              ),
        };


        const lab =
          makeLabEnvironment();


        const lifecycleService = {
          requireEnvironment:
            jest
              .fn()
              .mockResolvedValue(
                lab
              ),

          beginExperiment:
            jest.fn(),
        };


        const failureInjectionEngine = {
          inject:
            jest.fn(),
        };


        const service =
          new RealityEnvironmentReplayService({
            replayService,

            lifecycleService,

            failureInjectionEngine,

            now:
              () =>
                new Date(
                  "2026-09-03T00:00:00.000Z"
                ),
          });


        const result =
          await service.prepare({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            replayRunId:
              "replay_23r5",

            labEnvironmentId:
              "lab_kind_1",

            experimentRun:
              makeExperimentRun(),

            target:
              makeTarget(),
          });


        expect(
          result.stage
        ).toBe(
          ENVIRONMENT_REPLAY_STAGE
            .VALIDATING
        );


        expect(
          result.mode
        ).toBe(
          ENVIRONMENT_REPLAY_MODE
            .KUBERNETES
        );


        expect(
          result.safetyClass
        ).toBe(
          "LAB_ONLY"
        );


        expect(
          result.production
        ).toBe(
          false
        );


        expect(
          result
            .groundTruthAgentVisible
        ).toBe(
          false
        );


        expect(
          result
            .evaluatorGroundTruthIncluded
        ).toBe(
          false
        );


        expect(
          result
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "production lab environments are rejected before failure injection",

      async () => {
        const service =
          new RealityEnvironmentReplayService({
            replayService: {
              getRun:
                jest
                  .fn()
                  .mockResolvedValue(
                    makeReplayRun()
                  ),
            },

            lifecycleService: {
              requireEnvironment:
                jest
                  .fn()
                  .mockResolvedValue(
                    makeLabEnvironment({
                      production:
                        true,
                    })
                  ),

              beginExperiment:
                jest.fn(),
            },

            failureInjectionEngine: {
              inject:
                jest.fn(),
            },
          });


        await expect(
          service.prepare({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            replayRunId:
              "replay_23r5",

            labEnvironmentId:
              "lab_kind_1",

            experimentRun:
              makeExperimentRun(),

            target:
              makeTarget(),
          })
        ).rejects.toMatchObject({
          code:
            "REALITY_ENVIRONMENT_REPLAY_PRODUCTION_FORBIDDEN",

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "production targets are rejected before Phase 21 injector is called",

      async () => {
        const injector =
          jest.fn();


        const service =
          new RealityEnvironmentReplayService({
            replayService: {
              getRun:
                jest
                  .fn()
                  .mockResolvedValue(
                    makeReplayRun()
                  ),
            },

            lifecycleService: {
              requireEnvironment:
                jest
                  .fn()
                  .mockResolvedValue(
                    makeLabEnvironment()
                  ),

              beginExperiment:
                jest.fn(),
            },

            failureInjectionEngine: {
              inject:
                injector,
            },
          });


        await expect(
          service.prepare({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            replayRunId:
              "replay_23r5",

            labEnvironmentId:
              "lab_kind_1",

            experimentRun:
              makeExperimentRun(),

            target:
              makeTarget({
                production:
                  true,
              }),
          })
        ).rejects.toMatchObject({
          code:
            "REALITY_ENVIRONMENT_REPLAY_PRODUCTION_TARGET_FORBIDDEN",

          executionAuthorized:
            false,
        });


        expect(
          injector
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "environment replay requires the existing Phase 21 experiment to be INJECTING",

      async () => {
        const service =
          new RealityEnvironmentReplayService({
            replayService: {
              getRun:
                jest
                  .fn()
                  .mockResolvedValue(
                    makeReplayRun()
                  ),
            },

            lifecycleService: {
              requireEnvironment:
                jest
                  .fn()
                  .mockResolvedValue(
                    makeLabEnvironment()
                  ),

              beginExperiment:
                jest.fn(),
            },

            failureInjectionEngine: {
              inject:
                jest.fn(),
            },
          });


        await expect(
          service.prepare({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            replayRunId:
              "replay_23r5",

            labEnvironmentId:
              "lab_kind_1",

            experimentRun:
              makeExperimentRun({
                status:
                  EXPERIMENT_RUN_STATUS
                    .CREATED,
              }),

            target:
              makeTarget(),
          })
        ).rejects.toMatchObject({
          code:
            "REALITY_ENVIRONMENT_REPLAY_EXPERIMENT_NOT_INJECTING",

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "injectFault reserves AVAILABLE lab through Phase 21 lifecycle then delegates to Phase 21 Failure Injection Engine",

      async () => {
        const labAvailable =
          makeLabEnvironment({
            status:
              LAB_ENVIRONMENT_STATUS
                .AVAILABLE,
          });


        const labRunning =
          makeLabEnvironment({
            status:
              LAB_ENVIRONMENT_STATUS
                .RUNNING_EXPERIMENT,
          });


        const lifecycleService = {
          requireEnvironment:
            jest
              .fn()
              .mockResolvedValueOnce(
                labAvailable
              )
              .mockResolvedValueOnce(
                labAvailable
              )
              .mockResolvedValueOnce(
                labRunning
              ),

          beginExperiment:
            jest
              .fn()
              .mockResolvedValue(
                labRunning
              ),
        };


        const failureInjectionEngine = {
          inject:
            jest
              .fn()
              .mockResolvedValue({
                success:
                  true,

                state:
                  "ACTIVE",

                engineVersion:
                  "21.9-v1",

                plan: {
                  operation:
                    "K8S_DELETE_POD",

                  failureDomain:
                    "KUBERNETES",

                  failureType:
                    "POD_CRASH",

                  labKind:
                    "KIND",

                  target: {
                    resourcePublicId:
                      "resource_pod_1",

                    resourceType:
                      "kubernetes.pod",

                    namespace:
                      "aira-reliability-lab",

                    podName:
                      "aira-fixture-abc123",

                    production:
                      false,

                    executionAuthorized:
                      false,
                  },

                  evaluatorGroundTruthIncluded:
                    false,

                  executionAuthorized:
                    false,
                },

                runtimeResult: {
                  success:
                    true,

                  operation:
                    "K8S_DELETE_POD",

                  changed:
                    true,

                  reference:
                    "pod/aira-fixture-abc123",

                  provenance: {
                    runtime:
                      "KUBERNETES_RELIABILITY_LAB_RUNTIME",

                    namespace:
                      "aira-reliability-lab",

                    executionAuthorized:
                      false,
                  },

                  executionAuthorized:
                    false,
                },

                evaluatorGroundTruthIncluded:
                  false,

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new RealityEnvironmentReplayService({
            replayService: {
              getRun:
                jest
                  .fn()
                  .mockResolvedValue(
                    makeReplayRun()
                  ),
            },

            lifecycleService,

            failureInjectionEngine,

            now:
              () =>
                new Date(
                  "2026-09-03T00:00:00.000Z"
                ),
          });


        const result =
          await service.injectFault({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            replayRunId:
              "replay_23r5",

            labEnvironmentId:
              "lab_kind_1",

            experimentRun:
              makeExperimentRun(),

            failureKey:
              "kubernetes.pod.crash",

            failureVersion:
              1,

            target:
              makeTarget(),

            parameters: {},
          });


        expect(
          lifecycleService
            .beginExperiment
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          failureInjectionEngine
            .inject
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          failureInjectionEngine
            .inject
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            failureKey:
              "kubernetes.pod.crash",

            version:
              1,

            target:
              expect.objectContaining({
                production:
                  false,

                executionAuthorized:
                  false,
              }),
          })
        );


        expect(
          result.stage
        ).toBe(
          ENVIRONMENT_REPLAY_STAGE
            .FAULT_INJECTED
        );


        expect(
          result
            .fault
            .runtimeResult
            .reference
        ).toBe(
          "pod/aira-fixture-abc123"
        );


        expect(
          result
            .groundTruthAgentVisible
        ).toBe(
          false
        );


        expect(
          result
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "result sanitizer rejects evaluator-ground-truth leakage",

      () => {
        expect(
          () =>
            sanitizeFailureInjectionResult({
              success:
                true,

              evaluatorGroundTruthIncluded:
                true,

              executionAuthorized:
                false,

              plan: {},
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_ENVIRONMENT_REPLAY_GROUND_TRUTH_LEAKAGE",

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "result sanitizer rejects execution authority from Reliability Lab runtime",

      () => {
        expect(
          () =>
            sanitizeFailureInjectionResult({
              success:
                true,

              evaluatorGroundTruthIncluded:
                false,

              executionAuthorized:
                false,

              plan: {
                evaluatorGroundTruthIncluded:
                  false,

                executionAuthorized:
                  false,
              },

              runtimeResult: {
                success:
                  true,

                executionAuthorized:
                  true,
              },
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_ENVIRONMENT_REPLAY_RUNTIME_AUTHORITY_VIOLATION",

            executionAuthorized:
              false,
          })
        );
      }
    );
  }
);