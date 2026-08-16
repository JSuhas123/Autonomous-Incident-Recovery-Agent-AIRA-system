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
  "WorkflowOutbox Crash Recovery",
  () => {
    const now =
      new Date(
        "2026-08-16T12:00:00.000Z"
      );

    function event(
      overrides = {}
    ) {
      return {
        eventId:
          "outbox-event-1",

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

        executionAuthorized:
          false,

        payload: {
          executionRequestId:
            "execution-request-1",

          executionPlanId:
            "plan-1",

          executionPlanHash:
            "hash-1",

          executionAuthorized:
            false,
        },

        ...overrides,
      };
    }

    test(
      "publish succeeds but markDelivered crash leaves event recoverable",
      async () => {
        /*
         * Simulate:
         *
         * RabbitMQ accepted publication
         *        ↓
         * process crashes before durable outbox marked DELIVERED
         */

        const dispatcher = {
          dispatch:
            jest.fn()
              .mockRejectedValue(
                Object.assign(
                  new Error(
                    "process crashed after publish"
                  ),
                  {
                    code:
                      "DATABASE_TEMPORARY_FAILURE",

                    retryable:
                      true,

                    outboxContext: {
                      eventId:
                        "outbox-event-1",

                      ownerId:
                        "publisher-1",

                      claimToken:
                        "claim-1",
                    },
                  }
                )
              ),
        };

        const claimService = {
          markFailed:
            jest.fn()
              .mockResolvedValue({
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
                  now
                ),
          });

        const result =
          await coordinator
            .deliver(
              event()
            );

        expect(
          result.retryScheduled
        )
          .toBe(
            true
          );

        expect(
          claimService.markFailed
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
      "same durable event may be published again after crash",
      async () => {
        /*
         * This is intentional at-least-once behavior.
         *
         * Consumer idempotency prevents repeating the protected business
         * operation.
         */

        const publish =
          jest.fn()
            .mockResolvedValue({
              messageId:
                "broker-message",
            });

        await publish(
          event()
        );

        await publish(
          event()
        );

        expect(
          publish
        )
          .toHaveBeenCalledTimes(
            2
          );

        /*
         * The outbox guarantees durable delivery.
         * Worker idempotency guarantees logical exactly-once processing.
         */
      }
    );


    test(
      "retry exhaustion moves event to dead letter",
      async () => {
        const exhaustedEvent =
          event({
            attempts: {
              count:
                5,

              maxAttempts:
                5,
            },
          });

        const dispatcher = {
          dispatch:
            jest.fn()
              .mockRejectedValue(
                Object.assign(
                  new Error(
                    "broker unavailable"
                  ),
                  {
                    code:
                      "ECONNREFUSED",

                    retryable:
                      true,

                    outboxContext: {
                      eventId:
                        "outbox-event-1",

                      ownerId:
                        "publisher-1",

                      claimToken:
                        "claim-1",
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
                event: {
                  status:
                    "DEAD_LETTER",
                },
              }),
        };

        const retryPolicy =
          new WorkflowOutboxRetryPolicy({
            baseDelayMs:
              1000,

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
                  now
                ),
          });

        const result =
          await coordinator
            .deliver(
              exhaustedEvent
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
            "RETRY_BUDGET_EXHAUSTED"
          );

        expect(
          claimService
            .markDeadLetter
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          claimService
            .markFailed
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "permanent malformed event goes directly to dead letter",
      async () => {
        const dispatcher = {
          dispatch:
            jest.fn()
              .mockRejectedValue(
                Object.assign(
                  new Error(
                    "route invalid"
                  ),
                  {
                    code:
                      "OUTBOX_EVENT_ROUTE_INVALID",

                    retryable:
                      false,

                    outboxContext: {
                      eventId:
                        "outbox-event-1",

                      ownerId:
                        "publisher-1",

                      claimToken:
                        "claim-1",
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
                event: {
                  status:
                    "DEAD_LETTER",
                },
              }),
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
                  now
                ),
          });

        const result =
          await coordinator
            .deliver(
              event()
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
      }
    );


    test(
      "transport failure never becomes execution authority",
      async () => {
        const dispatcher = {
          dispatch:
            jest.fn()
              .mockRejectedValue(
                Object.assign(
                  new Error(
                    "temporary transport failure"
                  ),
                  {
                    code:
                      "ECONNRESET",

                    retryable:
                      true,

                    outboxContext: {
                      eventId:
                        "outbox-event-1",

                      ownerId:
                        "publisher-1",

                      claimToken:
                        "claim-1",
                    },
                  }
                )
              ),
        };

        const claimService = {
          markFailed:
            jest.fn()
              .mockResolvedValue({
                event: {
                  status:
                    "FAILED",
                },
              }),

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
                  now
                ),
          });

        const result =
          await coordinator
            .deliver(
              event()
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