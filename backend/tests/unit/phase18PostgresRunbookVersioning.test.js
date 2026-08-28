"use strict";


const fs =
  require(
    "fs"
  );


const path =
  require(
    "path"
  );


const PostgresRunbookRepository =
  require(
    "../../persistence/postgres/PostgresRunbookRepository"
  );


const {
  RUNBOOK_LIFECYCLE,
} =
  require(
    "../../constants/runbook"
  );


const MIGRATION =
  path.join(
    __dirname,

    "../../persistence/postgres/migrations/0072_runbook_version_integrity.sql"
  );


const ORGANIZATION_ID =
  "aira-dev-org";


const ENVIRONMENT_ID =
  "env_aira_development";


function resolvedScope() {
  return {
    organizationUuid:
      "11111111-1111-4111-8111-111111111111",

    environmentUuid:
      "22222222-2222-4222-8222-222222222222",

    applicationOrganizationId:
      ORGANIZATION_ID,

    applicationEnvironmentId:
      ENVIRONMENT_ID,
  };
}


class FakeScope {

  constructor(
    queryHandler
  ) {
    this.queryHandler =
      queryHandler;
  }


  async run(
    scope,
    work
  ) {
    expect(
      scope
    )
      .toEqual({
        organizationId:
          ORGANIZATION_ID,

        environmentId:
          ENVIRONMENT_ID,
      });


    return work(
      {
        query:
          this.queryHandler,
      },

      resolvedScope()
    );
  }
}


function baseRunbook(
  overrides = {}
) {
  return {
    apiVersion:
      "aira.io/v1",

    kind:
      "Runbook",

    runbookId:
      "RB-K8S-POD-RESTART",

    semver:
      "1.0.0",

    name:
      "Restart Kubernetes pod",

    description:
      "Deterministically restarts a selected pod.",

    lifecycle:
      RUNBOOK_LIFECYCLE
        .DRAFT,

    owner: {
      ownerType:
        "tenant",
    },

    scope: {
      resourceTypes: [
        "kubernetes.pod",
      ],
    },

    risk: {
      level:
        "MEDIUM",
    },

    parameters: [],

    steps: [
      {
        id:
          "restart-pod",

        type:
          "kubernetes",

        action:
          "restart_pod",

        failurePolicy:
          "STOP",
      },
    ],

    rollbackConfig: {
      strategy:
        "NONE",
    },

    verification: {
      strategy:
        "ALL",

      checks: [],
    },

    ...overrides,
  };
}


function definitionRow(
  overrides = {}
) {
  return {
    id:
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",

    public_id:
      "rbdef_test",

    runbook_key:
      "RB-K8S-POD-RESTART",

    legacy_mongo_id:
      null,

    scope_type:
      "ENVIRONMENT",

    organization_id:
      resolvedScope()
        .organizationUuid,

    environment_id:
      resolvedScope()
        .environmentUuid,

    name:
      "Restart Kubernetes pod",

    description:
      null,

    owner_type:
      "tenant",

    source_type:
      "API",

    status:
      "ACTIVE",

    metadata: {},

    created_at:
      new Date(),

    updated_at:
      new Date(),

    ...overrides,
  };
}


function versionRow(
  overrides = {}
) {
  return {
    id:
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",

    public_id:
      "rbver_test",

    runbook_definition_id:
      definitionRow()
        .id,

    runbook_key:
      "RB-K8S-POD-RESTART",

    scope_type:
      "ENVIRONMENT",

    organization_id:
      resolvedScope()
        .organizationUuid,

    environment_id:
      resolvedScope()
        .environmentUuid,

    semver:
      "1.0.0",

    lifecycle:
      "DRAFT",

    checksum:
      "checksum",

    definition:
      baseRunbook(),

    provenance: {
      source:
        "unit-test",
    },

    safety: {
      executionAuthorized:
        false,

      grantsExecutionPermission:
        false,

      bypassesPolicy:
        false,

      bypassesAuthorization:
        false,

      bypassesApproval:
        false,

      bypassesEntitlements:
        false,

      bypassesKillSwitch:
        false,
    },

    immutable:
      false,

    locked_at:
      null,

    first_executed_at:
      null,

    published_at:
      null,

    metadata: {},

    created_at:
      new Date(),

    ...overrides,
  };
}


