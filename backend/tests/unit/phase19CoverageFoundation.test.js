"use strict";

const fs =
  require("fs");

const path =
  require("path");


const {
  COVERAGE_CLASSIFICATIONS,
} =
  require(
    "../../constants/coverage"
  );


const PostgresCoverageEvaluationRepository =
  require(
    "../../persistence/postgres/PostgresCoverageEvaluationRepository"
  );


const ResourceInventoryProvider =
  require(
    "../../coverage/ResourceInventoryProvider"
  );


const ROOT =
  path.resolve(
    __dirname,
    "../.."
  );


describe(
  "Phase 19.1-19.3 Coverage Foundation",
  () => {
    test(
      "0075 establishes canonical coverage schema",
      () => {
        const migration =
          fs.readFileSync(
            path.join(
              ROOT,
              "persistence/postgres/migrations/0075_knowledge_coverage_foundation.sql"
            ),
            "utf8"
          );


        expect(
          migration
        ).toMatch(
          /CREATE SCHEMA IF NOT EXISTS\s+coverage/i
        );


        expect(
          migration
        ).toMatch(
          /coverage\.evaluations/i
        );


        expect(
          migration
        ).toMatch(
          /coverage\.snapshots/i
        );


        expect(
          migration
        ).toMatch(
          /coverage\.snapshot_items/i
        );


        expect(
          migration
        ).toMatch(
          /coverage\.gaps/i
        );
      }
    );


    test(
      "coverage schema supports all four canonical classifications",
      () => {
        const migration =
          fs.readFileSync(
            path.join(
              ROOT,
              "persistence/postgres/migrations/0075_knowledge_coverage_foundation.sql"
            ),
            "utf8"
          );


        for (
          const classification
          of Object.values(
            COVERAGE_CLASSIFICATIONS
          )
        ) {
          expect(
            migration
          ).toContain(
            `'${classification}'`
          );
        }
      }
    );


    test(
      "coverage persistence can never authorize execution",
      () => {
        const migration =
          fs.readFileSync(
            path.join(
              ROOT,
              "persistence/postgres/migrations/0075_knowledge_coverage_foundation.sql"
            ),
            "utf8"
          );


        expect(
          migration
        ).toMatch(
          /execution_authorized\s+boolean\s+NOT NULL\s+DEFAULT false/i
        );


        expect(
          migration
        ).toMatch(
          /execution_authorized\s*=\s*false/i
        );
      }
    );


    test(
      "coverage historical snapshots are protected from mutation",
      () => {
        const migration =
          fs.readFileSync(
            path.join(
              ROOT,
              "persistence/postgres/migrations/0075_knowledge_coverage_foundation.sql"
            ),
            "utf8"
          );


        expect(
          migration
        ).toMatch(
          /COVERAGE_SNAPSHOT_IMMUTABLE/
        );


        expect(
          migration
        ).toMatch(
          /trg_protect_coverage_snapshot_update/
        );


        expect(
          migration
        ).toMatch(
          /trg_protect_coverage_snapshot_item_update/
        );
      }
    );


    test(
      "coverage tables are protected by PostgreSQL RLS",
      () => {
        const migration =
          fs.readFileSync(
            path.join(
              ROOT,
              "persistence/postgres/migrations/0075_knowledge_coverage_foundation.sql"
            ),
            "utf8"
          );


        expect(
          migration
        ).toMatch(
          /coverage\.evaluations\s+ENABLE ROW LEVEL SECURITY/i
        );


        expect(
          migration
        ).toMatch(
          /coverage\.snapshots\s+ENABLE ROW LEVEL SECURITY/i
        );


        expect(
          migration
        ).toMatch(
          /coverage\.gaps\s+ENABLE ROW LEVEL SECURITY/i
        );
      }
    );


    test(
      "PostgresCoverageEvaluationRepository rejects execution authorization",
      async () => {
        const repository =
          new PostgresCoverageEvaluationRepository({
            scope: {
              run: jest.fn(),
            },
          });


        await expect(
          repository.upsertEvaluation({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            resourceId:
              "11111111-1111-1111-1111-111111111111",

            resourcePublicId:
              "res-1",

            resourceType:
              "postgres.database",

            failureModeVersionId:
              "22222222-2222-2222-2222-222222222222",

            failureModeKey:
              "FM-POSTGRES-CORRUPTION",

            failureModeSemver:
              "1.0.0",

            classification:
              "COVERED",

            reasonCodes:
              [],

            readiness:
              {},

            confidence:
              1,

            executionAuthorized:
              true,
          })
        ).rejects.toMatchObject({
          code:
            "COVERAGE_EXECUTION_AUTHORIZATION_FORBIDDEN",
        });
      }
    );


    test(
      "coverage repository delegates through PostgresTenantScope",
      async () => {
        const fakeRow = {
          id:
            "eval-uuid",

          public_id:
            "cov-eval-1",

          organization_id:
            "org-uuid",

          environment_id:
            "env-uuid",

          resource_id:
            "resource-uuid",

          resource_public_id:
            "res-1",

          resource_type:
            "postgres.database",

          failure_mode_version_id:
            "fm-version-uuid",

          failure_mode_key:
            "FM-POSTGRES-CORRUPTION",

          failure_mode_semver:
            "1.0.0",

          classification:
            "PARTIAL",

          reason_codes: [
            "VERIFICATION_MISSING",
          ],

          readiness: {
            verification:
              false,
          },

          confidence:
            "0.80000",

          evaluation_basis:
            {},

          evaluator_version:
            "phase19-v1",

          evaluated_at:
            new Date(),

          execution_authorized:
            false,

          created_at:
            new Date(),

          updated_at:
            new Date(),
        };


        const query =
          jest.fn()
            .mockResolvedValue({
              rows: [
                fakeRow,
              ],
            });


        const scope = {
          run:
            jest.fn(
              async (
                requestedScope,
                work
              ) => {
                expect(
                  requestedScope
                ).toEqual({
                  organizationId:
                    "org-public",

                  environmentId:
                    "env-public",
                });


                return work(
                  {
                    query,
                  },
                  {
                    organizationUuid:
                      "org-uuid",

                    environmentUuid:
                      "env-uuid",

                    applicationOrganizationId:
                      "org-public",

                    applicationEnvironmentId:
                      "env-public",
                  }
                );
              }
            ),
        };


        const repository =
          new PostgresCoverageEvaluationRepository({
            scope,
          });


        const result =
          await repository
            .upsertEvaluation({
              organizationId:
                "org-public",

              environmentId:
                "env-public",

              resourceId:
                "resource-uuid",

              resourcePublicId:
                "res-1",

              resourceType:
                "postgres.database",

              failureModeVersionId:
                "fm-version-uuid",

              failureModeKey:
                "FM-POSTGRES-CORRUPTION",

              failureModeSemver:
                "1.0.0",

              classification:
                "PARTIAL",

              reasonCodes: [
                "VERIFICATION_MISSING",
              ],

              readiness: {
                verification:
                  false,
              },

              confidence:
                0.8,
            });


        expect(
          scope.run
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          query
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          result.classification
        ).toBe(
          "PARTIAL"
        );


        expect(
          result.executionAuthorized
        ).toBe(false);


        expect(
          result.canonicalOrganizationId
        ).toBe(
          "org-uuid"
        );
      }
    );


    test(
      "ResourceInventoryProvider paginates through Phase 17 repository",
      async () => {
        const page1 =
          Array.from(
            {
              length: 2,
            },
            (
              _,
              index
            ) => ({
              id:
                `uuid-${index}`,

              publicId:
                `res-${index}`,

              resourceType:
                "kubernetes.pod",

              provider:
                "kubernetes",

              status:
                "ACTIVE",
            })
          );


        const page2 = [
          {
            id:
              "uuid-2",

            publicId:
              "res-2",

            resourceType:
              "postgres.database",

            provider:
              "postgres",

            status:
              "ACTIVE",
          },
        ];


        const resourceRepository = {
          listResources:
            jest.fn()
              .mockResolvedValueOnce(
                page1
              )
              .mockResolvedValueOnce(
                page2
              ),
        };


        const provider =
          new ResourceInventoryProvider({
            resourceRepository,

            pageSize:
              2,
          });


        const resources =
          await provider
            .listAllResources({
              organizationId:
                "org-1",

              environmentId:
                "env-1",
            });


        expect(
          resources
        ).toHaveLength(
          3
        );


        expect(
          resourceRepository.listResources
        ).toHaveBeenCalledTimes(
          2
        );


        expect(
          resourceRepository
            .listResources
            .mock.calls[1][0]
            .offset
        ).toBe(
          2
        );
      }
    );


    test(
      "ResourceInventoryProvider builds real coverage inventory from Phase 17 resources",
      async () => {
        const resourceRepository = {
          listResources:
            jest.fn()
              .mockResolvedValue([
                {
                  id:
                    "1",

                  publicId:
                    "res-1",

                  resourceType:
                    "postgres.database",

                  provider:
                    "postgres",

                  status:
                    "ACTIVE",
                },

                {
                  id:
                    "2",

                  publicId:
                    "res-2",

                  resourceType:
                    "postgres.database",

                  provider:
                    "postgres",

                  status:
                    "ACTIVE",
                },

                {
                  id:
                    "3",

                  publicId:
                    "res-3",

                  resourceType:
                    "kubernetes.pod",

                  provider:
                    "kubernetes",

                  status:
                    "ACTIVE",
                },
              ]),
        };


        const provider =
          new ResourceInventoryProvider({
            resourceRepository,

            pageSize:
              1000,
          });


        const inventory =
          await provider
            .buildInventory({
              organizationId:
                "org-1",

              environmentId:
                "env-1",
            });


        expect(
          inventory.totalResources
        ).toBe(
          3
        );


        expect(
          inventory.byResourceType
        ).toEqual({
          "postgres.database":
            2,

          "kubernetes.pod":
            1,
        });


        expect(
          inventory.source
        ).toBe(
          "PHASE_17_RESOURCE_GRAPH"
        );


        expect(
          inventory.canonicalSource
        ).toBe(
          "POSTGRESQL"
        );


        expect(
          inventory.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "Phase 19 resource inventory does not create a duplicate resource authority",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              ROOT,
              "coverage/ResourceInventoryProvider.js"
            ),
            "utf8"
          );


        expect(
          source
        ).toMatch(
          /PostgresResourceRepository/
        );


        expect(
          source
        ).not.toMatch(
          /FROM\s+resources\.resources/i
        );


        expect(
          source
        ).not.toMatch(
          /INSERT\s+INTO\s+resources\.resources/i
        );
      }
    );


    test(
  "Phase 19 foundation contains no Mongo or Qdrant authority",
  () => {
    const files = [
      "coverage/ResourceInventoryProvider.js",

      "persistence/postgres/PostgresCoverageEvaluationRepository.js",
    ];


    for (
      const relativePath
      of files
    ) {
      const source =
        fs.readFileSync(
          path.join(
            ROOT,
            relativePath
          ),
          "utf8"
        );


      /*
       * Mongo authority must not be imported.
       */

      expect(
        source
      ).not.toMatch(
        /require\s*\(\s*["']mongoose["']\s*\)/
      );


      expect(
        source
      ).not.toMatch(
        /require\s*\(\s*["'][^"']*mongo[^"']*["']\s*\)/i
      );


      /*
       * Qdrant may legitimately be mentioned in architecture/safety
       * comments such as:
       *
       *   "does not query Qdrant"
       *
       * What Phase 19 forbids is importing or invoking Qdrant as the
       * canonical coverage persistence/retrieval authority here.
       */

      expect(
        source
      ).not.toMatch(
        /require\s*\(\s*["'][^"']*qdrant[^"']*["']\s*\)/i
      );


      expect(
        source
      ).not.toMatch(
        /new\s+QdrantClient\s*\(/i
      );


      expect(
        source
      ).not.toMatch(
        /\.qdrant(?:Client)?\s*\./i
      );
    }
  }
);
  }
);