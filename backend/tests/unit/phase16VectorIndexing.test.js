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
  EmbeddingProviderService,
} =
  require(
    "../../services/memory/embedding/embeddingProviderService"
  );


const {
  buildMemoryRetrievalText,
} =
  require(
    "../../services/memory/embedding/memoryRetrievalTextBuilder"
  );


const {
  MemoryIndexService,
} =
  require(
    "../../services/memory/vector/memoryIndexService"
  );


const migrationPath =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0061_memory_vector_indexing.sql"
  );


describe(
  "Phase 16.5-16.6 Qdrant infrastructure and embedding pipeline",
  () => {

    test(
      "migration creates embedding/index operation state",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "memory.embedding_records"
        );


        expect(
          source
        ).toContain(
          "memory.index_operations"
        );


        expect(
          source
        ).toContain(
          "PostgreSQL remains authoritative"
        );
      }
    );


    test(
      "embedding records remain tenant isolated",
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
      "test embedding is deterministic",
      async () => {
        const originalProvider =
          process.env
            .MEMORY_EMBEDDING_PROVIDER;

        const originalEnabled =
          process.env
            .MEMORY_EMBEDDING_ENABLED;

        const originalDimensions =
          process.env
            .MEMORY_EMBEDDING_DIMENSIONS;

        const originalNodeEnv =
          process.env
            .NODE_ENV;


        process.env
          .MEMORY_EMBEDDING_PROVIDER =
          "deterministic_test";

        process.env
          .MEMORY_EMBEDDING_ENABLED =
          "true";

        process.env
          .MEMORY_EMBEDDING_DIMENSIONS =
          "64";

        process.env.NODE_ENV =
          "test";


        try {
          const service =
            new EmbeddingProviderService();


          const first =
            await service
              .embed(
                "database connection exhaustion"
              );


          const second =
            await service
              .embed(
                "database connection exhaustion"
              );


          expect(
            first.vector
          ).toEqual(
            second.vector
          );


          expect(
            first.vector
          ).toHaveLength(
            64
          );

        } finally {
          process.env
            .MEMORY_EMBEDDING_PROVIDER =
            originalProvider;

          process.env
            .MEMORY_EMBEDDING_ENABLED =
            originalEnabled;

          process.env
            .MEMORY_EMBEDDING_DIMENSIONS =
            originalDimensions;

          process.env.NODE_ENV =
            originalNodeEnv;
        }
      }
    );


    test(
      "test embeddings are forbidden in production",
      async () => {
        const originalProvider =
          process.env
            .MEMORY_EMBEDDING_PROVIDER;

        const originalEnabled =
          process.env
            .MEMORY_EMBEDDING_ENABLED;

        const originalNodeEnv =
          process.env
            .NODE_ENV;


        process.env
          .MEMORY_EMBEDDING_PROVIDER =
          "deterministic_test";

        process.env
          .MEMORY_EMBEDDING_ENABLED =
          "true";

        process.env.NODE_ENV =
          "production";


        try {
          const service =
            new EmbeddingProviderService();


          await expect(
            service
              .embed(
                "test"
              )
          ).rejects.toMatchObject({
            code:
              "DETERMINISTIC_EMBEDDING_FORBIDDEN",
          });

        } finally {
          process.env
            .MEMORY_EMBEDDING_PROVIDER =
            originalProvider;

          process.env
            .MEMORY_EMBEDDING_ENABLED =
            originalEnabled;

          process.env.NODE_ENV =
            originalNodeEnv;
        }
      }
    );


    test(
      "retrieval text is deterministic",
      () => {
        const first =
          buildMemoryRetrievalText({
            memoryType:
              "SEMANTIC",

            scopeType:
              "TENANT",

            title:
              "Database saturation",

            summary:
              "Connection exhaustion causes latency.",

            content: {
              b:
                2,

              a:
                1,
            },
          });


        const second =
          buildMemoryRetrievalText({
            memoryType:
              "SEMANTIC",

            scopeType:
              "TENANT",

            title:
              "Database saturation",

            summary:
              "Connection exhaustion causes latency.",

            content: {
              a:
                1,

              b:
                2,
            },
          });


        expect(
          first
        ).toBe(
          second
        );
      }
    );


    test(
      "Qdrant point payload contains canonical memory ID and tenant scope",
      () => {
        const service =
          Object.create(
            MemoryIndexService
              .prototype
          );


        const payload =
          service
            .buildPayload({
              id:
                "memory-uuid",

              public_id:
                "mem_public",

              organization_id:
                "org-uuid",

              environment_id:
                null,

              service_id:
                null,

              resource_id:
                null,

              incident_id:
                null,

              memory_type:
                "SEMANTIC",

              scope_type:
                "TENANT",

              status:
                "ACTIVE",

              schema_version:
                1,
            });


        expect(
          payload
        ).toMatchObject({
          memory_id:
            "memory-uuid",

          organization_id:
            "org-uuid",

          memory_type:
            "SEMANTIC",

          scope_type:
            "TENANT",

          status:
            "ACTIVE",
        });
      }
    );


    test(
      "Qdrant client never persists authoritative memory content itself",
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
              "qdrantMemoryClient.js"
            ),
            "utf8"
          );


        expect(
          source
        ).not.toContain(
          "memory.memories"
        );


        expect(
          source
        ).not.toContain(
          "PostgresMemoryRepository"
        );
      }
    );


    test(
      "indexing refuses non-active memory",
      async () => {
        const service =
          new MemoryIndexService({
            repository: {
              getMemory:
                jest.fn(
                  async () => ({
                    id:
                      "memory-id",

                    public_id:
                      "mem-test",

                    status:
                      "ARCHIVED",
                  })
                ),
            },

            embeddingProvider: {
              embed:
                jest.fn(),
            },

            qdrant: {
              ensureCollection:
                jest.fn(),
            },
          });


        await expect(
          service
            .indexMemory({
              organizationId:
                "org",

              publicId:
                "mem-test",
            })
        ).rejects.toMatchObject({
          code:
            "MEMORY_NOT_INDEXABLE",
        });
      }
    );
  }
);