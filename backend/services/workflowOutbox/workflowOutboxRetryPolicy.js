"use strict";

/*
 * ============================================================================
 * AIRA PHASE 11.3.7
 * WORKFLOW OUTBOX RETRY POLICY
 * ============================================================================
 *
 * Responsibilities:
 *
 * 1. Classify temporary/retryable transport failures.
 * 2. Classify permanent/non-retryable failures.
 * 3. Apply exponential backoff.
 * 4. Apply bounded jitter.
 * 5. Respect maximum retry budget.
 * 6. Produce the nextAttemptAt timestamp.
 * 7. Decide when an event must be dead-lettered.
 *
 * IMPORTANT:
 *
 * This policy controls TRANSPORT retries only.
 *
 * It does NOT:
 *
 * - authorize execution
 * - retry infrastructure actions
 * - bypass workers
 * - alter recovery decisions
 * - alter execution plans
 * ============================================================================
 */

class WorkflowOutboxRetryPolicy {
  constructor(
    options = {}
  ) {
    this.baseDelayMs =
      options.baseDelayMs ??
      1000;

    this.maxDelayMs =
      options.maxDelayMs ??
      5 * 60 * 1000;

    this.jitterRatio =
      options.jitterRatio ??
      0.2;

    this.random =
      options.random ||
      Math.random;

    this.retryableCodes =
      new Set(
        options.retryableCodes ||
        [
          "ECONNRESET",
          "ECONNREFUSED",
          "ETIMEDOUT",
          "EPIPE",
          "ENETDOWN",
          "ENETUNREACH",
          "EHOSTUNREACH",

          "QUEUE_TEMPORARY_FAILURE",
          "BROKER_TEMPORARY_FAILURE",
          "BROKER_UNAVAILABLE",
          "BROKER_CONNECTION_CLOSED",
          "BROKER_CHANNEL_CLOSED",
          "BROKER_CONFIRM_TIMEOUT",

          "RABBITMQ_UNAVAILABLE",
          "RABBITMQ_CONNECTION_ERROR",
          "RABBITMQ_CHANNEL_ERROR",
          "RABBITMQ_CONFIRM_TIMEOUT",
        ]
      );

    this.nonRetryableCodes =
      new Set(
        options.nonRetryableCodes ||
        [
          "OUTBOX_UNSAFE_AUTHORITY",
          "OUTBOX_EVENT_ROUTE_NOT_CONFIGURED",
          "OUTBOX_EVENT_ROUTE_INVALID",
          "OUTBOX_EVENT_IDENTITY_CONFLICT",
          "OUTBOX_EVENT_PAYLOAD_CONFLICT",
          "OUTBOX_CLAIM_TOKEN_MISMATCH",
          "OUTBOX_CLAIM_TOKEN_REQUIRED",
          "OUTBOX_TENANT_SCOPE_REQUIRED",
          "OUTBOX_AGGREGATE_REQUIRED",
          "OUTBOX_EVENT_TYPE_REQUIRED",
          "OUTBOX_EVENT_REQUIRED",
          "OUTBOX_PAYLOAD_INVALID",

          "EXECUTION_AUTHORIZATION_REQUIRED",
          "EXECUTION_AUTHORIZATION_INVALID",
          "EXECUTION_PLAN_MISMATCH",
          "POLICY_REJECTED",
        ]
      );
  }

  // ==========================================================================
  // CLASSIFICATION
  // ==========================================================================

  isRetryable(
    error
  ) {
    if (
      !error
    ) {
      return false;
    }

    /*
     * Explicit false always wins.
     */
    if (
      error.retryable ===
      false
    ) {
      return false;
    }

    const code =
      error.code
        ? String(
            error.code
          )
        : null;

    if (
      code &&
      this.nonRetryableCodes
        .has(
          code
        )
    ) {
      return false;
    }

    /*
     * Explicit true is accepted only after known permanent
     * failures have been rejected above.
     */
    if (
      error.retryable ===
      true
    ) {
      return true;
    }

    if (
      code &&
      this.retryableCodes
        .has(
          code
        )
    ) {
      return true;
    }

    /*
     * Unknown failures fail closed.
     *
     * We do NOT blindly retry arbitrary exceptions because they
     * may represent malformed payloads, programming bugs, or
     * permanent configuration errors.
     */
    return false;
  }

  // ==========================================================================
  // BACKOFF
  // ==========================================================================

