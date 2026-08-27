"use strict";


const {
  AgentMemoryContextPipeline,
} =
  require(
    "../../services/memory/context/agentMemoryContextPipeline"
  );


describe(
  "Phase 16.14G agent memory context pipeline",
  () => {

    function baseMemory(
      overrides =
        {}
    ) {
      return {
        id:
          "memory-id",

        publicId:
          "memory-1",

        organizationId:
          "aira-dev-org",

        environmentId:
          "env_aira_development",

        serviceId:
          "api",

        incidentId:
          "inc-1",

        memoryType:
          "EPISODIC",

        scopeType:
          "INCIDENT",

        status:
          "ACTIVE",

        confidence:
          0.9,

        trustScore:
          0.9,

        evidenceCount:
          5,

        sourceCount:
          4,

        observedAt:
          "2026-08-28T00:00:00.000Z",

        content:
          {},

        metadata: {
          executionAuthorized:
            false,
        },

        ...overrides,
      };
    }


    function createPipeline({
      memories =
        [],
      conflicts =
        null,
    } = {}) {
      const contextService = {
        buildContext:
          jest.fn(
            async () => ({
              contextVersion:
                "16.14.1",

              request: {
                organizationId:
                  "aira-dev-org",

                environmentId:
                  "env_aira_development",

                serviceId:
                  "api",

                resourceId:
                  null,

                incidentId:
                  "inc-1",

                query:
                  "Investigate incident",
              },

              memories,

              diagnostics: {
                candidateCount:
                  memories.length,

                hydratedCount:
                  memories.length,

                rejectedCount:
                  0,
              },

              safety: {
                executionAuthorized:
                  false,

                grantsExecutionPermission:
                  false,

                bypassesPolicy:
                  false,

                suppressesAlerts:
                  false,
              },
            })
          ),
      };


      const lifecycleService = {
        filterRetrievalEligible:
          jest.fn(
            (
              input
            ) => ({
              accepted:
                input.filter(
                  (
                    memory
                  ) =>
                    memory.status ===
                    "ACTIVE"
                ),

              rejected:
                input
                  .filter(
                    (
                      memory
                    ) =>
                      memory.status !==
                      "ACTIVE"
                  )
                  .map(
                    (
                      memory
                    ) => ({
                      memory,

                      reason:
                        `MEMORY_STATUS_${memory.status}`,
                    })
                  ),
            })
          ),
      };


      const scopeResolver = {
        resolveMany:
          jest.fn(
            ({
              memories:
                accepted,
            }) => ({
              accepted:
                accepted.map(
                  (
                    memory
                  ) => ({
                    memory,

                    resolution: {
                      eligible:
                        true,

                      scopeType:
                        memory.scopeType,

                      scopeScore:
                        memory.scopeType ===
                          "INCIDENT"
                          ? 600
                          : memory.scopeType ===
                              "SERVICE"
                            ? 400
                            : 200,

                      matchLevel:
                        memory.scopeType,
                    },
                  })
                ),

              rejected:
                [],

              diagnostics: {
                inputCount:
                  accepted.length,

                acceptedCount:
                  accepted.length,

                rejectedCount:
                  0,

                rejectionReasons:
                  {},
              },
            })
          ),
      };


      const trustScorer = {
        scoreMany:
          jest.fn(
            ({
              resolvedMemories,
            }) =>
              resolvedMemories
                .map(
                  (
                    item
                  ) => ({
                    ...item,

                    trust: {
                      score:
                        item
                          .memory
                          .trustScore,

                      components: {
                        scope:
                          1,

                        trust:
                          item
                            .memory
                            .trustScore,

                        confidence:
                          item
                            .memory
                            .confidence,
                      },
                    },
                  })
                )
                .sort(
                  (
                    left,
                    right
                  ) =>
                    right
                      .trust
                      .score -
                    left
                      .trust
                      .score
                )
          ),
      };


      const conflictResolver = {
        resolve:
          jest.fn(
            () =>
              conflicts ||
              ({
                hasConflicts:
                  false,

                conflictCount:
                  0,

                conflicts:
                  [],

                requiresHumanReview:
                  false,

                critical:
                  false,

                safety: {
                  executionAuthorized:
                    false,

                  grantsExecutionPermission:
                    false,

                  automaticConflictResolution:
                    false,
                },
              })
          ),
      };


      const contract = {
        assertSafeContext:
          jest.fn(
            () =>
              true
          ),
      };


      return new AgentMemoryContextPipeline({
        contextService,

        lifecycleService,

        scopeResolver,

        trustScorer,

        conflictResolver,

        contract,
      });
    }


    test(
      "combines retrieval lifecycle scope trust and conflict layers",
      async () => {
        const pipeline =
          createPipeline({
            memories: [
              baseMemory(),
            ],
          });


        const result =
          await pipeline.build({
            organizationId:
              "aira-dev-org",

            environmentId:
              "env_aira_development",

            serviceId:
              "api",

            incidentId:
              "inc-1",

            query:
              "Investigate incident",
          });


        expect(
          result.rankedMemories
        ).toHaveLength(
          1
        );


        expect(
          result
            .rankedMemories[0]
            .memory
            .publicId
        ).toBe(
          "memory-1"
        );


        expect(
          result
            .rankedMemories[0]
            .rank
        ).toBe(
          1
        );
      }
    );


    test(
      "non-active memory is removed before ranking",
      async () => {
        const pipeline =
          createPipeline({
            memories: [
              baseMemory({
                publicId:
                  "active",

                status:
                  "ACTIVE",
              }),

              baseMemory({
                publicId:
                  "revoked",

                status:
                  "REVOKED",
              }),
            ],
          });


        const result =
          await pipeline.build({
            organizationId:
              "aira-dev-org",

            query:
              "Investigate",
          });


        expect(
          result.memories
        ).toHaveLength(
          1
        );


        expect(
          result.memories[0]
            .publicId
        ).toBe(
          "active"
        );


        expect(
          result
            .diagnostics
            .lifecycle
            .rejectedCount
        ).toBe(
          1
        );
      }
    );


    test(
      "higher trust memory is ranked first",
      async () => {
        const pipeline =
          createPipeline({
            memories: [
              baseMemory({
                publicId:
                  "weak",

                trustScore:
                  0.3,
              }),

              baseMemory({
                publicId:
                  "strong",

                trustScore:
                  0.95,

                scopeType:
                  "SERVICE",
              }),
            ],
          });


        const result =
          await pipeline.build({
            organizationId:
              "aira-dev-org",

            query:
              "Investigate",
          });


        expect(
          result
            .rankedMemories[0]
            .memory
            .publicId
        ).toBe(
          "strong"
        );
      }
    );


    test(
      "conflicts are surfaced to agent context",
      async () => {
        const pipeline =
          createPipeline({
            memories: [
              baseMemory({
                publicId:
                  "procedure",

                memoryType:
                  "PROCEDURAL",

                scopeType:
                  "SERVICE",
              }),

              baseMemory({
                publicId:
                  "human",

                memoryType:
                  "HUMAN",

                scopeType:
                  "INCIDENT",
              }),
            ],

            conflicts: {
              hasConflicts:
                true,

              conflictCount:
                1,

              conflicts: [
                {
                  type:
                    "HUMAN_OVERRIDE_CONFLICT",

                  severity:
                    "HIGH",

                  requiresHumanReview:
                    true,
                },
              ],

              requiresHumanReview:
                true,

              critical:
                false,

              safety: {
                executionAuthorized:
                  false,

                grantsExecutionPermission:
                  false,

                automaticConflictResolution:
                  false,
              },
            },
          });


        const result =
          await pipeline.build({
            organizationId:
              "aira-dev-org",

            query:
              "Should service restart?",
          });


        expect(
          result
            .conflicts
            .hasConflicts
        ).toBe(
          true
        );


        expect(
          result
            .conflicts
            .requiresHumanReview
        ).toBe(
          true
        );
      }
    );


    test(
      "final context is evidence only",
      async () => {
        const pipeline =
          createPipeline({
            memories: [
              baseMemory(),
            ],
          });


        const result =
          await pipeline.build({
            organizationId:
              "aira-dev-org",

            query:
              "Should we restart?",
          });


        expect(
          result
            .safety
            .memoryIsEvidenceOnly
        ).toBe(
          true
        );


        expect(
          result
            .safety
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          result
            .safety
            .grantsExecutionPermission
        ).toBe(
          false
        );
      }
    );


    test(
      "policy authorization entitlement and kill switch remain mandatory",
      async () => {
        const pipeline =
          createPipeline();


        const result =
          await pipeline.build({
            organizationId:
              "aira-dev-org",

            query:
              "Execute recovery",
          });


        expect(
          result.safety
        ).toMatchObject({
          bypassesPolicy:
            false,

          bypassesApproval:
            false,

          bypassesEntitlements:
            false,

          bypassesKillSwitch:
            false,

          requiresPolicyEvaluation:
            true,

          requiresAuthorization:
            true,
        });
      }
    );


    test(
      "unsafe mutated final context is rejected",
      () => {
        const pipeline =
          createPipeline();


        expect(
          () =>
            pipeline
              .assertSafeAgentContext({
                safety: {
                  executionAuthorized:
                    true,

                  grantsExecutionPermission:
                    false,

                  bypassesPolicy:
                    false,

                  bypassesApproval:
                    false,

                  bypassesEntitlements:
                    false,

                  bypassesKillSwitch:
                    false,

                  suppressesAlerts:
                    false,

                  automaticConflictResolution:
                    false,

                  memoryIsEvidenceOnly:
                    true,

                  requiresPolicyEvaluation:
                    true,

                  requiresAuthorization:
                    true,
                },
              })
        ).toThrow(
          expect.objectContaining({
            code:
              "AGENT_MEMORY_CONTEXT_SAFETY_VIOLATION",
          })
        );
      }
    );


    test(
      "memory cannot declare policy evaluation unnecessary",
      () => {
        const pipeline =
          createPipeline();


        expect(
          () =>
            pipeline
              .assertSafeAgentContext({
                safety: {
                  executionAuthorized:
                    false,

                  grantsExecutionPermission:
                    false,

                  bypassesPolicy:
                    false,

                  bypassesApproval:
                    false,

                  bypassesEntitlements:
                    false,

                  bypassesKillSwitch:
                    false,

                  suppressesAlerts:
                    false,

                  automaticConflictResolution:
                    false,

                  memoryIsEvidenceOnly:
                    true,

                  requiresPolicyEvaluation:
                    false,

                  requiresAuthorization:
                    true,
                },
              })
        ).toThrow(
          expect.objectContaining({
            code:
              "AGENT_MEMORY_CONTEXT_POLICY_REQUIRED",
          })
        );
      }
    );


    test(
      "empty retrieval still returns safe agent context",
      async () => {
        const pipeline =
          createPipeline({
            memories:
              [],
          });


        const result =
          await pipeline.build({
            organizationId:
              "aira-dev-org",

            query:
              "Investigate unknown issue",
          });


        expect(
          result.memories
        ).toEqual(
          []
        );


        expect(
          result.safety
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );
  }
);