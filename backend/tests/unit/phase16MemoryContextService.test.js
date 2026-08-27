"use strict";


const {
  MemoryContextService,
} =
  require(
    "../../services/memory/context/memoryContextService"
  );


const {
  MemoryContextContract,
} =
  require(
    "../../services/memory/context/memoryContextContract"
  );


describe(
  "Phase 16.14B memory context retrieval orchestrator",
  () => {

    test(
      "builds context from hydrated memory search results",
      async () => {
        const searchService = {
          search:
            jest.fn(
              async () => ({
                memories: [
                  {
                    id:
                      "memory-1",

                    publicId:
                      "mem-semantic-1",

                    organizationId:
                      "aira-dev-org",

                    environmentId:
                      "env_aira_development",

                    memoryType:
                      "SEMANTIC",

                    scopeType:
                      "SERVICE",

                    status:
                      "ACTIVE",

                    confidence:
                      0.9,

                    trustScore:
                      0.9,

                    summary:
                      "DB saturation associated with latency",
                  },
                ],

                diagnostics: {
                  candidateCount:
                    5,

                  hydratedCount:
                    1,

                  rejectedCount:
                    4,

                  embeddingProvider:
                    "local",

                  embeddingModel:
                    "test-model",

                  auditCode:
                    "retrieval-test-1",
                },
              })
            ),
        };


        const service =
          new MemoryContextService({
            searchService,

            contract:
              new MemoryContextContract(),
          });


        const context =
          await service
            .buildContext({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              serviceId:
                "api",

              query:
                "Why is latency high?",

              memoryTypes: [
                "SEMANTIC",
              ],

              limit:
                10,
            });


        expect(
          context.counts.total
        ).toBe(
          1
        );


        expect(
          context.counts.semantic
        ).toBe(
          1
        );


        expect(
          context.diagnostics
            .candidateCount
        ).toBe(
          5
        );


        expect(
          context.diagnostics
            .hydratedCount
        ).toBe(
          1
        );


        expect(
          context.diagnostics
            .rejectedCount
        ).toBe(
          4
        );
      }
    );


    test(
      "passes tenant and scope parameters into retrieval service",
      async () => {
        const searchService = {
          search:
            jest.fn(
              async () => ({
                memories:
                  [],

                diagnostics:
                  {},
              })
            ),
        };


        const service =
          new MemoryContextService({
            searchService,

            contract:
              new MemoryContextContract(),
          });


        await service
          .buildContext({
            organizationId:
              "aira-dev-org",

            environmentId:
              "env_aira_development",

            serviceId:
              "payments",

            resourceId:
              "resource-1",

            incidentId:
              "inc-1",

            query:
              "Investigate",

            memoryTypes: [
              "EPISODIC",
              "OUTCOME",
            ],

            scopes: [
              "INCIDENT",
              "SERVICE",
            ],

            includeGlobal:
              true,

            limit:
              25,
          });


        expect(
          searchService.search
        ).toHaveBeenCalledWith({
          organizationId:
            "aira-dev-org",

          environmentId:
            "env_aira_development",

          serviceId:
            "payments",

          resourceId:
            "resource-1",

          incidentId:
            "inc-1",

          query:
            "Investigate",

          memoryTypes: [
            "EPISODIC",
            "OUTCOME",
          ],

          scopes: [
            "INCIDENT",
            "SERVICE",
          ],

          includeGlobal:
            true,

          limit:
            25,
        });
      }
    );


    test(
      "context uses PostgreSQL-authoritative hydrated memories",
      async () => {
        const searchService = {
          search:
            jest.fn(
              async () => ({
                memories: [
                  {
                    publicId:
                      "mem-1",

                    organizationId:
                      "aira-dev-org",

                    memoryType:
                      "EPISODIC",

                    scopeType:
                      "INCIDENT",

                    summary:
                      "Canonical PostgreSQL memory",

                    status:
                      "ACTIVE",
                  },
                ],

                diagnostics:
                  {},
              })
            ),
        };


        const service =
          new MemoryContextService({
            searchService,

            contract:
              new MemoryContextContract(),
          });


        const context =
          await service
            .buildContext({
              organizationId:
                "aira-dev-org",

              query:
                "Investigate",
            });


        expect(
          context.memories[0]
            .summary
        ).toBe(
          "Canonical PostgreSQL memory"
        );


        expect(
          context.retrieval
            .authoritativeStore
        ).toBe(
          "postgresql"
        );


        expect(
          context.retrieval
            .candidateStore
        ).toBe(
          "qdrant"
        );
      }
    );


    test(
      "unsafe cross-tenant result is rejected even after retrieval",
      async () => {
        const searchService = {
          search:
            jest.fn(
              async () => ({
                memories: [
                  {
                    publicId:
                      "foreign-memory",

                    organizationId:
                      "foreign-org",

                    memoryType:
                      "SEMANTIC",

                    scopeType:
                      "SERVICE",

                    status:
                      "ACTIVE",
                  },
                ],

                diagnostics:
                  {},
              })
            ),
        };


        const service =
          new MemoryContextService({
            searchService,

            contract:
              new MemoryContextContract(),
          });


        await expect(
          service
            .buildContext({
              organizationId:
                "aira-dev-org",

              query:
                "Investigate",
            })
        ).rejects.toMatchObject({
          code:
            "MEMORY_CONTEXT_TENANT_VIOLATION",
        });
      }
    );


    test(
      "agent context remains execution-safe",
      async () => {
        const searchService = {
          search:
            jest.fn(
              async () => ({
                memories: [
                  {
                    publicId:
                      "procedure-1",

                    organizationId:
                      "aira-dev-org",

                    memoryType:
                      "PROCEDURAL",

                    scopeType:
                      "SERVICE",

                    status:
                      "ACTIVE",

                    summary:
                      "restart-service worked previously",
                  },
                ],

                diagnostics:
                  {},
              })
            ),
        };


        const service =
          new MemoryContextService({
            searchService,

            contract:
              new MemoryContextContract(),
          });


        const context =
          await service
            .buildContext({
              organizationId:
                "aira-dev-org",

              query:
                "Should API restart?",
            });


        expect(
          context
            .safety
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          context
            .safety
            .grantsExecutionPermission
        ).toBe(
          false
        );


        expect(
          context
            .safety
            .bypassesPolicy
        ).toBe(
          false
        );
      }
    );


    test(
      "invalid limit is normalized",
      async () => {
        const searchService = {
          search:
            jest.fn(
              async () => ({
                memories:
                  [],

                diagnostics:
                  {},
              })
            ),
        };


        const service =
          new MemoryContextService({
            searchService,

            contract:
              new MemoryContextContract(),
          });


        await service
          .buildContext({
            organizationId:
              "aira-dev-org",

            query:
              "Investigate",

            limit:
              100000,
          });


        expect(
          searchService.search
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            limit:
              100,
          })
        );
      }
    );
  }
);