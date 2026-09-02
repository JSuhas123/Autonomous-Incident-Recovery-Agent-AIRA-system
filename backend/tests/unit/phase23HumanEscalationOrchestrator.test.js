"use strict";


const {
  HumanEscalationOrchestratorService,
  taskTypeFromReason,
  priorityFromSeverity,
} = require(
  "../../services/humanOperations/humanEscalationOrchestratorService"
);


const {
  ESCALATION_DECISION,
  ESCALATION_REASON,
  ESCALATION_STATUS,
  ON_CALL_TARGET_TYPE,
  ESCALATION_TRIGGER_SOURCE,
} = require(
  "../../constants/humanEscalation"
);


/*
 * ============================================================================
 * FIXTURES
 * ============================================================================
 */


function baseInput(
  overrides = {}
) {
  return {
    organizationId:
      "org-test",

    environmentId:
      "env-test",

    incidentId:
      "inc-23-2b",

    reasonCode:
      ESCALATION_REASON
        .RECOVERY_UNSAFE,

    triggerSource:
      ESCALATION_TRIGGER_SOURCE
        .RECOVERY_ENGINE,

    severity:
      "CRITICAL",

    ...overrides,
  };
}


function decisionResult(
  overrides = {}
) {
  return {
    incidentId:
      "inc-23-2b",

    decision:
      ESCALATION_DECISION
        .ESCALATE,

    reasonCode:
      ESCALATION_REASON
        .RECOVERY_UNSAFE,

    triggerSource:
      ESCALATION_TRIGGER_SOURCE
        .RECOVERY_ENGINE,

    matchedPolicy: {
      id:
        "policy-db-id",

      publicId:
        "esc_policy_primary",

      policyKey:
        "primary",

      priority:
        1,

      createHumanTask:
        true,

      blockAutonomousRecovery:
        true,

      acknowledgementTimeoutSeconds:
        900,
    },

    selectedTarget: {
      id:
        "target-db-id",

      publicId:
        "oncall_primary",

      targetKey:
        "primary-oncall",

      targetType:
        ON_CALL_TARGET_TYPE.USER,

      targetUserId:
        "user-1",

      targetTeamId:
        null,

      integrationRef:
        null,

      routingKey:
        null,

      channels: [
        "SLACK",
      ],
    },

    createHumanTask:
      true,

    autonomousRecoveryBlocked:
      true,

    acknowledgementTimeoutSeconds:
      900,

    deterministic:
      true,

    humanControlGranted:
      false,

    executionAuthorized:
      false,

    ...overrides,
  };
}


/*
 * ============================================================================
 * TEST HARNESS
 * ============================================================================
 */


function harness({
  decision =
    decisionResult(),
} = {}) {
  const escalationRepository = {
    listPolicies:
      jest
        .fn()
        .mockResolvedValue([
          {
            publicId:
              "esc_policy_primary",
          },
        ]),

    listTargets:
      jest
        .fn()
        .mockResolvedValue([
          {
            publicId:
              "oncall_primary",
          },
        ]),

    createEscalation:
      jest
        .fn()
        .mockImplementation(
          async (
            input
          ) => ({
            id:
              "esc-db-id",

            publicId:
              "esc_23_2b",

            status:
              input.status,

            decision:
              input.decision,

            reasonCode:
              input.reasonCode,

            executionAuthorized:
              false,
          })
        ),

    updateEscalationStatus:
      jest
        .fn()
        .mockImplementation(
          async (
            input
          ) => ({
            id:
              "esc-db-id",

            publicId:
              "esc_23_2b",

            status:
              input.status,

            taskId:
              input.taskId ||
              null,

            routingSnapshot:
              input.routingSnapshot ||
              {},

            executionAuthorized:
              false,
          })
        ),
  };


  const humanOperationsRepository = {
    createTask:
      jest
        .fn()
        .mockImplementation(
          async (
            input
          ) => ({
            id:
              "task-db-id",

            publicId:
              "htask_23_2b",

            status:
              input.status,

            taskType:
              input.taskType,

            priority:
              input.priority,

            autonomousRecoveryBlocked:
              true,

            executionAuthorized:
              false,
          })
        ),

    createAssignment:
      jest
        .fn()
        .mockImplementation(
          async (
            input
          ) => ({
            id:
              "assignment-db-id",

            publicId:
              "hasg_23_2b",

            taskId:
              input.taskId,

            assignedUserId:
              input.assignedUserId ||
              null,

            assignedTeamId:
              input.assignedTeamId ||
              null,

            status:
              "ACTIVE",

            executionAuthorized:
              false,
          })
        ),

    updateTaskStatus:
      jest
        .fn()
        .mockImplementation(
          async (
            input
          ) => ({
            id:
              "task-db-id",

            publicId:
              "htask_23_2b",

            status:
              input.status,

            executionAuthorized:
              false,
          })
        ),
  };


  const decisionService = {
    evaluate:
      jest
        .fn()
        .mockReturnValue(
          decision
        ),
  };


  const service =
    new HumanEscalationOrchestratorService({
      escalationRepository,

      humanOperationsRepository,

      decisionService,
    });


  return {
    service,

    escalationRepository,

    humanOperationsRepository,

    decisionService,
  };
}


