"use strict";

const {
  RegressionReopenEngine,
  REGRESSION_ACTION,
} =
  require(
    "../regressionReopenEngine"
  );

const {
  INCIDENT_LIFECYCLE_STATE,
  STABILITY_RESULT,
  ESCALATION_REASON,
} =
  require(
    "../incidentLifecycleContracts"
  );

function baseInput(
  overrides = {}
) {
  return {
    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "incident-1",

    verificationId:
      "verification-2",

    incident: {
      lifecycleState:
        INCIDENT_LIFECYCLE_STATE
          .STABILITY_OBSERVATION,
    },

    stabilityResult: {
      result:
        STABILITY_RESULT
          .UNSTABLE,

      completed:
        true,
    },

    previousVerificationResult: {
      decision:
        "RECOVERED",

      overallScore:
        0.95,
    },

    currentVerificationResult: {
      decision:
        "NOT_RECOVERED",

      overallScore:
        0.4,
    },

    retryAllowed:
      true,

    currentAttempt:
      1,

    maxAttempts:
      3,

    rollbackAvailable:
      true,

    preferRollback:
      false,

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "RegressionReopenEngine",
  () => {
    test(
      "detects unstable stability observation",
      async () => {
        const service =
          new RegressionReopenEngine();

        const result =
          await service
            .evaluate(
              baseInput()
            );

        expect(
          result.regressionDetected
        )
          .toBe(
            true
          );

        expect(
          result.signals
        )
          .toContain(
            "STABILITY_UNSTABLE"
          );
      }
    );

    test(
      "transitions incident to regressed",
      async () => {
        const service =
          new RegressionReopenEngine();

        const result =
          await service
            .evaluate(
              baseInput()
            );

        expect(
          result.transition
            .toState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .REGRESSED
          );
      }
    );

    test(
      "requests retry when attempts remain",
      async () => {
        const service =
          new RegressionReopenEngine();

        const result =
          await service
            .evaluate(
              baseInput()
            );

        expect(
          result.action
        )
          .toBe(
            REGRESSION_ACTION
              .REQUEST_RETRY
          );

        expect(
          result.retryRequested
        )
          .toBe(
            true
          );
      }
    );

    test(
      "prefers rollback when explicitly configured",
      async () => {
        const service =
          new RegressionReopenEngine();

        const result =
          await service
            .evaluate(
              baseInput({
                preferRollback:
                  true,
              })
            );

        expect(
          result.action
        )
          .toBe(
            REGRESSION_ACTION
              .REQUEST_ROLLBACK
          );
      }
    );

    test(
      "uses rollback when retries are exhausted",
      async () => {
        const service =
          new RegressionReopenEngine();

        const result =
          await service
            .evaluate(
              baseInput({
                currentAttempt:
                  3,

                maxAttempts:
                  3,

                rollbackAvailable:
                  true,
              })
            );

        expect(
          result.action
        )
          .toBe(
            REGRESSION_ACTION
              .REQUEST_ROLLBACK
          );
      }
    );

    test(
      "escalates when retry and rollback are unavailable",
      async () => {
        const service =
          new RegressionReopenEngine();

        const result =
          await service
            .evaluate(
              baseInput({
                retryAllowed:
                  false,

                rollbackAvailable:
                  false,
              })
            );

        expect(
          result.action
        )
          .toBe(
            REGRESSION_ACTION
              .ESCALATE
          );

        expect(
          result.escalationReason
        )
          .toBe(
            ESCALATION_REASON
              .STABILITY_REGRESSION
          );
      }
    );

    test(
      "detects recovered to not recovered transition",
      async () => {
        const service =
          new RegressionReopenEngine();

        const input =
          baseInput({
            stabilityResult:
              null,
          });

        const result =
          await service
            .evaluate(
              input
            );

        expect(
          result.signals
        )
          .toContain(
            "RECOVERED_TO_NOT_RECOVERED"
          );
      }
    );

    test(
      "detects material verification score drop",
      async () => {
        const service =
          new RegressionReopenEngine();

        const input =
          baseInput({
            stabilityResult:
              null,

            previousVerificationResult: {
              decision:
                "RECOVERED",

              overallScore:
                0.9,
            },

            currentVerificationResult: {
              decision:
                "PARTIALLY_RECOVERED",

              overallScore:
                0.5,
            },
          });

        const result =
          await service
            .evaluate(
              input
            );

        expect(
          result.signals
        )
          .toContain(
            "MATERIAL_SCORE_DROP"
          );
      }
    );

    test(
      "no regression returns no action",
      async () => {
        const service =
          new RegressionReopenEngine();

        const result =
          await service
            .evaluate(
              baseInput({
                stabilityResult: {
                  result:
                    STABILITY_RESULT
                      .STABLE,

                  completed:
                    true,
                },

                previousVerificationResult: {
                  decision:
                    "RECOVERED",

                  overallScore:
                    0.9,
                },

                currentVerificationResult: {
                  decision:
                    "RECOVERED",

                  overallScore:
                    0.9,
                },
              })
            );

        expect(
          result.regressionDetected
        )
          .toBe(
            false
          );

        expect(
          result.action
        )
          .toBe(
            REGRESSION_ACTION
              .NO_ACTION
          );
      }
    );

    test(
      "resolved incident may regress before final closure",
      async () => {
        const service =
          new RegressionReopenEngine();

        const result =
          await service
            .evaluate(
              baseInput({
                incident: {
                  lifecycleState:
                    INCIDENT_LIFECYCLE_STATE
                      .RESOLVED,
                },
              })
            );

        expect(
          result.transition
            .toState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .REGRESSED
          );
      }
    );

    test(
      "unexpected lifecycle state escalates safely",
      async () => {
        const service =
          new RegressionReopenEngine();

        const result =
          await service
            .evaluate(
              baseInput({
                incident: {
                  lifecycleState:
                    INCIDENT_LIFECYCLE_STATE
                      .RETRY_PENDING,
                },
              })
            );

        expect(
          result.action
        )
          .toBe(
            REGRESSION_ACTION
              .ESCALATE
          );
      }
    );

    test(
      "never directly starts retry or rollback execution",
      async () => {
        const service =
          new RegressionReopenEngine();

        const result =
          await service
            .evaluate(
              baseInput()
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
      "rejects unsafe execution authorization input",
      async () => {
        const service =
          new RegressionReopenEngine();

        await expect(
          service.evaluate(
            baseInput({
              executionAuthorized:
                true,
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "REGRESSION_UNSAFE_INPUT",
          });
      }
    );
  }
);