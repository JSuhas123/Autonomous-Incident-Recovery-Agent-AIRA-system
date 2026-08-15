"use strict";

const {
  VerificationDecisionCritic,
  VERIFICATION_CRITIC_DECISION,
} =
  require(
    "../verificationDecisionCritic"
  );

const {
  VERIFICATION_DECISION,
  VERIFICATION_CONFIDENCE,
  VERIFICATION_NEXT_ACTION,
} =
  require(
    "../verificationContracts"
  );

function evidence(
  overrides = {}
) {
  return {
    verificationPlanId:
      "verify-plan-1",

    verificationPlanHash:
      "verify-hash-1",

    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "incident-1",

    executionRequestId:
      "request-1",

    checks:
      [],

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
    },

    completeness:
      1,

    requiredCoverage:
      1,

    requiredSuccessRate:
      1,

    averageScore:
      1,

    hasConflicts:
      false,

    conflicts:
      [],

    complete:
      true,

    ...overrides,
  };
}

function decision(
  overrides = {}
) {
  return {
    verificationId:
      "verification-1",

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

    recovered:
      true,

    overallScore:
      1,

    metadata: {
      verificationPlanId:
        "verify-plan-1",

      verificationPlanHash:
        "verify-hash-1",
    },

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "VerificationDecisionCritic",
  () => {
    test(
      "accepts strongly supported recovered decision",
      () => {
        const critic =
          new VerificationDecisionCritic();

        const result =
          critic.review({
            decisionResult:
              decision(),

            evidencePackage:
              evidence(),
          });

        expect(
          result.criticDecision
        )
          .toBe(
            VERIFICATION_CRITIC_DECISION
              .ACCEPT
          );

        expect(
          result.accepted
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
      }
    );

    test(
      "rejects recovered decision with failed required checks",
      () => {
        const critic =
          new VerificationDecisionCritic();

        const result =
          critic.review({
            decisionResult:
              decision(),

            evidencePackage:
              evidence({
                required: {
                  planned:
                    4,

                  passed:
                    3,

                  failed:
                    1,

                  missing:
                    0,

                  inconclusive:
                    0,
                },

                requiredSuccessRate:
                  0.75,
              }),
          });

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "rejects recovered decision with missing required checks",
      () => {
        const critic =
          new VerificationDecisionCritic();

        const result =
          critic.review({
            decisionResult:
              decision(),

            evidencePackage:
              evidence({
                required: {
                  planned:
                    4,

                  passed:
                    3,

                  failed:
                    0,

                  missing:
                    1,

                  inconclusive:
                    0,
                },

                requiredCoverage:
                  0.75,

                requiredSuccessRate:
                  0.75,
              }),
          });

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "rejects recovered decision with conflicting evidence",
      () => {
        const critic =
          new VerificationDecisionCritic();

        const result =
          critic.review({
            decisionResult:
              decision(),

            evidencePackage:
              evidence({
                hasConflicts:
                  true,

                conflicts: [
                  {
                    type:
                      "METRICS_LOGS_CONFLICT",
                  },
                ],
              }),
          });

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "rejects recovered decision without high confidence",
      () => {
        const critic =
          new VerificationDecisionCritic();

        const result =
          critic.review({
            decisionResult:
              decision({
                confidence:
                  VERIFICATION_CONFIDENCE
                    .MEDIUM,
              }),

            evidencePackage:
              evidence(),
          });

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "rejects recovered decision with wrong next action",
      () => {
        const critic =
          new VerificationDecisionCritic();

        const result =
          critic.review({
            decisionResult:
              decision({
                nextAction:
                  VERIFICATION_NEXT_ACTION
                    .CONTINUE_MONITORING,
              }),

            evidencePackage:
              evidence(),
          });

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "rejects partial recovery with failed required checks",
      () => {
        const critic =
          new VerificationDecisionCritic();

        const result =
          critic.review({
            decisionResult:
              decision({
                decision:
                  VERIFICATION_DECISION
                    .PARTIALLY_RECOVERED,

                recovered:
                  false,

                confidence:
                  VERIFICATION_CONFIDENCE
                    .MEDIUM,

                nextAction:
                  VERIFICATION_NEXT_ACTION
                    .CONTINUE_MONITORING,
              }),

            evidencePackage:
              evidence({
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
                },
              }),
          });

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "accepts valid partial recovery",
      () => {
        const critic =
          new VerificationDecisionCritic();

        const result =
          critic.review({
            decisionResult:
              decision({
                decision:
                  VERIFICATION_DECISION
                    .PARTIALLY_RECOVERED,

                recovered:
                  false,

                confidence:
                  VERIFICATION_CONFIDENCE
                    .MEDIUM,

                nextAction:
                  VERIFICATION_NEXT_ACTION
                    .CONTINUE_MONITORING,

                overallScore:
                  0.7,
              }),

            evidencePackage:
              evidence({
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
                },

                requiredSuccessRate:
                  1,

                averageScore:
                  0.7,
              }),
          });

        expect(
          result.accepted
        )
          .toBe(
            true
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
      "manual review requires manual intervention",
      () => {
        const critic =
          new VerificationDecisionCritic();

        const result =
          critic.review({
            decisionResult:
              decision({
                decision:
                  VERIFICATION_DECISION
                    .MANUAL_REVIEW,

                recovered:
                  false,

                confidence:
                  VERIFICATION_CONFIDENCE
                    .LOW,

                nextAction:
                  VERIFICATION_NEXT_ACTION
                    .ESCALATE,
              }),

            evidencePackage:
              evidence({
                hasConflicts:
                  true,
              }),
          });

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "regressed decision must recommend rollback",
      () => {
        const critic =
          new VerificationDecisionCritic();

        const result =
          critic.review({
            decisionResult:
              decision({
                decision:
                  VERIFICATION_DECISION
                    .REGRESSED,

                recovered:
                  false,

                confidence:
                  VERIFICATION_CONFIDENCE
                    .HIGH,

                nextAction:
                  VERIFICATION_NEXT_ACTION
                    .ESCALATE,
              }),

            evidencePackage:
              evidence(),
          });

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "detects verification plan hash mismatch",
      () => {
        const critic =
          new VerificationDecisionCritic();

        const result =
          critic.review({
            decisionResult:
              decision({
                metadata: {
                  verificationPlanId:
                    "verify-plan-1",

                  verificationPlanHash:
                    "different-hash",
                },
              }),

            evidencePackage:
              evidence(),
          });

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "detects scope mismatch",
      () => {
        const critic =
          new VerificationDecisionCritic();

        const result =
          critic.review({
            decisionResult:
              decision({
                organizationId:
                  "org-other",
              }),

            evidencePackage:
              evidence(),
          });

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "never authorizes execution",
      () => {
        const critic =
          new VerificationDecisionCritic();

        const result =
          critic.review({
            decisionResult:
              decision(),

            evidencePackage:
              evidence(),
          });

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "rejects unsafe input authorization",
      () => {
        const critic =
          new VerificationDecisionCritic();

        expect(
          () =>
            critic.review({
              decisionResult:
                decision(),

              evidencePackage:
                evidence(),

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