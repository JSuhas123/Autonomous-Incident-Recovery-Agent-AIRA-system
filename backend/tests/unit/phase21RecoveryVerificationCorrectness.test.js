"use strict";


const {
  RecoveryVerificationCorrectnessEvaluator,

  VERIFICATION_OUTCOME,

  NEXT_ACTION,
} =
  require(
    "../../services/reliability/recoveryVerificationCorrectnessEvaluator"
  );


describe(
  "Phase 21.17 recovery verification correctness",
  () => {
    let evaluator;


    beforeEach(
      () => {
        evaluator =
          new RecoveryVerificationCorrectnessEvaluator();
      }
    );


    function healthyInput(
      overrides = {}
    ) {
      return {
        execution: {
          executed:
            true,

          commandSucceeded:
            true,

          authorizationId:
            "auth-1",

          executionRequestId:
            "request-1",
        },

        before: {
          observed:
            true,

          independent:
            true,

          healthy:
            false,

          ready:
            false,
        },

        after: {
          observed:
            true,

          independent:
            true,

          healthy:
            true,

          ready:
            true,

          behaviorRecovered:
            true,

          dependenciesReachable:
            true,

          latencyAcceptable:
            true,
        },

        stability: {
          observed:
            true,

          stable:
            true,

          windowMs:
            30_000,
        },

        recurrence: {
          observed:
            true,

          detected:
            false,

          windowMs:
            30_000,
        },

        rollback: {
          available:
            true,

          safe:
            true,
        },

        executionAuthorized:
          false,

        productionCertified:
          false,

        ...overrides,
      };
    }


    test(
      "passes independently verified recovery",
      () => {
        const result =
          evaluator.evaluate(
            healthyInput()
          );


        expect(
          result.outcome
        )
          .toBe(
            VERIFICATION_OUTCOME
              .VERIFIED_RECOVERY
          );


        expect(
          result.recovered
        )
          .toBe(
            true
          );


        expect(
          result.recoveryConfirmed
        )
          .toBe(
            true
          );


        expect(
          result.incidentClosureEligible
        )
          .toBe(
            true
          );


        expect(
          result.nextAction
        )
          .toBe(
            NEXT_ACTION
              .NONE
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
      "command success alone does not mean recovery",
      () => {
        const input =
          healthyInput();


        input.after = {
          observed:
            true,

          independent:
            true,

          healthy:
            false,

          ready:
            false,

          behaviorRecovered:
            false,

          dependenciesReachable:
            true,

          latencyAcceptable:
            true,
        };


        const result =
          evaluator.evaluate(
            input
          );


        expect(
          result.commandSucceeded
        )
          .toBe(
            true
          );


        expect(
          result.outcome
        )
          .toBe(
            VERIFICATION_OUTCOME
              .FAILED_RECOVERY
          );


        expect(
          result.recovered
        )
          .toBe(
            false
          );


        expect(
          result.recoveryConfirmed
        )
          .toBe(
            false
          );


        expect(
          result.incidentClosureEligible
        )
          .toBe(
            false
          );
      }
    );


    test(
      "failed recovery recommends rollback when rollback is explicitly safe",
      () => {
        const input =
          healthyInput();


        input.after = {
          observed:
            true,

          independent:
            true,

          healthy:
            false,

          ready:
            false,

          behaviorRecovered:
            false,

          dependenciesReachable:
            true,

          latencyAcceptable:
            true,
        };


        const result =
          evaluator.evaluate(
            input
          );


        expect(
          result.outcome
        )
          .toBe(
            VERIFICATION_OUTCOME
              .FAILED_RECOVERY
          );


        expect(
          result.nextAction
        )
          .toBe(
            NEXT_ACTION
              .ROLLBACK_REQUIRED
          );


        expect(
          result.rollbackRequired
        )
          .toBe(
            true
          );
      }
    );


    test(
      "failed recovery escalates when rollback is unavailable",
      () => {
        const input =
          healthyInput();


        input.after = {
          observed:
            true,

          independent:
            true,

          healthy:
            false,

          ready:
            false,

          behaviorRecovered:
            false,

          dependenciesReachable:
            false,

          latencyAcceptable:
            false,
        };


        input.rollback = {
          available:
            false,

          safe:
            false,
        };


        const result =
          evaluator.evaluate(
            input
          );


        expect(
          result.nextAction
        )
          .toBe(
            NEXT_ACTION
              .ESCALATION_REQUIRED
          );


        expect(
          result.escalationRequired
        )
          .toBe(
            true
          );
      }
    );


    test(
      "incomplete evidence is inconclusive and never recovered",
      () => {
        const input =
          healthyInput();


        input.after = {
          observed:
            true,

          independent:
            true,

          healthy:
            true,

          ready:
            true,

          behaviorRecovered:
            null,

          dependenciesReachable:
            null,

          latencyAcceptable:
            null,
        };


        const result =
          evaluator.evaluate(
            input
          );


        expect(
          result.outcome
        )
          .toBe(
            VERIFICATION_OUTCOME
              .INCONCLUSIVE
          );


        expect(
          result.recovered
        )
          .toBe(
            false
          );


        expect(
          result.incidentClosureEligible
        )
          .toBe(
            false
          );


        expect(
          result.nextAction
        )
          .toBe(
            NEXT_ACTION
              .COLLECT_MORE_EVIDENCE
          );
      }
    );


    test(
      "missing independent observation prevents verified recovery",
      () => {
        const input =
          healthyInput();


        input.after = {
          ...input.after,

          independent:
            false,
        };


        const result =
          evaluator.evaluate(
            input
          );


        expect(
          result.outcome
        )
          .toBe(
            VERIFICATION_OUTCOME
              .INCONCLUSIVE
          );


        expect(
          result.recoveryConfirmed
        )
          .toBe(
            false
          );
      }
    );


    test(
      "recurrence prevents verified recovery",
      () => {
        const input =
          healthyInput();


        input.recurrence = {
          observed:
            true,

          detected:
            true,

          retrySafe:
            false,

          windowMs:
            30_000,
        };


        const result =
          evaluator.evaluate(
            input
          );


        expect(
          result.outcome
        )
          .toBe(
            VERIFICATION_OUTCOME
              .FAILED_RECOVERY
          );


        expect(
          result.recurrenceDetected
        )
          .toBe(
            true
          );


        expect(
          result.recovered
        )
          .toBe(
            false
          );
      }
    );


    test(
      "recurrence may be classified retry eligible only when explicitly safe",
      () => {
        const input =
          healthyInput();


        input.rollback = {
          available:
            false,

          safe:
            false,
        };


        input.recurrence = {
          observed:
            true,

          detected:
            true,

          retrySafe:
            true,

          windowMs:
            30_000,
        };


        const result =
          evaluator.evaluate(
            input
          );


        expect(
          result.outcome
        )
          .toBe(
            VERIFICATION_OUTCOME
              .FAILED_RECOVERY
          );


        expect(
          result.nextAction
        )
          .toBe(
            NEXT_ACTION
              .RETRY_ELIGIBLE
          );


        expect(
          result.retryEligible
        )
          .toBe(
            true
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
      "no execution cannot be treated as recovered",
      () => {
        const input =
          healthyInput();


        input.execution = {
          executed:
            false,

          commandSucceeded:
            false,
        };


        const result =
          evaluator.evaluate(
            input
          );


        expect(
          result.outcome
        )
          .toBe(
            VERIFICATION_OUTCOME
              .FAILED_RECOVERY
          );


        expect(
          result.nextAction
        )
          .toBe(
            NEXT_ACTION
              .ESCALATION_REQUIRED
          );


        expect(
          result.recovered
        )
          .toBe(
            false
          );
      }
    );


    test(
      "rejects Phase21 authority leakage",
      () => {
        expect(
          () =>
            evaluator.evaluate(
              healthyInput({
                executionAuthorized:
                  true,
              })
            )
        )
          .toThrow(
            expect.objectContaining({
              code:
                "PHASE21_VERIFICATION_AUTHORITY_LEAK",
            })
          );
      }
    );


    test(
      "rejects production certification leakage",
      () => {
        expect(
          () =>
            evaluator.evaluate(
              healthyInput({
                productionCertified:
                  true,
              })
            )
        )
          .toThrow(
            expect.objectContaining({
              code:
                "PHASE21_VERIFICATION_AUTHORITY_LEAK",
            })
          );
      }
    );


    test(
      "assertions themselves remain non-authorizing",
      () => {
        const result =
          evaluator.evaluate(
            healthyInput()
          );


        expect(
          result.assertions.length
        )
          .toBeGreaterThan(
            0
          );


        for (
          const assertion
          of result.assertions
        ) {
          expect(
            assertion.executionAuthorized
          )
            .toBe(
              false
            );
        }
      }
    );
  }
);