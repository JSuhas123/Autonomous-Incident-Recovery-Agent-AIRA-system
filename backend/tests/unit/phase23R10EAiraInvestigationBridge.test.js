"use strict";

const {
  REALITY_AIRA_INVESTIGATION_BRIDGE_VERSION,

  RealityAiraInvestigationBridge,

  assertSafeAgentInput,
} = require(
  "../../services/reality/realityAiraInvestigationBridge"
);


function makeDiagnosisObservation(
  overrides = {}
) {
  return {
    harnessVersion:
      "21.14-v1",

    experimentRunId:
      "exprun_001",

    correlationId:
      "phase23r:replay_001:case_001",

    incidentId:
      "incident_001",

    diagnosisRunId:
      "diag_001",

    selectedFailureMode:
      "kubernetes.pod.crash",

    diagnosisOutcome:
      "DIAGNOSED",

    diagnosisConfidence:
      0.94,

    evidenceCompleteness:
      0.88,

    primaryHypothesisId:
      "hyp_001",

    primaryHypothesis: {
      id:
        "hyp_001",

      title:
        "Kubernetes pod unavailable",

      category:
        "KUBERNETES",

      rootCause:
        "Observed pod became unavailable",

      confidence:
        0.94,

      status:
        "SUPPORTED",
    },

    verificationStatus:
      "PASS",

    supportingEvidenceCount:
      3,

    contradictingEvidenceCount:
      0,

    falsePositiveSuspected:
      false,

    diagnosisCorrect:
      null,

    groundTruthConsumed:
      false,

    evaluatorInfluencedReasoning:
      false,

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

    tenantId:
      "org_test",

    replayRunId:
      "replay_001",

    environmentReplayRunId:
      "envreplay_001",

    experimentRunId:
      "exprun_001",

    correlationId:
      "phase23r:replay_001:case_001",

    incidentId:
      "incident_001",

    diagnosisDependencies: {
      telemetryProvider: {
        type:
          "TEST_PROVIDER",
      },
    },

    production:
      false,

    executionAuthorized:
      false,

    ...overrides,
  };
}


