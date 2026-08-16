"use strict";

const {
  WorkflowOutboxRoutingRegistry,
} =
  require(
    "../workflowOutboxRoutingRegistry"
  );

const {
  OUTBOX_EVENT_TYPE,
} =
  require(
    "../workflowOutboxContracts"
  );

describe(
  "WorkflowOutboxRoutingRegistry",
  () => {
    function baseMessage(
      payload = {}
    ) {
      return {
        messageId:
          "message-1",

        outboxEventId:
          "outbox-1",

        outboxEventKey:
          "outbox-key-1",

        executionAuthorized:
          false,

        payload: {
          organizationId:
            "org-1",

          environmentId:
            "prod",

          incidentId:
            "incident-1",

          executionAuthorized:
            false,

          ...payload,
        },
      };
    }

    test(
      "registers all three critical workflow routes",
      () => {
        const registry =
          new WorkflowOutboxRoutingRegistry({
            executionPublisher:
              jest.fn(),

            verificationPublisher:
              jest.fn(),

            lifecyclePublisher:
              jest.fn(),
          });

        const publishers =
          registry
            .createPublishers();

        expect(
          publishers[
            OUTBOX_EVENT_TYPE
              .EXECUTION_REQUEST_READY
          ]
        )
          .toBeDefined();

        expect(
          publishers[
            OUTBOX_EVENT_TYPE
              .VERIFICATION_REQUESTED
          ]
        )
          .toBeDefined();

        expect(
          publishers[
            OUTBOX_EVENT_TYPE
              .LIFECYCLE_REQUESTED
          ]
        )
          .toBeDefined();
      }
    );


    test(
      "execution route preserves immutable execution identity",
      async () => {
        const executionPublisher =
          jest.fn()
            .mockResolvedValue({
              messageId:
                "execution-message",
            });

        const registry =
          new WorkflowOutboxRoutingRegistry({
            executionPublisher,
          });

        const route =
          registry
            .createExecutionRoute();

        await route.publish(
          baseMessage({
            executionRequestId:
              "execution-request-1",

            executionPlanId:
              "plan-1",

            executionPlanHash:
              "hash-1",

            authorizationId:
              "authorization-1",
          })
        );

        expect(
          executionPublisher
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              executionRequestId:
                "execution-request-1",

              executionPlanId:
                "plan-1",

              executionPlanHash:
                "hash-1",

              authorizationId:
                "authorization-1",

              executionAuthorized:
                false,
            })
          );
      }
    );


    test(
      "authorization reference never becomes authorization grant",
      async () => {
        const executionPublisher =
          jest.fn()
            .mockResolvedValue({});

        const registry =
          new WorkflowOutboxRoutingRegistry({
            executionPublisher,
          });

        const route =
          registry
            .createExecutionRoute();

        await route.publish(
          baseMessage({
            executionRequestId:
              "execution-request-1",

            executionPlanId:
              "plan-1",

            executionPlanHash:
              "hash-1",

            authorizationId:
              "authorization-1",
          })
        );

        const job =
          executionPublisher
            .mock
            .calls[0][0];

        expect(
          job.authorizationId
        )
          .toBe(
            "authorization-1"
          );

        expect(
          job.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          job.authorizationGranted
        )
          .toBeUndefined();
      }
    );


    test(
      "verification route creates protected verification job",
      async () => {
        const verificationPublisher =
          jest.fn()
            .mockResolvedValue({});

        const registry =
          new WorkflowOutboxRoutingRegistry({
            verificationPublisher,
          });

        await registry
          .createVerificationRoute()
          .publish(
            baseMessage({
              executionRequestId:
                "execution-request-1",

              executionPlanId:
                "execution-plan-1",

              executionPlanHash:
                "execution-hash-1",

              verificationId:
                "verification-1",

              verificationPlanId:
                "verification-plan-1",

              verificationPlanHash:
                "verification-hash-1",
            })
          );

        expect(
          verificationPublisher
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              executionRequestId:
                "execution-request-1",

              verificationId:
                "verification-1",

              verificationPlanId:
                "verification-plan-1",

              verificationPlanHash:
                "verification-hash-1",

              executionAuthorized:
                false,
            })
          );
      }
    );


    test(
      "verification route fails closed without immutable verification plan identity",
      async () => {
        const registry =
          new WorkflowOutboxRoutingRegistry({
            verificationPublisher:
              jest.fn(),
          });

        await expect(
          registry
            .createVerificationRoute()
            .publish(
              baseMessage({
                executionRequestId:
                  "execution-request-1",

                executionPlanId:
                  "execution-plan-1",

                executionPlanHash:
                  "execution-hash-1",

                verificationId:
                  "verification-1",
              })
            )
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_VERIFICATION_IDENTITY_REQUIRED",
          });
      }
    );


    test(
      "lifecycle route uses canonical lifecycle job adapter",
      async () => {
        const lifecyclePublisher =
          jest.fn()
            .mockResolvedValue({});

        const lifecycleJobAdapter = {
          buildJob:
            jest.fn()
              .mockReturnValue({
                organizationId:
                  "org-1",

                environmentId:
                  "prod",

                incidentId:
                  "incident-1",

                verificationId:
                  "verification-1",

                executionAuthorized:
                  false,
              }),
        };

        const registry =
          new WorkflowOutboxRoutingRegistry({
            lifecyclePublisher,

            lifecycleJobAdapter,
          });

        const message =
          baseMessage({
            executionRequestId:
              "execution-request-1",

            verificationId:
              "verification-1",
          });

        await registry
          .createLifecycleRoute()
          .publish(
            message
          );

        expect(
          lifecycleJobAdapter
            .buildJob
        )
          .toHaveBeenCalledWith(
            message
          );

        expect(
          lifecyclePublisher
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              verificationId:
                "verification-1",

              executionAuthorized:
                false,
            })
          );
      }
    );


    test(
      "supports queue service publishRequested contract",
      async () => {
        const queueService = {
          publishRequested:
            jest.fn()
              .mockResolvedValue({
                messageId:
                  "queue-message-1",
              }),
        };

        const registry =
          new WorkflowOutboxRoutingRegistry({
            executionPublisher:
              queueService,
          });

        await registry
          .createExecutionRoute()
          .publish(
            baseMessage({
              executionRequestId:
                "execution-request-1",

              executionPlanId:
                "plan-1",

              executionPlanHash:
                "hash-1",
            })
          );

        expect(
          queueService
            .publishRequested
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );


    test(
      "missing publisher fails closed",
      async () => {
        const registry =
          new WorkflowOutboxRoutingRegistry();

        await expect(
          registry
            .createExecutionRoute()
            .publish(
              baseMessage({
                executionRequestId:
                  "execution-request-1",

                executionPlanId:
                  "plan-1",

                executionPlanHash:
                  "hash-1",
              })
            )
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_ROUTE_PUBLISHER_NOT_CONFIGURED",

            stage:
              "execution",
          });
      }
    );


    test(
      "outbox route rejects payload execution authority",
      async () => {
        const registry =
          new WorkflowOutboxRoutingRegistry({
            executionPublisher:
              jest.fn(),
          });

        await expect(
          registry
            .createExecutionRoute()
            .publish(
              baseMessage({
                executionRequestId:
                  "execution-request-1",

                executionPlanId:
                  "plan-1",

                executionPlanHash:
                  "hash-1",

                executionAuthorized:
                  true,
              })
            )
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_UNSAFE_AUTHORITY",
          });
      }
    );


    test(
      "transport result remains execution-authority free",
      async () => {
        const registry =
          new WorkflowOutboxRoutingRegistry({
            executionPublisher:
              jest.fn()
                .mockResolvedValue({
                  messageId:
                    "broker-message",
                }),
          });

        const result =
          await registry
            .createExecutionRoute()
            .publish(
              baseMessage({
                executionRequestId:
                  "execution-request-1",

                executionPlanId:
                  "plan-1",

                executionPlanHash:
                  "hash-1",
              })
            );

        expect(
          result.messageId
        )
          .toBe(
            "broker-message"
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);