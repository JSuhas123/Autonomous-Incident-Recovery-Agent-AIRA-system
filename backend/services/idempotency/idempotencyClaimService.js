"use strict";

/**
 * AIRA Idempotency Claim Service
 *
 * Phase 11.1.4
 *
 * Atomically claims ownership of a logical operation.
 *
 * SAFETY:
 *
 * - does not authorize execution
 * - does not execute infrastructure changes
 * - does not mutate domain resources
 * - only one worker may own an active idempotency claim
 */

const crypto =
  require(
    "node:crypto"
  );

const IdempotencyRecord =
  require(
    "../../models/IdempotencyRecord"
  );

const {
  IDEMPOTENCY_STATUS,
  IDEMPOTENCY_DECISION,
  assertValidIdempotencyOperation,
} =
  require(
    "./idempotencyContracts"
  );

class IdempotencyClaimService {
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

  async acquire(
    input = {}
  ) {
    this.assertInput(
      input
    );

    const now =
      input.now
        ? new Date(
            input.now
          )
        : new Date();

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

    const claimToken =
      this.generateClaimToken();

    const filter = {
      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      operation:
        input.operation,

      idempotencyKey:
        input.idempotencyKey,
    };

    // ========================================================================
    // 1. TRY TO CREATE THE RECORD
    //
    // Unique compound index guarantees that only one concurrent insert wins.
    // ========================================================================

    try {
      const created =
        await this.IdempotencyRecord
          .create({
            ...filter,

            status:
              IDEMPOTENCY_STATUS
                .PROCESSING,

            ownerId:
              input.ownerId,

            claimToken,

            requestFingerprint:
              input.requestFingerprint ||
              null,

            incidentId:
              input.incidentId ||
              null,

            recoveryDecisionId:
              input.recoveryDecisionId ||
              null,

            executionRequestId:
              input.executionRequestId ||
              null,

            verificationId:
              input.verificationId ||
              null,

            lifecycleId:
              input.lifecycleId ||
              null,

            eventId:
              input.eventId ||
              null,

            correlationId:
              input.correlationId ||
              null,

            claimedAt:
              now,

            heartbeatAt:
              now,

            leaseExpiresAt,

            attemptCount:
              1,

            duplicateCount:
              0,

            metadata: {
              ...(
                input.metadata ||
                {}
              ),

              claimVersion:
                "phase11.1.4-v1",
            },
          });

      return this.result({
        decision:
          IDEMPOTENCY_DECISION
            .ACQUIRED,

        acquired:
          true,

        record:
          created,

        claimToken,

        ownerId:
          input.ownerId,

        leaseExpiresAt,
      });
    } catch (
      error
    ) {
      if (
        !isDuplicateKeyError(
          error
        )
      ) {
        throw error;
      }
    }

    // ========================================================================
    // 2. EXISTING RECORD
    // ========================================================================

    const existing =
      await this.IdempotencyRecord
        .findOne(
          filter
        );

    if (
      !existing
    ) {
      throw Object.assign(
        new Error(
          "Idempotency record disappeared during duplicate claim resolution"
        ),
        {
          code:
            "IDEMPOTENCY_CLAIM_RACE_INCONSISTENT",
        }
      );
    }

    // ========================================================================
    // 3. PAYLOAD FINGERPRINT MISMATCH
    //
    // Same key + different logical payload must fail closed.
    // ========================================================================

    if (
      existing
        .requestFingerprint &&
      input.requestFingerprint &&
      String(
        existing
          .requestFingerprint
      ) !==
      String(
        input.requestFingerprint
      )
    ) {
      return this.result({
        decision:
          IDEMPOTENCY_DECISION
            .REJECTED,

        acquired:
          false,

        record:
          existing,

        reason:
          "Idempotency key already exists with a different request fingerprint.",

        code:
          "IDEMPOTENCY_FINGERPRINT_MISMATCH",
      });
    }

    // ========================================================================
    // 4. COMPLETED
    // ========================================================================

    if (
      existing.status ===
      IDEMPOTENCY_STATUS
        .COMPLETED
    ) {
      await this.markDuplicate(
        existing,
        now
      );

      return this.result({
        decision:
          IDEMPOTENCY_DECISION
            .DUPLICATE_COMPLETED,

        acquired:
          false,

        record:
          existing,

        previousResult:
          existing.result ||
          null,

        resultReference:
          existing.resultReference ||
          null,

        reason:
          "Operation has already completed.",
      });
    }

    // ========================================================================
    // 5. ACTIVE PROCESSING CLAIM
    // ========================================================================

    if (
      existing.status ===
      IDEMPOTENCY_STATUS
        .PROCESSING
    ) {
      const leaseExpired =
        !existing
          .leaseExpiresAt ||
        new Date(
          existing
            .leaseExpiresAt
        ).getTime() <=
          now.getTime();

      if (
        !leaseExpired
      ) {
        await this.markDuplicate(
          existing,
          now
        );

        return this.result({
          decision:
            IDEMPOTENCY_DECISION
              .DUPLICATE_PROCESSING,

          acquired:
            false,

          record:
            existing,

          currentOwnerId:
            existing.ownerId ||
            null,

          leaseExpiresAt:
            existing.leaseExpiresAt ||
            null,

          reason:
            "Operation is already being processed by another owner.",
        });
      }

      // ======================================================================
      // 6. STALE CLAIM RECLAIM
      //
      // Atomic conditional update prevents two workers reclaiming together.
      // ======================================================================

      const reclaimed =
        await this.IdempotencyRecord
          .findOneAndUpdate(
            {
              ...filter,

              status:
                IDEMPOTENCY_STATUS
                  .PROCESSING,

              leaseExpiresAt: {
                $lte:
                  now,
              },
            },

            {
              $set: {
                ownerId:
                  input.ownerId,

                claimToken,

                claimedAt:
                  now,

                heartbeatAt:
                  now,

                leaseExpiresAt,

                requestFingerprint:
                  input.requestFingerprint ||
                  existing
                    .requestFingerprint ||
                  null,

                failure:
                  null,
              },

              $inc: {
                attemptCount:
                  1,
              },
            },

            {
              new:
                true,
            }
          );

      if (
        reclaimed
      ) {
        return this.result({
          decision:
            IDEMPOTENCY_DECISION
              .RECLAIM_STALE,

          acquired:
            true,

          record:
            reclaimed,

          claimToken,

          ownerId:
            input.ownerId,

          leaseExpiresAt,

          reason:
            "Expired processing claim was reclaimed safely.",
        });
      }

      /*
       * Another worker won the reclaim race.
       */
      const raceWinner =
        await this.IdempotencyRecord
          .findOne(
            filter
          );

      return this.result({
        decision:
          IDEMPOTENCY_DECISION
            .DUPLICATE_PROCESSING,

        acquired:
          false,

        record:
          raceWinner,

        currentOwnerId:
          raceWinner
            ?.ownerId ||
          null,

        leaseExpiresAt:
          raceWinner
            ?.leaseExpiresAt ||
          null,

        reason:
          "Another worker reclaimed the expired claim first.",
      });
    }

    // ========================================================================
    // 7. FAILED
    // ========================================================================

    if (
      existing.status ===
      IDEMPOTENCY_STATUS
        .FAILED
    ) {
      if (
        existing.failure
          ?.retryable !==
        true
      ) {
        return this.result({
          decision:
            IDEMPOTENCY_DECISION
              .REJECTED,

          acquired:
            false,

          record:
            existing,

          reason:
            "Previous operation failure is not retryable.",
        });
      }

      const retried =
        await this.IdempotencyRecord
          .findOneAndUpdate(
            {
              ...filter,

              status:
                IDEMPOTENCY_STATUS
                  .FAILED,

              "failure.retryable":
                true,
            },

            {
              $set: {
                status:
                  IDEMPOTENCY_STATUS
                    .PROCESSING,

                ownerId:
                  input.ownerId,

                claimToken,

                claimedAt:
                  now,

                heartbeatAt:
                  now,

                leaseExpiresAt,

                failure:
                  null,
              },

              $inc: {
                attemptCount:
                  1,
              },
            },

            {
              new:
                true,
            }
          );

      if (
        retried
      ) {
        return this.result({
          decision:
            IDEMPOTENCY_DECISION
              .RETRY_FAILED,

          acquired:
            true,

          record:
            retried,

          claimToken,

          ownerId:
            input.ownerId,

          leaseExpiresAt,

          reason:
            "Retryable failed operation was acquired for another attempt.",
        });
      }

      const current =
        await this.IdempotencyRecord
          .findOne(
            filter
          );

      return this.result({
        decision:
          IDEMPOTENCY_DECISION
            .DUPLICATE_PROCESSING,

        acquired:
          false,

        record:
          current,

        reason:
          "Another worker acquired the failed operation first.",
      });
    }

    // ========================================================================
    // 8. EXPIRED
    // ========================================================================

    if (
      existing.status ===
      IDEMPOTENCY_STATUS
        .EXPIRED
    ) {
      return this.result({
        decision:
          IDEMPOTENCY_DECISION
            .REJECTED,

        acquired:
          false,

        record:
          existing,

        reason:
          "Idempotency record is expired and cannot be acquired automatically.",
      });
    }

    // ========================================================================
    // FAIL CLOSED
    // ========================================================================

    return this.result({
      decision:
        IDEMPOTENCY_DECISION
          .REJECTED,

      acquired:
        false,

      record:
        existing,

      reason:
        `Unsupported idempotency record status: ${existing.status}`,
    });
  }

