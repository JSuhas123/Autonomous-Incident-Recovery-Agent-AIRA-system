"use strict";

const {
  PolicyEligibilityService,
} =
  require(
    "../policyEligibilityService"
  );

const {
  createRecoveryCandidate,
  CANDIDATE_STATUS,
  POLICY_STATUS,
  APPROVAL_MODE,
} =
  require(
    "../recoveryDecisionContracts"
  );

function candidate(
  overrides = {}
) {
  return createRecoveryCandidate({
    playbookId:
      overrides.playbookId ||
      "playbook-1",

    status:
      CANDIDATE_STATUS
        .APPLICABLE,

    diagnosisMatch: {
      score:
        0.9,
    },

    applicability: {
      applicable:
        true,

      score:
        0.9,
    },

    actionRisk:
      overrides.actionRisk ||
      {
        score:
          0.3,
      },

    metadata:
      overrides.metadata ||
      {},

    approval:
      overrides.approval ||
      {},

    executionAuthorized:
      false,
  });
}

describe(
  "PolicyEligibilityService",
  () => {
    test(
      "marks safe candidate eligible",
      async () => {
        const service =
          new PolicyEligibilityService();

        const result =
          await service
            .evaluateCandidates({
              candidates: [
                candidate(),
              ],

              context: {
                environment:
                  "production",
              },

              executionAuthorized:
                false,
            });

        expect(
          result.eligibleCount
        )
          .toBe(
            1
          );

        expect(
          result
            .candidates[0]
            .policy
            .status
        )
          .toBe(
            POLICY_STATUS
              .ELIGIBLE
          );

        expect(
          result
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "blocks risk above policy limit",
      async () => {
        const service =
          new PolicyEligibilityService({
            defaultMaxRiskScore:
              0.6,
          });

        const result =
          await service
            .evaluateCandidates({
              candidates: [
                candidate({
                  actionRisk: {
                    score:
                      0.8,
                  },
                }),
              ],
            });

        expect(
          result.blockedCount
        )
          .toBe(
            1
          );

        expect(
          result
            .candidates[0]
            .status
        )
          .toBe(
            CANDIDATE_STATUS
              .POLICY_BLOCKED
          );
      }
    );

    test(
      "blocks destructive action unless explicitly allowed",
      async () => {
        const service =
          new PolicyEligibilityService();

        const result =
          await service
            .evaluateCandidates({
              candidates: [
                candidate({
                  metadata: {
                    destructive:
                      true,
                  },
                }),
              ],
            });

        expect(
          result
            .candidates[0]
            .policy
            .status
        )
          .toBe(
            POLICY_STATUS
              .BLOCKED
          );
      }
    );

    test(
      "destructive action can require approval when explicitly permitted",
      async () => {
        const service =
          new PolicyEligibilityService();

        const result =
          await service
            .evaluateCandidates({
              candidates: [
                candidate({
                  metadata: {
                    destructive:
                      true,

                    allowDestructive:
                      true,
                  },
                }),
              ],
            });

        expect(
          result
            .candidates[0]
            .policy
            .status
        )
          .toBe(
            POLICY_STATUS
              .REQUIRES_APPROVAL
          );

        expect(
          result
            .candidates[0]
            .approval
            .required
        )
          .toBe(
            true
          );
      }
    );

    test(
      "production restriction blocks candidate",
      async () => {
        const service =
          new PolicyEligibilityService();

        const result =
          await service
            .evaluateCandidates({
              candidates: [
                candidate({
                  metadata: {
                    productionAllowed:
                      false,
                  },
                }),
              ],

              context: {
                environment:
                  "production",
              },
            });

        expect(
          result.blockedCount
        )
          .toBe(
            1
          );
      }
    );

    test(
      "production approval requirement is preserved",
      async () => {
        const service =
          new PolicyEligibilityService();

        const result =
          await service
            .evaluateCandidates({
              candidates: [
                candidate({
                  metadata: {
                    productionApprovalRequired:
                      true,
                  },
                }),
              ],

              context: {
                environment:
                  "production",
              },
            });

        expect(
          result.approvalRequiredCount
        )
          .toBe(
            1
          );

        expect(
          result
            .candidates[0]
            .approval
            .mode
        )
          .toBe(
            APPROVAL_MODE
              .HUMAN
          );
      }
    );

    test(
      "external policy evaluator can block candidate",
      async () => {
        const service =
          new PolicyEligibilityService();

        const result =
          await service
            .evaluateCandidates(
              {
                candidates: [
                  candidate(),
                ],
              },

              {
                policyEvaluator:
                  async () => ({
                    blocked:
                      true,

                    policyIds: [
                      "policy-prod-1",
                    ],

                    reasons: [
                      "Service is protected.",
                    ],
                  }),
              }
            );

        expect(
          result.blockedCount
        )
          .toBe(
            1
          );

        expect(
          result
            .candidates[0]
            .policy
            .policyIds
        )
          .toContain(
            "policy-prod-1"
          );
      }
    );

    test(
      "maintenance window can require approval",
      async () => {
        const service =
          new PolicyEligibilityService();

        const result =
          await service
            .evaluateCandidates(
              {
                candidates: [
                  candidate({
                    metadata: {
                      maintenanceWindowRequired:
                        true,
                    },
                  }),
                ],
              },

              {
                maintenanceWindowEvaluator:
                  async () => ({
                    allowed:
                      false,

                    requiresApproval:
                      true,

                    reason:
                      "Outside maintenance window.",
                  }),
              }
            );

        expect(
          result
            .candidates[0]
            .policy
            .status
        )
          .toBe(
            POLICY_STATUS
              .REQUIRES_APPROVAL
          );
      }
    );

    test(
      "tier3 action requires approval",
      async () => {
        const service =
          new PolicyEligibilityService();

        const result =
          await service
            .evaluateCandidates({
              candidates: [
                candidate({
                  metadata: {
                    actionTier:
                      "tier3",
                  },
                }),
              ],
            });

        expect(
          result.approvalRequiredCount
        )
          .toBe(
            1
          );
      }
    );

    test(
      "never accepts execution authorization",
      async () => {
        const service =
          new PolicyEligibilityService();

        await expect(
          service
            .evaluateCandidates({
              candidates:
                [],

              executionAuthorized:
                true,
            })
        )
          .rejects
          .toMatchObject({
            code:
              "POLICY_ELIGIBILITY_UNSAFE_INPUT",
          });
      }
    );
  }
);