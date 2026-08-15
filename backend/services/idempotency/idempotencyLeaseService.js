"use strict";

/**
 * AIRA Idempotency Lease Service
 *
 * Phase 11.1.6
 *
 * Responsibilities:
 *
 * - renew active claim lease
 * - heartbeat active owner
 * - detect stale PROCESSING claims
 * - expose stale records for controlled recovery
 *
 * SAFETY:
 *
 * - requires ownerId + claimToken
 * - never authorizes execution
 * - never executes recovery
 */

const IdempotencyRecord =
  require(
    "../../models/IdempotencyRecord"
  );

const {
  IDEMPOTENCY_STATUS,
  assertValidIdempotencyOperation,
} =
  require(
    "./idempotencyContracts"
  );

class IdempotencyLeaseService {
  constructor(
    options = {}
  ) {
    this.IdempotencyRecord =
      options.IdempotencyRecord ||
      IdempotencyRecord;

    this.defaultLeaseMs =
      normalizeLeaseMs(
        options.defaultLeaseMs,
        60000
      );
  }

  async heartbeat(
    input = {}
  ) {
    this.assertOwnershipInput(
      input
    );

    const now =
      normalizeDate(
        input.now
      );

    const leaseMs =
      normalizeLeaseMs(
        input.leaseMs,
        this.defaultLeaseMs
      );

    const leaseExpiresAt =
      new Date(
        now.getTime() +
        leaseMs
      );

    const record =
      await this.IdempotencyRecord
        .findOneAndUpdate(
          {
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            operation:
              input.operation,

            idempotencyKey:
              input.idempotencyKey,

            status:
              IDEMPOTENCY_STATUS
                .PROCESSING,

            ownerId:
              input.ownerId,

            claimToken:
              input.claimToken,
          },

          {
            $set: {
              heartbeatAt:
                now,

              leaseExpiresAt,
            },
          },

          {
            new:
              true,
          }
        );

    if (
      record
    ) {
      return {
        renewed:
          true,

        record,

        heartbeatAt:
          now,

        leaseExpiresAt,

        executionAuthorized:
          false,
      };
    }

    return this.resolveHeartbeatFailure(
      input
    );
  }

  async findStaleClaims(
    input = {}
  ) {
    this.assertScope(
      input
    );

    const now =
      normalizeDate(
        input.now
      );

    const limit =
      Math.min(
        500,
        Math.max(
          1,
          Number(
            input.limit ||
            100
          )
        )
      );

    const query = {
      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      status:
        IDEMPOTENCY_STATUS
          .PROCESSING,

      leaseExpiresAt: {
        $lte:
          now,
      },
    };

    if (
      input.operation
    ) {
      assertValidIdempotencyOperation(
        input.operation
      );

      query.operation =
        input.operation;
    }

    const records =
      await this.IdempotencyRecord
        .find(
          query
        )
        .sort({
          leaseExpiresAt:
            1,
        })
        .limit(
          limit
        );

    return {
      staleCount:
        records.length,

      records,

      checkedAt:
        now,

      executionAuthorized:
        false,
    };
  }

  async resolveHeartbeatFailure(
    input
  ) {
    const record =
      await this.IdempotencyRecord
        .findOne({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          operation:
            input.operation,

          idempotencyKey:
            input.idempotencyKey,
        });

    if (
      !record
    ) {
      throw createError(
        "Idempotency record not found",
        "IDEMPOTENCY_LEASE_RECORD_NOT_FOUND"
      );
    }

    if (
      record.status !==
      IDEMPOTENCY_STATUS
        .PROCESSING
    ) {
      throw createError(
        `Cannot heartbeat idempotency record in ${record.status}`,
        "IDEMPOTENCY_LEASE_NOT_PROCESSING",
        {
          currentStatus:
            record.status,
        }
      );
    }

    if (
      String(
        record.ownerId
      ) !==
      String(
        input.ownerId
      )
    ) {
      throw createError(
        "Idempotency lease is owned by another worker",
        "IDEMPOTENCY_LEASE_OWNER_MISMATCH",
        {
          currentOwnerId:
            record.ownerId ||
            null,
        }
      );
    }

    if (
      String(
        record.claimToken
      ) !==
      String(
        input.claimToken
      )
    ) {
      throw createError(
        "Idempotency claim token is stale",
        "IDEMPOTENCY_LEASE_CLAIM_TOKEN_MISMATCH"
      );
    }

    throw createError(
      "Idempotency lease changed during heartbeat",
      "IDEMPOTENCY_LEASE_CONFLICT"
    );
  }

  assertOwnershipInput(
    input
  ) {
    this.assertScope(
      input
    );

    assertValidIdempotencyOperation(
      input.operation
    );

    if (
      !input.idempotencyKey
    ) {
      throw createError(
        "Idempotency heartbeat requires idempotencyKey",
        "IDEMPOTENCY_LEASE_KEY_REQUIRED"
      );
    }

    if (
      !input.ownerId
    ) {
      throw createError(
        "Idempotency heartbeat requires ownerId",
        "IDEMPOTENCY_LEASE_OWNER_REQUIRED"
      );
    }

    if (
      !input.claimToken
    ) {
      throw createError(
        "Idempotency heartbeat requires claimToken",
        "IDEMPOTENCY_LEASE_CLAIM_TOKEN_REQUIRED"
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw createError(
        "Idempotency lease service cannot authorize execution",
        "IDEMPOTENCY_LEASE_UNSAFE_INPUT"
      );
    }
  }

  assertScope(
    input
  ) {
    if (
      !input ||
      typeof input !==
        "object" ||
      Object.keys(
        input
      ).length ===
        0
    ) {
      throw createError(
        "Idempotency lease input is required",
        "IDEMPOTENCY_LEASE_INPUT_REQUIRED"
      );
    }

    if (
      !input.organizationId ||
      !input.environmentId
    ) {
      throw createError(
        "Idempotency lease requires organization and environment scope",
        "IDEMPOTENCY_LEASE_SCOPE_REQUIRED"
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw createError(
        "Idempotency lease service cannot authorize execution",
        "IDEMPOTENCY_LEASE_UNSAFE_INPUT"
      );
    }
  }
}

function normalizeLeaseMs(
  value,
  fallback
) {
  const numeric =
    Number(
      value
    );

  if (
    !Number.isFinite(
      numeric
    ) ||
    numeric <
      1000
  ) {
    return fallback;
  }

  return Math.floor(
    numeric
  );
}

function normalizeDate(
  value
) {
  const date =
    value
      ? new Date(
          value
        )
      : new Date();

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw createError(
      "Invalid idempotency lease timestamp",
      "IDEMPOTENCY_LEASE_TIME_INVALID"
    );
  }

  return date;
}

function createError(
  message,
  code,
  details = {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,
      ...details,
    }
  );
}

module.exports =
  new IdempotencyLeaseService();

module.exports
  .IdempotencyLeaseService =
  IdempotencyLeaseService;