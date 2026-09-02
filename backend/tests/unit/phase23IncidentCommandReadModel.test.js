"use strict";


const {
  IncidentCommandReadModelService,

  INCIDENT_COMMAND_INVARIANTS,

  computeCapabilities,
} =
  require(
    "../../services/humanOperations/incidentCommandReadModelService"
  );


function baseProjection(
  overrides =
    {}
) {
  return {
    incidentId:
      "incident-1",

    task: {
      publicId:
        "task-1",

      incidentId:
        "incident-1",

      status:
        "ACKNOWLEDGED",

      assignedUserId:
        "user-1",

      autonomousRecoveryBlocked:
        true,

      executionAuthorized:
        false,
    },

    assignment: {
      publicId:
        "assignment-1",

      assignedUserId:
        "user-1",

      status:
        "ACTIVE",

      executionAuthorized:
        false,
    },

    acknowledgement: {
      publicId:
        "ack-1",

      acknowledgedByUserId:
        "user-1",

      outcome:
        "ACKNOWLEDGED",

      executionAuthorized:
        false,
    },

    escalation: {
      publicId:
        "esc-1",

      incidentId:
        "incident-1",

      status:
        "WAITING_ACK",

      executionAuthorized:
        false,
    },

    notification:
      null,

    handoff:
      null,

    takeoverSession:
      null,

    activeLease:
      null,

    returnFence:
      null,

    executionAuthorized:
      false,

    ...overrides,
  };
}


