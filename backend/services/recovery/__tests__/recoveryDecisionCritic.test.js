"use strict";

const {
  RecoveryDecisionCritic,
  CRITIC_DECISION,
} =
  require(
    "../recoveryDecisionCritic"
  );

const {
  RECOVERY_DECISION,
  CANDIDATE_STATUS,
  POLICY_STATUS,
  APPROVAL_MODE,
  ACTION_RISK,
  REVERSIBILITY,
} =
  require(
    "../recoveryDecisionContracts"
  );

function candidate(
  overrides = {}
) {
  return {
    candidateId:
      overrides.candidateId ||
      "candidate-1",

    playbookId:
      overrides.playbookId ||
      "playbook-1",

    status:
      overrides.status ||
      CANDIDATE_STATUS
        .APPLICABLE,

    applicability:
      overrides.applicability ||
      {
        applicable:
          true,

        score:
          0.9,
      },

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
        level:
          ACTION_RISK
            .LOW,

        score:
          0.2,
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

    approval:
      overrides.approval ||
      {
        required:
          false,

        mode:
          APPROVAL_MODE
            .NONE,
      },

    ranking:
      overrides.ranking ||
      {
        score:
          0.9,
      },

    executionAuthorized:
      overrides.executionAuthorized ??
      false,
  };
}

function engineResult({
  decisionType =
    RECOVERY_DECISION
      .RECOMMEND_PLAYBOOK,

  selected =
    candidate(),

  executionAuthorized =
    false,
} = {}) {
  const hasSelected =
    Boolean(
      selected
    );

  return {
    decision: {
      decisionId:
        "recovery-1",

      decision:
        decisionType,

      selectedCandidateId:
        hasSelected
          ? selected
              .candidateId
          : null,

      selectedPlaybookId:
        hasSelected
          ? selected
              .playbookId
          : null,

      executionAuthorized:
        false,
    },

    selectedCandidate:
      selected,

    candidates:
      hasSelected
        ? [
            selected,
          ]
        : [],

    executionAuthorized,
  };
}

describe(
  "RecoveryDecisionCritic",
  () => {
    test(
      "accepts coherent safe playbook recommendation",
      async () => {
        const critic =
          new RecoveryDecisionCritic();

        const result =
          await critic.review(
            engineResult()
          );

        expect(
          result.criticDecision
        )
          .toBe(
            CRITIC_DECISION
              .ACCEPT
          );

        expect(
          result.accepted
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
      "rejects automatic recommendation when approval is required",
      async () => {
        const critic =
          new RecoveryDecisionCritic();

        const selected =
          candidate({
            approval: {
              required:
                true,

              mode:
                APPROVAL_MODE
                  .HUMAN,
            },
          });

        const result =
          await critic.review(
            engineResult({
              selected,
            })
          );

        expect(
          result.criticDecision
        )
          .toBe(
            CRITIC_DECISION
              .REJECT
          );

        expect(
          result.violations.length
        )
          .toBeGreaterThan(
            0
          );
      }
    );

    test(
      "rejects policy-blocked selected candidate",
      async () => {
        const critic =
          new RecoveryDecisionCritic();

        const selected =
          candidate({
            status:
              CANDIDATE_STATUS
                .POLICY_BLOCKED,

            policy: {
              status:
                POLICY_STATUS
                  .BLOCKED,
            },
          });

        const result =
          await critic.review(
            engineResult({
              selected,
            })
          );

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "rejects irreversible automatic recommendation",
      async () => {
        const critic =
          new RecoveryDecisionCritic();

        const selected =
          candidate({
            rollback: {
              available:
                false,

              reversibility:
                REVERSIBILITY
                  .NONE,
            },
          });

        const result =
          await critic.review(
            engineResult({
              selected,
            })
          );

        expect(
          result.criticDecision
        )
          .toBe(
            CRITIC_DECISION
              .REJECT
          );
      }
    );

    test(
      "rejects unsafe execution authorization",
      async () => {
        const critic =
          new RecoveryDecisionCritic();

        const result =
          await critic.review(
            engineResult({
              executionAuthorized:
                true,
            })
          );

        expect(
          result.rejected
        )
          .toBe(
            true
          );

        expect(
          result.violations
            .some(
              (
                violation
              ) =>
                violation.includes(
                  "execution authorization"
                )
            )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "accepts coherent approval decision",
      async () => {
        const critic =
          new RecoveryDecisionCritic();

        const selected =
          candidate({
            approval: {
              required:
                true,

              mode:
                APPROVAL_MODE
                  .HUMAN,
            },

            policy: {
              status:
                POLICY_STATUS
                  .REQUIRES_APPROVAL,
            },
          });

        const result =
          await critic.review(
            engineResult({
              decisionType:
                RECOVERY_DECISION
                  .REQUIRE_APPROVAL,

              selected,
            })
          );

        expect(
          result.criticDecision
        )
          .toBe(
            CRITIC_DECISION
              .ACCEPT
          );
      }
    );

    test(
      "accepts coherent no-safe-action decision",
      async () => {
        const critic =
          new RecoveryDecisionCritic();

        const result =
          await critic.review(
            engineResult({
              decisionType:
                RECOVERY_DECISION
                  .NO_SAFE_ACTION,

              selected:
                null,
            })
          );

        expect(
          result.accepted
        )
          .toBe(
            true
          );
      }
    );

    test(
      "rejects NO_SAFE_ACTION containing selected candidate",
      async () => {
        const critic =
          new RecoveryDecisionCritic();

        const result =
          await critic.review(
            engineResult({
              decisionType:
                RECOVERY_DECISION
                  .NO_SAFE_ACTION,

              selected:
                candidate(),
            })
          );

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "sends uncertain automatic rollback state to manual review",
      async () => {
        const critic =
          new RecoveryDecisionCritic();

        const selected =
          candidate({
            rollback: {
              available:
                false,

              reversibility:
                REVERSIBILITY
                  .UNKNOWN,
            },
          });

        const result =
          await critic.review(
            engineResult({
              selected,
            })
          );

        expect(
          result.criticDecision
        )
          .toBe(
            CRITIC_DECISION
              .MANUAL_REVIEW
          );

        expect(
          result.requiresManualReview
        )
          .toBe(
            true
          );
      }
    );

    test(
      "rejects selected candidate below critic ranking threshold",
      async () => {
        const critic =
          new RecoveryDecisionCritic({
            minimumRankingScore:
              0.55,
          });

        const selected =
          candidate({
            ranking: {
              score:
                0.3,
            },
          });

        const result =
          await critic.review(
            engineResult({
              selected,
            })
          );

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "external safety validator can reject decision",
      async () => {
        const critic =
          new RecoveryDecisionCritic();

        const result =
          await critic.review(
            engineResult(),

            {
              safetyValidator:
                async () => ({
                  safe:
                    false,

                  violations: [
                    "Protected service cannot be automatically recovered.",
                  ],
                }),
            }
          );

        expect(
          result.rejected
        )
          .toBe(
            true
          );

        expect(
          result.violations
        )
          .toContain(
            "Protected service cannot be automatically recovered."
          );
      }
    );

    test(
      "critic itself never authorizes execution",
      async () => {
        const critic =
          new RecoveryDecisionCritic();

        const result =
          await critic.review(
            engineResult()
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);