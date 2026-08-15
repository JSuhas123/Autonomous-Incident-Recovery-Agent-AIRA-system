"use strict";

const WorkflowOutboxEvent =
  require(
    "../../models/WorkflowOutboxEvent"
  );

const workflowOutboxIdentity =
  require(
    "./workflowOutboxIdentity"
  );

const {
  OUTBOX_STATUS,
  OUTBOX_ERROR_CODE,
  DEFAULT_OUTBOX_MAX_ATTEMPTS,
  assertNoExecutionAuthority,
} =
  require(
    "./workflowOutboxContracts"
  );

/*
 * ============================================================================
 * AIRA PHASE 11.3.4
 * WORKFLOW OUTBOX PERSISTENCE SERVICE
 * ============================================================================
 *
 * Responsibilities:
 *
 * 1. Persist durable workflow handoff intent.
 * 2. Guarantee deterministic create-or-return-existing semantics.
 * 3. Detect identity / payload conflicts.
 * 4. Survive concurrent producer duplicate-key races.
 * 5. Preserve tenant and workflow scope.
 * 6. Never manufacture execution authority.
 *
 * IMPORTANT:
 *
 * The outbox is a durable workflow transport boundary.
 *
 * It is NOT:
 *
 * - execution authorization
 * - an executor
 * - a replacement for idempotency
 * - a replacement for runtime checkpoints
 * ============================================================================
 */

class WorkflowOutboxPersistenceService {
  constructor(
    options = {}
  ) {
    this.WorkflowOutboxEvent =
      options.WorkflowOutboxEvent ||
      WorkflowOutboxEvent;

    this.identity =
      options.identity ||
      workflowOutboxIdentity;

    this.now =
      options.now ||
      (() =>
        new Date());
  }

  // ==========================================================================
  // CREATE OR RETURN EXISTING
  // ==========================================================================

  async createOrGet({
    organizationId,
    environmentId,
    incidentId,
    aggregateType,
    aggregateId,
    eventType,
    transitionId = null,
    payload = {},
    metadata = {},
    maxAttempts =
      DEFAULT_OUTBOX_MAX_ATTEMPTS,
  } = {}) {
    this.assertCreateInput({
      organizationId,
      environmentId,
      incidentId,
      aggregateType,
      aggregateId,
      eventType,
      payload,
      maxAttempts,
    });

    assertNoExecutionAuthority(
      payload
    );

    const outboxIdentity =
      this.identity
        .createIdentity({
          organizationId,
          environmentId,
          aggregateType,
          aggregateId,
          eventType,
          transitionId,
          payload,
        });

    const existing =
      await this
        .WorkflowOutboxEvent
        .findOne({
          eventKey:
            outboxIdentity
              .eventKey,
        });

    if (
      existing
    ) {
      this.identity
        .assertCompatibleExistingEvent({
          existingEvent:
            existing,

          expectedIdentity:
            outboxIdentity,
        });

      return {
        created:
          false,

        duplicate:
          true,

        event:
          existing,
      };
    }

    const now =
      this.now();

    const document = {
      eventId:
        outboxIdentity
          .eventId,

      eventKey:
        outboxIdentity
          .eventKey,

      payloadFingerprint:
        outboxIdentity
          .payloadFingerprint,

      organizationId,

      environmentId,

      incidentId,

      aggregateType,

      aggregateId,

      eventType,

      payload,

      metadata,

      status:
        OUTBOX_STATUS
          .PENDING,

      owner: {
        workerId:
          null,

        claimToken:
          null,

        claimedAt:
          null,

        heartbeatAt:
          null,

        leaseExpiresAt:
          null,
      },

      attempts: {
        count:
          0,

        maxAttempts,

        lastAttemptAt:
          null,

        nextAttemptAt:
          now,
      },

      delivery: {
        deliveredAt:
          null,

        messageId:
          null,

        queue:
          null,

        exchange:
          null,

        routingKey:
          null,
      },

      failure: {
        code:
          null,

        message:
          null,

        retryable:
          false,

        failedAt:
          null,
      },

      deadLetter: {
        reason:
          null,

        deadLetteredAt:
          null,
      },

      executionAuthorized:
        false,
    };

    try {
      const created =
        await this
          .WorkflowOutboxEvent
          .create(
            document
          );

      return {
        created:
          true,

        duplicate:
          false,

        event:
          created,
      };
    } catch (
      error
    ) {
      if (
        !this
          .isDuplicateKeyError(
            error
          )
      ) {
        throw error;
      }

      /*
       * Concurrent producers may both observe "no existing event"
       * and then race on the unique eventKey/eventId indexes.
       *
       * MongoDB chooses one winner.
       *
       * The loser reloads the persisted winner and verifies that it
       * represents the exact same logical event and payload.
       */

      const racedExisting =
        await this
          .WorkflowOutboxEvent
          .findOne({
            eventKey:
              outboxIdentity
                .eventKey,
          });

      if (
        !racedExisting
      ) {
        throw Object.assign(
          new Error(
            "Outbox duplicate-key race occurred but persisted event could not be reloaded"
          ),
          {
            code:
              "OUTBOX_DUPLICATE_RACE_UNRESOLVED",

            eventKey:
              outboxIdentity
                .eventKey,

            cause:
              error,
          }
        );
      }

      this.identity
        .assertCompatibleExistingEvent({
          existingEvent:
            racedExisting,

          expectedIdentity:
            outboxIdentity,
        });

      return {
        created:
          false,

        duplicate:
          true,

        raced:
          true,

        event:
          racedExisting,
      };
    }
  }

