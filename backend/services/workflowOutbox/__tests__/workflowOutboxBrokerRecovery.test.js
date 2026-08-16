"use strict";

const {
  WorkflowOutboxDeliveryCoordinator,
} =
  require(
    "../workflowOutboxDeliveryCoordinator"
  );

const {
  WorkflowOutboxRetryPolicy,
} =
  require(
    "../workflowOutboxRetryPolicy"
  );


describe(
  "WorkflowOutbox Broker Recovery",
  () => {
    const baseNow =
      new Date(
        "2026-08-16T14:00:00.000Z"
      );


    function createEvent(
      overrides = {}
    ) {
      return {
        eventId:
          "event-1",

        eventType:
          "EXECUTION_REQUEST_READY",

        organizationId:
          "org-1",

        environmentId:
          "prod",

        incidentId:
          "incident-1",

        attempts: {
          count:
            1,

          maxAttempts:
            5,
        },

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
            false,
        },

        executionAuthorized:
          false,

        ...overrides,
      };
    }


    // =========================================================================
    // 1. BROKER OUTAGE
    // =========================================================================

    test(
      "temporary broker outage schedules retry instead of losing event",
      async () => {
        const dispatcher = {
          dispatch:
            jest.fn()
              .mockRejectedValue(
                Object.assign(
                  new Error(
                    "RabbitMQ unavailable"
                  ),
                  {
                    code:
                      "ECONNREFUSED",

                    retryable:
                      true,

                    outboxContext: {
                      eventId:
                        "event-1",

                      ownerId:
                        "publisher-A",

                      claimToken:
                        "token-A",
                    },
                  }
                )
              ),
        };

        const claimService = {
          markFailed:
            jest.fn()
              .mockResolvedValue({
                failed:
                  true,

                retryable:
                  true,

                event: {
                  status:
                    "FAILED",
                },
              }),

          markDeadLetter:
            jest.fn(),
        };

        const retryPolicy =
          new WorkflowOutboxRetryPolicy({
            baseDelayMs:
              1000,

            maxDelayMs:
              10000,

            jitterRatio:
              0,
          });

        const coordinator =
          new WorkflowOutboxDeliveryCoordinator({
            dispatcher,

            claimService,

            retryPolicy,

            now:
              () =>
                new Date(
                  baseNow
                ),
          });

        const event =
          createEvent();

        const result =
          await coordinator
            .deliver(
              event
            );

        /*
         * Coordinator forwards both:
         *
         *   event
         *   dependencies
         *
         * dependencies defaults to {}.
         */
        expect(
          dispatcher.dispatch
        )
          .toHaveBeenCalledWith(
            event,
            {}
          );

        expect(
          dispatcher.dispatch
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          claimService.markFailed
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          claimService.markDeadLetter
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.retryScheduled
        )
          .toBe(
            true
          );

        expect(
          result.deadLettered
        )
          .toBe(
            false
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    // =========================================================================
    // 2. BROKER RECOVERY
    // =========================================================================

    test(
      "same logical event succeeds after broker recovery",
      async () => {
        /*
         * IMPORTANT:
         *
         * Successful claim + publish + markDelivered belongs to the
         * dispatcher boundary.
         *
         * Therefore the dispatcher success result represents an already
         * completed durable delivery.
         */
        const dispatcher = {
          dispatch:
            jest.fn()
              .mockResolvedValue({
                processed:
                  true,

                dispatched:
                  true,

                delivered:
                  true,

                messageId:
                  "broker-message-2",

                queue:
                  "execution",

                exchange:
                  "aira.workflow.execution.requested",

                routingKey:
                  "aira.workflow.execution.requested",

                executionAuthorized:
                  false,
              }),
        };

        /*
         * Coordinator only needs failure ownership methods.
         *
         * markDelivered is deliberately included as a spy so this test proves
         * the coordinator does NOT perform a second delivery commit.
         */
        const claimService = {
          markDelivered:
            jest.fn(),

          markFailed:
            jest.fn(),

          markDeadLetter:
            jest.fn(),
        };

        const retryPolicy =
          new WorkflowOutboxRetryPolicy({
            jitterRatio:
              0,
          });

        const coordinator =
          new WorkflowOutboxDeliveryCoordinator({
            dispatcher,

            claimService,

            retryPolicy,

            now:
              () =>
                new Date(
                  "2026-08-16T14:00:02.000Z"
                ),
          });

        const recoveredEvent =
          createEvent({
            attempts: {
              count:
                2,

              maxAttempts:
                5,
            },
          });

        const result =
          await coordinator
            .deliver(
              recoveredEvent
            );

        expect(
          dispatcher.dispatch
        )
          .toHaveBeenCalledWith(
            recoveredEvent,
            {}
          );

        expect(
          dispatcher.dispatch
        )
          .toHaveBeenCalledTimes(
            1
          );

        /*
         * Do NOT expect coordinator.markDelivered().
         *
         * Dispatcher already performed that ownership-sensitive transition.
         */
        expect(
          claimService.markDelivered
        )
          .not
          .toHaveBeenCalled();

        expect(
          claimService.markFailed
        )
          .not
          .toHaveBeenCalled();

        expect(
          claimService.markDeadLetter
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.delivered
        )
          .toBe(
            true
          );

        expect(
          result.dispatched
        )
          .toBe(
            true
          );

        expect(
          result.messageId
        )
          .toBe(
            "broker-message-2"
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    // =========================================================================
    // 3. IMMUTABLE IDENTITY SURVIVES RETRY
    // =========================================================================

    test(
      "retry path preserves immutable execution identity",
      async () => {
        const dispatcher = {
          dispatch:
            jest.fn()
              .mockResolvedValue({
                processed:
                  true,

                dispatched:
                  true,

                delivered:
                  true,

                messageId:
                  "broker-message-3",

                queue:
                  "execution",

                executionAuthorized:
                  false,
              }),
        };

        const claimService = {
          markDelivered:
            jest.fn(),

          markFailed:
            jest.fn(),

          markDeadLetter:
            jest.fn(),
        };

        const coordinator =
          new WorkflowOutboxDeliveryCoordinator({
            dispatcher,

            claimService,

            retryPolicy:
              new WorkflowOutboxRetryPolicy({
                jitterRatio:
                  0,
              }),

            now:
              () =>
                new Date(
                  baseNow
                ),
          });

        const event =
          createEvent();

        await coordinator
          .deliver(
            event
          );

        /*
         * Correct signature:
         *
         * dispatch(
         *   event,
         *   dependencies
         * )
         */
        expect(
          dispatcher.dispatch
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              eventId:
                "event-1",

              payload:
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
                    "execution-plan-1",

                  executionPlanHash:
                    "execution-plan-hash-1",

                  executionAuthorized:
                    false,
                }),
            }),

            {}
          );

        expect(
          claimService.markFailed
        )
          .not
          .toHaveBeenCalled();

        expect(
          claimService.markDeadLetter
        )
          .not
          .toHaveBeenCalled();
      }
    );


    // =========================================================================
    // 4. RETRY EXHAUSTION
    // =========================================================================

    test(
      "repeated broker failures eventually exhaust retry budget",
      async () => {
        const dispatcher = {
          dispatch:
            jest.fn()
              .mockRejectedValue(
                Object.assign(
                  new Error(
                    "RabbitMQ still unavailable"
                  ),
                  {
                    code:
                      "ECONNREFUSED",

                    retryable:
                      true,

                    outboxContext: {
                      eventId:
                        "event-1",

                      ownerId:
                        "publisher-C",

                      claimToken:
                        "token-C",
                    },
                  }
                )
              ),
        };

        const claimService = {
          markFailed:
            jest.fn(),

          markDeadLetter:
            jest.fn()
              .mockResolvedValue({
                deadLettered:
                  true,

                event: {
                  status:
                    "DEAD_LETTER",
                },
              }),
        };

        const coordinator =
          new WorkflowOutboxDeliveryCoordinator({
            dispatcher,

            claimService,

            retryPolicy:
              new WorkflowOutboxRetryPolicy({
                jitterRatio:
                  0,
              }),

            now:
              () =>
                new Date(
                  baseNow
                ),
          });

        const exhausted =
          createEvent({
            attempts: {
              count:
                5,

              maxAttempts:
                5,
            },
          });

        const result =
          await coordinator
            .deliver(
              exhausted
            );

        expect(
          dispatcher.dispatch
        )
          .toHaveBeenCalledWith(
            exhausted,
            {}
          );

        expect(
          claimService.markDeadLetter
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          claimService.markFailed
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.deadLettered
        )
          .toBe(
            true
          );

        expect(
          result.reason
        )
          .toBe(
            "RETRY_BUDGET_EXHAUSTED"
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    // =========================================================================
    // 5. PERMANENT FAILURE
    // =========================================================================

    test(
      "permanent routing failure bypasses retry and dead-letters immediately",
      async () => {
        const dispatcher = {
          dispatch:
            jest.fn()
              .mockRejectedValue(
                Object.assign(
                  new Error(
                    "Unknown workflow route"
                  ),
                  {
                    code:
                      "OUTBOX_EVENT_ROUTE_INVALID",

                    retryable:
                      false,

                    outboxContext: {
                      eventId:
                        "event-1",

                      ownerId:
                        "publisher-D",

                      claimToken:
                        "token-D",
                    },
                  }
                )
              ),
        };

        const claimService = {
          markFailed:
            jest.fn(),

          markDeadLetter:
            jest.fn()
              .mockResolvedValue({
                deadLettered:
                  true,
              }),
        };

        const coordinator =
          new WorkflowOutboxDeliveryCoordinator({
            dispatcher,

            claimService,

            retryPolicy:
              new WorkflowOutboxRetryPolicy({
                jitterRatio:
                  0,
              }),

            now:
              () =>
                new Date(
                  baseNow
                ),
          });

        const event =
          createEvent();

        const result =
          await coordinator
            .deliver(
              event
            );

        expect(
          dispatcher.dispatch
        )
          .toHaveBeenCalledWith(
            event,
            {}
          );

        expect(
          result.deadLettered
        )
          .toBe(
            true
          );

        expect(
          result.reason
        )
          .toBe(
            "NON_RETRYABLE_FAILURE"
          );

        expect(
          claimService.markFailed
        )
          .not
          .toHaveBeenCalled();

        expect(
          claimService.markDeadLetter
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
  }
);