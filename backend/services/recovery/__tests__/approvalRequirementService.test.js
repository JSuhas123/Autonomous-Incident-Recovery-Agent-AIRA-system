"use strict";

const {
  ApprovalRequirementService,
} =
  require(
    "../approvalRequirementService"
  );

const {
  createRecoveryCandidate,
  CANDIDATE_STATUS,
  APPROVAL_MODE,
  POLICY_STATUS,
  ACTION_RISK,
  REVERSIBILITY,
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
      overrides.status ||
      CANDIDATE_STATUS
        .APPLICABLE,

    policy:
      overrides.policy ||
      {
        status:
          POLICY_STATUS
            .ELIGIBLE,
      },

    actionRisk:
      overrides.actionRisk ||
      {
        score:
          0.2,

        level:
          ACTION_RISK
            .LOW,
      },

    rollback:
      overrides.rollback ||
      {
        available:
          true,

        reversibility:
          REVERSIBILITY
            .FULL,
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
  "ApprovalRequirementService",
  () => {
    test(
      "safe low-risk candidate requires no approval",
      async () => {
        const service =
          new ApprovalRequirementService();

        const result =
          await service
            .resolveCandidates({
              candidates: [
                candidate(),
              ],

              context: {
                environment:
                  "staging",

                service: {
                  criticality:
                    "medium",
                },
              },
            });

        expect(
          result.automaticCount
        )
          .toBe(
            1
          );

        expect(
          result
            .candidates[0]
            .approval
            .required
        )
          .toBe(
            false
          );

        expect(
          result
            .candidates[0]
            .approval
            .mode
        )
          .toBe(
            APPROVAL_MODE
              .NONE
          );
      }
    );

    test(
      "policy requirement forces human approval",
      async () => {
        const service =
          new ApprovalRequirementService();

        const result =
          await service
            .resolveCandidates({
              candidates: [
                candidate({
                  policy: {
                    status:
                      POLICY_STATUS
                        .REQUIRES_APPROVAL,
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
      "high risk requires approval",
      async () => {
        const service =
          new ApprovalRequirementService();

        const result =
          await service
            .resolveCandidates({
              candidates: [
                candidate({
                  actionRisk: {
                    score:
                      0.75,

                    level:
                      ACTION_RISK
                        .HIGH,
                  },
                }),
              ],
            });

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
      "critical risk requires multi-party approval",
      async () => {
        const service =
          new ApprovalRequirementService();

        const result =
          await service
            .resolveCandidates({
              candidates: [
                candidate({
                  actionRisk: {
                    score:
                      0.9,

                    level:
                      ACTION_RISK
                        .CRITICAL,
                  },
                }),
              ],
            });

        expect(
          result
            .candidates[0]
            .approval
            .mode
        )
          .toBe(
            APPROVAL_MODE
              .MULTI_PARTY
          );
      }
    );

    test(
      "irreversible action requires multi-party approval",
      async () => {
        const service =
          new ApprovalRequirementService();

        const result =
          await service
            .resolveCandidates({
              candidates: [
                candidate({
                  rollback: {
                    available:
                      false,

                    reversibility:
                      REVERSIBILITY
                        .NONE,
                  },
                }),
              ],
            });

        expect(
          result
            .candidates[0]
            .approval
            .mode
        )
          .toBe(
            APPROVAL_MODE
              .MULTI_PARTY
          );
      }
    );

    test(
      "tier4 action becomes manual only",
      async () => {
        const service =
          new ApprovalRequirementService();

        const result =
          await service
            .resolveCandidates({
              candidates: [
                candidate({
                  metadata: {
                    actionTier:
                      "tier4",
                  },
                }),
              ],
            });

        expect(
          result
            .candidates[0]
            .approval
            .mode
        )
          .toBe(
            APPROVAL_MODE
              .MANUAL_ONLY
          );
      }
    );

    test(
      "organization evaluator can increase approval requirement",
      async () => {
        const service =
          new ApprovalRequirementService();

        const result =
          await service
            .resolveCandidates(
              {
                candidates: [
                  candidate(),
                ],
              },

              {
                approvalPolicyEvaluator:
                  async () => ({
                    required:
                      true,

                    mode:
                      "MULTI_PARTY",

                    reasons: [
                      "Protected payment service.",
                    ],
                  }),
              }
            );

        expect(
          result
            .candidates[0]
            .approval
            .mode
        )
          .toBe(
            APPROVAL_MODE
              .MULTI_PARTY
          );

        expect(
          result
            .candidates[0]
            .approval
            .reasons
        )
          .toContain(
            "Protected payment service."
          );
      }
    );

    test(
      "policy-blocked candidate does not enter approval flow",
      async () => {
        const service =
          new ApprovalRequirementService();

        const result =
          await service
            .resolveCandidates({
              candidates: [
                candidate({
                  status:
                    CANDIDATE_STATUS
                      .POLICY_BLOCKED,

                  policy: {
                    status:
                      POLICY_STATUS
                        .BLOCKED,
                  },
                }),
              ],
            });

        expect(
          result
            .candidates[0]
            .status
        )
          .toBe(
            CANDIDATE_STATUS
              .POLICY_BLOCKED
          );

        expect(
          result
            .candidates[0]
            .approval
            .required
        )
          .toBe(
            false
          );
      }
    );

    test(
      "manual override always produces manual only",
      async () => {
        const service =
          new ApprovalRequirementService();

        const result =
          await service
            .resolveCandidates({
              candidates: [
                candidate({
                  metadata: {
                    manualOnly:
                      true,
                  },
                }),
              ],
            });

        expect(
          result
            .candidates[0]
            .approval
            .mode
        )
          .toBe(
            APPROVAL_MODE
              .MANUAL_ONLY
          );
      }
    );

    test(
      "never accepts execution authorization",
      async () => {
        const service =
          new ApprovalRequirementService();

        await expect(
          service
            .resolveCandidates({
              candidates:
                [],

              executionAuthorized:
                true,
            })
        )
          .rejects
          .toMatchObject({
            code:
              "APPROVAL_RESOLUTION_UNSAFE_INPUT",
          });
      }
    );
  }
);