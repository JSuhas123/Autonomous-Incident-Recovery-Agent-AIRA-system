"use strict";

const fs =
  require(
    "fs"
  );

const path =
  require(
    "path"
  );


const PostgresCoverageSnapshotRepository =
  require(
    "../../persistence/postgres/PostgresCoverageSnapshotRepository"
  );

const CoverageQueryService =
  require(
    "../../coverage/CoverageQueryService"
  );


const ROOT =
  path.resolve(
    __dirname,
    "../.."
  );


describe(
  "Phase 19.19 Coverage Persistence and API",
  () => {
    test(
      "snapshot repository writes immutable snapshot and items",
      async () => {
        const queries =
          [];


        const client = {
          query:
            jest.fn(
              async (
                sql
              ) => {
                queries.push(
                  sql
                );


                if (
                  sql.includes(
                    "coverage.snapshots"
                  )
                ) {
                  return {
                    rows: [
                      {
                        id:
                          "snapshot-uuid",

                        public_id:
                          "cov_snapshot_test",

                        organization_id:
                          "org-uuid",

                        environment_id:
                          "env-uuid",

                        resources_count:
                          1,

                        applicable_failure_modes_count:
                          1,

                        covered_count:
                          1,

                        partial_count:
                          0,

                        human_only_count:
                          0,

                        unknown_count:
                          0,

                        coverage_percentage:
                          "100",

                        summary:
                          {},

                        generation_basis:
                          {},

                        generated_at:
                          new Date(),

                        execution_authorized:
                          false,

                        created_at:
                          new Date(),
                      },
                    ],
                  };
                }


                return {
                  rows: [
                    {
                      id:
                        "item-uuid",

                      snapshot_id:
                        "snapshot-uuid",

                      organization_id:
                        "org-uuid",

                      environment_id:
                        "env-uuid",

                      evaluation_id:
                        "evaluation-uuid",

                      resource_id:
                        "resource-uuid",

                      resource_public_id:
                        "resource-public",

                      resource_type:
                        "postgres.database",

                      failure_mode_version_id:
                        "fm-version",

                      failure_mode_key:
                        "FM-DB",

                      failure_mode_semver:
                        "1.0.0",

                      classification:
                        "COVERED",

                      reason_codes:
                        [],

                      readiness:
                        {},

                      confidence:
                        "1",

                      evaluation_basis:
                        {},

                      evaluated_at:
                        new Date(),

                      execution_authorized:
                        false,

                      created_at:
                        new Date(),
                    },
                  ],
                };
              }
            ),
        };


        const scope = {
          run:
            jest.fn(
              async (
                scopeInput,
                work
              ) =>
                work(
                  client,
                  {
                    organizationUuid:
                      "org-uuid",

                    environmentUuid:
                      "env-uuid",

                    applicationOrganizationId:
                      scopeInput
                        .organizationId,

                    applicationEnvironmentId:
                      scopeInput
                        .environmentId,
                  }
                )
            ),
        };


        const repository =
          new PostgresCoverageSnapshotRepository({
            scope,
          });


        const result =
          await repository
            .createSnapshot({
              organizationId:
                "org",

              environmentId:
                "env",

              resourcesCount:
                1,

              applicableFailureModesCount:
                1,

              coveredCount:
                1,

              partialCount:
                0,

              humanOnlyCount:
                0,

              unknownCount:
                0,

              coveragePercentage:
                100,

              summary:
                {},

              generationBasis:
                {},

              items: [
                {
                  evaluationId:
                    "evaluation-uuid",

                  resourceId:
                    "resource-uuid",

                  resourcePublicId:
                    "resource-public",

                  resourceType:
                    "postgres.database",

                  failureModeVersionId:
                    "fm-version",

                  failureModeKey:
                    "FM-DB",

                  failureModeSemver:
                    "1.0.0",

                  classification:
                    "COVERED",

                  confidence:
                    1,
                },
              ],
            });


        expect(
          result.items
        ).toHaveLength(
          1
        );


        expect(
          queries.some(
            (
              sql
            ) =>
              sql.includes(
                "coverage.snapshots"
              )
          )
        ).toBe(true);


        expect(
          queries.some(
            (
              sql
            ) =>
              sql.includes(
                "coverage.snapshot_items"
              )
          )
        ).toBe(true);
      }
    );


    test(
      "snapshot repository exposes no update operation",
      () => {
        const repository =
          new PostgresCoverageSnapshotRepository({
            scope: {
              run:
                jest.fn(),
            },
          });


        expect(
          repository.updateSnapshot
        ).toBeUndefined();


        expect(
          repository.updateSnapshotItem
        ).toBeUndefined();
      }
    );


    test(
      "summary reads latest persisted snapshot",
      async () => {
        const service =
          new CoverageQueryService({
            evaluationRepository: {},

            snapshotRepository: {
              getLatestSnapshot:
                jest.fn()
                  .mockResolvedValue({
                    publicId:
                      "snapshot",

                    resourcesCount:
                      8429,

                    applicableFailureModesCount:
                      817,

                    coveredCount:
                      691,

                    partialCount:
                      74,

                    humanOnlyCount:
                      29,

                    unknownCount:
                      23,

                    coveragePercentage:
                      84.6,

                    generatedAt:
                      new Date(),
                  }),
            },
          });


        const result =
          await service
            .getSummary({
              organizationId:
                "org",

              environmentId:
                "env",
            });


        expect(
          result.coveragePercentage
        ).toBe(
          84.6
        );


        expect(
          result.covered
        ).toBe(
          691
        );


        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "domain coverage is calculated from canonical evaluations",
      async () => {
        const service =
          new CoverageQueryService({
            snapshotRepository: {},

            evaluationRepository: {
              listEvaluations:
                jest.fn()
                  .mockResolvedValue([
                    {
                      resourceType:
                        "database.postgresql",

                      classification:
                        "COVERED",
                    },

                    {
                      resourceType:
                        "database.mongodb",

                      classification:
                        "PARTIAL",
                    },

                    {
                      resourceType:
                        "kubernetes.pod",

                      classification:
                        "COVERED",
                    },
                  ]),
            },
          });


        const result =
          await service
            .getDomains({
              organizationId:
                "org",

              environmentId:
                "env",
            });


        const database =
          result.find(
            (
              item
            ) =>
              item.domain ===
              "database"
          );


        expect(
          database.applicableFailureModes
        ).toBe(
          2
        );


        expect(
          database.covered
        ).toBe(
          1
        );


        expect(
          database.coveragePercentage
        ).toBe(
          50
        );
      }
    );


    test(
      "coverage API exposes required Phase 19 endpoints",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              ROOT,
              "routes/coverageRoutes.js"
            ),
            "utf8"
          );


        expect(
          source
        ).toContain(
          '"/summary"'
        );


        expect(
          source
        ).toContain(
          '"/resources"'
        );


        expect(
          source
        ).toContain(
          '"/failure-modes"'
        );


        expect(
          source
        ).toContain(
          '"/domains"'
        );


        expect(
          source
        ).toContain(
          '"/history"'
        );


        expect(
          source
        ).toContain(
          '"/refresh"'
        );
      }
    );


    test(
      "coverage persistence and API never authorize execution",
      () => {
        const files = [
          "persistence/postgres/PostgresCoverageSnapshotRepository.js",
          "coverage/CoverageQueryService.js",
          "controllers/coverageController.js",
          "routes/coverageRoutes.js",
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


          expect(
            source
          ).not.toMatch(
            /executionAuthorized\s*:\s*true/
          );


          expect(
            source
          ).not.toMatch(
            /require\s*\(\s*["']mongoose["']\s*\)/
          );
        }
      }
    );


    test(
      "snapshot repository uses PostgreSQL canonical coverage tables",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              ROOT,
              "persistence/postgres/PostgresCoverageSnapshotRepository.js"
            ),
            "utf8"
          );


        expect(
          source
        ).toContain(
          "coverage.snapshots"
        );


        expect(
          source
        ).toContain(
          "coverage.snapshot_items"
        );


        expect(
          source
        ).toContain(
          "PostgresTenantScope"
        );
      }
    );
  }
);