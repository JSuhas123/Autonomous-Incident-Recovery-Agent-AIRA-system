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
  MemoryHydrationService,
} =
  require(
    "../../services/memory/vector/memoryHydrationService"
  );


const {
  MemorySearchService,
} =
  require(
    "../../services/memory/vector/memorySearchService"
  );


const {
  QdrantMemoryClient,
} =
  require(
    "../../services/memory/vector/qdrantMemoryClient"
  );


const migrationPath =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0062_memory_retrieval_audit.sql"
  );


describe(
  "Phase 16.7 memory retrieval and PostgreSQL hydration",
  () => {

    test(
      "retrieval audit migration exists",
      () => {
        expect(
          fs.existsSync(
            migrationPath
          )
        ).toBe(
          true
        );


        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "memory.retrieval_audit"
        );


        expect(
          source
        ).toContain(
          "candidate_count"
        );


        expect(
          source
        ).toContain(
          "hydrated_count"
        );


        expect(
          source
        ).toContain(
          "rejected_count"
        );
      }
    );

    test(
  "public environment and incident IDs are deferred to PostgreSQL hydration",
  () => {
    const qdrant =
      Object.create(
        QdrantMemoryClient
          .prototype
      );


    const filter =
      qdrant
        .buildTenantFilter({
          organizationId:
            "org-a",

          environmentId:
            "env-public-a",

          resourceId:
            "resource-public-a",

          incidentId:
            "incident-public-a",

          includeGlobal:
            false,
        });


    const serialized =
      JSON.stringify(
        filter
      );


    expect(
      serialized
    ).toContain(
      "organization_public_id"
    );


    expect(
      serialized
    ).not.toContain(
      "env-public-a"
    );


    expect(
      serialized
    ).not.toContain(
      "resource-public-a"
    );


    expect(
      serialized
    ).not.toContain(
      "incident-public-a"
    );
  }
);

    test(
      "retrieval audit remains tenant isolated",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "ENABLE ROW LEVEL SECURITY"
        );


        expect(
          source
        ).toContain(
          "tenancy.current_organization_id()"
        );
      }
    );


    test(
      "Qdrant query always requests ACTIVE candidates",
      () => {
        const qdrant =
          Object.create(
            QdrantMemoryClient
              .prototype
          );


        const filter =
          qdrant
            .buildTenantFilter({
              organizationId:
                "org-a",
            });


        expect(
          filter.must
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              key:
                "status",

              match: {
                value:
                  "ACTIVE",
              },
            }),

            expect.objectContaining({
              key:
                "organization_public_id",

              match: {
                value:
                  "org-a",
              },
            }),
          ])
        );


        /**
         * Regression guard:
         *
         * organization_id in Qdrant stores
         * the canonical PostgreSQL UUID.
         *
         * Retrieval receives the public tenant ID,
         * therefore it must filter on
         * organization_public_id instead.
         */
        expect(
          filter.must
        ).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              key:
                "organization_id",

              match: {
                value:
                  "org-a",
              },
            }),
          ])
        );
      }
    );


    test(
      "tenant retrieval filter never searches another tenant",
      () => {
        const qdrant =
          Object.create(
            QdrantMemoryClient
              .prototype
          );


        const filter =
          qdrant
            .buildTenantFilter({
              organizationId:
                "org-a",

              includeGlobal:
                false,
            });


        const serialized =
          JSON.stringify(
            filter
          );


        expect(
          serialized
        ).toContain(
          "org-a"
        );


        expect(
          serialized
        ).not.toContain(
          "org-b"
        );
      }
    );


    test(
      "Qdrant payload alone is never returned as canonical memory",
      async () => {
        const repository = {
          hydrateCandidates:
            jest.fn(
              async () => []
            ),
        };


        const service =
          new MemoryHydrationService({
            repository,
          });


        const result =
          await service
            .hydrate({
              organizationId:
                "org-a",

              candidates: [
                {
                  memoryId:
                    "00000000-0000-0000-0000-000000000001",

                  pointId:
                    "point",

                  score:
                    0.99,

                  payload: {
                    summary:
                      "ATTACKER CONTROLLED TEXT",
                  },
                },
              ],
            });


        expect(
          result.memories
        ).toEqual(
          []
        );


        expect(
          result.rejectedCount
        ).toBe(
          1
        );
      }
    );


    test(
      "hydration preserves Qdrant ranking only after PostgreSQL authorization",
      async () => {
        const repository = {
          hydrateCandidates:
            jest.fn(
              async () => [
                {
                  id:
                    "00000000-0000-0000-0000-000000000002",

                  publicId:
                    "mem-two",

                  status:
                    "ACTIVE",
                },

                {
                  id:
                    "00000000-0000-0000-0000-000000000001",

                  publicId:
                    "mem-one",

                  status:
                    "ACTIVE",
                },
              ]
            ),
        };


        const service =
          new MemoryHydrationService({
            repository,
          });


        const result =
          await service
            .hydrate({
              organizationId:
                "org-a",

              candidates: [
                {
                  memoryId:
                    "00000000-0000-0000-0000-000000000001",

                  pointId:
                    "point-1",

                  score:
                    0.95,
                },

                {
                  memoryId:
                    "00000000-0000-0000-0000-000000000002",

                  pointId:
                    "point-2",

                  score:
                    0.80,
                },
              ],
            });


        expect(
          result
            .memories
            .map(
              (
                memory
              ) =>
                memory.publicId
            )
        ).toEqual([
          "mem-one",
          "mem-two",
        ]);


        expect(
          result
            .memories[0]
            .retrieval
            .score
        ).toBe(
          0.95
        );
      }
    );


    test(
      "unknown memory type fails closed before querying Qdrant",
      async () => {
        const service =
          new MemorySearchService({
            embeddingProvider: {
              embed:
                jest.fn(),
            },

            qdrant: {
              queryMemoryCandidates:
                jest.fn(),
            },

            hydrationService: {
              hydrate:
                jest.fn(),
            },

            repository:
              {},
          });


        await expect(
          service
            .search({
              organizationId:
                "org-a",

              query:
                "database latency",

              memoryTypes: [
                "ROOT_MEMORY",
              ],
            })
        ).rejects.toMatchObject({
          code:
            "MEMORY_RETRIEVAL_TYPE_UNKNOWN",
        });
      }
    );


    test(
      "unknown memory scope fails closed before querying Qdrant",
      async () => {
        const service =
          new MemorySearchService({
            embeddingProvider: {
              embed:
                jest.fn(),
            },

            qdrant: {
              queryMemoryCandidates:
                jest.fn(),
            },

            hydrationService: {
              hydrate:
                jest.fn(),
            },

            repository:
              {},
          });


        await expect(
          service
            .search({
              organizationId:
                "org-a",

              query:
                "database latency",

              scopes: [
                "EVERYTHING",
              ],
            })
        ).rejects.toMatchObject({
          code:
            "MEMORY_RETRIEVAL_SCOPE_UNKNOWN",
        });
      }
    );


    test(
      "retrieval repository requires PostgreSQL organization scope",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,
              "..",
              "..",
              "persistence",
              "postgres",
              "PostgresMemoryRetrievalRepository.js"
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
          "status = 'ACTIVE'"
        );


        expect(
          source
        ).toContain(
          "organization_id = $2"
        );
      }
    );


    test(
      "retrieval service does not trust Qdrant payload as memory content",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,
              "..",
              "..",
              "services",
              "memory",
              "vector",
              "memorySearchService.js"
            ),
            "utf8"
          );


        expect(
          source
        ).toContain(
          "hydrationService"
        );


        /**
         * Qdrant payload is candidate metadata only.
         *
         * Canonical summary/content must come
         * from PostgreSQL hydration.
         */
        expect(
          source
        ).not.toMatch(
          /candidate\.payload\.summary/
        );


        expect(
          source
        ).not.toMatch(
          /candidate\.payload\.content/
        );
      }
    );
  }
);