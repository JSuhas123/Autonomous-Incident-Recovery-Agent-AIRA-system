"use strict";


const {
  HUMAN_TASK_STATUS,
  TAKEOVER_SESSION_STATUS,
  CONTROL_LEASE_STATUS,
} =
  require(
    "../../constants/humanTakeover"
  );


const {
  HumanTakeControlService,
  TAKE_CONTROL_INVARIANTS,
  taskIsControlEligible,
} =
  require(
    "../../services/humanOperations/humanTakeControlService"
  );


const {
  HumanControlFenceService,
} =
  require(
    "../../services/humanOperations/humanControlFenceService"
  );


function taskFixture(
  overrides =
    {}
) {
  return {
    id:
      "22222222-2222-4222-8222-222222222222",

    publicId:
      "task-1",

    incidentId:
      "incident-1",

    assignedUserId:
      "user-1",

    assignedTeamId:
      null,

    status:
      HUMAN_TASK_STATUS
        .ACKNOWLEDGED,

    controlEpoch:
      4,

    executionAuthorized:
      false,

    ...overrides,
  };
}


function requestedSession(
  overrides =
    {}
) {
  return {
    id:
      "33333333-3333-4333-8333-333333333333",

    publicId:
      "takeover-1",

    incidentId:
      "incident-1",

    taskId:
      "22222222-2222-4222-8222-222222222222",

    requestedByUserId:
      "user-1",

    authorizedByUserId:
      null,

    status:
      TAKEOVER_SESSION_STATUS
        .REQUESTED,

    controlEpoch:
      4,

    executionAuthorized:
      false,

    ...overrides,
  };
}


function authorizedSession(
  overrides =
    {}
) {
  return requestedSession({
    authorizedByUserId:
      "admin-1",

    status:
      TAKEOVER_SESSION_STATUS
        .AUTHORIZED,

    ...overrides,
  });
}


function activeLease(
  overrides =
    {}
) {
  return {
    id:
      "44444444-4444-4444-8444-444444444444",

    publicId:
      "lease-1",

    incidentId:
      "incident-1",

    takeoverSessionId:
      "33333333-3333-4333-8333-333333333333",

    holderUserId:
      "user-1",

    status:
      CONTROL_LEASE_STATUS
        .ACTIVE,

    controlEpoch:
      4,

    leaseVersion:
      1,

    executionAuthorized:
      false,

    ...overrides,
  };
}


