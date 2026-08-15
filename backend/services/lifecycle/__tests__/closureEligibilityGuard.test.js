"use strict";

const {
  ClosureEligibilityGuard,
} =
  require(
    "../closureEligibilityGuard"
  );

const {
  CLOSURE_DECISION,
  STABILITY_RESULT,
  INCIDENT_LIFECYCLE_STATE,
} =
  require(
    "../incidentLifecycleContracts"
  );

function recoveredVerification(
  overrides = {}
) {
  return {
    decision:
      "RECOVERED",

    recovered:
      true,

    criticResult: {
      accepted:
        true,

      rejected:
        false,

      requiresManualReview:
        false,

      recoveryConfirmed:
        true,
    },

    evidencePackage: {
      required: {
        planned:
          4,

        passed:
          4,

        failed:
          0,

        missing:
          0,

        inconclusive:
          0,
      },

      hasConflicts:
        false,
    },

    routingResult: {
      route:
        "CLOSE_INCIDENT",
    },

    ...overrides,
  };
}

describe(
  "ClosureEligibilityGuard",
  () => {
    test(
      "recovered verification must wait for stability",
      () => {
        const guard =
          new ClosureEligibilityGuard();

        const result =
          guard.evaluate({
            verification:
              recoveredVerification(),
          });

        expect(
          result.decision
        )
          .toBe(
            CLOSURE_DECISION
              .WAIT_FOR_STABILITY
          );

        expect(
          result.nextState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .STABILITY_OBSERVATION
          );

        expect(
          result.incidentClosed
        )
          .toBe(
            false
          );
      }
    );

    test(
      "stable completed observation becomes eligible",
      () => {
        const guard =
          new ClosureEligibilityGuard();

        const result =
          guard.evaluate({
            verification:
              recoveredVerification(),

            stabilityResult: {
              result:
                STABILITY_RESULT
                  .STABLE,

              completed:
                true,
            },
          });

        expect(
          result.decision
        )
          .toBe(
            CLOSURE_DECISION
              .ELIGIBLE
          );

        expect(
          result.eligible
        )
          .toBe(
            true
          );

        expect(
          result.nextState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .RESOLVED
          );
      }
    );

    test(
      "unstable observation blocks closure and marks regression",
      () => {
        const guard =
          new ClosureEligibilityGuard();

        const result =
          guard.evaluate({
            verification:
              recoveredVerification(),

            stabilityResult: {
              result:
                STABILITY_RESULT
                  .UNSTABLE,

              completed:
                true,
            },
          });

        expect(
          result.decision
        )
          .toBe(
            CLOSURE_DECISION
              .BLOCKED
          );

        expect(
          result.nextState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .REGRESSED
          );
      }
    );

    test(
      "incomplete stability window continues waiting",
      () => {
        const guard =
          new ClosureEligibilityGuard();

        const result =
          guard.evaluate({
            verification:
              recoveredVerification(),

            stabilityResult: {
              result:
                STABILITY_RESULT
                  .STABLE,

              completed:
                false,
            },
          });

        expect(
          result.decision
        )
          .toBe(
            CLOSURE_DECISION
              .WAIT_FOR_STABILITY
          );
      }
    );

    test(
      "non recovered verification cannot close",
      () => {
        const guard =
          new ClosureEligibilityGuard();

        const result =
          guard.evaluate({
            verification:
              recoveredVerification({
                decision:
                  "NOT_RECOVERED",

                recovered:
                  false,
              }),
          });

        expect(
          result.decision
        )
          .toBe(
            CLOSURE_DECISION
              .NOT_ELIGIBLE
          );

        expect(
          result.eligible
        )
          .toBe(
            false
          );
      }
    );

    test(
      "critic rejection blocks closure",
      () => {
        const guard =
          new ClosureEligibilityGuard();

        const verification =
          recoveredVerification();

        verification
          .criticResult = {
          accepted:
            false,

          rejected:
            true,

          recoveryConfirmed:
            false,
        };

        const result =
          guard.evaluate({
            verification,
          });

        expect(
          result.decision
        )
          .toBe(
            CLOSURE_DECISION
              .BLOCKED
          );

        expect(
          result.nextState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .MANUAL_INTERVENTION
          );
      }
    );

    test(
      "manual review blocks closure",
      () => {
        const guard =
          new ClosureEligibilityGuard();

        const verification =
          recoveredVerification();

        verification
          .criticResult
          .requiresManualReview =
          true;

        const result =
          guard.evaluate({
            verification,
          });

        expect(
          result.blocked
        )
          .toBe(
            true
          );
      }
    );

    test(
      "failed required evidence blocks closure",
      () => {
        const guard =
          new ClosureEligibilityGuard();

        const verification =
          recoveredVerification();

        verification
          .evidencePackage
          .required
          .failed =
          1;

        const result =
          guard.evaluate({
            verification,
          });

        expect(
          result.decision
        )
          .toBe(
            CLOSURE_DECISION
              .BLOCKED
          );
      }
    );

    test(
      "missing required evidence prevents closure",
      () => {
        const guard =
          new ClosureEligibilityGuard();

        const verification =
          recoveredVerification();

        verification
          .evidencePackage
          .required
          .missing =
          1;

        const result =
          guard.evaluate({
            verification,
          });

        expect(
          result.decision
        )
          .toBe(
            CLOSURE_DECISION
              .NOT_ELIGIBLE
          );
      }
    );

    test(
      "conflicting evidence blocks closure",
      () => {
        const guard =
          new ClosureEligibilityGuard();

        const verification =
          recoveredVerification();

        verification
          .evidencePackage
          .hasConflicts =
          true;

        const result =
          guard.evaluate({
            verification,
          });

        expect(
          result.decision
        )
          .toBe(
            CLOSURE_DECISION
              .BLOCKED
          );
      }
    );

    test(
      "rollback route prevents closure",
      () => {
        const guard =
          new ClosureEligibilityGuard();

        const verification =
          recoveredVerification();

        verification
          .routingResult
          .route =
          "REQUEST_ROLLBACK";

        const result =
          guard.evaluate({
            verification,
          });

        expect(
          result.blocked
        )
          .toBe(
            true
          );
      }
    );

    test(
      "retry route prevents closure",
      () => {
        const guard =
          new ClosureEligibilityGuard();

        const verification =
          recoveredVerification();

        verification
          .routingResult
          .route =
          "REQUEST_RETRY";

        const result =
          guard.evaluate({
            verification,
          });

        expect(
          result.blocked
        )
          .toBe(
            true
          );
      }
    );

    test(
      "expired stability observation is not closure eligible",
      () => {
        const guard =
          new ClosureEligibilityGuard();

        const result =
          guard.evaluate({
            verification:
              recoveredVerification(),

            stabilityResult: {
              result:
                STABILITY_RESULT
                  .EXPIRED,

              completed:
                true,
            },
          });

        expect(
          result.decision
        )
          .toBe(
            CLOSURE_DECISION
              .NOT_ELIGIBLE
          );
      }
    );

    test(
      "never closes incident directly",
      () => {
        const guard =
          new ClosureEligibilityGuard();

        const result =
          guard.evaluate({
            verification:
              recoveredVerification(),

            stabilityResult: {
              result:
                STABILITY_RESULT
                  .STABLE,

              completed:
                true,
            },
          });

        expect(
          result.incidentClosed
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
      "rejects execution authorization input",
      () => {
        const guard =
          new ClosureEligibilityGuard();

        expect(
          () =>
            guard.evaluate({
              verification:
                recoveredVerification(),

              executionAuthorized:
                true,
            })
        )
          .toThrow(
            "cannot authorize execution"
          );
      }
    );
  }
);