  // ==========================================================================
  // LOOKUPS
  // ==========================================================================

  async findByEventId({
    eventId,
    organizationId,
    environmentId,
  } = {}) {
    if (
      !eventId
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

    this.assertTenantScope({
      organizationId,
      environmentId,
    });

    return this
      .WorkflowOutboxEvent
      .findOne({
        eventId,

        organizationId,

        environmentId,
      });
  }

  async findByEventKey({
    eventKey,
    organizationId,
    environmentId,
  } = {}) {
    if (
      !eventKey
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox eventKey is required"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .EVENT_KEY_REQUIRED,
        }
      );
    }

    this.assertTenantScope({
      organizationId,
      environmentId,
    });

    return this
      .WorkflowOutboxEvent
      .findOne({
        eventKey,

        organizationId,

        environmentId,
      });
  }

  // ==========================================================================
  // PENDING DELIVERY SCAN
  // ==========================================================================

  async findDeliverable({
    limit = 50,
    now =
      this.now(),
  } = {}) {
    const safeLimit =
      Math.max(
        1,
        Math.min(
          Number(
            limit
          ) || 50,
          500
        )
      );

    return this
      .WorkflowOutboxEvent
      .find({
        status: {
          $in: [
            OUTBOX_STATUS
              .PENDING,

            OUTBOX_STATUS
              .FAILED,
          ],
        },

        "attempts.nextAttemptAt": {
          $lte:
            now,
        },

        $or: [
          {
            "owner.leaseExpiresAt":
              null,
          },

          {
            "owner.leaseExpiresAt": {
              $lte:
                now,
            },
          },
        ],

        $expr: {
          $lt: [
            "$attempts.count",
            "$attempts.maxAttempts",
          ],
        },
      })
      .sort({
        "attempts.nextAttemptAt":
          1,

        createdAt:
          1,
      })
      .limit(
        safeLimit
      );
  }

  // ==========================================================================
  // BASIC UPDATE SAFETY
  // ==========================================================================

  async refresh(
    eventId
  ) {
    if (
      !eventId
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

    return this
      .WorkflowOutboxEvent
      .findOne({
        eventId,
      });
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  assertCreateInput({
    organizationId,
    environmentId,
    incidentId,
    aggregateType,
    aggregateId,
    eventType,
    payload,
    maxAttempts,
  } = {}) {
    this.assertTenantScope({
      organizationId,
      environmentId,
    });

    if (
      !incidentId
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox event requires incidentId"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .EVENT_REQUIRED,

          field:
            "incidentId",
        }
      );
    }

    if (
      !aggregateType ||
      !aggregateId
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox event requires aggregate identity"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .AGGREGATE_REQUIRED,
        }
      );
    }

    if (
      !eventType
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox event requires eventType"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .EVENT_TYPE_REQUIRED,
        }
      );
    }

    if (
      !payload ||
      typeof payload !==
        "object" ||
      Array.isArray(
        payload
      )
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox payload must be an object"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .PAYLOAD_INVALID,
        }
      );
    }

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
            OUTBOX_ERROR_CODE
              .PAYLOAD_INVALID,

          field:
            "maxAttempts",
        }
      );
    }

    return true;
  }

  assertTenantScope({
    organizationId,
    environmentId,
  } = {}) {
    if (
      !organizationId ||
      !environmentId
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox operation requires tenant scope"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .TENANT_SCOPE_REQUIRED,
        }
      );
    }

    return true;
  }

  // ==========================================================================
  // DUPLICATE KEY DETECTION
  // ==========================================================================

  isDuplicateKeyError(
    error
  ) {
    return Boolean(
      error &&
      (
        error.code ===
          11000 ||
        error.code ===
          11001 ||
        error.name ===
          "MongoServerError" &&
        /duplicate key/i.test(
          error.message ||
            ""
        )
      )
    );
  }
}

module.exports =
  new WorkflowOutboxPersistenceService();

module.exports
  .WorkflowOutboxPersistenceService =
  WorkflowOutboxPersistenceService;