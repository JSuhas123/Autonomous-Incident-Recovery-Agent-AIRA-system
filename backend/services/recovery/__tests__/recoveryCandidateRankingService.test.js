"use strict";

const {
  RecoveryCandidateRankingService,
} =
  require(
    "../recoveryCandidateRankingService"
  );

const {
  createRecoveryCandidate,
  CANDIDATE_STATUS,
  ACTION_RISK,
  REVERSIBILITY,
  APPROVAL_MODE,
  POLICY_STATUS,
} =
  require(
    "../recoveryDecisionContracts"
  );

function applicableCandidate(
  input = {}
) {
  return createRecoveryCandidate({
    playbookId:
      input.playbookId ||
      "playbook",

    status:
      CANDIDATE_STATUS
        .APPLICABLE,

    diagnosisMatch: {
      score:
        input.diagnosisMatch ??
        0.8,
    },

    applicability: {
      applicable:
        true,

      score:
        input.applicability ??
        0.9,

      reasons:
        [],
    },

    historicalEffectiveness:
      input
        .historicalEffectiveness ||
      {},

    rollback:
      input.rollback ||
      {},

    policy:
      input.policy ||
      {},

    actionRisk:
      input.actionRisk ||
      {},

    approval:
      input.approval ||
      {},

    executionAuthorized:
      false,
  });
}

