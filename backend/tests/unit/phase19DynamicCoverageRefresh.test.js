"use strict";

const fs =
  require("fs");

const path =
  require("path");


const MemoryCoverageContributionService =
  require(
    "../../coverage/MemoryCoverageContributionService"
  );

const CoverageRefreshOrchestrator =
  require(
    "../../coverage/CoverageRefreshOrchestrator"
  );


const ROOT =
  path.resolve(
    __dirname,
    "../.."
  );


describe(
  "Phase 19.18-19.19 Dynamic Coverage Refresh",
  () => {
    /*
     * ========================================================================
     * PHASE 19.18 — MEMORY
     * ========================================================================
     */


    test(
      "Phase 16 Memory contributes frequency and confidence only",
      async () => {
        const memoryRepository = {
          listMemories:
            jest.fn()
              .mockResolvedValue([
                {
                  id:
                    "memory-1",

                  resourceId:
                    "resource-db",

                  incidentId:
                    "incident-1",

                  memoryType:
                    "EPISODIC",

                  confidence:
                    0.8,

                  observationCount:
                    1,

                  metadata: {
                    failureModeId:
                      "FM-DB",

                    outcome:
                      "SUCCEEDED",
                  },
                },

                {
                  id:
                    "memory-2",

                  resourceId:
                    "resource-db",

                  incidentId:
                    "incident-2",

                  memoryType:
                    "OUTCOME",

                  confidence:
                    0.6,

                  observationCount:
                    1,

                  metadata: {
                    failureModeId:
                      "FM-DB",

                    outcome:
                      "FAILED",
                  },
                },
              ]),
        };


        const service =
          new MemoryCoverageContributionService({
            memoryRepository,
          });


        const result =
          await service.evaluate({
            organizationId:
              "org",

            environmentId:
              "env",

            resourceId:
              "resource-db",

            failureModeId:
              "FM-DB",
          });


        expect(
          result.memoryCount
        ).toBe(2);


        expect(
          result.distinctIncidentCount
        ).toBe(2);


        expect(
          result.successfulHistoricalCases
        ).toBe(1);


        expect(
          result.failedHistoricalCases
        ).toBe(1);


        expect(
          result.affectsClassification
        ).toBe(false);


        expect(
          result.affectsPriority
        ).toBe(true);


        expect(
          result.canCreateRecoveryKnowledge
        ).toBe(false);


        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "conflicting Failure Mode Memory is excluded",
      async () => {
        const service =
          new MemoryCoverageContributionService({
            memoryRepository: {
              listMemories:
                jest.fn()
                  .mockResolvedValue([
                    {
                      id:
                        "matching",

                      metadata: {
                        failureModeId:
                          "FM-A",
                      },

                      confidence:
                        1,
                    },

                    {
                      id:
                        "different",

                      metadata: {
                        failureModeId:
                          "FM-B",
                      },

                      confidence:
                        1,
                    },
                  ]),
            },
          });


        const result =
          await service.evaluate({
            organizationId:
              "org",

            environmentId:
              "env",

            failureModeId:
              "FM-A",
          });


        expect(
          result.memoryCount
        ).toBe(1);
      }
    );


    test(
      "Memory source is PostgreSQL and never Qdrant authority",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              ROOT,
              "coverage/MemoryCoverageContributionService.js"
            ),
            "utf8"
          );


        expect(
          source
        ).toContain(
          "PostgresMemoryRepository"
        );


        expect(
          source
        ).toContain(
          "MemoryEvidenceAdapter"
        );


        expect(
          source
        ).not.toMatch(
          /require\s*\(\s*["'][^"']*qdrant[^"']*["']\s*\)/i
        );
      }
    );


    /*
     * ========================================================================
     * PHASE 19.19 — DYNAMIC REFRESH
     * ========================================================================
     */


    test(
      "refresh rediscovers canonical resources and Failure Modes every run",
      async () => {
        const resources = [
          {
            id:
              "resource-db",

            publicId:
              "resource-public",

            resourceType:
              "postgres.database",

            metadata: {
              criticality:
                "CRITICAL",
            },
          },
        ];


        const failureMode = {
          id:
            "fm-version-uuid",

          publicId:
            "fm-public",

          failureModeKey:
            "FM-POSTGRES",

          semver:
            "1.0.0",

          severity:
            "HIGH",

          requiredCapabilities:
            [],
        };


        const resourceInventory = {
          listAllResources:
            jest.fn()
              .mockResolvedValue(
                resources
              ),
        };


        const failureModeRepository = {
          listApplicableVersions:
            jest.fn()
              .mockResolvedValue([
                failureMode,
              ]),
        };


        const evaluationRepository = {
          upsertEvaluation:
            jest.fn()
              .mockImplementation(
                async (
                  input
                ) => ({
                  id:
                    "evaluation-uuid",

                  publicId:
                    "cov_eval_test",

                  evaluatedAt:
                    new Date(),

                  ...input,

                  executionAuthorized:
                    false,
                })
              ),
        };


        const snapshotRepository = {
          createSnapshot:
            jest.fn()
              .mockImplementation(
                async (
                  input
                ) => ({
                  id:
                    "snapshot-uuid",

                  publicId:
                    "cov_snapshot_test",

                  ...input,

                  executionAuthorized:
                    false,
                })
              ),
        };


        const gapRepository = {
          createSnapshotGaps:
            jest.fn()
              .mockImplementation(
                async ({
                  gaps,
                }) =>
                  gaps ||
                  []
              ),

          syncCurrentGaps:
            jest.fn()
              .mockImplementation(
                async ({
                  gaps,
                }) =>
                  gaps ||
                  []
              ),
        };


        const orchestrator =
          buildOrchestrator({
            resourceInventory,

            failureModeRepository,

            evaluationRepository,

            snapshotRepository,

            gapRepository,
          });


        await orchestrator.refresh({
          organizationId:
            "org",

          environmentId:
            "env",
        });


        await orchestrator.refresh({
          organizationId:
            "org",

          environmentId:
            "env",
        });


        expect(
          resourceInventory
            .listAllResources
        ).toHaveBeenCalledTimes(
          2
        );


        expect(
          failureModeRepository
            .listApplicableVersions
        ).toHaveBeenCalledTimes(
          2
        );


        expect(
          snapshotRepository
            .createSnapshot
        ).toHaveBeenCalledTimes(
          2
        );


        expect(
          gapRepository
            .createSnapshotGaps
        ).toHaveBeenCalledTimes(
          2
        );


        expect(
          gapRepository
            .syncCurrentGaps
        ).toHaveBeenCalledTimes(
          2
        );
      }
    );


    test(
      "new knowledge can change classification on the next refresh",
      async () => {
        let recoveryExists =
          false;


        const snapshotRepository = {
          createSnapshot:
            jest.fn()
              .mockImplementation(
                async (
                  input
                ) => ({
                  id:
                    "snapshot-uuid",

                  publicId:
                    "cov_snapshot_test",

                  ...input,

                  executionAuthorized:
                    false,
                })
              ),
        };


        const orchestrator =
          buildOrchestrator({
            resourceInventory: {
              listAllResources:
                jest.fn()
                  .mockResolvedValue([
                    {
                      id:
                        "resource-db",

                      publicId:
                        "resource-db-public",

                      resourceType:
                        "postgres.database",
                    },
                  ]),
            },


            failureModeRepository: {
              listApplicableVersions:
                jest.fn()
                  .mockResolvedValue([
                    {
                      id:
                        "fm-version",

                      publicId:
                        "fm-public",

                      failureModeKey:
                        "FM-DB",

                      semver:
                        "1.0.0",

                      requiredCapabilities:
                        [],
                    },
                  ]),
            },


            playbookResolver: {
              resolve:
                jest.fn(
                  async () => (
                    recoveryExists
                      ? {
                          hasPlaybookKnowledge:
                            true,

                          hasApprovedRecovery:
                            true,

                          complete:
                            true,

                          resolved: [
                            {
                              playbookId:
                                "PB-DB",

                              lifecycle:
                                "ACTIVE",

                              rollback: {
                                strategy:
                                  "RESTORE",
                              },

                              verification: {
                                checks: [
                                  {
                                    type:
                                      "HEALTH_CHECK",
                                  },
                                ],
                              },
                            },
                          ],

                          reasonCodes:
                            [],
                        }
                      : {
                          hasPlaybookKnowledge:
                            false,

                          hasApprovedRecovery:
                            false,

                          complete:
                            false,

                          resolved:
                            [],

                          reasonCodes: [
                            "NO_PLAYBOOK",
                          ],
                        }
                  )
                ),
            },


            snapshotRepository,
          });


        const first =
          await orchestrator.refresh({
            organizationId:
              "org",

            environmentId:
              "env",
          });


        expect(
          first
            .evaluations[0]
            .classification
        ).toBe(
          "UNKNOWN"
        );


        recoveryExists =
          true;


        const second =
          await orchestrator.refresh({
            organizationId:
              "org",

            environmentId:
              "env",
          });


        expect(
          second
            .evaluations[0]
            .classification
        ).not.toBe(
          "UNKNOWN"
        );


        expect(
          snapshotRepository
            .createSnapshot
        ).toHaveBeenCalledTimes(
          2
        );
      }
    );


    test(
      "Memory cannot promote missing recovery knowledge to COVERED",
      async () => {
        const orchestrator =
          buildOrchestrator({
            memoryService: {
              evaluate:
                jest.fn()
                  .mockResolvedValue({
                    occurrenceCount:
                      500,

                    memoryConfidence:
                      1,

                    outcomeConfidence:
                      1,

                    affectsClassification:
                      false,

                    affectsPriority:
                      true,

                    canCreateRecoveryKnowledge:
                      false,

                    historicalEvidenceOnly:
                      true,

                    executionAuthorized:
                      false,
                  }),
            },


            playbookResolver: {
              resolve:
                jest.fn()
                  .mockResolvedValue({
                    hasPlaybookKnowledge:
                      false,

                    hasApprovedRecovery:
                      false,

                    resolved:
                      [],

                    reasonCodes: [
                      "NO_PLAYBOOK",
                    ],

                    executionAuthorized:
                      false,
                  }),
            },
          });


        const result =
          await orchestrator.refresh({
            organizationId:
              "org",

            environmentId:
              "env",
          });


        expect(
          result
            .evaluations[0]
            .classification
        ).toBe(
          "UNKNOWN"
        );


        expect(
          result
            .evaluations[0]
            .memoryContribution
            .occurrenceCount
        ).toBe(
          500
        );


        expect(
          result
            .evaluations[0]
            .memoryContribution
            .affectsClassification
        ).toBe(false);


        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "refresh persists current canonical evaluations",
      async () => {
        const evaluationRepository = {
          upsertEvaluation:
            jest.fn()
              .mockImplementation(
                async (
                  input
                ) => ({
                  id:
                    "evaluation-uuid",

                  publicId:
                    "cov_eval_test",

                  evaluatedAt:
                    new Date(),

                  ...input,

                  executionAuthorized:
                    false,
                })
              ),
        };


        const orchestrator =
          buildOrchestrator({
            evaluationRepository,
          });


        const result =
          await orchestrator.refresh({
            organizationId:
              "org",

            environmentId:
              "env",
          });


        expect(
          evaluationRepository
            .upsertEvaluation
        ).toHaveBeenCalledTimes(
          1
        );


        const persistedInput =
          evaluationRepository
            .upsertEvaluation
            .mock
            .calls[0][0];


        expect(
          persistedInput
            .organizationId
        ).toBe(
          "org"
        );


        expect(
          persistedInput
            .environmentId
        ).toBe(
          "env"
        );


        expect(
          persistedInput
            .resourceId
        ).toBe(
          "resource-db"
        );


        expect(
          persistedInput
            .resourcePublicId
        ).toBe(
          "resource-db-public"
        );


        expect(
          persistedInput
            .failureModeVersionId
        ).toBe(
          "fm-version"
        );


        expect(
          persistedInput
            .executionAuthorized
        ).toBe(false);


        expect(
          result
            .evaluations[0]
            .id
        ).toBe(
          "evaluation-uuid"
        );
      }
    );


    /*
     * ========================================================================
     * IMMUTABLE SNAPSHOT BEHAVIOUR
     * ========================================================================
     */


    test(
      "each successful refresh creates one immutable historical snapshot",
      async () => {
        const snapshotRepository = {
          createSnapshot:
            jest.fn()
              .mockImplementation(
                async (
                  input
                ) => ({
                  id:
                    "snapshot-uuid",

                  publicId:
                    "cov_snapshot_test",

                  ...input,

                  executionAuthorized:
                    false,
                })
              ),
        };


        const orchestrator =
          buildOrchestrator({
            snapshotRepository,
          });


        const result =
          await orchestrator.refresh({
            organizationId:
              "org",

            environmentId:
              "env",
          });


        expect(
          snapshotRepository
            .createSnapshot
        ).toHaveBeenCalledTimes(
          1
        );


        const input =
          snapshotRepository
            .createSnapshot
            .mock
            .calls[0][0];


        expect(
          input.resourcesCount
        ).toBe(
          1
        );


        expect(
          input.applicableFailureModesCount
        ).toBe(
          1
        );


        expect(
          input.items
        ).toHaveLength(
          1
        );


        expect(
          input.items[0]
            .evaluationId
        ).toBe(
          "evaluation-uuid"
        );


        expect(
          input.items[0]
            .resourcePublicId
        ).toBe(
          "resource-db-public"
        );


        expect(
          input.items[0]
            .failureModeKey
        ).toBe(
          "FM-DB"
        );


        expect(
          input.items[0]
            .failureModeSemver
        ).toBe(
          "1.0.0"
        );


        expect(
          input.executionAuthorized
        ).toBe(false);


        expect(
          result.snapshot
        ).toBeDefined();


        expect(
          result
            .historicalSnapshotsImmutable
        ).toBe(true);
      }
    );


    test(
      "snapshot keeps canonical persisted evaluation identifier",
      async () => {
        const snapshotRepository = {
          createSnapshot:
            jest.fn()
              .mockImplementation(
                async (
                  input
                ) => ({
                  id:
                    "snapshot-uuid",

                  publicId:
                    "cov_snapshot_test",

                  ...input,

                  executionAuthorized:
                    false,
                })
              ),
        };


        const orchestrator =
          buildOrchestrator({
            snapshotRepository,
          });


        await orchestrator.refresh({
          organizationId:
            "org",

          environmentId:
            "env",
        });


        const snapshotInput =
          snapshotRepository
            .createSnapshot
            .mock
            .calls[0][0];


        expect(
          snapshotInput
            .items[0]
            .evaluationId
        ).toBe(
          "evaluation-uuid"
        );
      }
    );


    test(
      "headline snapshot counts sum to applicable Failure Mode evaluations",
      async () => {
        const snapshotRepository = {
          createSnapshot:
            jest.fn()
              .mockImplementation(
                async (
                  input
                ) => ({
                  ...input,

                  id:
                    "snapshot-uuid",

                  publicId:
                    "cov_snapshot_test",

                  executionAuthorized:
                    false,
                })
              ),
        };


        const orchestrator =
          buildOrchestrator({
            snapshotRepository,
          });


        await orchestrator.refresh({
          organizationId:
            "org",

          environmentId:
            "env",
        });


        const input =
          snapshotRepository
            .createSnapshot
            .mock
            .calls[0][0];


        const total =
          input.coveredCount +
          input.partialCount +
          input.humanOnlyCount +
          input.unknownCount;


        expect(
          total
        ).toBe(
          input
            .applicableFailureModesCount
        );
      }
    );


    /*
     * ========================================================================
     * PHASE 19.20 GAP PERSISTENCE
     * ========================================================================
     */


    test(
      "refresh persists current and immutable historical gaps",
      async () => {
        const gapRepository = {
          createSnapshotGaps:
            jest.fn()
              .mockImplementation(
                async ({
                  gaps,
                }) =>
                  gaps
              ),

          syncCurrentGaps:
            jest.fn()
              .mockImplementation(
                async ({
                  gaps,
                }) =>
                  gaps
              ),
        };


        const orchestrator =
          buildOrchestrator({
            gapRepository,
          });


        const result =
          await orchestrator.refresh({
            organizationId:
              "org",

            environmentId:
              "env",
          });


        expect(
          gapRepository
            .createSnapshotGaps
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          gapRepository
            .syncCurrentGaps
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          Array.isArray(
            result.currentGaps
          )
        ).toBe(true);


        expect(
          result.historicalGapCount
        ).toBeGreaterThanOrEqual(
          0
        );


        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "snapshot gap persistence is linked to the newly created snapshot",
      async () => {
        const gapRepository = {
          createSnapshotGaps:
            jest.fn()
              .mockResolvedValue(
                []
              ),

          syncCurrentGaps:
            jest.fn()
              .mockResolvedValue(
                []
              ),
        };


        const orchestrator =
          buildOrchestrator({
            snapshotRepository: {
              createSnapshot:
                jest.fn()
                  .mockResolvedValue({
                    id:
                      "snapshot-uuid-19",

                    publicId:
                      "cov_snapshot_test",

                    executionAuthorized:
                      false,
                  }),
            },

            gapRepository,
          });


        await orchestrator.refresh({
          organizationId:
            "org",

          environmentId:
            "env",
        });


        expect(
          gapRepository
            .createSnapshotGaps
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            snapshotId:
              "snapshot-uuid-19",

            organizationId:
              "org",

            environmentId:
              "env",
          })
        );


        expect(
          gapRepository
            .syncCurrentGaps
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            snapshotId:
              "snapshot-uuid-19",

            organizationId:
              "org",

            environmentId:
              "env",
          })
        );
      }
    );


    /*
     * ========================================================================
     * ARCHITECTURAL SAFETY
     * ========================================================================
     */


    test(
      "refresh never creates or mutates Phase 18 knowledge",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              ROOT,
              "coverage/CoverageRefreshOrchestrator.js"
            ),
            "utf8"
          );


        expect(
          source
        ).not.toMatch(
          /\.createVersion\s*\(/
        );


        expect(
          source
        ).not.toMatch(
          /\.createDefinition\s*\(/
        );


        expect(
          source
        ).not.toMatch(
          /executionAuthorized\s*:\s*true/
        );
      }
    );


    test(
      "refresh explicitly preserves knowledge and authorization boundaries",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              ROOT,
              "coverage/CoverageRefreshOrchestrator.js"
            ),
            "utf8"
          );


        expect(
          source
        ).toContain(
          "dynamicKnowledgeDiscovery"
        );


        expect(
          source
        ).toContain(
          "selfGeneratedRecoveryKnowledge"
        );


        expect(
          source
        ).toContain(
          "coverageImpliesExecution"
        );


        expect(
          source
        ).toContain(
          "historicalSnapshotsImmutable"
        );
      }
    );
  }
);


