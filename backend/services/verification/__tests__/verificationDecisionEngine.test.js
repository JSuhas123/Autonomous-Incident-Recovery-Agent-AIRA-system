"use strict";

const {
  VerificationDecisionEngine,
} =
  require(
    "../verificationDecisionEngine"
  );

const {
  VERIFICATION_DECISION,
  VERIFICATION_CONFIDENCE,
  VERIFICATION_NEXT_ACTION,
  VERIFICATION_CHECK_STATUS,
  createVerificationCheckResult,
} =
  require(
    "../verificationContracts"
  );

function passingCheck(
  id
) {
  return createVerificationCheckResult({
    checkId:
      id,

    dimension:
      "HEALTH",

    status:
      VERIFICATION_CHECK_STATUS
        .PASSED,

    score:
      1,
  });
}

function failingCheck(
  id
) {
  return createVerificationCheckResult({
    checkId:
      id,

    dimension:
      "HEALTH",

    status:
      VERIFICATION_CHECK_STATUS
        .FAILED,

    score:
      0,
  });
}

function evidence(
  overrides = {}
) {
  const checks = [
    passingCheck(
      "health"
    ),
    passingCheck(
      "metrics"
    ),
    passingCheck(
      "logs"
    ),
    passingCheck(
      "incident"
    ),
  ];

  return {
    verificationPlanId:
      "verify-plan-1",

    verificationPlanHash:
      "verify-hash-1",

    checks,

    totals: {
      planned:
        4,

      collected:
        4,

      completed:
        4,

      passed:
        4,

      failed:
        0,

      inconclusive:
        0,
    },

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

      failures:
        [],

      missingChecks:
        [],
    },

    completeness:
      1,

    requiredCoverage:
      1,

    requiredSuccessRate:
      1,

    averageScore:
      1,

    conflicts:
      [],

    hasConflicts:
      false,

    warnings:
      [],

    complete:
      true,

    executionAuthorized:
      false,

    ...overrides,
  };
}

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

    executionRequestId:
      "request-1",

    authorizationId:
      "auth-1",

    recoveryDecisionId:
      "recovery-1",

    executionPlanId:
      "plan-1",

    executionPlanHash:
      "planhash-1",

    evidencePackage:
      evidence(),

    executionResult: {
      success:
        true,

      rollbackRequired:
        false,
    },

    rollbackAvailable:
      true,

    retryAllowed:
      true,

    recoveryAttempt:
      1,

    maxRecoveryAttempts:
      3,

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "VerificationDecisionEngine",
  () => {
    test(
      "declares fully verified system recovered",
      () => {
        const engine =
          new VerificationDecisionEngine();

        const result =
          engine.decide(
            baseInput()
          );

        expect(
          result.decision
        )
          .toBe(
            VERIFICATION_DECISION
              .RECOVERED
          );

        expect(
          result.recovered
        )
          .toBe(
            true
          );

        expect(
          result.nextAction
        )
          .toBe(
            VERIFICATION_NEXT_ACTION
              .CLOSE_INCIDENT
          );

        expect(
          result.confidence
        )
          .toBe(
            VERIFICATION_CONFIDENCE
              .HIGH
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
      "required check failure produces NOT_RECOVERED",
      () => {
        const failedEvidence =
          evidence({
            checks: [
              passingCheck(
                "health"
              ),

              failingCheck(
                "metrics"
              ),
            ],

            totals: {
              planned:
                2,

              collected:
                2,

              completed:
                2,

              passed:
                1,

              failed:
                1,

              inconclusive:
                0,
            },

            required: {
              planned:
                2,

              passed:
                1,

              failed:
                1,

              missing:
                0,

              inconclusive:
                0,

              failures: [
                {
                  checkId:
                    "metrics",
                },
              ],

              missingChecks:
                [],
            },

            requiredSuccessRate:
              0.5,

            averageScore:
              0.5,

            complete:
              true,
          });

        const engine =
          new VerificationDecisionEngine();

        const result =
          engine.decide(
            baseInput({
              evidencePackage:
                failedEvidence,
            })
          );

        expect(
          result.decision
        )
          .toBe(
            VERIFICATION_DECISION
              .NOT_RECOVERED
          );
      }
    );

    test(
      "failed recovery prefers retry when allowed",
      () => {
        const failedEvidence =
          evidence({
            checks: [
              failingCheck(
                "health"
              ),
            ],

            totals: {
              planned:
                1,

              collected:
                1,

              completed:
                1,

              passed:
                0,

              failed:
                1,

              inconclusive:
                0,
            },

            required: {
              planned:
                1,

              passed:
                0,

              failed:
                1,

              missing:
                0,

              inconclusive:
                0,

              failures: [
                {
                  checkId:
                    "health",
                },
              ],

              missingChecks:
                [],
            },

            requiredSuccessRate:
              0,

            averageScore:
              0,
          });

        const engine =
          new VerificationDecisionEngine();

        const result =
          engine.decide(
            baseInput({
              evidencePackage:
                failedEvidence,

              rollbackAvailable:
                false,

              retryAllowed:
                true,

              recoveryAttempt:
                1,

              maxRecoveryAttempts:
                3,
            })
          );

        expect(
          result.nextAction
        )
          .toBe(
            VERIFICATION_NEXT_ACTION
              .RETRY_RECOVERY
          );
      }
    );

    test(
      "failed recovery escalates after retries exhausted",
      () => {
        const failedEvidence =
          evidence({
            checks: [
              failingCheck(
                "health"
              ),
            ],

            totals: {
              planned:
                1,

              collected:
                1,

              completed:
                1,

              passed:
                0,

              failed:
                1,

              inconclusive:
                0,
            },

            required: {
              planned:
                1,

              passed:
                0,

              failed:
                1,

              missing:
                0,

              inconclusive:
                0,

              failures: [
                {
                  checkId:
                    "health",
                },
              ],

              missingChecks:
                [],
            },

            requiredSuccessRate:
              0,

            averageScore:
              0,
          });

        const engine =
          new VerificationDecisionEngine();

        const result =
          engine.decide(
            baseInput({
              evidencePackage:
                failedEvidence,

              rollbackAvailable:
                false,

              retryAllowed:
                true,

              recoveryAttempt:
                3,

              maxRecoveryAttempts:
                3,
            })
          );

        expect(
          result.nextAction
        )
          .toBe(
            VERIFICATION_NEXT_ACTION
              .ESCALATE
          );
      }
    );

    test(
      "execution failure requiring rollback returns rollback action",
      () => {
        const engine =
          new VerificationDecisionEngine();

        const result =
          engine.decide(
            baseInput({
              executionResult: {
                success:
                  false,

                changed:
                  true,

                rollbackRequired:
                  true,
              },

              rollbackAvailable:
                true,
            })
          );

        expect(
          result.decision
        )
          .toBe(
            VERIFICATION_DECISION
              .NOT_RECOVERED
          );

        expect(
          result.nextAction
        )
          .toBe(
            VERIFICATION_NEXT_ACTION
              .ROLLBACK
          );
      }
    );

    test(
      "missing required verification evidence remains inconclusive",
      () => {
        const incomplete =
          evidence({
            checks: [
              passingCheck(
                "health"
              ),
            ],

            totals: {
              planned:
                2,

              collected:
                1,

              completed:
                1,

              passed:
                1,

              failed:
                0,

              inconclusive:
                0,
            },

            required: {
              planned:
                2,

              passed:
                1,

              failed:
                0,

              missing:
                1,

              inconclusive:
                0,

              failures:
                [],

              missingChecks: [
                {
                  checkId:
                    "logs",
                },
              ],
            },

            completeness:
              0.5,

            requiredCoverage:
              0.5,

            requiredSuccessRate:
              0.5,

            averageScore:
              1,

            complete:
              false,
          });

        const engine =
          new VerificationDecisionEngine();

        const result =
          engine.decide(
            baseInput({
              evidencePackage:
                incomplete,
            })
          );

        expect(
          result.decision
        )
          .toBe(
            VERIFICATION_DECISION
              .INCONCLUSIVE
          );

        expect(
          result.nextAction
        )
          .toBe(
            VERIFICATION_NEXT_ACTION
              .COLLECT_MORE_EVIDENCE
          );
      }
    );

    test(
      "conflicting evidence requires manual review",
      () => {
        const conflicted =
          evidence({
            hasConflicts:
              true,

            conflicts: [
              {
                type:
                  "METRICS_LOGS_CONFLICT",

                message:
                  "Metrics recovered but logs continue failing.",
              },
            ],
          });

        const engine =
          new VerificationDecisionEngine();

        const result =
          engine.decide(
            baseInput({
              evidencePackage:
                conflicted,
            })
          );

        expect(
          result.decision
        )
          .toBe(
            VERIFICATION_DECISION
              .MANUAL_REVIEW
          );

        expect(
          result.nextAction
        )
          .toBe(
            VERIFICATION_NEXT_ACTION
              .MANUAL_INTERVENTION
          );

        expect(
          result.confidence
        )
          .toBe(
            VERIFICATION_CONFIDENCE
              .LOW
          );
      }
    );

    test(
      "partial recovery is detected",
      () => {
        const partial =
          evidence({
            checks: [
              passingCheck(
                "health"
              ),

              createVerificationCheckResult({
                checkId:
                  "logs",

                dimension:
                  "LOGS",

                status:
                  VERIFICATION_CHECK_STATUS
                    .INCONCLUSIVE,

                score:
                  0.6,
              }),
            ],

            totals: {
              planned:
                2,

              collected:
                2,

              completed:
                2,

              passed:
                1,

              failed:
                0,

              inconclusive:
                1,
            },

            required: {
              planned:
                2,

              passed:
                1,

              failed:
                0,

              missing:
                0,

              inconclusive:
                1,

              failures:
                [],

              missingChecks:
                [],
            },

            completeness:
              1,

            requiredCoverage:
              1,

            requiredSuccessRate:
              0.5,

            averageScore:
              0.8,

            complete:
              true,
          });

        const engine =
          new VerificationDecisionEngine();

        const result =
          engine.decide(
            baseInput({
              evidencePackage:
                partial,
            })
          );

        expect(
          result.decision
        )
          .toBe(
            VERIFICATION_DECISION
              .INCONCLUSIVE
          );

        expect(
          result.nextAction
        )
          .toBe(
            VERIFICATION_NEXT_ACTION
              .COLLECT_MORE_EVIDENCE
          );
      }
    );

    test(
      "optional failures may produce partial recovery",
      () => {
        const partial =
          evidence({
            checks: [
              passingCheck(
                "health"
              ),

              failingCheck(
                "optional-logs"
              ),
            ],

            totals: {
              planned:
                2,

              collected:
                2,

              completed:
                2,

              passed:
                1,

              failed:
                1,

              inconclusive:
                0,
            },

            required: {
              planned:
                1,

              passed:
                1,

              failed:
                0,

              missing:
                0,

              inconclusive:
                0,

              failures:
                [],

              missingChecks:
                [],
            },

            completeness:
              1,

            requiredCoverage:
              1,

            requiredSuccessRate:
              1,

            averageScore:
              0.6,

            complete:
              true,
          });

        const engine =
          new VerificationDecisionEngine();

        const result =
          engine.decide(
            baseInput({
              evidencePackage:
                partial,
            })
          );

        expect(
          result.decision
        )
          .toBe(
            VERIFICATION_DECISION
              .PARTIALLY_RECOVERED
          );

        expect(
          result.nextAction
        )
          .toBe(
            VERIFICATION_NEXT_ACTION
              .CONTINUE_MONITORING
          );
      }
    );

    test(
      "material score regression produces REGRESSED",
      () => {
        const engine =
          new VerificationDecisionEngine();

        const currentEvidence =
          evidence({
            averageScore:
              0.4,

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

              failures:
                [],

              missingChecks:
                [],
            },

            requiredSuccessRate:
              1,
          });

        const result =
          engine.decide(
            baseInput({
              evidencePackage:
                currentEvidence,

              previousVerificationResult: {
                overallScore:
                  0.9,
              },
            })
          );

        expect(
          result.decision
        )
          .toBe(
            VERIFICATION_DECISION
              .REGRESSED
          );

        expect(
          result.nextAction
        )
          .toBe(
            VERIFICATION_NEXT_ACTION
              .ROLLBACK
          );
      }
    );

    test(
      "high-confidence failed required check produces high confidence NOT_RECOVERED",
      () => {
        const failedEvidence =
          evidence({
            checks: [
              failingCheck(
                "health"
              ),
            ],

            totals: {
              planned:
                1,

              collected:
                1,

              completed:
                1,

              passed:
                0,

              failed:
                1,

              inconclusive:
                0,
            },

            required: {
              planned:
                1,

              passed:
                0,

              failed:
                1,

              missing:
                0,

              inconclusive:
                0,

              failures: [
                {
                  checkId:
                    "health",
                },
              ],

              missingChecks:
                [],
            },

            completeness:
              1,

            requiredCoverage:
              1,

            requiredSuccessRate:
              0,

            averageScore:
              0,
          });

        const engine =
          new VerificationDecisionEngine();

        const result =
          engine.decide(
            baseInput({
              evidencePackage:
                failedEvidence,
            })
          );

        expect(
          result.confidence
        )
          .toBe(
            VERIFICATION_CONFIDENCE
              .HIGH
          );
      }
    );

    test(
      "decision result never authorizes execution",
      () => {
        const engine =
          new VerificationDecisionEngine();

        const result =
          engine.decide(
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
      "rejects execution authorization input",
      () => {
        const engine =
          new VerificationDecisionEngine();

        expect(
          () =>
            engine.decide({
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