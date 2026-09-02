"use strict";


const PostgresHumanOperationsRepository =
  require(
    "../../persistence/postgres/PostgresHumanOperationsRepository"
  );


const PostgresHumanTakeoverRepository =
  require(
    "../../persistence/postgres/PostgresHumanTakeoverRepository"
  );


const {
  PostgresHumanOperationsRepository:
    ExportedHumanOperationsRepository,

  PostgresHumanTakeoverRepository:
    ExportedHumanTakeoverRepository,
} =
  require(
    "../../persistence/postgres/humanOperations"
  );


const ORGANIZATION_UUID =
  "11111111-1111-4111-8111-111111111111";


const ENVIRONMENT_UUID =
  "22222222-2222-4222-8222-222222222222";


const TASK_UUID =
  "33333333-3333-4333-8333-333333333333";


const ASSIGNMENT_UUID =
  "44444444-4444-4444-8444-444444444444";


const USER_UUID =
  "55555555-5555-4555-8555-555555555555";


const SECOND_USER_UUID =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";


const SESSION_UUID =
  "88888888-8888-4888-8888-888888888888";


const LEASE_UUID =
  "99999999-9999-4999-8999-999999999999";


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
    .trim();
}


function createResolvedScope() {
  return {
    organizationUuid:
      ORGANIZATION_UUID,

    environmentUuid:
      ENVIRONMENT_UUID,

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


function taskRow(
  overrides =
    {}
) {
  return {
    id:
      TASK_UUID,

    public_id:
      "htask_1",

    organization_id:
      ORGANIZATION_UUID,

    environment_id:
      ENVIRONMENT_UUID,

    incident_id:
      "inc_1",

    task_type:
      "MANUAL_INTERVENTION",

    title:
      "Operator action required",

    description:
      "Manual intervention required",

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

    ...overrides,
  };
}


function sessionRow(
  overrides =
    {}
) {
  return {
    id:
      SESSION_UUID,

    public_id:
      "htko_1",

    organization_id:
      ORGANIZATION_UUID,

    environment_id:
      ENVIRONMENT_UUID,

    incident_id:
      "inc_1",

    task_id:
      TASK_UUID,

    requested_by_user_id:
      USER_UUID,

    authorized_by_user_id:
      null,

    status:
      "REQUESTED",

    control_epoch:
      1,

    metadata:
      {},

    execution_authorized:
      false,

    ...overrides,
  };
}


function leaseRow(
  overrides =
    {}
) {
  return {
    id:
      LEASE_UUID,

    public_id:
      "hlease_1",

    organization_id:
      ORGANIZATION_UUID,

    environment_id:
      ENVIRONMENT_UUID,

    incident_id:
      "inc_1",

    takeover_session_id:
      SESSION_UUID,

    holder_user_id:
      USER_UUID,

    status:
      "ACTIVE",

    lease_version:
      1,

    control_epoch:
      5,

    acquired_at:
      new Date(),

    heartbeat_at:
      new Date(),

    expires_at:
      new Date(
        Date.now() +
        300000
      ),

    metadata:
      {},

    execution_authorized:
      false,

    ...overrides,
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
              sql
            ) => {
              const normalized =
                normalizeSql(
                  sql
                );


              if (
                /INSERT INTO human_operations\.tasks/i.test(
                  normalized
                )
              ) {
                expect(
                  normalized
                ).toContain(
                  "FALSE"
                );


                return {
                  rows: [
                    taskRow({
                      public_id:
                        "htask_test",
                    }),
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
          await repository
            .createTask({
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
        ).toBe(
          false
        );


        expect(
          client.query
        ).toHaveBeenCalledTimes(
          1
        );
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
      "assignment replaces previous active assignment atomically",
      async () => {
        const queries =
          [];


        const {
          scope,
        } =
          createScopeMock(
            async (
              sql
            ) => {
              const normalized =
                normalizeSql(
                  sql
                );


              queries.push(
                normalized
              );


              if (
                /SELECT .*human_operations\.tasks/i.test(
                  normalized
                )
              ) {
                return {
                  rows: [
                    taskRow(),
                  ],
                };
              }


              if (
                /UPDATE human_operations\.assignments/i.test(
                  normalized
                )
              ) {
                return {
                  rows: [],
                };
              }


              if (
                /INSERT INTO human_operations\.assignments/i.test(
                  normalized
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        ASSIGNMENT_UUID,

                      public_id:
                        "hasg_1",

                      organization_id:
                        ORGANIZATION_UUID,

                      environment_id:
                        ENVIRONMENT_UUID,

                      task_id:
                        TASK_UUID,

                      assigned_user_id:
                        USER_UUID,

                      assigned_team_id:
                        null,

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
                /UPDATE human_operations\.tasks/i.test(
                  normalized
                )
              ) {
                return {
                  rows: [],
                };
              }


              if (
                normalized.includes(
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
          await repository
            .createAssignment({
              organizationId:
                "org_test",

              environmentId:
                "env_test",

              taskId:
                "htask_1",

              assignedUserId:
                USER_UUID,

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
            (
              sql
            ) =>
              /status\s*=\s*'REASSIGNED'/i.test(
                sql
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
              /human_operations\.tasks/i.test(
                sql
              ) &&
              /status\s*=\s*'ASSIGNED'/i.test(
                sql
              )
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "acknowledgement is durable and never authorizes execution",
      async () => {
        const {
          scope,
        } =
          createScopeMock(
            async (
              sql
            ) => {
              const normalized =
                normalizeSql(
                  sql
                );


              if (
                /SELECT .*human_operations\.tasks/i.test(
                  normalized
                )
              ) {
                return {
                  rows: [
                    taskRow({
                      status:
                        "ASSIGNED",
                    }),
                  ],
                };
              }


              if (
                normalized.includes(
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
                        ORGANIZATION_UUID,

                      environment_id:
                        ENVIRONMENT_UUID,

                      task_id:
                        TASK_UUID,

                      acknowledged_by_user_id:
                        USER_UUID,

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
          await repository
            .acknowledgeTask({
              organizationId:
                "org_test",

              environmentId:
                "env_test",

              taskId:
                "htask_1",

              acknowledgedByUserId:
                USER_UUID,
            });


        expect(
          acknowledgement.outcome
        ).toBe(
          "ACKNOWLEDGED"
        );


        expect(
          acknowledgement.executionAuthorized
        ).toBe(
          false
        );
      }
    );
  }
);


describe(
  "Phase 23.1C/23.1F Human Takeover Repository",
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
              const normalized =
                normalizeSql(
                  sql
                );


              if (
                /INSERT INTO human_operations\.takeover_sessions/i.test(
                  normalized
                )
              ) {
                expect(
                  normalized
                ).toContain(
                  "FALSE"
                );


                return {
                  rows: [
                    sessionRow(),
                  ],
                };
              }


              if (
                normalized.includes(
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
          await repository
            .createTakeoverSession({
              organizationId:
                "org_test",

              environmentId:
                "env_test",

              incidentId:
                "inc_1",

              requestedByUserId:
                USER_UUID,

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
        ).toBe(
          false
        );
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
              const normalized =
                normalizeSql(
                  sql
                );


              if (
                normalized.includes(
                  "takeover_sessions"
                ) &&
                normalized.includes(
                  "SELECT"
                )
              ) {
                return {
                  rows: [
                    sessionRow({
                      status:
                        "REQUESTED",
                    }),
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
              USER_UUID,
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
              const normalized =
                normalizeSql(
                  sql
                );


              if (
                normalized.includes(
                  "takeover_sessions"
                ) &&
                normalized.includes(
                  "SELECT"
                )
              ) {
                return {
                  rows: [
                    sessionRow({
                      status:
                        "AUTHORIZED",

                      control_epoch:
                        4,
                    }),
                  ],
                };
              }


              if (
                normalized.includes(
                  "control_leases"
                ) &&
                normalized.includes(
                  "SELECT"
                )
              ) {
                return {
                  rows: [
                    leaseRow({
                      public_id:
                        "hlease_existing",

                      control_epoch:
                        4,
                    }),
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
              USER_UUID,
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_CONTROL_LEASE_CONFLICT",

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "lease acquisition writes ACTIVE lease and activates session",
      async () => {
        const queries =
          [];


        const {
          scope,
        } =
          createScopeMock(
            async (
              sql
            ) => {
              const normalized =
                normalizeSql(
                  sql
                );


              queries.push(
                normalized
              );


              if (
                normalized.includes(
                  "takeover_sessions"
                ) &&
                normalized.includes(
                  "SELECT"
                )
              ) {
                return {
                  rows: [
                    sessionRow({
                      status:
                        "AUTHORIZED",

                      control_epoch:
                        5,
                    }),
                  ],
                };
              }


              if (
                normalized.includes(
                  "control_leases"
                ) &&
                normalized.includes(
                  "SELECT"
                )
              ) {
                return {
                  rows: [],
                };
              }


              if (
                /INSERT INTO human_operations\.control_leases/i.test(
                  normalized
                )
              ) {
                expect(
                  normalized
                ).toMatch(
                  /'ACTIVE'/
                );


                expect(
                  normalized
                ).toContain(
                  "FALSE"
                );


                return {
                  rows: [
                    leaseRow({
                      control_epoch:
                        5,
                    }),
                  ],
                };
              }


              if (
                /UPDATE human_operations\.takeover_sessions/i.test(
                  normalized
                )
              ) {
                return {
                  rows: [],
                };
              }


              if (
                normalized.includes(
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
          await repository
            .acquireControlLease({
              organizationId:
                "org_test",

              environmentId:
                "env_test",

              sessionId:
                "htko_1",

              holderUserId:
                USER_UUID,
            });


        expect(
          lease.status
        ).toBe(
          "ACTIVE"
        );


        expect(
          lease.controlEpoch
        ).toBe(
          5
        );


        expect(
          lease.executionAuthorized
        ).toBe(
          false
        );


        expect(
          queries.some(
            (
              sql
            ) =>
              /UPDATE\s+human_operations\.takeover_sessions/i.test(
                sql
              ) &&
              /status\s*=\s*'ACTIVE'/i.test(
                sql
              )
          )
        ).toBe(
          true
        );
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
              const normalized =
                normalizeSql(
                  sql
                );


              if (
                normalized.includes(
                  "takeover_sessions"
                ) &&
                normalized.includes(
                  "SELECT"
                )
              ) {
                return {
                  rows: [
                    sessionRow({
                      status:
                        "AUTHORIZED",

                      control_epoch:
                        6,
                    }),
                  ],
                };
              }


              if (
                normalized.includes(
                  "control_leases"
                ) &&
                normalized.includes(
                  "SELECT"
                )
              ) {
                return {
                  rows: [],
                };
              }


              if (
                /INSERT INTO human_operations\.control_leases/i.test(
                  normalized
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
              USER_UUID,
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_CONTROL_LEASE_CONFLICT",

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
              const normalized =
                normalizeSql(
                  sql
                );


              if (
                normalized.includes(
                  "control_leases"
                ) &&
                normalized.includes(
                  "SELECT"
                )
              ) {
                return {
                  rows: [
                    leaseRow({
                      control_epoch:
                        3,
                    }),
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

            actorUserId:
              SECOND_USER_UUID,
          })
        ).rejects.toMatchObject({
          /*
           * Canonical hardened Phase-23 repository error.
           */
          code:
            "HUMAN_CONTROL_LEASE_NOT_OWNER",

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "expired heartbeat durably expires lease and session before error",
      async () => {
        const expiredAt =
          new Date(
            Date.now() -
            60000
          );


        const expiredLease =
          leaseRow({
            expires_at:
              expiredAt,

            status:
              "ACTIVE",

            control_epoch:
              7,

            lease_version:
              2,
          });


        const queries =
          [];


        const {
          scope,
        } =
          createScopeMock(
            async (
              sql
            ) => {
              const normalized =
                normalizeSql(
                  sql
                );


              queries.push(
                normalized
              );


              /*
               * Initial authoritative lease read.
               */
              if (
                normalized.includes(
                  "control_leases"
                ) &&
                normalized.includes(
                  "SELECT"
                )
              ) {
                return {
                  rows: [
                    expiredLease,
                  ],
                };
              }


              /*
               * Phase 23.1F durable expiry write.
               */
              if (
                /UPDATE\s+human_operations\.control_leases/i.test(
                  normalized
                ) &&
                /status\s*=\s*'EXPIRED'/i.test(
                  normalized
                )
              ) {
                return {
                  rows: [
                    {
                      ...expiredLease,

                      status:
                        "EXPIRED",

                      heartbeat_at:
                        new Date(),

                      lease_version:
                        3,

                      execution_authorized:
                        false,
                    },
                  ],
                };
              }


              /*
               * TakeoverSession must expire in the SAME transaction.
               */
              if (
                /UPDATE\s+human_operations\.takeover_sessions/i.test(
                  normalized
                ) &&
                /status\s*=\s*'EXPIRED'/i.test(
                  normalized
                )
              ) {
                return {
                  rows: [],
                };
              }


              /*
               * Durable expiry event.
               */
              if (
                /INSERT INTO\s+human_operations\.takeover_events/i.test(
                  normalized
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
              USER_UUID,
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_CONTROL_LEASE_EXPIRED",

          humanControlActive:
            false,

          requiresFreshEvaluation:
            true,

          stalePlanResumeAllowed:
            false,

          executionAuthorized:
            false,
        });


        expect(
          queries.some(
            (
              sql
            ) =>
              /UPDATE\s+human_operations\.control_leases/i.test(
                sql
              ) &&
              /status\s*=\s*'EXPIRED'/i.test(
                sql
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
              /UPDATE\s+human_operations\.takeover_sessions/i.test(
                sql
              ) &&
              /status\s*=\s*'EXPIRED'/i.test(
                sql
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
              /INSERT INTO\s+human_operations\.takeover_events/i.test(
                sql
              )
          )
        ).toBe(
          true
        );
      }
    );
  }
);