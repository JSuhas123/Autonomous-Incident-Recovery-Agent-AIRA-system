"use strict";

const mongoose =
  require(
    "mongoose"
  );

const WorkflowOutboxEvent =
  require(
    "../WorkflowOutboxEvent"
  );

const {
  OUTBOX_STATUS,
  OUTBOX_EVENT_TYPE,
  OUTBOX_AGGREGATE_TYPE,
} =
  require(
    "../../services/workflowOutbox/workflowOutboxContracts"
  );

function createEvent(
  overrides = {}
) {
  return new WorkflowOutboxEvent({
    eventId:
      "event-1",

    eventKey:
      "verification:verification-1:LIFECYCLE_REQUESTED",

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
      verificationId:
        "verification-1",

      executionAuthorized:
        false,
    },

    executionAuthorized:
      false,

    ...overrides,
  });
}

describe(
  "WorkflowOutboxEvent",
  () => {
    afterEach(
      async () => {
        if (
          mongoose
            .connection
            .readyState ===
          1
        ) {
          await mongoose
            .connection
            .dropDatabase();
        }
      }
    );

    test(
      "creates pending event by default",
      async () => {
        const event =
          createEvent();

        await event
          .validate();

        expect(
          event.status
        )
          .toBe(
            OUTBOX_STATUS
              .PENDING
          );

        expect(
          event.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "supports aggregate and event identity",
      async () => {
        const event =
          createEvent();

        await event
          .validate();

        expect(
          event.aggregateType
        )
          .toBe(
            OUTBOX_AGGREGATE_TYPE
              .VERIFICATION
          );

        expect(
          event.eventType
        )
          .toBe(
            OUTBOX_EVENT_TYPE
              .LIFECYCLE_REQUESTED
          );

        expect(
          event.aggregateId
        )
          .toBe(
            "verification-1"
          );
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
          event.validate()
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_UNSAFE_AUTHORITY",
          });
      }
    );

    test(
      "rejects payload execution authorization",
      async () => {
        const event =
          createEvent({
            payload: {
              executionAuthorized:
                true,
            },
          });

        await expect(
          event.validate()
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_UNSAFE_AUTHORITY",
          });
      }
    );

    test(
      "rejects payload authorization grant",
      async () => {
        const event =
          createEvent({
            payload: {
              authorizationGranted:
                true,
            },
          });

        await expect(
          event.validate()
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_UNSAFE_AUTHORITY",
          });
      }
    );

    test(
      "detects delivered state",
      () => {
        const event =
          createEvent({
            status:
              OUTBOX_STATUS
                .DELIVERED,
          });

        expect(
          event.isDelivered()
        )
          .toBe(
            true
          );
      }
    );

    test(
      "detects dead-letter state",
      () => {
        const event =
          createEvent({
            status:
              OUTBOX_STATUS
                .DEAD_LETTER,
          });

        expect(
          event.isDeadLetter()
        )
          .toBe(
            true
          );
      }
    );

    test(
      "detects active lease",
      () => {
        const now =
          new Date(
            "2026-08-16T10:00:00.000Z"
          );

        const event =
          createEvent({
            owner: {
              workerId:
                "worker-1",

              claimToken:
                "token-1",

              leaseExpiresAt:
                new Date(
                  "2026-08-16T10:05:00.000Z"
                ),
            },
          });

        expect(
          event.hasActiveLease(
            now
          )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "expired lease is not active",
      () => {
        const now =
          new Date(
            "2026-08-16T10:10:00.000Z"
          );

        const event =
          createEvent({
            owner: {
              workerId:
                "worker-1",

              claimToken:
                "token-1",

              leaseExpiresAt:
                new Date(
                  "2026-08-16T10:05:00.000Z"
                ),
            },
          });

        expect(
          event.hasActiveLease(
            now
          )
        )
          .toBe(
            false
          );
      }
    );

    test(
      "pending event can attempt immediately",
      () => {
        const event =
          createEvent();

        expect(
          event.canAttempt(
            new Date()
          )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "event waiting for next retry cannot attempt",
      () => {
        const now =
          new Date(
            "2026-08-16T10:00:00.000Z"
          );

        const event =
          createEvent({
            attempts: {
              count:
                1,

              maxAttempts:
                10,

              nextAttemptAt:
                new Date(
                  "2026-08-16T10:05:00.000Z"
                ),
            },
          });

        expect(
          event.canAttempt(
            now
          )
        )
          .toBe(
            false
          );
      }
    );

    test(
      "delivered event cannot attempt again",
      () => {
        const event =
          createEvent({
            status:
              OUTBOX_STATUS
                .DELIVERED,
          });

        expect(
          event.canAttempt()
        )
          .toBe(
            false
          );
      }
    );

    test(
      "dead-letter event cannot attempt again",
      () => {
        const event =
          createEvent({
            status:
              OUTBOX_STATUS
                .DEAD_LETTER,
          });

        expect(
          event.canAttempt()
        )
          .toBe(
            false
          );
      }
    );

    test(
      "event cannot attempt after retry budget exhausted",
      () => {
        const event =
          createEvent({
            attempts: {
              count:
                10,

              maxAttempts:
                10,
            },
          });

        expect(
          event.canAttempt()
        )
          .toBe(
            false
          );
      }
    );
  }
);