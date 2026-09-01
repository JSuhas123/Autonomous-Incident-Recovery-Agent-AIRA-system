"use strict";

const {
  PositiveExecutionSafetyEvaluator,
} =
  require(
    "../../services/reliability/positiveExecutionSafetyEvaluator"
  );


describe(
  "Phase 21.16 positive execution safety",
  () => {
    test(
      "passes genuine authorized successful execution",
      () => {
        const evaluator =
          new PositiveExecutionSafetyEvaluator();


        const result =
          evaluator.evaluate({
            authorizationResult: {
              authorizationGranted:
                true,

              executionStarted:
                false,

              authorization: {
                authorizationId:
                  "auth-1",
              },

              executionPlan: {
                planId:
                  "plan-1",

                planHash:
                  "hash-1",
              },
            },

            executionResult: {
              status:
                "SUCCEEDED",

              success:
                true,
            },

            integrationResult: {
              executionAuthorized:
                false,
            },
          });


        expect(
          result.result
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
      "fails execution without authorization",
      () => {
        const evaluator =
          new PositiveExecutionSafetyEvaluator();


        const result =
          evaluator.evaluate({
            authorizationResult: {
              authorizationGranted:
                false,
            },

            executionResult: {
              status:
                "SUCCEEDED",

              success:
                true,
            },
          });


        expect(
          result.result
        )
          .toBe(
            "FAIL"
          );


        expect(
          result.failures
        )
          .toContain(
            "CANONICAL_AUTHORIZATION_NOT_GRANTED"
          );
      }
    );


    test(
      "fails missing immutable plan",
      () => {
        const evaluator =
          new PositiveExecutionSafetyEvaluator();


        const result =
          evaluator.evaluate({
            authorizationResult: {
              authorizationGranted:
                true,

              executionStarted:
                false,

              authorization: {
                authorizationId:
                  "auth-1",
              },
            },

            executionResult: {
              status:
                "SUCCEEDED",

              success:
                true,
            },
          });


        expect(
          result.failures
        )
          .toContain(
            "IMMUTABLE_EXECUTION_PLAN_MISSING"
          );
      }
    );


    test(
      "fails if authorization engine executes",
      () => {
        const evaluator =
          new PositiveExecutionSafetyEvaluator();


        const result =
          evaluator.evaluate({
            authorizationResult: {
              authorizationGranted:
                true,

              executionStarted:
                true,

              authorization: {
                authorizationId:
                  "auth-1",
              },

              executionPlan: {
                planId:
                  "plan-1",

                planHash:
                  "hash-1",
              },
            },

            executionResult: {
              status:
                "SUCCEEDED",

              success:
                true,
            },
          });


        expect(
          result.failures
        )
          .toContain(
            "AUTHORIZATION_ENGINE_EXECUTED_INFRASTRUCTURE"
          );
      }
    );


    test(
      "fails Phase20 authority leakage",
      () => {
        const evaluator =
          new PositiveExecutionSafetyEvaluator();


        const result =
          evaluator.evaluate({
            authorizationResult: {
              authorizationGranted:
                true,

              executionStarted:
                false,

              authorization: {
                authorizationId:
                  "auth-1",
              },

              executionPlan: {
                planId:
                  "plan-1",

                planHash:
                  "hash-1",
              },
            },

            executionResult: {
              status:
                "SUCCEEDED",

              success:
                true,
            },

            integrationResult: {
              executionAuthorized:
                true,
            },
          });


        expect(
          result.failures
        )
          .toContain(
            "PHASE20_RESULT_LEAKED_AUTHORITY"
          );
      }
    );
  }
);