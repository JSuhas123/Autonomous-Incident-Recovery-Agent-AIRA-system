"use strict";

const crypto = require(
  "node:crypto"
);

const PostgresTemporalRelationshipRepository =
  require(
    "../../../persistence/postgres/PostgresTemporalRelationshipRepository"
  );


function createHarness() {
  const relationships = [];

  const history = [];

  const graphEvents = [];

  const resources =
    new Set();

  const organizationUuid =
    crypto.randomUUID();

  const environmentUuid =
    crypto.randomUUID();


  const sourceResourceId =
    crypto.randomUUID();

  const targetResourceId =
    crypto.randomUUID();


  resources.add(
    sourceResourceId
  );

  resources.add(
    targetResourceId
  );


  function clone(
    value
  ) {
    return JSON.parse(
      JSON.stringify(
        value
      )
    );
  }


  function sql(
    value
  ) {
    return String(
      value
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
        async (
          query,
          params = []
        ) => {
          const statement =
            sql(
              query
            );


          if (
            statement.startsWith(
              "select id from resources.resources"
            )
          ) {
            return {
              rows:
                resources.has(
                  params[2]
                )
                  ? [
                      {
                        id:
                          params[2],
                      },
                    ]
                  : [],
            };
          }


          if (
            statement.includes(
              "from resources.resource_relationships"
            ) &&
            statement.includes(
              "source_resource_id = $3"
            ) &&
            statement.includes(
              "target_resource_id = $4"
            )
          ) {
            const row =
              relationships.find(
                (item) =>
                  item.source_resource_id ===
                    params[2] &&
                  item.target_resource_id ===
                    params[3] &&
                  item.relationship_type ===
                    params[4] &&
                  item.status ===
                    "ACTIVE" &&
                  item.valid_to ===
                    null
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
            };
          }


          if (
            statement.startsWith(
              "insert into resources.resource_relationships"
            )
          ) {
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
                null,

              discovered_at:
                new Date()
                  .toISOString(),

              attributes:
                JSON.parse(
                  params[10]
                ),

              status:
                "ACTIVE",

              last_seen_at:
                new Date()
                  .toISOString(),

              created_at:
                new Date()
                  .toISOString(),
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
            };
          }


          if (
            statement.startsWith(
              "insert into resources.relationship_history"
            )
          ) {
            history.push({
              public_id:
                params[0],

              relationship_id:
                params[3],

              change_type:
                params[9],

              attributes_before:
                JSON.parse(
                  params[10]
                ),

              attributes_after:
                JSON.parse(
                  params[11]
                ),

              source:
                params[12],

              created_at:
                new Date()
                  .toISOString(),
            });


            return {
              rows: [],
            };
          }


          if (
            statement.startsWith(
              "insert into resources.graph_change_events"
            )
          ) {
            graphEvents.push({
              relationship_id:
                params[3],

              change_type:
                params[4],

              before_state:
                JSON.parse(
                  params[6]
                ),

              after_state:
                JSON.parse(
                  params[7]
                ),
            });


            return {
              rows: [],
            };
          }


          if (
            statement.includes(
              "from resources.resource_relationships"
            ) &&
            statement.includes(
              "id = $3"
            ) &&
            statement.includes(
              "for update"
            )
          ) {
            const row =
              relationships.find(
                (item) =>
                  item.id ===
                  params[2]
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
            };
          }


          if (
            statement.startsWith(
              "update resources.resource_relationships"
            )
          ) {
            const row =
              relationships.find(
                (item) =>
                  item.id ===
                  params[2]
              );


            if (
              !row
            ) {
              return {
                rows: [],
              };
            }


            if (
              statement.includes(
                "status = 'inactive'"
              )
            ) {
              row.status =
                "INACTIVE";

              row.valid_to =
                params[3];

              row.last_seen_at =
                params[3];
            }
            else if (
              statement.includes(
                "status = 'active'"
              )
            ) {
              row.status =
                "ACTIVE";

              row.valid_from =
                params[3];

              row.valid_to =
                null;

              row.attributes =
                JSON.parse(
                  params[4]
                );

              row.source =
                params[5];

              row.confidence =
                params[6] ??
                row.confidence;
            }
            else {
              row.attributes =
                JSON.parse(
                  params[3]
                );

              row.confidence =
                params[4];

              row.source =
                params[5];

              row.metadata =
                JSON.parse(
                  params[6]
                );

              row.last_seen_at =
                params[7];
            }


            return {
              rows: [
                clone(
                  row
                ),
              ],
            };
          }


          if (
            statement.startsWith(
              "select * from resources.relationship_history"
            )
          ) {
            return {
              rows:
                history
                  .filter(
                    (item) =>
                      item.relationship_id ===
                      params[2]
                  )
                  .map(
                    clone
                  ),
            };
          }


          throw new Error(
            "Unexpected Phase 17.7 SQL: " +
              statement
          );
        }
      ),
  };


  const scope = {
    run:
      jest.fn(
        async (
          requestedScope,
          work
        ) =>
          work(
            client,
            {
              organizationUuid,

              environmentUuid,

              applicationOrganizationId:
                requestedScope.organizationId,

              applicationEnvironmentId:
                requestedScope.environmentId,
            }
          )
      ),
  };


  return {
    client,
    scope,
    relationships,
    history,
    graphEvents,
    sourceResourceId,
    targetResourceId,
  };
}


