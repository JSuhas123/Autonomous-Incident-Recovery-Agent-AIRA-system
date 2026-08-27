"use strict";


const {
  SemanticMemoryBuilder,
} =
  require(
    "../../services/memory/semantic/semanticMemoryBuilder"
  );


const {
  SemanticMemoryService,
} =
  require(
    "../../services/memory/semantic/semanticMemoryService"
  );


function evidence({
  id,

  symptom =
    "high API latency",

  cause =
    "database connection saturation",

  contradicts =
    false,

  confidence =
    0.9,

  trustScore =
    0.9,
}) {
  return {
    publicId:
      `memory-${id}`,

    symptom,

    cause,

    contradicts,

    confidence,

    trustScore,
  };
}


describe(
  "Phase 16.11 semantic memory synthesis",
  () => {

    test(
      "single observation cannot become semantic knowledge",
      () => {
        const builder =
          new SemanticMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            symptom:
              "high latency",

            cause:
              "db saturation",

            evidence: [
              evidence({
                id:
                  1,
              }),
            ],
          });


        expect(
          result.eligible
        ).toBe(
          false
        );


        expect(
          result.reason
        ).toBe(
          "INSUFFICIENT_EVIDENCE"
        );
      }
    );


    test(
      "three consistent observations create semantic memory",
      () => {
        const builder =
          new SemanticMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            serviceId:
              "api",

            symptom:
              "high latency",

            cause:
              "db saturation",

            evidence: [
              evidence({
                id:
                  1,
              }),

              evidence({
                id:
                  2,
              }),

              evidence({
                id:
                  3,
              }),
            ],
          });


        expect(
          result.eligible
        ).toBe(
          true
        );


        expect(
          result.memory.memoryType
        ).toBe(
          "SEMANTIC"
        );


        expect(
          result.memory.scopeType
        ).toBe(
          "SERVICE"
        );


        expect(
          result.memory
            .content
            .knowledge
            .causalCertainty
        ).toBe(
          "OBSERVED_ASSOCIATION"
        );
      }
    );


    test(
      "contradictions reduce consistency",
      () => {
        const builder =
          new SemanticMemoryBuilder();


        const result =
          builder
            .calculateStatistics([
              evidence({
                id:
                  1,
              }),

              evidence({
                id:
                  2,
              }),

              evidence({
                id:
                  3,
                contradicts:
                  true,
              }),
            ]);


        expect(
          result.supporting
        ).toBe(
          2
        );


        expect(
          result.contradicting
        ).toBe(
          1
        );


        expect(
          result.consistency
        ).toBeCloseTo(
          2 / 3
        );
      }
    );


    test(
      "low consistency prevents semantic promotion",
      () => {
        const builder =
          new SemanticMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            symptom:
              "high latency",

            cause:
              "db saturation",

            minimumEvidence:
              3,

            minimumConsistency:
              0.75,

            evidence: [
              evidence({
                id:
                  1,
              }),

              evidence({
                id:
                  2,
              }),

              evidence({
                id:
                  3,
              }),

              evidence({
                id:
                  4,
                contradicts:
                  true,
              }),

              evidence({
                id:
                  5,
                contradicts:
                  true,
              }),
            ],
          });


        expect(
          result.eligible
        ).toBe(
          false
        );


        expect(
          result.reason
        ).toBe(
          "CONSISTENCY_BELOW_THRESHOLD"
        );
      }
    );


    test(
      "semantic id is deterministic",
      () => {
        const builder =
          new SemanticMemoryBuilder();


        const first =
          builder
            .buildPublicId({
              organizationId:
                "org-a",

              environmentId:
                "env-a",

              serviceId:
                "api",

              symptom:
                "high latency",

              cause:
                "db saturation",
            });


        const second =
          builder
            .buildPublicId({
              organizationId:
                "org-a",

              environmentId:
                "env-a",

              serviceId:
                "api",

              symptom:
                "high latency",

              cause:
                "db saturation",
            });


        expect(
          first
        ).toBe(
          second
        );
      }
    );


    test(
      "semantic memory does not claim proven causation",
      () => {
        const builder =
          new SemanticMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            symptom:
              "high latency",

            cause:
              "db saturation",

            evidence: [
              evidence({
                id:
                  1,
              }),

              evidence({
                id:
                  2,
              }),

              evidence({
                id:
                  3,
              }),
            ],
          });


        expect(
          result.memory
            .content
            .knowledge
            .relationshipType
        ).toBe(
          "CAUSE_ASSOCIATION"
        );


        expect(
          result.memory
            .content
            .knowledge
            .causalCertainty
        ).toBe(
          "OBSERVED_ASSOCIATION"
        );
      }
    );


    test(
      "semantic memory never authorizes execution",
      () => {
        const builder =
          new SemanticMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            symptom:
              "high latency",

            cause:
              "db saturation",

            evidence: [
              evidence({
                id:
                  1,
              }),

              evidence({
                id:
                  2,
              }),

              evidence({
                id:
                  3,
              }),
            ],
          });


        expect(
          result.memory
            .metadata
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "service extracts only explicit semantic evidence",
      () => {
        const service =
          new SemanticMemoryService({
            memoryRepository:
              {},

            indexService:
              {},
          });


        expect(
          service
            .extractSemanticEvidence({
              publicId:
                "memory-a",

              summary:
                "Database caused latency",

              metadata:
                {},
            })
        ).toEqual(
          []
        );


        const result =
          service
            .extractSemanticEvidence({
              publicId:
                "memory-b",

              confidence:
                0.9,

              trustScore:
                0.9,

              content: {
                semanticEvidence: {
                  symptom:
                    "high latency",

                  cause:
                    "db saturation",
                },
              },
            });


        expect(
          result
        ).toHaveLength(
          1
        );
      }
    );
  }
);