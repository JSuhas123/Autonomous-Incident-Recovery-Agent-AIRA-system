"use strict";

const {
  RecoveryExecutionExperimentService,
} =
  require(
    "../../services/reliability/recoveryExecutionExperimentService"
  );


function buildDiagnosis(
  overrides = {}
) {
  return {
    diagnosisId:
      "diag-1",

    revision:
      1,

    outcome:
      "PROBABLE_CAUSE_IDENTIFIED",

    selectedFailureMode:
      "kubernetes.pod.crash",

    executionAuthorized:
      false,

    safetyGate: {
      decision:
        "ALLOW_EVALUATION",
    },

    ...overrides,
  };
}


function buildRecoveryEngineResult(
  overrides = {}
) {
  const decision = {
    decisionId:
      "recovery-1",

    revision:
      1,

    incidentId:
      "incident-1",

    diagnosisId:
      "diag-1",

    decision:
      "RECOMMEND_PLAYBOOK",

    selectedCandidateId:
      "candidate-1",

    selectedPlaybookId:
      "playbook-1",

    executionAuthorized:
      false,

    ...(
      overrides.decision ||
      {}
    ),
  };


  const candidate =
    overrides.selectedCandidate ===
      undefined
      ? {
          candidateId:
            "candidate-1",

          playbookId:
            "playbook-1",

          executionAuthorized:
            false,
        }
      : overrides.selectedCandidate;


  return {
    decision,

    selectedCandidate:
      candidate,

    candidates:
      candidate
        ? [
            candidate,
          ]
        : [],

    stageTrace:
      [],

    executionAuthorized:
      false,

    ...overrides,
  };
}


function buildEvaluatorStub() {
  return {
    calls:
      [],

    async evaluate(
      input
    ) {
      this.calls.push(
        input
      );

      return {
        overall:
          "PASS",

        executionAuthorized:
          false,

        productionCertified:
          false,
      };
    },
  };
}


