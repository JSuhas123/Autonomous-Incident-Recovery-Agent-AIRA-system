"use strict";


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
  FailureScenarioRegistry,
} =
  require(
    "../../services/reliability/failureScenarioRegistry"
  );


const {
  assertFailureInjectionAllowed,
} =
  require(
    "../../services/reliability/failureInjectionSafetyBoundary"
  );


const {
  INJECTION_OPERATION,

  buildFailureInjectionPlan,
} =
  require(
    "../../services/reliability/failureInjectionPlanFactory"
  );


const {
  FailureInjectionEngine,
} =
  require(
    "../../services/reliability/failureInjectionEngine"
  );


const LAB_LABELS = {
  "aira.reliability-lab":
    "true",

  "aira.safety-class":
    "LAB_ONLY",
};


function environment(
  overrides =
    {}
) {
  return {
    id:
      "lab-uuid",

    publicId:
      "lab_primary",

    kind:
      LAB_ENVIRONMENT_KIND
        .KIND,

    status:
      LAB_ENVIRONMENT_STATUS
        .RUNNING_EXPERIMENT,

    safetyClass:
      LAB_SAFETY_CLASS
        .LAB_ONLY,

    production:
      false,

    namespace:
      "aira-reliability-lab",

    labels:
      LAB_LABELS,

    executionAuthorized:
      false,

    ...overrides,
  };
}


function experimentRun(
  overrides =
    {}
) {
  return {
    experimentRunId:
      "exprun_123",

    publicId:
      "exprun_123",

    labEnvironmentId:
      "lab_primary",

    experimentKey:
      "k8s.pod.crash.recovery",

    experimentVersion:
      1,

    correlationId:
      "corr_123",

    status:
      EXPERIMENT_RUN_STATUS
        .INJECTING,

    executionAuthorized:
      false,

    ...overrides,
  };
}


function target(
  overrides =
    {}
) {
  return {
    resourcePublicId:
      "pod_lab_api",

    resourceType:
      "kubernetes.pod",

    namespace:
      "aira-reliability-lab",

    podName:
      "lab-api-abc123",

    workloadName:
      "lab-api",

    labels:
      LAB_LABELS,

    production:
      false,

    executionAuthorized:
      false,

    ...overrides,
  };
}


describe(
  "Phase 21.9 deterministic failure injection planning",

  () => {
    const registry =
      new FailureScenarioRegistry();


    test(
      "all registered scenarios expose deterministic injector identifiers",

      () => {
        const scenarios =
          registry.list({
            includeEvaluatorGroundTruth:
              true,
          });


        expect(
          scenarios
        ).toHaveLength(
          12
        );


        for (
          const scenario
          of scenarios
        ) {
          expect(
            typeof scenario.injector
          ).toBe(
            "string"
          );


          expect(
            scenario
              .injector
              .length
          ).toBeGreaterThan(
            0
          );
        }
      }
    );


    test(
      "Kubernetes pod crash produces deterministic delete-pod operation",

      () => {
        const scenario =
          registry
            .getEvaluatorScenario(
              "kubernetes.pod.crash",
              1
            );


        const plan =
          buildFailureInjectionPlan({
            scenario,

            environment:
              environment(),

            experimentRun:
              experimentRun(),

            target:
              target(),

            parameters: {
              gracePeriodSeconds:
                0,
            },
          });


        expect(
          plan.operation
        ).toBe(
          INJECTION_OPERATION
            .K8S_DELETE_POD
        );


        expect(
          plan.injectorKey
        ).toBe(
          "KUBERNETES_POD_TERMINATION"
        );


        expect(
          plan
            .evaluatorGroundTruthIncluded
        ).toBe(
          false
        );


        expect(
          plan.executionAuthorized
        ).toBe(
          false
        );


        expect(
          JSON.stringify(
            plan
          )
        ).not.toContain(
          "expectedFailureModeKey"
        );
      }
    );


    test(
      "ground truth cannot be smuggled into injection parameters",

      () => {
        const scenario =
          registry
            .getEvaluatorScenario(
              "kubernetes.pod.crash",
              1
            );


        expect(
          () =>
            buildFailureInjectionPlan({
              scenario,

              environment:
                environment(),

              experimentRun:
                experimentRun(),

              target:
                target(),

              parameters: {
                expectedDiagnosis:
                  "pod-crash",
              },
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "FAILURE_INJECTION_GROUND_TRUTH_PARAMETER_FORBIDDEN",
          })
        );
      }
    );
  }
);


