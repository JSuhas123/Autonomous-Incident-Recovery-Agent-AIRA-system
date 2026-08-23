"use strict";

const {
  WorkflowOutboxDispatcher,
} =
  require(
    "../workflowOutboxDispatcher"
  );

const {
  OUTBOX_EVENT_TYPE,
  OUTBOX_AGGREGATE_TYPE,
} =
  require(
    "../workflowOutboxContracts"
  );

describe(
  "WorkflowOutboxDispatcher",
  () => {
    let claimService;
    let publish;
    let dispatcher;

    const fixedNow =
      new Date(
        "2026-08-16T10:00:00.000Z"
      );

    function createEvent(
      overrides = {}
    ) {
      return {
        eventId:
          "event-1",

        eventKey:
          "org-1:prod:VERIFICATION:verification-1:LIFECYCLE_REQUESTED:recovered",

        payloadFingerprint:
          "fingerprint-1",

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

        payload: {
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
        },

        metadata: {
          correlationId:
            "correlation-1",
        },

        executionAuthorized:
          false,

        ...overrides,
      };
    }

    beforeEach(
      () => {
        publish =
          jest.fn()
            .mockResolvedValue({
              messageId:
                "broker-message-1",

              queue:
                "lifecycle",
            });

        claimService = {
          claim:
            jest.fn(),

          heartbeat:
            jest.fn()
              .mockResolvedValue({
                heartbeated:
                  true,
              }),

          markDelivered:
            jest.fn()
              .mockResolvedValue({
                delivered:
                  true,

                event: {
                  ...createEvent(),

                  status:
                    "DELIVERED",
                },
              }),
        };

        dispatcher =
          new WorkflowOutboxDispatcher({
            claimService,

            ownerId:
              "publisher-1",

            leaseMs:
              60000,

            now:
              () =>
                new Date(
                  fixedNow
                ),

            generateMessageId:
              () =>
                "transport-message-1",

            publishers: {
              [OUTBOX_EVENT_TYPE
                .LIFECYCLE_REQUESTED]: {
                name:
                  "lifecycle-requested",

                queue:
                  "lifecycle",

                publish,
              },
            },
          });
      }
    );

    test(
  "claims and publishes durable handoff",
  async () => {
    const event =
      createEvent();

    claimService
      .claim
      .mockResolvedValue({
        claimed:
          true,

        event,

        ownerId:
          "publisher-1",

        claimToken:
          "claim-token-1",

        leaseExpiresAt:
          new Date(
            "2026-08-16T10:01:00.000Z"
          ),
      });

    const result =
      await dispatcher
        .dispatch(
          event
        );

    expect(
      claimService.claim
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

        leaseMs:
          60000,

        now:
          fixedNow,
      });

    expect(
      publish
    )
      .toHaveBeenCalledTimes(
        1
      );

    expect(
      result.dispatched
    )
      .toBe(
        true
      );

    expect(
      result.published
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
      "does not publish when event is already delivered",
      async () => {
        const event =
          createEvent();

        claimService
          .claim
          .mockResolvedValue({
            claimed:
              false,

            decision:
              "ALREADY_DELIVERED",

            event,
          });

        const result =
          await dispatcher
            .dispatch(
              event
            );

        expect(
          publish
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.dispatched
        )
          .toBe(
            false
          );

        expect(
          result.decision
        )
          .toBe(
            "ALREADY_DELIVERED"
          );
      }
    );

    test(
      "does not publish when another publisher owns active lease",
      async () => {
        const event =
          createEvent();

        claimService
          .claim
          .mockResolvedValue({
            claimed:
              false,

            decision:
              "LEASE_ACTIVE",

            event,
          });

        const result =
          await dispatcher
            .dispatch(
              event
            );

        expect(
          publish
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.decision
        )
          .toBe(
            "LEASE_ACTIVE"
          );
      }
    );

    test(
  "heartbeats before external queue publication",
  async () => {
    const event =
      createEvent();

    claimService
      .claim
      .mockResolvedValue({
        claimed:
          true,

        event,

        claimToken:
          "claim-token-1",
      });

    await dispatcher
      .dispatch(
        event
      );

    expect(
      claimService
        .heartbeat
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
          "claim-token-1",

        leaseMs:
          60000,

        now:
          fixedNow,
      });

    const heartbeatOrder =
      claimService
        .heartbeat
        .mock
        .invocationCallOrder[0];

    const publishOrder =
      publish
        .mock
        .invocationCallOrder[0];

    expect(
      heartbeatOrder
    )
      .toBeLessThan(
        publishOrder
      );
  }
);

    test(
      "marks event delivered after successful publication",
      async () => {
        const event =
          createEvent();

        claimService
          .claim
          .mockResolvedValue({
            claimed:
              true,

            event,

            claimToken:
              "claim-token-1",
          });

        await dispatcher
          .dispatch(
            event
          );

        expect(
          claimService
            .markDelivered
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
                "claim-token-1",

              messageId:
                "broker-message-1",

              queue:
                "lifecycle",
            })
          );
      }
    );

    test(
      "outbound message never grants execution authorization",
      async () => {
        const event =
          createEvent();

        claimService
          .claim
          .mockResolvedValue({
            claimed:
              true,

            event,

            claimToken:
              "claim-token-1",
          });

        await dispatcher
          .dispatch(
            event
          );

        const message =
          publish
            .mock
            .calls[0][0];

        expect(
          message
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          message
            .payload
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "rejects payload attempting to grant execution authorization",
      async () => {
        const event =
          createEvent({
            payload: {
              executionAuthorized:
                true,
            },
          });

        await expect(
          dispatcher
            .dispatch(
              event
            )
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_UNSAFE_AUTHORITY",
          });

        expect(
          claimService.claim
        )
          .not
          .toHaveBeenCalled();

        expect(
          publish
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "rejects top-level execution authorization",
      async () => {
        const event =
          createEvent({
            executionAuthorized:
              true,
          });

        await expect(
          dispatcher
            .dispatch(
              event
            )
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_UNSAFE_AUTHORITY",
          });

        expect(
          publish
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "unknown publisher route fails closed",
      async () => {
        const event =
          createEvent({
            eventType:
              OUTBOX_EVENT_TYPE
                .VERIFICATION_REQUESTED,
          });

        claimService
          .claim
          .mockResolvedValue({
            claimed:
              true,

            event,

            claimToken:
              "claim-token-1",
          });

        await expect(
          dispatcher
            .dispatch(
              event
            )
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_EVENT_ROUTE_NOT_CONFIGURED",
          });

        expect(
          publish
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "publisher failure preserves ownership context for retry layer",
      async () => {
        const event =
          createEvent();

        claimService
          .claim
          .mockResolvedValue({
            claimed:
              true,

            event,

            claimToken:
              "claim-token-1",
          });

        publish
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

        let thrown;

        try {
          await dispatcher
            .dispatch(
              event
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
          .toBeDefined();

        expect(
          thrown.code
        )
          .toBe(
            "ECONNREFUSED"
          );

        expect(
          thrown
            .outboxContext
        )
          .toMatchObject({
            eventId:
              "event-1",

            ownerId:
              "publisher-1",

            claimToken:
              "claim-token-1",

            route:
              "lifecycle-requested",

            queue:
              "lifecycle",
          });

        expect(
          claimService
            .markDelivered
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "buildMessage preserves durable outbox identity",
      () => {
        const message =
          dispatcher
            .buildMessage({
              event:
                createEvent(),

              messageId:
                "message-123",
            });

        expect(
          message
            .outboxEventId
        )
          .toBe(
            "event-1"
          );

        expect(
          message
            .metadata
            .outbox
        )
          .toMatchObject({
            eventId:
              "event-1",

            payloadFingerprint:
              "fingerprint-1",

            aggregateId:
              "verification-1",
          });
      }
    );

    test(
      "configured publisher may override returned transport metadata",
      async () => {
        const event =
          createEvent();

        publish
          .mockResolvedValue({
            messageId:
              "actual-message-id",

            queue:
              "actual-lifecycle-queue",

            exchange:
              "aira.workflow",

            routingKey:
              "lifecycle.requested",
          });

        claimService
          .claim
          .mockResolvedValue({
            claimed:
              true,

            event,

            claimToken:
              "claim-token-1",
          });

        const result =
          await dispatcher
            .dispatch(
              event
            );

        expect(
          result.messageId
        )
          .toBe(
            "actual-message-id"
          );

        expect(
          result.queue
        )
          .toBe(
            "actual-lifecycle-queue"
          );

        expect(
          result.exchange
        )
          .toBe(
            "aira.workflow"
          );

        expect(
          result.routingKey
        )
          .toBe(
            "lifecycle.requested"
          );
      }
    );
  }
);