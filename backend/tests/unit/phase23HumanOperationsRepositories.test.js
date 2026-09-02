"use strict";

const PostgresHumanOperationsRepository = require(
  "../../persistence/postgres/PostgresHumanOperationsRepository"
);

const PostgresHumanTakeoverRepository = require(
  "../../persistence/postgres/PostgresHumanTakeoverRepository"
);

const {
  PostgresHumanOperationsRepository:
    ExportedHumanOperationsRepository,

  PostgresHumanTakeoverRepository:
    ExportedHumanTakeoverRepository,
} = require(
  "../../persistence/postgres/humanOperations"
);


function createResolvedScope() {
  return {
    organizationUuid:
      "11111111-1111-4111-8111-111111111111",

    environmentUuid:
      "22222222-2222-4222-8222-222222222222",

    applicationOrganizationId:
      "org_test",

    applicationEnvironmentId:
      "env_test",
  };
}


function createScopeMock(
  queryHandler
) {
  const resolved =
    createResolvedScope();

  const client = {
    query:
      jest.fn(
        queryHandler
      ),
  };

  return {
    client,
    resolved,

    scope: {
      run:
        jest.fn(
          async (
            scope,
            work
          ) => {
            expect(
              scope
            ).toEqual({
              organizationId:
                "org_test",

              environmentId:
                "env_test",
            });

            return work(
              client,
              resolved
            );
          }
        ),
    },
  };
}


