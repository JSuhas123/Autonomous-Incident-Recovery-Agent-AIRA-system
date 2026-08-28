"use strict";

/**
 * Phase 18.6
 * PostgreSQL-backed RunbookRegistry compatibility tests.
 */

const {
  RunbookRegistry,
  RegistryError,
  getRunbookRegistry,
  resetRunbookRegistry,
} =
  require(
    "../../runbooks/registry/runbookRegistry"
  );


const {
  RUNBOOK_LIFECYCLE,
} =
  require(
    "../../constants/runbook"
  );


const SCOPE =
  Object.freeze({
    tenantId:
      "tenant-a",

    organizationId:
      "aira-dev-org",

    environmentId:
      "env_aira_development",
  });


function runbookDefinition(
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
      "Restart Kubernetes Pod",

    description:
      "Deterministic Phase 18.6 test Runbook.",

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
        "LOW",
    },

    parameters: [],

    steps: [
      {
        id:
          "restart",

        type:
          "kubernetes",

        action:
          "restart_pod",

        failurePolicy:
          "STOP",
      },
    ],

    verification: {
      strategy:
        "ALL",

      checks: [],
    },

    rollbackConfig: {
      strategy:
        "NONE",
    },

    ...overrides,
  };
}


function storedVersion(
  overrides = {}
) {
  const definition =
    runbookDefinition(
      overrides.definition ||
      {}
    );


  return {
    id:
      "33333333-3333-4333-8333-333333333333",

    publicId:
      "rbver_test",

    runbookDefinitionId:
      "44444444-4444-4444-8444-444444444444",

    runbookId:
      definition.runbookId,

    scopeType:
      "ENVIRONMENT",

    organizationId:
      SCOPE.organizationId,

    environmentId:
      SCOPE.environmentId,

    canonicalOrganizationId:
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",

    canonicalEnvironmentId:
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",

    semver:
      definition.semver,

    lifecycle:
      definition.lifecycle,

    checksum:
      "checksum",

    definition,

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

    lockedAt:
      null,

    firstExecutedAt:
      null,

    publishedAt:
      null,

    metadata: {},

    createdAt:
      new Date(),

    ...overrides,

    definition,
  };
}


function repositoryDouble(
  overrides = {}
) {
  return {
    getOwnedDefinitionByKey:
      jest
        .fn()
        .mockResolvedValue({
          id:
            "44444444-4444-4444-8444-444444444444",

          runbookId:
            "RB-K8S-POD-RESTART",

          scopeType:
            "ENVIRONMENT",
        }),

    createDefinition:
      jest
        .fn(),

    createVersion:
      jest
        .fn()
        .mockImplementation(
          async (
            input
          ) =>
            storedVersion({
              definition:
                input.runbook,

              semver:
                input.runbook.semver,

              lifecycle:
                input.runbook.lifecycle,
            })
        ),

    listVisibleVersions:
      jest
        .fn()
        .mockResolvedValue([
          storedVersion(),
        ]),

    getVersion:
      jest
        .fn()
        .mockResolvedValue(
          storedVersion()
        ),

    transitionVersionLifecycle:
      jest
        .fn()
        .mockImplementation(
          async (
            input
          ) =>
            storedVersion({
              lifecycle:
                input.targetLifecycle,

              definition:
                runbookDefinition({
                  lifecycle:
                    input.targetLifecycle,
                }),
            })
        ),

    lockExecutionDefinition:
      jest
        .fn()
        .mockResolvedValue(
          storedVersion({
            lifecycle:
              RUNBOOK_LIFECYCLE
                .ACTIVE,

            immutable:
              true,

            lockedAt:
              new Date(),

            firstExecutedAt:
              new Date(),

            versionRef:
              "RB-K8S-POD-RESTART@1.0.0",

            definition:
              runbookDefinition({
                lifecycle:
                  RUNBOOK_LIFECYCLE
                    .ACTIVE,
              }),
          })
        ),

    ...overrides,
  };
}


