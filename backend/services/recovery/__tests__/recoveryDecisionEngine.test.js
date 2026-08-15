"use strict";

const {
  RecoveryDecisionEngine,
} =
  require(
    "../recoveryDecisionEngine"
  );

const {
  createRecoveryCandidate,
  CANDIDATE_STATUS,
  POLICY_STATUS,
  APPROVAL_MODE,
  ACTION_RISK,
  REVERSIBILITY,
  RECOVERY_DECISION,
} =
  require(
    "../recoveryDecisionContracts"
  );

function baseInput() {
  return {
    diagnosisId:
      "diagnosis-1",

    diagnosisRevision:
      1,

    diagnosis: {
      diagnosisId:
        "diagnosis-1",

      revision:
        1,

      recommendedNextStep: {
        type:
          "EVALUATE_PLAYBOOK",
      },

      executionAuthorized:
        false,
    },

    safetyGate: {
      decision:
        "ALLOW_EVALUATION",

      canEvaluatePlaybook:
        true,
    },

    context: {
      incidentId:
        "incident-1",

      organizationId:
        "org-1",

      environmentId:
        "env-1",

      environment:
        "production",

      incident: {
        _id:
          "incident-1",

        status:
          "open",
      },
    },

    executionAuthorized:
      false,
  };
}

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
        overrides.match ??
        0.9,
    },

    applicability: {
      applicable:
        true,

      score:
        overrides.applicability ??
        0.9,
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

    policy:
      overrides.policy ||
      {
        status:
          POLICY_STATUS
            .ELIGIBLE,
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

    ranking: {
      score:
        overrides.score ??
        0.9,
    },

    executionAuthorized:
      false,
  });
}

function stageServices(
  finalCandidate
) {
  return {
    discoveryService: {
      async discover() {
        return {
          candidates: [
            finalCandidate,
          ],

          candidateCount:
            1,

          noCandidates:
            false,
        };
      },
    },

    applicabilityService: {
      async evaluateCandidates() {
        return {
          candidates: [
            finalCandidate,
          ],

          applicableCandidates: [
            finalCandidate,
          ],

          applicableCount:
            1,
        };
      },
    },

    riskService: {
      async analyzeCandidates() {
        return {
          candidates: [
            finalCandidate,
          ],

          allowedCandidates: [
            finalCandidate,
          ],

          allowedCount:
            1,
        };
      },
    },

    rollbackService: {
      async evaluateCandidates() {
        return {
          candidates: [
            finalCandidate,
          ],
        };
      },
    },

    policyService: {
      async evaluateCandidates() {
        return {
          candidates: [
            finalCandidate,
          ],
        };
      },
    },

    approvalService: {
      async resolveCandidates() {
        return {
          candidates: [
            finalCandidate,
          ],
        };
      },
    },

    rankingService: {
      rankCandidates() {
        return {
          candidates: [
            finalCandidate,
          ],

          rankedCount:
            1,

          topCandidate:
            finalCandidate,
        };
      },
    },
  };
}

