"use strict";

const crypto = require(
  "node:crypto"
);

const PostgresResourceRepository = require(
  "../../../persistence/postgres/PostgresResourceRepository"
);


function createHarness() {
  const resources = [];

  const organizationUuid =
    crypto.randomUUID();

  const environmentUuid =
    crypto.randomUUID();


  function clone(value) {
    return JSON.parse(
      JSON.stringify(value)
    );
  }


  function normalizeSql(sql) {
    return String(sql)
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }


  function findById(
    organizationId,
    environmentId,
    resourceId
  ) {
    return resources.find(
      function (resource) {
        return (
          resource.organization_id ===
            organizationId &&
          resource.environment_id ===
            environmentId &&
          resource.id ===
            resourceId
        );
      }
    );
  }


  const client = {
    query: jest.fn(
      async function (
        sql,
        params = []
      ) {
        const normalized =
          normalizeSql(sql);


        /*
         * ================================================================
         * CREATE RESOURCE
         * ================================================================
         */

        if (
          normalized.startsWith(
            "insert into resources.resources"
          )
        ) {
          const now =
            new Date()
              .toISOString();


          const row = {
            id:
              crypto.randomUUID(),

            public_id:
              params[0],

            legacy_mongo_id:
              null,

            tenant_id:
              null,

            organization_id:
              params[1],

            environment_id:
              params[2],

            provider:
              params[3],

            resource_type:
              params[4],

            external_id:
              params[5] ||
              null,

            name:
              params[6] ||
              null,

            display_name:
              params[7] ||
              null,

            namespace:
              params[8] ||
              null,

            region:
              params[9] ||
              null,

            zone:
              params[10] ||
              null,

            service_id:
              params[11] ||
              null,

            labels:
              params[12]
                ? JSON.parse(
                    params[12]
                  )
                : {},

            attributes:
              params[13]
                ? JSON.parse(
                    params[13]
                  )
                : {},

            current_state:
              {},

            metadata:
              params[14]
                ? JSON.parse(
                    params[14]
                  )
                : {},

            status:
              params[15] ||
              "ACTIVE",

            discovered_at:
              params[16] ||
              now,

            first_seen_at:
              params[17] ||
              now,

            last_seen_at:
              params[18] ||
              now,

            created_at:
              now,

            updated_at:
              now,
          };


          resources.push(
            row
          );


          return {
            rows: [
              clone(row),
            ],

            rowCount:
              1,
          };
        }


        /*
         * ================================================================
         * UPDATE MUTABLE RESOURCE METADATA
         * ================================================================
         *
         * IMPORTANT:
         *
         * This must appear BEFORE generic SELECT handling.
         * We also explicitly check that the SQL starts with UPDATE.
         * ================================================================
         */

        if (
          normalized.startsWith(
            "update resources.resources"
          ) &&
          normalized.includes(
            "display_name"
          ) &&
          normalized.includes(
            "attributes"
          )
        ) {
          const row =
            findById(
              params[0],
              params[1],
              params[2]
            );


          if (!row) {
            return {
              rows: [],
              rowCount: 0,
            };
          }


          if (
            params[3] !==
            null
          ) {
            row.name =
              params[3];
          }


          if (
            params[4] !==
            null
          ) {
            row.display_name =
              params[4];
          }


          if (
            params[5] !==
            null
          ) {
            row.namespace =
              params[5];
          }


          if (
            params[6] !==
            null
          ) {
            row.region =
              params[6];
          }


          if (
            params[7] !==
            null
          ) {
            row.zone =
              params[7];
          }


          if (
            params[8] !==
            null
          ) {
            row.service_id =
              params[8];
          }


          if (
            params[9] !==
            null
          ) {
            row.labels =
              JSON.parse(
                params[9]
              );
          }


          if (
            params[10] !==
            null
          ) {
            row.attributes =
              JSON.parse(
                params[10]
              );
          }


          if (
            params[11] !==
            null
          ) {
            row.metadata =
              JSON.parse(
                params[11]
              );
          }


          if (
            params[12] !==
            null
          ) {
            row.status =
              params[12];
          }


          row.updated_at =
            new Date()
              .toISOString();


          return {
            rows: [
              clone(row),
            ],

            rowCount:
              1,
          };
        }


        /*
         * ================================================================
         * MARK RESOURCE SEEN
         * ================================================================
         */

        if (
          normalized.startsWith(
            "update resources.resources"
          ) &&
          normalized.includes(
            "last_seen_at"
          )
        ) {
          const row =
            findById(
              params[0],
              params[1],
              params[2]
            );


          if (!row) {
            return {
              rows: [],
              rowCount: 0,
            };
          }


          row.last_seen_at =
            params[3] ||
            new Date()
              .toISOString();


          row.updated_at =
            new Date()
              .toISOString();


          return {
            rows: [
              clone(row),
            ],

            rowCount:
              1,
          };
        }


        /*
         * ================================================================
         * GET RESOURCE BY CANONICAL POSTGRESQL UUID
         * ================================================================
         */

        if (
          normalized.startsWith(
            "select"
          ) &&
          normalized.includes(
            "from resources.resources"
          ) &&
          normalized.includes(
            "and id = $3"
          )
        ) {
          const row =
            findById(
              params[0],
              params[1],
              params[2]
            );


          return {
            rows:
              row
                ? [
                    clone(row),
                  ]
                : [],

            rowCount:
              row
                ? 1
                : 0,
          };
        }


        /*
         * ================================================================
         * GET RESOURCE BY PUBLIC ID
         * ================================================================
         */

        if (
          normalized.startsWith(
            "select"
          ) &&
          normalized.includes(
            "from resources.resources"
          ) &&
          normalized.includes(
            "public_id = $3"
          )
        ) {
          const row =
            resources.find(
              function (resource) {
                return (
                  resource.organization_id ===
                    params[0] &&
                  resource.environment_id ===
                    params[1] &&
                  resource.public_id ===
                    params[2]
                );
              }
            );


          return {
            rows:
              row
                ? [
                    clone(row),
                  ]
                : [],

            rowCount:
              row
                ? 1
                : 0,
          };
        }


        /*
         * ================================================================
         * FIND RESOURCE BY EXTERNAL ID
         * ================================================================
         */

        if (
          normalized.startsWith(
            "select"
          ) &&
          normalized.includes(
            "from resources.resources"
          ) &&
          normalized.includes(
            "external_id = $4"
          )
        ) {
          const provider =
            params.length >= 5
              ? params[4]
              : null;


          const row =
            resources.find(
              function (resource) {
                const scopeMatches =
                  resource.organization_id ===
                    params[0] &&
                  resource.environment_id ===
                    params[1];


                const identityMatches =
                  resource.resource_type ===
                    params[2] &&
                  resource.external_id ===
                    params[3];


                if (
                  !scopeMatches ||
                  !identityMatches
                ) {
                  return false;
                }


                if (
                  provider !==
                  null
                ) {
                  return (
                    resource.provider ===
                    provider
                  );
                }


                return true;
              }
            );


          return {
            rows:
              row
                ? [
                    clone(row),
                  ]
                : [],

            rowCount:
              row
                ? 1
                : 0,
          };
        }


        /*
         * ================================================================
         * LIST RESOURCES
         * ================================================================
         */

        if (
          normalized.startsWith(
            "select"
          ) &&
          normalized.includes(
            "from resources.resources"
          )
        ) {
          let rows =
            resources.filter(
              function (resource) {
                return (
                  resource.organization_id ===
                    params[0] &&
                  resource.environment_id ===
                    params[1]
                );
              }
            );


          let parameterIndex =
            2;


          if (
            normalized.includes(
              "resource_type = $3"
            )
          ) {
            rows =
              rows.filter(
                function (resource) {
                  return (
                    resource.resource_type ===
                    params[
                      parameterIndex
                    ]
                  );
                }
              );


            parameterIndex +=
              1;
          }


          const providerMatch =
            normalized.match(
              /provider = \$(\d+)/
            );


          if (
            providerMatch
          ) {
            const index =
              Number(
                providerMatch[1]
              ) -
              1;


            rows =
              rows.filter(
                function (resource) {
                  return (
                    resource.provider ===
                    params[index]
                  );
                }
              );
          }


          const statusMatch =
            normalized.match(
              /status = \$(\d+)/
            );


          if (
            statusMatch
          ) {
            const index =
              Number(
                statusMatch[1]
              ) -
              1;


            rows =
              rows.filter(
                function (resource) {
                  return (
                    resource.status ===
                    params[index]
                  );
                }
              );
          }


          const namespaceMatch =
            normalized.match(
              /namespace = \$(\d+)/
            );


          if (
            namespaceMatch
          ) {
            const index =
              Number(
                namespaceMatch[1]
              ) -
              1;


            rows =
              rows.filter(
                function (resource) {
                  return (
                    resource.namespace ===
                    params[index]
                  );
                }
              );
          }


          const regionMatch =
            normalized.match(
              /region = \$(\d+)/
            );


          if (
            regionMatch
          ) {
            const index =
              Number(
                regionMatch[1]
              ) -
              1;


            rows =
              rows.filter(
                function (resource) {
                  return (
                    resource.region ===
                    params[index]
                  );
                }
              );
          }


          return {
            rows:
              rows.map(
                clone
              ),

            rowCount:
              rows.length,
          };
        }


        throw new Error(
          "Unexpected SQL in Phase 17.3 test harness: " +
            normalized
        );
      }
    ),
  };


  const scope = {
    run: jest.fn(
      async function (
        requestedScope,
        work
      ) {
        if (
          !requestedScope ||
          !requestedScope.organizationId ||
          !requestedScope.environmentId
        ) {
          throw new Error(
            "Phase 17.3 test scope missing"
          );
        }


        return work(
          client,

          {
            organizationUuid,

            environmentUuid,

            applicationOrganizationId:
              requestedScope
                .organizationId,

            applicationEnvironmentId:
              requestedScope
                .environmentId,
          }
        );
      }
    ),
  };


  return {
    resources,
    client,
    scope,
    organizationUuid,
    environmentUuid,
  };
}


