"use strict";


const fs =
  require(
    "fs"
  );


const path =
  require(
    "path"
  );


const PostgresPlaybookRepository =
  require(
    "../../persistence/postgres/PostgresPlaybookRepository"
  );


const {
  PLAYBOOK_LIFECYCLE,
} =
  require(
    "../../constants/playbook"
  );


const MIGRATION =
  path.join(
    __dirname,
    "../../persistence/postgres/migrations/0071_playbook_version_integrity.sql"
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


function basePlaybook(
  overrides = {}
) {
  return {
    apiVersion:
      "aira.io/v1",

    kind:
      "Playbook",

    playbookId:
      "PB-K8S-POD-RESTART-001",

    semver:
      "1.0.0",

    name:
      "Restart unhealthy Kubernetes pod",

    description:
      "Deterministic recovery orchestration.",

    lifecycle:
      PLAYBOOK_LIFECYCLE
        .DRAFT,

    owner: {
      ownerType:
        "tenant",
    },

    risk: {
      level:
        "MEDIUM",

      blastRadius:
        "pod",
    },

    policy: {
      required:
        true,
    },

    approval: {
      mode:
        "MANUAL",
    },

    stages: [
      {
        id:
          "restart",

        order:
          1,

        name:
          "Restart",

        type:
          "RECOVERY",

        failurePolicy:
          "STOP",

        runbooks: [
          {
            runbookId:
              "RB-K8S-POD-RESTART",

            required:
              true,
          },
        ],
      },
    ],

    rollback: {
      strategy:
        "RUNBOOK_ROLLBACK",
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
      "pbdef_test",

    playbook_key:
      "PB-K8S-POD-RESTART-001",

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
      "Restart unhealthy Kubernetes pod",

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
      "pbver_test",

    playbook_definition_id:
      definitionRow()
        .id,

    playbook_key:
      "PB-K8S-POD-RESTART-001",

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
      basePlaybook(),

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
  "Phase 18.4 PostgreSQL Playbook Versioning",
  () => {

    test(
      "0071 enforces Playbook version scope integrity",
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
            /validate_playbook_version_scope/i
          );


        expect(
          sql
        )
          .toContain(
            "PLAYBOOK_VERSION_SCOPE_MISMATCH"
          );
      }
    );


    test(
      "0071 allows only one ACTIVE version per definition",
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
            /uq_playbook_one_active_version/i
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
      "0071 protects locked Playbook content from UPDATE",
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
            "PLAYBOOK_VERSION_IMMUTABLE"
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
      "0071 prevents deletion of executed Playbook versions",
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
      "creates tenant PlaybookDefinition in PostgreSQL",
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
                  /INSERT INTO knowledge\.playbook_definitions/i
                );


              return {
                rows: [
                  definitionRow(),
                ],
              };
            }
          );


        const repository =
          new PostgresPlaybookRepository({
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

              playbookId:
                "PB-K8S-POD-RESTART-001",

              name:
                "Restart unhealthy Kubernetes pod",

              ownerType:
                "tenant",
            });


        expect(
          result.playbookId
        )
          .toBe(
            "PB-K8S-POD-RESTART-001"
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
      "ordinary tenant repository rejects GLOBAL Playbook writes",
      async () => {

        const repository =
          new PostgresPlaybookRepository({
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

              playbookId:
                "PB-K8S-POD-RESTART-001",

              name:
                "Global playbook",
            })
        )
          .rejects
          .toMatchObject({
            code:
              "POSTGRES_PLAYBOOK_GLOBAL_WRITE_REQUIRES_CONTROLLED_IMPORT",
          });
      }
    );


    test(
      "creates a new PostgreSQL PlaybookVersion",
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
                expect(
                  sql
                )
                  .toMatch(
                    /knowledge\.playbook_definitions/i
                  );


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
                  /INSERT INTO knowledge\.playbook_versions/i
                );


              return {
                rows: [
                  versionRow(),
                ],
              };
            }
          );


        const repository =
          new PostgresPlaybookRepository({
            scope,
          });


        const result =
          await repository
            .createVersion({
              organizationId:
                ORGANIZATION_ID,

              environmentId:
                ENVIRONMENT_ID,

              playbook:
                basePlaybook(),

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
      "rejects a version that is not newer than existing version",
      async () => {

        let call =
          0;


        const repository =
          new PostgresPlaybookRepository({
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

              playbook:
                basePlaybook({
                  semver:
                    "1.0.0",
                }),
            })
        )
          .rejects
          .toMatchObject({
            code:
              "POSTGRES_PLAYBOOK_VERSION_NOT_NEWER",
          });
      }
    );


    test(
      "allows valid lifecycle transition",
      async () => {

        let call =
          0;


        const repository =
          new PostgresPlaybookRepository({
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
                      /UPDATE knowledge\.playbook_versions/i
                    );


                  return {
                    rows: [
                      versionRow({
                        lifecycle:
                          "VALIDATED",

                        definition:
                          basePlaybook({
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

              playbookId:
                "PB-K8S-POD-RESTART-001",

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
          new PostgresPlaybookRepository({
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

              playbookId:
                "PB-K8S-POD-RESTART-001",

              semver:
                "1.0.0",

              targetLifecycle:
                "ACTIVE",
            })
        )
          .rejects
          .toMatchObject({
            code:
              "POSTGRES_PLAYBOOK_INVALID_TRANSITION",
          });
      }
    );


    test(
      "only ACTIVE Playbook can become execution definition",
      async () => {

        const repository =
          new PostgresPlaybookRepository({
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

              playbookId:
                "PB-K8S-POD-RESTART-001",

              semver:
                "1.0.0",
            })
        )
          .rejects
          .toMatchObject({
            code:
              "POSTGRES_PLAYBOOK_NOT_EXECUTABLE",
          });
      }
    );


    test(
      "locks ACTIVE Playbook definition and returns frozen object",
      async () => {

        let call =
          0;


        const repository =
          new PostgresPlaybookRepository({
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
                            basePlaybook({
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
                          basePlaybook({
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

              playbookId:
                "PB-K8S-POD-RESTART-001",

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
  }
);