describe(
  "RecoveryDecisionEngine",
  () => {
    test(
      "recommends safe automatic playbook",
      async () => {
        const selected =
          candidate({
            playbookId:
              "k8s.restart.v1",

            score:
              0.9,
          });

        const engine =
          new RecoveryDecisionEngine(
            stageServices(
              selected
            )
          );

        const result =
          await engine.decide(
            baseInput()
          );

        expect(
          result
            .decision
            .decision
        )
          .toBe(
            RECOVERY_DECISION
              .RECOMMEND_PLAYBOOK
          );

        expect(
          result
            .decision
            .selectedPlaybookId
        )
          .toBe(
            "k8s.restart.v1"
          );

        expect(
          result
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result
            .decision
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "returns REQUIRE_APPROVAL when candidate requires approval",
      async () => {
        const selected =
          candidate({
            approval: {
              required:
                true,

              mode:
                APPROVAL_MODE
                  .HUMAN,

              reasons: [
                "Production approval required.",
              ],
            },
          });

        const engine =
          new RecoveryDecisionEngine(
            stageServices(
              selected
            )
          );

        const result =
          await engine.decide(
            baseInput()
          );

        expect(
          result
            .decision
            .decision
        )
          .toBe(
            RECOVERY_DECISION
              .REQUIRE_APPROVAL
          );

        expect(
          result
            .decision
            .approvalRequired
        )
          .toBe(
            true
          );
      }
    );

    test(
      "manual-only candidate returns MANUAL_INTERVENTION",
      async () => {
        const selected =
          candidate({
            approval: {
              required:
                true,

              mode:
                APPROVAL_MODE
                  .MANUAL_ONLY,
            },
          });

        const engine =
          new RecoveryDecisionEngine(
            stageServices(
              selected
            )
          );

        const result =
          await engine.decide(
            baseInput()
          );

        expect(
          result
            .decision
            .decision
        )
          .toBe(
            RECOVERY_DECISION
              .MANUAL_INTERVENTION
          );
      }
    );

    test(
      "no discovered candidate returns NO_SAFE_ACTION",
      async () => {
        const engine =
          new RecoveryDecisionEngine({
            discoveryService: {
              async discover() {
                return {
                  candidates:
                    [],

                  candidateCount:
                    0,

                  noCandidates:
                    true,
                };
              },
            },
          });

        const result =
          await engine.decide(
            baseInput()
          );

        expect(
          result
            .decision
            .decision
        )
          .toBe(
            RECOVERY_DECISION
              .NO_SAFE_ACTION
          );
      }
    );

    test(
      "no applicable candidate returns NO_SAFE_ACTION",
      async () => {
        const discovered =
          candidate();

        const engine =
          new RecoveryDecisionEngine({
            discoveryService: {
              async discover() {
                return {
                  candidates: [
                    discovered,
                  ],

                  candidateCount:
                    1,

                  noCandidates:
                    false,
                };
              },
            },

            applicabilityService: {
              async evaluateCandidates() {
                return {
                  candidates: [
                    {
                      ...discovered,

                      status:
                        CANDIDATE_STATUS
                          .PRECONDITION_FAILED,
                    },
                  ],

                  applicableCandidates:
                    [],

                  applicableCount:
                    0,
                };
              },
            },
          });

        const result =
          await engine.decide(
            baseInput()
          );

        expect(
          result
            .decision
            .decision
        )
          .toBe(
            RECOVERY_DECISION
              .NO_SAFE_ACTION
          );
      }
    );

    test(
      "low ranking confidence returns manual intervention",
      async () => {
        const selected =
          candidate({
            score:
              0.3,
          });

        const engine =
          new RecoveryDecisionEngine({
            ...stageServices(
              selected
            ),

            minimumDecisionScore:
              0.55,
          });

        const result =
          await engine.decide(
            baseInput()
          );

        expect(
          result
            .decision
            .decision
        )
          .toBe(
            RECOVERY_DECISION
              .MANUAL_INTERVENTION
          );
      }
    );

    test(
      "blocks Phase 7 when diagnosis safety gate is not ALLOW_EVALUATION",
      async () => {
        const engine =
          new RecoveryDecisionEngine();

        const input =
          baseInput();

        input
          .safetyGate
          .decision =
          "HOLD_FOR_MORE_EVIDENCE";

        await expect(
          engine.decide(
            input
          )
        )
          .rejects
          .toMatchObject({
            code:
              "RECOVERY_DECISION_DIAGNOSIS_NOT_ELIGIBLE",
          });
      }
    );

    test(
      "blocks invalid Phase 6 next step",
      async () => {
        const engine =
          new RecoveryDecisionEngine();

        const input =
          baseInput();

        input
          .diagnosis
          .recommendedNextStep =
          {
            type:
              "MANUAL_INVESTIGATION",
          };

        await expect(
          engine.decide(
            input
          )
        )
          .rejects
          .toMatchObject({
            code:
              "RECOVERY_DECISION_NEXT_STEP_INVALID",
          });
      }
    );

    test(
      "never accepts execution authorization",
      async () => {
        const engine =
          new RecoveryDecisionEngine();

        const input =
          baseInput();

        input.executionAuthorized =
          true;

        await expect(
          engine.decide(
            input
          )
        )
          .rejects
          .toMatchObject({
            code:
              "RECOVERY_DECISION_UNSAFE_INPUT",
          });
      }
    );

    test(
      "records complete stage trace on successful decision",
      async () => {
        const selected =
          candidate();

        const engine =
          new RecoveryDecisionEngine(
            stageServices(
              selected
            )
          );

        const result =
          await engine.decide(
            baseInput()
          );

        expect(
          result.stageTrace
        )
          .toHaveLength(
            7
          );

        expect(
          result.stageTrace
            .every(
              (
                stage
              ) =>
                stage.status ===
                "SUCCESS"
            )
        )
          .toBe(
            true
          );
      }
    );
  }
);