describe(
  "Phase 17.3 - PostgresResourceRepository",
  function () {
    let harness;
    let repository;


    const organizationId =
      "aira-dev-org";

    const environmentId =
      "env_aira_development";


    beforeEach(
      function () {
        harness =
          createHarness();


        repository =
          new PostgresResourceRepository({
            scope:
              harness.scope,
          });
      }
    );


    test(
      "constructs canonical PostgreSQL resource repository",
      function () {
        expect(
          repository
        ).toBeInstanceOf(
          PostgresResourceRepository
        );
      }
    );


    test(
      "exposes required Phase 17.3 operations",
      function () {
        expect(
          typeof repository
            .createResource
        ).toBe(
          "function"
        );


        expect(
          typeof repository
            .getResourceById
        ).toBe(
          "function"
        );


        expect(
          typeof repository
            .getResourceByPublicId
        ).toBe(
          "function"
        );


        expect(
          typeof repository
            .findResourceByExternalId
        ).toBe(
          "function"
        );


        expect(
          typeof repository
            .listResources
        ).toBe(
          "function"
        );


        expect(
          typeof repository
            .updateResourceMetadata
        ).toBe(
          "function"
        );


        expect(
          typeof repository
            .markResourceSeen
        ).toBe(
          "function"
        );
      }
    );


    test(
      "creates domain-neutral resource",
      async function () {
        const resource =
          await repository.createResource({
            organizationId,

            environmentId,

            publicId:
              "res_phase17",

            provider:
              "kubernetes",

            resourceType:
              "kubernetes.pod",

            externalId:
              "payments-pod",

            name:
              "payments",

            namespace:
              "production",

            attributes: {
              restartCount:
                2,
            },
          });


        expect(
          resource.id
        ).toBeDefined();


        expect(
          resource.publicId
        ).toBe(
          "res_phase17"
        );


        expect(
          resource.resourceType
        ).toBe(
          "kubernetes.pod"
        );


        expect(
          resource.organizationId
        ).toBe(
          organizationId
        );


        expect(
          resource.environmentId
        ).toBe(
          environmentId
        );


        expect(
          resource
            .canonicalOrganizationId
        ).toBe(
          harness.organizationUuid
        );


        expect(
          resource
            .canonicalEnvironmentId
        ).toBe(
          harness.environmentUuid
        );
      }
    );


    test(
      "generates public ID when omitted",
      async function () {
        const resource =
          await repository.createResource({
            organizationId,

            environmentId,

            provider:
              "linux",

            resourceType:
              "linux.host",

            externalId:
              "host-01",
          });


        expect(
          resource.publicId
        ).toMatch(
          /^res_/
        );
      }
    );


    test(
      "retrieves resource by PostgreSQL UUID",
      async function () {
        const created =
          await repository.createResource({
            organizationId,

            environmentId,

            provider:
              "postgres",

            resourceType:
              "postgres.database",

            externalId:
              "payments-db",
          });


        const found =
          await repository.getResourceById({
            organizationId,

            environmentId,

            resourceId:
              created.id,
          });


        expect(
          found
        ).not.toBeNull();


        expect(
          found.id
        ).toBe(
          created.id
        );
      }
    );


    test(
      "retrieves resource by public ID",
      async function () {
        const created =
          await repository.createResource({
            organizationId,

            environmentId,

            publicId:
              "res_lookup",

            provider:
              "aws",

            resourceType:
              "aws.ec2",

            externalId:
              "i-test",
          });


        const found =
          await repository.getResourceByPublicId({
            organizationId,

            environmentId,

            publicId:
              created.publicId,
          });


        expect(
          found
        ).not.toBeNull();


        expect(
          found.id
        ).toBe(
          created.id
        );
      }
    );


    test(
      "retrieves resource by external identity",
      async function () {
        const created =
          await repository.createResource({
            organizationId,

            environmentId,

            provider:
              "robotics",

            resourceType:
              "robotics.amr",

            externalId:
              "amr-17",
          });


        const found =
          await repository.findResourceByExternalId({
            organizationId,

            environmentId,

            resourceType:
              "robotics.amr",

            externalId:
              "amr-17",
          });


        expect(
          found
        ).not.toBeNull();


        expect(
          found.id
        ).toBe(
          created.id
        );
      }
    );


    test(
      "lists tenant-scoped resources",
      async function () {
        await repository.createResource({
          organizationId,

          environmentId,

          provider:
            "kubernetes",

          resourceType:
            "kubernetes.pod",

          externalId:
            "pod-01",
        });


        await repository.createResource({
          organizationId,

          environmentId,

          provider:
            "postgres",

          resourceType:
            "postgres.database",

          externalId:
            "db-01",
        });


        const resources =
          await repository.listResources({
            organizationId,

            environmentId,
          });


        expect(
          resources
        ).toHaveLength(
          2
        );
      }
    );


    test(
      "filters resources by resource type",
      async function () {
        await repository.createResource({
          organizationId,

          environmentId,

          provider:
            "robotics",

          resourceType:
            "robotics.amr",

          externalId:
            "amr-filter",
        });


        await repository.createResource({
          organizationId,

          environmentId,

          provider:
            "kubernetes",

          resourceType:
            "kubernetes.pod",

          externalId:
            "pod-filter",
        });


        const resources =
          await repository.listResources({
            organizationId,

            environmentId,

            resourceType:
              "robotics.amr",
          });


        expect(
          resources
        ).toHaveLength(
          1
        );


        expect(
          resources[0]
            .resourceType
        ).toBe(
          "robotics.amr"
        );
      }
    );


    test(
      "updates mutable resource metadata without changing identity",
      async function () {
        const created =
          await repository.createResource({
            organizationId,

            environmentId,

            publicId:
              "res_update",

            provider:
              "kubernetes",

            resourceType:
              "kubernetes.pod",

            externalId:
              "pod-update",

            name:
              "before",
          });


        const updated =
          await repository.updateResourceMetadata({
            organizationId,

            environmentId,

            resourceId:
              created.id,

            name:
              "after",

            displayName:
              "Updated Pod",

            labels: {
              phase:
                "17.3",
            },

            attributes: {
              restartCount:
                5,
            },
          });


        expect(
          updated
        ).not.toBeNull();


        expect(
          updated.id
        ).toBe(
          created.id
        );


        expect(
          updated.publicId
        ).toBe(
          created.publicId
        );


        expect(
          updated.resourceType
        ).toBe(
          created.resourceType
        );


        expect(
          updated.provider
        ).toBe(
          created.provider
        );


        expect(
          updated.externalId
        ).toBe(
          created.externalId
        );


        expect(
          updated.name
        ).toBe(
          "after"
        );


        expect(
          updated.displayName
        ).toBe(
          "Updated Pod"
        );


        expect(
          updated.attributes
            .restartCount
        ).toBe(
          5
        );
      }
    );


    test(
      "marks resource as seen",
      async function () {
        const created =
          await repository.createResource({
            organizationId,

            environmentId,

            provider:
              "network",

            resourceType:
              "network.switch",

            externalId:
              "switch-01",
          });


        const seenAt =
          new Date(
            "2026-08-28T10:00:00.000Z"
          );


        const updated =
          await repository.markResourceSeen({
            organizationId,

            environmentId,

            resourceId:
              created.id,

            seenAt,
          });


        expect(
          updated
        ).not.toBeNull();


        expect(
          new Date(
            updated.lastSeenAt
          ).toISOString()
        ).toBe(
          seenAt.toISOString()
        );
      }
    );


    test(
      "returns null for unknown resource",
      async function () {
        const result =
          await repository.getResourceById({
            organizationId,

            environmentId,

            resourceId:
              crypto.randomUUID(),
          });


        expect(
          result
        ).toBeNull();
      }
    );


    test(
      "supports multiple infrastructure domains through one resource model",
      async function () {
        const examples = [
          [
            "kubernetes.pod",
            "kubernetes",
          ],

          [
            "aws.ec2",
            "aws",
          ],

          [
            "postgres.database",
            "postgres",
          ],

          [
            "network.switch",
            "network",
          ],

          [
            "robotics.amr",
            "robotics",
          ],

          [
            "robotics.lidar",
            "robotics",
          ],
        ];


        for (
          const [
            resourceType,
            provider,
          ] of examples
        ) {
          const resource =
            await repository.createResource({
              organizationId,

              environmentId,

              provider,

              resourceType,

              externalId:
                crypto.randomUUID(),
            });


          expect(
            resource.resourceType
          ).toBe(
            resourceType
          );
        }
      }
    );


    test(
      "rejects provider-specific top-level fields",
      async function () {
        await expect(
          repository.createResource({
            organizationId,

            environmentId,

            provider:
              "kubernetes",

            resourceType:
              "kubernetes.pod",

            externalId:
              "bad-pod",

            podIp:
              "10.0.0.9",
          })
        ).rejects.toMatchObject({
          code:
            "RESOURCE_CONTRACT_INVALID",
        });
      }
    );


    test(
      "allows provider-specific information inside attributes",
      async function () {
        const resource =
          await repository.createResource({
            organizationId,

            environmentId,

            provider:
              "kubernetes",

            resourceType:
              "kubernetes.pod",

            externalId:
              "good-pod",

            attributes: {
              podIp:
                "10.0.0.9",

              restartCount:
                3,
            },
          });


        expect(
          resource.attributes
            .podIp
        ).toBe(
          "10.0.0.9"
        );
      }
    );


    test(
      "rejects invalid resource type format",
      async function () {
        await expect(
          repository.createResource({
            organizationId,

            environmentId,

            provider:
              "kubernetes",

            resourceType:
              "Pod",
          })
        ).rejects.toMatchObject({
          code:
            "RESOURCE_CONTRACT_INVALID",
        });
      }
    );


    test(
      "requires provider",
      async function () {
        await expect(
          repository.createResource({
            organizationId,

            environmentId,

            resourceType:
              "kubernetes.pod",
          })
        ).rejects.toMatchObject({
          code:
            "POSTGRES_RESOURCE_PROVIDER_REQUIRED",
        });
      }
    );


    test(
      "requires tenant and environment scope",
      async function () {
        await expect(
          repository.createResource({
            provider:
              "kubernetes",

            resourceType:
              "kubernetes.pod",
          })
        ).rejects.toMatchObject({
          code:
            "POSTGRES_RESOURCE_SCOPE_REQUIRED",
        });
      }
    );


    test(
      "all persistence work uses tenant scope",
      async function () {
        await repository.createResource({
          organizationId,

          environmentId,

          provider:
            "kubernetes",

          resourceType:
            "kubernetes.pod",

          externalId:
            "scope-test",
        });


        expect(
          harness.scope.run
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          harness.scope.run
            .mock.calls[0][0]
        ).toEqual({
          organizationId,

          environmentId,
        });
      }
    );


    test(
      "does not expose arbitrary SQL APIs",
      function () {
        expect(
          repository.query
        ).toBeUndefined();


        expect(
          repository.raw
        ).toBeUndefined();


        expect(
          repository.execute
        ).toBeUndefined();
      }
    );


    test(
      "resource repository does not write resource state snapshots",
      async function () {
        await repository.createResource({
          organizationId,

          environmentId,

          provider:
            "kubernetes",

          resourceType:
            "kubernetes.pod",

          externalId:
            "state-separation",
        });


        const statements =
          harness.client.query
            .mock.calls
            .map(
              function (
                call
              ) {
                return String(
                  call[0]
                ).toLowerCase();
              }
            );


        const wroteState =
          statements.some(
            function (
              sql
            ) {
              return (
                sql.includes(
                  "insert into resources.resource_states"
                ) ||
                sql.includes(
                  "update resources.resource_states"
                ) ||
                sql.includes(
                  "delete from resources.resource_states"
                )
              );
            }
          );


        expect(
          wroteState
        ).toBe(
          false
        );
      }
    );
  }
);