describe(
  "Phase 21.10 hard failure-injection safety boundary",

  () => {
    const registry =
      new FailureScenarioRegistry();


    const scenario =
      registry
        .getEvaluatorScenario(
          "kubernetes.pod.crash",
          1
        );


    test(
      "allows explicitly registered LAB_ONLY target during INJECTING",

      () => {
        const result =
          assertFailureInjectionAllowed({
            environment:
              environment(),

            scenario,

            experimentRun:
              experimentRun(),

            target:
              target(),
          });


        expect(
          result.allowed
        ).toBe(
          true
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "rejects production environment",

      () => {
        expect(
          () =>
            assertFailureInjectionAllowed({
              environment:
                environment({
                  production:
                    true,
                }),

              scenario,

              experimentRun:
                experimentRun(),

              target:
                target(),
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "FAILURE_INJECTION_PRODUCTION_ENVIRONMENT_FORBIDDEN",
          })
        );
      }
    );


    test(
      "rejects non-LAB_ONLY environment",

      () => {
        expect(
          () =>
            assertFailureInjectionAllowed({
              environment:
                environment({
                  safetyClass:
                    "PRODUCTION",
                }),

              scenario,

              experimentRun:
                experimentRun(),

              target:
                target(),
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "FAILURE_INJECTION_LAB_ONLY_REQUIRED",
          })
        );
      }
    );


    test(
      "rejects environment that is not RUNNING_EXPERIMENT",

      () => {
        expect(
          () =>
            assertFailureInjectionAllowed({
              environment:
                environment({
                  status:
                    LAB_ENVIRONMENT_STATUS
                      .AVAILABLE,
                }),

              scenario,

              experimentRun:
                experimentRun(),

              target:
                target(),
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "FAILURE_INJECTION_ENVIRONMENT_NOT_RUNNING_EXPERIMENT",
          })
        );
      }
    );


    test(
      "rejects experiment run that is not INJECTING",

      () => {
        expect(
          () =>
            assertFailureInjectionAllowed({
              environment:
                environment(),

              scenario,

              experimentRun:
                experimentRun({
                  status:
                    EXPERIMENT_RUN_STATUS
                      .CREATED,
                }),

              target:
                target(),
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "FAILURE_INJECTION_RUN_NOT_INJECTING",
          })
        );
      }
    );


    test(
      "rejects namespace outside dedicated Reliability Lab",

      () => {
        expect(
          () =>
            assertFailureInjectionAllowed({
              environment:
                environment(),

              scenario,

              experimentRun:
                experimentRun(),

              target:
                target({
                  namespace:
                    "production",
                }),
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "FAILURE_INJECTION_NAMESPACE_OUTSIDE_LAB",
          })
        );
      }
    );


    test(
      "rejects target without Reliability Lab registration label",

      () => {
        expect(
          () =>
            assertFailureInjectionAllowed({
              environment:
                environment(),

              scenario,

              experimentRun:
                experimentRun(),

              target:
                target({
                  labels: {
                    "aira.safety-class":
                      "LAB_ONLY",
                  },
                }),
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "FAILURE_INJECTION_TARGET_NOT_REGISTERED_LAB_RESOURCE",
          })
        );
      }
    );


    test(
      "rejects resource type mismatch",

      () => {
        expect(
          () =>
            assertFailureInjectionAllowed({
              environment:
                environment(),

              scenario,

              experimentRun:
                experimentRun(),

              target:
                target({
                  resourceType:
                    "postgres.database",
                }),
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "FAILURE_INJECTION_TARGET_TYPE_MISMATCH",
          })
        );
      }
    );


    test(
      "Docker boundary rejects arbitrary container names",

      () => {
        const dockerScenario =
          registry
            .getEvaluatorScenario(
              "redis.unavailable",
              1
            );


        expect(
          () =>
            assertFailureInjectionAllowed({
              environment:
                environment({
                  kind:
                    LAB_ENVIRONMENT_KIND
                      .DOCKER,

                  namespace:
                    null,
                }),

              scenario:
                dockerScenario,

              experimentRun:
                experimentRun(),

              target: {
                resourcePublicId:
                  "redis",

                resourceType:
                  "redis.instance",

                containerName:
                  "customer-production-redis",

                labels:
                  LAB_LABELS,

                production:
                  false,

                executionAuthorized:
                  false,
              },
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "FAILURE_INJECTION_DOCKER_TARGET_OUTSIDE_LAB",
          })
        );
      }
    );
  }
);


describe(
  "Phase 21.9/21.10 Failure Injection Engine",

  () => {
    test(
      "requires explicit runtime and never falls back to arbitrary execution",

      async () => {
        const repository = {
          appendFailureInjection:
            jest.fn(),
        };


        const lifecycleService = {
          requireEnvironment:
            jest.fn(
              async () =>
                environment()
            ),
        };


        const engine =
          new FailureInjectionEngine({
            repository,

            lifecycleService,

            registry:
              new FailureScenarioRegistry(),
          });


        await expect(
          engine.inject({
            organizationId:
              "aira-dev-org",

            environmentId:
              "env_aira_development",

            labEnvironmentId:
              "lab_primary",

            experimentRun:
              experimentRun(),

            failureKey:
              "kubernetes.pod.crash",

            target:
              target(),
          })
        ).rejects.toMatchObject({
          code:
            "FAILURE_INJECTION_RUNTIME_REQUIRED",

          executionAuthorized:
            false,
        });


        expect(
          repository
            .appendFailureInjection
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "successful runtime writes separate non-authorizing injection provenance",

      async () => {
        const repository = {
          appendFailureInjection:
            jest.fn(
              async (
                input
              ) => ({
                publicId:
                  "inject_123",

                ...input,

                executionAuthorized:
                  false,
              })
            ),
        };


        const lifecycleService = {
          requireEnvironment:
            jest.fn(
              async () =>
                environment()
            ),
        };


        const runtime = {
          execute:
            jest.fn(
              async (
                plan
              ) => ({
                success:
                  true,

                operation:
                  plan.operation,

                changed:
                  true,

                reference:
                  "pod/lab-api-abc123",

                provenance: {
                  runtime:
                    "TEST_RUNTIME",
                },

                executionAuthorized:
                  false,
              })
            ),
        };


        const engine =
          new FailureInjectionEngine({
            repository,

            lifecycleService,

            runtime,

            registry:
              new FailureScenarioRegistry(),

            now:
              () =>
                new Date(
                  "2026-08-31T06:00:00.000Z"
                ),
          });


        const result =
          await engine.inject({
            organizationId:
              "aira-dev-org",

            environmentId:
              "env_aira_development",

            labEnvironmentId:
              "lab_primary",

            experimentRun:
              experimentRun(),

            failureKey:
              "kubernetes.pod.crash",

            target:
              target(),

            parameters: {
              gracePeriodSeconds:
                0,
            },
          });


        expect(
          runtime.execute
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          repository
            .appendFailureInjection
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          repository
            .appendFailureInjection
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            state:
              "ACTIVE",

            injectorKey:
              "KUBERNETES_POD_TERMINATION",

            targetResourceType:
              "kubernetes.pod",

            provenance:
              expect.objectContaining({
                source:
                  "AIRA_PHASE_21_FAILURE_INJECTION_ENGINE",

                recoveryProvenance:
                  false,

                evaluatorGroundTruthIncluded:
                  false,

                executionAuthorized:
                  false,
              }),
          })
        );


        expect(
          result.success
        ).toBe(
          true
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );


        expect(
          JSON.stringify(
            result.plan
          )
        ).not.toContain(
          "groundTruth"
        );
      }
    );


    test(
      "runtime failure can never be reported as successful injection",

      async () => {
        const repository = {
          appendFailureInjection:
            jest.fn(
              async (
                input
              ) => ({
                publicId:
                  "inject_failed",

                ...input,

                executionAuthorized:
                  false,
              })
            ),
        };


        const lifecycleService = {
          requireEnvironment:
            jest.fn(
              async () =>
                environment()
            ),
        };


        const runtime = {
          execute:
            jest.fn(
              async () => {
                throw Object.assign(
                  new Error(
                    "injection failed"
                  ),

                  {
                    code:
                      "TEST_INJECTION_FAILED",
                  }
                );
              }
            ),
        };


        const engine =
          new FailureInjectionEngine({
            repository,

            lifecycleService,

            runtime,

            registry:
              new FailureScenarioRegistry(),
          });


        await expect(
          engine.inject({
            organizationId:
              "aira-dev-org",

            environmentId:
              "env_aira_development",

            labEnvironmentId:
              "lab_primary",

            experimentRun:
              experimentRun(),

            failureKey:
              "kubernetes.pod.crash",

            target:
              target(),
          })
        ).rejects.toMatchObject({
          code:
            "TEST_INJECTION_FAILED",

          executionAuthorized:
            false,
        });


        expect(
          repository
            .appendFailureInjection
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            state:
              "FAILED",
          })
        );
      }
    );
  }
);