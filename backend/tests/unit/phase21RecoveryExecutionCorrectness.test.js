"use strict";

const {
  RecoveryExecutionCorrectnessEvaluator,
} =
  require(
    "../../services/reliability/recoveryExecutionCorrectnessEvaluator"
  );


function buildRepositoryStub() {
  const assertions =
    [];

  return {
    assertions,

    async upsertAssertionResult(
      input
    ) {
      assertions.push(
        input
      );

      return input;
    },
  };
}


function buildRecoveryDecision(
  overrides = {}
) {
  return {
    decisionId:
      "recovery-decision-1",

    incidentId:
      "incident-1",

    decision:
      "RECOMMEND_PLAYBOOK",

    selectedCandidateId:
      "candidate-1",

    selectedPlaybookId:
      "playbook-kubernetes-pod-crash",

    confidence:
      0.8,

    candidates: [
      {
        candidateId:
          "candidate-1",

        playbookId:
          "playbook-kubernetes-pod-crash",

        executionAuthorized:
          false,
      },
    ],

    policyStatus:
      "ELIGIBLE",

    approvalRequired:
      false,

    approvalMode:
      "NONE",

    executionAuthorized:
      false,

    ...overrides,
  };
}


function buildAuthorizationResult(
  granted = true
) {
  if (
    granted
  ) {
    return {
      authorizationGranted:
        true,

      executionStarted:
        false,

      authorization: {
        authorizationId:
          "authorization-1",

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

        executionAuthorized:
          false,
      },
    };
  }


  return {
    authorizationGranted:
      false,

    executionStarted:
      false,

    authorization: {
      authorizationId:
        "authorization-1",

      decision:
        "BLOCKED",

      status:
        "BLOCKED",
    },

    executionPlan:
      null,
  };
}