describe(
  "Phase 23.1B Human Operations Repository",
  () => {
    test(
      "exports Phase 23 repositories",
      () => {
        expect(
          ExportedHumanOperationsRepository
        ).toBe(
          PostgresHumanOperationsRepository
        );

        expect(
          ExportedHumanTakeoverRepository
        ).toBe(
          PostgresHumanTakeoverRepository
        );
      }
    );


    test(
      "creates human task with execution authorization forced false",
      async () => {
        const {
          scope,
          client,
        } =
          createScopeMock(
            async (
              sql,
              params
            ) => {
              if (
                sql.includes(
                  "INSERT INTO"
                ) &&
                sql.includes(
                  "human_operations.tasks"
                )
              ) {
                expect(
                  sql
                ).toContain(
                  "FALSE"
                );

                return {
                  rows: [
                    {
                      id:
                        "33333333-3333-4333-8333-333333333333",

                      public_id:
                        "htask_test",

                      organization_id:
                        "11111111-1111-4111-8111-111111111111",

                      environment_id:
                        "22222222-2222-4222-8222-222222222222",

                      task_type:
                        "MANUAL_INTERVENTION",

                      title:
                        "Operator action required",

                      priority:
                        "CRITICAL",

                      status:
                        "OPEN",

                      source:
                        "AIRA",

                      acknowledgement_required:
                        true,

                      autonomous_recovery_blocked:
                        true,

                      execution_authorized:
                        false,

                      recommended_actions:
                        [],

                      evidence:
                        [],

                      metadata:
                        {},

                      control_epoch:
                        0,
                    },
                  ],
                };
              }

              throw new Error(
                `Unexpected query: ${sql}`
              );
            }
          );

        const repository =
          new PostgresHumanOperationsRepository({
            scope,
          });

        const task =
          await repository.createTask({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            taskType:
              "MANUAL_INTERVENTION",

            title:
              "Operator action required",

            priority:
              "CRITICAL",
          });

        expect(
          task.publicId
        ).toBe(
          "htask_test"
        );

        expect(
          task.executionAuthorized
        ).toBe(false);

        expect(
          client.query
        ).toHaveBeenCalledTimes(1);
      }
    );


    test(
      "rejects assignment without user or team",
      async () => {
        const {
          scope,
        } =
          createScopeMock(
            async () => ({
              rows: [],
            })
          );

        const repository =
          new PostgresHumanOperationsRepository({
            scope,
          });

        await expect(
          repository.createAssignment({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            taskId:
              "htask_1",
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_ASSIGNMENT_TARGET_REQUIRED",

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "assignment replaces previous active assignment atomically in scoped work",
      async () => {
        const queries = [];

        const {
          scope,
        } =
          createScopeMock(
            async (
              sql
            ) => {
              queries.push(sql);

              if (
                sql.includes(
                  "FROM"
                ) &&
                sql.includes(
                  "human_operations.tasks"
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        "33333333-3333-4333-8333-333333333333",

                      public_id:
                        "htask_1",

                      status:
                        "OPEN",
                    },
                  ],
                };
              }

              if (
                sql.includes(
                  "UPDATE"
                ) &&
                sql.includes(
                  "human_operations.assignments"
                )
              ) {
                return {
                  rows: [],
                };
              }

              if (
                sql.includes(
                  "INSERT INTO"
                ) &&
                sql.includes(
                  "human_operations.assignments"
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        "44444444-4444-4444-8444-444444444444",

                      public_id:
                        "hasg_1",

                      organization_id:
                        "11111111-1111-4111-8111-111111111111",

                      environment_id:
                        "22222222-2222-4222-8222-222222222222",

                      task_id:
                        "33333333-3333-4333-8333-333333333333",

                      assigned_user_id:
                        "55555555-5555-4555-8555-555555555555",

                      status:
                        "ACTIVE",

                      metadata:
                        {},

                      execution_authorized:
                        false,
                    },
                  ],
                };
              }

              if (
                sql.includes(
                  "UPDATE"
                ) &&
                sql.includes(
                  "human_operations.tasks"
                )
              ) {
                return {
                  rows: [],
                };
              }

              if (
                sql.includes(
                  "task_status_history"
                )
              ) {
                return {
                  rows: [],
                };
              }

              throw new Error(
                `Unexpected query: ${sql}`
              );
            }
          );

        const repository =
          new PostgresHumanOperationsRepository({
            scope,
          });

        const assignment =
          await repository.createAssignment({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            taskId:
              "htask_1",

            assignedUserId:
              "55555555-5555-4555-8555-555555555555",

            assignedByUserId:
              "66666666-6666-4666-8666-666666666666",
          });

        expect(
          assignment.status
        ).toBe(
          "ACTIVE"
        );

        expect(
          queries.some(
            (sql) =>
              sql.includes(
                "status = 'REASSIGNED'"
              )
          )
        ).toBe(true);

        expect(
          queries.some(
            (sql) =>
              sql.includes(
                "status = 'ASSIGNED'"
              )
          )
        ).toBe(true);
      }
    );


    test(
      "acknowledgement records durable acknowledgement and updates task",
      async () => {
        const {
          scope,
        } =
          createScopeMock(
            async (
              sql
            ) => {
              if (
                sql.includes(
                  "human_operations.tasks"
                ) &&
                sql.includes(
                  "SELECT"
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        "33333333-3333-4333-8333-333333333333",

                      public_id:
                        "htask_1",

                      status:
                        "ASSIGNED",
                    },
                  ],
                };
              }

              if (
                sql.includes(
                  "human_operations.acknowledgements"
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        "77777777-7777-4777-8777-777777777777",

                      public_id:
                        "hack_1",

                      organization_id:
                        "11111111-1111-4111-8111-111111111111",

                      environment_id:
                        "22222222-2222-4222-8222-222222222222",

                      task_id:
                        "33333333-3333-4333-8333-333333333333",

                      acknowledged_by_user_id:
                        "55555555-5555-4555-8555-555555555555",

                      outcome:
                        "ACKNOWLEDGED",

                      metadata:
                        {},

                      execution_authorized:
                        false,
                    },
                  ],
                };
              }

              return {
                rows: [],
              };
            }
          );

        const repository =
          new PostgresHumanOperationsRepository({
            scope,
          });

        const acknowledgement =
          await repository.acknowledgeTask({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            taskId:
              "htask_1",

            acknowledgedByUserId:
              "55555555-5555-4555-8555-555555555555",
          });

        expect(
          acknowledgement.outcome
        ).toBe(
          "ACKNOWLEDGED"
        );

        expect(
          acknowledgement.executionAuthorized
        ).toBe(false);
      }
    );
  }
);


