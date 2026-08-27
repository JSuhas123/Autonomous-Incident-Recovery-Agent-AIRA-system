"use strict";


const fs =
  require(
    "fs"
  );


const path =
  require(
    "path"
  );


const {
  LegacyIncidentMemoryBridge,
} =
  require(
    "../../services/memory/legacyIncidentMemoryBridge"
  );


const {
  MEMORY_TYPES,
} =
  require(
    "../../constants/memoryTypes"
  );


const {
  MEMORY_SCOPES,
} =
  require(
    "../../constants/memoryScopes"
  );


describe(
  "Phase 16.3-16.4 PostgreSQL memory repository and legacy bridge",
  () => {

    test(
      "repository explicitly establishes organization RLS context",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,
              "..",
              "..",
              "persistence",
              "postgres",
              "PostgresMemoryRepository.js"
            ),
            "utf8"
          );


        expect(
          source
        ).toContain(
          "aira.organization_id"
        );


        expect(
          source
        ).toContain(
          "set_config"
        );
      }
    );


    test(
      "memory writes do not use Mongo or Mongoose",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,
              "..",
              "..",
              "persistence",
              "postgres",
              "PostgresMemoryRepository.js"
            ),
            "utf8"
          );


        expect(
          source
        ).not.toMatch(
          /\bmongoose\b/i
        );


        expect(
          source
        ).not.toMatch(
          /IncidentMemory/
        );
      }
    );


    test(
      "canonical repository supports provenance",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,
              "..",
              "..",
              "persistence",
              "postgres",
              "PostgresMemoryRepository.js"
            ),
            "utf8"
          );


        expect(
          source
        ).toContain(
          "memory.memory_sources"
        );


        expect(
          source
        ).toContain(
          "addSource"
        );
      }
    );


    test(
      "canonical repository versions memory before updates",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,
              "..",
              "..",
              "persistence",
              "postgres",
              "PostgresMemoryRepository.js"
            ),
            "utf8"
          );


        expect(
          source
        ).toContain(
          "memory.memory_versions"
        );


        expect(
          source
        ).toContain(
          "createVersion"
        );
      }
    );


    test(
      "legacy pattern becomes semantic memory",
      () => {
        const bridge =
          new LegacyIncidentMemoryBridge({
            memoryService:
              {},
          });


        const memory =
          bridge
            .buildSemanticMemory({
              _id:
                "legacy-1",

              tenantId:
                "aira-dev-org",

              patternId:
                "high-error-rate",

              patternType:
                "high-error-rate",

              patternName:
                "High Error Rate",

              isActive:
                true,

              stats: {
                totalOccurrences:
                  5,

                confidenceTrend: {
                  avgConfidence:
                    0.8,
                },

                actions: {},
              },

              occurrences:
                [],
            });


        expect(
          memory.memoryType
        ).toBe(
          MEMORY_TYPES
            .SEMANTIC
        );


        expect(
          memory.scopeType
        ).toBe(
          MEMORY_SCOPES
            .TENANT
        );


        expect(
          memory.organizationId
        ).toBe(
          "aira-dev-org"
        );


        expect(
          memory.legacySourceType
        ).toBe(
          "IncidentMemory"
        );
      }
    );


    test(
      "strong legacy recommendation becomes procedural memory",
      () => {
        const bridge =
          new LegacyIncidentMemoryBridge({
            memoryService:
              {},
          });


        const memory =
          bridge
            .buildProceduralMemory({
              _id:
                "legacy-2",

              tenantId:
                "aira-dev-org",

              patternId:
                "high-latency",

              patternType:
                "high-latency",

              recommendedAction: {
                action:
                  "restart-service",

                successRate:
                  0.9,

                confidence:
                  0.85,

                reasoning:
                  "Historically successful",
              },

              stats: {
                actions: {
                  "restart-service": {
                    successes:
                      9,

                    failures:
                      1,

                    totalAttempts:
                      10,

                    successRate:
                      0.9,

                    avgRecoveryTimeMs:
                      45000,
                  },
                },
              },
            });


        expect(
          memory
        ).not.toBeNull();


        expect(
          memory.memoryType
        ).toBe(
          MEMORY_TYPES
            .PROCEDURAL
        );


        expect(
          memory.content
            .recommendedAction
        ).toBe(
          "restart-service"
        );
      }
    );


    test(
      "weak recommendation does not become procedure",
      () => {
        const bridge =
          new LegacyIncidentMemoryBridge({
            memoryService:
              {},
          });


        const memory =
          bridge
            .buildProceduralMemory({
              tenantId:
                "aira-dev-org",

              patternId:
                "weak-pattern",

              recommendedAction: {
                action:
                  "restart",

                successRate:
                  0.5,
              },

              stats: {
                actions: {},
              },
            });


        expect(
          memory
        ).toBeNull();
      }
    );


    test(
      "legacy bridge uses deterministic canonical IDs",
      () => {
        const bridge =
          new LegacyIncidentMemoryBridge({
            memoryService:
              {},
          });


        const first =
          bridge
            .createDeterministicId(
              "mem_test",
              "org",
              "pattern"
            );


        const second =
          bridge
            .createDeterministicId(
              "mem_test",
              "org",
              "pattern"
            );


        expect(
          first
        ).toBe(
          second
        );
      }
    );


    test(
      "bridge creates semantic and procedural relation when recommendation exists",
      async () => {
        const fakeMemoryService = {
          upsertByPublicId:
            jest.fn(
              async (
                memory
              ) => ({
                created:
                  true,

                memory,
              })
            ),

          addSource:
            jest.fn(
              async () =>
                true
            ),

          relate:
            jest.fn(
              async () =>
                true
            ),
        };


        const bridge =
          new LegacyIncidentMemoryBridge({
            memoryService:
              fakeMemoryService,
          });


        const result =
          await bridge
            .sync({
              _id:
                "legacy-sync",

              tenantId:
                "aira-dev-org",

              patternId:
                "resource-exhaustion",

              patternType:
                "resource-exhaustion",

              isActive:
                true,

              recommendedAction: {
                action:
                  "scale-service",

                successRate:
                  0.9,

                confidence:
                  0.9,
              },

              stats: {
                totalOccurrences:
                  5,

                actions: {
                  "scale-service": {
                    successes:
                      5,

                    failures:
                      0,

                    totalAttempts:
                      5,

                    successRate:
                      1,

                    avgRecoveryTimeMs:
                      30000,
                  },
                },
              },
            });


        expect(
          result.synchronized
        ).toBe(
          true
        );


        expect(
          fakeMemoryService
            .upsertByPublicId
        ).toHaveBeenCalledTimes(
          2
        );


        expect(
          fakeMemoryService
            .relate
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            relationType:
              "DERIVED_FROM",
          })
        );
      }
    );


    test(
      "legacy memory service retains compatibility while adding canonical sync",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,
              "..",
              "..",
              "services",
              "learning",
              "memoryService.js"
            ),
            "utf8"
          );


        expect(
          source
        ).toContain(
          "legacyIncidentMemoryBridge"
        );


        expect(
          source
        ).toContain(
          "syncCanonicalMemory"
        );


        expect(
          source
        ).toContain(
          "IncidentMemory"
        );
      }
    );
  }
);