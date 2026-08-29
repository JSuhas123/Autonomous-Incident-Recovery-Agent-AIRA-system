"use strict";

const fs =
  require(
    "fs"
  );

const path =
  require(
    "path"
  );

const PostgresCoverageGapRepository =
  require(
    "../../persistence/postgres/PostgresCoverageGapRepository"
  );


const ROOT =
  path.resolve(
    __dirname,
    "../.."
  );


describe(
  "Phase 19.20 Coverage Gap Persistence",
  () => {
    test(
      "0076 allows gaps without Failure Mode evaluations",
      () => {
        const migration =
          fs.readFileSync(
            path.join(
              ROOT,
              "persistence/postgres/migrations/0076_coverage_gap_history.sql"
            ),
            "utf8"
          );


        expect(
          migration
        ).toMatch(
          /evaluation_id[\s\S]*DROP NOT NULL/i
        );


        expect(
          migration
        ).toMatch(
          /resource_id[\s\S]*DROP NOT NULL/i
        );


        expect(
          migration
        ).toContain(
          "coverage.snapshot_gaps"
        );
      }
    );


    test(
      "snapshot gap history is immutable",
      () => {
        const migration =
          fs.readFileSync(
            path.join(
              ROOT,
              "persistence/postgres/migrations/0076_coverage_gap_history.sql"
            ),
            "utf8"
          );


        expect(
          migration
        ).toContain(
          "trg_protect_coverage_snapshot_gap_update"
        );


        expect(
          migration
        ).toContain(
          "coverage.protect_snapshot_immutability()"
        );
      }
    );


    test(
      "snapshot gaps are tenant isolated with forced RLS",
      () => {
        const migration =
          fs.readFileSync(
            path.join(
              ROOT,
              "persistence/postgres/migrations/0076_coverage_gap_history.sql"
            ),
            "utf8"
          );


        expect(
          migration
        ).toMatch(
          /coverage\.snapshot_gaps[\s\S]*ENABLE ROW LEVEL SECURITY/i
        );


        expect(
          migration
        ).toMatch(
          /coverage\.snapshot_gaps[\s\S]*FORCE ROW LEVEL SECURITY/i
        );


        expect(
          migration
        ).toContain(
          "tenancy.current_organization_id()"
        );


        expect(
          migration
        ).toContain(
          "tenancy.current_environment_id()"
        );
      }
    );


    test(
      "repository can persist NO_FAILURE_MODE without evaluation UUID",
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
                    "INSERT INTO"
                  ) &&
                  sql.includes(
                    "coverage.gaps"
                  )
                ) {
                  return {
                    rows: [
                      {
                        id:
                          "gap-uuid",

                        public_id:
                          "cov_gap_test",

                        organization_id:
                          "org-uuid",

                        environment_id:
                          "env-uuid",

                        gap_key:
                          "gap-key",

                        evaluation_id:
                          null,

                        resource_id:
                          null,

                        resource_public_id:
                          "resource-public",

                        resource_type:
                          "robotics.lidar",

                        failure_mode_key:
                          null,

                        failure_mode_semver:
                          null,

                        classification:
                          "UNKNOWN",

                        reason_code:
                          "NO_FAILURE_MODE",

                        severity:
                          "HIGH",

                        priority_score:
                          "80",

                        explanation:
                          "No Failure Mode coverage",

                        evidence:
                          {},

                        detected_at:
                          new Date(),

                        last_detected_at:
                          new Date(),

                        resolved_at:
                          null,

                        latest_snapshot_id:
                          "snapshot-uuid",

                        execution_authorized:
                          false,

                        created_at:
                          new Date(),

                        updated_at:
                          new Date(),
                      },
                    ],
                  };
                }


                return {
                  rows:
                    [],

                  rowCount:
                    0,
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
          new PostgresCoverageGapRepository({
            scope,
          });


        const result =
          await repository
            .syncCurrentGaps({
              organizationId:
                "org",

              environmentId:
                "env",

              snapshotId:
                "snapshot-uuid",

              gaps: [
                {
                  resourcePublicId:
                    "resource-public",

                  resourceType:
                    "robotics.lidar",

                  classification:
                    "UNKNOWN",

                  reasonCode:
                    "NO_FAILURE_MODE",

                  severity:
                    "HIGH",

                  priorityScore:
                    80,

                  explanation:
                    "No Failure Mode coverage",
                },
              ],
            });


        expect(
          result
        ).toHaveLength(
          1
        );


        expect(
          result[0]
            .evaluationId
        ).toBeNull();


        expect(
          result[0]
            .reasonCode
        ).toBe(
          "NO_FAILURE_MODE"
        );


        expect(
          queries.some(
            (
              sql
            ) =>
              sql.includes(
                "coverage.gaps"
              )
          )
        ).toBe(true);
      }
    );


    test(
      "current gap sync resolves gaps absent from next refresh",
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


                return {
                  rows:
                    [],

                  rowCount:
                    0,
                };
              }
            ),
        };


        const repository =
          new PostgresCoverageGapRepository({
            scope: {
              run:
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
                  ),
            },
          });


        await repository
          .syncCurrentGaps({
            organizationId:
              "org",

            environmentId:
              "env",

            gaps:
              [],
          });


        expect(
          queries.some(
            (
              sql
            ) =>
              sql.includes(
                "resolved_at"
              ) &&
              sql.includes(
                "UPDATE"
              )
          )
        ).toBe(true);
      }
    );


    test(
      "coverage gaps never authorize execution",
      () => {
        const files = [
          "persistence/postgres/PostgresCoverageGapRepository.js",

          "controllers/coverageController.js",

          "routes/coverageRoutes.js",

          "coverage/CoverageRefreshOrchestrator.js",
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
        }
      }
    );


    test(
      "coverage API exposes gaps endpoint",
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
          '"/gaps"'
        );


        expect(
          source
        ).toContain(
          "controller.gaps"
        );
      }
    );
  }
);