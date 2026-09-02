"use strict";


jest.mock(
  "../../services/humanOperations/humanEscalationOrchestratorService",

  () => ({
    HumanEscalationOrchestratorService:
      class HumanEscalationOrchestratorService {},
  })
);


const {
  HumanEscalationReliabilityService,
  deterministicEscalationPublicId,
  selectRetryTarget,
} = require(
  "../../services/humanOperations/humanEscalationReliabilityService"
);


const {
  ESCALATION_DECISION,
  ESCALATION_STATUS,
  ON_CALL_TARGET_TYPE,
} = require(
  "../../constants/humanEscalation"
);


describe(
  "Phase 23.2C escalation reliability",

  () => {
    test(
      "deterministic idempotency identity is stable per tenant scope",

      () => {
        const input = {
          organizationId:
            "org-a",

          environmentId:
            "env-a",

          idempotencyKey:
            "incident-1:RECOVERY_UNSAFE",
        };


        expect(
          deterministicEscalationPublicId(
            input
          )
        ).toBe(
          deterministicEscalationPublicId(
            input
          )
        );


        expect(
          deterministicEscalationPublicId({
            ...input,

            environmentId:
              "env-b",
          })
        ).not.toBe(
          deterministicEscalationPublicId(
            input
          )
        );
      }
    );


    test(
      "idempotent replay does not rerun orchestration",

      async () => {
        const existing = {
          id:
            "esc-db",

          publicId:
            deterministicEscalationPublicId({
              organizationId:
                "org-a",

              environmentId:
                "env-a",

              idempotencyKey:
                "idem-1",
            }),

          incidentId:
            "inc-1",

          decision:
            ESCALATION_DECISION
              .ESCALATE,

          reasonCode:
            "RECOVERY_UNSAFE",

          triggerSource:
            "RECOVERY_ENGINE",

          status:
            ESCALATION_STATUS
              .WAITING_ACK,

          executionAuthorized:
            false,
        };


        const escalationRepository = {
          getEscalation:
            jest
              .fn()
              .mockResolvedValue(
                existing
              ),

          listTargets:
            jest.fn(),

          listPolicies:
            jest.fn(),
        };


        const runtimeRepository = {
          getTaskByEscalationPublicId:
            jest
              .fn()
              .mockResolvedValue({
                id:
                  "task-db",

                publicId:
                  "htask-1",

                status:
                  "ASSIGNED",

                executionAuthorized:
                  false,
              }),
        };


        const orchestratorFactory =
          jest.fn();


        const service =
          new HumanEscalationReliabilityService({
            escalationRepository,

            runtimeRepository,

            humanOperationsRepository:
              {},

            decisionService:
              {},

            orchestratorFactory,
          });


        const result =
          await service
            .escalate({
              organizationId:
                "org-a",

              environmentId:
                "env-a",

              incidentId:
                "inc-1",

              idempotencyKey:
                "idem-1",
            });


        expect(
          result
            .idempotentReplay
        ).toBe(
          true
        );


        expect(
          result
            .task
            .publicId
        ).toBe(
          "htask-1"
        );


        expect(
          result
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          orchestratorFactory
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "new escalation initializes delivery attempt state",

      async () => {
        const escalationRepository = {
          getEscalation:
            jest
              .fn()
              .mockResolvedValue(
                null
              ),

          listPolicies:
            jest.fn(),

          listTargets:
            jest.fn(),

          createEscalation:
            jest.fn(),

          updateEscalationStatus:
            jest.fn(),
        };


        const runtimeRepository = {
          initializeRuntime:
            jest
              .fn()
              .mockResolvedValue({
                publicId:
                  "esc-1",

                deliveryAttemptCount:
                  1,

                maxDeliveryAttempts:
                  5,

                executionAuthorized:
                  false,
              }),
        };


        const orchestrator = {
          escalate:
            jest
              .fn()
              .mockResolvedValue({
                decision: {
                  decision:
                    ESCALATION_DECISION
                      .ESCALATE,

                  matchedPolicy: {
                    maxDeliveryAttempts:
                      5,
                  },
                },

                escalation: {
                  publicId:
                    "esc-1",
                },

                task: {
                  publicId:
                    "task-1",
                },

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new HumanEscalationReliabilityService({
            escalationRepository,

            runtimeRepository,

            humanOperationsRepository:
              {},

            decisionService:
              {},

            orchestratorFactory:
              jest.fn(
                () =>
                  orchestrator
              ),
          });


        const result =
          await service
            .escalate({
              organizationId:
                "org-a",

              environmentId:
                "env-a",

              incidentId:
                "inc-1",

              idempotencyKey:
                "idem-new",
            });


        expect(
          runtimeRepository
            .initializeRuntime
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            maxDeliveryAttempts:
              5,
          })
        );


        expect(
          result
            .idempotentReplay
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
      "retry target advances deterministically then retries final target",

      () => {
        const targets = [
          {
            id:
              "t2",

            publicId:
              "target-b",

            priority:
              20,

            enabled:
              true,
          },

          {
            id:
              "t1",

            publicId:
              "target-a",

            priority:
              10,

            enabled:
              true,
          },
        ];


        expect(
          selectRetryTarget(
            targets,
            "t1"
          ).id
        ).toBe(
          "t2"
        );


        expect(
          selectRetryTarget(
            targets,
            "t2"
          ).id
        ).toBe(
          "t2"
        );
      }
    );


    test(
      "ack timeout reassigns to next USER target and prepares Phase 23.3 handoff",

      async () => {
        const runtimeRepository = {
          getByPublicId:
            jest
              .fn()
              .mockResolvedValue({
                id:
                  "esc-db",

                publicId:
                  "esc-1",

                incidentId:
                  "inc-1",

                taskId:
                  "task-db",

                selectedTargetId:
                  "target-1-db",

                status:
                  ESCALATION_STATUS
                    .WAITING_ACK,

                acknowledgementDeadline:
                  new Date(
                    Date.now() -
                    1000
                  )
                    .toISOString(),

                deliveryAttemptCount:
                  1,

                maxDeliveryAttempts:
                  3,

                policyId:
                  null,
              }),


          recordRetry:
            jest
              .fn()
              .mockResolvedValue({
                publicId:
                  "esc-1",

                incidentId:
                  "inc-1",

                status:
                  ESCALATION_STATUS
                    .WAITING_ACK,

                deliveryAttemptCount:
                  2,

                acknowledgementDeadline:
                  new Date(
                    Date.now() +
                    900000
                  )
                    .toISOString(),

                executionAuthorized:
                  false,
              }),
        };


        const escalationRepository = {
          listTargets:
            jest
              .fn()
              .mockResolvedValue([
                {
                  id:
                    "target-1-db",

                  publicId:
                    "target-1",

                  targetType:
                    ON_CALL_TARGET_TYPE
                      .USER,

                  targetUserId:
                    "user-1",

                  priority:
                    10,

                  enabled:
                    true,
                },

                {
                  id:
                    "target-2-db",

                  publicId:
                    "target-2",

                  targetType:
                    ON_CALL_TARGET_TYPE
                      .USER,

                  targetUserId:
                    "user-2",

                  priority:
                    20,

                  enabled:
                    true,
                },
              ]),

          listPolicies:
            jest
              .fn()
              .mockResolvedValue(
                []
              ),
        };


        const humanOperationsRepository = {
          getTask:
            jest
              .fn()
              .mockResolvedValue({
                id:
                  "task-db",

                publicId:
                  "task-1",

                status:
                  "ASSIGNED",
              }),

          createAssignment:
            jest
              .fn()
              .mockResolvedValue({
                publicId:
                  "assignment-2",

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new HumanEscalationReliabilityService({
            escalationRepository,

            runtimeRepository,

            humanOperationsRepository,

            decisionService:
              {},

            orchestratorFactory:
              jest.fn(),
          });


        const result =
          await service
            .processAcknowledgementTimeout({
              organizationId:
                "org-a",

              environmentId:
                "env-a",

              escalationId:
                "esc-1",
            });


        expect(
          runtimeRepository
            .recordRetry
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            targetId:
              "target-2",
          })
        );


        expect(
          humanOperationsRepository
            .createAssignment
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            assignedUserId:
              "user-2",
          })
        );


        expect(
          result.action
        ).toBe(
          "RETRY_SCHEDULED"
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
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "retry exhaustion blocks autonomy and leaves task waiting for human review",

      async () => {
        const runtimeRepository = {
          getByPublicId:
            jest
              .fn()
              .mockResolvedValue({
                publicId:
                  "esc-1",

                incidentId:
                  "inc-1",

                taskId:
                  "task-db",

                status:
                  ESCALATION_STATUS
                    .WAITING_ACK,

                acknowledgementDeadline:
                  new Date(
                    Date.now() -
                    1000
                  )
                    .toISOString(),

                deliveryAttemptCount:
                  3,

                maxDeliveryAttempts:
                  3,
              }),


          markRetryExhausted:
            jest
              .fn()
              .mockResolvedValue({
                publicId:
                  "esc-1",

                status:
                  ESCALATION_STATUS
                    .FAILED,

                executionAuthorized:
                  false,
              }),
        };


        const humanOperationsRepository = {
          getTask:
            jest
              .fn()
              .mockResolvedValue({
                id:
                  "task-db",

                publicId:
                  "task-1",

                status:
                  "ASSIGNED",
              }),

          updateTaskStatus:
            jest
              .fn()
              .mockResolvedValue({
                publicId:
                  "task-1",

                status:
                  "WAITING",

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new HumanEscalationReliabilityService({
            escalationRepository:
              {},

            runtimeRepository,

            humanOperationsRepository,

            decisionService:
              {},

            orchestratorFactory:
              jest.fn(),
          });


        const result =
          await service
            .processAcknowledgementTimeout({
              organizationId:
                "org-a",

              environmentId:
                "env-a",

              escalationId:
                "esc-1",
            });


        expect(
          result.action
        ).toBe(
          "RETRY_EXHAUSTED"
        );


        expect(
          result
            .autonomousRecoveryBlocked
        ).toBe(
          true
        );


        expect(
          result
            .requiresHumanReview
        ).toBe(
          true
        );


        expect(
          result
            .task
            .status
        ).toBe(
          "WAITING"
        );


        expect(
          result
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );
  }
);