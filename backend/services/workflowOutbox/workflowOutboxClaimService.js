"use strict";

const crypto =
  require(
    "crypto"
  );

const WorkflowOutboxEvent =
  require(
    "../../models/WorkflowOutboxEvent"
  );

const {
  OUTBOX_STATUS,
  OUTBOX_ERROR_CODE,
  DEFAULT_OUTBOX_LEASE_MS,
} =
  require(
    "./workflowOutboxContracts"
  );

/*
 * ============================================================================
 * AIRA PHASE 11.3.5
 * WORKFLOW OUTBOX CLAIM SERVICE
 * ============================================================================
 *
 * Responsibilities:
 *
 * 1. Atomically claim a deliverable outbox event.
 * 2. Assign ownerId + claimToken + lease.
 * 3. Heartbeat only while ownership remains valid.
 * 4. Mark delivered only by the current valid owner.
 * 5. Mark failed only by the current valid owner.
 * 6. Fence stale publishers after ownership changes.
 *
 * IMPORTANT:
 *
 * Claim ownership is NOT execution authorization.
 *
 * It only controls which publisher may deliver this workflow event.
 * ============================================================================
 */

class WorkflowOutboxClaimService {
  constructor(
    options = {}
  ) {
    this.WorkflowOutboxEvent =
      options.WorkflowOutboxEvent ||
      WorkflowOutboxEvent;

    this.now =
      options.now ||
      (() =>
        new Date());

    this.generateClaimToken =
      options.generateClaimToken ||
      (() =>
        crypto
          .randomBytes(
            24
          )
          .toString(
            "hex"
          ));
  }

  // ==========================================================================
  // CLAIM
  // ==========================================================================

