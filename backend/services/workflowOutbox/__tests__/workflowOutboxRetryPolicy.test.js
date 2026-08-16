"use strict";

const {
  WorkflowOutboxRetryPolicy,
} =
  require(
    "../workflowOutboxRetryPolicy"
  );

describe(
  "WorkflowOutboxRetryPolicy",
  () => {
    const now =
      new Date(
        "2026-08-16T10:00:00.000Z"
      );

    function createPolicy(
      overrides = {}
    ) {
      return new WorkflowOutboxRetryPolicy({
        baseDelayMs:
          1000,

        maxDelayMs:
          16000,

        jitterRatio:
          0,

        random:
          () =>
            0.5,

        ...overrides,
      });
    }

    test(
      "classifies connection refused as retryable",
      () => {
        const policy =
          createPolicy();

        expect(
          policy.isRetryable({
            code:
              "ECONNREFUSED",
          })
        )
          .toBe(
            true
          );
      }
    );

    test(
      "classifies connection reset as retryable",
      () => {
        const policy =
          createPolicy();

        expect(
          policy.isRetryable({
            code:
              "ECONNRESET",
          })
        )
          .toBe(
            true
          );
      }
    );

    test(
      "classifies broker outage as retryable",
      () => {
        const policy =
          createPolicy();

        expect(
          policy.isRetryable({
            code:
              "BROKER_UNAVAILABLE",
          })
        )
          .toBe(
            true
          );
      }
    );

    test(
      "unknown failure fails closed",
      () => {
        const policy =
          createPolicy();

        expect(
          policy.isRetryable({
            code:
              "SOMETHING_UNKNOWN",
          })
        )
          .toBe(
            false
          );
      }
    );

    test(
      "explicit retryable true permits retry",
      () => {
        const policy =
          createPolicy();

        expect(
          policy.isRetryable({
            code:
              "CUSTOM_TEMPORARY_ERROR",

            retryable:
              true,
          })
        )
          .toBe(
            true
          );
      }
    );

    test(
      "explicit retryable false blocks known retryable code",
      () => {
        const policy =
          createPolicy();

        expect(
          policy.isRetryable({
            code:
              "ECONNREFUSED",

            retryable:
              false,
          })
        )
          .toBe(
            false
          );
      }
    );

    test(
      "permanent safety failure cannot be overridden by retryable true",
      () => {
        const policy =
          createPolicy();

        expect(
          policy.isRetryable({
            code:
              "OUTBOX_UNSAFE_AUTHORITY",

            retryable:
              true,
          })
        )
          .toBe(
            false
          );
      }
    );

    test(
      "first failure uses base delay",
      () => {
        const policy =
          createPolicy();

        expect(
          policy.calculateDelay(
            1
          )
        )
          .toBe(
            1000
          );
      }
    );

    test(
      "second failure doubles delay",
      () => {
        const policy =
          createPolicy();

        expect(
          policy.calculateDelay(
            2
          )
        )
          .toBe(
            2000
          );
      }
    );

    test(
      "third failure doubles again",
      () => {
        const policy =
          createPolicy();

        expect(
          policy.calculateDelay(
            3
          )
        )
          .toBe(
            4000
          );
      }
    );

    test(
      "backoff is capped",
      () => {
        const policy =
          createPolicy();

        expect(
          policy.calculateDelay(
            10
          )
        )
          .toBe(
            16000
          );
      }
    );

    test(
      "jitter can reduce delay",
      () => {
        const policy =
          createPolicy({
            jitterRatio:
              0.2,

            random:
              () =>
                0,
          });

        expect(
          policy.calculateDelay(
            1
          )
        )
          .toBe(
            800
          );
      }
    );

    test(
      "jitter can increase delay",
      () => {
        const policy =
          createPolicy({
            jitterRatio:
              0.2,

            random:
              () =>
                1,
          });

        expect(
          policy.calculateDelay(
            1
          )
        )
          .toBe(
            1200
          );
      }
    );

    test(
      "retryable failure schedules next attempt",
      () => {
        const policy =
          createPolicy();

        const result =
          policy.evaluate({
            error: {
              code:
                "ECONNREFUSED",
            },

            attemptCount:
              1,

            maxAttempts:
              5,

            now,
          });

        expect(
          result.retry
        )
          .toBe(
            true
          );

        expect(
          result.deadLetter
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
      }
    );

    test(
      "retry budget exhaustion dead letters retryable failure",
      () => {
        const policy =
          createPolicy();

        const result =
          policy.evaluate({
            error: {
              code:
                "ECONNREFUSED",
            },

            attemptCount:
              5,

            maxAttempts:
              5,

            now,
          });

        expect(
          result.retry
        )
          .toBe(
            false
          );

        expect(
          result.retryable
        )
          .toBe(
            true
          );

        expect(
          result.exhausted
        )
          .toBe(
            true
          );

        expect(
          result.deadLetter
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
      }
    );

    test(
      "non retryable failure is dead lettered immediately",
      () => {
        const policy =
          createPolicy();

        const result =
          policy.evaluate({
            error: {
              code:
                "OUTBOX_EVENT_ROUTE_NOT_CONFIGURED",
            },

            attemptCount:
              1,

            maxAttempts:
              5,

            now,
          });

        expect(
          result.retry
        )
          .toBe(
            false
          );

        expect(
          result.retryable
        )
          .toBe(
            false
          );

        expect(
          result.deadLetter
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
      "rejects zero attempt count",
      () => {
        const policy =
          createPolicy();

        expect(
          () =>
            policy.evaluate({
              error: {
                code:
                  "ECONNREFUSED",
              },

              attemptCount:
                0,

              maxAttempts:
                5,

              now,
            })
        )
          .toThrow(
            expect.objectContaining({
              code:
                "OUTBOX_RETRY_ATTEMPT_INVALID",
            })
          );
      }
    );

    test(
      "rejects invalid retry budget",
      () => {
        const policy =
          createPolicy();

        expect(
          () =>
            policy.evaluate({
              error: {
                code:
                  "ECONNREFUSED",
              },

              attemptCount:
                1,

              maxAttempts:
                0,

              now,
            })
        )
          .toThrow(
            expect.objectContaining({
              code:
                "OUTBOX_RETRY_BUDGET_INVALID",
            })
          );
      }
    );
  }
);