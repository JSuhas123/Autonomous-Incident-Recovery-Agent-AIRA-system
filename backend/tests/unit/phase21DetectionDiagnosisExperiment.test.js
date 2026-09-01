"use strict";


const {
  DetectionDiagnosisExperimentService,
  sanitizeDiagnosisDependencies,
} =
  require(
    "../../services/reliability/detectionDiagnosisExperimentService"
  );


describe(
  "Phase 21.13 + 21.14 experiment integration",
  () => {
    test(
      "composes frozen correlation path into real diagnosis and evaluator",
      async () => {
        const repository = {
          getExperimentDefinition:
            jest.fn(
              async () => ({
                experimentKey:
                  "kubernetes.pod.crash",

                version:
                  1,

                groundTruth: {
                  expectedFailureModeKey:
                    "kubernetes.pod.crash",

                  expectedDiagnosis:
                    "KUBERNETES_POD_CRASH",
                },

                executionAuthorized:
                  false,
              })
            ),


          getExperimentRun:
            jest.fn(
              async () => ({
                publicId:
                  "exprun-1",

                status:
                  "WAITING_FOR_DIAGNOSIS",

                failureSummary: {
                  injectedAt:
                    "2026-08-31T12:00:00.000Z",
                },

                executionAuthorized:
                  false,
              })
            ),
        };


        const orchestrator = {
          runToCorrelation:
            jest.fn(
              async (
                input
              ) => {
                expect(
                  input
                    .groundTruth
                )
                  .toBeUndefined();


                return {
                  experimentRunId:
                    "exprun-1",

                  experimentKey:
                    "kubernetes.pod.crash",

                  correlationId:
                    "corr-1",

                  status:
                    "WAITING_FOR_DIAGNOSIS",

                  correlation: {
                    accepted:
                      true,

                    signalId:
                      "sig-1",

                    incidentCandidate:
                      true,

                    correlationObserved:
                      true,

                    correlationGroupId:
                      "group-1",

                    incidentId:
                      "inc-1",

                    startedAt:
                      "2026-08-31T12:00:01.000Z",

                    completedAt:
                      "2026-08-31T12:00:02.000Z",

                    executionAuthorized:
                      false,
                  },

                  executionAuthorized:
                    false,
                };
              }
            ),
        };


        const diagnosisHarness = {
          observe:
            jest.fn(
              async (
                input
              ) => {
                expect(
                  input
                    .groundTruth
                )
                  .toBeUndefined();


                expect(
                  input
                    .diagnosisDependencies
                    .groundTruth
                )
                  .toBeUndefined();


                return {
                  incidentId:
                    "inc-1",

                  selectedFailureMode:
                    "KUBERNETES_POD_CRASH",

                  diagnosisConfidence:
                    0.95,

                  startedAt:
                    "2026-08-31T12:00:03.000Z",

                  completedAt:
                    "2026-08-31T12:00:04.000Z",

                  durationMs:
                    1000,

                  groundTruthConsumed:
                    false,

                  evaluatorInfluencedReasoning:
                    false,

                  executionAuthorized:
                    false,
                };
              }
            ),
        };


        const evaluator = {
          evaluate:
            jest.fn(
              async (
                input
              ) => {
                expect(
                  input
                    .groundTruth
                    .expectedDiagnosis
                )
                  .toBe(
                    "KUBERNETES_POD_CRASH"
                  );


                expect(
                  input
                    .diagnosisObservation
                    .selectedFailureMode
                )
                  .toBe(
                    "KUBERNETES_POD_CRASH"
                  );


                return {
                  detection: {
                    status:
                      "PASS",
                  },

                  correlation: {
                    status:
                      "PASS",
                  },

                  diagnosis: {
                    status:
                      "PASS",
                  },

                  groundTruthUsedByEvaluator:
                    true,

                  groundTruthPassedToAira:
                    false,

                  executionAuthorized:
                    false,
                };
              }
            ),
        };


        const service =
          new DetectionDiagnosisExperimentService({
            repository,

            orchestrator,

            diagnosisHarness,

            evaluator,
          });


        const result =
          await service
            .runThroughDiagnosis({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              tenantId:
                "aira-dev-org",

              labEnvironmentId:
                "lab-1",

              experimentKey:
                "kubernetes.pod.crash",

              experimentVersion:
                1,

              executionAuthorized:
                false,
            });


        expect(
          orchestrator
            .runToCorrelation
        )
          .toHaveBeenCalledTimes(
            1
          );


        expect(
          diagnosisHarness
            .observe
        )
          .toHaveBeenCalledTimes(
            1
          );


        expect(
          evaluator.evaluate
        )
          .toHaveBeenCalledTimes(
            1
          );


        expect(
          result
            .evaluation
            .detection
            .status
        )
          .toBe(
            "PASS"
          );


        expect(
          result
            .evaluation
            .diagnosis
            .status
        )
          .toBe(
            "PASS"
          );


        expect(
          result
            .evaluator
            .groundTruthPassedToAira
        )
          .toBe(
            false
          );


        expect(
          result
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "missing incident is evaluated honestly without fabricating diagnosis",
      async () => {
        const diagnosisHarness = {
          observe:
            jest.fn(),
        };


        const evaluator = {
          evaluate:
            jest.fn(
              async (
                input
              ) => {
                expect(
                  input
                    .diagnosisObservation
                )
                  .toBeNull();


                return {
                  detection: {
                    status:
                      "PASS",
                  },

                  correlation: {
                    status:
                      "PASS",
                  },

                  diagnosis: {
                    status:
                      "INCONCLUSIVE",

                    reasonCode:
                      "DIAGNOSIS_NOT_OBSERVED",
                  },

                  executionAuthorized:
                    false,
                };
              }
            ),
        };


        const service =
          new DetectionDiagnosisExperimentService({
            repository: {
              getExperimentDefinition:
                jest.fn(
                  async () => ({
                    experimentKey:
                      "kubernetes.pod.crash",

                    version:
                      1,

                    groundTruth: {
                      expectedDiagnosis:
                        "KUBERNETES_POD_CRASH",
                    },
                  })
                ),

              getExperimentRun:
                jest.fn(
                  async () => ({
                    publicId:
                      "exprun-1",

                    failureSummary: {
                      injectedAt:
                        "2026-08-31T12:00:00.000Z",
                    },
                  })
                ),
            },

            orchestrator: {
              runToCorrelation:
                jest.fn(
                  async () => ({
                    experimentRunId:
                      "exprun-1",

                    experimentKey:
                      "kubernetes.pod.crash",

                    correlationId:
                      "corr-1",

                    correlation: {
                      accepted:
                        true,

                      signalId:
                        "sig-1",

                      incidentCandidate:
                        true,

                      correlationObserved:
                        true,

                      correlationGroupId:
                        "group-1",

                      incidentId:
                        null,

                      executionAuthorized:
                        false,
                    },

                    executionAuthorized:
                      false,
                  })
                ),
            },

            diagnosisHarness,

            evaluator,
          });


        const result =
          await service
            .runThroughDiagnosis({
              organizationId:
                "org-a",

              environmentId:
                "env-a",

              tenantId:
                "tenant-a",

              labEnvironmentId:
                "lab-a",

              experimentKey:
                "kubernetes.pod.crash",

              experimentVersion:
                1,

              executionAuthorized:
                false,
            });


        expect(
          diagnosisHarness
            .observe
        )
          .not
          .toHaveBeenCalled();


        expect(
          result
            .evaluation
            .diagnosis
            .status
        )
          .toBe(
            "INCONCLUSIVE"
          );
      }
    );


    test(
      "ground truth cannot be smuggled into diagnosis dependencies",
      () => {
        expect(
          () =>
            sanitizeDiagnosisDependencies({
              expectedDiagnosis:
                "KUBERNETES_POD_CRASH",
            })
        )
          .toThrow(
            /Evaluator-owned field cannot enter diagnosis dependencies/
          );
      }
    );


    test(
      "normal diagnosis runtime dependencies remain allowed",
      () => {
        expect(
          sanitizeDiagnosisDependencies({
            contextOptions: {
              includeHistory:
                true,
            },
          })
        )
          .toEqual({
            contextOptions: {
              includeHistory:
                true,
            },
          });
      }
    );
  }
);