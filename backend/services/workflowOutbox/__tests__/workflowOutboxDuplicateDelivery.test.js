"use strict";

const {
  WorkflowOutboxConsumerRegistry,
} =
  require(
    "../workflowOutboxConsumerRegistry"
  );

const {
  WORKFLOW_OUTBOX_TOPIC,
} =
  require(
    "../workflowOutboxComposition"
  );

describe(
  "WorkflowOutbox Duplicate Delivery",
  () => {
    test(
      "duplicate execution delivery reaches idempotent worker safely",
      async () => {
        const handlers =
          new Map();

        const queueService = {
          connected:
            true,

          consumeEvents:
            jest.fn(
              async (
                topic,
                queueName,
                handler
              ) => {
                handlers.set(
                  topic,
                  handler
                );

                return queueName;
              }
            ),
        };

        /*
         * Important:
         *
         * This mock represents the protected ExecutionWorker's
         * idempotent behavior.
         *
         * First broker delivery:
         *   actual logical execution
         *
         * Second broker delivery:
         *   DUPLICATE_COMPLETED
         *
         * RabbitMQ may therefore deliver twice while infrastructure
         * execution still occurs only once logically.
         */
        const executionWorker = {
          process:
            jest.fn()
              .mockResolvedValueOnce({
                processed:
                  true,

                success:
                  true,

                duplicate:
                  false,

                executionPerformed:
                  true,

                idempotencyDecision:
                  "EXECUTED",

                executionAuthorized:
                  false,
              })
              .mockResolvedValueOnce({
                processed:
                  true,

                success:
                  true,

                duplicate:
                  true,

                executionPerformed:
                  false,

                idempotencyDecision:
                  "DUPLICATE_COMPLETED",

                executionAuthorized:
                  false,
              }),
        };

        const verificationWorker = {
          process:
            jest.fn(),
        };

        const lifecycleWorker = {
          process:
            jest.fn(),
        };

        const registry =
          new WorkflowOutboxConsumerRegistry({
            queueService,

            executionWorker,

            verificationWorker,

            lifecycleWorker,

            prefetch:
              1,

            logger: {
              info:
                jest.fn(),

              error:
                jest.fn(),
            },
          });

        await registry
          .start();

        const handler =
          handlers.get(
            WORKFLOW_OUTBOX_TOPIC
              .EXECUTION
          );

        expect(
          handler
        )
          .toEqual(
            expect.any(
              Function
            )
          );

        function createDelivery() {
          return {
            eventId:
              "same-outbox-event",

            correlationId:
              "correlation-1",

            tenantId:
              "org-1",

            topic:
              WORKFLOW_OUTBOX_TOPIC
                .EXECUTION,

            payload: {
              organizationId:
                "org-1",

              environmentId:
                "prod",

              incidentId:
                "incident-1",

              executionRequestId:
                "execution-request-1",

              executionPlanId:
                "execution-plan-1",

              executionPlanHash:
                "execution-plan-hash-1",

              authorizationId:
                "authorization-1",

              correlationId:
                "correlation-1",

              executionAuthorized:
                false,
            },

            ack:
              jest.fn(),

            nack:
              jest.fn(),
          };
        }

        const firstDelivery =
          createDelivery();

        const secondDelivery =
          createDelivery();

        const firstResult =
          await handler(
            firstDelivery
          );

        const secondResult =
          await handler(
            secondDelivery
          );

        /*
         * Broker delivered the same durable event twice.
         */
        expect(
          executionWorker
            .process
        )
          .toHaveBeenCalledTimes(
            2
          );

        /*
         * Both broker deliveries are safely acknowledged because the
         * protected worker resolved both logical states successfully.
         */
        expect(
          firstDelivery
            .ack
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          secondDelivery
            .ack
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          firstDelivery
            .nack
        )
          .not
          .toHaveBeenCalled();

        expect(
          secondDelivery
            .nack
        )
          .not
          .toHaveBeenCalled();

        expect(
          firstResult
            .acknowledged
        )
          .toBe(
            true
          );

        expect(
          secondResult
            .acknowledged
        )
          .toBe(
            true
          );

        expect(
          firstResult
            .result
            .executionPerformed
        )
          .toBe(
            true
          );

        expect(
          secondResult
            .result
            .executionPerformed
        )
          .toBe(
            false
          );

        expect(
          secondResult
            .result
            .duplicate
        )
          .toBe(
            true
          );

        expect(
          secondResult
            .result
            .idempotencyDecision
        )
          .toBe(
            "DUPLICATE_COMPLETED"
          );

        expect(
          firstResult
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          secondResult
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "duplicate verification delivery is safely absorbed",
      async () => {
        const handlers =
          new Map();

        const queueService = {
          connected:
            true,

          consumeEvents:
            jest.fn(
              async (
                topic,
                queueName,
                handler
              ) => {
                handlers.set(
                  topic,
                  handler
                );

                return queueName;
              }
            ),
        };

        const verificationWorker = {
          process:
            jest.fn()
              .mockResolvedValueOnce({
                processed:
                  true,

                success:
                  true,

                duplicate:
                  false,

                verificationPerformed:
                  true,

                executionAuthorized:
                  false,
              })
              .mockResolvedValueOnce({
                processed:
                  true,

                success:
                  true,

                duplicate:
                  true,

                verificationPerformed:
                  false,

                idempotencyDecision:
                  "DUPLICATE_COMPLETED",

                executionAuthorized:
                  false,
              }),
        };

        const registry =
          new WorkflowOutboxConsumerRegistry({
            queueService,

            executionWorker: {
              process:
                jest.fn(),
            },

            verificationWorker,

            lifecycleWorker: {
              process:
                jest.fn(),
            },
          });

        await registry
          .start();

        const handler =
          handlers.get(
            WORKFLOW_OUTBOX_TOPIC
              .VERIFICATION
          );

        function delivery() {
          return {
            eventId:
              "verification-outbox-event",

            tenantId:
              "org-1",

            correlationId:
              "correlation-1",

            topic:
              WORKFLOW_OUTBOX_TOPIC
                .VERIFICATION,

            payload: {
              organizationId:
                "org-1",

              environmentId:
                "prod",

              incidentId:
                "incident-1",

              executionRequestId:
                "execution-request-1",

              executionPlanId:
                "execution-plan-1",

              executionPlanHash:
                "execution-plan-hash-1",

              verificationId:
                "verification-1",

              verificationPlanId:
                "verification-plan-1",

              verificationPlanHash:
                "verification-plan-hash-1",

              executionAuthorized:
                false,
            },

            ack:
              jest.fn(),

            nack:
              jest.fn(),
          };
        }

        const first =
          delivery();

        const second =
          delivery();

        await handler(
          first
        );

        const duplicate =
          await handler(
            second
          );

        expect(
          verificationWorker
            .process
        )
          .toHaveBeenCalledTimes(
            2
          );

        expect(
          first.ack
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          second.ack
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          duplicate
            .result
            .idempotencyDecision
        )
          .toBe(
            "DUPLICATE_COMPLETED"
          );

        expect(
          duplicate
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "duplicate lifecycle delivery is safely absorbed",
      async () => {
        const handlers =
          new Map();

        const queueService = {
          connected:
            true,

          consumeEvents:
            jest.fn(
              async (
                topic,
                queueName,
                handler
              ) => {
                handlers.set(
                  topic,
                  handler
                );

                return queueName;
              }
            ),
        };

        const lifecycleWorker = {
          process:
            jest.fn()
              .mockResolvedValueOnce({
                processed:
                  true,

                success:
                  true,

                duplicate:
                  false,

                lifecyclePerformed:
                  true,

                executionAuthorized:
                  false,
              })
              .mockResolvedValueOnce({
                processed:
                  true,

                success:
                  true,

                duplicate:
                  true,

                lifecyclePerformed:
                  false,

                idempotencyDecision:
                  "DUPLICATE_COMPLETED",

                executionAuthorized:
                  false,
              }),
        };

        const registry =
          new WorkflowOutboxConsumerRegistry({
            queueService,

            executionWorker: {
              process:
                jest.fn(),
            },

            verificationWorker: {
              process:
                jest.fn(),
            },

            lifecycleWorker,
          });

        await registry
          .start();

        const handler =
          handlers.get(
            WORKFLOW_OUTBOX_TOPIC
              .LIFECYCLE
          );

        function delivery() {
          return {
            eventId:
              "lifecycle-outbox-event",

            tenantId:
              "org-1",

            correlationId:
              "correlation-1",

            topic:
              WORKFLOW_OUTBOX_TOPIC
                .LIFECYCLE,

            payload: {
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

              verificationPlanId:
                "verification-plan-1",

              verificationPlanHash:
                "verification-plan-hash-1",

              verificationOutcome: {
                outcome:
                  "RECOVERED",
              },

              executionAuthorized:
                false,
            },

            ack:
              jest.fn(),

            nack:
              jest.fn(),
          };
        }

        const first =
          delivery();

        const second =
          delivery();

        await handler(
          first
        );

        const duplicate =
          await handler(
            second
          );

        expect(
          lifecycleWorker
            .process
        )
          .toHaveBeenCalledTimes(
            2
          );

        expect(
          first.ack
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          second.ack
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          duplicate
            .result
            .duplicate
        )
          .toBe(
            true
          );

        expect(
          duplicate
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "malicious duplicate cannot inject execution authority",
      async () => {
        const executionWorker = {
          process:
            jest.fn(),
        };

        const registry =
          new WorkflowOutboxConsumerRegistry({
            queueService: {
              connected:
                true,

              consumeEvents:
                jest.fn(),
            },

            executionWorker,

            verificationWorker: {
              process:
                jest.fn(),
            },

            lifecycleWorker: {
              process:
                jest.fn(),
            },
          });

        const handler =
          registry
            .createHandler({
              stage:
                "execution",

              worker:
                executionWorker,
            });

        const incoming = {
          eventId:
            "malicious-duplicate",

          tenantId:
            "org-1",

          payload: {
            organizationId:
              "org-1",

            environmentId:
              "prod",

            incidentId:
              "incident-1",

            executionRequestId:
              "execution-request-1",

            executionPlanId:
              "execution-plan-1",

            executionPlanHash:
              "execution-plan-hash-1",

            executionAuthorized:
              true,
          },

          ack:
            jest.fn(),

          nack:
            jest.fn(),
        };

        await expect(
          handler(
            incoming
          )
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_UNSAFE_AUTHORITY",

            retryable:
              false,
          });

        expect(
          executionWorker
            .process
        )
          .not
          .toHaveBeenCalled();

        expect(
          incoming.ack
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "authorizationGranted cannot be injected through duplicate transport",
      async () => {
        const executionWorker = {
          process:
            jest.fn(),
        };

        const registry =
          new WorkflowOutboxConsumerRegistry({
            queueService: {
              connected:
                true,

              consumeEvents:
                jest.fn(),
            },

            executionWorker,

            verificationWorker: {
              process:
                jest.fn(),
            },

            lifecycleWorker: {
              process:
                jest.fn(),
            },
          });

        const handler =
          registry
            .createHandler({
              stage:
                "execution",

              worker:
                executionWorker,
            });

        await expect(
          handler({
            eventId:
              "malicious-event",

            tenantId:
              "org-1",

            payload: {
              organizationId:
                "org-1",

              environmentId:
                "prod",

              incidentId:
                "incident-1",

              executionRequestId:
                "execution-request-1",

              authorizationGranted:
                true,

              executionAuthorized:
                false,
            },

            ack:
              jest.fn(),

            nack:
              jest.fn(),
          })
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_UNSAFE_AUTHORITY",

            retryable:
              false,
          });

        expect(
          executionWorker
            .process
        )
          .not
          .toHaveBeenCalled();
      }
    );
  }
);