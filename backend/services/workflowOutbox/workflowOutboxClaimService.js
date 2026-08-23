"use strict";

const crypto =
  require(
    "crypto"
  );

const {
  workflowOutboxRepository,
} =
  require(
    "../../persistence/repositories"
  );

const {
  OUTBOX_STATUS,
  OUTBOX_ERROR_CODE,
  DEFAULT_OUTBOX_LEASE_MS,
} =
  require(
    "./workflowOutboxContracts"
  );

class WorkflowOutboxClaimService {
  constructor(
  options = {}
) {
  /*
   * Phase 13.4E2 compatibility rule
   * --------------------------------
   *
   * Production:
   *   repository -> tenant scope REQUIRED
   *
   * Legacy tests:
   *   WorkflowOutboxEvent -> tenant scope OPTIONAL
   *
   * The existing outbox lease/recovery tests inject WorkflowOutboxEvent
   * directly, so they must remain on the legacy model adapter.
   */

  const hasLegacyModel =
    Boolean(
      options.WorkflowOutboxEvent
    );

  if (
    hasLegacyModel
  ) {
    this.repository =
      createLegacyModelRepository(
        options.WorkflowOutboxEvent
      );
  } else {
    this.repository =
      options.repository ||
      workflowOutboxRepository;
  }

  /*
   * Explicit option wins.
   *
   * Otherwise:
   *
   * legacy model     => false
   * repository path  => true
   */
  if (
    options.requiresTenantScope !==
      undefined
  ) {
    this.requiresTenantScope =
      options.requiresTenantScope ===
      true;
  } else {
    this.requiresTenantScope =
      !hasLegacyModel;
  }

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

  async claim({
    eventId,
    organizationId,
    environmentId,
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

    this.assertTenantScope({
      organizationId,
      environmentId,
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

    const scope = {
      organizationId,
      environmentId,
    };

    const claimed =
      await this.repository
        .claim(
          scope,
          {
            eventId,
            ownerId,
            claimToken,
            currentTime,
            leaseExpiresAt,
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

    const existing =
      await this.repository
        .findByEventId(
          scope,
          eventId
        );

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
          ?.count ??
        0
      );

    const maxAttempts =
      Number(
        existing.attempts
          ?.maxAttempts ??
        0
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

  async heartbeat({
    eventId,
    organizationId,
    environmentId,
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

    this.assertTenantScope({
      organizationId,
      environmentId,
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
      await this.repository
        .heartbeat(
          {
            organizationId,
            environmentId,
          },
          {
            eventId,
            ownerId,
            claimToken,
            currentTime,
            leaseExpiresAt,
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

  async markDelivered({
    eventId,
    organizationId,
    environmentId,
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

    this.assertTenantScope({
      organizationId,
      environmentId,
    });

    const currentTime =
      this.normalizeDate(
        now,
        "now"
      );

    const updated =
      await this.repository
        .markDelivered(
          {
            organizationId,
            environmentId,
          },
          {
            eventId,
            ownerId,
            claimToken,
            currentTime,
            messageId,
            queue,
            exchange,
            routingKey,
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

  async markFailed({
    eventId,
    organizationId,
    environmentId,
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

    this.assertTenantScope({
      organizationId,
      environmentId,
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
      await this.repository
        .markFailed(
          {
            organizationId,
            environmentId,
          },
          {
            eventId,
            ownerId,
            claimToken,
            currentTime,
            error,
            retryable,
            nextAttemptAt:
              normalizedNextAttemptAt,
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

  async markDeadLetter({
    eventId,
    organizationId,
    environmentId,
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

    this.assertTenantScope({
      organizationId,
      environmentId,
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
      await this.repository
        .markDeadLetter(
          {
            organizationId,
            environmentId,
          },
          {
            eventId,
            ownerId,
            claimToken,
            currentTime,
            reason,
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

  assertTenantScope({
  organizationId,
  environmentId,
} = {}) {
  /*
   * Legacy WorkflowOutboxEvent model injection intentionally preserves
   * the pre-Phase-13 API:
   *
   * claim({
   *   eventId,
   *   ownerId
   * })
   *
   * This is required by the existing lease/fencing tests and does not
   * weaken PostgreSQL because PostgresWorkflowOutboxRepository itself
   * independently requires organization/environment scope.
   */
  if (
    this.requiresTenantScope ===
    false
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
      return null;
    }

    return normalized;
  }
}

function createLegacyModelRepository(
  WorkflowOutboxEvent
) {
  return {
    claim:
      async (
        scope,
        {
          eventId,
          ownerId,
          claimToken,
          currentTime,
          leaseExpiresAt,
        }
      ) =>
        WorkflowOutboxEvent
          .findOneAndUpdate(
            withOptionalScope(
              {
                eventId,

                status: {
                  $in: [
                    OUTBOX_STATUS
                      .PENDING,

                    OUTBOX_STATUS
                      .FAILED,

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
              scope
            ),
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
          ),

    findByEventId:
      async (
        scope,
        eventId
      ) =>
        WorkflowOutboxEvent
          .findOne(
            withOptionalScope(
              {
                eventId,
              },
              scope
            )
          ),

    heartbeat:
      async (
        scope,
        {
          eventId,
          ownerId,
          claimToken,
          currentTime,
          leaseExpiresAt,
        }
      ) =>
        WorkflowOutboxEvent
          .findOneAndUpdate(
            withOptionalScope(
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
              scope
            ),
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
          ),

    markDelivered:
      async (
        scope,
        {
          eventId,
          ownerId,
          claimToken,
          currentTime,
          messageId,
          queue,
          exchange,
          routingKey,
        }
      ) =>
        WorkflowOutboxEvent
          .findOneAndUpdate(
            withOptionalScope(
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
              scope
            ),
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
          ),

    markFailed:
      async (
        scope,
        {
          eventId,
          ownerId,
          claimToken,
          currentTime,
          error,
          retryable,
          nextAttemptAt,
        }
      ) =>
        WorkflowOutboxEvent
          .findOneAndUpdate(
            withOptionalScope(
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
              scope
            ),
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
                  nextAttemptAt,

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
          ),

    markDeadLetter:
      async (
        scope,
        {
          eventId,
          ownerId,
          claimToken,
          currentTime,
          reason,
        }
      ) =>
        WorkflowOutboxEvent
          .findOneAndUpdate(
            withOptionalScope(
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
              scope
            ),
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
          ),
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
    scope.organizationId
  ) {
    output.organizationId =
      scope.organizationId;
  }

  if (
    scope.environmentId
  ) {
    output.environmentId =
      scope.environmentId;
  }

  return output;
}

module.exports =
  new WorkflowOutboxClaimService();

module.exports
  .WorkflowOutboxClaimService =
  WorkflowOutboxClaimService;