  calculateBaseDelay(
    attemptCount
  ) {
    this.assertAttemptCount(
      attemptCount
    );

    /*
     * attemptCount represents the attempt that just failed.
     *
     * attempt 1 -> base
     * attempt 2 -> base * 2
     * attempt 3 -> base * 4
     */
    const exponent =
      Math.max(
        0,
        attemptCount -
          1
      );

    const delay =
      this.baseDelayMs *
      Math.pow(
        2,
        exponent
      );

    return Math.min(
      delay,
      this.maxDelayMs
    );
  }

  applyJitter(
    delayMs
  ) {
    if (
      !Number.isFinite(
        delayMs
      ) ||
      delayMs <
        0
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox retry delay must be non-negative"
        ),
        {
          code:
            "OUTBOX_RETRY_DELAY_INVALID",
        }
      );
    }

    if (
      this.jitterRatio ===
      0
    ) {
      return Math.round(
        delayMs
      );
    }

    /*
     * random() = 0   -> -jitterRatio
     * random() = .5  -> no jitter
     * random() = 1   -> +jitterRatio
     */
    const normalizedRandom =
      Math.max(
        0,
        Math.min(
          1,
          Number(
            this.random()
          )
        )
      );

    const offset =
      (
        normalizedRandom *
          2 -
        1
      ) *
      this.jitterRatio;

    const jittered =
      delayMs *
      (
        1 +
        offset
      );

    return Math.max(
      0,
      Math.round(
        jittered
      )
    );
  }

  calculateDelay(
    attemptCount
  ) {
    return this.applyJitter(
      this.calculateBaseDelay(
        attemptCount
      )
    );
  }

  // ==========================================================================
  // RETRY DECISION
  // ==========================================================================

  evaluate({
    error,
    attemptCount,
    maxAttempts,
    now =
      new Date(),
  } = {}) {
    this.assertAttemptCount(
      attemptCount
    );

    this.assertMaxAttempts(
      maxAttempts
    );

    const currentTime =
      this.normalizeDate(
        now
      );

    const retryable =
      this.isRetryable(
        error
      );

    /*
     * The current attempt has already consumed one slot.
     */
    const exhausted =
      attemptCount >=
      maxAttempts;

    if (
      !retryable
    ) {
      return {
        retry:
          false,

        retryable:
          false,

        exhausted,

        deadLetter:
          true,

        reason:
          "NON_RETRYABLE_FAILURE",

        delayMs:
          null,

        nextAttemptAt:
          null,
      };
    }

    if (
      exhausted
    ) {
      return {
        retry:
          false,

        retryable:
          true,

        exhausted:
          true,

        deadLetter:
          true,

        reason:
          "RETRY_BUDGET_EXHAUSTED",

        delayMs:
          null,

        nextAttemptAt:
          null,
      };
    }

    const delayMs =
      this.calculateDelay(
        attemptCount
      );

    const nextAttemptAt =
      new Date(
        currentTime.getTime() +
          delayMs
      );

    return {
      retry:
        true,

      retryable:
        true,

      exhausted:
        false,

      deadLetter:
        false,

      reason:
        "RETRY_SCHEDULED",

      delayMs,

      nextAttemptAt,
    };
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  assertAttemptCount(
    attemptCount
  ) {
    if (
      !Number.isInteger(
        attemptCount
      ) ||
      attemptCount <
        1
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox attemptCount must be a positive integer"
        ),
        {
          code:
            "OUTBOX_RETRY_ATTEMPT_INVALID",
        }
      );
    }

    return true;
  }

  assertMaxAttempts(
    maxAttempts
  ) {
    if (
      !Number.isInteger(
        maxAttempts
      ) ||
      maxAttempts <
        1
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox maxAttempts must be a positive integer"
        ),
        {
          code:
            "OUTBOX_RETRY_BUDGET_INVALID",
        }
      );
    }

    return true;
  }

  normalizeDate(
    value
  ) {
    const normalized =
      value instanceof Date
        ? new Date(
            value.getTime()
          )
        : new Date(
            value
          );

    if (
      Number.isNaN(
        normalized.getTime()
      )
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox retry now must be a valid date"
        ),
        {
          code:
            "OUTBOX_RETRY_DATE_INVALID",
        }
      );
    }

    return normalized;
  }
}

module.exports =
  new WorkflowOutboxRetryPolicy();

module.exports
  .WorkflowOutboxRetryPolicy =
  WorkflowOutboxRetryPolicy;