/*
 * ============================================================================
 * TESTS
 * ============================================================================
 */


describe(
  "Phase 23.2B Human Escalation Orchestrator",
  () => {
    test(
      "loads enabled tenant policies and targets before evaluation",
      async () => {
        const h =
          harness();


        await h
          .service
          .escalate(
            baseInput()
          );


        expect(
          h
            .escalationRepository
            .listPolicies
        ).toHaveBeenCalledWith({
          organizationId:
            "org-test",

          environmentId:
            "env-test",

          enabledOnly:
            true,
        });


        expect(
          h
            .escalationRepository
            .listTargets
        ).toHaveBeenCalledWith({
          organizationId:
            "org-test",

          environmentId:
            "env-test",

          enabledOnly:
            true,
        });


        expect(
          h
            .decisionService
            .evaluate
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );


    test(
      "persists escalation before creating HumanTask",
      async () => {
        const h =
          harness();


        const callOrder =
          [];


        h
          .escalationRepository
          .createEscalation
          .mockImplementation(
            async () => {
              callOrder.push(
                "ESCALATION"
              );


              return {
                id:
                  "esc-db-id",

                publicId:
                  "esc_23_2b",

                status:
                  ESCALATION_STATUS
                    .DECIDED,

                executionAuthorized:
                  false,
              };
            }
          );


        h
          .humanOperationsRepository
          .createTask
          .mockImplementation(
            async () => {
              callOrder.push(
                "TASK"
              );


              return {
                id:
                  "task-db-id",

                publicId:
                  "htask_23_2b",

                status:
                  "OPEN",

                executionAuthorized:
                  false,
              };
            }
          );


        await h
          .service
          .escalate(
            baseInput()
          );


        expect(
          callOrder.slice(
            0,
            2
          )
        ).toEqual([
          "ESCALATION",

          "TASK",
        ]);
      }
    );


    test(
      "creates canonical task and assignment for USER target",
      async () => {
        const h =
          harness();


        const result =
          await h
            .service
            .escalate(
              baseInput()
            );


        expect(
          h
            .humanOperationsRepository
            .createTask
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            incidentId:
              "inc-23-2b",

            escalationId:
              "esc_23_2b",

            taskType:
              "MANUAL_INTERVENTION",

            priority:
              "CRITICAL",

            status:
              "OPEN",

            acknowledgementRequired:
              true,
          })
        );


        expect(
          h
            .humanOperationsRepository
            .createAssignment
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            taskId:
              "htask_23_2b",

            assignedUserId:
              "user-1",

            assignedTeamId:
              null,
          })
        );


        expect(
          result.escalation.status
        ).toBe(
          ESCALATION_STATUS
            .WAITING_ACK
        );


        expect(
          result
            .autonomousRecoveryBlocked
        ).toBe(
          true
        );


        expect(
          result
            .humanControlGranted
        ).toBe(
          false
        );


        expect(
          result
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "creates TEAM assignment without granting control",
      async () => {
        const h =
          harness({
            decision:
              decisionResult({
                selectedTarget: {
                  id:
                    "team-target-id",

                  publicId:
                    "oncall_team",

                  targetKey:
                    "team",

                  targetType:
                    ON_CALL_TARGET_TYPE
                      .TEAM,

                  targetUserId:
                    null,

                  targetTeamId:
                    "team-1",

                  integrationRef:
                    null,

                  routingKey:
                    null,

                  channels:
                    [],
                },
              }),
          });


        const result =
          await h
            .service
            .escalate(
              baseInput()
            );


        expect(
          h
            .humanOperationsRepository
            .createAssignment
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            assignedUserId:
              null,

            assignedTeamId:
              "team-1",
          })
        );


        expect(
          result
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          result
            .humanControlGranted
        ).toBe(
          false
        );
      }
    );


    test(
      "INTEGRATION target prepares handoff but does not create human assignment",
      async () => {
        const h =
          harness({
            decision:
              decisionResult({
                selectedTarget: {
                  id:
                    "integration-target-id",

                  publicId:
                    "oncall_pagerduty",

                  targetKey:
                    "pagerduty",

                  targetType:
                    ON_CALL_TARGET_TYPE
                      .INTEGRATION,

                  targetUserId:
                    null,

                  targetTeamId:
                    null,

                  integrationRef:
                    "pagerduty-primary",

                  routingKey:
                    "critical",

                  channels: [
                    "PAGERDUTY",
                  ],
                },
              }),
          });


        const result =
          await h
            .service
            .escalate(
              baseInput()
            );


        expect(
          h
            .humanOperationsRepository
            .createAssignment
        ).not.toHaveBeenCalled();


        expect(
          result.escalation.status
        ).toBe(
          ESCALATION_STATUS
            .ROUTED
        );


        expect(
          result
            .notificationHandoff
            .ready
        ).toBe(
          true
        );


        expect(
          result
            .notificationHandoff
            .deliveryStarted
        ).toBe(
          false
        );


        expect(
          result
            .notificationHandoff
            .owner
        ).toBe(
          "PHASE_23_3_NOTIFICATION_PLATFORM"
        );


        expect(
          result
            .notificationHandoff
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "missing target leaves HumanTask WAITING and does not invent a route",
      async () => {
        const h =
          harness({
            decision:
              decisionResult({
                selectedTarget:
                  null,
              }),
          });


        const result =
          await h
            .service
            .escalate(
              baseInput()
            );


        expect(
          h
            .humanOperationsRepository
            .updateTaskStatus
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            status:
              "WAITING",
          })
        );


        expect(
          h
            .humanOperationsRepository
            .createAssignment
        ).not.toHaveBeenCalled();


        expect(
          result.notificationHandoff
        ).toBeNull();


        expect(
          result.escalation.status
        ).toBe(
          ESCALATION_STATUS
            .DECIDED
        );


        expect(
          result
            .autonomousRecoveryBlocked
        ).toBe(
          true
        );
      }
    );


    test(
      "NO_ESCALATION persists decision without creating human work",
      async () => {
        const h =
          harness({
            decision:
              decisionResult({
                decision:
                  ESCALATION_DECISION
                    .NO_ESCALATION,

                matchedPolicy:
                  null,

                selectedTarget:
                  null,

                createHumanTask:
                  false,

                autonomousRecoveryBlocked:
                  false,
              }),
          });


        const result =
          await h
            .service
            .escalate(
              baseInput({
                reasonCode:
                  ESCALATION_REASON
                    .POLICY_ESCALATION,
              })
            );


        expect(
          h
            .escalationRepository
            .createEscalation
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          h
            .humanOperationsRepository
            .createTask
        ).not.toHaveBeenCalled();


        expect(
          h
            .humanOperationsRepository
            .createAssignment
        ).not.toHaveBeenCalled();


        expect(
          result
            .autonomousRecoveryBlocked
        ).toBe(
          false
        );


        expect(
          result
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "active escalation blocks autonomous continuation even if policy requested otherwise",
      async () => {
        const h =
          harness({
            decision:
              decisionResult({
                autonomousRecoveryBlocked:
                  false,
              }),
          });


        const result =
          await h
            .service
            .escalate(
              baseInput()
            );


        expect(
          result
            .autonomousRecoveryBlocked
        ).toBe(
          true
        );


        expect(
          result
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "task mappings use existing Phase-14 compatible task types",
      () => {
        expect(
          taskTypeFromReason(
            ESCALATION_REASON
              .APPROVAL_REQUIRED
          )
        ).toBe(
          "APPROVAL_REQUIRED"
        );


        expect(
          taskTypeFromReason(
            ESCALATION_REASON
              .RECOVERY_FAILED
          )
        ).toBe(
          "RECOVERY_FAILED"
        );


        expect(
          taskTypeFromReason(
            ESCALATION_REASON
              .VERIFICATION_FAILED
          )
        ).toBe(
          "VERIFICATION_REVIEW"
        );


        expect(
          taskTypeFromReason(
            ESCALATION_REASON
              .CONTROL_REQUIRED
          )
        ).toBe(
          "MANUAL_INTERVENTION"
        );
      }
    );


    test(
      "severity mapping stays inside canonical human-task priority enum",
      () => {
        expect(
          priorityFromSeverity(
            "critical"
          )
        ).toBe(
          "CRITICAL"
        );


        expect(
          priorityFromSeverity(
            "high"
          )
        ).toBe(
          "HIGH"
        );


        expect(
          priorityFromSeverity(
            "low"
          )
        ).toBe(
          "LOW"
        );


        expect(
          priorityFromSeverity(
            "warning"
          )
        ).toBe(
          "MEDIUM"
        );
      }
    );


    test(
      "requires canonical tenant and incident scope",
      async () => {
        const h =
          harness();


        await expect(
          h
            .service
            .escalate({
              environmentId:
                "env-test",

              incidentId:
                "inc-1",
            })
        ).rejects.toMatchObject({
          code:
            "HUMAN_ESCALATION_ORGANIZATION_REQUIRED",

          executionAuthorized:
            false,
        });


        await expect(
          h
            .service
            .escalate({
              organizationId:
                "org-test",

              environmentId:
                "env-test",
            })
        ).rejects.toMatchObject({
          code:
            "HUMAN_ESCALATION_INCIDENT_REQUIRED",

          executionAuthorized:
            false,
        });
      }
    );
  }
);