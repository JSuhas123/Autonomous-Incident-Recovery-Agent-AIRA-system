"use strict";

const workflowOutboxDispatcher =
  require(
    "./workflowOutboxDispatcher"
  );

const workflowOutboxRetryPolicy =
  require(
    "./workflowOutboxRetryPolicy"
  );

const workflowOutboxClaimService =
  require(
    "./workflowOutboxClaimService"
  );

const {
  OUTBOX_ERROR_CODE,
} =
  require(
    "./workflowOutboxContracts"
  );

/*
 * ============================================================================
 * AIRA PHASE 11.3.7
 * WORKFLOW OUTBOX DELIVERY COORDINATOR
 * ============================================================================
 *
 * Responsibilities:
 *
 * 1. Dispatch a durable workflow outbox event.
 * 2. Handle successful delivery.
 * 3. Classify publication failures.
 * 4. Schedule retryable failures with backoff.
 * 5. Dead-letter permanent failures.
 * 6. Dead-letter retryable failures after retry budget exhaustion.
 *
 * IMPORTANT:
 *
 * This coordinator handles TRANSPORT DELIVERY only.
 *
 * It does NOT:
 *
 * - execute infrastructure
 * - retry infrastructure mutations
 * - grant execution authorization
 * - bypass protected workers
 * - modify recovery decisions
 * ============================================================================
 */

class WorkflowOutboxDeliveryCoordinator {
  constructor(
    options = {}
  ) {
    this.dispatcher =
      options.dispatcher ||
      workflowOutboxDispatcher;

    this.retryPolicy =
      options.retryPolicy ||
      workflowOutboxRetryPolicy;

    this.claimService =
      options.claimService ||
      workflowOutboxClaimService;

    this.now =
      options.now ||
      (() =>
        new Date());
  }

  // ==========================================================================
  // DELIVER
  // ==========================================================================

  async deliver(
    event,
    options = {}
  ) {
    this.assertEvent(
      event
    );

    try {
      /*
       * Dispatcher owns:
       *
       * claim
       * heartbeat
       * publication
       * markDelivered
       */
      return await this
        .dispatcher
        .dispatch(
          event,
          options
        );
    } catch (
      error
    ) {
      return this
        .handleDispatchFailure({
          event,
          error,
        });
    }
  }

  // ==========================================================================
  // FAILURE HANDLING
  // ==========================================================================