describe(
  "Phase 21.15 + 21.16 recovery execution experiment service",
  () => {
    test(
      "invokes canonical recovery engine",
      async () => {
        const recoveryCalls =
          [];

        const recoveryDecisionEngine = {
          async decide(
            input,
            dependencies
          ) {
            recoveryCalls.push({
              input,
              dependencies,
            });

            return buildRecoveryEngineResult();
          },
        };


        const authorizationCalls =
          [];

        const executionAuthorizationEngine = {
          async authorize(
            input,
            dependencies
          ) {
            authorizationCalls.push({
              input,
              dependencies,
            });

            return {
              authorizationGranted:
                true,

              executionStarted:
                false,

              authorization: {
                authorizationId:
                  "auth-1",

                decision:
                  "AUTHORIZED",

                status:
                  "AUTHORIZED",
              },

              executionPlan: {
                planId:
                  "plan-1",

                planHash:
                  "hash-1",
              },
            };
          },
        };


        const evaluator =
          buildEvaluatorStub();


        const service =
          new RecoveryExecutionExperimentService({
            recoveryDecisionEngine,

            executionAuthorizationEngine,

            evaluator,
          });


        const result =
          await service.run({
            experimentRunId:
              "run-1",

            organizationId:
              "org",

            environmentId:
              "env",

            incident: {
              _id:
                "incident-1",
            },

            diagnosis:
              buildDiagnosis(),

            groundTruth: {
              expectedRecoveryDecision:
                "RECOMMEND_PLAYBOOK",

              expectedPlaybookId:
                "playbook-1",

              expectedAuthorization:
                true,

              expectedExecution:
                false,

              executionAuthorized:
                false,
            },

            playbookResolver:
              async () => ({
                id:
                  "playbook-1",

                version:
                  "1.0.0",

                steps: [
                  {
                    id:
                      "step-1",
                  },
                ],
              }),
          });


        expect(
          recoveryCalls
            .length
        )
          .toBe(
            1
          );


        expect(
          recoveryCalls[0]
            .input
            .executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          authorizationCalls
            .length
        )
          .toBe(
            1
          );


        expect(
          authorizationCalls[0]
            .input
            .recoveryDecisionId
        )
          .toBe(
            "recovery-1"
          );


        expect(
          authorizationCalls[0]
            .input
            .selectedCandidateId
        )
          .toBe(
            "candidate-1"
          );


        expect(
          authorizationCalls[0]
            .input
            .selectedPlaybookId
        )
          .toBe(
            "playbook-1"
          );


        expect(
          authorizationCalls[0]
            .input
            .executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          result.executionObserved
        )
          .toBe(
            false
          );
      }
    );


    test(
      "does not invoke authorization for NO_SAFE_ACTION",
      async () => {
        const recoveryDecisionEngine = {
          async decide() {
            return buildRecoveryEngineResult({
              decision: {
                decision:
                  "NO_SAFE_ACTION",

                selectedCandidateId:
                  null,

                selectedPlaybookId:
                  null,
              },

              selectedCandidate:
                null,
            });
          },
        };


        let authorizationCalled =
          false;


        const executionAuthorizationEngine = {
          async authorize() {
            authorizationCalled =
              true;

            throw new Error(
              "should not be called"
            );
          },
        };


        const service =
          new RecoveryExecutionExperimentService({
            recoveryDecisionEngine,

            executionAuthorizationEngine,

            evaluator:
              buildEvaluatorStub(),
          });


        const result =
          await service.run({
            experimentRunId:
              "run-2",

            organizationId:
              "org",

            environmentId:
              "env",

            incident: {
              _id:
                "incident-1",
            },

            diagnosis:
              buildDiagnosis(),

            groundTruth: {
              allowAnySafeRefusal:
                true,

              expectedAuthorization:
                false,

              expectedExecution:
                false,

              executionAuthorized:
                false,
            },
          });


        expect(
          authorizationCalled
        )
          .toBe(
            false
          );


        expect(
          result
            .authorizationEligibility
            .eligible
        )
          .toBe(
            false
          );


        expect(
          result
            .authorizationResult
        )
          .toBeNull();
      }
    );


    test(
      "does not invoke authorization when selection is incomplete",
      async () => {
        const recoveryDecisionEngine = {
          async decide() {
            return buildRecoveryEngineResult({
              decision: {
                decision:
                  "RECOMMEND_PLAYBOOK",

                selectedCandidateId:
                  null,
              },

              selectedCandidate:
                null,
            });
          },
        };


        let authorizationCalled =
          false;


        const service =
          new RecoveryExecutionExperimentService({
            recoveryDecisionEngine,

            executionAuthorizationEngine: {
              async authorize() {
                authorizationCalled =
                  true;

                return {};
              },
            },

            evaluator:
              buildEvaluatorStub(),
          });


        const result =
          await service.run({
            experimentRunId:
              "run-3",

            organizationId:
              "org",

            environmentId:
              "env",

            incident: {
              _id:
                "incident-1",
            },

            diagnosis:
              buildDiagnosis(),

            groundTruth: {
              expectedAuthorization:
                false,

              expectedExecution:
                false,

              executionAuthorized:
                false,
            },
          });


        expect(
          authorizationCalled
        )
          .toBe(
            false
          );


        expect(
          result
            .authorizationEligibility
            .reason
        )
          .toBe(
            "RECOVERY_SELECTION_INCOMPLETE"
          );
      }
    );


    test(
      "rejects recovery authority leakage",
      async () => {
        const service =
          new RecoveryExecutionExperimentService({
            recoveryDecisionEngine: {
              async decide() {
                return buildRecoveryEngineResult({
                  decision: {
                    executionAuthorized:
                      true,
                  },
                });
              },
            },

            evaluator:
              buildEvaluatorStub(),
          });


        await expect(
          service.run({
            experimentRunId:
              "run-4",

            organizationId:
              "org",

            environmentId:
              "env",

            incident: {
              _id:
                "incident-1",
            },

            diagnosis:
              buildDiagnosis(),

            groundTruth: {
              expectedAuthorization:
                false,

              expectedExecution:
                false,

              executionAuthorized:
                false,
            },
          })
        )
          .rejects
          .toMatchObject({
            code:
              "PHASE21_RECOVERY_AUTHORITY_LEAK",
          });
      }
    );


    test(
      "rejects evaluator ground truth in diagnosis",
      async () => {
        const service =
          new RecoveryExecutionExperimentService({
            recoveryDecisionEngine: {
              async decide() {
                return buildRecoveryEngineResult();
              },
            },

            evaluator:
              buildEvaluatorStub(),
          });


        await expect(
          service.run({
            experimentRunId:
              "run-5",

            organizationId:
              "org",

            environmentId:
              "env",

            incident: {
              _id:
                "incident-1",
            },

            diagnosis:
              buildDiagnosis({
                expectedFailureMode:
                  "kubernetes.pod.crash",
              }),

            groundTruth: {
              expectedAuthorization:
                false,

              expectedExecution:
                false,

              executionAuthorized:
                false,
            },
          })
        )
          .rejects
          .toMatchObject({
            code:
              "PHASE21_GROUND_TRUTH_LEAK",
          });
      }
    );


    test(
      "authorization engine may authorize but may not execute",
      async () => {
        const service =
          new RecoveryExecutionExperimentService({
            recoveryDecisionEngine: {
              async decide() {
                return buildRecoveryEngineResult();
              },
            },

            executionAuthorizationEngine: {
              async authorize() {
                return {
                  authorizationGranted:
                    true,

                  executionStarted:
                    true,

                  authorization: {
                    authorizationId:
                      "auth-unsafe",

                    decision:
                      "AUTHORIZED",
                  },
                };
              },
            },

            evaluator:
              buildEvaluatorStub(),
          });


        await expect(
          service.run({
            experimentRunId:
              "run-6",

            organizationId:
              "org",

            environmentId:
              "env",

            incident: {
              _id:
                "incident-1",
            },

            diagnosis:
              buildDiagnosis(),

            groundTruth: {
              expectedAuthorization:
                true,

              expectedExecution:
                false,

              executionAuthorized:
                false,
            },

            playbookResolver:
              async () => ({
                id:
                  "playbook-1",

                steps: [
                  {
                    id:
                      "step-1",
                  },
                ],
              }),
          })
        )
          .rejects
          .toMatchObject({
            code:
              "PHASE21_AUTHORIZATION_EXECUTED",
          });
      }
    );
    test(
  "records canonical diagnosis safety refusal instead of failing experiment",
  async () => {
    let authorizationCalled =
      false;


    const service =
      new RecoveryExecutionExperimentService({
        recoveryDecisionEngine: {
          async decide() {
            throw Object.assign(
              new Error(
                "Recovery decision cannot start because diagnosis safety gate did not allow evaluation"
              ),
              {
                code:
                  "RECOVERY_DECISION_DIAGNOSIS_NOT_ELIGIBLE",
              }
            );
          },
        },

        executionAuthorizationEngine: {
          async authorize() {
            authorizationCalled =
              true;

            throw new Error(
              "authorization must not run"
            );
          },
        },

        evaluator:
          buildEvaluatorStub(),
      });


    const result =
      await service.run({
        experimentRunId:
          "run-refusal-1",

        organizationId:
          "org",

        environmentId:
          "env",

        incident: {
          _id:
            "incident-1",
        },

        diagnosis:
          buildDiagnosis({
            safetyGate: {
              decision:
                "HOLD_FOR_MORE_EVIDENCE",
            },

            recommendedNextStep: {
              type:
                "COLLECT_MORE_EVIDENCE",
            },
          }),

        groundTruth: {
          allowAnySafeRefusal:
            true,

          expectedAuthorization:
            false,

          expectedExecution:
            false,

          executionAuthorized:
            false,
        },
      });


    expect(
      result
        .recoveryBoundaryRefused
    )
      .toBe(
        true
      );


    expect(
      result
        .recoverySelectionStarted
    )
      .toBe(
        false
      );


    expect(
      result
        .recoveryDecision
        .decision
    )
      .toBe(
        "COLLECT_MORE_EVIDENCE"
      );


    expect(
      result
        .recoveryDecision
        .boundaryRefusal
    )
      .toBe(
        true
      );


    expect(
      authorizationCalled
    )
      .toBe(
        false
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
  "maps canonical manual-review boundary to manual intervention",
  async () => {
    const service =
      new RecoveryExecutionExperimentService({
        recoveryDecisionEngine: {
          async decide() {
            throw Object.assign(
              new Error(
                "Diagnosis does not request playbook evaluation"
              ),
              {
                code:
                  "RECOVERY_DECISION_NEXT_STEP_INVALID",
              }
            );
          },
        },

        evaluator:
          buildEvaluatorStub(),
      });


    const result =
      await service.run({
        experimentRunId:
          "run-refusal-2",

        organizationId:
          "org",

        environmentId:
          "env",

        incident: {
          _id:
            "incident-1",
        },

        diagnosis:
          buildDiagnosis({
            safetyGate: {
              decision:
                "MANUAL_REVIEW",
            },

            recommendedNextStep: {
              type:
                "MANUAL_INVESTIGATION",
            },
          }),

        groundTruth: {
          allowAnySafeRefusal:
            true,

          expectedAuthorization:
            false,

          expectedExecution:
            false,

          executionAuthorized:
            false,
        },
      });


    expect(
      result
        .recoveryDecision
        .decision
    )
      .toBe(
        "MANUAL_INTERVENTION"
      );


    expect(
      result
        .authorizationResult
    )
      .toBeNull();


    expect(
      result
        .recoveryBoundaryRefused
    )
      .toBe(
        true
      );
  }
);


test(
  "does not swallow genuine recovery engine failures",
  async () => {
    const service =
      new RecoveryExecutionExperimentService({
        recoveryDecisionEngine: {
          async decide() {
            throw Object.assign(
              new Error(
                "PostgreSQL unavailable"
              ),
              {
                code:
                  "POSTGRES_UNAVAILABLE",
              }
            );
          },
        },

        evaluator:
          buildEvaluatorStub(),
      });


    await expect(
      service.run({
        experimentRunId:
          "run-refusal-3",

        organizationId:
          "org",

        environmentId:
          "env",

        incident: {
          _id:
            "incident-1",
        },

        diagnosis:
          buildDiagnosis(),

        groundTruth: {
          expectedAuthorization:
            false,

          expectedExecution:
            false,

          executionAuthorized:
            false,
        },
      })
    )
      .rejects
      .toMatchObject({
        code:
          "POSTGRES_UNAVAILABLE",
      });
  }
);
  }
);