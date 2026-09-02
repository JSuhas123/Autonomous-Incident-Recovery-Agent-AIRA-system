"use strict";

const {
  HUMAN_TASK_STATUS,
  TAKEOVER_SESSION_STATUS,
  CONTROL_LEASE_STATUS,
} = require(
  "../../constants/humanTakeover"
);

const {
  HUMAN_TASK_TRANSITIONS,
  TAKEOVER_SESSION_TRANSITIONS,
  CONTROL_LEASE_TRANSITIONS,

  canHumanTaskTransition,
  assertHumanTaskTransition,

  canTakeoverSessionTransition,
  assertTakeoverSessionTransition,

  canControlLeaseTransition,

  isTerminalHumanTaskState,
  isTerminalTakeoverSessionState,
  isTerminalControlLeaseState,
} = require(
  "../../services/humanOperations/humanTakeoverStateMachine"
);

const {
  HumanTakeoverLifecycleService,
} = require(
  "../../services/humanOperations/humanTakeoverLifecycleService"
);


function createHumanRepository(
  overrides = {}
) {
  return {
    getTask:
      jest.fn(),

    updateTaskStatus:
      jest.fn(),

    createAssignment:
      jest.fn(),

    acknowledgeTask:
      jest.fn(),

    resolveTask:
      jest.fn(),

    ...overrides,
  };
}


function createTakeoverRepository(
  overrides = {}
) {
  return {
    createTakeoverSession:
      jest.fn(),

    authorizeSession:
      jest.fn(),

    acquireControlLease:
      jest.fn(),

    heartbeatLease:
      jest.fn(),

    releaseControlLease:
      jest.fn(),

    expireControlLease:
      jest.fn(),

    getActiveLeaseForIncident:
      jest.fn(),

    getSession:
      jest.fn(),

    ...overrides,
  };
}


function createService({
  humanRepository = null,
  takeoverRepository = null,
} = {}) {
  return new HumanTakeoverLifecycleService({
    humanOperationsRepository:
      humanRepository ||
      createHumanRepository(),

    takeoverRepository:
      takeoverRepository ||
      createTakeoverRepository(),
  });
}


const scope = {
  organizationId:
    "org_test",

  environmentId:
    "env_test",
};


