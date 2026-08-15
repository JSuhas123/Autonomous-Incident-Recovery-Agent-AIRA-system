"use strict";

/**
 * AIRA Idempotent Worker Service
 *
 * Phase 11.1.7
 *
 * Wraps worker handlers with the complete idempotency lifecycle:
 *
 * key/fingerprint
 *      ↓
 * acquire
 *      ↓
 * heartbeat
 *      ↓
 * handler
 *      ↓
 * complete / fail
 *
 * IMPORTANT:
 * This service does NOT authorize infrastructure execution.
 */

const idempotencyKeyService =
  require("./idempotencyKeyService");

const idempotencyClaimService =
  require("./idempotencyClaimService");

const idempotencyCompletionService =
  require("./idempotencyCompletionService");

const idempotencyLeaseService =
  require("./idempotencyLeaseService");

const {
  IDEMPOTENCY_DECISION,
} =
  require("./idempotencyContracts");

class IdempotentWorkerService {
  constructor(options = {}) {
    this.keyService =
      options.keyService ||
      idempotencyKeyService;

    this.claimService =
      options.claimService ||
      idempotencyClaimService;

    this.completionService =
      options.completionService ||
      idempotencyCompletionService;

    this.leaseService =
      options.leaseService ||
      idempotencyLeaseService;

    this.defaultLeaseMs =
      normalizePositiveNumber(
        options.defaultLeaseMs,
        60000
      );

    this.defaultHeartbeatMs =
      normalizePositiveNumber(
        options.defaultHeartbeatMs,
        20000
      );
  }

  async run(input = {}) {
    this.assertInput(input);

    // ------------------------------------------------------------------
    // 1. GENERATE DETERMINISTIC KEY
    // ------------------------------------------------------------------

    const keyResult =
      this.keyService.generate(
        input.identity
      );

    const requestFingerprint =
      input.requestFingerprint ||
      this.keyService.fingerprint(
        input.payload
      );

    // ------------------------------------------------------------------
    // 2. ACQUIRE CLAIM
    // ------------------------------------------------------------------

    const claim =
      await this.claimService.acquire({
        ...input.identity,

        idempotencyKey:
          keyResult.idempotencyKey,

        requestFingerprint,

        ownerId:
          input.ownerId,

        leaseMs:
          input.leaseMs ||
          this.defaultLeaseMs,

        incidentId:
          input.references?.incidentId,

        recoveryDecisionId:
          input.references?.recoveryDecisionId,

        executionRequestId:
          input.references?.executionRequestId,

        verificationId:
          input.references?.verificationId,

        lifecycleId:
          input.references?.lifecycleId,

        eventId:
          input.references?.eventId,

        correlationId:
          input.references?.correlationId,

        metadata:
          input.metadata,

        executionAuthorized:
          false,
      });

    // ------------------------------------------------------------------
    // 3. DO NOT EXECUTE DUPLICATES
    // ------------------------------------------------------------------

    if (!claim.acquired) {
      return {
        executed:
          false,

        duplicate:
          claim.decision ===
            IDEMPOTENCY_DECISION
              .DUPLICATE_COMPLETED ||
          claim.decision ===
            IDEMPOTENCY_DECISION
              .DUPLICATE_PROCESSING,

        decision:
          claim.decision,

        idempotencyKey:
          keyResult.idempotencyKey,

        previousResult:
          claim.previousResult ||
          null,

        resultReference:
          claim.resultReference ||
          null,

        reason:
          claim.reason ||
          null,

        executionAuthorized:
          false,
      };
    }

    const claimToken =
      claim.claimToken;

    // ------------------------------------------------------------------
    // 4. START HEARTBEAT
    // ------------------------------------------------------------------

    const heartbeat =
      this.startHeartbeat({
        identity:
          input.identity,

        idempotencyKey:
          keyResult.idempotencyKey,

        ownerId:
          input.ownerId,

        claimToken,

        leaseMs:
          input.leaseMs ||
          this.defaultLeaseMs,

        heartbeatMs:
          input.heartbeatMs ||
          this.defaultHeartbeatMs,

        onLeaseLost:
          input.onLeaseLost,
      });

    try {
      // --------------------------------------------------------------
      // 5. EXECUTE CALLER'S HANDLER
      //
      // The handler must still perform its normal authorization checks.
      // --------------------------------------------------------------

      const handlerResult =
        await input.handler({
          payload:
            input.payload,

          idempotency: {
            idempotencyKey:
              keyResult.idempotencyKey,

            requestFingerprint,

            ownerId:
              input.ownerId,

            claimToken,

            decision:
              claim.decision,
          },
        });

      // --------------------------------------------------------------
      // 6. STOP HEARTBEAT BEFORE TERMINAL WRITE
      // --------------------------------------------------------------

      await heartbeat.stop();

      if (heartbeat.leaseLost()) {
        throw createError(
          "Idempotency lease ownership was lost during processing",
          "IDEMPOTENCY_WORKER_LEASE_LOST"
        );
      }

      // --------------------------------------------------------------
      // 7. COMPLETE
      // --------------------------------------------------------------

      const completion =
        await this.completionService.complete({
          ...input.identity,

          idempotencyKey:
            keyResult.idempotencyKey,

          ownerId:
            input.ownerId,

          claimToken,

          result:
            handlerResult,

          resultReference:
            input.resultReference ||
            null,

          executionAuthorized:
            false,
        });

      return {
        executed:
          true,

        duplicate:
          false,

        decision:
          claim.decision,

        idempotencyKey:
          keyResult.idempotencyKey,

        result:
          handlerResult,

        completion,

        executionAuthorized:
          false,
      };
    } catch (error) {
      await heartbeat.stop();

      /*
       * If ownership was lost, DO NOT let the stale worker mark the
       * operation FAILED. Another worker may already own the claim.
       */
      if (
        heartbeat.leaseLost() ||
        isOwnershipError(error)
      ) {
        throw error;
      }

      // --------------------------------------------------------------
      // 8. MARK FAILED
      // --------------------------------------------------------------

      try {
        await this.completionService.fail({
          ...input.identity,

          idempotencyKey:
            keyResult.idempotencyKey,

          ownerId:
            input.ownerId,

          claimToken,

          failure: {
            code:
              error.code ||
              "IDEMPOTENT_WORKER_HANDLER_FAILED",

            message:
              error.message ||
              "Idempotent worker handler failed.",

            retryable:
              resolveRetryable(
                error,
                input
              ),
          },

          executionAuthorized:
            false,
        });
      } catch (finalizationError) {
        /*
         * Never hide ownership/fencing failures.
         */
        if (
          isOwnershipError(
            finalizationError
          )
        ) {
          throw finalizationError;
        }

        error.idempotencyFinalizationError =
          finalizationError;
      }

      throw error;
    }
  }

