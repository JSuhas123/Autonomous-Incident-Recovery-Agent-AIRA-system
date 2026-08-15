"use strict";

const {
  RecoveryOutcomeRoutingService,
  RECOVERY_ROUTE,
  RECOVERY_ROUTE_STATUS,
} =
  require(
    "../recoveryOutcomeRoutingService"
  );

const {
  VERIFICATION_DECISION,
  VERIFICATION_NEXT_ACTION,
} =
  require(
    "../verificationContracts"
  );

function critic(
  overrides = {}
) {
  return {
    criticDecision:
      "ACCEPT",

    accepted:
      true,

    rejected:
      false,

    requiresManualReview:
      false,

    recoveryConfirmed:
      false,

    violations:
      [],

    warnings:
      [],

    executionAuthorized:
      false,

    ...overrides,
  };
}

function decision(
  overrides = {}
) {
  return {
    verificationId:
      "verification-1",

    decision:
      VERIFICATION_DECISION
        .RECOVERED,

    nextAction:
      VERIFICATION_NEXT_ACTION
        .CLOSE_INCIDENT,

    executionAuthorized:
      false,

    ...overrides,
  };
}

function baseInput(
  overrides = {}
) {
  return {
    decisionResult:
      decision(),

    criticResult:
      critic({
        recoveryConfirmed:
          true,
      }),

    rollbackAvailable:
      true,

    retryAllowed:
      true,

    recoveryAttempt:
      1,

    maxRecoveryAttempts:
      3,

    retryBlocked:
      false,

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "RecoveryOutcomeRoutingService",
  () => {
    test(
      "routes confirmed recovery to incident closure",
      () => {
        const service =
          new RecoveryOutcomeRoutingService();

        const result =
          service.route(
            baseInput()
          );

        expect(
          result.route
        )
          .toBe(
            RECOVERY_ROUTE
              .CLOSE_INCIDENT
          );

        expect(
          result.status
        )
          .toBe(
            RECOVERY_ROUTE_STATUS
              .READY
          );

        expect(
          result.ready
        )
          .toBe(
            true
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
      "recovered decision without critic confirmation is blocked",
      () => {
        const service =
          new RecoveryOutcomeRoutingService();

        const result =
          service.route(
            baseInput({
              criticResult:
                critic({
                  recoveryConfirmed:
                    false,
                }),
            })
          );

        expect(
          result.route
        )
          .toBe(
            RECOVERY_ROUTE
              .BLOCKED
          );
      }
    );

    test(
      "critic rejection blocks all routing",
      () => {
        const service =
          new RecoveryOutcomeRoutingService();

        const result =
          service.route(
            baseInput({
              criticResult:
                critic({
                  accepted:
                    false,

                  rejected:
                    true,

                  recoveryConfirmed:
                    false,

                  violations: [
                    "Evidence mismatch.",
                  ],
                }),
            })
          );

        expect(
          result.route
        )
          .toBe(
            RECOVERY_ROUTE
              .BLOCKED
          );

        expect(
          result.blocked
        )
          .toBe(
            true
          );
      }
    );

    test(
      "critic manual review routes to operator",
      () => {
        const service =
          new RecoveryOutcomeRoutingService();

        const result =
          service.route(
            baseInput({
              criticResult:
                critic({
                  accepted:
                    false,

                  requiresManualReview:
                    true,

                  recoveryConfirmed:
                    false,
                }),
            })
          );

        expect(
          result.route
        )
          .toBe(
            RECOVERY_ROUTE
              .MANUAL_INTERVENTION
          );

        expect(
          result.requiresOperator
        )
          .toBe(
            true
          );
      }
    );

    test(
      "partial recovery continues monitoring",
      () => {
        const service =
          new RecoveryOutcomeRoutingService();

        const result =
          service.route(
            baseInput({
              decisionResult:
                decision({
                  decision:
                    VERIFICATION_DECISION
                      .PARTIALLY_RECOVERED,

                  nextAction:
                    VERIFICATION_NEXT_ACTION
                      .CONTINUE_MONITORING,
                }),

              criticResult:
                critic({
                  recoveryConfirmed:
                    false,
                }),
            })
          );

        expect(
          result.route
        )
          .toBe(
            RECOVERY_ROUTE
              .CONTINUE_MONITORING
          );
      }
    );

    test(
      "regression requests rollback when available",
      () => {
        const service =
          new RecoveryOutcomeRoutingService();

        const result =
          service.route(
            baseInput({
              decisionResult:
                decision({
                  decision:
                    VERIFICATION_DECISION
                      .REGRESSED,

                  nextAction:
                    VERIFICATION_NEXT_ACTION
                      .ROLLBACK,
                }),

              criticResult:
                critic(),

              rollbackAvailable:
                true,
            })
          );

        expect(
          result.route
        )
          .toBe(
            RECOVERY_ROUTE
              .REQUEST_ROLLBACK
          );

        expect(
          result.rollbackStarted
        )
          .toBe(
            false
          );
      }
    );

    test(
      "regression escalates when rollback is unavailable",
      () => {
        const service =
          new RecoveryOutcomeRoutingService();

        const result =
          service.route(
            baseInput({
              decisionResult:
                decision({
                  decision:
                    VERIFICATION_DECISION
                      .REGRESSED,
                }),

              criticResult:
                critic(),

              rollbackAvailable:
                false,
            })
          );

        expect(
          result.route
        )
          .toBe(
            RECOVERY_ROUTE
              .ESCALATE
          );
      }
    );

    test(
      "not recovered requests rollback when recommended",
      () => {
        const service =
          new RecoveryOutcomeRoutingService();

        const result =
          service.route(
            baseInput({
              decisionResult:
                decision({
                  decision:
                    VERIFICATION_DECISION
                      .NOT_RECOVERED,

                  nextAction:
                    VERIFICATION_NEXT_ACTION
                      .ROLLBACK,
                }),

              criticResult:
                critic(),

              rollbackAvailable:
                true,
            })
          );

        expect(
          result.route
        )
          .toBe(
            RECOVERY_ROUTE
              .REQUEST_ROLLBACK
          );
      }
    );

    test(
      "not recovered requests retry when permitted",
      () => {
        const service =
          new RecoveryOutcomeRoutingService();

        const result =
          service.route(
            baseInput({
              decisionResult:
                decision({
                  decision:
                    VERIFICATION_DECISION
                      .NOT_RECOVERED,

                  nextAction:
                    VERIFICATION_NEXT_ACTION
                      .RETRY_RECOVERY,
                }),

              criticResult:
                critic(),

              retryAllowed:
                true,

              recoveryAttempt:
                1,

              maxRecoveryAttempts:
                3,
            })
          );

        expect(
          result.route
        )
          .toBe(
            RECOVERY_ROUTE
              .REQUEST_RETRY
          );

        expect(
          result.retryStarted
        )
          .toBe(
            false
          );
      }
    );

    test(
      "retry request escalates when maximum attempts reached",
      () => {
        const service =
          new RecoveryOutcomeRoutingService();

        const result =
          service.route(
            baseInput({
              decisionResult:
                decision({
                  decision:
                    VERIFICATION_DECISION
                      .NOT_RECOVERED,

                  nextAction:
                    VERIFICATION_NEXT_ACTION
                      .RETRY_RECOVERY,
                }),

              criticResult:
                critic(),

              retryAllowed:
                true,

              recoveryAttempt:
                3,

              maxRecoveryAttempts:
                3,
            })
          );

        expect(
          result.route
        )
          .toBe(
            RECOVERY_ROUTE
              .ESCALATE
          );
      }
    );

    test(
      "retry policy may explicitly block another attempt",
      () => {
        const service =
          new RecoveryOutcomeRoutingService();

        const result =
          service.route(
            baseInput({
              decisionResult:
                decision({
                  decision:
                    VERIFICATION_DECISION
                      .NOT_RECOVERED,

                  nextAction:
                    VERIFICATION_NEXT_ACTION
                      .RETRY_RECOVERY,
                }),

              criticResult:
                critic(),

              retryAllowed:
                true,

              recoveryAttempt:
                1,

              maxRecoveryAttempts:
                3,

              retryBlocked:
                true,
            })
          );

        expect(
          result.route
        )
          .toBe(
            RECOVERY_ROUTE
              .ESCALATE
          );
      }
    );

    test(
      "explicit escalation remains operator-bound",
      () => {
        const service =
          new RecoveryOutcomeRoutingService();

        const result =
          service.route(
            baseInput({
              decisionResult:
                decision({
                  decision:
                    VERIFICATION_DECISION
                      .NOT_RECOVERED,

                  nextAction:
                    VERIFICATION_NEXT_ACTION
                      .ESCALATE,
                }),

              criticResult:
                critic(),
            })
          );

        expect(
          result.route
        )
          .toBe(
            RECOVERY_ROUTE
              .ESCALATE
          );

        expect(
          result.requiresOperator
        )
          .toBe(
            true
          );
      }
    );

    test(
      "inconclusive verification requests more evidence",
      () => {
        const service =
          new RecoveryOutcomeRoutingService();

        const result =
          service.route(
            baseInput({
              decisionResult:
                decision({
                  decision:
                    VERIFICATION_DECISION
                      .INCONCLUSIVE,

                  nextAction:
                    VERIFICATION_NEXT_ACTION
                      .COLLECT_MORE_EVIDENCE,
                }),

              criticResult:
                critic(),
            })
          );

        expect(
          result.route
        )
          .toBe(
            RECOVERY_ROUTE
              .COLLECT_MORE_EVIDENCE
          );
      }
    );

    test(
      "manual review routes to manual intervention",
      () => {
        const service =
          new RecoveryOutcomeRoutingService();

        const result =
          service.route(
            baseInput({
              decisionResult:
                decision({
                  decision:
                    VERIFICATION_DECISION
                      .MANUAL_REVIEW,

                  nextAction:
                    VERIFICATION_NEXT_ACTION
                      .MANUAL_INTERVENTION,
                }),

              criticResult:
                critic(),
            })
          );

        expect(
          result.route
        )
          .toBe(
            RECOVERY_ROUTE
              .MANUAL_INTERVENTION
          );
      }
    );

    test(
      "router never executes operational action itself",
      () => {
        const service =
          new RecoveryOutcomeRoutingService();

        const result =
          service.route(
            baseInput()
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.incidentClosed
        )
          .toBe(
            false
          );

        expect(
          result.retryStarted
        )
          .toBe(
            false
          );

        expect(
          result.rollbackStarted
        )
          .toBe(
            false
          );
      }
    );

    test(
      "rejects execution authorization input",
      () => {
        const service =
          new RecoveryOutcomeRoutingService();

        expect(
          () =>
            service.route({
              ...baseInput(),

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