"use strict";

const crypto = require(
  "node:crypto"
);

const PostgresResourceRelationshipRepository =
  require(
    "../../../persistence/postgres/PostgresResourceRelationshipRepository"
  );


function createHarness() {
  const resources =
    new Map();

  const relationships = [];

  const organizationUuid =
    crypto.randomUUID();

  const environmentUuid =
    crypto.randomUUID();


  function clone(
    value
  ) {
    return JSON.parse(
      JSON.stringify(
        value
      )
    );
  }


  function addResource(
    id = crypto.randomUUID()
  ) {
    const resource = {
      id,

      organization_id:
        organizationUuid,

      environment_id:
        environmentUuid,
    };


    resources.set(
      id,
      resource
    );


    return resource;
  }


  function normalizeSql(
    sql
  ) {
    return String(
      sql
    )
      .replace(
        /\s+/g,
        " "
      )
      .trim()
      .toLowerCase();
  }


  const client = {
    query:
      jest.fn(
        async function (
          sql,
          params = []
        ) {
          const statement =
            normalizeSql(
              sql
            );


          /*
           * Endpoint verification.
           */
          if (
            statement.startsWith(
              "select id from resources.resources"
            )
          ) {
            const resource =
              resources.get(
                params[2]
              );


            const valid =
              resource &&
              resource.organization_id ===
                params[0] &&
              resource.environment_id ===
                params[1];


            return {
              rows:
                valid
                  ? [
                      {
                        id:
                          resource.id,
                      },
                    ]
                  : [],

              rowCount:
                valid
                  ? 1
                  : 0,
            };
          }


          /*
           * Existing live relationship.
           */
          if (
            statement.startsWith(
              "select * from resources.resource_relationships"
            ) &&
            statement.includes(
              "source_resource_id = $3"
            ) &&
            statement.includes(
              "target_resource_id = $4"
            ) &&
            statement.includes(
              "relationship_type = $5"
            ) &&
            statement.includes(
              "status = 'active'"
            )
          ) {
            const row =
              relationships.find(
                function (
                  relationship
                ) {
                  return (
                    relationship.organization_id ===
                      params[0] &&
                    relationship.environment_id ===
                      params[1] &&
                    relationship.source_resource_id ===
                      params[2] &&
                    relationship.target_resource_id ===
                      params[3] &&
                    relationship.relationship_type ===
                      params[4] &&
                    relationship.status ===
                      "ACTIVE" &&
                    relationship.valid_to ===
                      null
                  );
                }
              );


            return {
              rows:
                row
                  ? [
                      clone(
                        row
                      ),
                    ]
                  : [],

              rowCount:
                row
                  ? 1
                  : 0,
            };
          }


          /*
           * INSERT.
           */
          if (
            statement.startsWith(
              "insert into resources.resource_relationships"
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

              organization_id:
                params[1],

              environment_id:
                params[2],

              source_resource_id:
                params[3],

              target_resource_id:
                params[4],

              relationship_type:
                params[5],

              source:
                params[6],

              confidence:
                params[7],

              metadata:
                JSON.parse(
                  params[8]
                ),

              valid_from:
                params[9],

              valid_to:
                params[10],

              discovered_at:
                now,

              attributes:
                JSON.parse(
                  params[11]
                ),

              status:
                params[12],

              last_seen_at:
                now,

              created_at:
                now,
            };


            relationships.push(
              row
            );


            return {
              rows: [
                clone(
                  row
                ),
              ],

              rowCount:
                1,
            };
          }


          /*
           * MARK SEEN.
           */
          if (
            statement.startsWith(
              "update resources.resource_relationships"
            ) &&
            statement.includes(
              "last_seen_at = $4"
            )
          ) {
            const row =
              relationships.find(
                function (
                  relationship
                ) {
                  return (
                    relationship.organization_id ===
                      params[0] &&
                    relationship.environment_id ===
                      params[1] &&
                    relationship.id ===
                      params[2]
                  );
                }
              );


            if (
              !row
            ) {
              return {
                rows: [],
                rowCount: 0,
              };
            }


            row.last_seen_at =
              params[3];


            return {
              rows: [
                clone(
                  row
                ),
              ],

              rowCount:
                1,
            };
          }


          /*
           * GET BY UUID.
           */
          if (
            statement.startsWith(
              "select * from resources.resource_relationships"
            ) &&
            statement.includes(
              "and id = $3"
            )
          ) {
            const row =
              relationships.find(
                function (
                  relationship
                ) {
                  return (
                    relationship.organization_id ===
                      params[0] &&
                    relationship.environment_id ===
                      params[1] &&
                    relationship.id ===
                      params[2]
                  );
                }
              );


            return {
              rows:
                row
                  ? [
                      clone(
                        row
                      ),
                    ]
                  : [],

              rowCount:
                row
                  ? 1
                  : 0,
            };
          }


          /*
           * GET BY PUBLIC ID.
           */
          if (
            statement.startsWith(
              "select * from resources.resource_relationships"
            ) &&
            statement.includes(
              "public_id = $3"
            )
          ) {
            const row =
              relationships.find(
                function (
                  relationship
                ) {
                  return (
                    relationship.organization_id ===
                      params[0] &&
                    relationship.environment_id ===
                      params[1] &&
                    relationship.public_id ===
                      params[2]
                  );
                }
              );


            return {
              rows:
                row
                  ? [
                      clone(
                        row
                      ),
                    ]
                  : [],

              rowCount:
                row
                  ? 1
                  : 0,
            };
          }


          /*
           * Directional / neighborhood lists.
           */
          if (
            statement.startsWith(
              "select * from resources.resource_relationships"
            )
          ) {
            let rows =
              relationships.filter(
                function (
                  relationship
                ) {
                  return (
                    relationship.organization_id ===
                      params[0] &&
                    relationship.environment_id ===
                      params[1]
                  );
                }
              );


            if (
              statement.includes(
                "source_resource_id = $3 or target_resource_id = $3"
              )
            ) {
              rows =
                rows.filter(
                  function (
                    relationship
                  ) {
                    return (
                      relationship.source_resource_id ===
                        params[2] ||
                      relationship.target_resource_id ===
                        params[2]
                    );
                  }
                );
            }
            else if (
              statement.includes(
                "source_resource_id = $3"
              )
            ) {
              rows =
                rows.filter(
                  function (
                    relationship
                  ) {
                    return (
                      relationship.source_resource_id ===
                      params[2]
                    );
                  }
                );
            }
            else if (
              statement.includes(
                "target_resource_id = $3"
              )
            ) {
              rows =
                rows.filter(
                  function (
                    relationship
                  ) {
                    return (
                      relationship.target_resource_id ===
                      params[2]
                    );
                  }
                );
            }


            if (
              statement.includes(
                "status = 'active'"
              )
            ) {
              rows =
                rows.filter(
                  function (
                    relationship
                  ) {
                    return (
                      relationship.status ===
                        "ACTIVE" &&
                      relationship.valid_to ===
                        null
                    );
                  }
                );
            }


            const typeMatch =
              statement.match(
                /relationship_type = \$(\d+)/
              );


            if (
              typeMatch
            ) {
              const index =
                Number(
                  typeMatch[1]
                ) -
                1;


              rows =
                rows.filter(
                  function (
                    relationship
                  ) {
                    return (
                      relationship.relationship_type ===
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
            "Unexpected Phase 17.6 SQL: " +
              statement
          );
        }
      ),
  };


  const scope = {
    run:
      jest.fn(
        async function (
          requestedScope,
          work
        ) {
          return work(
            client,

            {
              organizationUuid,

              environmentUuid,

              applicationOrganizationId:
                requestedScope.organizationId,

              applicationEnvironmentId:
                requestedScope.environmentId,
            }
          );
        }
      ),
  };


  return {
    resources,

    relationships,

    addResource,

    client,

    scope,

    organizationUuid,

    environmentUuid,
  };
}


describe(
  "Phase 17.6 - PostgresResourceRelationshipRepository",
  function () {
    let harness;

    let repository;

    let sourceResource;

    let targetResource;


    const organizationId =
      "aira-dev-org";

    const environmentId =
      "env_aira_development";


    beforeEach(
      function () {
        harness =
          createHarness();


        sourceResource =
          harness.addResource();


        targetResource =
          harness.addResource();


        repository =
          new PostgresResourceRelationshipRepository({
            scope:
              harness.scope,
          });
      }
    );


    function relationshipInput(
      overrides = {}
    ) {
      return {
        organizationId,

        environmentId,

        sourceResourceId:
          sourceResource.id,

        targetResourceId:
          targetResource.id,

        relationshipType:
          "DEPENDS_ON",

        attributes: {
          protocol:
            "tcp",
        },

        source:
          "phase17.6-test",

        confidence:
          0.95,

        validFrom:
          new Date(
            "2026-08-28T05:00:00.000Z"
          ),

        metadata: {
          phase:
            "17.6",
        },

        ...overrides,
      };
    }


    test(
      "constructs canonical relationship repository",
      function () {
        expect(
          repository
        ).toBeInstanceOf(
          PostgresResourceRelationshipRepository
        );
      }
    );


    test(
      "creates current relationship",
      async function () {
        const relationship =
          await repository
            .createRelationship(
              relationshipInput()
            );


        expect(
          relationship.id
        ).toBeDefined();


        expect(
          relationship.publicId
        ).toMatch(
          /^rel_/
        );


        expect(
          relationship.relationshipType
        ).toBe(
          "DEPENDS_ON"
        );


        expect(
          relationship.status
        ).toBe(
          "ACTIVE"
        );


        expect(
          relationship.sourceResourceId
        ).toBe(
          sourceResource.id
        );


        expect(
          relationship.targetResourceId
        ).toBe(
          targetResource.id
        );
      }
    );


    test(
      "repeated discovery of same live edge is idempotent",
      async function () {
        const first =
          await repository
            .createRelationship(
              relationshipInput()
            );


        const second =
          await repository
            .createRelationship(
              relationshipInput()
            );


        expect(
          second.id
        ).toBe(
          first.id
        );


        expect(
          harness.relationships
        ).toHaveLength(
          1
        );
      }
    );


    test(
      "retrieves relationship by PostgreSQL UUID",
      async function () {
        const created =
          await repository
            .createRelationship(
              relationshipInput()
            );


        const found =
          await repository
            .getRelationshipById({
              organizationId,

              environmentId,

              relationshipId:
                created.id,
            });


        expect(
          found.id
        ).toBe(
          created.id
        );
      }
    );


    test(
      "retrieves relationship by public ID",
      async function () {
        const created =
          await repository
            .createRelationship(
              relationshipInput({
                publicId:
                  "rel_public_test",
              })
            );


        const found =
          await repository
            .getRelationshipByPublicId({
              organizationId,

              environmentId,

              publicId:
                created.publicId,
            });


        expect(
          found.id
        ).toBe(
          created.id
        );
      }
    );


    test(
      "finds active semantic edge",
      async function () {
        const created =
          await repository
            .createRelationship(
              relationshipInput()
            );


        const found =
          await repository
            .findActiveRelationship({
              organizationId,

              environmentId,

              sourceResourceId:
                sourceResource.id,

              targetResourceId:
                targetResource.id,

              relationshipType:
                "DEPENDS_ON",
            });


        expect(
          found.id
        ).toBe(
          created.id
        );
      }
    );


    test(
      "lists outgoing relationships",
      async function () {
        await repository
          .createRelationship(
            relationshipInput()
          );


        const outgoing =
          await repository
            .listOutgoingRelationships({
              organizationId,

              environmentId,

              resourceId:
                sourceResource.id,
            });


        expect(
          outgoing
        ).toHaveLength(
          1
        );


        expect(
          outgoing[0]
            .targetResourceId
        ).toBe(
          targetResource.id
        );
      }
    );


    test(
      "lists incoming relationships",
      async function () {
        await repository
          .createRelationship(
            relationshipInput()
          );


        const incoming =
          await repository
            .listIncomingRelationships({
              organizationId,

              environmentId,

              resourceId:
                targetResource.id,
            });


        expect(
          incoming
        ).toHaveLength(
          1
        );


        expect(
          incoming[0]
            .sourceResourceId
        ).toBe(
          sourceResource.id
        );
      }
    );


    test(
      "lists one-hop neighborhood",
      async function () {
        const third =
          harness.addResource();


        await repository
          .createRelationship(
            relationshipInput()
          );


        await repository
          .createRelationship(
            relationshipInput({
              sourceResourceId:
                targetResource.id,

              targetResourceId:
                third.id,

              relationshipType:
                "CONNECTS_TO",
            })
          );


        const neighborhood =
          await repository
            .listRelationshipsForResource({
              organizationId,

              environmentId,

              resourceId:
                targetResource.id,
            });


        expect(
          neighborhood
        ).toHaveLength(
          2
        );
      }
    );


    test(
      "marks relationship seen without changing topology identity",
      async function () {
        const created =
          await repository
            .createRelationship(
              relationshipInput()
            );


        const seenAt =
          new Date(
            "2026-08-28T09:00:00.000Z"
          );


        const updated =
          await repository
            .markRelationshipSeen({
              organizationId,

              environmentId,

              relationshipId:
                created.id,

              seenAt,
            });


        expect(
          updated.id
        ).toBe(
          created.id
        );


        expect(
          updated.sourceResourceId
        ).toBe(
          created.sourceResourceId
        );


        expect(
          updated.targetResourceId
        ).toBe(
          created.targetResourceId
        );


        expect(
          updated.relationshipType
        ).toBe(
          created.relationshipType
        );


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
      "supports domain-neutral cross-domain graph edges",
      async function () {
        const relationship =
          await repository
            .createRelationship(
              relationshipInput({
                relationshipType:
                  "RUNS_ON",

                attributes: {
                  discovery:
                    "inventory",
                },
              })
            );


        expect(
          relationship.relationshipType
        ).toBe(
          "RUNS_ON"
        );
      }
    );


    test(
      "rejects self relationships",
      async function () {
        await expect(
          repository
            .createRelationship(
              relationshipInput({
                targetResourceId:
                  sourceResource.id,
              })
            )
        ).rejects.toMatchObject({
          code:
            "RELATIONSHIP_CONTRACT_INVALID",
        });
      }
    );


    test(
      "rejects invalid relationship type format",
      async function () {
        await expect(
          repository
            .createRelationship(
              relationshipInput({
                relationshipType:
                  "depends-on",
              })
            )
        ).rejects.toMatchObject({
          code:
            "RELATIONSHIP_CONTRACT_INVALID",
        });
      }
    );


    test(
      "rejects invalid confidence",
      async function () {
        await expect(
          repository
            .createRelationship(
              relationshipInput({
                confidence:
                  2,
              })
            )
        ).rejects.toMatchObject({
          code:
            "RELATIONSHIP_CONTRACT_INVALID",
        });
      }
    );


    test(
      "rejects missing source Resource",
      async function () {
        await expect(
          repository
            .createRelationship(
              relationshipInput({
                sourceResourceId:
                  crypto.randomUUID(),
              })
            )
        ).rejects.toMatchObject({
          code:
            "RELATIONSHIP_SOURCE_RESOURCE_NOT_FOUND",
        });
      }
    );


    test(
      "rejects missing target Resource",
      async function () {
        await expect(
          repository
            .createRelationship(
              relationshipInput({
                targetResourceId:
                  crypto.randomUUID(),
              })
            )
        ).rejects.toMatchObject({
          code:
            "RELATIONSHIP_TARGET_RESOURCE_NOT_FOUND",
        });
      }
    );


    test(
      "requires tenant scope",
      async function () {
        await expect(
          repository
            .createRelationship({
              sourceResourceId:
                sourceResource.id,

              targetResourceId:
                targetResource.id,

              relationshipType:
                "DEPENDS_ON",
            })
        ).rejects.toMatchObject({
          code:
            "POSTGRES_RELATIONSHIP_SCOPE_REQUIRED",
        });
      }
    );


    test(
      "all persistence uses PostgresTenantScope",
      async function () {
        await repository
          .createRelationship(
            relationshipInput()
          );


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
      "does not expose topology mutation APIs before Phase 17.7",
      function () {
        expect(
          repository.updateRelationship
        ).toBeUndefined();


        expect(
          repository.removeRelationship
        ).toBeUndefined();


        expect(
          repository.reactivateRelationship
        ).toBeUndefined();


        expect(
          repository.deleteRelationship
        ).toBeUndefined();
      }
    );


    test(
      "does not write relationship history in Phase 17.6",
      async function () {
        await repository
          .createRelationship(
            relationshipInput()
          );


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


        const wroteHistory =
          statements.some(
            function (
              statement
            ) {
              return (
                statement.includes(
                  "insert into resources.relationship_history"
                ) ||
                statement.includes(
                  "update resources.relationship_history"
                ) ||
                statement.includes(
                  "delete from resources.relationship_history"
                )
              );
            }
          );


        expect(
          wroteHistory
        ).toBe(
          false
        );
      }
    );


    test(
      "relationship knowledge does not expose execution authorization",
      function () {
        expect(
          repository.authorize
        ).toBeUndefined();


        expect(
          repository.execute
        ).toBeUndefined();


        expect(
          repository.executionAuthorized
        ).toBeUndefined();
      }
    );
  }
);