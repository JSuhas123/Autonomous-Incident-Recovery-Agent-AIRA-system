"use strict";

const {
  WorkflowOutboxComposition,
  createWorkflowOutboxComposition,
  WORKFLOW_OUTBOX_TOPIC,
  WORKFLOW_OUTBOX_QUEUE,
} =
  require(
    "../workflowOutboxComposition"
  );

const {
  OUTBOX_EVENT_TYPE,
} =
  require(
    "../workflowOutboxContracts"
  );


describe(
  "WorkflowOutboxComposition",
  () => {
    let queueService;

    beforeEach(
      () => {
        queueService = {
          publishEvent:
            jest.fn()
              .mockResolvedValue({
                eventId:
                  "broker-event-1",

                correlationId:
                  "correlation-1",
              }),
        };
      }
    );


    test(
      "requires queue service",
      () => {
        expect(
          () =>
            new WorkflowOutboxComposition()
        )
          .toThrow(
            expect.objectContaining({
              code:
                "OUTBOX_QUEUE_SERVICE_REQUIRED",
            })
          );
      }
    );


    test(
      "builds complete outbox dependency graph",
      () => {
        const components =
          createWorkflowOutboxComposition({
            queueService,

            workerId:
              "outbox-worker-1",
          });

        expect(
          components.routingRegistry
        )
          .toBeDefined();

        expect(
          components.dispatcher
        )
          .toBeDefined();

        expect(
          components.deliveryCoordinator
        )
          .toBeDefined();

        expect(
          components.worker
        )
          .toBeDefined();

        expect(
          components.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "registers execution verification and lifecycle routes",
      () => {
        const components =
          createWorkflowOutboxComposition({
            queueService,
          });

        expect(
          components.publishers[
            OUTBOX_EVENT_TYPE
              .EXECUTION_REQUEST_READY
          ]
        )
          .toBeDefined();

        expect(
          components.publishers[
            OUTBOX_EVENT_TYPE
              .VERIFICATION_REQUESTED
          ]
        )
          .toBeDefined();

        expect(
          components.publishers[
            OUTBOX_EVENT_TYPE
              .LIFECYCLE_REQUESTED
          ]
        )
          .toBeDefined();
      }
    );


    test(
      "build is idempotent inside one composition instance",
      () => {
        const composition =
          new WorkflowOutboxComposition({
            queueService,
          });

        const first =
          composition.build();

        const second =
          composition.build();

        expect(
          first
        )
          .toBe(
            second
          );

        expect(
          first.worker
        )
          .toBe(
            second.worker
          );
      }
    );


    test(
      "execution stage publishes using infrastructure queue service",
      async () => {
        const composition =
          new WorkflowOutboxComposition({
            queueService,
          });

        const publisher =
          composition
            .createStagePublisher({
              stage:
                "execution",

              topic:
                WORKFLOW_OUTBOX_TOPIC
                  .EXECUTION,
            });

        const result =
          await publisher({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            incidentId:
              "incident-1",

            executionRequestId:
              "execution-request-1",

            executionPlanId:
              "plan-1",

            executionPlanHash:
              "hash-1",

            correlationId:
              "correlation-1",

            executionAuthorized:
              false,
          });

        expect(
          queueService
            .publishEvent
        )
          .toHaveBeenCalledWith(
            WORKFLOW_OUTBOX_TOPIC
              .EXECUTION,

            expect.objectContaining({
              executionRequestId:
                "execution-request-1",

              executionAuthorized:
                false,
            }),

            expect.objectContaining({
              tenantId:
                "org-1",

              correlationId:
                "correlation-1",

              priority:
                8,
            })
          );

        expect(
          result.messageId
        )
          .toBe(
            "broker-event-1"
          );

        expect(
          result.queue
        )
          .toBe(
            WORKFLOW_OUTBOX_QUEUE
              .EXECUTION
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
      "verification stage uses verification workflow topic",
      async () => {
        const composition =
          new WorkflowOutboxComposition({
            queueService,
          });

        const publisher =
          composition
            .createStagePublisher({
              stage:
                "verification",

              topic:
                WORKFLOW_OUTBOX_TOPIC
                  .VERIFICATION,
            });

        await publisher({
          organizationId:
            "org-1",

          environmentId:
            "prod",

          incidentId:
            "incident-1",

          executionRequestId:
            "execution-request-1",

          verificationId:
            "verification-1",

          executionAuthorized:
            false,
        });

        expect(
          queueService.publishEvent
        )
          .toHaveBeenCalledWith(
            WORKFLOW_OUTBOX_TOPIC
              .VERIFICATION,

            expect.any(
              Object
            ),

            expect.objectContaining({
              priority:
                7,
            })
          );
      }
    );


    test(
      "lifecycle stage uses lifecycle workflow topic",
      async () => {
        const composition =
          new WorkflowOutboxComposition({
            queueService,
          });

        const publisher =
          composition
            .createStagePublisher({
              stage:
                "lifecycle",

              topic:
                WORKFLOW_OUTBOX_TOPIC
                  .LIFECYCLE,
            });

        await publisher({
          organizationId:
            "org-1",

          environmentId:
            "prod",

          incidentId:
            "incident-1",

          executionRequestId:
            "execution-request-1",

          verificationId:
            "verification-1",

          executionAuthorized:
            false,
        });

        expect(
          queueService.publishEvent
        )
          .toHaveBeenCalledWith(
            WORKFLOW_OUTBOX_TOPIC
              .LIFECYCLE,

            expect.any(
              Object
            ),

            expect.objectContaining({
              priority:
                6,
            })
          );
      }
    );


    test(
      "transport refuses execution authority",
      async () => {
        const composition =
          new WorkflowOutboxComposition({
            queueService,
          });

        const publisher =
          composition
            .createStagePublisher({
              stage:
                "execution",

              topic:
                WORKFLOW_OUTBOX_TOPIC
                  .EXECUTION,
            });

        await expect(
          publisher({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            incidentId:
              "incident-1",

            executionAuthorized:
              true,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_UNSAFE_AUTHORITY",
          });

        expect(
          queueService.publishEvent
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "transport refuses authorizationGranted",
      async () => {
        const composition =
          new WorkflowOutboxComposition({
            queueService,
          });

        const publisher =
          composition
            .createStagePublisher({
              stage:
                "execution",

              topic:
                WORKFLOW_OUTBOX_TOPIC
                  .EXECUTION,
            });

        await expect(
          publisher({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            incidentId:
              "incident-1",

            authorizationGranted:
              true,

            executionAuthorized:
              false,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_UNSAFE_AUTHORITY",
          });
      }
    );


    test(
      "queue publication failure propagates to retry coordinator",
      async () => {
        queueService
          .publishEvent
          .mockRejectedValue(
            Object.assign(
              new Error(
                "RabbitMQ unavailable"
              ),
              {
                code:
                  "ECONNREFUSED",
              }
            )
          );

        const composition =
          new WorkflowOutboxComposition({
            queueService,
          });

        const publisher =
          composition
            .createStagePublisher({
              stage:
                "execution",

              topic:
                WORKFLOW_OUTBOX_TOPIC
                  .EXECUTION,
            });

        await expect(
          publisher({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            incidentId:
              "incident-1",

            executionRequestId:
              "execution-request-1",

            executionAuthorized:
              false,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "ECONNREFUSED",
          });
      }
    );


    test(
      "correlation falls back to execution request identity",
      async () => {
        const composition =
          new WorkflowOutboxComposition({
            queueService,
          });

        const publisher =
          composition
            .createStagePublisher({
              stage:
                "verification",

              topic:
                WORKFLOW_OUTBOX_TOPIC
                  .VERIFICATION,
            });

        await publisher({
          organizationId:
            "org-1",

          environmentId:
            "prod",

          incidentId:
            "incident-1",

          executionRequestId:
            "execution-request-1",

          executionAuthorized:
            false,
        });

        expect(
          queueService.publishEvent
        )
          .toHaveBeenCalledWith(
            expect.any(
              String
            ),

            expect.any(
              Object
            ),

            expect.objectContaining({
              correlationId:
                "execution-request-1",
            })
          );
      }
    );
  }
);