  async markDuplicate(
    record,
    now
  ) {
    try {
      await this.IdempotencyRecord
        .updateOne(
          {
            _id:
              record._id,
          },

          {
            $inc: {
              duplicateCount:
                1,
            },

            $set: {
              lastDuplicateAt:
                now,
            },
          }
        );

      /*
       * Keep returned object useful in tests and callers.
       */
      if (
        typeof record.duplicateCount ===
        "number"
      ) {
        record.duplicateCount +=
          1;
      }

      record.lastDuplicateAt =
        now;
    } catch (
      error
    ) {
      /*
       * Duplicate counters are observability metadata.
       * Failure to increment them must not cause duplicate execution.
       */
    }
  }

  generateClaimToken() {
    return (
      "claim_" +
      crypto.randomUUID()
    );
  }

  result(
    input
  ) {
    return {
      ...input,

      executionAuthorized:
        false,
    };
  }

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
      throw Object.assign(
        new Error(
          "Idempotency claim input is required"
        ),
        {
          code:
            "IDEMPOTENCY_CLAIM_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.organizationId ||
      !input.environmentId
    ) {
      throw Object.assign(
        new Error(
          "Idempotency claim requires organization and environment scope"
        ),
        {
          code:
            "IDEMPOTENCY_CLAIM_SCOPE_REQUIRED",
        }
      );
    }

    assertValidIdempotencyOperation(
      input.operation
    );

    if (
      !input.idempotencyKey
    ) {
      throw Object.assign(
        new Error(
          "Idempotency claim requires idempotencyKey"
        ),
        {
          code:
            "IDEMPOTENCY_CLAIM_KEY_REQUIRED",
        }
      );
    }

    if (
      !input.ownerId
    ) {
      throw Object.assign(
        new Error(
          "Idempotency claim requires ownerId"
        ),
        {
          code:
            "IDEMPOTENCY_CLAIM_OWNER_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Idempotency claim service cannot authorize execution"
        ),
        {
          code:
            "IDEMPOTENCY_CLAIM_UNSAFE_INPUT",
        }
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

function isDuplicateKeyError(
  error
) {
  return (
    error &&
    (
      error.code ===
        11000 ||
      error.codeName ===
        "DuplicateKey"
    )
  );
}

module.exports =
  new IdempotencyClaimService();

module.exports
  .IdempotencyClaimService =
  IdempotencyClaimService;