  async claim({
    eventId,
    ownerId,
    leaseMs =
      DEFAULT_OUTBOX_LEASE_MS,
    now =
      this.now(),
  } = {}) {
    this.assertClaimInput({
      eventId,
      ownerId,
      leaseMs,
    });

    const currentTime =
      this.normalizeDate(
        now,
        "now"
      );

    const claimToken =
      this.generateClaimToken();

    const leaseExpiresAt =
      new Date(
        currentTime.getTime() +
          leaseMs
      );

    const claimed =
      await this
        .WorkflowOutboxEvent
        .findOneAndUpdate(
          {
            eventId,

            status: {
              $in: [
                OUTBOX_STATUS
                  .PENDING,

                OUTBOX_STATUS
                  .FAILED,

                /*
                 * PROCESSING is included intentionally so an expired
                 * publisher lease may be atomically reclaimed.
                 *
                 * A live PROCESSING event cannot match because the
                 * lease condition below requires the lease to be
                 * missing or expired.
                 */
                OUTBOX_STATUS
                  .PROCESSING,
              ],
            },

            $or: [
              {
                "owner.leaseExpiresAt":
                  null,
              },

              {
                "owner.leaseExpiresAt": {
                  $lte:
                    currentTime,
                },
              },
            ],

            $expr: {
              $lt: [
                "$attempts.count",
                "$attempts.maxAttempts",
              ],
            },
          },
          {
            $set: {
              status:
                OUTBOX_STATUS
                  .PROCESSING,

              "owner.workerId":
                ownerId,

              "owner.claimToken":
                claimToken,

              "owner.claimedAt":
                currentTime,

              "owner.heartbeatAt":
                currentTime,

              "owner.leaseExpiresAt":
                leaseExpiresAt,

              /*
               * A new delivery attempt starts with no active
               * failure information from the previous attempt.
               */
              "failure.code":
                null,

              "failure.message":
                null,

              "failure.retryable":
                false,

              "failure.failedAt":
                null,
            },

            $inc: {
              "attempts.count":
                1,
            },
          },
          {
            new:
              true,
          }
        );

    if (
      claimed
    ) {
      return {
        claimed:
          true,

        event:
          claimed,

        ownerId,

        claimToken,

        leaseExpiresAt,
      };
    }

    /*
     * Atomic claim did not succeed.
     *
     * Reload the event so we can explain why:
     *
     * - already delivered
     * - dead-lettered
     * - active lease
     * - retry exhausted
     * - claim conflict
     */
    const existing =
      await this
        .WorkflowOutboxEvent
        .findOne({
          eventId,
        });

    if (
      !existing
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox event was not found"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .EVENT_ID_REQUIRED,

          eventId,
        }
      );
    }

    if (
      existing.status ===
      OUTBOX_STATUS
        .DELIVERED
    ) {
      return {
        claimed:
          false,

        decision:
          "ALREADY_DELIVERED",

        event:
          existing,
      };
    }

    if (
      existing.status ===
      OUTBOX_STATUS
        .DEAD_LETTER
    ) {
      return {
        claimed:
          false,

        decision:
          "DEAD_LETTER",

        event:
          existing,
      };
    }

    /*
     * Mongoose normally hydrates Date fields into native Date
     * instances. Test doubles, lean objects, serialized records,
     * or other adapters may expose ISO strings instead.
     *
     * Normalize the value before comparing it so lease behavior
     * remains deterministic regardless of representation.
     */
    const existingLeaseExpiresAt =
      this.normalizeOptionalDate(
        existing.owner
          ?.leaseExpiresAt
      );

    if (
      existingLeaseExpiresAt &&
      existingLeaseExpiresAt >
        currentTime
    ) {
      return {
        claimed:
          false,

        decision:
          "LEASE_ACTIVE",

        event:
          existing,
      };
    }

    const attemptCount =
      Number(
        existing.attempts
          ?.count ?? 0
      );

    const maxAttempts =
      Number(
        existing.attempts
          ?.maxAttempts ?? 0
      );

    if (
      Number.isFinite(
        attemptCount
      ) &&
      Number.isFinite(
        maxAttempts
      ) &&
      maxAttempts >
        0 &&
      attemptCount >=
        maxAttempts
    ) {
      return {
        claimed:
          false,

        decision:
          "RETRY_EXHAUSTED",

        event:
          existing,
      };
    }

    return {
      claimed:
        false,

      decision:
        "CLAIM_CONFLICT",

      event:
        existing,
    };
  }

  // ==========================================================================
  // HEARTBEAT
  // ==========================================================================

  async heartbeat({
    eventId,
    ownerId,
    claimToken,
    leaseMs =
      DEFAULT_OUTBOX_LEASE_MS,
    now =
      this.now(),
  } = {}) {
    this.assertOwnershipInput({
      eventId,
      ownerId,
      claimToken,
      leaseMs,
    });

    const currentTime =
      this.normalizeDate(
        now,
        "now"
      );

    const leaseExpiresAt =
      new Date(
        currentTime.getTime() +
          leaseMs
      );

    const updated =
      await this
        .WorkflowOutboxEvent
        .findOneAndUpdate(
          {
            eventId,

            status:
              OUTBOX_STATUS
                .PROCESSING,

            "owner.workerId":
              ownerId,

            "owner.claimToken":
              claimToken,

            /*
             * Heartbeats from publishers whose lease already expired
             * are rejected. Once ownership expires, the publisher must
             * not revive itself.
             */
            "owner.leaseExpiresAt": {
              $gt:
                currentTime,
            },
          },
          {
            $set: {
              "owner.heartbeatAt":
                currentTime,

              "owner.leaseExpiresAt":
                leaseExpiresAt,
            },
          },
          {
            new:
              true,
          }
        );

    if (
      !updated
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox heartbeat rejected because publisher ownership is no longer valid"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .CLAIM_TOKEN_MISMATCH,

          eventId,

          ownerId,
        }
      );
    }

    return {
      heartbeated:
        true,

      event:
        updated,

      leaseExpiresAt,
    };
  }

  // ==========================================================================
  // MARK DELIVERED
  // ==========================================================================

  async markDelivered({
    eventId,
    ownerId,
    claimToken,
    messageId = null,
    queue = null,
    exchange = null,
    routingKey = null,
    now =
      this.now(),
  } = {}) {
    this.assertOwnershipInput({
      eventId,
      ownerId,
      claimToken,
      leaseMs:
        1,
    });

    const currentTime =
      this.normalizeDate(
        now,
        "now"
      );

    const updated =
      await this
        .WorkflowOutboxEvent
        .findOneAndUpdate(
          {
            eventId,

            status:
              OUTBOX_STATUS
                .PROCESSING,

            "owner.workerId":
              ownerId,

            "owner.claimToken":
              claimToken,

            /*
             * Only a publisher that still owns a live lease may
             * commit the delivery result.
             */
            "owner.leaseExpiresAt": {
              $gt:
                currentTime,
            },
          },
          {
            $set: {
              status:
                OUTBOX_STATUS
                  .DELIVERED,

              "delivery.deliveredAt":
                currentTime,

              "delivery.messageId":
                messageId,

              "delivery.queue":
                queue,

              "delivery.exchange":
                exchange,

              "delivery.routingKey":
                routingKey,

              /*
               * Keep the last owner identity for audit/fencing,
               * but close the lease immediately.
               */
              "owner.heartbeatAt":
                currentTime,

              "owner.leaseExpiresAt":
                currentTime,

              "attempts.nextAttemptAt":
                null,

              "failure.code":
                null,

              "failure.message":
                null,

              "failure.retryable":
                false,

              "failure.failedAt":
                null,
            },
          },
          {
            new:
              true,
          }
        );

    if (
      !updated
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox delivery completion rejected because publisher ownership is no longer valid"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .CLAIM_TOKEN_MISMATCH,

          eventId,

          ownerId,
        }
      );
    }

    return {
      delivered:
        true,

      event:
        updated,
    };
  }

  // ==========================================================================
  // MARK FAILED
  // ==========================================================================

  async markFailed({
    eventId,
    ownerId,
    claimToken,
    error,
    retryable =
      false,
    nextAttemptAt =
      null,
    now =
      this.now(),
  } = {}) {
    this.assertOwnershipInput({
      eventId,
      ownerId,
      claimToken,
      leaseMs:
        1,
    });

    const currentTime =
      this.normalizeDate(
        now,
        "now"
      );

    const normalizedNextAttemptAt =
      nextAttemptAt
        ? this.normalizeDate(
            nextAttemptAt,
            "nextAttemptAt"
          )
        : null;

    const updated =
      await this
        .WorkflowOutboxEvent
        .findOneAndUpdate(
          {
            eventId,

            status:
              OUTBOX_STATUS
                .PROCESSING,

            "owner.workerId":
              ownerId,

            "owner.claimToken":
              claimToken,

            "owner.leaseExpiresAt": {
              $gt:
                currentTime,
            },
          },
          {
            $set: {
              status:
                OUTBOX_STATUS
                  .FAILED,

              "failure.code":
                error?.code ||
                "OUTBOX_DELIVERY_FAILED",

              "failure.message":
                error?.message ||
                "Workflow outbox delivery failed",

              "failure.retryable":
                retryable ===
                true,

              "failure.failedAt":
                currentTime,

              "attempts.lastAttemptAt":
                currentTime,

              "attempts.nextAttemptAt":
                normalizedNextAttemptAt,

              /*
               * Close ownership after recording failure.
               *
               * A later retry must claim the event again and receive
               * a new claim token.
               */
              "owner.heartbeatAt":
                currentTime,

              "owner.leaseExpiresAt":
                currentTime,
            },
          },
          {
            new:
              true,
          }
        );

    if (
      !updated
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox failure update rejected because publisher ownership is no longer valid"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .CLAIM_TOKEN_MISMATCH,

          eventId,

          ownerId,
        }
      );
    }

    return {
      failed:
        true,

      retryable:
        retryable ===
        true,

      event:
        updated,
    };
  }

  // ==========================================================================
  // DEAD LETTER
  // ==========================================================================

  async markDeadLetter({
    eventId,
    ownerId,
    claimToken,
    reason,
    now =
      this.now(),
  } = {}) {
    this.assertOwnershipInput({
      eventId,
      ownerId,
      claimToken,
      leaseMs:
        1,
    });

    if (
      !reason ||
      !String(
        reason
      ).trim()
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox dead-letter reason is required"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .PAYLOAD_INVALID,

          field:
            "reason",
        }
      );
    }

    const currentTime =
      this.normalizeDate(
        now,
        "now"
      );

    const updated =
      await this
        .WorkflowOutboxEvent
        .findOneAndUpdate(
          {
            eventId,

            status:
              OUTBOX_STATUS
                .PROCESSING,

            "owner.workerId":
              ownerId,

            "owner.claimToken":
              claimToken,

            "owner.leaseExpiresAt": {
              $gt:
                currentTime,
            },
          },
          {
            $set: {
              status:
                OUTBOX_STATUS
                  .DEAD_LETTER,

              "deadLetter.reason":
                String(
                  reason
                ).trim(),

              "deadLetter.deadLetteredAt":
                currentTime,

              "attempts.nextAttemptAt":
                null,

              /*
               * Close the current publisher lease.
               */
              "owner.heartbeatAt":
                currentTime,

              "owner.leaseExpiresAt":
                currentTime,
            },
          },
          {
            new:
              true,
          }
        );

    if (
      !updated
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox dead-letter update rejected because publisher ownership is no longer valid"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .CLAIM_TOKEN_MISMATCH,

          eventId,

          ownerId,
        }
      );
    }

    return {
      deadLettered:
        true,

      event:
        updated,
    };
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  assertClaimInput({
    eventId,
    ownerId,
    leaseMs,
  } = {}) {
    if (
      !eventId ||
      !String(
        eventId
      ).trim()
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
      !ownerId ||
      !String(
        ownerId
      ).trim()
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox publisher ownerId is required"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .CLAIM_CONFLICT,

          field:
            "ownerId",
        }
      );
    }

    if (
      !Number.isFinite(
        leaseMs
      ) ||
      leaseMs <=
        0
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox leaseMs must be positive"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .PAYLOAD_INVALID,

          field:
            "leaseMs",
        }
      );
    }

    return true;
  }

  assertOwnershipInput({
    eventId,
    ownerId,
    claimToken,
    leaseMs,
  } = {}) {
    this.assertClaimInput({
      eventId,
      ownerId,
      leaseMs,
    });

    if (
      !claimToken ||
      !String(
        claimToken
      ).trim()
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox claimToken is required"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .CLAIM_TOKEN_REQUIRED,
        }
      );
    }

    return true;
  }

  // ==========================================================================
  // DATE NORMALIZATION
  // ==========================================================================

  /*
   * Converts Date-compatible values into native Date instances.
   *
   * This makes safety-sensitive lease comparisons deterministic for:
   *
   * - hydrated Mongoose documents
   * - lean Mongo objects
   * - serialized ISO date strings
   * - test doubles
   */
  normalizeDate(
    value,
    field =
      "date"
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
          `Workflow outbox ${field} must be a valid date`
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .PAYLOAD_INVALID,

          field,
        }
      );
    }

    return normalized;
  }

  normalizeOptionalDate(
    value
  ) {
    if (
      value ===
        null ||
      value ===
        undefined ||
      value ===
        ""
    ) {
      return null;
    }

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
      /*
       * An invalid persisted lease value must not accidentally be
       * interpreted as a valid active lease.
       *
       * The atomic claim itself still controls ownership. This
       * helper is used only to classify why a failed claim occurred.
       */
      return null;
    }

    return normalized;
  }
}

module.exports =
  new WorkflowOutboxClaimService();

module.exports
  .WorkflowOutboxClaimService =
  WorkflowOutboxClaimService;