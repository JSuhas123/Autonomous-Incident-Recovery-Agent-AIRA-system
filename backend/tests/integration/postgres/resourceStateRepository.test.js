"use strict";

const crypto = require(
  "node:crypto"
);

const PostgresResourceStateRepository = require(
  "../../../persistence/postgres/PostgresResourceStateRepository"
);


function createHarness() {
  const states = [];

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


  function scopedStates(
    params
  ) {
    return states.filter(
      (state) =>
        state.organization_id ===
          params[0] &&
        state.environment_id ===
          params[1]
    );
  }


  const client = {
    query:
      jest.fn(
        async (
          sql,
          params = []
        ) => {
          const normalized =
            normalizeSql(
              sql
            );


          /*
           * ==============================================================
           * APPEND
           * ==============================================================
           */

          if (
            normalized.startsWith(
              "insert into resources.resource_states"
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

              observed_at:
                params[4],

              health:
                params[5],

              lifecycle:
                params[6],

              configuration:
                JSON.parse(
                  params[7]
                ),

              runtime:
                JSON.parse(
                  params[8]
                ),

              metrics:
                JSON.parse(
                  params[9]
                ),

              attributes:
                JSON.parse(
                  params[10]
                ),

              version:
                params[11],

              fingerprint:
                params[12],

              source:
                params[13],

              evidence:
                JSON.parse(
                  params[14]
                ),

              metadata:
                JSON.parse(
                  params[15]
                ),

              created_at:
                new Date()
                  .toISOString(),
            };


            states.push(
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
           * ==============================================================
           * GET BY UUID
           * ==============================================================
           */

          if (
            normalized.startsWith(
              "select"
            ) &&
            normalized.includes(
              "and id = $3"
            )
          ) {
            const row =
              scopedStates(
                params
              ).find(
                (state) =>
                  state.id ===
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

              rowCount:
                row
                  ? 1
                  : 0,
            };
          }


          /*
           * ==============================================================
           * GET BY PUBLIC ID
           * ==============================================================
           */

          if (
            normalized.startsWith(
              "select"
            ) &&
            normalized.includes(
              "public_id = $3"
            )
          ) {
            const row =
              scopedStates(
                params
              ).find(
                (state) =>
                  state.public_id ===
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

              rowCount:
                row
                  ? 1
                  : 0,
            };
          }


          /*
           * ==============================================================
           * STATE AT TIME
           * ==============================================================
           */

          if (
            normalized.startsWith(
              "select"
            ) &&
            normalized.includes(
              "observed_at <= $4"
            )
          ) {
            const at =
              new Date(
                params[3]
              ).getTime();


            const rows =
              scopedStates(
                params
              )
                .filter(
                  (state) =>
                    state.resource_id ===
                      params[2] &&
                    new Date(
                      state.observed_at
                    ).getTime() <=
                      at
                )
                .sort(
                  (
                    first,
                    second
                  ) =>
                    new Date(
                      second.observed_at
                    ).getTime() -
                    new Date(
                      first.observed_at
                    ).getTime()
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
           * ==============================================================
           * FINGERPRINT LOOKUP
           * ==============================================================
           */

          if (
            normalized.startsWith(
              "select"
            ) &&
            normalized.includes(
              "fingerprint = $4"
            )
          ) {
            const rows =
              scopedStates(
                params
              )
                .filter(
                  (state) =>
                    state.resource_id ===
                      params[2] &&
                    state.fingerprint ===
                      params[3]
                )
                .sort(
                  (
                    first,
                    second
                  ) =>
                    new Date(
                      second.observed_at
                    ).getTime() -
                    new Date(
                      first.observed_at
                    ).getTime()
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
           * ==============================================================
           * LATEST STATE
           * ==============================================================
           */

          if (
            normalized.startsWith(
              "select"
            ) &&
            normalized.includes(
              "resource_id = $3"
            ) &&
            normalized.includes(
              "limit 1"
            )
          ) {
            const rows =
              scopedStates(
                params
              )
                .filter(
                  (state) =>
                    state.resource_id ===
                    params[2]
                )
                .sort(
                  (
                    first,
                    second
                  ) =>
                    new Date(
                      second.observed_at
                    ).getTime() -
                    new Date(
                      first.observed_at
                    ).getTime()
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
           * ==============================================================
           * HISTORY LIST
           * ==============================================================
           */

          if (
            normalized.startsWith(
              "select"
            ) &&
            normalized.includes(
              "from resources.resource_states"
            )
          ) {
            let rows =
              scopedStates(
                params
              ).filter(
                (state) =>
                  state.resource_id ===
                  params[2]
              );


            const healthMatch =
              normalized.match(
                /health = \$(\d+)/
              );


            if (
              healthMatch
            ) {
              const index =
                Number(
                  healthMatch[1]
                ) -
                1;


              rows =
                rows.filter(
                  (state) =>
                    state.health ===
                    params[index]
                );
            }


            const lifecycleMatch =
              normalized.match(
                /lifecycle = \$(\d+)/
              );


            if (
              lifecycleMatch
            ) {
              const index =
                Number(
                  lifecycleMatch[1]
                ) -
                1;


              rows =
                rows.filter(
                  (state) =>
                    state.lifecycle ===
                    params[index]
                );
            }


            const sourceMatch =
              normalized.match(
                /source = \$(\d+)/
              );


            if (
              sourceMatch
            ) {
              const index =
                Number(
                  sourceMatch[1]
                ) -
                1;


              rows =
                rows.filter(
                  (state) =>
                    state.source ===
                    params[index]
                );
            }


            rows.sort(
              (
                first,
                second
              ) =>
                new Date(
                  second.observed_at
                ).getTime() -
                new Date(
                  first.observed_at
                ).getTime()
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
            "Unexpected SQL in Phase 17.4 test harness: " +
              normalized
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
        ) => {
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
    states,

    client,

    scope,

    organizationUuid,

    environmentUuid,
  };
}


describe(
  "Phase 17.4 - PostgresResourceStateRepository",
  function () {
    let harness;

    let repository;

    let resourceId;


    const organizationId =
      "aira-dev-org";

    const environmentId =
      "env_aira_development";


    beforeEach(
      function () {
        harness =
          createHarness();


        repository =
          new PostgresResourceStateRepository({
            scope:
              harness.scope,
          });


        resourceId =
          crypto.randomUUID();
      }
    );


    function createState(
      overrides = {}
    ) {
      return repository
        .appendResourceState({
          organizationId,

          environmentId,

          resourceId,

          observedAt:
            new Date(
              "2026-08-28T05:00:00.000Z"
            ),

          health:
            "HEALTHY",

          lifecycle:
            "RUNNING",

          configuration: {
            replicas:
              3,
          },

          runtime: {
            readyReplicas:
              3,
          },

          metrics: {
            cpuPercent:
              28,
          },

          attributes: {
            namespace:
              "production",
          },

          version:
            "v1",

          fingerprint:
            "fingerprint-healthy-v1",

          source:
            "phase17.4-test",

          evidence: {
            observationCount:
              1,
          },

          metadata: {
            phase:
              "17.4",
          },

          ...overrides,
        });
    }


    test(
      "constructs immutable resource state repository",
      function () {
        expect(
          repository
        ).toBeInstanceOf(
          PostgresResourceStateRepository
        );
      }
    );


    test(
      "exposes append and temporal read operations",
      function () {
        expect(
          typeof repository
            .appendResourceState
        ).toBe(
          "function"
        );


        expect(
          typeof repository
            .getResourceStateById
        ).toBe(
          "function"
        );


        expect(
          typeof repository
            .getResourceStateByPublicId
        ).toBe(
          "function"
        );


        expect(
          typeof repository
            .getLatestResourceState
        ).toBe(
          "function"
        );


        expect(
          typeof repository
            .getResourceStateAtTime
        ).toBe(
          "function"
        );


        expect(
          typeof repository
            .findResourceStateByFingerprint
        ).toBe(
          "function"
        );


        expect(
          typeof repository
            .listResourceStates
        ).toBe(
          "function"
        );
      }
    );


    test(
      "appends immutable resource state",
      async function () {
        const state =
          await createState();


        expect(
          state.id
        ).toBeDefined();


        expect(
          state.publicId
        ).toMatch(
          /^rstate_/
        );


        expect(
          state.resourceId
        ).toBe(
          resourceId
        );


        expect(
          state.health
        ).toBe(
          "HEALTHY"
        );


        expect(
          state.lifecycle
        ).toBe(
          "RUNNING"
        );


        expect(
          state.fingerprint
        ).toBe(
          "fingerprint-healthy-v1"
        );
      }
    );


    test(
      "stores canonical organization and environment UUIDs",
      async function () {
        const state =
          await createState();


        expect(
          state.organizationId
        ).toBe(
          organizationId
        );


        expect(
          state.environmentId
        ).toBe(
          environmentId
        );


        expect(
          state.canonicalOrganizationId
        ).toBe(
          harness.organizationUuid
        );


        expect(
          state.canonicalEnvironmentId
        ).toBe(
          harness.environmentUuid
        );
      }
    );


    test(
      "retrieves state by UUID",
      async function () {
        const created =
          await createState();


        const found =
          await repository
            .getResourceStateById({
              organizationId,

              environmentId,

              stateId:
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
      "retrieves state by public ID",
      async function () {
        const created =
          await createState({
            publicId:
              "rstate_test_public",
          });


        const found =
          await repository
            .getResourceStateByPublicId({
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
      "returns latest state by observed time",
      async function () {
        await createState({
          observedAt:
            new Date(
              "2026-08-28T05:00:00.000Z"
            ),

          fingerprint:
            "state-1",

          health:
            "HEALTHY",
        });


        await createState({
          observedAt:
            new Date(
              "2026-08-28T06:00:00.000Z"
            ),

          fingerprint:
            "state-2",

          health:
            "DEGRADED",
        });


        const latest =
          await repository
            .getLatestResourceState({
              organizationId,

              environmentId,

              resourceId,
            });


        expect(
          latest.fingerprint
        ).toBe(
          "state-2"
        );


        expect(
          latest.health
        ).toBe(
          "DEGRADED"
        );
      }
    );


    test(
      "reconstructs state at historical time",
      async function () {
        await createState({
          observedAt:
            new Date(
              "2026-08-28T05:00:00.000Z"
            ),

          fingerprint:
            "state-early",
        });


        await createState({
          observedAt:
            new Date(
              "2026-08-28T06:00:00.000Z"
            ),

          fingerprint:
            "state-middle",
        });


        await createState({
          observedAt:
            new Date(
              "2026-08-28T07:00:00.000Z"
            ),

          fingerprint:
            "state-late",
        });


        const historical =
          await repository
            .getResourceStateAtTime({
              organizationId,

              environmentId,

              resourceId,

              at:
                new Date(
                  "2026-08-28T06:30:00.000Z"
                ),
            });


        expect(
          historical.fingerprint
        ).toBe(
          "state-middle"
        );
      }
    );


    test(
      "returns null when no state existed at requested historical time",
      async function () {
        await createState({
          observedAt:
            new Date(
              "2026-08-28T06:00:00.000Z"
            ),
        });


        const historical =
          await repository
            .getResourceStateAtTime({
              organizationId,

              environmentId,

              resourceId,

              at:
                new Date(
                  "2026-08-28T04:00:00.000Z"
                ),
            });


        expect(
          historical
        ).toBeNull();
      }
    );


    test(
      "finds repeated state by fingerprint",
      async function () {
        const created =
          await createState({
            fingerprint:
              "repeatable-state",
          });


        const found =
          await repository
            .findResourceStateByFingerprint({
              organizationId,

              environmentId,

              resourceId,

              fingerprint:
                "repeatable-state",
            });


        expect(
          found.id
        ).toBe(
          created.id
        );
      }
    );


    test(
      "lists resource state history newest first",
      async function () {
        await createState({
          observedAt:
            new Date(
              "2026-08-28T05:00:00.000Z"
            ),

          fingerprint:
            "first",
        });


        await createState({
          observedAt:
            new Date(
              "2026-08-28T07:00:00.000Z"
            ),

          fingerprint:
            "third",
        });


        await createState({
          observedAt:
            new Date(
              "2026-08-28T06:00:00.000Z"
            ),

          fingerprint:
            "second",
        });


        const history =
          await repository
            .listResourceStates({
              organizationId,

              environmentId,

              resourceId,
            });


        expect(
          history
        ).toHaveLength(
          3
        );


        expect(
          history.map(
            (state) =>
              state.fingerprint
          )
        ).toEqual([
          "third",
          "second",
          "first",
        ]);
      }
    );


    test(
      "filters history by health",
      async function () {
        await createState({
          fingerprint:
            "healthy",

          health:
            "HEALTHY",
        });


        await createState({
          fingerprint:
            "critical",

          health:
            "CRITICAL",
        });


        const history =
          await repository
            .listResourceStates({
              organizationId,

              environmentId,

              resourceId,

              health:
                "CRITICAL",
            });


        expect(
          history
        ).toHaveLength(
          1
        );


        expect(
          history[0]
            .health
        ).toBe(
          "CRITICAL"
        );
      }
    );


    test(
      "rejects invalid health",
      async function () {
        await expect(
          createState({
            health:
              "PERFECT",
          })
        ).rejects.toMatchObject({
          code:
            "RESOURCE_STATE_CONTRACT_INVALID",
        });
      }
    );


    test(
      "rejects invalid lifecycle",
      async function () {
        await expect(
          createState({
            lifecycle:
              "FLYING",
          })
        ).rejects.toMatchObject({
          code:
            "RESOURCE_STATE_CONTRACT_INVALID",
        });
      }
    );


    test(
      "requires fingerprint",
      async function () {
        await expect(
          createState({
            fingerprint:
              undefined,
          })
        ).rejects.toMatchObject({
          code:
            "RESOURCE_STATE_CONTRACT_INVALID",
        });
      }
    );


    test(
      "requires observation source",
      async function () {
        await expect(
          createState({
            source:
              undefined,
          })
        ).rejects.toMatchObject({
          code:
            "RESOURCE_STATE_CONTRACT_INVALID",
        });
      }
    );


    test(
      "requires resource ID",
      async function () {
        await expect(
          repository
            .appendResourceState({
              organizationId,

              environmentId,

              observedAt:
                new Date(),

              health:
                "HEALTHY",

              lifecycle:
                "RUNNING",

              fingerprint:
                "test",

              source:
                "test",
            })
        ).rejects.toMatchObject({
          code:
            "RESOURCE_STATE_CONTRACT_INVALID",
        });
      }
    );


    test(
      "requires tenant scope",
      async function () {
        await expect(
          repository
            .appendResourceState({
              resourceId,

              observedAt:
                new Date(),

              health:
                "HEALTHY",

              lifecycle:
                "RUNNING",

              fingerprint:
                "test",

              source:
                "test",
            })
        ).rejects.toMatchObject({
          code:
            "POSTGRES_RESOURCE_STATE_SCOPE_REQUIRED",
        });
      }
    );


    test(
      "rejects provider-specific top-level fields",
      async function () {
        await expect(
          createState({
            podIp:
              "10.0.0.5",
          })
        ).rejects.toMatchObject({
          code:
            "RESOURCE_STATE_CONTRACT_INVALID",
        });
      }
    );


    test(
      "allows provider-specific state inside domain-neutral state containers",
      async function () {
        const state =
          await createState({
            runtime: {
              podIp:
                "10.0.0.5",

              restartCount:
                4,
            },
          });


        expect(
          state.runtime
            .podIp
        ).toBe(
          "10.0.0.5"
        );
      }
    );


    test(
      "repository exposes no state mutation APIs",
      function () {
        expect(
          repository.updateResourceState
        ).toBeUndefined();


        expect(
          repository.deleteResourceState
        ).toBeUndefined();


        expect(
          repository.replaceResourceState
        ).toBeUndefined();


        expect(
          repository.saveResourceState
        ).toBeUndefined();
      }
    );


    test(
      "repository exposes no arbitrary SQL APIs",
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
      "all persistence operations use tenant scope",
      async function () {
        await createState();


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
  }
);