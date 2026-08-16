"use strict";

const {
  LifecycleOutboxJobAdapter,
} =
  require(
    "../lifecycleOutboxJobAdapter"
  );

describe(
  "LifecycleOutboxJobAdapter",
  () => {
    let adapter;

    beforeEach(
      () => {
        adapter =
          new LifecycleOutboxJobAdapter();
      }
    );

    function message(
      overrides = {}
    ) {
      return {
        messageId:
          "message-1",

        outboxEventId:
          "outbox-event-1",

        outboxEventKey:
          "outbox-key-1",

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
            "verification-hash-1",

          verificationOutcome: {
            outcome:
              "RECOVERED",

            confidence:
              0.98,
          },

          correlationId:
            "correlation-1",

          causationId:
            "verification-1",

          executionAuthorized:
            false,
        },

        executionAuthorized:
          false,

        ...overrides,
      };
    }

    test(
      "builds lifecycle worker job from outbox message",
      () => {
        const job =
          adapter.buildJob(
            message()
          );

        expect(
          job
        )
          .toMatchObject({
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
              "verification-hash-1",

            executionAuthorized:
              false,
          });
      }
    );

    test(
      "preserves verification outcome",
      () => {
        const job =
          adapter.buildJob(
            message()
          );

        expect(
          job.verificationOutcome
        )
          .toEqual({
            outcome:
              "RECOVERED",

            confidence:
              0.98,
          });

        expect(
          job.verification
            .outcome
        )
          .toEqual({
            outcome:
              "RECOVERED",

            confidence:
              0.98,
          });
      }
    );

    test(
      "preserves outbox identity for audit",
      () => {
        const job =
          adapter.buildJob(
            message()
          );

        expect(
          job.outboxEventId
        )
          .toBe(
            "outbox-event-1"
          );

        expect(
          job.outboxEventKey
        )
          .toBe(
            "outbox-key-1"
          );
      }
    );

    test(
      "correlation defaults safely",
      () => {
        const input =
          message();

        delete input.payload
          .correlationId;

        const job =
          adapter.buildJob(
            input
          );

        expect(
          job.correlationId
        )
          .toBe(
            "execution-request-1"
          );
      }
    );

    test(
      "missing verification id fails closed",
      () => {
        const input =
          message();

        delete input.payload
          .verificationId;

        expect(
          () =>
            adapter.buildJob(
              input
            )
        )
          .toThrow(
            expect.objectContaining({
              code:
                "LIFECYCLE_OUTBOX_JOB_IDENTITY_REQUIRED",

              field:
                "verificationId",
            })
          );
      }
    );

    test(
      "missing verification plan hash fails closed",
      () => {
        const input =
          message();

        delete input.payload
          .verificationPlanHash;

        expect(
          () =>
            adapter.buildJob(
              input
            )
        )
          .toThrow(
            expect.objectContaining({
              field:
                "verificationPlanHash",
            })
          );
      }
    );

    test(
      "rejects payload execution authority",
      () => {
        const input =
          message();

        input.payload
          .executionAuthorized =
          true;

        expect(
          () =>
            adapter.buildJob(
              input
            )
        )
          .toThrow(
            expect.objectContaining({
              code:
                "OUTBOX_UNSAFE_AUTHORITY",
            })
          );
      }
    );

    test(
      "rejects top-level execution authority",
      () => {
        const input =
          message({
            executionAuthorized:
              true,
          });

        expect(
          () =>
            adapter.buildJob(
              input
            )
        )
          .toThrow(
            expect.objectContaining({
              code:
                "OUTBOX_UNSAFE_AUTHORITY",
            })
          );
      }
    );
  }
);