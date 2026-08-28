"use strict";

const crypto = require(
  "node:crypto"
);

const PostgresKnownGoodStateRepository =
  require(
    "../../../persistence/postgres/PostgresKnownGoodStateRepository"
  );

const KnownGoodStateService =
  require(
    "../../../services/topology/KnownGoodStateService"
  );


function createHarness() {
  const knownGoods = [];

  const organizationUuid =
    crypto.randomUUID();

  const environmentUuid =
    crypto.randomUUID();

  const resourceId =
    crypto.randomUUID();

  const resourceStates =
    new Map();


  function clone(
    value
  ) {
    return JSON.parse(
      JSON.stringify(
        value
      )
    );
  }


  function normalize(
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


  function createState(
    options = {}
  ) {
    const state = {
      id:
        options.id ||
        crypto.randomUUID(),

      organization_id:
        organizationUuid,

      environment_id:
        environmentUuid,

      resource_id:
        options.resourceId ||
        resourceId,

      observed_at:
        options.observedAt ||
        new Date()
          .toISOString(),

      health:
        options.health ||
        "HEALTHY",

      lifecycle:
        options.lifecycle ||
        "RUNNING",

      fingerprint:
        options.fingerprint ||
        crypto.randomUUID(),
    };


    resourceStates.set(
      state.id,
      state
    );


    return state;
  }


  const client = {
    query:
      jest.fn(
        async function (
          sql,
          params = []
        ) {
          const statement =
            normalize(
              sql
            );


          /*
           * Validate ResourceState.
           */
          if (
            statement.startsWith(
              "select rs.id"
            )
          ) {
            const state =
              resourceStates.get(
                params[3]
              );


            if (
              !state ||
              state.organization_id !==
                params[0] ||
              state.environment_id !==
                params[1] ||
              state.resource_id !==
                params[2]
            ) {
              return {
                rows: [],
                rowCount: 0,
              };
            }


            return {
              rows: [
                clone(
                  state
                ),
              ],

              rowCount:
                1,
            };
          }


          /*
           * SELECT active FOR UPDATE.
           */
          if (
            statement.startsWith(
              "select * from resources.known_good_states"
            ) &&
            statement.includes(
              "status = 'active'"
            ) &&
            statement.includes(
              "for update"
            )
          ) {
            const active =
              knownGoods.find(
                function (
                  row
                ) {
                  return (
                    row.organization_id ===
                      params[0] &&
                    row.environment_id ===
                      params[1] &&
                    row.resource_id ===
                      params[2] &&
                    row.status ===
                      "ACTIVE"
                  );
                }
              );


            return {
              rows:
                active
                  ? [
                      clone(
                        active
                      ),
                    ]
                  : [],

              rowCount:
                active
                  ? 1
                  : 0,
            };
          }


          /*
           * Supersede old active baseline.
           */
          if (
            statement.startsWith(
              "update resources.known_good_states"
            ) &&
            statement.includes(
              "status = 'superseded'"
            )
          ) {
            const row =
              knownGoods.find(
                function (
                  item
                ) {
                  return (
                    item.id ===
                    params[2]
                  );
                }
              );


            if (
              row
            ) {
              row.status =
                "SUPERSEDED";

              row.valid_until =
                params[3];
            }


            return {
              rows: [],
              rowCount:
                row
                  ? 1
                  : 0,
            };
          }


          /*
           * INSERT active known-good.
           */
          if (
            statement.startsWith(
              "insert into resources.known_good_states"
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

              resource_id:
                params[3],

              resource_state_id:
                params[4],

              valid_from:
                params[5],

              valid_until:
                null,

              confidence:
                params[6],

              evidence_count:
                params[7],

              health_evidence:
                JSON.parse(
                  params[8]
                ),

              reason:
                params[9],

              source:
                params[10],

              approved_by_human:
                params[11],

              superseded_by:
                null,

              status:
                "ACTIVE",

              metadata:
                JSON.parse(
                  params[12]
                ),

              created_at:
                new Date()
                  .toISOString(),
            };


            knownGoods.push(
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
           * Link superseded baseline.
           */
          if (
            statement.startsWith(
              "update resources.known_good_states"
            ) &&
            statement.includes(
              "superseded_by = $4"
            )
          ) {
            const row =
              knownGoods.find(
                function (
                  item
                ) {
                  return (
                    item.id ===
                    params[2]
                  );
                }
              );


            if (
              row
            ) {
              row.superseded_by =
                params[3];
            }


            return {
              rows: [],
              rowCount:
                row
                  ? 1
                  : 0,
            };
          }


          /*
           * Revoke.
           */
          if (
            statement.startsWith(
              "update resources.known_good_states"
            ) &&
            statement.includes(
              "status = 'revoked'"
            )
          ) {
            const row =
              knownGoods.find(
                function (
                  item
                ) {
                  return (
                    item.id ===
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


            row.status =
              "REVOKED";

            row.valid_until =
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
           * Historical time query.
           */
          if (
            statement.includes(
              "valid_from <= $4"
            )
          ) {
            const at =
              new Date(
                params[3]
              ).getTime();


            const rows =
              knownGoods
                .filter(
                  function (
                    row
                  ) {
                    if (
                      row.organization_id !==
                        params[0] ||
                      row.environment_id !==
                        params[1] ||
                      row.resource_id !==
                        params[2]
                    ) {
                      return false;
                    }


                    const start =
                      new Date(
                        row.valid_from
                      ).getTime();


                    const end =
                      row.valid_until
                        ? new Date(
                            row.valid_until
                          ).getTime()
                        : Infinity;


                    return (
                      start <=
                        at &&
                      end >
                        at
                    );
                  }
                )
                .sort(
                  function (
                    a,
                    b
                  ) {
                    return (
                      new Date(
                        b.valid_from
                      ).getTime() -
                      new Date(
                        a.valid_from
                      ).getTime()
                    );
                  }
                );


            return {
              rows:
                rows.length
                  ? [
                      clone(
                        rows[0]
                      ),
                    ]
                  : [],

              rowCount:
                rows.length
                  ? 1
                  : 0,
            };
          }


          /*
           * Current active read.
           */
          if (
            statement.startsWith(
              "select * from resources.known_good_states"
            ) &&
            statement.includes(
              "status = 'active'"
            )
          ) {
            const row =
              knownGoods.find(
                function (
                  item
                ) {
                  return (
                    item.organization_id ===
                      params[0] &&
                    item.environment_id ===
                      params[1] &&
                    item.resource_id ===
                      params[2] &&
                    item.status ===
                      "ACTIVE"
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
           * History.
           */
          if (
            statement.startsWith(
              "select * from resources.known_good_states"
            )
          ) {
            const rows =
              knownGoods
                .filter(
                  function (
                    row
                  ) {
                    return (
                      row.organization_id ===
                        params[0] &&
                      row.environment_id ===
                        params[1] &&
                      row.resource_id ===
                        params[2]
                    );
                  }
                )
                .sort(
                  function (
                    a,
                    b
                  ) {
                    return (
                      new Date(
                        b.valid_from
                      ).getTime() -
                      new Date(
                        a.valid_from
                      ).getTime()
                    );
                  }
                );


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
            "Unexpected Phase 17.5 SQL: " +
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
    knownGoods,
    resourceStates,
    createState,
    resourceId,
    organizationUuid,
    environmentUuid,
    client,
    scope,
  };
}


describe(
  "Phase 17.5 - Known-Good State",
  function () {
    let harness;
    let repository;
    let service;


    const organizationId =
      "aira-dev-org";

    const environmentId =
      "env_aira_development";


    beforeEach(
      function () {
        harness =
          createHarness();


        repository =
          new PostgresKnownGoodStateRepository({
            scope:
              harness.scope,
          });


        service =
          new KnownGoodStateService({
            repository,
          });
      }
    );


    function promotionInput(
      state,
      overrides = {}
    ) {
      return {
        organizationId,

        environmentId,

        resourceId:
          harness.resourceId,

        resourceStateId:
          state.id,

        validFrom:
          state.observed_at,

        confidence:
          0.96,

        evidenceCount:
          3,

        healthEvidence: {
          health:
            "HEALTHY",

          stableObservations:
            3,
        },

        reason:
          "Resource remained healthy and stable across repeated observations",

        source:
          "phase17.5-test",

        approvedByHuman:
          false,

        metadata: {
          phase:
            "17.5",
        },

        ...overrides,
      };
    }


    test(
      "promotes evidence-backed ResourceState to ACTIVE known-good",
      async function () {
        const state =
          harness.createState();


        const result =
          await service.promote(
            promotionInput(
              state
            )
          );


        expect(
          result.status
        ).toBe(
          "ACTIVE"
        );


        expect(
          result.resourceStateId
        ).toBe(
          state.id
        );


        expect(
          result.evidenceCount
        ).toBe(
          3
        );


        expect(
          result.confidence
        ).toBe(
          0.96
        );
      }
    );


    test(
      "promotion is idempotent for already-active ResourceState",
      async function () {
        const state =
          harness.createState();


        const first =
          await service.promote(
            promotionInput(
              state
            )
          );


        const second =
          await service.promote(
            promotionInput(
              state
            )
          );


        expect(
          second.id
        ).toBe(
          first.id
        );


        expect(
          harness.knownGoods
        ).toHaveLength(
          1
        );
      }
    );


    test(
      "new baseline supersedes previous ACTIVE baseline",
      async function () {
        const firstState =
          harness.createState({
            observedAt:
              "2026-08-28T05:00:00.000Z",
          });


        const secondState =
          harness.createState({
            observedAt:
              "2026-08-28T06:00:00.000Z",
          });


        const first =
          await service.promote(
            promotionInput(
              firstState
            )
          );


        const second =
          await service.promote(
            promotionInput(
              secondState
            )
          );


        expect(
          second.status
        ).toBe(
          "ACTIVE"
        );


        const old =
          harness.knownGoods.find(
            function (
              row
            ) {
              return (
                row.id ===
                first.id
              );
            }
          );


        expect(
          old.status
        ).toBe(
          "SUPERSEDED"
        );


        expect(
          old.superseded_by
        ).toBe(
          second.id
        );
      }
    );


    test(
      "historical query returns baseline valid at time T",
      async function () {
        const state1 =
          harness.createState({
            observedAt:
              "2026-08-28T05:00:00.000Z",
          });


        const state2 =
          harness.createState({
            observedAt:
              "2026-08-28T07:00:00.000Z",
          });


        const first =
          await service.promote(
            promotionInput(
              state1
            )
          );


        await service.promote(
          promotionInput(
            state2
          )
        );


        const historical =
          await service.getAtTime({
            organizationId,

            environmentId,

            resourceId:
              harness.resourceId,

            at:
              "2026-08-28T06:00:00.000Z",
          });


        expect(
          historical.id
        ).toBe(
          first.id
        );
      }
    );


    test(
      "rejects ResourceState belonging to another resource",
      async function () {
        const state =
          harness.createState({
            resourceId:
              crypto.randomUUID(),
          });


        await expect(
          service.promote(
            promotionInput(
              state
            )
          )
        ).rejects.toMatchObject({
          code:
            "KNOWN_GOOD_RESOURCE_STATE_NOT_FOUND",
        });
      }
    );


    test(
      "requires real health evidence",
      async function () {
        const state =
          harness.createState();


        await expect(
          service.promote(
            promotionInput(
              state,
              {
                healthEvidence:
                  {},
              }
            )
          )
        ).rejects.toMatchObject({
          code:
            "KNOWN_GOOD_HEALTH_EVIDENCE_REQUIRED",
        });
      }
    );


    test(
      "latest ResourceState does not automatically become known-good",
      async function () {
        harness.createState();


        const active =
          await service.getActive({
            organizationId,

            environmentId,

            resourceId:
              harness.resourceId,
          });


        expect(
          active
        ).toBeNull();


        expect(
          harness.knownGoods
        ).toHaveLength(
          0
        );
      }
    );


    test(
      "revokes active baseline without deleting history",
      async function () {
        const state =
          harness.createState({
            observedAt:
              "2026-08-28T05:00:00.000Z",
          });


        const created =
          await service.promote(
            promotionInput(
              state
            )
          );


        const revoked =
          await service.revoke({
            organizationId,

            environmentId,

            resourceId:
              harness.resourceId,

            revokedAt:
              "2026-08-28T06:00:00.000Z",
          });


        expect(
          revoked.status
        ).toBe(
          "REVOKED"
        );


        expect(
          harness.knownGoods.some(
            function (
              row
            ) {
              return (
                row.id ===
                created.id
              );
            }
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "known-good repository exposes no execution authorization",
      function () {
        expect(
          repository.authorize
        ).toBeUndefined();


        expect(
          repository.execute
        ).toBeUndefined();


        expect(
          service.authorizeExecution
        ).toBeUndefined();


        expect(
          service.executeRecovery
        ).toBeUndefined();
      }
    );
  }
);