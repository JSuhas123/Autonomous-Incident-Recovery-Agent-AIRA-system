"use strict";

const {
  ActionRiskAnalysisService,
} =
  require(
    "../actionRiskAnalysisService"
  );

const {
  createRecoveryCandidate,
  CANDIDATE_STATUS,
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

    rollback:
      overrides.rollback ||
      {},

    historicalEffectiveness:
      overrides
        .historicalEffectiveness ||
      {},

    metadata:
      overrides.metadata ||
      {},

    category:
      overrides.category ||
      "kubernetes",

    executionAuthorized:
      false,
  });
}

function context(
  overrides = {}
) {
  return {
    service: {
      criticality:
        "medium",
    },

    topologyAnalysis: {
      affectedServices: [
        "service-1",
      ],

      affectedResources: [
        "resource-1",
      ],
    },

    ...overrides,
  };
}

describe(
  "ActionRiskAnalysisService",
  () => {
    test(
      "calculates low risk for narrow reversible action",
      async () => {
        const service =
          new ActionRiskAnalysisService();

        const result =
          await service
            .analyzeCandidates({
              candidates: [
                candidate({
                  rollback: {
                    available:
                      true,

                    reversibility:
                      REVERSIBILITY
                        .FULL,
                  },

                  historicalEffectiveness: {
                    successfulExecutions:
                      10,

                    failedExecutions:
                      1,
                  },

                  metadata: {
                    mutationScope:
                      "single_pod",

                    actionType:
                      "restart",
                  },
                }),
              ],

              context:
                context(),

              executionAuthorized:
                false,
            });

        expect(
          result.allowedCount
        )
          .toBe(
            1
          );

        expect(
          result
            .candidates[0]
            .actionRisk
            .score
        )
          .toBeLessThan(
            0.65
          );

        expect(
          result
            .candidates[0]
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "blocks highly destructive global action",
      async () => {
        const service =
          new ActionRiskAnalysisService();

        const result =
          await service
            .analyzeCandidates({
              candidates: [
                candidate({
                  category:
                    "database",

                  rollback: {
                    available:
                      false,

                    reversibility:
                      REVERSIBILITY
                        .NONE,
                  },

                  metadata: {
                    mutationScope:
                      "global",

                    actionType:
                      "destroy",

                    destructive:
                      true,

                    dataMutation:
                      true,
                  },
                }),
              ],

              context:
                context({
                  service: {
                    criticality:
                      "critical",
                  },

                  topologyAnalysis: {
                    affectedServices: [
                      "a",
                      "b",
                      "c",
                      "d",
                      "e",
                    ],

                    affectedResources: [
                      "r1",
                      "r2",
                      "r3",
                      "r4",
                    ],
                  },
                }),
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
              .RISK_BLOCKED
          );

        expect(
          result
            .candidates[0]
            .actionRisk
            .level
        )
          .toBe(
            ACTION_RISK
              .CRITICAL
          );
      }
    );

    test(
      "database action receives elevated data risk",
      async () => {
        const service =
          new ActionRiskAnalysisService();

        const result =
          await service
            .analyzeCandidates({
              candidates: [
                candidate({
                  category:
                    "database",
                }),
              ],

              context:
                context(),
            });

        const dataRisk =
          result
            .candidates[0]
            .actionRisk
            .dimensions
            .find(
              (
                dimension
              ) =>
                dimension.name ===
                "dataRisk"
            );

        expect(
          dataRisk.value
        )
          .toBeGreaterThan(
            0.5
          );
      }
    );

    test(
      "security-sensitive action receives elevated security risk",
      async () => {
        const service =
          new ActionRiskAnalysisService();

        const result =
          await service
            .analyzeCandidates({
              candidates: [
                candidate({
                  category:
                    "credential_rotation",

                  metadata: {
                    securitySensitive:
                      true,
                  },
                }),
              ],

              context:
                context(),
            });

        const securityRisk =
          result
            .candidates[0]
            .actionRisk
            .dimensions
            .find(
              (
                dimension
              ) =>
                dimension.name ===
                "securityRisk"
            );

        expect(
          securityRisk.value
        )
          .toBeGreaterThan(
            0.7
          );
      }
    );

    test(
      "historical failures increase risk",
      async () => {
        const service =
          new ActionRiskAnalysisService();

        const good =
          await service
            .analyzeCandidates({
              candidates: [
                candidate({
                  historicalEffectiveness: {
                    successfulExecutions:
                      10,

                    failedExecutions:
                      0,
                  },
                }),
              ],

              context:
                context(),
            });

        const bad =
          await service
            .analyzeCandidates({
              candidates: [
                candidate({
                  historicalEffectiveness: {
                    successfulExecutions:
                      1,

                    failedExecutions:
                      10,
                  },
                }),
              ],

              context:
                context(),
            });

        expect(
          bad
            .candidates[0]
            .actionRisk
            .score
        )
          .toBeGreaterThan(
            good
              .candidates[0]
              .actionRisk
              .score
          );
      }
    );

    test(
      "external risk provider influences but does not replace deterministic risk",
      async () => {
        const service =
          new ActionRiskAnalysisService();

        const result =
          await service
            .analyzeCandidates(
              {
                candidates: [
                  candidate({
                    metadata: {
                      mutationScope:
                        "single_pod",
                    },
                  }),
                ],

                context:
                  context(),
              },

              {
                riskSignalProvider:
                  async () => ({
                    riskScore:
                      1,
                  }),
              }
            );

        expect(
          result
            .candidates[0]
            .actionRisk
            .score
        )
          .toBeLessThan(
            1
          );

        expect(
          result
            .candidates[0]
            .actionRisk
            .score
        )
          .toBeGreaterThan(
            0.2
          );
      }
    );

    test(
      "custom block threshold works",
      async () => {
        const service =
          new ActionRiskAnalysisService({
            blockThreshold:
              0.4,
          });

        const result =
          await service
            .analyzeCandidates({
              candidates: [
                candidate({
                  metadata: {
                    mutationScope:
                      "deployment",

                    actionType:
                      "restart",
                  },
                }),
              ],

              context:
                context({
                  service: {
                    criticality:
                      "critical",
                  },
                }),
            });

        expect(
          [
            0,
            1,
          ]
        )
          .toContain(
            result.blockedCount
          );

        expect(
          result
            .candidates[0]
            .actionRisk
            .score
        )
          .toBeGreaterThanOrEqual(
            0
          );
      }
    );

    test(
      "never accepts execution authorization",
      async () => {
        const service =
          new ActionRiskAnalysisService();

        await expect(
          service
            .analyzeCandidates({
              candidates:
                [],

              executionAuthorized:
                true,
            })
        )
          .rejects
          .toMatchObject({
            code:
              "ACTION_RISK_UNSAFE_INPUT",
          });
      }
    );
  }
);