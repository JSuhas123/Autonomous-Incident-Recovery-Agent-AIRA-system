"use strict";

const {
  HistoricalEffectivenessEngine,
  KnowledgeRetrievalRankingEngine,
  MemoryEvidenceAdapter,
  ResourceGraphEvidenceAdapter,
  RecoveryKnowledgeIntelligenceService,
} = require(
  "../../knowledge/reasoning"
);


describe(
  "Phase 18.15-18.18 knowledge intelligence",
  () => {
    test(
      "historical effectiveness uses verified outcomes",
      () => {
        const result =
          new HistoricalEffectivenessEngine()
            .evaluate({
              playbookId:
                "PB-K8S-RECOVERY",

              executions: [
                {
                  playbookId:
                    "PB-K8S-RECOVERY",

                  status:
                    "SUCCEEDED",

                  verificationResult: {
                    passed: true,
                  },

                  durationMs:
                    100,
                },

                {
                  playbookId:
                    "PB-K8S-RECOVERY",

                  status:
                    "FAILED",

                  verificationResult: {
                    passed: false,
                  },

                  durationMs:
                    200,
                },

                {
                  playbookId:
                    "PB-K8S-RECOVERY",

                  status:
                    "SUCCEEDED",

                  verificationResult: {
                    passed: true,
                  },

                  durationMs:
                    150,
                },
              ],
            });

        expect(
          result.sampleSize
        ).toBe(3);

        expect(
          result.verifiedRecoveries
        ).toBe(2);

        expect(
          result.sufficientHistory
        ).toBe(true);

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "historical success never grants authorization",
      () => {
        const result =
          new HistoricalEffectivenessEngine()
            .evaluate({
              playbookId:
                "PB-ONE",

              executions: [
                {
                  playbookId:
                    "PB-ONE",

                  status:
                    "SUCCEEDED",

                  verificationResult: {
                    passed: true,
                  },
                },

                {
                  playbookId:
                    "PB-ONE",

                  status:
                    "SUCCEEDED",

                  verificationResult: {
                    passed: true,
                  },
                },

                {
                  playbookId:
                    "PB-ONE",

                  status:
                    "SUCCEEDED",

                  verificationResult: {
                    passed: true,
                  },
                },
              ],
            });

        expect(
          result.successRate
        ).toBe(1);

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "missing capability blocks ranking eligibility",
      () => {
        const result =
          new KnowledgeRetrievalRankingEngine()
            .rank({
              candidates: [
                {
                  playbookId:
                    "PB-ONE",

                  requiredCapabilities: [
                    "RESTART",
                  ],
                },
              ],

              availableCapabilities: [
                "READ_STATE",
              ],

              evidenceAssessment: {
                complete: true,
                confidence: 1,
              },
            });

        expect(
          result.candidates[0]
            .eligible
        ).toBe(false);

        expect(
          result.candidates[0]
            .blockReasons
        ).toContain(
          "MISSING_CAPABILITY"
        );
      }
    );


    test(
      "Memory becomes historical evidence only",
      () => {
        const result =
          new MemoryEvidenceAdapter()
            .adapt({
              memories: [
                {
                  memoryId:
                    "mem-1",

                  memoryType:
                    "EPISODIC",

                  failureModeId:
                    "FM-1",

                  outcome:
                    "SUCCEEDED",

                  confidence:
                    0.9,
                },
              ],

              failureModeId:
                "FM-1",
            });

        expect(
          result.evidenceCount
        ).toBe(1);

        expect(
          result.source
        ).toBe(
          "PHASE_16_MEMORY"
        );

        expect(
          result.historicalEvidenceOnly
        ).toBe(true);

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "Resource Graph contributes structural evidence",
      () => {
        const result =
          new ResourceGraphEvidenceAdapter()
            .adapt({
              resourceContext: {
                resourceId:
                  "resource-1",

                resourceType:
                  "KUBERNETES_POD",
              },

              topology: {
                relationships: [
                  {
                    type:
                      "DEPENDS_ON",
                  },
                ],
              },

              knownGoodComparison: {
                changes: [
                  {
                    field:
                      "restartCount",
                  },
                ],
              },

              correlatedChanges: [
                {
                  id:
                    "change-1",
                },
              ],
            });

        expect(
          result.graphEvidenceAvailable
        ).toBe(true);

        expect(
          result.structuralConfidence
        ).toBe(1);

        expect(
          result.correlationIsCausation
        ).toBe(false);

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "integrated intelligence recommends but does not authorize",
      () => {
        const service =
          new RecoveryKnowledgeIntelligenceService();

        const result =
          service.analyze({
            failureModes: [
              {
                failureModeId:
                  "FM-K8S-CRASHLOOP",

                confidence:
                  0.8,

                requiredEvidence: [
                  {
                    type:
                      "LOGS",
                    required:
                      true,
                  },
                ],

                recommendedPlaybooks: [
                  "PB-K8S-RESTART",
                ],

                resourceTypes: [
                  "KUBERNETES_POD",
                ],
              },
            ],

            playbooks: [
              {
                playbookId:
                  "PB-K8S-RESTART",

                lifecycle:
                  "ACTIVE",

                requiredCapabilities: [
                  "RESTART",
                ],

                resourceTypes: [
                  "KUBERNETES_POD",
                ],

                rollback: {
                  available:
                    true,

                  strategy:
                    "EXPLICIT_STEPS",
                },

                risk: {
                  level:
                    "LOW",
                },
              },
            ],

            evidence: [
              {
                type:
                  "LOGS",

                evidenceId:
                  "logs-1",
              },
            ],

            memories: [
              {
                memoryId:
                  "mem-1",

                failureModeId:
                  "FM-K8S-CRASHLOOP",

                outcome:
                  "SUCCEEDED",

                confidence:
                  0.9,
              },
            ],

            resourceContext: {
              resourceId:
                "pod-1",

              resourceType:
                "KUBERNETES_POD",
            },

            historicalExecutions: [
              {
                playbookId:
                  "PB-K8S-RESTART",

                status:
                  "SUCCEEDED",

                verificationResult: {
                  passed:
                    true,
                },
              },

              {
                playbookId:
                  "PB-K8S-RESTART",

                status:
                  "SUCCEEDED",

                verificationResult: {
                  passed:
                    true,
                },
              },

              {
                playbookId:
                  "PB-K8S-RESTART",

                status:
                  "SUCCEEDED",

                verificationResult: {
                  passed:
                    true,
                },
              },
            ],

            availableCapabilities: [
              "RESTART",
            ],
          });

        expect(
          result.hypotheses
            .bestHypothesis
            .failureModeId
        ).toBe(
          "FM-K8S-CRASHLOOP"
        );

        expect(
          result.recommendedPlaybook
            .playbookId
        ).toBe(
          "PB-K8S-RESTART"
        );

        expect(
          result.executionAuthorized
        ).toBe(false);

        expect(
          result.recommendedPlaybook
            .executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "no direct reasoning result can authorize execution",
      () => {
        const ranking =
          new KnowledgeRetrievalRankingEngine()
            .rank({
              candidates: [],
            });

        const memory =
          new MemoryEvidenceAdapter()
            .adapt({
              memories: [],
            });

        const graph =
          new ResourceGraphEvidenceAdapter()
            .adapt({});

        expect(
          ranking.executionAuthorized
        ).toBe(false);

        expect(
          memory.executionAuthorized
        ).toBe(false);

        expect(
          graph.executionAuthorized
        ).toBe(false);
      }
    );
  }
);