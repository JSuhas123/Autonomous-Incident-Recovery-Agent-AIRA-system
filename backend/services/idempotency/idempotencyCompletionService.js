"use strict";

/**
 * AIRA Idempotency Completion Service
 *
 * Phase 11.1.5
 *
 * Finalizes an owned idempotency claim.
 *
 * Safety invariants:
 *
 * 1. Only PROCESSING records may be finalized.
 * 2. ownerId must match.
 * 3. claimToken must match.
 * 4. A stale worker cannot overwrite a newer owner.
 * 5. COMPLETED records cannot be changed to FAILED.
 * 6. FAILED records cannot be changed to COMPLETED.
 * 7. This service never grants execution authorization.
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

class IdempotencyCompletionService {
  constructor(
    options = {}
  ) {
    this.IdempotencyRecord =
      options.IdempotencyRecord ||
      IdempotencyRecord;
  }

  // ==========================================================================
  // COMPLETE
  // ==========================================================================

  async complete(
    input = {}
  ) {
    this.assertInput(
      input
    );

    const now =
      normalizeDate(
        input.now
      );

    const filter =
      this.buildOwnershipFilter(
        input
      );

    const completed =
      await this.IdempotencyRecord
        .findOneAndUpdate(
          filter,

          {
            $set: {
              status:
                IDEMPOTENCY_STATUS
                  .COMPLETED,

              result:
                input.result ??
                null,

              resultReference:
                input.resultReference ??
                null,

              completedAt:
                now,

              heartbeatAt:
                now,

              leaseExpiresAt:
                null,

              failure:
                null,
            },
          },

          {
            new:
              true,
          }
        );

    if (
      completed
    ) {
      return this.buildResult({
        finalized:
          true,

        completed:
          true,

        failed:
          false,

        status:
          IDEMPOTENCY_STATUS
            .COMPLETED,

        record:
          completed,
      });
    }

    return this.resolveOwnershipFailure(
      input,
      "complete"
    );
  }

  // ==========================================================================
  // FAIL
  // ==========================================================================

  async fail(
    input = {}
  ) {
    this.assertInput(
      input
    );

    const now =
      normalizeDate(
        input.now
      );

    const filter =
      this.buildOwnershipFilter(
        input
      );

    const failure =
      normalizeFailure(
        input.failure,
        now
      );

    const failed =
      await this.IdempotencyRecord
        .findOneAndUpdate(
          filter,

          {
            $set: {
              status:
                IDEMPOTENCY_STATUS
                  .FAILED,

              failure,

              heartbeatAt:
                now,

              leaseExpiresAt:
                null,

              completedAt:
                null,
            },
          },

          {
            new:
              true,
          }
        );

    if (
      failed
    ) {
      return this.buildResult({
        finalized:
          true,

        completed:
          false,

        failed:
          true,

        status:
          IDEMPOTENCY_STATUS
            .FAILED,

        retryable:
          failure.retryable,

        record:
          failed,
      });
    }

    return this.resolveOwnershipFailure(
      input,
      "fail"
    );
  }

  // ==========================================================================
  // OWNERSHIP FILTER
  //
  // This is the critical compare-and-set boundary.
  // ==========================================================================

  buildOwnershipFilter(
    input
  ) {
    return {
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
    };
  }

  // ==========================================================================
  // FAILED CONDITIONAL UPDATE RESOLUTION
  // ==========================================================================

  async resolveOwnershipFailure(
    input,
    action
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
        "Idempotency record was not found",
        "IDEMPOTENCY_RECORD_NOT_FOUND"
      );
    }

    if (
      record.status !==
      IDEMPOTENCY_STATUS
        .PROCESSING
    ) {
      throw createError(
        `Cannot ${action} idempotency record from ${record.status}`,
        "IDEMPOTENCY_ALREADY_FINALIZED",
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
        "Idempotency claim is owned by another worker",
        "IDEMPOTENCY_OWNER_MISMATCH",
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
        "Idempotency claim token is stale or invalid",
        "IDEMPOTENCY_CLAIM_TOKEN_MISMATCH"
      );
    }

    /*
     * The conditional update failed even though the subsequently read
     * document appears to match.
     *
     * Fail closed. Do not retry the terminal mutation blindly.
     */
    throw createError(
      "Idempotency claim changed during finalization",
      "IDEMPOTENCY_FINALIZATION_CONFLICT"
    );
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  assertInput(
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
        "Idempotency completion input is required",
        "IDEMPOTENCY_COMPLETION_INPUT_REQUIRED"
      );
    }

    if (
      !input.organizationId ||
      !input.environmentId
    ) {
      throw createError(
        "Idempotency completion requires organization and environment scope",
        "IDEMPOTENCY_COMPLETION_SCOPE_REQUIRED"
      );
    }

    assertValidIdempotencyOperation(
      input.operation
    );

    if (
      !input.idempotencyKey
    ) {
      throw createError(
        "Idempotency completion requires idempotencyKey",
        "IDEMPOTENCY_COMPLETION_KEY_REQUIRED"
      );
    }

    if (
      !input.ownerId
    ) {
      throw createError(
        "Idempotency completion requires ownerId",
        "IDEMPOTENCY_COMPLETION_OWNER_REQUIRED"
      );
    }

    if (
      !input.claimToken
    ) {
      throw createError(
        "Idempotency completion requires claimToken",
        "IDEMPOTENCY_COMPLETION_CLAIM_TOKEN_REQUIRED"
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw createError(
        "Idempotency completion service cannot authorize execution",
        "IDEMPOTENCY_COMPLETION_UNSAFE_INPUT"
      );
    }
  }

  buildResult(
    input
  ) {
    return {
      ...input,

      executionAuthorized:
        false,
    };
  }
}

function normalizeFailure(
  failure,
  now
) {
  if (
    !failure ||
    typeof failure !==
      "object"
  ) {
    return {
      code:
        "IDEMPOTENCY_OPERATION_FAILED",

      message:
        "Idempotent operation failed.",

      retryable:
        false,

      failedAt:
        now,
    };
  }

  return {
    code:
      failure.code
        ? String(
            failure.code
          )
        : "IDEMPOTENCY_OPERATION_FAILED",

    message:
      failure.message
        ? String(
            failure.message
          )
        : "Idempotent operation failed.",

    retryable:
      failure.retryable ===
      true,

    failedAt:
      now,
  };
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
      "Invalid idempotency completion timestamp",
      "IDEMPOTENCY_COMPLETION_TIME_INVALID"
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
  new IdempotencyCompletionService();

module.exports
  .IdempotencyCompletionService =
  IdempotencyCompletionService;