/*
 * ============================================================================
 * ORCHESTRATOR FIXTURE
 * ============================================================================
 *
 * Every persistence dependency is mocked here.
 *
 * Unit tests must never reach a real PostgreSQL connection.
 * ============================================================================
 */


function buildOrchestrator(
  overrides = {}
) {
  const defaults = {
    resourceInventory: {
      listAllResources:
        jest.fn()
          .mockResolvedValue([
            {
              id:
                "resource-db",

              publicId:
                "resource-db-public",

              resourceType:
                "postgres.database",

              metadata: {
                criticality:
                  "HIGH",
              },
            },
          ]),
    },


    failureModeRepository: {
      listApplicableVersions:
        jest.fn()
          .mockResolvedValue([
            {
              id:
                "fm-version",

              publicId:
                "fm-public",

              failureModeKey:
                "FM-DB",

              semver:
                "1.0.0",

              severity:
                "HIGH",

              requiredCapabilities:
                [],
            },
          ]),
    },


    playbookResolver: {
      resolve:
        jest.fn()
          .mockResolvedValue({
            hasPlaybookKnowledge:
              true,

            hasApprovedRecovery:
              true,

            complete:
              true,

            resolved: [
              {
                playbookId:
                  "PB-DB",

                lifecycle:
                  "ACTIVE",

                rollback: {
                  strategy:
                    "RESTORE",
                },

                verification: {
                  strategy:
                    "ALL",

                  checks: [
                    {
                      type:
                        "HEALTH_CHECK",
                    },
                  ],
                },
              },
            ],

            reasonCodes:
              [],

            executionAuthorized:
              false,
          }),
    },


    procedureService: {
      evaluate:
        jest.fn()
          .mockResolvedValue({
            complete:
              true,

            hasCompleteRecoveryProcedure:
              true,

            runbooks: [
              {
                runbookId:
                  "RB-DB",

                lifecycle:
                  "ACTIVE",

                rollback: {
                  strategy:
                    "RESTORE",
                },

                verification: {
                  checks: [
                    {
                      type:
                        "HEALTH_CHECK",
                    },
                  ],
                },
              },
            ],

            reasonCodes:
              [],

            executionAuthorized:
              false,
          }),
    },


    evidenceService: {
      evaluate:
        jest.fn()
          .mockReturnValue({
            complete:
              true,

            confidence:
              1,

            reasonCodes:
              [],

            executionAuthorized:
              false,
          }),
    },


    capabilityService: {
      evaluate:
        jest.fn()
          .mockResolvedValue({
            complete:
              true,

            technicallyApplicable:
              true,

            reasonCodes:
              [],

            executionAuthorized:
              false,
          }),
    },


    policyService: {
      evaluate:
        jest.fn()
          .mockReturnValue({
            policyReady:
              true,

            policyBlocked:
              false,

            approvalRequired:
              false,

            humanOnlyCandidate:
              false,

            reasonCodes:
              [],

            executionAuthorized:
              false,
          }),
    },


    rollbackService: {
      evaluate:
        jest.fn()
          .mockReturnValue({
            complete:
              true,

            rollbackAvailable:
              true,

            fullyRollbackable:
              true,

            reasonCodes:
              [],

            executionAuthorized:
              false,
          }),
    },


    verificationService: {
      evaluate:
        jest.fn()
          .mockReturnValue({
            complete:
              true,

            verificationDefined:
              true,

            commandSuccessIsVerification:
              false,

            reasonCodes:
              [],

            executionAuthorized:
              false,
          }),
    },


    escalationService: {
      evaluate:
        jest.fn()
          .mockReturnValue({
            escalationDefined:
              true,

            humanEscalationAvailable:
              true,

            reasonCodes:
              [],

            executionAuthorized:
              false,
          }),
    },


    historyService: {
      evaluate:
        jest.fn()
          .mockResolvedValue({
            tested:
              true,

            sufficientlyValidated:
              true,

            proven:
              true,

            averageSampleConfidence:
              1,

            reasonCodes:
              [],

            historicalEvidenceOnly:
              true,

            executionAuthorized:
              false,
          }),
    },


    memoryService: {
      evaluate:
        jest.fn()
          .mockResolvedValue({
            memoryCount:
              0,

            occurrenceCount:
              0,

            memoryConfidence:
              0,

            outcomeConfidence:
              0,

            affectsClassification:
              false,

            affectsPriority:
              true,

            affectsConfidence:
              true,

            canCreateRecoveryKnowledge:
              false,

            historicalEvidenceOnly:
              true,

            executionAuthorized:
              false,
          }),
    },


    topologyService: {
      evaluate:
        jest.fn()
          .mockResolvedValue({
            affectedResourceCount:
              0,

            blastRadiusScore:
              0,

            causalityEstablished:
              false,

            correlationIsCausation:
              false,

            topologyEvidenceOnly:
              true,

            executionAuthorized:
              false,
          }),
    },


    evaluationRepository: {
      upsertEvaluation:
        jest.fn()
          .mockImplementation(
            async (
              input
            ) => ({
              id:
                "evaluation-uuid",

              publicId:
                "cov_eval_test",

              evaluatedAt:
                new Date(),

              ...input,

              executionAuthorized:
                false,
            })
          ),
    },


    snapshotRepository: {
      createSnapshot:
        jest.fn()
          .mockImplementation(
            async (
              input
            ) => ({
              id:
                "snapshot-uuid",

              publicId:
                "cov_snapshot_test",

              ...input,

              items:
                input.items ||
                [],

              executionAuthorized:
                false,
            })
          ),
    },


    gapRepository: {
      createSnapshotGaps:
        jest.fn()
          .mockImplementation(
            async ({
              gaps,
            }) =>
              gaps ||
              []
          ),

      syncCurrentGaps:
        jest.fn()
          .mockImplementation(
            async ({
              gaps,
            }) =>
              gaps ||
              []
          ),
    },


    evidenceProvider:
      jest.fn()
        .mockResolvedValue({
          evidence:
            [],

          availableEvidenceRequirementIds:
            [],
        }),


    policyDecisionProvider:
      jest.fn()
        .mockResolvedValue({
          policyDecision: {
            allowed:
              true,

            decision:
              "ALLOW",
          },
        }),


    platformCapabilityProvider:
      jest.fn()
        .mockResolvedValue(
          []
        ),


    resourceImportanceProvider:
      jest.fn()
        .mockResolvedValue(
          "HIGH"
        ),
  };


  return new CoverageRefreshOrchestrator({
    ...defaults,

    ...overrides,
  });
}