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

const {
  OUTBOX_EVENT_TYPE,
  OUTBOX_AGGREGATE_TYPE,
} =
  require(
    "../workflowOutboxContracts"
  );

describe(
  "WorkflowOutboxDeliveryCoordinator",
  () => {
    const now =
      new Date(
        "2026-08-16T10:00:00.000Z"
      );

    let dispatcher;
    let claimService;
    let retryPolicy;
    let coordinator;

    function createEvent(
      overrides = {}
    ) {
      return {
        eventId:
          "event-1",

        eventKey:
          "event-key-1",

        organizationId:
          "org-1",

        environmentId:
          "prod",

        incidentId:
          "incident-1",

        aggregateType:
          OUTBOX_AGGREGATE_TYPE
            .VERIFICATION,

        aggregateId:
          "verification-1",

        eventType:
          OUTBOX_EVENT_TYPE
            .LIFECYCLE_REQUESTED,

        attempts: {
          count:
            1,

          maxAttempts:
            5,
        },

        payload: {
          executionAuthorized:
            false,
        },

        executionAuthorized:
          false,

        ...overrides,
      };
    }

    beforeEach(
      () => {
        dispatcher = {
          dispatch:
            jest.fn(),
        };

        claimService = {
          markFailed:
            jest.fn()
              .mockResolvedValue({
                failed:
                  true,

                event: {
                  status:
                    "FAILED",
                },
              }),

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

        retryPolicy =
          new WorkflowOutboxRetryPolicy({
            baseDelayMs:
              1000,

            maxDelayMs:
              16000,

            jitterRatio:
              0,
          });

        coordinator =
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
      }
    );

    test(
      "returns successful dispatcher result unchanged",
      async () => {
        const event =
          createEvent();

        dispatcher
          .dispatch
          .mockResolvedValue({
            dispatched:
              true,

            published:
              true,

            delivered:
              true,

            eventId:
              "event-1",

            executionAuthorized:
              false,
          });

        const result =
          await coordinator
            .deliver(
              event
            );

        expect(
          result.delivered
        )
          .toBe(
            true
          );

        expect(
          claimService
            .markFailed
        )
          .not
          .toHaveBeenCalled();

        expect(
          claimService
            .markDeadLetter
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
  "retryable publication failure schedules retry",
  async () => {
    const event =
      createEvent({
        attempts: {
          count:
            1,

          maxAttempts:
            5,
        },
      });

    dispatcher
      .dispatch
      .mockRejectedValue(
        Object.assign(
          new Error(
            "RabbitMQ unavailable"
          ),
          {
            code:
              "ECONNREFUSED",

            outboxContext: {
              eventId:
                "event-1",

              ownerId:
                "publisher-1",

              claimToken:
                "token-1",
            },
          }
        )
      );

    const result =
      await coordinator
        .deliver(
          event
        );

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
      result.delayMs
    )
      .toBe(
        1000
      );

    expect(
      result.nextAttemptAt
    )
      .toEqual(
        new Date(
          "2026-08-16T10:00:01.000Z"
        )
      );

    expect(
      claimService
        .markFailed
    )
      .toHaveBeenCalledWith({
        eventId:
          "event-1",

        organizationId:
          "org-1",

        environmentId:
          "prod",

        ownerId:
          "publisher-1",

        claimToken:
          "token-1",

        error:
          expect.objectContaining({
            code:
              "ECONNREFUSED",
          }),

        retryable:
          true,

        nextAttemptAt:
          new Date(
            "2026-08-16T10:00:01.000Z"
          ),

        now:
          now,
      });
  }
);

    test(
      "retry delay increases with attempt count",
      async () => {
        const event =
          createEvent({
            attempts: {
              count:
                3,

              maxAttempts:
                5,
            },
          });

        dispatcher
          .dispatch
          .mockRejectedValue(
            Object.assign(
              new Error(
                "Broker timeout"
              ),
              {
                code:
                  "ETIMEDOUT",

                outboxContext: {
                  eventId:
                    "event-1",

                  ownerId:
                    "publisher-1",

                  claimToken:
                    "token-1",
                },
              }
            )
          );

        const result =
          await coordinator
            .deliver(
              event
            );

        expect(
          result.delayMs
        )
          .toBe(
            4000
          );

        expect(
          result.nextAttemptAt
        )
          .toEqual(
            new Date(
              "2026-08-16T10:00:04.000Z"
            )
          );
      }
    );

    test(
      "retry budget exhaustion dead letters event",
      async () => {
        const event =
          createEvent({
            attempts: {
              count:
                5,

              maxAttempts:
                5,
            },
          });

        dispatcher
          .dispatch
          .mockRejectedValue(
            Object.assign(
              new Error(
                "RabbitMQ unavailable"
              ),
              {
                code:
                  "ECONNREFUSED",

                outboxContext: {
                  eventId:
                    "event-1",

                  ownerId:
                    "publisher-1",

                  claimToken:
                    "token-1",
                },
              }
            )
          );

        const result =
          await coordinator
            .deliver(
              event
            );

        expect(
          result.retryScheduled
        )
          .toBe(
            false
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
          .toHaveBeenCalledWith(
            expect.objectContaining({
              eventId:
                "event-1",

                 organizationId:
        "org-1",

      environmentId:
        "prod",

              ownerId:
                "publisher-1",

              claimToken:
                "token-1",
            })
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
      "non-retryable publication failure dead letters immediately",
      async () => {
        const event =
          createEvent();

        dispatcher
          .dispatch
          .mockRejectedValue(
            Object.assign(
              new Error(
                "Route invalid"
              ),
              {
                code:
                  "OUTBOX_EVENT_ROUTE_INVALID",

                outboxContext: {
                  eventId:
                    "event-1",

                  ownerId:
                    "publisher-1",

                  claimToken:
                    "token-1",
                },
              }
            )
          );

        const result =
          await coordinator
            .deliver(
              event
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
          claimService
            .markDeadLetter
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );

    test(
      "unknown failure fails closed into dead letter",
      async () => {
        const event =
          createEvent();

        dispatcher
          .dispatch
          .mockRejectedValue(
            Object.assign(
              new Error(
                "Unknown publisher failure"
              ),
              {
                code:
                  "UNKNOWN_BROKER_FAILURE",

                outboxContext: {
                  eventId:
                    "event-1",

                  ownerId:
                    "publisher-1",

                  claimToken:
                    "token-1",
                },
              }
            )
          );

        const result =
          await coordinator
            .deliver(
              event
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
      "failure without ownership context is rethrown",
      async () => {
        const event =
          createEvent();

        const originalError =
          Object.assign(
            new Error(
              "Unsafe payload"
            ),
            {
              code:
                "OUTBOX_UNSAFE_AUTHORITY",
            }
          );

        dispatcher
          .dispatch
          .mockRejectedValue(
            originalError
          );

        await expect(
          coordinator
            .deliver(
              event
            )
        )
          .rejects
          .toBe(
            originalError
          );

        expect(
          claimService
            .markFailed
        )
          .not
          .toHaveBeenCalled();

        expect(
          claimService
            .markDeadLetter
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "failure with missing claim token is rethrown",
      async () => {
        const event =
          createEvent();

        const error =
          Object.assign(
            new Error(
              "Failure"
            ),
            {
              code:
                "ECONNREFUSED",

              outboxContext: {
                eventId:
                  "event-1",

                ownerId:
                  "publisher-1",
              },
            }
          );

        dispatcher
          .dispatch
          .mockRejectedValue(
            error
          );

        await expect(
          coordinator
            .deliver(
              event
            )
        )
          .rejects
          .toBe(
            error
          );
      }
    );

    test(
      "coordinator never grants execution authorization on retry",
      async () => {
        const event =
          createEvent();

        dispatcher
          .dispatch
          .mockRejectedValue(
            Object.assign(
              new Error(
                "Broker unavailable"
              ),
              {
                code:
                  "ECONNREFUSED",

                outboxContext: {
                  eventId:
                    "event-1",

                  ownerId:
                    "publisher-1",

                  claimToken:
                    "token-1",
                },
              }
            )
          );

        const result =
          await coordinator
            .deliver(
              event
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
      "coordinator never grants execution authorization on dead letter",
      async () => {
        const event =
          createEvent();

        dispatcher
          .dispatch
          .mockRejectedValue(
            Object.assign(
              new Error(
                "Permanent failure"
              ),
              {
                code:
                  "OUTBOX_EVENT_ROUTE_INVALID",

                outboxContext: {
                  eventId:
                    "event-1",

                  ownerId:
                    "publisher-1",

                  claimToken:
                    "token-1",
                },
              }
            )
          );

        const result =
          await coordinator
            .deliver(
              event
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