describe(
  "Phase 18.5 PostgreSQL Runbook Versioning",
  () => {

    test(
      "0072 enforces Runbook definition/version scope consistency",
      () => {

        const sql =
          fs.readFileSync(
            MIGRATION,

            "utf8"
          );


        expect(
          sql
        )
          .toMatch(
            /validate_runbook_version_scope/i
          );


        expect(
          sql
        )
          .toContain(
            "RUNBOOK_VERSION_SCOPE_MISMATCH"
          );
      }
    );


    test(
      "0072 permits only one ACTIVE version per Runbook definition",
      () => {

        const sql =
          fs.readFileSync(
            MIGRATION,

            "utf8"
          );


        expect(
          sql
        )
          .toMatch(
            /uq_runbook_one_active_version/i
          );


        expect(
          sql
        )
          .toMatch(
            /WHERE lifecycle = 'ACTIVE'/i
          );
      }
    );


    test(
      "0072 protects locked Runbook content",
      () => {

        const sql =
          fs.readFileSync(
            MIGRATION,

            "utf8"
          );


        expect(
          sql
        )
          .toContain(
            "RUNBOOK_VERSION_IMMUTABLE"
          );


        expect(
          sql
        )
          .toMatch(
            /NEW\.definition[\s\S]*OLD\.definition/i
          );


        expect(
          sql
        )
          .toMatch(
            /NEW\.checksum[\s\S]*OLD\.checksum/i
          );
      }
    );


    test(
      "0072 prevents deletion of executed Runbook versions",
      () => {

        const sql =
          fs.readFileSync(
            MIGRATION,

            "utf8"
          );


        expect(
          sql
        )
          .toMatch(
            /BEFORE DELETE/i
          );


        expect(
          sql
        )
          .toMatch(
            /first_executed_at IS NOT NULL/i
          );
      }
    );


    test(
      "creates tenant RunbookDefinition in PostgreSQL",
      async () => {

        const scope =
          new FakeScope(
            async (
              sql
            ) => {

              expect(
                sql
              )
                .toMatch(
                  /INSERT INTO knowledge\.runbook_definitions/i
                );


              return {
                rows: [
                  definitionRow(),
                ],
              };
            }
          );


        const repository =
          new PostgresRunbookRepository({
            scope,
          });


        const result =
          await repository
            .createDefinition({
              organizationId:
                ORGANIZATION_ID,

              environmentId:
                ENVIRONMENT_ID,

              scopeType:
                "ENVIRONMENT",

              runbookId:
                "RB-K8S-POD-RESTART",

              name:
                "Restart Kubernetes pod",

              ownerType:
                "tenant",
            });


        expect(
          result.runbookId
        )
          .toBe(
            "RB-K8S-POD-RESTART"
          );


        expect(
          result.scopeType
        )
          .toBe(
            "ENVIRONMENT"
          );
      }
    );


    test(
      "ordinary tenant repository rejects GLOBAL Runbook writes",
      async () => {

        const repository =
          new PostgresRunbookRepository({
            scope:
              new FakeScope(
                async () => ({
                  rows: [],
                })
              ),
          });


        await expect(
          repository
            .createDefinition({
              organizationId:
                ORGANIZATION_ID,

              environmentId:
                ENVIRONMENT_ID,

              scopeType:
                "GLOBAL",

              runbookId:
                "RB-K8S-POD-RESTART",

              name:
                "Global runbook",
            })
        )
          .rejects
          .toMatchObject({
            code:
              "POSTGRES_RUNBOOK_GLOBAL_WRITE_REQUIRES_CONTROLLED_IMPORT",
          });
      }
    );


    test(
      "creates new RunbookVersion in PostgreSQL",
      async () => {

        let call =
          0;


        const scope =
          new FakeScope(
            async (
              sql
            ) => {

              call +=
                1;


              if (
                call ===
                1
              ) {
                return {
                  rows: [
                    definitionRow(),
                  ],
                };
              }


              if (
                call ===
                2
              ) {
                return {
                  rows: [],
                };
              }


              expect(
                sql
              )
                .toMatch(
                  /INSERT INTO knowledge\.runbook_versions/i
                );


              return {
                rows: [
                  versionRow(),
                ],
              };
            }
          );


        const repository =
          new PostgresRunbookRepository({
            scope,
          });


        const result =
          await repository
            .createVersion({
              organizationId:
                ORGANIZATION_ID,

              environmentId:
                ENVIRONMENT_ID,

              runbook:
                baseRunbook(),

              provenance: {
                source:
                  "unit-test",
              },
            });


        expect(
          result.semver
        )
          .toBe(
            "1.0.0"
          );


        expect(
          result.safety
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "rejects Runbook version that is not newer than current branch",
      async () => {

        let call =
          0;


        const repository =
          new PostgresRunbookRepository({
            scope:
              new FakeScope(
                async () => {

                  call +=
                    1;


                  if (
                    call ===
                    1
                  ) {
                    return {
                      rows: [
                        definitionRow(),
                      ],
                    };
                  }


                  return {
                    rows: [
                      {
                        semver:
                          "2.0.0",
                      },
                    ],
                  };
                }
              ),
          });


        await expect(
          repository
            .createVersion({
              organizationId:
                ORGANIZATION_ID,

              environmentId:
                ENVIRONMENT_ID,

              runbook:
                baseRunbook({
                  semver:
                    "1.0.0",
                }),
            })
        )
          .rejects
          .toMatchObject({
            code:
              "POSTGRES_RUNBOOK_VERSION_NOT_NEWER",
          });
      }
    );


    test(
      "allows valid lifecycle transition",
      async () => {

        let call =
          0;


        const repository =
          new PostgresRunbookRepository({
            scope:
              new FakeScope(
                async (
                  sql
                ) => {

                  call +=
                    1;


                  if (
                    call ===
                    1
                  ) {
                    return {
                      rows: [
                        versionRow(),
                      ],
                    };
                  }


                  expect(
                    sql
                  )
                    .toMatch(
                      /UPDATE knowledge\.runbook_versions/i
                    );


                  return {
                    rows: [
                      versionRow({
                        lifecycle:
                          "VALIDATED",

                        definition:
                          baseRunbook({
                            lifecycle:
                              "VALIDATED",
                          }),
                      }),
                    ],
                  };
                }
              ),
          });


        const result =
          await repository
            .transitionVersionLifecycle({
              organizationId:
                ORGANIZATION_ID,

              environmentId:
                ENVIRONMENT_ID,

              runbookId:
                "RB-K8S-POD-RESTART",

              semver:
                "1.0.0",

              targetLifecycle:
                "VALIDATED",
            });


        expect(
          result.lifecycle
        )
          .toBe(
            "VALIDATED"
          );
      }
    );


    test(
      "rejects invalid lifecycle transition",
      async () => {

        const repository =
          new PostgresRunbookRepository({
            scope:
              new FakeScope(
                async () => ({
                  rows: [
                    versionRow(),
                  ],
                })
              ),
          });


        await expect(
          repository
            .transitionVersionLifecycle({
              organizationId:
                ORGANIZATION_ID,

              environmentId:
                ENVIRONMENT_ID,

              runbookId:
                "RB-K8S-POD-RESTART",

              semver:
                "1.0.0",

              targetLifecycle:
                "ACTIVE",
            })
        )
          .rejects
          .toMatchObject({
            code:
              "POSTGRES_RUNBOOK_INVALID_TRANSITION",
          });
      }
    );


    test(
      "only ACTIVE Runbook may become an execution definition",
      async () => {

        const repository =
          new PostgresRunbookRepository({
            scope:
              new FakeScope(
                async () => ({
                  rows: [
                    versionRow(),
                  ],
                })
              ),
          });


        await expect(
          repository
            .lockExecutionDefinition({
              organizationId:
                ORGANIZATION_ID,

              environmentId:
                ENVIRONMENT_ID,

              runbookId:
                "RB-K8S-POD-RESTART",

              semver:
                "1.0.0",
            })
        )
          .rejects
          .toMatchObject({
            code:
              "POSTGRES_RUNBOOK_NOT_EXECUTABLE",
          });
      }
    );


    test(
      "locks ACTIVE Runbook and returns exact frozen execution definition",
      async () => {

        let call =
          0;


        const repository =
          new PostgresRunbookRepository({
            scope:
              new FakeScope(
                async (
                  sql
                ) => {

                  call +=
                    1;


                  if (
                    call ===
                    1
                  ) {
                    return {
                      rows: [
                        versionRow({
                          lifecycle:
                            "ACTIVE",

                          definition:
                            baseRunbook({
                              lifecycle:
                                "ACTIVE",
                            }),
                        }),
                      ],
                    };
                  }


                  expect(
                    sql
                  )
                    .toMatch(
                      /immutable = true/i
                    );


                  return {
                    rows: [
                      versionRow({
                        lifecycle:
                          "ACTIVE",

                        immutable:
                          true,

                        locked_at:
                          new Date(),

                        first_executed_at:
                          new Date(),

                        definition:
                          baseRunbook({
                            lifecycle:
                              "ACTIVE",
                          }),
                      }),
                    ],
                  };
                }
              ),
          });


        const result =
          await repository
            .lockExecutionDefinition({
              organizationId:
                ORGANIZATION_ID,

              environmentId:
                ENVIRONMENT_ID,

              runbookId:
                "RB-K8S-POD-RESTART",

              semver:
                "1.0.0",
            });


        expect(
          result.immutable
        )
          .toBe(
            true
          );


        expect(
          result.versionRef
        )
          .toBe(
            "RB-K8S-POD-RESTART@1.0.0"
          );


        expect(
          Object.isFrozen(
            result
          )
        )
          .toBe(
            true
          );


        expect(
          Object.isFrozen(
            result.definition
          )
        )
          .toBe(
            true
          );
      }
    );


    test(
      "isExecutable returns true only for ACTIVE Runbook version",
      async () => {

        const repository =
          new PostgresRunbookRepository({
            scope:
              new FakeScope(
                async () => ({
                  rows: [
                    versionRow({
                      lifecycle:
                        "ACTIVE",
                    }),
                  ],
                })
              ),
          });


        const result =
          await repository
            .isExecutable({
              organizationId:
                ORGANIZATION_ID,

              environmentId:
                ENVIRONMENT_ID,

              runbookId:
                "RB-K8S-POD-RESTART",

              semver:
                "1.0.0",
            });


        expect(
          result
        )
          .toBe(
            true
          );
      }
    );
  }
);