describe(
  "Phase 23.1D deterministic lifecycle state machine",
  () => {
    test(
      "human task lifecycle exposes all Phase 23 states",
      () => {
        expect(
          Object.keys(
            HUMAN_TASK_TRANSITIONS
          )
        ).toEqual([
          "OPEN",
          "ASSIGNED",
          "ACKNOWLEDGED",
          "IN_PROGRESS",
          "WAITING",
          "RESOLVED",
          "CANCELLED",
          "EXPIRED",
        ]);
      }
    );


    test(
      "legacy ESCALATED is not a Phase 23 lifecycle state",
      () => {
        expect(
          Object.keys(
            HUMAN_TASK_TRANSITIONS
          )
        ).not.toContain(
          "ESCALATED"
        );
      }
    );


    test(
      "OPEN task can be assigned",
      () => {
        expect(
          canHumanTaskTransition(
            HUMAN_TASK_STATUS.OPEN,
            HUMAN_TASK_STATUS.ASSIGNED
          )
        ).toBe(true);
      }
    );


    test(
      "ASSIGNED task cannot jump directly to resolved",
      () => {
        expect(
          canHumanTaskTransition(
            HUMAN_TASK_STATUS.ASSIGNED,
            HUMAN_TASK_STATUS.RESOLVED
          )
        ).toBe(false);

        expect(
          () =>
            assertHumanTaskTransition(
              HUMAN_TASK_STATUS.ASSIGNED,
              HUMAN_TASK_STATUS.RESOLVED
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "HUMAN_TAKEOVER_INVALID_STATE_TRANSITION",

            executionAuthorized:
              false,
          })
        );
      }
    );


    test.each([
      HUMAN_TASK_STATUS.RESOLVED,
      HUMAN_TASK_STATUS.CANCELLED,
      HUMAN_TASK_STATUS.EXPIRED,
    ])(
      "%s human task is terminal",
      (
        status
      ) => {
        expect(
          isTerminalHumanTaskState(
            status
          )
        ).toBe(true);

        expect(
          HUMAN_TASK_TRANSITIONS[
            status
          ]
        ).toEqual([]);
      }
    );


    test(
      "takeover authorization does not mean active control",
      () => {
        expect(
          canTakeoverSessionTransition(
            TAKEOVER_SESSION_STATUS.REQUESTED,
            TAKEOVER_SESSION_STATUS.AUTHORIZED
          )
        ).toBe(true);

        expect(
          canTakeoverSessionTransition(
            TAKEOVER_SESSION_STATUS.AUTHORIZED,
            TAKEOVER_SESSION_STATUS.ACTIVE
          )
        ).toBe(true);
      }
    );


    test(
      "takeover cannot jump REQUESTED directly to ACTIVE",
      () => {
        expect(
          canTakeoverSessionTransition(
            TAKEOVER_SESSION_STATUS.REQUESTED,
            TAKEOVER_SESSION_STATUS.ACTIVE
          )
        ).toBe(false);

        expect(
          () =>
            assertTakeoverSessionTransition(
              TAKEOVER_SESSION_STATUS.REQUESTED,
              TAKEOVER_SESSION_STATUS.ACTIVE
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "HUMAN_TAKEOVER_INVALID_STATE_TRANSITION",

            executionAuthorized:
              false,
          })
        );
      }
    );


    test.each([
      TAKEOVER_SESSION_STATUS.RELEASED,
      TAKEOVER_SESSION_STATUS.EXPIRED,
      TAKEOVER_SESSION_STATUS.REVOKED,
      TAKEOVER_SESSION_STATUS.DENIED,
    ])(
      "%s takeover session is terminal",
      (
        status
      ) => {
        expect(
          isTerminalTakeoverSessionState(
            status
          )
        ).toBe(true);

        expect(
          TAKEOVER_SESSION_TRANSITIONS[
            status
          ]
        ).toEqual([]);
      }
    );


    test(
      "active control lease can only end safely",
      () => {
        expect(
          CONTROL_LEASE_TRANSITIONS[
            CONTROL_LEASE_STATUS.ACTIVE
          ]
        ).toEqual([
          CONTROL_LEASE_STATUS.RELEASED,
          CONTROL_LEASE_STATUS.EXPIRED,
          CONTROL_LEASE_STATUS.REVOKED,
        ]);

        expect(
          canControlLeaseTransition(
            CONTROL_LEASE_STATUS.ACTIVE,
            CONTROL_LEASE_STATUS.RELEASED
          )
        ).toBe(true);

        expect(
          canControlLeaseTransition(
            CONTROL_LEASE_STATUS.ACTIVE,
            CONTROL_LEASE_STATUS.EXPIRED
          )
        ).toBe(true);
      }
    );


    test.each([
      CONTROL_LEASE_STATUS.RELEASED,
      CONTROL_LEASE_STATUS.EXPIRED,
      CONTROL_LEASE_STATUS.REVOKED,
    ])(
      "%s control lease is terminal",
      (
        status
      ) => {
        expect(
          isTerminalControlLeaseState(
            status
          )
        ).toBe(true);
      }
    );
  }
);