describe(
  "AIRA Phase 23R.10E — Observation to AIRA investigation bridge",
  () => {
    test(
      "exports the 23R.10E bridge version",
      () => {
        expect(
          REALITY_AIRA_INVESTIGATION_BRIDGE_VERSION
        ).toBe(
          "23R.10E.0"
        );
      }
    );


    test(
      "runs AIRA diagnosis through the frozen Phase-21 diagnosis harness",
      async () => {
        const bindingService = {
          transitionStage:
            jest
              .fn()
              .mockResolvedValueOnce({
                stage:
                  "INVESTIGATING",

                executionAuthorized:
                  false,
              })
              .mockResolvedValueOnce({
                stage:
                  "RECOVERY_PENDING",

                executionAuthorized:
                  false,
              }),
        };

        const diagnosisHarness = {
          observe:
            jest
              .fn()
              .mockResolvedValue(
                makeDiagnosisObservation()
              ),
        };

        const bridge =
          new RealityAiraInvestigationBridge({
            bindingService,

            diagnosisHarness,
          });

        const result =
          await bridge.investigate(
            makeInput()
          );

        expect(
          diagnosisHarness.observe
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            tenantId:
              "org_test",

            experimentRunId:
              "exprun_001",

            correlationId:
              "phase23r:replay_001:case_001",

            incidentId:
              "incident_001",
          })
        );

        expect(
          bindingService.transitionStage
        ).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            stage:
              "INVESTIGATING",
          })
        );

        expect(
          bindingService.transitionStage
        ).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            stage:
              "RECOVERY_PENDING",
          })
        );

        expect(
          result
        ).toMatchObject({
          stage:
            "RECOVERY_PENDING",

          selectedFailureMode:
            "kubernetes.pod.crash",

          diagnosisRunId:
            "diag_001",

          productionCertified:
            false,

          executionAuthorized:
            false,
        });

        expect(
          result.evaluator
        ).toEqual({
          groundTruthConsumed:
            false,

          evaluatorInfluencedReasoning:
            false,

          groundTruthPassedToAira:
            false,
        });
      }
    );


    test(
      "can resolve the incident created by the 10D correlation result",
      async () => {
        const bridge =
          new RealityAiraInvestigationBridge({
            bindingService: {
              transitionStage:
                jest
                  .fn()
                  .mockResolvedValueOnce({
                    stage:
                      "INVESTIGATING",
                  })
                  .mockResolvedValueOnce({
                    stage:
                      "RECOVERY_PENDING",
                  }),
            },

            diagnosisHarness: {
              observe:
                jest
                  .fn()
                  .mockResolvedValue(
                    makeDiagnosisObservation({
                      incidentId:
                        "incident_from_10d",
                    })
                  ),
            },
          });

        const result =
          await bridge.investigate(
            makeInput({
              incidentId:
                undefined,

              replayResult: {
                correlation: {
                  incidentId:
                    "incident_from_10d",
                },
              },
            })
          );

        expect(
          result.incidentId
        ).toBe(
          "incident_from_10d"
        );
      }
    );


    test(
      "rejects missing canonical incident before diagnosis",
      async () => {
        const diagnosisHarness = {
          observe:
            jest.fn(),
        };

        const bridge =
          new RealityAiraInvestigationBridge({
            bindingService:
              {},

            diagnosisHarness,
          });

        await expect(
          bridge.investigate(
            makeInput({
              incidentId:
                undefined,
            })
          )
        ).rejects.toMatchObject({
          code:
            "REALITY_AIRA_INVESTIGATION_FIELD_REQUIRED",
        });

        expect(
          diagnosisHarness.observe
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "rejects evaluator truth in diagnosis dependencies",
      async () => {
        const bridge =
          new RealityAiraInvestigationBridge({
            bindingService:
              {},

            diagnosisHarness:
              {},
          });

        await expect(
          bridge.investigate(
            makeInput({
              diagnosisDependencies: {
                telemetryProvider:
                  {},

                expectedDiagnosis:
                  "kubernetes.pod.crash",
              },
            })
          )
        ).rejects.toMatchObject({
          code:
            "REALITY_AIRA_INVESTIGATION_GROUND_TRUTH_FORBIDDEN",
        });
      }
    );


    test(
      "allows false authority assertions but rejects true authority",
      () => {
        expect(
          assertSafeAgentInput(
            {
              executionAuthorized:
                false,

              nested: {
                productionAuthorized:
                  false,
              },
            },
            "test"
          )
        ).toBe(
          true
        );

        expect(
          () =>
            assertSafeAgentInput(
              {
                nested: {
                  executionAuthorized:
                    true,
                },
              },
              "test"
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_AIRA_INVESTIGATION_AUTHORITY_FORBIDDEN",
          })
        );
      }
    );


    test(
      "fails closed if diagnosis reports evaluator influence",
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
          new RealityAiraInvestigationBridge({
            bindingService,

            diagnosisHarness: {
              observe:
                jest
                  .fn()
                  .mockResolvedValue(
                    makeDiagnosisObservation({
                      evaluatorInfluencedReasoning:
                        true,
                    })
                  ),
            },
          });

        await expect(
          bridge.investigate(
            makeInput()
          )
        ).rejects.toMatchObject({
          code:
            "REALITY_AIRA_INVESTIGATION_RESULT_UNSAFE",
        });

        expect(
          bindingService.transitionStage
        ).toHaveBeenLastCalledWith(
          expect.objectContaining({
            stage:
              "FAILED",

            failureCode:
              "REALITY_AIRA_INVESTIGATION_RESULT_UNSAFE",
          })
        );
      }
    );


    test(
      "marks persisted environment replay FAILED when diagnosis throws",
      async () => {
        const bindingService = {
          transitionStage:
            jest
              .fn()
              .mockResolvedValue({
                stage:
                  "INVESTIGATING",
              }),
        };

        const bridge =
          new RealityAiraInvestigationBridge({
            bindingService,

            diagnosisHarness: {
              observe:
                jest
                  .fn()
                  .mockRejectedValue(
                    Object.assign(
                      new Error(
                        "diagnosis unavailable"
                      ),
                      {
                        code:
                          "DIAGNOSIS_FAILED",
                      }
                    )
                  ),
            },
          });

        await expect(
          bridge.investigate(
            makeInput()
          )
        ).rejects.toMatchObject({
          code:
            "DIAGNOSIS_FAILED",
        });

        expect(
          bindingService.transitionStage
        ).toHaveBeenLastCalledWith(
          expect.objectContaining({
            stage:
              "FAILED",

            failureCode:
              "DIAGNOSIS_FAILED",
          })
        );
      }
    );
  }
);