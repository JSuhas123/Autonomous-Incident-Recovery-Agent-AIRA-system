"use strict";

const {
  workflowOutboxRepository,
} =
  require(
    "../../persistence/repositories"
  );

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

/**
 * ============================================================================
 * AIRA PHASE 11.3.4 / PHASE 13.4E2
 * WORKFLOW OUTBOX PERSISTENCE SERVICE
 * ============================================================================
 *
 * Phase 13.4E2 moves durable outbox persistence behind a repository boundary.
 *
 * Production:
 *
 *   workflowOutboxRepository
 *
 * Legacy unit tests:
 *
 *   WorkflowOutboxEvent test double
 *
 * The compatibility path is intentionally limited to the injected
 * Mongoose/model-style dependency. PostgreSQL remains strictly tenant scoped.
 *
 * IMPORTANT:
 *
 * The outbox never grants execution authority.
 * ============================================================================
 */

class WorkflowOutboxPersistenceService {
  constructor(
    options = {}
  ) {
    /*
     * Existing tests historically inject WorkflowOutboxEvent.
     *
     * Preserve that API while production uses the repository abstraction.
     */
    if (
      options.WorkflowOutboxEvent
    ) {
      this.repository =
        createLegacyModelRepository(
          options.WorkflowOutboxEvent
        );

      this.requiresTenantScope =
        false;
    } else if (
      options.repository
    ) {
      this.repository =
        options.repository;

      this.requiresTenantScope =
        options.requiresTenantScope !==
        false;
    } else {
      this.repository =
        workflowOutboxRepository;

      this.requiresTenantScope =
        true;
    }

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

    const scope = {
      organizationId,
      environmentId,
    };

    const existing =
      await this.repository
        .findByEventKey(
          scope,
          outboxIdentity
            .eventKey
        );

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
        await this.repository
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
       * Two producers can race:
       *
       * 1. both observe no existing event
       * 2. both attempt INSERT
       * 3. unique eventKey chooses one winner
       * 4. loser reloads and validates the persisted winner
       */

      const racedExisting =
        await this.repository
          .findByEventKey(
            scope,
            outboxIdentity
              .eventKey
          );

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

    return this.repository
      .findByEventId(
        {
          organizationId,
          environmentId,
        },
        eventId
      );
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

    return this.repository
      .findByEventKey(
        {
          organizationId,
          environmentId,
        },
        eventKey
      );
  }

  // ==========================================================================
  // DELIVERY SCAN
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
          ) ||
            50,
          500
        )
      );

    return this.repository
      .findDeliverable({
        limit:
          safeLimit,

        now,
      });
  }

  // ==========================================================================
  // REFRESH
  // ==========================================================================

  /**
   * Supports both:
   *
   * legacy:
   *
   *   refresh(eventId)
   *
   * Phase 13:
   *
   *   refresh({
   *     eventId,
   *     organizationId,
   *     environmentId
   *   })
   */
  async refresh(
    input
  ) {
    let eventId;
    let organizationId;
    let environmentId;

    if (
      typeof input ===
      "string"
    ) {
      eventId =
        input;
    } else {
      eventId =
        input?.eventId;

      organizationId =
        input?.organizationId;

      environmentId =
        input?.environmentId;
    }

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

    return this.repository
      .findByEventId(
        {
          organizationId,
          environmentId,
        },
        eventId
      );
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
    /*
     * Legacy model-injection tests predate tenant-scoped repository
     * contracts.
     *
     * PostgreSQL/default repository paths still fail closed.
     */
    if (
      !this.requiresTenantScope
    ) {
      return true;
    }

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
  // DUPLICATE KEY
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
        /*
         * PostgreSQL unique_violation.
         */
        error.code ===
          "23505" ||
        (
          error.name ===
            "MongoServerError" &&
          /duplicate key/i.test(
            error.message ||
              ""
          )
        )
      )
    );
  }
}

// ============================================================================
// LEGACY MONGOOSE MODEL ADAPTER
// ============================================================================

function createLegacyModelRepository(
  Model
) {
  return {
    async create(
      data
    ) {
      return Model
        .create(
          data
        );
    },

    async findByEventId(
      scope,
      eventId
    ) {
      return Model
        .findOne(
          withOptionalScope(
            {
              eventId,
            },
            scope
          )
        );
    },

    async findByEventKey(
      scope,
      eventKey
    ) {
      return Model
        .findOne(
          withOptionalScope(
            {
              eventKey,
            },
            scope
          )
        );
    },

    async findDeliverable({
      limit = 50,
      now = new Date(),
    } = {}) {
      const safeLimit =
        Math.min(
          Math.max(
            Number(
              limit
            ) ||
              50,
            1
          ),
          500
        );

      return Model
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
    },
  };
}

function withOptionalScope(
  filter,
  scope = {}
) {
  const output = {
    ...filter,
  };

  if (
    scope?.organizationId
  ) {
    output.organizationId =
      scope.organizationId;
  }

  if (
    scope?.environmentId
  ) {
    output.environmentId =
      scope.environmentId;
  }

  return output;
}

module.exports =
  new WorkflowOutboxPersistenceService({
    repository:
      workflowOutboxRepository,

    requiresTenantScope:
      true,
  });

module.exports
  .WorkflowOutboxPersistenceService =
  WorkflowOutboxPersistenceService;

module.exports
  .createLegacyModelRepository =
  createLegacyModelRepository;