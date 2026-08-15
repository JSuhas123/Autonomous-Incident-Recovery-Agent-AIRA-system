"use strict";

const {
  RollbackHandoffOrchestrator,
  ROLLBACK_HANDOFF_STATUS,
} =
  require(
    "../rollbackHandoffOrchestrator"
  );

const {
  INCIDENT_LIFECYCLE_STATE,
} =
  require(
    "../incidentLifecycleContracts"
  );

function baseInput(
  overrides = {}
) {
  return {
    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "incident-1",

    verificationId:
      "verification-1",

    recoveryDecisionId:
      "recovery-1",

    executionRequestId:
      "execution-1",

    executionPlanId:
      "plan-1",

    executionPlanHash:
      "planhash-1",

    authorizationId:
      "auth-1",

    rollbackPlanId:
      "rollback-plan-1",

    routingResult: {
      route:
        "REQUEST_ROLLBACK",
    },

    criticResult: {
      accepted:
        true,

      rejected:
        false,

      requiresManualReview:
        false,
    },

    rollbackAvailable:
      true,

    incident: {
      lifecycleState:
        INCIDENT_LIFECYCLE_STATE
          .REGRESSED,

      status:
        INCIDENT_LIFECYCLE_STATE
          .REGRESSED,
    },

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "RollbackHandoffOrchestrator",
  () => {
    test(
      "creates fresh rollback request",
      async () => {
        const service =
          new RollbackHandoffOrchestrator();

        const result =
          await service
            .prepareRollback(
              baseInput()
            );

        expect(
          result.status
        )
          .toBe(
            ROLLBACK_HANDOFF_STATUS
              .READY
          );

        expect(
          result.rollbackRequest
            .originalExecutionRequestId
        )
          .toBe(
            "execution-1"
          );

        expect(
          result.rollbackRequest
            .originalExecutionPlanHash
        )
          .toBe(
            "planhash-1"
          );

        expect(
          result.rollbackRequest
            .requiresFreshAuthorization
        )
          .toBe(
            true
          );

        expect(
          result.rollbackRequest
            .previousAuthorizationReusable
        )
          .toBe(
            false
          );
      }
    );

    test(
      "transitions incident to rollback pending",
      async () => {
        const service =
          new RollbackHandoffOrchestrator();

        const result =
          await service
            .prepareRollback(
              baseInput()
            );

        expect(
          result.transition
            .toState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .ROLLBACK_PENDING
          );
      }
    );

    test(
      "queues rollback when provider exists",
      async () => {
        const enqueue =
          jest.fn();

        const service =
          new RollbackHandoffOrchestrator();

        const result =
          await service
            .prepareRollback(
              baseInput(),
              {
                enqueueRollbackRequest:
                  enqueue,
              }
            );

        expect(
          enqueue
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result.rollbackQueued
        )
          .toBe(
            true
          );
      }
    );

    test(
      "does not execute rollback directly",
      async () => {
        const service =
          new RollbackHandoffOrchestrator();

        const result =
          await service
            .prepareRollback(
              baseInput()
            );

        expect(
          result.rollbackStarted
        )
          .toBe(
            false
          );

        expect(
          result.executionStarted
        )
          .toBe(
            false
          );
      }
    );

    test(
      "blocks when verification did not request rollback",
      async () => {
        const service =
          new RollbackHandoffOrchestrator();

        const result =
          await service
            .prepareRollback(
              baseInput({
                routingResult: {
                  route:
                    "REQUEST_RETRY",
                },
              })
            );

        expect(
          result.status
        )
          .toBe(
            ROLLBACK_HANDOFF_STATUS
              .BLOCKED
          );
      }
    );

    test(
      "returns unavailable when no rollback exists",
      async () => {
        const service =
          new RollbackHandoffOrchestrator();

        const result =
          await service
            .prepareRollback(
              baseInput({
                rollbackAvailable:
                  false,
              })
            );

        expect(
          result.status
        )
          .toBe(
            ROLLBACK_HANDOFF_STATUS
              .UNAVAILABLE
          );

        expect(
          result.ready
        )
          .toBe(
            false
          );
      }
    );

    test(
      "critic rejection blocks rollback handoff",
      async () => {
        const service =
          new RollbackHandoffOrchestrator();

        const result =
          await service
            .prepareRollback(
              baseInput({
                criticResult: {
                  rejected:
                    true,

                  requiresManualReview:
                    false,
                },
              })
            );

        expect(
          result.ready
        )
          .toBe(
            false
          );
      }
    );

    test(
      "critic manual review blocks automated rollback",
      async () => {
        const service =
          new RollbackHandoffOrchestrator();

        const result =
          await service
            .prepareRollback(
              baseInput({
                criticResult: {
                  rejected:
                    false,

                  requiresManualReview:
                    true,
                },
              })
            );

        expect(
          result.status
        )
          .toBe(
            ROLLBACK_HANDOFF_STATUS
              .BLOCKED
          );
      }
    );

    test(
      "requires immutable original execution identity",
      async () => {
        const service =
          new RollbackHandoffOrchestrator();

        const input =
          baseInput();

        delete input
          .executionPlanHash;

        const result =
          await service
            .prepareRollback(
              input
            );

        expect(
          result.ready
        )
          .toBe(
            false
          );
      }
    );

    test(
      "uses external incident provider",
      async () => {
        const service =
          new RollbackHandoffOrchestrator();

        const input =
          baseInput();

        delete input.incident;

        const getIncident =
          jest.fn(
            async () => ({
              lifecycleState:
                INCIDENT_LIFECYCLE_STATE
                  .REGRESSED,
            })
          );

        const result =
          await service
            .prepareRollback(
              input,
              {
                getIncident,
              }
            );

        expect(
          result.ready
        )
          .toBe(
            true
          );

        expect(
          getIncident
        )
          .toHaveBeenCalled();
      }
    );

    test(
      "generates unique rollback request IDs",
      () => {
        const service =
          new RollbackHandoffOrchestrator();

        const first =
          service
            .generateRollbackRequestId(
              baseInput()
            );

        const second =
          service
            .generateRollbackRequestId(
              baseInput()
            );

        expect(
          first
        )
          .toMatch(
            /^rollback_/
          );

        expect(
          first
        )
          .not
          .toBe(
            second
          );
      }
    );

    test(
      "rollback request never carries execution authorization",
      async () => {
        const service =
          new RollbackHandoffOrchestrator();

        const result =
          await service
            .prepareRollback(
              baseInput()
            );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.rollbackRequest
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "rejects unsafe execution authorization input",
      async () => {
        const service =
          new RollbackHandoffOrchestrator();

        await expect(
          service.prepareRollback({
            ...baseInput(),

            executionAuthorized:
              true,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "ROLLBACK_HANDOFF_UNSAFE_INPUT",
          });
      }
    );
  }
);