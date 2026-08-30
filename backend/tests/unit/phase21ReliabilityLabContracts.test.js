"use strict";

const {
  RELIABILITY_LAB_CONTRACT_VERSION,

  RELIABILITY_EXPERIMENT_CONTRACT_VERSION,

  LAB_ENVIRONMENT_KIND,

  LAB_ENVIRONMENT_STATUS,

  LAB_SAFETY_CLASS,

  FAILURE_DOMAIN,

  FAILURE_TYPE,

  EXPERIMENT_RUN_STATUS,

  EXPERIMENT_ASSERTION,

  RELIABILITY_AUTHORITY,
} =
  require(
    "../../constants/reliabilityLab"
  );


const {
  RELIABILITY_LAB_ARCHITECTURE_CONTRACT,

  validateReliabilityLabArchitectureContract,

  assertLabEnvironmentContract,

  isEnvironmentRunnable,

  validateExperimentDefinition,

  validateExperimentRun,

  buildAiraExperimentContext,

  buildEvaluatorGroundTruth,

  assertNoGroundTruthLeak,
} =
  require(
    "../../contracts/reliability"
  );


function buildDefinition(
  overrides =
    {}
) {
  return {
    experimentKey:
      "k8s.pod.crash.recovery",

    version:
      1,

    name:
      "Kubernetes Pod Crash Recovery",

    failureDomain:
      FAILURE_DOMAIN
        .KUBERNETES,

    failureType:
      FAILURE_TYPE
        .POD_CRASH,

    targetResourceType:
      "kubernetes.pod",

    groundTruth: {
      expectedFailureModeKey:
        "kubernetes.pod.crash",

      expectedDetection:
        true,

      expectedRecovery:
        true,
    },

    assertions: [
      EXPERIMENT_ASSERTION
        .BASELINE_HEALTHY,

      EXPERIMENT_ASSERTION
        .FAILURE_INJECTED,

      EXPERIMENT_ASSERTION
        .DETECTED,

      EXPERIMENT_ASSERTION
        .DIAGNOSIS_CORRECT,

      EXPERIMENT_ASSERTION
        .POLICY_RESPECTED,

      EXPERIMENT_ASSERTION
        .AUTHORIZATION_RESPECTED,

      EXPERIMENT_ASSERTION
        .VERIFICATION_CORRECT,

      EXPERIMENT_ASSERTION
        .RESET_SUCCEEDED,
    ],

    executionAuthorized:
      false,

    ...overrides,
  };
}


function buildRun(
  overrides =
    {}
) {
  return {
    experimentRunId:
      "exprun_123",

    experimentKey:
      "k8s.pod.crash.recovery",

    experimentVersion:
      1,

    labEnvironmentId:
      "lab_kind_primary",

    correlationId:
      "corr_123",

    status:
      EXPERIMENT_RUN_STATUS
        .CREATED,

    executionAuthorized:
      false,

    ...overrides,
  };
}


