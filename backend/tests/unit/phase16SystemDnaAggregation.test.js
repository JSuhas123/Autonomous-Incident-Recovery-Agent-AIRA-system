"use strict";


const {
  SystemDnaAggregator,
} =
  require(
    "../../services/memory/dna/systemDnaAggregator"
  );


const {
  SystemDnaSynthesizer,
} =
  require(
    "../../services/memory/dna/systemDnaSynthesizer"
  );


const {
  ScopedSystemDnaService,
} =
  require(
    "../../services/memory/dna/scopedSystemDnaService"
  );


const {
  SystemDnaService,
} =
  require(
    "../../services/memory/dna/systemDnaService"
  );


describe(
  "Phase 16.15B-D System DNA aggregation and synthesis",
  () => {

    function memory(
      memoryType,
      overrides =
        {}
    ) {
      return {
        publicId:
          `mem-${memoryType.toLowerCase()}`,

        memoryType,

        scopeType:
          "SERVICE",

        status:
          "ACTIVE",

        confidence:
          0.8,

        trustScore:
          0.9,

        serviceId:
          "service-api",

        summary:
          `${memoryType} summary`,

        content:
          {},

        ...overrides,
      };
    }


    function emptyDescendantSearchService() {
      return {
        search:
          jest.fn(
            async () => ({
              memories:
                [],

              diagnostics: {
                candidateCount:
                  0,

                hydratedCount:
                  0,

                rejectedCount:
                  0,
              },
            })
          ),
      };
    }


    test(
      "aggregator separates all six memory families",
      () => {
        const aggregator =
          new SystemDnaAggregator();


        const result =
          aggregator.aggregate([
            memory(
              "EPISODIC"
            ),

            memory(
              "OUTCOME"
            ),

            memory(
              "PROCEDURAL"
            ),

            memory(
              "SEMANTIC"
            ),

            memory(
              "HUMAN"
            ),

            memory(
              "BEHAVIOURAL"
            ),
          ]);


        expect(
          result
            .coverage
            .complete
        ).toBe(
          true
        );


        expect(
          result
            .coverage
            .familyCount
        ).toBe(
          6
        );


        expect(
          result.memoryCount
        ).toBe(
          6
        );
      }
    );


    test(
      "inactive memories are excluded from DNA",
      () => {
        const aggregator =
          new SystemDnaAggregator();


        const result =
          aggregator.aggregate([
            memory(
              "SEMANTIC"
            ),

            memory(
              "HUMAN",
              {
                publicId:
                  "human-stale",

                status:
                  "STALE",
              }
            ),
          ]);


        expect(
          result.memoryCount
        ).toBe(
          1
        );


        expect(
          result
            .counts
            .HUMAN
        ).toBe(
          0
        );
      }
    );


    test(
      "aggregator computes average trust and confidence",
      () => {
        const aggregator =
          new SystemDnaAggregator();


        const result =
          aggregator.aggregate([
            memory(
              "SEMANTIC",
              {
                confidence:
                  0.8,

                trustScore:
                  0.6,
              }
            ),

            memory(
              "PROCEDURAL",
              {
                confidence:
                  1,

                trustScore:
                  1,
              }
            ),
          ]);


        expect(
          result.averageConfidence
        ).toBeCloseTo(
          0.9
        );


        expect(
          result.averageTrust
        ).toBeCloseTo(
          0.8
        );
      }
    );


    test(
      "semantic memory becomes a DNA pattern",
      () => {
        const aggregator =
          new SystemDnaAggregator();


        const synthesizer =
          new SystemDnaSynthesizer();


        const aggregation =
          aggregator.aggregate([
            memory(
              "SEMANTIC",
              {
                content: {
                  knowledge: {
                    symptom:
                      "high latency",

                    cause:
                      "database saturation",
                  },
                },
              }
            ),
          ]);


        const result =
          synthesizer.synthesize(
            aggregation
          );


        expect(
          result.patterns
        ).toHaveLength(
          1
        );


        expect(
          result.patterns[0]
            .cause
        ).toBe(
          "database saturation"
        );
      }
    );


    test(
      "procedural memory becomes recovery procedure DNA",
      () => {
        const aggregator =
          new SystemDnaAggregator();


        const synthesizer =
          new SystemDnaSynthesizer();


        const aggregation =
          aggregator.aggregate([
            memory(
              "PROCEDURAL",
              {
                content: {
                  procedure: {
                    action:
                      "restart-service",
                  },
                },
              }
            ),
          ]);


        const result =
          synthesizer.synthesize(
            aggregation
          );


        expect(
          result.procedures[0]
            .action
        ).toBe(
          "restart-service"
        );
      }
    );


    test(
      "human history becomes explicit DNA guidance",
      () => {
        const aggregator =
          new SystemDnaAggregator();


        const synthesizer =
          new SystemDnaSynthesizer();


        const aggregation =
          aggregator.aggregate([
            memory(
              "HUMAN",
              {
                content: {
                  humanAction: {
                    actionType:
                      "REJECTED",

                    recommendation:
                      "restart-service",

                    reason:
                      "settlement window",
                  },
                },
              }
            ),
          ]);


        const result =
          synthesizer.synthesize(
            aggregation
          );


        expect(
          result
            .humanGuidance[0]
            .actionType
        ).toBe(
          "REJECTED"
        );


        expect(
          result
            .humanGuidance[0]
            .recommendation
        ).toBe(
          "restart-service"
        );
      }
    );


    test(
      "behavioural memory becomes operational baseline",
      () => {
        const aggregator =
          new SystemDnaAggregator();


        const synthesizer =
          new SystemDnaSynthesizer();


        const aggregation =
          aggregator.aggregate([
            memory(
              "BEHAVIOURAL",
              {
                content: {
                  baseline: {
                    cpuP95:
                      65,
                  },
                },
              }
            ),
          ]);


        const result =
          synthesizer.synthesize(
            aggregation
          );


        expect(
          result
            .behaviouralBaselines[0]
            .baseline
            .cpuP95
        ).toBe(
          65
        );
      }
    );


    test(
      "scoped service reuses certified agent memory pipeline",
      async () => {
        const contextBuilder =
          jest.fn(
            async () => ({
              contextVersion:
                "16.14.1",

              memories: [
                memory(
                  "PROCEDURAL",
                  {
                    content: {
                      procedure: {
                        action:
                          "restart-service",
                      },
                    },
                  }
                ),
              ],

              diagnostics:
                {},

              conflicts: {
                conflictCount:
                  0,

                requiresHumanReview:
                  false,

                critical:
                  false,
              },
            })
          );


        const searchService =
          emptyDescendantSearchService();


        const service =
          new ScopedSystemDnaService({
            contextBuilder,

            searchService,

            dnaService:
              new SystemDnaService(),
          });


        const result =
          await service.build({
            organizationId:
              "aira-dev-org",

            canonicalOrganizationId:
              "org-uuid",

            scopeType:
              "SERVICE",

            environmentId:
              "env-public",

            canonicalEnvironmentId:
              "env-uuid",

            serviceId:
              "service-api",
          });


        expect(
          contextBuilder
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          searchService.search
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          result
            .dna
            .scopeType
        ).toBe(
          "SERVICE"
        );


        expect(
          result
            .dna
            .tenantPublicId
        ).toBe(
          "aira-dev-org"
        );


        expect(
          result
            .dna
            .organizationId
        ).toBe(
          "org-uuid"
        );
      }
    );


    test(
      "service DNA retains evidence provenance",
      async () => {
        const searchService =
          emptyDescendantSearchService();


        const service =
          new ScopedSystemDnaService({
            contextBuilder:
              async () => ({
                contextVersion:
                  "16.14.1",

                memories: [
                  memory(
                    "SEMANTIC",
                    {
                      publicId:
                        "mem-semantic-1",
                    }
                  ),

                  memory(
                    "PROCEDURAL",
                    {
                      publicId:
                        "mem-procedure-1",
                    }
                  ),
                ],

                diagnostics:
                  {},

                conflicts: {
                  conflictCount:
                    0,

                  requiresHumanReview:
                    false,

                  critical:
                    false,
                },
              }),

            searchService,

            dnaService:
              new SystemDnaService(),
          });


        const result =
          await service.build({
            organizationId:
              "aira-dev-org",

            scopeType:
              "SERVICE",

            environmentId:
              "env",

            serviceId:
              "service",
          });


        expect(
          result
            .dna
            .evidenceMemoryIds
        ).toEqual(
          expect.arrayContaining([
            "mem-semantic-1",
            "mem-procedure-1",
          ])
        );


        expect(
          result
            .dna
            .evidenceCount
        ).toBe(
          2
        );


        expect(
          searchService.search
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );


    test(
      "SERVICE DNA inherits INCIDENT outcome evidence belonging to the service",
      async () => {
        const contextBuilder =
          jest.fn(
            async () => ({
              contextVersion:
                "16.14.1",

              memories: [
                memory(
                  "PROCEDURAL",
                  {
                    publicId:
                      "procedure-service",
                  }
                ),
              ],

              diagnostics:
                {},

              conflicts: {
                conflictCount:
                  0,

                requiresHumanReview:
                  false,

                critical:
                  false,
              },
            })
          );


        const searchService = {
          search:
            jest.fn(
              async () => ({
                memories: [
                  memory(
                    "OUTCOME",
                    {
                      publicId:
                        "outcome-incident",

                      scopeType:
                        "INCIDENT",

                      incidentPublicId:
                        "inc-1",

                      content: {
                        recoveryDecision: {
                          action:
                            "restart-service",
                        },

                        outcome: {
                          classification:
                            "SUCCESS",
                        },
                      },
                    }
                  ),
                ],

                diagnostics: {
                  candidateCount:
                    1,

                  hydratedCount:
                    1,

                  rejectedCount:
                    0,
                },
              })
            ),
        };


        const service =
          new ScopedSystemDnaService({
            contextBuilder,

            searchService,
          });


        const result =
          await service.build({
            organizationId:
              "aira-dev-org",

            canonicalOrganizationId:
              "org-uuid",

            scopeType:
              "SERVICE",

            environmentId:
              "env-public",

            canonicalEnvironmentId:
              "env-uuid",

            serviceId:
              "service-api",
          });


        expect(
          searchService.search
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            organizationId:
              "aira-dev-org",

            environmentId:
              "env-public",

            serviceId:
              "service-api",

            scopes:
              expect.arrayContaining([
                "INCIDENT",
              ]),
          })
        );


        expect(
          result
            .dna
            .memoryFamilyCounts
            .OUTCOME
        ).toBe(
          1
        );


        expect(
          result
            .dna
            .outcomes
        ).toHaveLength(
          1
        );


        expect(
          result
            .dna
            .evidenceMemoryIds
        ).toContain(
          "outcome-incident"
        );
      }
    );


    test(
      "System DNA remains evidence-only and cannot authorize execution",
      async () => {
        const searchService =
          emptyDescendantSearchService();


        const service =
          new ScopedSystemDnaService({
            contextBuilder:
              async () => ({
                contextVersion:
                  "16.14.1",

                memories:
                  [],

                diagnostics:
                  {},

                conflicts: {
                  conflictCount:
                    0,

                  requiresHumanReview:
                    false,

                  critical:
                    false,
                },
              }),

            searchService,
          });


        const result =
          await service.build({
            organizationId:
              "aira-dev-org",

            scopeType:
              "TENANT",
          });


        expect(
          result.safety
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          result.safety
            .evidenceOnly
        ).toBe(
          true
        );


        expect(
          result
            .dna
            .safety
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          result
            .dna
            .safety
            .bypassesPolicy
        ).toBe(
          false
        );
      }
    );
  }
);