describe(
  "Phase 23.5 Take Control",

  () => {
    test(
      "take-control invariants preserve authority separation",

      () => {
        expect(
          TAKE_CONTROL_INVARIANTS
            .ACKNOWLEDGEMENT_IS_NOT_CONTROL
        ).toBe(
          true
        );


        expect(
          TAKE_CONTROL_INVARIANTS
            .TAKEOVER_REQUEST_IS_NOT_CONTROL
        ).toBe(
          true
        );


        expect(
          TAKE_CONTROL_INVARIANTS
            .TAKEOVER_AUTHORIZATION_IS_NOT_CONTROL
        ).toBe(
          true
        );


        expect(
          TAKE_CONTROL_INVARIANTS
            .ACTIVE_LEASE_IS_CONTROL_AUTHORITY
        ).toBe(
          true
        );


        expect(
          TAKE_CONTROL_INVARIANTS
            .HUMAN_CONTROL_NEVER_AUTHORIZES_EXECUTION
        ).toBe(
          true
        );
      }
    );


    test(
      "only ACKNOWLEDGED and IN_PROGRESS tasks are control eligible",

      () => {
        expect(
          taskIsControlEligible({
            status:
              HUMAN_TASK_STATUS
                .OPEN,
          })
        ).toBe(
          false
        );


        expect(
          taskIsControlEligible({
            status:
              HUMAN_TASK_STATUS
                .ASSIGNED,
          })
        ).toBe(
          false
        );


        expect(
          taskIsControlEligible({
            status:
              HUMAN_TASK_STATUS
                .ACKNOWLEDGED,
          })
        ).toBe(
          true
        );


        expect(
          taskIsControlEligible({
            status:
              HUMAN_TASK_STATUS
                .IN_PROGRESS,
          })
        ).toBe(
          true
        );
      }
    );


    test(
      "ASSIGNED task cannot request control before acknowledgement",

      async () => {
        const service =
          new HumanTakeControlService({
            humanOperationsRepository: {
              getTask:
                jest
                  .fn()
                  .mockResolvedValue(
                    taskFixture({
                      status:
                        HUMAN_TASK_STATUS
                          .ASSIGNED,
                    })
                  ),
            },

            takeoverRepository: {
              getActiveLeaseForIncident:
                jest.fn(),
            },

            lifecycleService: {
              requestTakeover:
                jest.fn(),
            },
          });


        await expect(
          service.requestControl({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            taskId:
              "task-1",

            actorUserId:
              "user-1",
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_CONTROL_TASK_NOT_ACKNOWLEDGED",

          status:
            409,

          executionAuthorized:
            false,
        });


        expect(
          service
            .lifecycleService
            .requestTakeover
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "operator assigned task may create takeover request after acknowledgement",

      async () => {
        const lifecycleService = {
          requestTakeover:
            jest
              .fn()
              .mockResolvedValue({
                session:
                  requestedSession(),

                controlGranted:
                  false,

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new HumanTakeControlService({
            humanOperationsRepository: {
              getTask:
                jest
                  .fn()
                  .mockResolvedValue(
                    taskFixture()
                  ),
            },

            takeoverRepository: {
              getActiveLeaseForIncident:
                jest
                  .fn()
                  .mockResolvedValue(
                    null
                  ),
            },

            lifecycleService,
          });


        const result =
          await service
            .requestControl({
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-1",

              taskId:
                "task-1",

              actorUserId:
                "user-1",

              reason:
                "Need manual diagnosis",
            });


        expect(
          lifecycleService
            .requestTakeover
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            incidentId:
              "incident-1",

            taskId:
              "task-1",

            actorUserId:
              "user-1",

            controlEpoch:
              4,
          })
        );


        expect(
          result
            .session
            .status
        ).toBe(
          TAKEOVER_SESSION_STATUS
            .REQUESTED
        );


        expect(
          result.humanControlActive
        ).toBe(
          false
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "another directly-unassigned operator cannot request control",

      async () => {
        const service =
          new HumanTakeControlService({
            humanOperationsRepository: {
              getTask:
                jest
                  .fn()
                  .mockResolvedValue(
                    taskFixture({
                      assignedUserId:
                        "user-owner",
                    })
                  ),
            },

            takeoverRepository:
              {},

            lifecycleService:
              {},
          });


        await expect(
          service.requestControl({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            taskId:
              "task-1",

            actorUserId:
              "user-other",
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_CONTROL_TASK_ASSIGNEE_MISMATCH",

          status:
            403,

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "active incident lease blocks another takeover request",

      async () => {
        const lifecycleService = {
          requestTakeover:
            jest.fn(),
        };


        const service =
          new HumanTakeControlService({
            humanOperationsRepository: {
              getTask:
                jest
                  .fn()
                  .mockResolvedValue(
                    taskFixture()
                  ),
            },

            takeoverRepository: {
              getActiveLeaseForIncident:
                jest
                  .fn()
                  .mockResolvedValue(
                    activeLease()
                  ),
            },

            lifecycleService,
          });


        await expect(
          service.requestControl({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            taskId:
              "task-1",

            actorUserId:
              "user-1",
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_CONTROL_LEASE_CONFLICT",

          status:
            409,

          executionAuthorized:
            false,
        });


        expect(
          lifecycleService
            .requestTakeover
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "authorization still does not grant human control",

      async () => {
        const lifecycleService = {
          authorizeTakeover:
            jest
              .fn()
              .mockResolvedValue({
                session:
                  authorizedSession(),

                controlGranted:
                  false,

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new HumanTakeControlService({
            humanOperationsRepository:
              {},

            takeoverRepository: {
              getSession:
                jest
                  .fn()
                  .mockResolvedValue(
                    requestedSession()
                  ),
            },

            lifecycleService,
          });


        const result =
          await service
            .authorizeControl({
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              sessionId:
                "takeover-1",

              actorUserId:
                "admin-1",
            });


        expect(
          result
            .session
            .status
        ).toBe(
          TAKEOVER_SESSION_STATUS
            .AUTHORIZED
        );


        expect(
          result.humanControlActive
        ).toBe(
          false
        );


        expect(
          result.autonomousContinuationAllowed
        ).toBe(
          true
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "REQUESTED session cannot acquire control",

      async () => {
        const lifecycleService = {
          takeControl:
            jest.fn(),
        };


        const service =
          new HumanTakeControlService({
            humanOperationsRepository:
              {},

            takeoverRepository: {
              getSession:
                jest
                  .fn()
                  .mockResolvedValue(
                    requestedSession()
                  ),
            },

            lifecycleService,
          });


        await expect(
          service.acquireControl({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            sessionId:
              "takeover-1",

            actorUserId:
              "user-1",

            leaseDurationMs:
              60000,
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_CONTROL_SESSION_NOT_AUTHORIZED",

          executionAuthorized:
            false,
        });


        expect(
          lifecycleService
            .takeControl
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "authorized requester acquires ACTIVE lease and blocks AIRA continuation",

      async () => {
        const lease =
          activeLease();


        const lifecycleService = {
          takeControl:
            jest
              .fn()
              .mockResolvedValue({
                sessionId:
                  "takeover-1",

                lease,

                humanControlActive:
                  true,

                executionAuthorized:
                  false,
              }),
        };


        const takeoverRepository = {
          getSession:
            jest
              .fn()
              .mockResolvedValue(
                authorizedSession()
              ),

          getActiveLeaseForIncident:
            jest
              .fn()
              .mockResolvedValue(
                lease
              ),
        };


        const service =
          new HumanTakeControlService({
            humanOperationsRepository:
              {},

            takeoverRepository,

            lifecycleService,
          });


        const result =
          await service
            .acquireControl({
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              sessionId:
                "takeover-1",

              actorUserId:
                "user-1",

              leaseDurationMs:
                60000,
            });


        expect(
          lifecycleService
            .takeControl
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId:
              "takeover-1",

            actorUserId:
              "user-1",

            leaseDurationMs:
              60000,
          })
        );


        expect(
          result.humanControlActive
        ).toBe(
          true
        );


        expect(
          result.autonomousContinuationAllowed
        ).toBe(
          false
        );


        expect(
          result.lease.status
        ).toBe(
          CONTROL_LEASE_STATUS
            .ACTIVE
        );


        expect(
          result.controlEpoch
        ).toBe(
          4
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "different operator cannot steal authorized takeover session",

      async () => {
        const lifecycleService = {
          takeControl:
            jest.fn(),
        };


        const service =
          new HumanTakeControlService({
            humanOperationsRepository:
              {},

            takeoverRepository: {
              getSession:
                jest
                  .fn()
                  .mockResolvedValue(
                    authorizedSession({
                      requestedByUserId:
                        "user-1",
                    })
                  ),
            },

            lifecycleService,
          });


        await expect(
          service.acquireControl({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            sessionId:
              "takeover-1",

            actorUserId:
              "user-2",

            leaseDurationMs:
              60000,
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_CONTROL_REQUESTER_MISMATCH",

          status:
            403,

          executionAuthorized:
            false,
        });


        expect(
          lifecycleService
            .takeControl
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "control fence blocks autonomous continuation during ACTIVE lease",

      async () => {
        const fence =
          new HumanControlFenceService({
            controlService: {
              getIncidentControlState:
                jest
                  .fn()
                  .mockResolvedValue({
                    incidentId:
                      "incident-1",

                    active:
                      true,

                    humanControlActive:
                      true,

                    lease:
                      activeLease(),

                    autonomousContinuationAllowed:
                      false,

                    executionAuthorized:
                      false,
                  }),
            },
          });


        const result =
          await fence.evaluate({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            executionAuthorized:
              false,
          });


        expect(
          result.allowed
        ).toBe(
          false
        );


        expect(
          result.decision
        ).toBe(
          "BLOCK"
        );


        expect(
          result.reason
        ).toBe(
          "ACTIVE_HUMAN_CONTROL"
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "control fence throws deterministic block for autonomous caller",

      async () => {
        const fence =
          new HumanControlFenceService({
            controlService: {
              getIncidentControlState:
                jest
                  .fn()
                  .mockResolvedValue({
                    incidentId:
                      "incident-1",

                    humanControlActive:
                      true,

                    lease:
                      activeLease(),

                    executionAuthorized:
                      false,
                  }),
            },
          });


        await expect(
          fence.assertAllowed({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_CONTROL_AUTONOMY_BLOCKED",

          status:
            423,

          humanControlActive:
            true,

          autonomousContinuationAllowed:
            false,

          stalePlanResumeAllowed:
            false,

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "absence of human lease only passes this fence and does not authorize execution",

      async () => {
        const fence =
          new HumanControlFenceService({
            controlService: {
              getIncidentControlState:
                jest
                  .fn()
                  .mockResolvedValue({
                    incidentId:
                      "incident-1",

                    active:
                      false,

                    humanControlActive:
                      false,

                    lease:
                      null,

                    autonomousContinuationAllowed:
                      true,

                    executionAuthorized:
                      false,
                  }),
            },
          });


        const result =
          await fence.assertAllowed({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",
          });


        expect(
          result.allowed
        ).toBe(
          true
        );


        expect(
          result.decision
        ).toBe(
          "PASS"
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "control fence rejects caller-manufactured execution authority",

      async () => {
        const controlService = {
          getIncidentControlState:
            jest.fn(),
        };


        const fence =
          new HumanControlFenceService({
            controlService,
          });


        await expect(
          fence.evaluate({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            executionAuthorized:
              true,
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_CONTROL_FENCE_AUTHORITY_VIOLATION",

          executionAuthorized:
            false,
        });


        expect(
          controlService
            .getIncidentControlState
        ).not.toHaveBeenCalled();
      }
    );
  }
);