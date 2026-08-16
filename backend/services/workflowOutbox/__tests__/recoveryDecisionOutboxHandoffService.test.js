"use strict";

const {
  RecoveryDecisionOutboxHandoffService,
} =
  require(
    "../recoveryDecisionOutboxHandoffService"
  );

const {
  OUTBOX_EVENT_TYPE,
  OUTBOX_AGGREGATE_TYPE,
} =
  require(
    "../workflowOutboxContracts"
  );

describe(
  "RecoveryDecisionOutboxHandoffService",
  () => {
    let outbox;
    let service;

    beforeEach(
      () => {
        outbox = {
          createOrGet:
            jest.fn()
              .mockResolvedValue({
                created:
                  true,

                duplicate:
                  false,

                event: {
                  eventId:
                    "outbox-event-1",

                  eventKey:
                    "outbox-key-1",
                },
              }),
        };

        service =
          new RecoveryDecisionOutboxHandoffService({
            outbox,
          });
      }
    );

    function baseInput(
      overrides = {}
    ) {
      return {
        organizationId:
          "org-1",

        environmentId:
          "prod",

        incidentId:
          "incident-1",

        recoveryDecisionId:
          "recovery-decision-1",

        executionRequestId:
          "execution-request-1",

        executionPlanId:
          "execution-plan-1",

        executionPlanHash:
          "execution-plan-hash-1",

        authorizationId:
          "authorization-1",

        selectedPlaybookId:
          "playbook-1",

        correlationId:
          "correlation-1",

        ...overrides,
      };
    }

    test(
      "persists execution request ready handoff",
      async () => {
        const result =
          await service
            .createExecutionRequestReady(
              baseInput()
            );

        expect(
          outbox.createOrGet
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          outbox.createOrGet
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              organizationId:
                "org-1",

              environmentId:
                "prod",

              incidentId:
                "incident-1",

              aggregateType:
                OUTBOX_AGGREGATE_TYPE
                  .EXECUTION_REQUEST,

              aggregateId:
                "execution-request-1",

              eventType:
                OUTBOX_EVENT_TYPE
                  .EXECUTION_REQUEST_READY,
            })
          );

        expect(
          result.persisted
        )
          .toBe(
            true
          );

        expect(
          result.created
        )
          .toBe(
            true
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "handoff payload carries immutable execution identity",
      async () => {
        await service
          .createExecutionRequestReady(
            baseInput()
          );

        const request =
          outbox
            .createOrGet
            .mock
            .calls[0][0];

        expect(
          request.payload
        )
          .toMatchObject({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            incidentId:
              "incident-1",

            recoveryDecisionId:
              "recovery-decision-1",

            executionRequestId:
              "execution-request-1",

            executionPlanId:
              "execution-plan-1",

            executionPlanHash:
              "execution-plan-hash-1",
          });
      }
    );

    test(
      "authorization id is transported only as reference",
      async () => {
        await service
          .createExecutionRequestReady(
            baseInput()
          );

        const request =
          outbox
            .createOrGet
            .mock
            .calls[0][0];

        expect(
          request.payload
            .authorizationId
        )
          .toBe(
            "authorization-1"
          );

        expect(
          request.payload
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          request.payload
            .authorizationGranted
        )
          .toBeUndefined();
      }
    );

    test(
      "does not manufacture execution authority",
      async () => {
        await service
          .createExecutionRequestReady(
            baseInput()
          );

        const request =
          outbox
            .createOrGet
            .mock
            .calls[0][0];

        expect(
          request.payload
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "uses deterministic transition identity",
      async () => {
        await service
          .createExecutionRequestReady(
            baseInput()
          );

        const request =
          outbox
            .createOrGet
            .mock
            .calls[0][0];

        expect(
          request.transitionId
        )
          .toBe(
            "recovery-decision:recovery-decision-1:execution-ready"
          );
      }
    );

    test(
      "duplicate durable handoff is returned safely",
      async () => {
        outbox
          .createOrGet
          .mockResolvedValue({
            created:
              false,

            duplicate:
              true,

            event: {
              eventId:
                "existing-event-1",

              eventKey:
                "existing-key-1",
            },
          });

        const result =
          await service
            .createExecutionRequestReady(
              baseInput()
            );

        expect(
          result.created
        )
          .toBe(
            false
          );

        expect(
          result.duplicate
        )
          .toBe(
            true
          );

        expect(
          result.eventId
        )
          .toBe(
            "existing-event-1"
          );
      }
    );

    test(
      "preserves concurrent creation race result",
      async () => {
        outbox
          .createOrGet
          .mockResolvedValue({
            created:
              false,

            duplicate:
              true,

            raced:
              true,

            event: {
              eventId:
                "winning-event",

              eventKey:
                "winning-key",
            },
          });

        const result =
          await service
            .createExecutionRequestReady(
              baseInput()
            );

        expect(
          result.raced
        )
          .toBe(
            true
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "missing execution request id fails closed",
      async () => {
        await expect(
          service
            .createExecutionRequestReady(
              baseInput({
                executionRequestId:
                  null,
              })
            )
        )
          .rejects
          .toMatchObject({
            code:
              "RECOVERY_DECISION_OUTBOX_HANDOFF_SCOPE_REQUIRED",

            field:
              "executionRequestId",
          });

        expect(
          outbox.createOrGet
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "missing execution plan id fails closed",
      async () => {
        await expect(
          service
            .createExecutionRequestReady(
              baseInput({
                executionPlanId:
                  null,
              })
            )
        )
          .rejects
          .toMatchObject({
            field:
              "executionPlanId",
          });
      }
    );

    test(
      "missing execution plan hash fails closed",
      async () => {
        await expect(
          service
            .createExecutionRequestReady(
              baseInput({
                executionPlanHash:
                  null,
              })
            )
        )
          .rejects
          .toMatchObject({
            field:
              "executionPlanHash",
          });
      }
    );

    test(
      "missing recovery decision id fails closed",
      async () => {
        await expect(
          service
            .createExecutionRequestReady(
              baseInput({
                recoveryDecisionId:
                  null,
              })
            )
        )
          .rejects
          .toMatchObject({
            field:
              "recoveryDecisionId",
          });
      }
    );

    test(
      "missing tenant scope fails closed",
      async () => {
        await expect(
          service
            .createExecutionRequestReady(
              baseInput({
                organizationId:
                  null,
              })
            )
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_TENANT_SCOPE_REQUIRED",

            field:
              "organizationId",
          });
      }
    );

    test(
      "correlation defaults to execution request id",
      async () => {
        await service
          .createExecutionRequestReady(
            baseInput({
              correlationId:
                null,
            })
          );

        const request =
          outbox
            .createOrGet
            .mock
            .calls[0][0];

        expect(
          request.payload
            .correlationId
        )
          .toBe(
            "execution-request-1"
          );
      }
    );
  }
);