  async handleDispatchFailure({
    event,
    error,
  } = {}) {
    this.assertEvent(
      event
    );

    if (
      !error
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox dispatch failure requires error"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .DELIVERY_FAILED,
        }
      );
    }

    /*
     * Dispatcher attaches this only after it has successfully
     * claimed the event and entered the publication boundary.
     *
     * We need ownerId + claimToken to safely mutate the outbox
     * record after publication failure.
     */
    const context =
      error.outboxContext ||
      null;

    /*
     * Failure before ownership exists:
     *
     * Examples:
     *
     * - unsafe payload
     * - invalid event
     * - route resolution may fail after claim depending on
     *   dispatcher flow
     *
     * If no ownership context exists, we must not guess a token
     * and mutate the event.
     */
    if (
      !context ||
      !context.ownerId ||
      !context.claimToken
    ) {
      throw error;
    }

    const attemptCount =
      this.resolveAttemptCount(
        event
      );

    const maxAttempts =
      this.resolveMaxAttempts(
        event
      );

    const now =
      this.now();

    const decision =
      this.retryPolicy
        .evaluate({
          error,
          attemptCount,
          maxAttempts,
          now,
        });

    // ========================================================================
    // RETRY
    // ========================================================================

    if (
      decision.retry ===
      true
    ) {
      const failed =
        await this
          .claimService
          .markFailed({
            eventId:
              event.eventId,

            ownerId:
              context.ownerId,

            claimToken:
              context.claimToken,

            organizationId:
  event.organizationId,

environmentId:
  event.environmentId,

            error,

            retryable:
              true,

            nextAttemptAt:
              decision
                .nextAttemptAt,

            now,
          });

      return {
        delivered:
          false,

        retryScheduled:
          true,

        deadLettered:
          false,

        eventId:
          event.eventId,

        eventType:
          event.eventType,

        attemptCount,

        maxAttempts,

        delayMs:
          decision.delayMs,

        nextAttemptAt:
          decision
            .nextAttemptAt,

        reason:
          decision.reason,

        errorCode:
          error.code ||
          null,

        event:
          failed.event,

        executionAuthorized:
          false,
      };
    }

    // ========================================================================
    // DEAD LETTER
    // ========================================================================

    if (
      decision.deadLetter ===
      true
    ) {
      const reason =
        this.buildDeadLetterReason({
          error,
          decision,
          attemptCount,
          maxAttempts,
        });

      const deadLettered =
        await this
          .claimService
          .markDeadLetter({
            eventId:
              event.eventId,

            ownerId:
              context.ownerId,

            claimToken:
              context.claimToken,
            organizationId:
  event.organizationId,

environmentId:
  event.environmentId,

            reason,

            now,
          });

      return {
        delivered:
          false,

        retryScheduled:
          false,

        deadLettered:
          true,

        eventId:
          event.eventId,

        eventType:
          event.eventType,

        attemptCount,

        maxAttempts,

        reason:
          decision.reason,

        deadLetterReason:
          reason,

        errorCode:
          error.code ||
          null,

        event:
          deadLettered.event,

        executionAuthorized:
          false,
      };
    }

    /*
     * This should not normally happen because RetryPolicy.evaluate()
     * always resolves to RETRY or DEAD_LETTER.
     *
     * Unknown policy result fails closed.
     */
    throw Object.assign(
      new Error(
        "Workflow outbox retry policy returned unresolved delivery state"
      ),
      {
        code:
          OUTBOX_ERROR_CODE
            .DELIVERY_STATE_UNKNOWN,

        eventId:
          event.eventId,

        eventType:
          event.eventType,

        decision,
      }
    );
  }

  // ==========================================================================
  // ATTEMPTS
  // ==========================================================================

  resolveAttemptCount(
    event
  ) {
    const value =
      Number(
        event.attempts
          ?.count
      );

    /*
     * Dispatcher.claim() increments attempts.count when it successfully
     * claims an event.
     *
     * In normal production, the claimed event returned by claim() contains
     * the incremented count.
     *
     * The coordinator may receive an older event reference in tests or from
     * callers, so the minimum meaningful failed-attempt value is 1.
     */
    if (
      Number.isInteger(
        value
      ) &&
      value >=
        1
    ) {
      return value;
    }

    return 1;
  }

  resolveMaxAttempts(
    event
  ) {
    const value =
      Number(
        event.attempts
          ?.maxAttempts
      );

    if (
      !Number.isInteger(
        value
      ) ||
      value <
        1
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox event has invalid retry budget"
        ),
        {
          code:
            "OUTBOX_RETRY_BUDGET_INVALID",

          eventId:
            event.eventId,
        }
      );
    }

    return value;
  }

  // ==========================================================================
  // DEAD LETTER REASON
  // ==========================================================================

  buildDeadLetterReason({
    error,
    decision,
    attemptCount,
    maxAttempts,
  } = {}) {
    const code =
      error?.code ||
      "OUTBOX_DELIVERY_FAILED";

    if (
      decision.reason ===
      "RETRY_BUDGET_EXHAUSTED"
    ) {
      return [
        "Workflow outbox retry budget exhausted.",
        `event delivery failed after ${attemptCount} of ${maxAttempts} allowed attempts.`,
        `lastError=${code}`,
      ].join(
        " "
      );
    }

    return [
      "Workflow outbox delivery permanently failed.",
      `reason=${decision.reason}.`,
      `error=${code}`,
    ].join(
      " "
    );
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  assertEvent(
    event
  ) {
    if (
      !event ||
      typeof event !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox event is required"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .EVENT_REQUIRED,
        }
      );
    }

    if (
      !event.eventId
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox eventId is required"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .EVENT_ID_REQUIRED,
        }
      );
    }

    if (
      !event.eventType
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox eventType is required"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .EVENT_TYPE_REQUIRED,
        }
      );
    }

    return true;
  }
}

module.exports =
  new WorkflowOutboxDeliveryCoordinator();

module.exports
  .WorkflowOutboxDeliveryCoordinator =
  WorkflowOutboxDeliveryCoordinator;