  startHeartbeat({
    identity,
    idempotencyKey,
    ownerId,
    claimToken,
    leaseMs,
    heartbeatMs,
    onLeaseLost,
  }) {
    let stopped =
      false;

    let lost =
      false;

    let inFlight =
      Promise.resolve();

    const intervalMs =
      Math.max(
        1000,
        Math.min(
          heartbeatMs,
          Math.floor(
            leaseMs / 2
          )
        )
      );

    const beat =
      async () => {
        if (stopped) {
          return;
        }

        try {
          await this.leaseService
            .heartbeat({
              ...identity,

              idempotencyKey,

              ownerId,

              claimToken,

              leaseMs,

              executionAuthorized:
                false,
            });
        } catch (error) {
          lost =
            true;

          if (
            typeof onLeaseLost ===
            "function"
          ) {
            try {
              await onLeaseLost(
                error
              );
            } catch (_) {
              // Lease-loss callback must not
              // hide the actual fencing failure.
            }
          }
        }
      };

    const timer =
      setInterval(
        () => {
          if (
            stopped ||
            lost
          ) {
            return;
          }

          inFlight =
            beat();
        },
        intervalMs
      );

    /*
     * Prevent heartbeat timers from keeping a worker process alive
     * during shutdown.
     */
    if (
      typeof timer.unref ===
      "function"
    ) {
      timer.unref();
    }

    return {
      leaseLost:
        () =>
          lost,

      stop:
        async () => {
          if (stopped) {
            await inFlight;
            return;
          }

          stopped =
            true;

          clearInterval(
            timer
          );

          await inFlight;
        },
    };
  }

  assertInput(input) {
    if (
      !input ||
      typeof input !==
        "object"
    ) {
      throw createError(
        "Idempotent worker input is required",
        "IDEMPOTENT_WORKER_INPUT_REQUIRED"
      );
    }

    if (
      !input.identity ||
      typeof input.identity !==
        "object"
    ) {
      throw createError(
        "Idempotent worker identity is required",
        "IDEMPOTENT_WORKER_IDENTITY_REQUIRED"
      );
    }

    if (!input.ownerId) {
      throw createError(
        "Idempotent worker ownerId is required",
        "IDEMPOTENT_WORKER_OWNER_REQUIRED"
      );
    }

    if (
      typeof input.handler !==
        "function"
    ) {
      throw createError(
        "Idempotent worker handler is required",
        "IDEMPOTENT_WORKER_HANDLER_REQUIRED"
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw createError(
        "Idempotent worker service cannot authorize execution",
        "IDEMPOTENT_WORKER_UNSAFE_INPUT"
      );
    }
  }
}

function resolveRetryable(
  error,
  input
) {
  if (
    typeof input.isRetryable ===
      "function"
  ) {
    return (
      input.isRetryable(
        error
      ) === true
    );
  }

  return (
    error.retryable ===
    true
  );
}

function isOwnershipError(
  error
) {
  const code =
    error?.code;

  return [
    "IDEMPOTENCY_OWNER_MISMATCH",
    "IDEMPOTENCY_CLAIM_TOKEN_MISMATCH",
    "IDEMPOTENCY_FINALIZATION_CONFLICT",
    "IDEMPOTENCY_LEASE_OWNER_MISMATCH",
    "IDEMPOTENCY_LEASE_CLAIM_TOKEN_MISMATCH",
    "IDEMPOTENCY_LEASE_CONFLICT",
    "IDEMPOTENCY_WORKER_LEASE_LOST",
  ].includes(
    code
  );
}

function normalizePositiveNumber(
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
    numeric <=
      0
  ) {
    return fallback;
  }

  return Math.floor(
    numeric
  );
}

function createError(
  message,
  code
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,
    }
  );
}

module.exports =
  new IdempotentWorkerService();

module.exports
  .IdempotentWorkerService =
  IdempotentWorkerService;