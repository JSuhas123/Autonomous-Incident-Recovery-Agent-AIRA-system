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
  "WorkflowOutbox Restart Continuity",
  () => {
    function createQueueHarness() {
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

      return {
        handlers,
        queueService,
      };
    }


    function createEvent({
      topic,
      payload,
      eventId,
    }) {
      return {
        eventId,

        tenantId:
          "org-1",

        correlationId:
          "correlation-1",

        topic,

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

        ack:
          jest.fn(),

        nack:
          jest.fn(),
      };
    }


    test(
      "restart preserves Recovery -> Execution -> Verification -> Lifecycle continuity",
      async () => {
        const firstQueue =
          createQueueHarness();

        const executionWorker = {
          process:
            jest.fn()
              .mockResolvedValue({
                processed:
                  true,

                success:
                  true,

                executionPerformed:
                  true,

                executionRequestId:
                  "execution-request-1",

                executionPlanId:
                  "execution-plan-1",

                executionPlanHash:
                  "execution-plan-hash-1",

                verificationRequestId:
                  "verification-1",

                outboxHandoff: {
                  handoffCreated:
                    true,

                  eventType:
                    "VERIFICATION_REQUESTED",

                  executionAuthorized:
                    false,
                },

                executionAuthorized:
                  false,
              }),
        };

        const verificationWorker = {
          process:
            jest.fn()
              .mockResolvedValue({
                processed:
                  true,

                success:
                  true,

                verificationPerformed:
                  true,

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

                outboxHandoff: {
                  handoffCreated:
                    true,

                  eventType:
                    "LIFECYCLE_REQUESTED",

                  executionAuthorized:
                    false,
                },

                executionAuthorized:
                  false,
              }),
        };

        const lifecycleWorker = {
          process:
            jest.fn()
              .mockResolvedValue({
                processed:
                  true,

                success:
                  true,

                lifecyclePerformed:
                  true,

                executionAuthorized:
                  false,
              }),
        };


        // ================================================================
        // PROCESS INSTANCE #1
        // ================================================================

        const registry1 =
          new WorkflowOutboxConsumerRegistry({
            queueService:
              firstQueue
                .queueService,

            executionWorker,

            verificationWorker,

            lifecycleWorker,
          });

        await registry1
          .start();


        // ---------------------------------------------------------------
        // Durable Recovery -> Execution message survives up to consumer.
        // ---------------------------------------------------------------

        const executionHandler =
          firstQueue
            .handlers
            .get(
              WORKFLOW_OUTBOX_TOPIC
                .EXECUTION
            );

        const executionEvent =
          createEvent({
            topic:
              WORKFLOW_OUTBOX_TOPIC
                .EXECUTION,

            eventId:
              "execution-outbox-event",

            payload: {
              executionRequestId:
                "execution-request-1",

              executionPlanId:
                "execution-plan-1",

              executionPlanHash:
                "execution-plan-hash-1",

              authorizationId:
                "authorization-1",
            },
          });

        const executionResult =
          await executionHandler(
            executionEvent
          );

        expect(
          executionWorker
            .process
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          executionEvent.ack
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          executionResult
            .result
            .outboxHandoff
            .eventType
        )
          .toBe(
            "VERIFICATION_REQUESTED"
          );


        // ================================================================
        // SIMULATED PROCESS RESTART
        // ================================================================
        //
        // Old JS process disappears.
        //
        // Durable verification outbox record remains in MongoDB.
        //
        // RabbitMQ/Outbox later presents the message to a fresh process.
        // ================================================================

        const secondQueue =
          createQueueHarness();

        const registry2 =
          new WorkflowOutboxConsumerRegistry({
            queueService:
              secondQueue
                .queueService,

            executionWorker,

            verificationWorker,

            lifecycleWorker,
          });

        await registry2
          .start();


        // ---------------------------------------------------------------
        // Durable Execution -> Verification message resumes.
        // ---------------------------------------------------------------

        const verificationHandler =
          secondQueue
            .handlers
            .get(
              WORKFLOW_OUTBOX_TOPIC
                .VERIFICATION
            );

        const verificationEvent =
          createEvent({
            topic:
              WORKFLOW_OUTBOX_TOPIC
                .VERIFICATION,

            eventId:
              "verification-outbox-event",

            payload: {
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
            },
          });

        const verificationResult =
          await verificationHandler(
            verificationEvent
          );

        expect(
          verificationWorker
            .process
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          verificationEvent.ack
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          verificationResult
            .result
            .outboxHandoff
            .eventType
        )
          .toBe(
            "LIFECYCLE_REQUESTED"
          );


        // ================================================================
        // SIMULATED SECOND RESTART
        // ================================================================

        const thirdQueue =
          createQueueHarness();

        const registry3 =
          new WorkflowOutboxConsumerRegistry({
            queueService:
              thirdQueue
                .queueService,

            executionWorker,

            verificationWorker,

            lifecycleWorker,
          });

        await registry3
          .start();


        // ---------------------------------------------------------------
        // Durable Verification -> Lifecycle message resumes.
        // ---------------------------------------------------------------

        const lifecycleHandler =
          thirdQueue
            .handlers
            .get(
              WORKFLOW_OUTBOX_TOPIC
                .LIFECYCLE
            );

        const lifecycleEvent =
          createEvent({
            topic:
              WORKFLOW_OUTBOX_TOPIC
                .LIFECYCLE,

            eventId:
              "lifecycle-outbox-event",

            payload: {
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
            },
          });

        const lifecycleResult =
          await lifecycleHandler(
            lifecycleEvent
          );

        expect(
          lifecycleWorker
            .process
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          lifecycleEvent.ack
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          lifecycleResult
            .result
            .lifecyclePerformed
        )
          .toBe(
            true
          );

        expect(
          lifecycleResult
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "pending workflow stage is not lost when previous process disappears",
      async () => {
        /*
         * Simulate process #1 dying before it could consume a durable
         * verification message.
         *
         * A new process simply registers the same durable queue and receives
         * the persisted broker/outbox delivery.
         */

        const queue =
          createQueueHarness();

        const verificationWorker = {
          process:
            jest.fn()
              .mockResolvedValue({
                processed:
                  true,

                success:
                  true,

                verificationPerformed:
                  true,

                executionAuthorized:
                  false,
              }),
        };

        const registry =
          new WorkflowOutboxConsumerRegistry({
            queueService:
              queue.queueService,

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
          queue.handlers.get(
            WORKFLOW_OUTBOX_TOPIC
              .VERIFICATION
          );

        const event =
          createEvent({
            topic:
              WORKFLOW_OUTBOX_TOPIC
                .VERIFICATION,

            eventId:
              "persisted-after-restart",

            payload: {
              executionRequestId:
                "execution-request-1",

              verificationId:
                "verification-1",

              verificationPlanId:
                "verification-plan-1",

              verificationPlanHash:
                "verification-plan-hash-1",
            },
          });

        await handler(
          event
        );

        expect(
          verificationWorker
            .process
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          event.ack
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );


    test(
      "duplicate stage after restart remains safe",
      async () => {
        const queue =
          createQueueHarness();

        const executionWorker = {
          process:
            jest.fn()
              .mockResolvedValue({
                processed:
                  true,

                success:
                  true,

                duplicate:
                  true,

                idempotencyDecision:
                  "DUPLICATE_COMPLETED",

                executionPerformed:
                  false,

                executionAuthorized:
                  false,
              }),
        };

        const registry =
          new WorkflowOutboxConsumerRegistry({
            queueService:
              queue.queueService,

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

        await registry
          .start();

        const handler =
          queue.handlers.get(
            WORKFLOW_OUTBOX_TOPIC
              .EXECUTION
          );

        const event =
          createEvent({
            topic:
              WORKFLOW_OUTBOX_TOPIC
                .EXECUTION,

            eventId:
              "duplicate-after-restart",

            payload: {
              executionRequestId:
                "execution-request-1",

              executionPlanId:
                "execution-plan-1",

              executionPlanHash:
                "execution-plan-hash-1",
            },
          });

        const result =
          await handler(
            event
          );

        expect(
          result.result
            .duplicate
        )
          .toBe(
            true
          );

        expect(
          result.result
            .executionPerformed
        )
          .toBe(
            false
          );

        expect(
          event.ack
        )
          .toHaveBeenCalledTimes(
            1
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
      "restart cannot turn transport data into execution authority",
      async () => {
        const queue =
          createQueueHarness();

        const executionWorker = {
          process:
            jest.fn(),
        };

        const registry =
          new WorkflowOutboxConsumerRegistry({
            queueService:
              queue.queueService,

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

        await registry
          .start();

        const handler =
          queue.handlers.get(
            WORKFLOW_OUTBOX_TOPIC
              .EXECUTION
          );

        const event =
          createEvent({
            topic:
              WORKFLOW_OUTBOX_TOPIC
                .EXECUTION,

            eventId:
              "unsafe-restart-event",

            payload: {
              executionRequestId:
                "execution-request-1",

              executionPlanId:
                "execution-plan-1",

              executionPlanHash:
                "execution-plan-hash-1",

              executionAuthorized:
                true,
            },
          });

        await expect(
          handler(
            event
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
          event.ack
        )
          .not
          .toHaveBeenCalled();
      }
    );
  }
);