describe(
  "Phase 23.1C Human Takeover Repository",
  () => {
    test(
      "creates takeover request without execution authorization",
      async () => {
        const {
          scope,
        } =
          createScopeMock(
            async (
              sql
            ) => {
              if (
                sql.includes(
                  "takeover_sessions"
                ) &&
                sql.includes(
                  "INSERT INTO"
                )
              ) {
                expect(
                  sql
                ).toContain(
                  "FALSE"
                );

                return {
                  rows: [
                    {
                      id:
                        "88888888-8888-4888-8888-888888888888",

                      public_id:
                        "htko_1",

                      organization_id:
                        "11111111-1111-4111-8111-111111111111",

                      environment_id:
                        "22222222-2222-4222-8222-222222222222",

                      incident_id:
                        "inc_1",

                      requested_by_user_id:
                        "55555555-5555-4555-8555-555555555555",

                      status:
                        "REQUESTED",

                      control_epoch:
                        1,

                      metadata:
                        {},

                      execution_authorized:
                        false,
                    },
                  ],
                };
              }

              if (
                sql.includes(
                  "takeover_events"
                )
              ) {
                return {
                  rows: [],
                };
              }

              throw new Error(
                `Unexpected query: ${sql}`
              );
            }
          );

        const repository =
          new PostgresHumanTakeoverRepository({
            scope,
          });

        const session =
          await repository.createTakeoverSession({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            incidentId:
              "inc_1",

            requestedByUserId:
              "55555555-5555-4555-8555-555555555555",

            controlEpoch:
              1,
          });

        expect(
          session.status
        ).toBe(
          "REQUESTED"
        );

        expect(
          session.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "control lease acquisition requires authorized session",
      async () => {
        const {
          scope,
        } =
          createScopeMock(
            async (
              sql
            ) => {
              if (
                sql.includes(
                  "takeover_sessions"
                ) &&
                sql.includes(
                  "SELECT"
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        "88888888-8888-4888-8888-888888888888",

                      public_id:
                        "htko_1",

                      incident_id:
                        "inc_1",

                      requested_by_user_id:
                        "55555555-5555-4555-8555-555555555555",

                      status:
                        "REQUESTED",

                      control_epoch:
                        1,

                      metadata:
                        {},

                      execution_authorized:
                        false,
                    },
                  ],
                };
              }

              throw new Error(
                `Unexpected query: ${sql}`
              );
            }
          );

        const repository =
          new PostgresHumanTakeoverRepository({
            scope,
          });

        await expect(
          repository.acquireControlLease({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            sessionId:
              "htko_1",

            holderUserId:
              "55555555-5555-4555-8555-555555555555",
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_TAKEOVER_SESSION_NOT_AUTHORIZED",

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "active lease conflict is rejected before second acquisition",
      async () => {
        const {
          scope,
        } =
          createScopeMock(
            async (
              sql
            ) => {
              if (
                sql.includes(
                  "takeover_sessions"
                ) &&
                sql.includes(
                  "SELECT"
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        "88888888-8888-4888-8888-888888888888",

                      public_id:
                        "htko_1",

                      incident_id:
                        "inc_1",

                      status:
                        "AUTHORIZED",

                      control_epoch:
                        4,

                      execution_authorized:
                        false,
                    },
                  ],
                };
              }

              if (
                sql.includes(
                  "control_leases"
                ) &&
                sql.includes(
                  "SELECT"
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        "99999999-9999-4999-8999-999999999999",

                      public_id:
                        "hlease_existing",

                      incident_id:
                        "inc_1",

                      status:
                        "ACTIVE",
                    },
                  ],
                };
              }

              throw new Error(
                `Unexpected query: ${sql}`
              );
            }
          );

        const repository =
          new PostgresHumanTakeoverRepository({
            scope,
          });

        await expect(
          repository.acquireControlLease({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            sessionId:
              "htko_1",

            holderUserId:
              "55555555-5555-4555-8555-555555555555",
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_CONTROL_LEASE_CONFLICT",

          status:
            409,

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "lease acquisition writes ACTIVE lease and activates session",
      async () => {
        const queries = [];

        const {
          scope,
        } =
          createScopeMock(
            async (
              sql
            ) => {
              queries.push(sql);

              if (
                sql.includes(
                  "takeover_sessions"
                ) &&
                sql.includes(
                  "SELECT"
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        "88888888-8888-4888-8888-888888888888",

                      public_id:
                        "htko_1",

                      incident_id:
                        "inc_1",

                      status:
                        "AUTHORIZED",

                      control_epoch:
                        5,

                      execution_authorized:
                        false,
                    },
                  ],
                };
              }

              if (
                sql.includes(
                  "control_leases"
                ) &&
                sql.includes(
                  "SELECT"
                )
              ) {
                return {
                  rows: [],
                };
              }

              if (
                sql.includes(
                  "control_leases"
                ) &&
                sql.includes(
                  "INSERT INTO"
                )
              ) {
                expect(
                  sql
                ).toContain(
                  "'ACTIVE'"
                );

                expect(
                  sql
                ).toContain(
                  "FALSE"
                );

                return {
                  rows: [
                    {
                      id:
                        "99999999-9999-4999-8999-999999999999",

                      public_id:
                        "hlease_1",

                      organization_id:
                        "11111111-1111-4111-8111-111111111111",

                      environment_id:
                        "22222222-2222-4222-8222-222222222222",

                      incident_id:
                        "inc_1",

                      takeover_session_id:
                        "88888888-8888-4888-8888-888888888888",

                      holder_user_id:
                        "55555555-5555-4555-8555-555555555555",

                      status:
                        "ACTIVE",

                      lease_version:
                        1,

                      control_epoch:
                        5,

                      expires_at:
                        new Date(
                          Date.now() +
                          300000
                        ),

                      metadata:
                        {},

                      execution_authorized:
                        false,
                    },
                  ],
                };
              }

              if (
                sql.includes(
                  "UPDATE"
                ) &&
                sql.includes(
                  "takeover_sessions"
                )
              ) {
                return {
                  rows: [],
                };
              }

              if (
                sql.includes(
                  "takeover_events"
                )
              ) {
                return {
                  rows: [],
                };
              }

              throw new Error(
                `Unexpected query: ${sql}`
              );
            }
          );

        const repository =
          new PostgresHumanTakeoverRepository({
            scope,
          });

        const lease =
          await repository.acquireControlLease({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            sessionId:
              "htko_1",

            holderUserId:
              "55555555-5555-4555-8555-555555555555",
          });

        expect(
          lease.status
        ).toBe(
          "ACTIVE"
        );

        expect(
          lease.controlEpoch
        ).toBe(5);

        expect(
          lease.executionAuthorized
        ).toBe(false);

        expect(
          queries.some(
            (sql) =>
              sql.includes(
                "status = 'ACTIVE'"
              ) &&
              sql.includes(
                "takeover_sessions"
              )
          )
        ).toBe(true);
      }
    );


    test(
      "database unique violation becomes deterministic lease conflict",
      async () => {
        const {
          scope,
        } =
          createScopeMock(
            async (
              sql
            ) => {
              if (
                sql.includes(
                  "takeover_sessions"
                ) &&
                sql.includes(
                  "SELECT"
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        "88888888-8888-4888-8888-888888888888",

                      incident_id:
                        "inc_1",

                      status:
                        "AUTHORIZED",

                      control_epoch:
                        6,
                    },
                  ],
                };
              }

              if (
                sql.includes(
                  "control_leases"
                ) &&
                sql.includes(
                  "SELECT"
                )
              ) {
                return {
                  rows: [],
                };
              }

              if (
                sql.includes(
                  "control_leases"
                ) &&
                sql.includes(
                  "INSERT INTO"
                )
              ) {
                const error =
                  new Error(
                    "duplicate active lease"
                  );

                error.code =
                  "23505";

                throw error;
              }

              throw new Error(
                `Unexpected query: ${sql}`
              );
            }
          );

        const repository =
          new PostgresHumanTakeoverRepository({
            scope,
          });

        await expect(
          repository.acquireControlLease({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            sessionId:
              "htko_1",

            holderUserId:
              "55555555-5555-4555-8555-555555555555",
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_CONTROL_LEASE_CONFLICT",

          status:
            409,

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "wrong operator cannot release another operator lease",
      async () => {
        const {
          scope,
        } =
          createScopeMock(
            async (
              sql
            ) => {
              if (
                sql.includes(
                  "control_leases"
                ) &&
                sql.includes(
                  "SELECT"
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        "99999999-9999-4999-8999-999999999999",

                      public_id:
                        "hlease_1",

                      holder_user_id:
                        "55555555-5555-4555-8555-555555555555",

                      takeover_session_id:
                        "88888888-8888-4888-8888-888888888888",

                      incident_id:
                        "inc_1",

                      status:
                        "ACTIVE",

                      control_epoch:
                        3,

                      execution_authorized:
                        false,
                    },
                  ],
                };
              }

              throw new Error(
                `Unexpected query: ${sql}`
              );
            }
          );

        const repository =
          new PostgresHumanTakeoverRepository({
            scope,
          });

        await expect(
          repository.releaseControlLease({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            leaseId:
              "hlease_1",

            releasedByUserId:
              "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_CONTROL_LEASE_OWNER_MISMATCH",

          status:
            403,

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "expired lease heartbeat is rejected",
      async () => {
        const {
          scope,
        } =
          createScopeMock(
            async (
              sql
            ) => {
              if (
                sql.includes(
                  "control_leases"
                ) &&
                sql.includes(
                  "SELECT"
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        "99999999-9999-4999-8999-999999999999",

                      public_id:
                        "hlease_1",

                      holder_user_id:
                        "55555555-5555-4555-8555-555555555555",

                      status:
                        "ACTIVE",

                      expires_at:
                        new Date(
                          Date.now() -
                          60000
                        ),

                      execution_authorized:
                        false,
                    },
                  ],
                };
              }

              if (
                sql.includes(
                  "status = 'EXPIRED'"
                )
              ) {
                return {
                  rows: [],
                };
              }

              throw new Error(
                `Unexpected query: ${sql}`
              );
            }
          );

        const repository =
          new PostgresHumanTakeoverRepository({
            scope,
          });

        await expect(
          repository.heartbeatLease({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            leaseId:
              "hlease_1",

            holderUserId:
              "55555555-5555-4555-8555-555555555555",
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_CONTROL_LEASE_EXPIRED",

          executionAuthorized:
            false,
        });
      }
    );
  }
);