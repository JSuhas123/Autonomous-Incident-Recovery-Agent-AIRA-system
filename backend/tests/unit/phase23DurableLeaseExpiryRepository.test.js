"use strict";


const PostgresHumanTakeoverRepository =
  require(
    "../../persistence/postgres/PostgresHumanTakeoverRepository"
  );


describe(
  "Phase 23.1F durable control-lease expiry repository",
  () => {
    test(
      "commits EXPIRED state before returning HUMAN_CONTROL_LEASE_EXPIRED",
      async () => {
        const queries =
          [];


        let transactionWorkCompleted =
          false;


        const expiredAt =
          new Date(
            Date.now() -
            5000
          )
            .toISOString();


        const activeLeaseRow = {
          id:
            "00000000-0000-0000-0000-000000000001",

          public_id:
            "control_lease_test",

          organization_id:
            "00000000-0000-0000-0000-000000000010",

          environment_id:
            "00000000-0000-0000-0000-000000000020",

          incident_id:
            "incident-test",

          takeover_session_id:
            "00000000-0000-0000-0000-000000000030",

          holder_user_id:
            "00000000-0000-0000-0000-000000000040",

          status:
            "ACTIVE",

          lease_version:
            1,

          control_epoch:
            1,

          acquired_at:
            new Date(
              Date.now() -
              10000
            )
              .toISOString(),

          heartbeat_at:
            new Date(
              Date.now() -
              10000
            )
              .toISOString(),

          created_at:
            new Date(
              Date.now() -
              10000
            )
              .toISOString(),

          expires_at:
            expiredAt,

          released_at:
            null,

          revoked_at:
            null,

          release_reason:
            null,

          metadata:
            {},

          execution_authorized:
            false,
        };


        const expiredLeaseRow = {
          ...activeLeaseRow,

          status:
            "EXPIRED",

          lease_version:
            2,

          heartbeat_at:
            new Date()
              .toISOString(),

          metadata: {
            expiryDetectedBy:
              "HEARTBEAT",

            expiryDurable:
              true,

            executionAuthorized:
              false,
          },
        };


        const fakeClient = {
          query:
            jest.fn(
              async (
                sql,
                _params
              ) => {
                const normalized =
                  String(
                    sql
                  )
                    .replace(
                      /\s+/g,
                      " "
                    )
                    .trim();


                queries.push(
                  normalized
                );


                /*
                 * #findLease()
                 */
                if (
                  normalized.includes(
                    "FROM human_operations.control_leases"
                  ) &&
                  normalized.includes(
                    "FOR UPDATE"
                  )
                ) {
                  return {
                    rows: [
                      activeLeaseRow,
                    ],

                    rowCount:
                      1,
                  };
                }


                /*
                 * durable lease expiry UPDATE
                 */
                if (
                  normalized.includes(
                    "UPDATE human_operations.control_leases"
                  ) &&
                  normalized.includes(
                    "status = 'EXPIRED'"
                  )
                ) {
                  return {
                    rows: [
                      expiredLeaseRow,
                    ],

                    rowCount:
                      1,
                  };
                }


                /*
                 * session expiry
                 */
                if (
                  normalized.includes(
                    "UPDATE human_operations.takeover_sessions"
                  ) &&
                  normalized.includes(
                    "status = 'EXPIRED'"
                  )
                ) {
                  return {
                    rows: [],

                    rowCount:
                      1,
                  };
                }


                /*
                 * takeover event
                 */
                if (
                  normalized.includes(
                    "INSERT INTO human_operations.takeover_events"
                  )
                ) {
                  return {
                    rows: [
                      {
                        id:
                          "00000000-0000-0000-0000-000000000050",

                        public_id:
                          "takeover_event_test",

                        organization_id:
                          activeLeaseRow
                            .organization_id,

                        environment_id:
                          activeLeaseRow
                            .environment_id,

                        incident_id:
                          activeLeaseRow
                            .incident_id,

                        takeover_session_id:
                          activeLeaseRow
                            .takeover_session_id,

                        control_lease_id:
                          activeLeaseRow
                            .id,

                        event_type:
                          "CONTROL_LEASE_EXPIRED",

                        actor_user_id:
                          activeLeaseRow
                            .holder_user_id,

                        control_epoch:
                          1,

                        metadata: {
                          executionAuthorized:
                            false,
                        },

                        created_at:
                          new Date()
                            .toISOString(),

                        execution_authorized:
                          false,
                      },
                    ],

                    rowCount:
                      1,
                  };
                }


                throw new Error(
                  `Unexpected SQL in test: ${normalized}`
                );
              }
            ),
        };


        const fakeScope = {
          run:
            jest.fn(
              async (
                _scope,
                work
              ) => {
                /*
                 * This simulates the transaction boundary.
                 *
                 * If work() throws, the transaction would roll back.
                 *
                 * The fixed implementation must allow work() to return
                 * successfully so the scope can commit before the outer
                 * HUMAN_CONTROL_LEASE_EXPIRED error is thrown.
                 */
                const result =
                  await work(
                    fakeClient,
                    {
                      organizationUuid:
                        activeLeaseRow
                          .organization_id,

                      environmentUuid:
                        activeLeaseRow
                          .environment_id,
                    }
                  );


                transactionWorkCompleted =
                  true;


                return result;
              }
            ),
        };


        const repository =
          new PostgresHumanTakeoverRepository({
            scope:
              fakeScope,
          });


        let receivedError =
          null;


        try {
          await repository.heartbeatLease({
            organizationId:
              "aira-dev-org",

            environmentId:
              "env_aira_development",

            leaseId:
              "control_lease_test",

            holderUserId:
              activeLeaseRow
                .holder_user_id,

            leaseDurationMs:
              1000,
          });
        } catch (
          error
        ) {
          receivedError =
            error;
        }


        expect(
          transactionWorkCompleted
        ).toBe(
          true
        );


        expect(
          receivedError
        ).toBeTruthy();


        expect(
          receivedError.code
        ).toBe(
          "HUMAN_CONTROL_LEASE_EXPIRED"
        );


        expect(
          receivedError.executionAuthorized
        ).toBe(
          false
        );


        expect(
          receivedError
            .requiresFreshEvaluation
        ).toBe(
          true
        );


        expect(
          receivedError
            .stalePlanResumeAllowed
        ).toBe(
          false
        );


        expect(
          receivedError
            .lease
            .status
        ).toBe(
          "EXPIRED"
        );


        expect(
          queries.some(
            (
              sql
            ) =>
              sql.includes(
                "UPDATE human_operations.control_leases"
              ) &&
              sql.includes(
                "status = 'EXPIRED'"
              )
          )
        ).toBe(
          true
        );


        expect(
          queries.some(
            (
              sql
            ) =>
              sql.includes(
                "UPDATE human_operations.takeover_sessions"
              ) &&
              sql.includes(
                "status = 'EXPIRED'"
              )
          )
        ).toBe(
          true
        );


        expect(
          queries.some(
            (
              sql
            ) =>
              sql.includes(
                "INSERT INTO human_operations.takeover_events"
              )
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "healthy heartbeat remains ACTIVE and extends the lease",
      async () => {
        const future =
          new Date(
            Date.now() +
            60000
          )
            .toISOString();


        const row = {
          id:
            "00000000-0000-0000-0000-000000000101",

          public_id:
            "control_lease_healthy",

          organization_id:
            "00000000-0000-0000-0000-000000000110",

          environment_id:
            "00000000-0000-0000-0000-000000000120",

          incident_id:
            "incident-healthy",

          takeover_session_id:
            "00000000-0000-0000-0000-000000000130",

          holder_user_id:
            "00000000-0000-0000-0000-000000000140",

          status:
            "ACTIVE",

          lease_version:
            1,

          control_epoch:
            1,

          acquired_at:
            new Date()
              .toISOString(),

          heartbeat_at:
            new Date()
              .toISOString(),

          created_at:
            new Date()
              .toISOString(),

          expires_at:
            future,

          released_at:
            null,

          revoked_at:
            null,

          release_reason:
            null,

          metadata:
            {},

          execution_authorized:
            false,
        };


        const fakeClient = {
          query:
            jest.fn(
              async (
                sql
              ) => {
                const normalized =
                  String(
                    sql
                  )
                    .replace(
                      /\s+/g,
                      " "
                    )
                    .trim();


                if (
                  normalized.includes(
                    "FROM human_operations.control_leases"
                  ) &&
                  normalized.includes(
                    "FOR UPDATE"
                  )
                ) {
                  return {
                    rows: [
                      row,
                    ],
                  };
                }


                if (
                  normalized.includes(
                    "UPDATE human_operations.control_leases"
                  ) &&
                  normalized.includes(
                    "heartbeat_at = NOW()"
                  ) &&
                  !normalized.includes(
                    "status = 'EXPIRED'"
                  )
                ) {
                  return {
                    rows: [
                      {
                        ...row,

                        lease_version:
                          2,

                        expires_at:
                          new Date(
                            Date.now() +
                            120000
                          )
                            .toISOString(),
                      },
                    ],
                  };
                }


                if (
                  normalized.includes(
                    "INSERT INTO human_operations.takeover_events"
                  )
                ) {
                  return {
                    rows: [
                      {
                        id:
                          "00000000-0000-0000-0000-000000000150",

                        public_id:
                          "takeover_event_heartbeat",

                        organization_id:
                          row
                            .organization_id,

                        environment_id:
                          row
                            .environment_id,

                        incident_id:
                          row
                            .incident_id,

                        takeover_session_id:
                          row
                            .takeover_session_id,

                        control_lease_id:
                          row.id,

                        event_type:
                          "CONTROL_LEASE_HEARTBEAT",

                        actor_user_id:
                          row
                            .holder_user_id,

                        control_epoch:
                          1,

                        metadata:
                          {},

                        created_at:
                          new Date()
                            .toISOString(),

                        execution_authorized:
                          false,
                      },
                    ],
                  };
                }


                throw new Error(
                  `Unexpected SQL: ${normalized}`
                );
              }
            ),
        };


        const repository =
          new PostgresHumanTakeoverRepository({
            scope: {
              run:
                async (
                  _scope,
                  work
                ) =>
                  work(
                    fakeClient,
                    {
                      organizationUuid:
                        row
                          .organization_id,

                      environmentUuid:
                        row
                          .environment_id,
                    }
                  ),
            },
          });


        const result =
          await repository.heartbeatLease({
            organizationId:
              "aira-dev-org",

            environmentId:
              "env_aira_development",

            leaseId:
              row.public_id,

            holderUserId:
              row.holder_user_id,

            leaseDurationMs:
              60000,
          });


        expect(
          result.status
        ).toBe(
          "ACTIVE"
        );


        expect(
          result.leaseVersion
        ).toBe(
          2
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "authorization maps PostgreSQL uniqueness races to deterministic domain error",
      async () => {
        const repository =
          new PostgresHumanTakeoverRepository({
            scope: {
              run:
                async () => {
                  const error =
                    new Error(
                      "duplicate key value violates unique constraint"
                    );


                  error.code =
                    "23505";


                  throw error;
                },
            },
          });


        await expect(
          repository.authorizeSession({
            organizationId:
              "aira-dev-org",

            environmentId:
              "env_aira_development",

            sessionId:
              "session-1",

            actorUserId:
              "00000000-0000-0000-0000-000000000001",
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_TAKEOVER_ALREADY_ACTIVE",

          executionAuthorized:
            false,
        });
      }
    );
  }
);