describe(
  "RunbookRegistry — Phase 18.6 PostgreSQL cutover",
  () => {

    test(
      "register stores tenant Runbook through PostgreSQL repository",
      async () => {

        const repository =
          repositoryDouble();


        const registry =
          new RunbookRegistry({
            repository,

            actionRegistry: {},
          });


        const result =
          await registry.register(
            runbookDefinition(),
            SCOPE
          );


        expect(
          repository
            .getOwnedDefinitionByKey
        )
          .toHaveBeenCalledWith({
            organizationId:
              SCOPE.organizationId,

            environmentId:
              SCOPE.environmentId,

            scopeType:
              "ENVIRONMENT",

            runbookId:
              "RB-K8S-POD-RESTART",
          });


        expect(
          repository
            .createVersion
        )
          .toHaveBeenCalled();


        expect(
          result.runbookId
        )
          .toBe(
            "RB-K8S-POD-RESTART"
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "creates PostgreSQL definition when exact tenant definition is absent",
      async () => {

        const repository =
          repositoryDouble({
            getOwnedDefinitionByKey:
              jest
                .fn()
                .mockResolvedValue(
                  null
                ),

            createDefinition:
              jest
                .fn()
                .mockResolvedValue({
                  id:
                    "44444444-4444-4444-8444-444444444444",
                }),
          });


        const registry =
          new RunbookRegistry({
            repository,

            actionRegistry: {},
          });


        await registry.register(
          runbookDefinition(),
          SCOPE
        );


        expect(
          repository
            .createDefinition
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              organizationId:
                SCOPE.organizationId,

              environmentId:
                SCOPE.environmentId,

              runbookId:
                "RB-K8S-POD-RESTART",

              scopeType:
                "ENVIRONMENT",

              ownerType:
                "tenant",
            })
          );
      }
    );


    test(
      "SYSTEM Runbook registration without tenant context fails closed",
      async () => {

        const registry =
          new RunbookRegistry({
            repository:
              repositoryDouble(),

            actionRegistry: {},
          });


        await expect(
          registry.register(
            runbookDefinition({
              owner: {
                ownerType:
                  "system",
              },
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "CONTROLLED_GLOBAL_IMPORT_REQUIRED",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "getVersion returns exact PostgreSQL Runbook version",
      async () => {

        const repository =
          repositoryDouble();


        const registry =
          new RunbookRegistry({
            repository,

            actionRegistry: {},
          });


        const result =
          await registry.getVersion(
            "RB-K8S-POD-RESTART",
            "1.0.0",
            SCOPE
          );


        expect(
          repository
            .getVersion
        )
          .toHaveBeenCalledWith({
            organizationId:
              SCOPE.organizationId,

            environmentId:
              SCOPE.environmentId,

            runbookId:
              "RB-K8S-POD-RESTART",

            semver:
              "1.0.0",
          });


        expect(
          result.steps
        )
          .toHaveLength(
            1
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "getVersion throws NOT_FOUND when PostgreSQL has no exact version",
      async () => {

        const repository =
          repositoryDouble({
            getVersion:
              jest
                .fn()
                .mockResolvedValue(
                  null
                ),
          });


        const registry =
          new RunbookRegistry({
            repository,

            actionRegistry: {},
          });


        await expect(
          registry.getVersion(
            "RB-K8S-POD-RESTART",
            "9.9.9",
            SCOPE
          )
        )
          .rejects
          .toMatchObject({
            code:
              "NOT_FOUND",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "getById resolves visible PostgreSQL versions",
      async () => {

        const repository =
          repositoryDouble({
            listVisibleVersions:
              jest
                .fn()
                .mockResolvedValue([
                  storedVersion({
                    semver:
                      "1.0.0",

                    definition:
                      runbookDefinition({
                        semver:
                          "1.0.0",
                      }),
                  }),

                  storedVersion({
                    semver:
                      "2.0.0",

                    definition:
                      runbookDefinition({
                        semver:
                          "2.0.0",
                      }),
                  }),
                ]),
          });


        const registry =
          new RunbookRegistry({
            repository,

            actionRegistry: {},
          });


        const result =
          await registry.getById(
            "RB-K8S-POD-RESTART",
            SCOPE
          );


        expect(
          result
        )
          .toHaveLength(
            2
          );


        expect(
          result[0]
            .semver
        )
          .toBe(
            "2.0.0"
          );
      }
    );


    test(
      "getLatestVersion selects highest semantic version",
      async () => {

        const repository =
          repositoryDouble({
            listVisibleVersions:
              jest
                .fn()
                .mockResolvedValue([
                  storedVersion({
                    semver:
                      "1.2.0",

                    definition:
                      runbookDefinition({
                        semver:
                          "1.2.0",
                      }),
                  }),

                  storedVersion({
                    semver:
                      "3.0.0",

                    definition:
                      runbookDefinition({
                        semver:
                          "3.0.0",
                      }),
                  }),

                  storedVersion({
                    semver:
                      "2.5.0",

                    definition:
                      runbookDefinition({
                        semver:
                          "2.5.0",
                      }),
                  }),
                ]),
          });


        const registry =
          new RunbookRegistry({
            repository,

            actionRegistry: {},
          });


        const result =
          await registry.getLatestVersion(
            "RB-K8S-POD-RESTART",
            SCOPE
          );


        expect(
          result.semver
        )
          .toBe(
            "3.0.0"
          );
      }
    );


    test(
      "search delegates query to PostgreSQL",
      async () => {

        const repository =
          repositoryDouble();


        const registry =
          new RunbookRegistry({
            repository,

            actionRegistry: {},
          });


        await registry.search(
          "restart",
          SCOPE
        );


        expect(
          repository
            .listVisibleVersions
        )
          .toHaveBeenCalledWith({
            organizationId:
              SCOPE.organizationId,

            environmentId:
              SCOPE.environmentId,

            query:
              "restart",
          });
      }
    );


    test(
      "isExecutable returns true only for ACTIVE version",
      async () => {

        const repository =
          repositoryDouble({
            getVersion:
              jest
                .fn()
                .mockResolvedValue(
                  storedVersion({
                    lifecycle:
                      RUNBOOK_LIFECYCLE
                        .ACTIVE,
                  })
                ),
          });


        const registry =
          new RunbookRegistry({
            repository,

            actionRegistry: {},
          });


        await expect(
          registry.isExecutable(
            "RB-K8S-POD-RESTART",
            "1.0.0",
            SCOPE
          )
        )
          .resolves
          .toBe(
            true
          );
      }
    );


    test(
      "getExecutionDefinition locks exact ACTIVE Runbook",
      async () => {

        const repository =
          repositoryDouble();


        const registry =
          new RunbookRegistry({
            repository,

            actionRegistry: {},
          });


        const result =
          await registry.getExecutionDefinition(
            "RB-K8S-POD-RESTART",
            "1.0.0",
            SCOPE
          );


        expect(
          repository
            .lockExecutionDefinition
        )
          .toHaveBeenCalledWith({
            organizationId:
              SCOPE.organizationId,

            environmentId:
              SCOPE.environmentId,

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
          result.executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          Object.isFrozen(
            result
          )
        )
          .toBe(
            true
          );
      }
    );


    test(
      "POSTGRES_RUNBOOK_NOT_EXECUTABLE maps to RegistryError",
      async () => {

        const repository =
          repositoryDouble({
            lockExecutionDefinition:
              jest
                .fn()
                .mockRejectedValue(
                  Object.assign(
                    new Error(
                      "not active"
                    ),
                    {
                      code:
                        "POSTGRES_RUNBOOK_NOT_EXECUTABLE",
                    }
                  )
                ),
          });


        const registry =
          new RunbookRegistry({
            repository,

            actionRegistry: {},
          });


        await expect(
          registry.getExecutionDefinition(
            "RB-K8S-POD-RESTART",
            "1.0.0",
            SCOPE
          )
        )
          .rejects
          .toMatchObject({
            code:
              "NOT_EXECUTABLE",

            executionAuthorized:
              false,
          });
      }
    );
  }
);


describe(
  "RunbookRegistry error/singleton behavior",
  () => {

    afterEach(
      () => {
        resetRunbookRegistry();
      }
    );


    test(
      "RegistryError is always non-authorizing",
      () => {

        const error =
          new RegistryError(
            "TEST",
            "failure"
          );


        expect(
          error.executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          error
        )
          .toBeInstanceOf(
            Error
          );
      }
    );


    test(
      "singleton is stable until reset",
      () => {

        const first =
          getRunbookRegistry();


        const second =
          getRunbookRegistry();


        expect(
          first
        )
          .toBe(
            second
          );


        resetRunbookRegistry();


        const third =
          getRunbookRegistry();


        expect(
          third
        )
          .not
          .toBe(
            first
          );
      }
    );
  }
);