describe(
  "Phase 21.0 Reliability Lab architecture contract",
  () => {
    test(
      "contract versions are frozen",
      () => {
        expect(
          RELIABILITY_LAB_CONTRACT_VERSION
        ).toBe(
          "21.0-v1"
        );


        expect(
          RELIABILITY_EXPERIMENT_CONTRACT_VERSION
        ).toBe(
          "21.1-v1"
        );
      }
    );


    test(
      "architecture contract preserves subsystem ownership",
      () => {
        expect(
          RELIABILITY_LAB_ARCHITECTURE_CONTRACT
            .authorities
            .resourceTopology
        ).toBe(
          RELIABILITY_AUTHORITY
            .RESOURCE_TOPOLOGY
        );


        expect(
          RELIABILITY_LAB_ARCHITECTURE_CONTRACT
            .authorities
            .recoveryKnowledge
        ).toBe(
          RELIABILITY_AUTHORITY
            .RECOVERY_KNOWLEDGE
        );


        expect(
          RELIABILITY_LAB_ARCHITECTURE_CONTRACT
            .authorities
            .integrations
        ).toBe(
          RELIABILITY_AUTHORITY
            .INTEGRATIONS
        );


        expect(
          RELIABILITY_LAB_ARCHITECTURE_CONTRACT
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "architecture contract validates",
      () => {
        expect(
          validateReliabilityLabArchitectureContract()
        ).toEqual(
          expect.objectContaining({
            valid:
              true,

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "Phase 21 explicitly measures reliability rather than autonomy",
      () => {
        expect(
          RELIABILITY_LAB_ARCHITECTURE_CONTRACT
            .invariants
        ).toContain(
          "PHASE_21_MEASURES_RELIABILITY_NOT_AUTONOMY"
        );


        expect(
          RELIABILITY_LAB_ARCHITECTURE_CONTRACT
            .invariants
        ).toContain(
          "PHASE_22_CONSUMES_PHASE_21_EVIDENCE"
        );
      }
    );


    test(
      "production environment cannot masquerade as reliability lab",
      () => {
        expect(
          () =>
            assertLabEnvironmentContract({
              organizationId:
                "aira-dev-org",

              environmentId:
                "canonical-env",

              environmentPublicId:
                "env_production",

              kind:
                LAB_ENVIRONMENT_KIND
                  .KUBERNETES,

              status:
                LAB_ENVIRONMENT_STATUS
                  .AVAILABLE,

              safetyClass:
                LAB_SAFETY_CLASS
                  .LAB_ONLY,

              production:
                true,

              executionAuthorized:
                false,
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "PRODUCTION_LAB_FORBIDDEN",

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "only AVAILABLE clean lab is runnable",
      () => {
        const base = {
          organizationId:
            "aira-dev-org",

          environmentId:
            "canonical-env",

          environmentPublicId:
            "env_aira_lab",

          kind:
            LAB_ENVIRONMENT_KIND
              .KIND,

          safetyClass:
            LAB_SAFETY_CLASS
              .LAB_ONLY,

          production:
            false,

          executionAuthorized:
            false,
        };


        expect(
          isEnvironmentRunnable({
            ...base,

            status:
              LAB_ENVIRONMENT_STATUS
                .AVAILABLE,
          })
        ).toBe(
          true
        );


        expect(
          isEnvironmentRunnable({
            ...base,

            status:
              LAB_ENVIRONMENT_STATUS
                .DIRTY,
          })
        ).toBe(
          false
        );
      }
    );
  }
);


describe(
  "Phase 21.1 Experiment contracts",
  () => {
    test(
      "versioned experiment definition validates",
      () => {
        expect(
          validateExperimentDefinition(
            buildDefinition()
          )
        ).toEqual(
          expect.objectContaining({
            valid:
              true,

            experimentKey:
              "k8s.pod.crash.recovery",

            version:
              1,

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "experiment definition cannot authorize execution",
      () => {
        expect(
          () =>
            validateExperimentDefinition(
              buildDefinition({
                executionAuthorized:
                  true,
              })
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "EXPERIMENT_DEFINITION_CANNOT_AUTHORIZE_EXECUTION",
          })
        );
      }
    );


    test(
      "experiment run requires correlation identifier",
      () => {
        expect(
          () =>
            validateExperimentRun(
              buildRun({
                correlationId:
                  "",
              })
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "EXPERIMENT_FIELD_REQUIRED",
          })
        );
      }
    );


    test(
      "experiment run cannot grant execution authority",
      () => {
        expect(
          () =>
            validateExperimentRun(
              buildRun({
                executionAuthorized:
                  true,
              })
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "EXPERIMENT_RUN_CANNOT_AUTHORIZE_EXECUTION",
          })
        );
      }
    );


    test(
      "AIRA-visible experiment context excludes evaluator ground truth",
      () => {
        const context =
          buildAiraExperimentContext({
            experimentRun:
              buildRun(),

            definition:
              buildDefinition(),

            resourceContext: {
              resourcePublicId:
                "res_test",

              resourceType:
                "kubernetes.pod",
            },

            observationContext: {
              signalSource:
                "prometheus",
            },
          });


        expect(
          context
            .groundTruth
        ).toBeUndefined();


        expect(
          JSON.stringify(
            context
          )
        ).not.toContain(
          "expectedFailureModeKey"
        );


        expect(
          context
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "evaluator receives exact experiment ground truth separately",
      () => {
        const truth =
          buildEvaluatorGroundTruth({
            experimentRun:
              buildRun(),

            definition:
              buildDefinition(),

            failureInjectionId:
              "inject_123",
          });


        expect(
          truth.visibility
        ).toBe(
          "EVALUATOR_ONLY"
        );


        expect(
          truth
            .groundTruth
            .expectedFailureModeKey
        ).toBe(
          "kubernetes.pod.crash"
        );


        expect(
          truth
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "ground-truth leakage into AIRA observation context is rejected",
      () => {
        expect(
          () =>
            assertNoGroundTruthLeak({
              metrics: {
                cpu:
                  95,
              },

              expectedFailureModeKey:
                "kubernetes.pod.crash",
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "EXPERIMENT_GROUND_TRUTH_LEAK",

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "normal operational evidence passes ground-truth leak guard",
      () => {
        expect(
          assertNoGroundTruthLeak({
            resource: {
              type:
                "kubernetes.pod",

              restartCount:
                4,
            },

            metrics: {
              cpu:
                91,

              memory:
                72,
            },
          })
        ).toEqual({
          valid:
            true,

          executionAuthorized:
            false,
        });
      }
    );
  }
);