describe(
  "Phase 17.7 - PostgresTemporalRelationshipRepository",
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
          new PostgresTemporalRelationshipRepository({
            scope:
              harness.scope,
          });
      }
    );


    async function create() {
      return repository
        .createRelationship({
          organizationId,

          environmentId,

          sourceResourceId:
            harness.sourceResourceId,

          targetResourceId:
            harness.targetResourceId,

          relationshipType:
            "DEPENDS_ON",

          source:
            "phase17.7-test",

          confidence:
            0.95,

          attributes: {
            protocol:
              "tcp",
          },

          evidence: {
            discovery:
              true,
          },
        });
    }


    test(
      "creation writes history and graph-change evidence atomically",
      async function () {
        const relationship =
          await create();


        expect(
          relationship.status
        ).toBe(
          "ACTIVE"
        );


        expect(
          harness.history
        ).toHaveLength(
          1
        );


        expect(
          harness.history[0]
            .change_type
        ).toBe(
          "CREATED"
        );


        expect(
          harness.graphEvents[0]
            .change_type
        ).toBe(
          "RELATIONSHIP_CREATED"
        );
      }
    );


    test(
      "updates relationship and records immutable history",
      async function () {
        const relationship =
          await create();


        const updated =
          await repository
            .updateRelationship({
              organizationId,

              environmentId,

              relationshipId:
                relationship.id,

              source:
                "phase17.7-test",

              attributes: {
                protocol:
                  "tls",

                port:
                  5432,
              },

              evidence: {
                observation:
                  "dependency changed",
              },
            });


        expect(
          updated.attributes
            .protocol
        ).toBe(
          "tls"
        );


        expect(
          harness.history
            .map(
              (entry) =>
                entry.change_type
            )
        ).toEqual([
          "CREATED",
          "UPDATED",
        ]);
      }
    );


    test(
      "removal closes current validity without deleting relationship",
      async function () {
        const relationship =
          await create();


        const removed =
          await repository
            .removeRelationship({
              organizationId,

              environmentId,

              relationshipId:
                relationship.id,

              source:
                "phase17.7-test",

              changedAt:
                new Date(
                  Date.now() +
                    1000
                ),
            });


        expect(
          removed.status
        ).toBe(
          "INACTIVE"
        );


        expect(
          removed.validTo
        ).not.toBeNull();


        expect(
          harness.relationships
        ).toHaveLength(
          1
        );


        expect(
          harness.history.at(
            -1
          ).change_type
        ).toBe(
          "REMOVED"
        );
      }
    );


    test(
      "relationship can later be reactivated",
      async function () {
        const relationship =
          await create();


        await repository
          .removeRelationship({
            organizationId,

            environmentId,

            relationshipId:
              relationship.id,

            source:
              "phase17.7-test",

            changedAt:
              new Date(
                Date.now() +
                  1000
              ),
          });


        const reactivated =
          await repository
            .reactivateRelationship({
              organizationId,

              environmentId,

              relationshipId:
                relationship.id,

              source:
                "phase17.7-test",

              changedAt:
                new Date(
                  Date.now() +
                    2000
                ),
            });


        expect(
          reactivated.status
        ).toBe(
          "ACTIVE"
        );


        expect(
          reactivated.validTo
        ).toBeNull();


        expect(
          harness.history.at(
            -1
          ).change_type
        ).toBe(
          "REACTIVATED"
        );
      }
    );


    test(
      "relationship change evidence never exposes execution authorization",
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