describe(
  "Phase 23.7 Incident Command Read Model",
  () => {
    test(
      "safety invariants remain frozen",
      () => {
        expect(
          INCIDENT_COMMAND_INVARIANTS
            .UI_NEVER_INVENTS_AUTHORITY
        ).toBe(
          true
        );


        expect(
          INCIDENT_COMMAND_INVARIANTS
            .CAPABILITY_IS_NOT_CONTROL
        ).toBe(
          true
        );


        expect(
          INCIDENT_COMMAND_INVARIANTS
            .CAPABILITY_IS_NOT_EXECUTION_AUTHORIZATION
        ).toBe(
          true
        );


        expect(
          INCIDENT_COMMAND_INVARIANTS
            .STALE_PLAN_RESUME_PROHIBITED
        ).toBe(
          true
        );
      }
    );


    test(
      "assigned task may be acknowledged",
      () => {
        const capabilities =
          computeCapabilities({
            actorUserId:
              "user-1",

            projection:
              baseProjection({
                task: {
                  publicId:
                    "task-1",

                  status:
                    "ASSIGNED",

                  assignedUserId:
                    "user-1",

                  executionAuthorized:
                    false,
                },

                acknowledgement:
                  null,
              }),
          });


        expect(
          capabilities
            .acknowledge
        ).toBe(
          true
        );


        expect(
          capabilities
            .requestControl
        ).toBe(
          false
        );


        expect(
          capabilities
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "acknowledged operator may request control",
      () => {
        const capabilities =
          computeCapabilities({
            actorUserId:
              "user-1",

            projection:
              baseProjection(),
          });


        expect(
          capabilities
            .requestControl
        ).toBe(
          true
        );


        expect(
          capabilities
            .acquireControl
        ).toBe(
          false
        );
      }
    );


    test(
      "requested session exposes authorization but not acquisition",
      () => {
        const capabilities =
          computeCapabilities({
            actorUserId:
              "user-1",

            projection:
              baseProjection({
                takeoverSession: {
                  publicId:
                    "takeover-1",

                  requestedByUserId:
                    "user-1",

                  status:
                    "REQUESTED",

                  executionAuthorized:
                    false,
                },
              }),
          });


        expect(
          capabilities
            .authorizeControl
        ).toBe(
          true
        );


        expect(
          capabilities
            .acquireControl
        ).toBe(
          false
        );


        expect(
          capabilities
            .requestControl
        ).toBe(
          false
        );
      }
    );


    test(
      "authorized requester may acquire control",
      () => {
        const capabilities =
          computeCapabilities({
            actorUserId:
              "user-1",

            projection:
              baseProjection({
                takeoverSession: {
                  publicId:
                    "takeover-1",

                  requestedByUserId:
                    "user-1",

                  status:
                    "AUTHORIZED",

                  executionAuthorized:
                    false,
                },
              }),
          });


        expect(
          capabilities
            .acquireControl
        ).toBe(
          true
        );


        expect(
          capabilities
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "different user cannot acquire another user's authorized session",
      () => {
        const capabilities =
          computeCapabilities({
            actorUserId:
              "user-2",

            projection:
              baseProjection({
                takeoverSession: {
                  publicId:
                    "takeover-1",

                  requestedByUserId:
                    "user-1",

                  status:
                    "AUTHORIZED",

                  executionAuthorized:
                    false,
                },
              }),
          });


        expect(
          capabilities
            .acquireControl
        ).toBe(
          false
        );
      }
    );


    test(
      "active lease exposes heartbeat and return only to holder",
      () => {
        const capabilities =
          computeCapabilities({
            actorUserId:
              "user-1",

            projection:
              baseProjection({
                takeoverSession: {
                  publicId:
                    "takeover-1",

                  requestedByUserId:
                    "user-1",

                  status:
                    "ACTIVE",
                },

                activeLease: {
                  publicId:
                    "lease-1",

                  holderUserId:
                    "user-1",

                  status:
                    "ACTIVE",

                  controlEpoch:
                    5,

                  executionAuthorized:
                    false,
                },
              }),
          });


        expect(
          capabilities
            .heartbeatControl
        ).toBe(
          true
        );


        expect(
          capabilities
            .returnControl
        ).toBe(
          true
        );


        expect(
          capabilities
            .requestControl
        ).toBe(
          false
        );
      }
    );


    test(
      "non-holder cannot heartbeat or return another lease",
      () => {
        const capabilities =
          computeCapabilities({
            actorUserId:
              "user-2",

            projection:
              baseProjection({
                activeLease: {
                  publicId:
                    "lease-1",

                  holderUserId:
                    "user-1",

                  status:
                    "ACTIVE",
                },
              }),
          });


        expect(
          capabilities
            .heartbeatControl
        ).toBe(
          false
        );


        expect(
          capabilities
            .returnControl
        ).toBe(
          false
        );
      }
    );


    test(
      "pending return fence blocks new control acquisition",
      () => {
        const capabilities =
          computeCapabilities({
            actorUserId:
              "user-1",

            projection:
              baseProjection({
                takeoverSession: {
                  publicId:
                    "takeover-1",

                  requestedByUserId:
                    "user-1",

                  status:
                    "AUTHORIZED",
                },

                returnFence: {
                  publicId:
                    "return-fence-1",

                  state:
                    "REQUIRES_FRESH_EVALUATION",

                  requiredControlEpoch:
                    8,

                  executionAuthorized:
                    false,
                },
              }),
          });


        expect(
          capabilities
            .acquireControl
        ).toBe(
          false
        );


        expect(
          capabilities
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "read model aggregates human control and return state",
      async () => {
        const repository = {
          getProjection:
            jest
              .fn()
              .mockResolvedValue(
                baseProjection({
                  activeLease: {
                    publicId:
                      "lease-1",

                    holderUserId:
                      "user-1",

                    status:
                      "ACTIVE",

                    controlEpoch:
                      7,

                    executionAuthorized:
                      false,
                  },
                })
              ),
        };


        const service =
          new IncidentCommandReadModelService({
            repository,
          });


        const model =
          await service
            .getReadModel({
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-1",

              actorUserId:
                "user-1",
            });


        expect(
          model
            .control
            .humanControlActive
        ).toBe(
          true
        );


        expect(
          model
            .control
            .holderUserId
        ).toBe(
          "user-1"
        );


        expect(
          model
            .capabilities
            .returnControl
        ).toBe(
          true
        );


        expect(
          model
            .autonomousContinuationBlocked
        ).toBe(
          true
        );


        expect(
          model
            .stalePlanResumeAllowed
        ).toBe(
          false
        );


        expect(
          model
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "satisfied return fence never makes old plan resumable",
      async () => {
        const service =
          new IncidentCommandReadModelService({
            repository: {
              getProjection:
                jest
                  .fn()
                  .mockResolvedValue(
                    baseProjection({
                      task: {
                        publicId:
                          "task-1",

                        status:
                          "IN_PROGRESS",

                        assignedUserId:
                          "user-1",

                        autonomousRecoveryBlocked:
                          false,
                      },

                      returnFence: {
                        publicId:
                          "return-fence-1",

                        state:
                          "SATISFIED",

                        requiredControlEpoch:
                          8,

                        executionAuthorized:
                          false,
                      },
                    })
                  ),
            },
          });


        const model =
          await service
            .getReadModel({
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-1",

              actorUserId:
                "user-1",
            });


        expect(
          model
            .returnControl
            .freshEvaluationSatisfied
        ).toBe(
          true
        );


        expect(
          model
            .returnControl
            .stalePlanResumeAllowed
        ).toBe(
          false
        );


        expect(
          model.executionAuthorized
        ).toBe(
          false
        );
      }
    );
  }
);