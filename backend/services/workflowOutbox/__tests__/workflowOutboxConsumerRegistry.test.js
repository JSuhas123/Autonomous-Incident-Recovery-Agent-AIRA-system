"use strict";

const {
  WorkflowOutboxConsumerRegistry,
} =
  require(
    "../workflowOutboxConsumerRegistry"
  );

const {
  WORKFLOW_OUTBOX_TOPIC,
  WORKFLOW_OUTBOX_QUEUE,
} =
  require(
    "../workflowOutboxComposition"
  );


describe(
  "WorkflowOutboxConsumerRegistry",
  () => {
    let queueService;

    let executionWorker;
    let verificationWorker;
    let lifecycleWorker;
    let humanNotificationWorker;

    let handlers;


    beforeEach(
      () => {
        handlers =
          new Map();

        queueService = {
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

        executionWorker = {
          process:
            jest.fn()
              .mockResolvedValue({
                processed:
                  true,

                success:
                  true,

                executionAuthorized:
                  false,
              }),
        };

        verificationWorker = {
          process:
            jest.fn()
              .mockResolvedValue({
                processed:
                  true,

                success:
                  true,

                executionAuthorized:
                  false,
              }),
        };

        lifecycleWorker = {
          process:
            jest.fn()
              .mockResolvedValue({
                processed:
                  true,

                success:
                  true,

                executionAuthorized:
                  false,
              }),
        };

        humanNotificationWorker = {
  process:
    jest.fn()
      .mockResolvedValue({
        processed:
          true,

        delivered:
          true,

        duplicate:
          false,

        humanControlGranted:
          false,

        acknowledgementGranted:
          false,

        executionAuthorized:
          false,
      }),
};
      }
    );


    function createRegistry(
      overrides = {}
    ) {
      return new WorkflowOutboxConsumerRegistry({
        queueService,

        executionWorker,

        verificationWorker,

        lifecycleWorker,

        humanNotificationWorker,

        prefetch:
          1,

        logger: {
          info:
            jest.fn(),
        },

        ...overrides,
      });
    }


    function event(
      payload = {},
      overrides = {}
    ) {
      return {
        eventId:
          "broker-event-1",

        correlationId:
          "correlation-1",

        tenantId:
          "org-1",

        topic:
          "test-topic",

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

        ...overrides,
      };
    }


    test(
      "requires queue service",
      () => {
        expect(
          () =>
            new WorkflowOutboxConsumerRegistry({
              executionWorker,

              verificationWorker,

              lifecycleWorker,
            })
        )
          .toThrow(
            expect.objectContaining({
              code:
                "OUTBOX_CONSUMER_QUEUE_REQUIRED",
            })
          );
      }
    );


   test(
  "registers all four durable consumers",
  async () => {
    const registry =
      createRegistry();

    const result =
      await registry
        .start();


    expect(
      result.started
    )
      .toBe(
        true
      );


    expect(
      result.registrations
    )
      .toHaveLength(
        4
      );


    expect(
      queueService
        .consumeEvents
    )
      .toHaveBeenCalledTimes(
        4
      );


    /*
     * EXECUTION
     */

    expect(
      queueService
        .consumeEvents
    )
      .toHaveBeenCalledWith(
        WORKFLOW_OUTBOX_TOPIC
          .EXECUTION,

        WORKFLOW_OUTBOX_QUEUE
          .EXECUTION,

        expect.any(
          Function
        ),

        {
          prefetch:
            1,
        }
      );


    /*
     * VERIFICATION
     */

    expect(
      queueService
        .consumeEvents
    )
      .toHaveBeenCalledWith(
        WORKFLOW_OUTBOX_TOPIC
          .VERIFICATION,

        WORKFLOW_OUTBOX_QUEUE
          .VERIFICATION,

        expect.any(
          Function
        ),

        {
          prefetch:
            1,
        }
      );


    /*
     * LIFECYCLE
     */

    expect(
      queueService
        .consumeEvents
    )
      .toHaveBeenCalledWith(
        WORKFLOW_OUTBOX_TOPIC
          .LIFECYCLE,

        WORKFLOW_OUTBOX_QUEUE
          .LIFECYCLE,

        expect.any(
          Function
        ),

        {
          prefetch:
            1,
        }
      );


    /*
     * PHASE 23.3 HUMAN NOTIFICATION
     */

    expect(
      queueService
        .consumeEvents
    )
      .toHaveBeenCalledWith(
        WORKFLOW_OUTBOX_TOPIC
          .HUMAN_NOTIFICATION,

        WORKFLOW_OUTBOX_QUEUE
          .HUMAN_NOTIFICATION,

        expect.any(
          Function
        ),

        {
          prefetch:
            1,
        }
      );
  }
);


    test(
      "consumer registration is idempotent",
      async () => {
        const registry =
          createRegistry();

        const first =
          await registry
            .start();

        const second =
          await registry
            .start();

        expect(
          first.started
        )
          .toBe(
            true
          );

        expect(
          second
        )
          .toMatchObject({
            started:
              false,

            alreadyStarted:
              true,
          });

        expect(
          queueService
            .consumeEvents
        )
          .toHaveBeenCalledTimes(
            4
          );
      }
    );


    test(
      "does not register consumers against disconnected queue",
      async () => {
        queueService.connected =
          false;

        const registry =
          createRegistry();

        await expect(
          registry.start()
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_CONSUMER_TRANSPORT_NOT_READY",
          });

        expect(
          queueService
            .consumeEvents
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "execution event reaches ExecutionWorker and ACKs",
      async () => {
        const registry =
          createRegistry();

        await registry.start();

        const handler =
          handlers.get(
            WORKFLOW_OUTBOX_TOPIC
              .EXECUTION
          );

        const incoming =
          event({
            executionRequestId:
              "execution-request-1",

            executionPlanId:
              "plan-1",

            executionPlanHash:
              "hash-1",

            authorizationId:
              "authorization-1",
          });

        const result =
          await handler(
            incoming
          );

        expect(
          executionWorker.process
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
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

              authorizationId:
                "authorization-1",

              executionAuthorized:
                false,
            })
          );

        expect(
          incoming.ack
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          incoming.nack
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.acknowledged
        )
          .toBe(
            true
          );
      }
    );


    test(
      "verification event reaches VerificationWorker",
      async () => {
        const registry =
          createRegistry();

        await registry.start();

        const handler =
          handlers.get(
            WORKFLOW_OUTBOX_TOPIC
              .VERIFICATION
          );

        const incoming =
          event({
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
          });

        await handler(
          incoming
        );

        expect(
          verificationWorker
            .process
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
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

        expect(
          incoming.ack
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );


    test(
      "lifecycle event reaches LifecycleWorker",
      async () => {
        const registry =
          createRegistry();

        await registry.start();

        const handler =
          handlers.get(
            WORKFLOW_OUTBOX_TOPIC
              .LIFECYCLE
          );

        const incoming =
          event({
            executionRequestId:
              "execution-request-1",

            verificationId:
              "verification-1",

            verificationPlanId:
              "verification-plan-1",

            verificationPlanHash:
              "verification-hash-1",

            verificationOutcome: {
              outcome:
                "RECOVERED",
            },
          });

        await handler(
          incoming
        );

        expect(
          lifecycleWorker.process
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              verificationId:
                "verification-1",

              verificationOutcome: {
                outcome:
                  "RECOVERED",
              },

              executionAuthorized:
                false,
            })
          );

        expect(
          incoming.ack
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );

test(
  "human notification event reaches HumanNotificationWorker",
  async () => {
    const registry =
      createRegistry();


    await registry.start();


    const handler =
      handlers.get(
        WORKFLOW_OUTBOX_TOPIC
          .HUMAN_NOTIFICATION
      );


    expect(
      handler
    )
      .toEqual(
        expect.any(
          Function
        )
      );


    const incoming =
      event({
        notificationRequestId:
          "nreq-1",

        escalationId:
          "esc-1",

        humanTaskId:
          "task-1",

        assignmentId:
          "assignment-1",

        notificationEventType:
          "HUMAN_ESCALATION_REQUIRED",

        severity:
          "CRITICAL",

        title:
          "AIRA escalation",

        message:
          "Human intervention required",

        target: {
          targetType:
            "INTEGRATION",

          provider:
            "slack",

          integrationId:
            "int-slack-1",
        },

        acknowledgementGranted:
          false,

        humanControlGranted:
          false,

        executionAuthorized:
          false,
      });


    const result =
      await handler(
        incoming
      );


    expect(
      humanNotificationWorker
        .process
    )
      .toHaveBeenCalledTimes(
        1
      );


    expect(
      humanNotificationWorker
        .process
    )
      .toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId:
            "org-1",

          environmentId:
            "prod",

          incidentId:
            "incident-1",

          notificationRequestId:
            "nreq-1",

          escalationId:
            "esc-1",

          executionAuthorized:
            false,
        })
      );


    expect(
      incoming.ack
    )
      .toHaveBeenCalledTimes(
        1
      );


    expect(
      incoming.nack
    )
      .not
      .toHaveBeenCalled();


    expect(
      result
        .acknowledged
    )
      .toBe(
        true
      );


    expect(
      result
        .stage
    )
      .toBe(
        "human-notification"
      );


    expect(
      result
        .executionAuthorized
    )
      .toBe(
        false
      );
  }
);

test(
  "human notification transport cannot manufacture execution authority",
  async () => {
    const registry =
      createRegistry();


    await registry.start();


    const handler =
      handlers.get(
        WORKFLOW_OUTBOX_TOPIC
          .HUMAN_NOTIFICATION
      );


    const incoming =
      event({
        notificationRequestId:
          "nreq-1",

        escalationId:
          "esc-1",

        executionAuthorized:
          true,
      });


    await expect(
      handler(
        incoming
      )
    )
      .rejects
      .toMatchObject({
        code:
          "OUTBOX_UNSAFE_AUTHORITY",

        stage:
          "human-notification",

        retryable:
          false,
      });


    expect(
      humanNotificationWorker
        .process
    )
      .not
      .toHaveBeenCalled();


    expect(
      incoming.ack
    )
      .not
      .toHaveBeenCalled();


    expect(
      incoming.nack
    )
      .not
      .toHaveBeenCalled();
  }
);

    test(
      "worker exception is propagated without manual nack",
      async () => {
        const failure =
          Object.assign(
            new Error(
              "temporary execution dependency failure"
            ),
            {
              code:
                "DATABASE_TEMPORARY_FAILURE",

              retryable:
                true,
            }
          );

        executionWorker
          .process
          .mockRejectedValue(
            failure
          );

        const registry =
          createRegistry();

        await registry.start();

        const handler =
          handlers.get(
            WORKFLOW_OUTBOX_TOPIC
              .EXECUTION
          );

        const incoming =
          event({
            executionRequestId:
              "execution-request-1",
          });

        await expect(
          handler(
            incoming
          )
        )
          .rejects
          .toBe(
            failure
          );

        expect(
          incoming.ack
        )
          .not
          .toHaveBeenCalled();

        /*
         * Registry does not manually NACK.
         *
         * QueueService.consumeEvents() owns NACK behavior.
         */
        expect(
          incoming.nack
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "duplicate completed result is acknowledged",
      async () => {
        executionWorker
          .process
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
          });

        const registry =
          createRegistry();

        await registry.start();

        const handler =
          handlers.get(
            WORKFLOW_OUTBOX_TOPIC
              .EXECUTION
          );

        const incoming =
          event({
            executionRequestId:
              "execution-request-1",
          });

        await handler(
          incoming
        );

        expect(
          incoming.ack
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );


    test(
      "duplicate processing result is acknowledged",
      async () => {
        lifecycleWorker
          .process
          .mockResolvedValue({
            processed:
              true,

            success:
              false,

            duplicate:
              true,

            idempotencyDecision:
              "DUPLICATE_PROCESSING",

            lifecyclePerformed:
              false,

            executionAuthorized:
              false,
          });

        const registry =
          createRegistry();

        await registry.start();

        const handler =
          handlers.get(
            WORKFLOW_OUTBOX_TOPIC
              .LIFECYCLE
          );

        const incoming =
          event({
            verificationId:
              "verification-1",
          });

        await handler(
          incoming
        );

        expect(
          incoming.ack
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );


    test(
      "consumer rejects execution authority before worker",
      async () => {
        const registry =
          createRegistry();

        await registry.start();

        const handler =
          handlers.get(
            WORKFLOW_OUTBOX_TOPIC
              .EXECUTION
          );

        const incoming =
          event({
            executionRequestId:
              "execution-request-1",

            executionAuthorized:
              true,
          });

        let thrown;

        try {
          await handler(
            incoming
          );
        } catch (
          error
        ) {
          thrown =
            error;
        }

        expect(
          thrown
        )
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
      "malformed tenant scope is permanent failure",
      async () => {
        const registry =
          createRegistry();

        await registry.start();

        const handler =
          handlers.get(
            WORKFLOW_OUTBOX_TOPIC
              .VERIFICATION
          );

        const incoming =
          event({
            environmentId:
              null,
          });

        await expect(
          handler(
            incoming
          )
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_CONSUMER_SCOPE_REQUIRED",

            field:
              "environmentId",

            retryable:
              false,
          });
      }
    );


    test(
      "consumer job preserves broker identity for audit",
      async () => {
        const registry =
          createRegistry();

        await registry.start();

        const handler =
          handlers.get(
            WORKFLOW_OUTBOX_TOPIC
              .EXECUTION
          );

        const incoming =
          event({
            executionRequestId:
              "execution-request-1",
          });

        await handler(
          incoming
        );

        expect(
          executionWorker
            .process
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              outboxEventId:
                "broker-event-1",

              correlationId:
                "correlation-1",
            })
          );
      }
    );


    test(
      "prefetch is bounded",
      () => {
        const registry =
          createRegistry({
            prefetch:
              1000,
          });

        expect(
          registry
            .getStatus()
            .prefetch
        )
          .toBe(
            100
          );
      }
    );


    test(
      "status never exposes execution authority",
      () => {
        const registry =
          createRegistry();

        expect(
          registry
            .getStatus()
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);