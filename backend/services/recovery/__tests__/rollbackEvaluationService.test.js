"use strict";

const {
  RollbackEvaluationService,
} =
  require(
    "../rollbackEvaluationService"
  );

const {
  createRecoveryCandidate,
  CANDIDATE_STATUS,
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
          0.4,
      },

    rollback:
      overrides.rollback ||
      {},

    metadata:
      overrides.metadata ||
      {},

    executionAuthorized:
      false,
  });
}

function repository(
  playbooks
) {
  return {
    async findByPlaybookId(
      id
    ) {
      return (
        playbooks.find(
          (
            playbook
          ) =>
            playbook.playbookId ===
            id
        ) ||
        null
      );
    },
  };
}

describe(
  "RollbackEvaluationService",
  () => {
    test(
      "detects inline rollback steps",
      async () => {
        const service =
          new RollbackEvaluationService();

        const result =
          await service
            .evaluateCandidates(
              {
                candidates: [
                  candidate(),
                ],
              },

              {
                playbookRepository:
                  repository([
                    {
                      playbookId:
                        "playbook-1",

                      rollback: {
                        steps: [
                          {
                            action:
                              "restore_previous_state",
                          },
                        ],
                      },
                    },
                  ]),
              }
            );

        expect(
          result
            .candidates[0]
            .rollback
            .available
        )
          .toBe(
            true
          );

        expect(
          result
            .candidates[0]
            .rollback
            .reversibility
        )
          .toBe(
            REVERSIBILITY
              .FULL
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
      "detects dedicated rollback playbook",
      async () => {
        const service =
          new RollbackEvaluationService();

        const result =
          await service
            .evaluateCandidates(
              {
                candidates: [
                  candidate(),
                ],
              },

              {
                playbookRepository:
                  repository([
                    {
                      playbookId:
                        "playbook-1",

                      rollback: {
                        rollbackPlaybookId:
                          "rollback-1",
                      },
                    },

                    {
                      playbookId:
                        "rollback-1",
                    },
                  ]),
              }
            );

        expect(
          result
            .candidates[0]
            .rollback
            .available
        )
          .toBe(
            true
          );

        expect(
          result
            .candidates[0]
            .rollback
            .rollbackPlaybookId
        )
          .toBe(
            "rollback-1"
          );
      }
    );

    test(
      "marks explicitly irreversible action",
      async () => {
        const service =
          new RollbackEvaluationService();

        const result =
          await service
            .evaluateCandidates(
              {
                candidates: [
                  candidate(),
                ],
              },

              {
                playbookRepository:
                  repository([
                    {
                      playbookId:
                        "playbook-1",

                      rollback: {
                        reversible:
                          false,
                      },
                    },
                  ]),
              }
            );

        expect(
          result
            .candidates[0]
            .rollback
            .available
        )
          .toBe(
            false
          );

        expect(
          result
            .candidates[0]
            .rollback
            .reversibility
        )
          .toBe(
            REVERSIBILITY
              .NONE
          );
      }
    );

    test(
      "marks destructive action without rollback as irreversible",
      async () => {
        const service =
          new RollbackEvaluationService();

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
            .rollback
            .reversibility
        )
          .toBe(
            REVERSIBILITY
              .NONE
          );
      }
    );

    test(
      "high risk without rollback is not treated as fully reversible",
      async () => {
        const service =
          new RollbackEvaluationService();

        const result =
          await service
            .evaluateCandidates({
              candidates: [
                candidate({
                  actionRisk: {
                    score:
                      0.9,
                  },
                }),
              ],
            });

        expect(
          result
            .candidates[0]
            .rollback
            .available
        )
          .toBe(
            false
          );

        expect(
          result
            .candidates[0]
            .rollback
            .reversibility
        )
          .not
          .toBe(
            REVERSIBILITY
              .FULL
          );
      }
    );

    test(
      "rollback precondition failure reduces rollback availability",
      async () => {
        const service =
          new RollbackEvaluationService();

        const result =
          await service
            .evaluateCandidates(
              {
                candidates: [
                  candidate(),
                ],

                context: {
                  environment:
                    "production",
                },
              },

              {
                playbookRepository:
                  repository([
                    {
                      playbookId:
                        "playbook-1",

                      rollback: {
                        steps: [
                          {
                            action:
                              "restore",
                          },
                        ],

                        preconditions: [
                          {
                            id:
                              "snapshot-exists",
                          },
                        ],
                      },
                    },
                  ]),

                rollbackPreconditionEvaluator:
                  async () => ({
                    passed:
                      false,

                    reason:
                      "Snapshot is unavailable.",
                  }),
              }
            );

        expect(
          result
            .candidates[0]
            .rollback
            .available
        )
          .toBe(
            false
          );

        expect(
          result
            .candidates[0]
            .rollback
            .reversibility
        )
          .toBe(
            REVERSIBILITY
              .PARTIAL
          );
      }
    );

    test(
      "restart action without explicit rollback is partially reversible",
      async () => {
        const service =
          new RollbackEvaluationService();

        const result =
          await service
            .evaluateCandidates({
              candidates: [
                candidate({
                  metadata: {
                    actionType:
                      "restart",
                  },
                }),
              ],
            });

        expect(
          result
            .candidates[0]
            .rollback
            .reversibility
        )
          .toBe(
            REVERSIBILITY
              .PARTIAL
          );
      }
    );

    test(
      "never accepts execution authorization",
      async () => {
        const service =
          new RollbackEvaluationService();

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
              "ROLLBACK_EVALUATION_UNSAFE_INPUT",
          });
      }
    );
  }
);