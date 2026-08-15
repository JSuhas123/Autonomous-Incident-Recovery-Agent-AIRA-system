"use strict";

const {
  VERIFICATION_DIMENSION,
  VERIFICATION_CHECK_STATUS,
  VERIFICATION_DECISION,
  VERIFICATION_CONFIDENCE,
  VERIFICATION_NEXT_ACTION,
  VERIFICATION_RUN_STATE,
  createVerificationCheckResult,
  createVerificationResult,
  createVerificationRun,
  assertVerificationResult,
} =
  require(
    "../verificationContracts"
  );

describe(
  "Verification Contracts",
  () => {
    test(
      "creates passing verification check",
      () => {
        const result =
          createVerificationCheckResult({
            checkId:
              "check-1",

            dimension:
              VERIFICATION_DIMENSION
                .HEALTH,

            status:
              VERIFICATION_CHECK_STATUS
                .PASSED,

            score:
              0.95,

            observedValue:
              "healthy",

            expectedValue:
              "healthy",
          });

        expect(
          result.passed
        )
          .toBe(
            true
          );

        expect(
          result.failed
        )
          .toBe(
            false
          );

        expect(
          result.score
        )
          .toBe(
            0.95
          );
      }
    );

    test(
      "failed check is represented correctly",
      () => {
        const result =
          createVerificationCheckResult({
            dimension:
              VERIFICATION_DIMENSION
                .METRICS,

            status:
              VERIFICATION_CHECK_STATUS
                .FAILED,

            score:
              0.2,
          });

        expect(
          result.failed
        )
          .toBe(
            true
          );

        expect(
          result.passed
        )
          .toBe(
            false
          );
      }
    );

    test(
      "score is clamped between zero and one",
      () => {
        expect(
          createVerificationCheckResult({
            score:
              5,
          })
            .score
        )
          .toBe(
            1
          );

        expect(
          createVerificationCheckResult({
            score:
              -5,
          })
            .score
        )
          .toBe(
            0
          );
      }
    );

    test(
      "creates recovered verification result",
      () => {
        const check =
          createVerificationCheckResult({
            checkId:
              "health",

            dimension:
              VERIFICATION_DIMENSION
                .HEALTH,

            status:
              VERIFICATION_CHECK_STATUS
                .PASSED,

            score:
              1,
          });

        const result =
          createVerificationResult({
            verificationId:
              "verify-1",

            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            executionRequestId:
              "request-1",

            decision:
              VERIFICATION_DECISION
                .RECOVERED,

            confidence:
              VERIFICATION_CONFIDENCE
                .HIGH,

            nextAction:
              VERIFICATION_NEXT_ACTION
                .CLOSE_INCIDENT,

            overallScore:
              1,

            checks: [
              check,
            ],
          });

        expect(
          result.recovered
        )
          .toBe(
            true
          );

        expect(
          result.passedCheckCount
        )
          .toBe(
            1
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
      "counts failed and inconclusive checks",
      () => {
        const result =
          createVerificationResult({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            executionRequestId:
              "request-1",

            checks: [
              createVerificationCheckResult({
                status:
                  VERIFICATION_CHECK_STATUS
                    .PASSED,
              }),

              createVerificationCheckResult({
                status:
                  VERIFICATION_CHECK_STATUS
                    .FAILED,
              }),

              createVerificationCheckResult({
                status:
                  VERIFICATION_CHECK_STATUS
                    .INCONCLUSIVE,
              }),
            ],
          });

        expect(
          result.passedCheckCount
        )
          .toBe(
            1
          );

        expect(
          result.failedCheckCount
        )
          .toBe(
            1
          );

        expect(
          result.inconclusiveCheckCount
        )
          .toBe(
            1
          );
      }
    );

    test(
      "creates verification run",
      () => {
        const run =
          createVerificationRun({
            verificationRunId:
              "run-1",

            verificationId:
              "verify-1",

            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            executionRequestId:
              "request-1",
          });

        expect(
          run.state
        )
          .toBe(
            VERIFICATION_RUN_STATE
              .CREATED
          );

        expect(
          run.attempt
        )
          .toBe(
            0
          );

        expect(
          run.maxAttempts
        )
          .toBe(
            1
          );
      }
    );

    test(
      "valid verification result passes invariant validation",
      () => {
        const result =
          createVerificationResult({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            executionRequestId:
              "request-1",

            decision:
              VERIFICATION_DECISION
                .INCONCLUSIVE,
          });

        expect(
          assertVerificationResult(
            result
          )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "verification cannot authorize execution",
      () => {
        const result =
          createVerificationResult({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            executionRequestId:
              "request-1",
          });

        result.executionAuthorized =
          true;

        expect(
          () =>
            assertVerificationResult(
              result
            )
        )
          .toThrow(
            "cannot authorize execution"
          );
      }
    );

    test(
      "recovered result cannot contain failed checks",
      () => {
        const result =
          createVerificationResult({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            executionRequestId:
              "request-1",

            decision:
              VERIFICATION_DECISION
                .RECOVERED,

            checks: [
              createVerificationCheckResult({
                status:
                  VERIFICATION_CHECK_STATUS
                    .FAILED,
              }),
            ],
          });

        expect(
          () =>
            assertVerificationResult(
              result
            )
        )
          .toThrow(
            "RECOVERED result contains failed checks"
          );
      }
    );

    test(
      "exports canonical verification enums",
      () => {
        expect(
          VERIFICATION_DIMENSION
            .LOGS
        )
          .toBe(
            "LOGS"
          );

        expect(
          VERIFICATION_DECISION
            .REGRESSED
        )
          .toBe(
            "REGRESSED"
          );

        expect(
          VERIFICATION_NEXT_ACTION
            .ROLLBACK
        )
          .toBe(
            "ROLLBACK"
          );

        expect(
          VERIFICATION_CONFIDENCE
            .HIGH
        )
          .toBe(
            "HIGH"
          );
      }
    );
  }
);