describe(
  "RecoveryCandidateRankingService",
  () => {
    test(
      "ranks stronger candidate first",
      () => {
        const service =
          new RecoveryCandidateRankingService();

        const result =
          service.rankCandidates({
            candidates: [
              applicableCandidate({
                playbookId:
                  "weaker",

                diagnosisMatch:
                  0.6,

                applicability:
                  0.7,
              }),

              applicableCandidate({
                playbookId:
                  "stronger",

                diagnosisMatch:
                  0.95,

                applicability:
                  0.95,
              }),
            ],

            executionAuthorized:
              false,
          });

        expect(
          result
            .candidates[0]
            .playbookId
        )
          .toBe(
            "stronger"
          );

        expect(
          result
            .candidates[0]
            .ranking
            .rank
        )
          .toBe(
            1
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
      "uses historical effectiveness when available",
      () => {
        const service =
          new RecoveryCandidateRankingService();

        const result =
          service.rankCandidates({
            candidates: [
              applicableCandidate({
                playbookId:
                  "historically-poor",

                diagnosisMatch:
                  0.8,

                applicability:
                  0.9,

                historicalEffectiveness: {
                  score:
                    0.2,
                },
              }),

              applicableCandidate({
                playbookId:
                  "historically-good",

                diagnosisMatch:
                  0.8,

                applicability:
                  0.9,

                historicalEffectiveness: {
                  score:
                    0.9,
                },
              }),
            ],
          });

        expect(
          result
            .topCandidate
            .playbookId
        )
          .toBe(
            "historically-good"
          );
      }
    );

    test(
      "prefers reversible lower-risk action",
      () => {
        const service =
          new RecoveryCandidateRankingService();

        const result =
          service.rankCandidates({
            candidates: [
              applicableCandidate({
                playbookId:
                  "dangerous",

                diagnosisMatch:
                  0.9,

                applicability:
                  0.9,

                rollback: {
                  reversibility:
                    REVERSIBILITY
                      .NONE,
                },

                actionRisk: {
                  level:
                    ACTION_RISK
                      .HIGH,

                  score:
                    0.8,
                },
              }),

              applicableCandidate({
                playbookId:
                  "safer",

                diagnosisMatch:
                  0.9,

                applicability:
                  0.9,

                rollback: {
                  reversibility:
                    REVERSIBILITY
                      .FULL,
                },

                actionRisk: {
                  level:
                    ACTION_RISK
                      .LOW,

                  score:
                    0.1,
                },
              }),
            ],
          });

        expect(
          result
            .topCandidate
            .playbookId
        )
          .toBe(
            "safer"
          );
      }
    );

    test(
      "prefers policy eligible candidate",
      () => {
        const service =
          new RecoveryCandidateRankingService();

        const result =
          service.rankCandidates({
            candidates: [
              applicableCandidate({
                playbookId:
                  "approval-needed",

                policy: {
                  status:
                    POLICY_STATUS
                      .REQUIRES_APPROVAL,
                },
              }),

              applicableCandidate({
                playbookId:
                  "eligible",

                policy: {
                  status:
                    POLICY_STATUS
                      .ELIGIBLE,
                },
              }),
            ],
          });

        expect(
          result
            .topCandidate
            .playbookId
        )
          .toBe(
            "eligible"
          );
      }
    );

    test(
      "prefers lower approval burden",
      () => {
        const service =
          new RecoveryCandidateRankingService();

        const result =
          service.rankCandidates({
            candidates: [
              applicableCandidate({
                playbookId:
                  "multi-party",

                approval: {
                  required:
                    true,

                  mode:
                    APPROVAL_MODE
                      .MULTI_PARTY,
                },
              }),

              applicableCandidate({
                playbookId:
                  "automatic-eligible",

                approval: {
                  required:
                    false,

                  mode:
                    APPROVAL_MODE
                      .NONE,
                },
              }),
            ],
          });

        expect(
          result
            .topCandidate
            .playbookId
        )
          .toBe(
            "automatic-eligible"
          );
      }
    );

    test(
      "does not rank failed applicability candidate",
      () => {
        const service =
          new RecoveryCandidateRankingService();

        const rejected =
          createRecoveryCandidate({
            playbookId:
              "bad",

            status:
              CANDIDATE_STATUS
                .PRECONDITION_FAILED,

            diagnosisMatch: {
              score:
                1,
            },

            applicability: {
              applicable:
                false,

              score:
                0.2,

              failedPreconditions: [
                "namespace_missing",
              ],
            },
          });

        const result =
          service.rankCandidates({
            candidates: [
              rejected,

              applicableCandidate({
                playbookId:
                  "good",
              }),
            ],
          });

        expect(
          result.rankedCount
        )
          .toBe(
            1
          );

        expect(
          result
            .topCandidate
            .playbookId
        )
          .toBe(
            "good"
          );

        expect(
          result.rejectedCount
        )
          .toBe(
            1
          );
      }
    );

    test(
      "policy blocked candidate cannot be ranked",
      () => {
        const service =
          new RecoveryCandidateRankingService();

        const blocked =
          applicableCandidate({
            playbookId:
              "blocked",

            policy: {
              status:
                POLICY_STATUS
                  .BLOCKED,
            },
          });

        const result =
          service.rankCandidates({
            candidates: [
              blocked,
            ],
          });

        expect(
          result.rankedCount
        )
          .toBe(
            0
          );

        expect(
          result.rejectedCount
        )
          .toBe(
            1
          );
      }
    );

    test(
      "unknown downstream dimensions do not destroy candidate score",
      () => {
        const service =
          new RecoveryCandidateRankingService();

        const result =
          service.rankCandidates({
            candidates: [
              applicableCandidate({
                playbookId:
                  "candidate",

                diagnosisMatch:
                  0.9,

                applicability:
                  0.9,
              }),
            ],
          });

        expect(
          result
            .topCandidate
            .ranking
            .score
        )
          .toBeGreaterThan(
            0.8
          );
      }
    );

    test(
  "approval-required candidate remains rankable",
  () => {
    const service =
      new RecoveryCandidateRankingService();

    const candidate =
      applicableCandidate({
        playbookId:
          "approval-required",
      });

    candidate.status =
      CANDIDATE_STATUS
        .APPROVAL_REQUIRED;

    candidate.policy = {
      status:
        POLICY_STATUS
          .REQUIRES_APPROVAL,
    };

    candidate.approval = {
      required:
        true,

      mode:
        APPROVAL_MODE
          .HUMAN,

      reasons: [
        "Production approval required.",
      ],
    };

    const result =
      service.rankCandidates({
        candidates: [
          candidate,
        ],

        executionAuthorized:
          false,
      });

    expect(
      result.rankedCount
    )
      .toBe(
        1
      );

    expect(
      result
        .topCandidate
        .playbookId
    )
      .toBe(
        "approval-required"
      );

    expect(
      result
        .topCandidate
        .status
    )
      .toBe(
        CANDIDATE_STATUS
          .APPROVAL_REQUIRED
      );

    expect(
      result
        .topCandidate
        .approval
        .required
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
      "tie breaking is deterministic by playbookId",
      () => {
        const service =
          new RecoveryCandidateRankingService();

        const result =
          service.rankCandidates({
            candidates: [
              applicableCandidate({
                playbookId:
                  "z-playbook",
              }),

              applicableCandidate({
                playbookId:
                  "a-playbook",
              }),
            ],
          });

        expect(
          result.candidates
            .map(
              (
                candidate
              ) =>
                candidate.playbookId
            )
        )
          .toEqual([
            "a-playbook",
            "z-playbook",
          ]);
      }
    );

    test(
      "never accepts execution authorization",
      () => {
        const service =
          new RecoveryCandidateRankingService();

        expect(
          () =>
            service.rankCandidates({
              candidates:
                [],

              executionAuthorized:
                true,
            })
        )
          .toThrow(
            expect.objectContaining({
              code:
                "RECOVERY_RANKING_UNSAFE_INPUT",
            })
          );
      }
    );
  }
);