describe(
  "Phase 23.1D human task lifecycle service",
  () => {
    test(
      "marks eligible task WAITING through repository",
      async () => {
        const humanRepository =
          createHumanRepository({
            getTask:
              jest.fn()
                .mockResolvedValue({
                  id:
                    "task-db-1",

                  publicId:
                    "htask_1",

                  status:
                    HUMAN_TASK_STATUS.OPEN,

                  executionAuthorized:
                    false,
                }),

            updateTaskStatus:
              jest.fn()
                .mockResolvedValue({
                  publicId:
                    "htask_1",

                  status:
                    HUMAN_TASK_STATUS.WAITING,

                  executionAuthorized:
                    false,
                }),
          });

        const service =
          createService({
            humanRepository,
          });

        const result =
          await service.markTaskWaiting({
            ...scope,

            taskId:
              "htask_1",

            reason:
              "Waiting for operator",
          });

        expect(
          result.status
        ).toBe(
          HUMAN_TASK_STATUS.WAITING
        );

        expect(
          result.executionAuthorized
        ).toBe(false);

        expect(
          humanRepository
            .updateTaskStatus
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            status:
              HUMAN_TASK_STATUS.WAITING,

            reason:
              "Waiting for operator",
          })
        );
      }
    );


    test(
      "cannot start work from OPEN without acknowledgement",
      async () => {
        const humanRepository =
          createHumanRepository({
            getTask:
              jest.fn()
                .mockResolvedValue({
                  publicId:
                    "htask_1",

                  status:
                    HUMAN_TASK_STATUS.OPEN,
                }),
          });

        const service =
          createService({
            humanRepository,
          });

        await expect(
          service.startTaskWork({
            ...scope,

            taskId:
              "htask_1",

            actorUserId:
              "user_1",
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_TAKEOVER_INVALID_STATE_TRANSITION",

          executionAuthorized:
            false,
        });

        expect(
          humanRepository
            .updateTaskStatus
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "acknowledged task can enter IN_PROGRESS",
      async () => {
        const humanRepository =
          createHumanRepository({
            getTask:
              jest.fn()
                .mockResolvedValue({
                  publicId:
                    "htask_1",

                  status:
                    HUMAN_TASK_STATUS.ACKNOWLEDGED,
                }),

            updateTaskStatus:
              jest.fn()
                .mockResolvedValue({
                  publicId:
                    "htask_1",

                  status:
                    HUMAN_TASK_STATUS.IN_PROGRESS,

                  executionAuthorized:
                    false,
                }),
          });

        const service =
          createService({
            humanRepository,
          });

        const result =
          await service.startTaskWork({
            ...scope,

            taskId:
              "htask_1",

            actorUserId:
              "user_1",
          });

        expect(
          result.status
        ).toBe(
          HUMAN_TASK_STATUS.IN_PROGRESS
        );

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "terminal task cannot be assigned",
      async () => {
        const humanRepository =
          createHumanRepository({
            getTask:
              jest.fn()
                .mockResolvedValue({
                  publicId:
                    "htask_closed",

                  status:
                    HUMAN_TASK_STATUS.RESOLVED,
                }),
          });

        const service =
          createService({
            humanRepository,
          });

        await expect(
          service.assignTask({
            ...scope,

            taskId:
              "htask_closed",

            actorUserId:
              "user_1",

            assignedUserId:
              "user_2",
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_TASK_TERMINAL",

          executionAuthorized:
            false,
        });

        expect(
          humanRepository
            .createAssignment
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "assignment never grants execution authorization",
      async () => {
        const humanRepository =
          createHumanRepository({
            getTask:
              jest.fn()
                .mockResolvedValue({
                  publicId:
                    "htask_1",

                  status:
                    HUMAN_TASK_STATUS.OPEN,
                }),

            createAssignment:
              jest.fn()
                .mockResolvedValue({
                  publicId:
                    "hasg_1",

                  status:
                    "ACTIVE",

                  executionAuthorized:
                    false,
                }),
          });

        const service =
          createService({
            humanRepository,
          });

        const result =
          await service.assignTask({
            ...scope,

            taskId:
              "htask_1",

            actorUserId:
              "user_1",

            assignedUserId:
              "user_2",
          });

        expect(
          result.executionAuthorized
        ).toBe(false);

        expect(
          result.assignment
            .executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "resolved task cannot be expired",
      async () => {
        const humanRepository =
          createHumanRepository({
            getTask:
              jest.fn()
                .mockResolvedValue({
                  publicId:
                    "htask_1",

                  status:
                    HUMAN_TASK_STATUS.RESOLVED,
                }),
          });

        const service =
          createService({
            humanRepository,
          });

        await expect(
          service.expireTask({
            ...scope,

            taskId:
              "htask_1",
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_TASK_TERMINAL",

          executionAuthorized:
            false,
        });
      }
    );
  }
);


describe(
  "Phase 23.1D takeover lifecycle service",
  () => {
    test(
      "request takeover does not grant control",
      async () => {
        const takeoverRepository =
          createTakeoverRepository({
            createTakeoverSession:
              jest.fn()
                .mockResolvedValue({
                  publicId:
                    "htko_1",

                  status:
                    TAKEOVER_SESSION_STATUS.REQUESTED,

                  executionAuthorized:
                    false,
                }),
          });

        const service =
          createService({
            takeoverRepository,
          });

        const result =
          await service.requestTakeover({
            ...scope,

            incidentId:
              "incident_1",

            actorUserId:
              "user_1",
          });

        expect(
          result.session.status
        ).toBe(
          TAKEOVER_SESSION_STATUS.REQUESTED
        );

        expect(
          result.controlGranted
        ).toBe(false);

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "authorization still does not grant control",
      async () => {
        const takeoverRepository =
          createTakeoverRepository({
            getSession:
              jest.fn()
                .mockResolvedValue({
                  publicId:
                    "htko_1",

                  status:
                    TAKEOVER_SESSION_STATUS.REQUESTED,

                  executionAuthorized:
                    false,
                }),

            authorizeSession:
              jest.fn()
                .mockResolvedValue({
                  publicId:
                    "htko_1",

                  status:
                    TAKEOVER_SESSION_STATUS.AUTHORIZED,

                  executionAuthorized:
                    false,
                }),
          });

        const service =
          createService({
            takeoverRepository,
          });

        const result =
          await service.authorizeTakeover({
            ...scope,

            sessionId:
              "htko_1",

            actorUserId:
              "user_admin",
          });

        expect(
          result.session.status
        ).toBe(
          TAKEOVER_SESSION_STATUS.AUTHORIZED
        );

        expect(
          result.controlGranted
        ).toBe(false);

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "REQUESTED session cannot take control directly",
      async () => {
        const takeoverRepository =
          createTakeoverRepository({
            getSession:
              jest.fn()
                .mockResolvedValue({
                  publicId:
                    "htko_1",

                  status:
                    TAKEOVER_SESSION_STATUS.REQUESTED,
                }),
          });

        const service =
          createService({
            takeoverRepository,
          });

        await expect(
          service.takeControl({
            ...scope,

            sessionId:
              "htko_1",

            actorUserId:
              "user_1",
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_TAKEOVER_INVALID_STATE_TRANSITION",

          executionAuthorized:
            false,
        });

        expect(
          takeoverRepository
            .acquireControlLease
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "authorized session obtains active lease but never execution authorization",
      async () => {
        const takeoverRepository =
          createTakeoverRepository({
            getSession:
              jest.fn()
                .mockResolvedValue({
                  publicId:
                    "htko_1",

                  status:
                    TAKEOVER_SESSION_STATUS.AUTHORIZED,

                  executionAuthorized:
                    false,
                }),

            acquireControlLease:
              jest.fn()
                .mockResolvedValue({
                  publicId:
                    "hlease_1",

                  status:
                    CONTROL_LEASE_STATUS.ACTIVE,

                  executionAuthorized:
                    false,
                }),
          });

        const service =
          createService({
            takeoverRepository,
          });

        const result =
          await service.takeControl({
            ...scope,

            sessionId:
              "htko_1",

            actorUserId:
              "user_1",
          });

        expect(
          result.humanControlActive
        ).toBe(true);

        expect(
          result.executionAuthorized
        ).toBe(false);

        expect(
          result.lease
            .executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "heartbeat preserves human-control-only boundary",
      async () => {
        const takeoverRepository =
          createTakeoverRepository({
            heartbeatLease:
              jest.fn()
                .mockResolvedValue({
                  publicId:
                    "hlease_1",

                  status:
                    CONTROL_LEASE_STATUS.ACTIVE,

                  leaseVersion:
                    2,

                  executionAuthorized:
                    false,
                }),
          });

        const service =
          createService({
            takeoverRepository,
          });

        const result =
          await service.heartbeatControl({
            ...scope,

            leaseId:
              "hlease_1",

            actorUserId:
              "user_1",

            extensionMs:
              300000,
          });

        expect(
          result.humanControlActive
        ).toBe(true);

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "release control requires fresh evaluation and forbids stale resume",
      async () => {
        const takeoverRepository =
          createTakeoverRepository({
            releaseControlLease:
              jest.fn()
                .mockResolvedValue({
                  publicId:
                    "hlease_1",

                  status:
                    CONTROL_LEASE_STATUS.RELEASED,

                  executionAuthorized:
                    false,
                }),
          });

        const service =
          createService({
            takeoverRepository,
          });

        const result =
          await service.releaseControl({
            ...scope,

            leaseId:
              "hlease_1",

            actorUserId:
              "user_1",
          });

        expect(
          result.humanControlActive
        ).toBe(false);

        expect(
          result.requiresFreshEvaluation
        ).toBe(true);

        expect(
          result.stalePlanResumeAllowed
        ).toBe(false);

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "lease expiry leaves system safe and forbids stale resume",
      async () => {
        const takeoverRepository =
          createTakeoverRepository({
            expireControlLease:
              jest.fn()
                .mockResolvedValue({
                  publicId:
                    "hlease_1",

                  status:
                    CONTROL_LEASE_STATUS.EXPIRED,

                  executionAuthorized:
                    false,
                }),
          });

        const service =
          createService({
            takeoverRepository,
          });

        const result =
          await service.expireControl({
            ...scope,

            leaseId:
              "hlease_1",
          });

        expect(
          result.humanControlActive
        ).toBe(false);

        expect(
          result.requiresFreshEvaluation
        ).toBe(true);

        expect(
          result.stalePlanResumeAllowed
        ).toBe(false);

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "active-control lookup never becomes execution authorization",
      async () => {
        const takeoverRepository =
          createTakeoverRepository({
            getActiveLeaseForIncident:
              jest.fn()
                .mockResolvedValue({
                  publicId:
                    "hlease_1",

                  status:
                    CONTROL_LEASE_STATUS.ACTIVE,

                  executionAuthorized:
                    false,
                }),
          });

        const service =
          createService({
            takeoverRepository,
          });

        const result =
          await service.getActiveControl({
            ...scope,

            incidentId:
              "incident_1",
          });

        expect(
          result.active
        ).toBe(true);

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );
  }
);