describe(
  "Phase 21.15 + 21.16 recovery/execution correctness",
  () => {
    test(
      "passes correct recovery selection",
      async () => {
        const evaluator =
          new RecoveryExecutionCorrectnessEvaluator();

        const result =
          await evaluator.evaluate({
            experimentRunId:
              "run-1",

            recoveryDecision:
              buildRecoveryDecision(),

            authorizationResult:
              buildAuthorizationResult(
                true
              ),

            executionResult: {
              status:
                "SUCCEEDED",

              success:
                true,

              executed:
                true,

              stepResults: [
                {
                  stepId:
                    "step-1",

                  status:
                    "SUCCEEDED",
                },
              ],
            },

            groundTruth: {
              expectedRecoveryDecision:
                "RECOMMEND_PLAYBOOK",

              expectedPlaybookId:
                "playbook-kubernetes-pod-crash",

              expectedAuthorization:
                true,

              expectedExecution:
                true,

              executionAuthorized:
                false,
            },
          });


        expect(
          result
            .recoverySelection
            .correctnessAssertion
            .result
        )
          .toBe(
            "PASS"
          );

        expect(
          result
            .authorization
            .result
        )
          .toBe(
            "PASS"
          );

        expect(
          result
            .executionCorrectness
            .result
        )
          .toBe(
            "PASS"
          );

        expect(
          result.overall
        )
          .toBe(
            "PASS"
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
      "fails incorrect playbook selection",
      async () => {
        const evaluator =
          new RecoveryExecutionCorrectnessEvaluator();

        const result =
          await evaluator.evaluate({
            experimentRunId:
              "run-2",

            recoveryDecision:
              buildRecoveryDecision({
                selectedPlaybookId:
                  "wrong-playbook",
              }),

            authorizationResult:
              null,

            executionResult:
              null,

            groundTruth: {
              expectedRecoveryDecision:
                "RECOMMEND_PLAYBOOK",

              expectedPlaybookId:
                "playbook-kubernetes-pod-crash",

              expectedAuthorization:
                false,

              expectedExecution:
                false,
            },
          });


        expect(
          result
            .recoverySelection
            .correctnessAssertion
            .result
        )
          .toBe(
            "FAIL"
          );

        expect(
          result.overall
        )
          .toBe(
            "FAIL"
          );
      }
    );


    test(
      "treats correct safe refusal as PASS",
      async () => {
        const evaluator =
          new RecoveryExecutionCorrectnessEvaluator();

        const result =
          await evaluator.evaluate({
            experimentRunId:
              "run-3",

            recoveryDecision:
              buildRecoveryDecision({
                decision:
                  "NO_SAFE_ACTION",

                selectedCandidateId:
                  null,

                selectedPlaybookId:
                  null,
              }),

            authorizationResult:
              buildAuthorizationResult(
                false
              ),

            executionResult:
              null,

            groundTruth: {
              allowAnySafeRefusal:
                true,

              expectedAuthorization:
                false,

              expectedExecution:
                false,
            },
          });


        expect(
          result
            .recoverySelection
            .correctnessAssertion
            .result
        )
          .toBe(
            "PASS"
          );

        expect(
          result
            .authorization
            .result
        )
          .toBe(
            "PASS"
          );

        expect(
          result
            .executionCorrectness
            .result
        )
          .toBe(
            "PASS"
          );
      }
    );


    test(
      "passes approval-required non execution",
      async () => {
        const evaluator =
          new RecoveryExecutionCorrectnessEvaluator();

        const result =
          await evaluator.evaluate({
            experimentRunId:
              "run-4",

            recoveryDecision:
              buildRecoveryDecision({
                decision:
                  "REQUIRE_APPROVAL",

                approvalRequired:
                  true,

                approvalMode:
                  "HUMAN",
              }),

            authorizationResult:
              buildAuthorizationResult(
                false
              ),

            executionResult:
              null,

            groundTruth: {
              expectedRecoveryDecision:
                "REQUIRE_APPROVAL",

              expectedPlaybookId:
                "playbook-kubernetes-pod-crash",

              expectedAuthorization:
                false,

              expectedExecution:
                false,
            },
          });


        expect(
          result
            .recoverySelection
            .correctnessAssertion
            .result
        )
          .toBe(
            "PASS"
          );

        expect(
          result
            .authorization
            .result
        )
          .toBe(
            "PASS"
          );

        expect(
          result
            .executionSafety
            .result
        )
          .toBe(
            "PASS"
          );
      }
    );


    test(
      "fails execution without canonical authorization",
      async () => {
        const evaluator =
          new RecoveryExecutionCorrectnessEvaluator();

        const result =
          await evaluator.evaluate({
            experimentRunId:
              "run-5",

            recoveryDecision:
              buildRecoveryDecision(),

            authorizationResult:
              buildAuthorizationResult(
                false
              ),

            executionResult: {
              status:
                "SUCCEEDED",

              success:
                true,

              executed:
                true,
            },

            groundTruth: {
              expectedRecoveryDecision:
                "RECOMMEND_PLAYBOOK",

              expectedPlaybookId:
                "playbook-kubernetes-pod-crash",

              expectedAuthorization:
                false,

              expectedExecution:
                false,
            },
          });


        expect(
          result
            .executionSafety
            .result
        )
          .toBe(
            "FAIL"
          );

        expect(
          result.overall
        )
          .toBe(
            "FAIL"
          );
      }
    );


    test(
      "rejects authority leak from recovery decision",
      async () => {
        const evaluator =
          new RecoveryExecutionCorrectnessEvaluator();

        const result =
          await evaluator.evaluate({
            experimentRunId:
              "run-6",

            recoveryDecision:
              buildRecoveryDecision({
                executionAuthorized:
                  true,
              }),

            authorizationResult:
              null,

            executionResult:
              null,

            groundTruth: {
              expectedAuthorization:
                false,

              expectedExecution:
                false,
            },
          });


        expect(
          result
            .recoverySafety
            .result
        )
          .toBe(
            "FAIL"
          );

        expect(
          result.overall
        )
          .toBe(
            "FAIL"
          );
      }
    );


    test(
      "rejects authority leak from candidate",
      async () => {
        const evaluator =
          new RecoveryExecutionCorrectnessEvaluator();

        const result =
          await evaluator.evaluate({
            experimentRunId:
              "run-7",

            recoveryDecision:
              buildRecoveryDecision({
                candidates: [
                  {
                    candidateId:
                      "candidate-1",

                    playbookId:
                      "playbook-kubernetes-pod-crash",

                    executionAuthorized:
                      true,
                  },
                ],
              }),

            authorizationResult:
              null,

            executionResult:
              null,

            groundTruth: {
              expectedAuthorization:
                false,

              expectedExecution:
                false,
            },
          });


        expect(
          result
            .recoverySafety
            .result
        )
          .toBe(
            "FAIL"
          );
      }
    );


    test(
      "authorization engine must not claim it started execution",
      async () => {
        const evaluator =
          new RecoveryExecutionCorrectnessEvaluator();

        const authorizationResult =
          buildAuthorizationResult(
            true
          );

        authorizationResult
          .executionStarted =
          true;


        const result =
          await evaluator.evaluate({
            experimentRunId:
              "run-8",

            recoveryDecision:
              buildRecoveryDecision(),

            authorizationResult,

            executionResult:
              null,

            groundTruth: {
              expectedAuthorization:
                true,

              expectedExecution:
                false,
            },
          });


        expect(
          result
            .executionSafety
            .result
        )
          .toBe(
            "FAIL"
          );
      }
    );


    test(
      "persists non-authorizing assertions",
      async () => {
        const repository =
          buildRepositoryStub();

        const evaluator =
          new RecoveryExecutionCorrectnessEvaluator({
            repository,
          });


        await evaluator.evaluate({
          experimentRunId:
            "run-9",

          recoveryDecision:
            buildRecoveryDecision({
              decision:
                "NO_SAFE_ACTION",

              selectedCandidateId:
                null,

              selectedPlaybookId:
                null,
            }),

          authorizationResult:
            buildAuthorizationResult(
              false
            ),

          executionResult:
            null,

          groundTruth: {
            allowAnySafeRefusal:
              true,

            expectedAuthorization:
              false,

            expectedExecution:
              false,
          },
        });


        expect(
          repository
            .assertions
            .length
        )
          .toBe(
            6
          );


        for (
          const assertion
          of repository.assertions
        ) {
          expect(
            assertion
              .executionAuthorized
          )
            .toBe(
              false
            );

          expect(
            assertion
              .details
              .productionCertified
          )
            .toBe(
              false
            );
        }
      }
    );


    test(
      "evaluator ground truth cannot authorize execution",
      async () => {
        const evaluator =
          new RecoveryExecutionCorrectnessEvaluator();

        await expect(
          evaluator.evaluate({
            experimentRunId:
              "run-10",

            recoveryDecision:
              null,

            groundTruth: {
              executionAuthorized:
                true,
            },
          })
        )
          .rejects
          .toMatchObject({
            code:
              "PHASE21_GROUND_TRUTH_AUTHORITY_FORBIDDEN",
          });
      }
    );
  }
);

