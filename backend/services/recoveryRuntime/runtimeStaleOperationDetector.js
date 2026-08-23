"use strict";

/**
 * AIRA Runtime Stale Operation Detector
 *
 * Phase 11.2.5
 *
 * Responsibilities:
 *
 * - inspect durable runtime checkpoints
 * - identify expired PROCESSING leases
 * - distinguish live ownership from stale ownership
 * - identify WAITING / terminal / abandoned work
 * - classify restart-recovery candidates
 *
 * SAFETY:
 *
 * - read-only
 * - does not claim checkpoints
 * - does not mark checkpoints abandoned
 * - does not enqueue retry
 * - does not execute infrastructure actions
 * - does not grant execution authorization
 */

const {
  runtimeRecoveryCheckpointRepository,
} = require(
  "../../persistence/repositories"
);

const {
  RUNTIME_STAGE,
  CHECKPOINT_STATUS,
  INTERRUPTION_REASON,
  RESUME_SAFETY,

  assertNoExecutionAuthorization,
} =
  require(
    "./recoveryRuntimeContracts"
  );

const DETECTION_CLASS =
  Object.freeze({
    LIVE:
      "LIVE",

    STALE:
      "STALE",

    WAITING:
      "WAITING",

    ABANDONED:
      "ABANDONED",

    FAILED:
      "FAILED",

    COMPLETED:
      "COMPLETED",

    INCONCLUSIVE:
      "INCONCLUSIVE",

    PENDING:
      "PENDING",

    UNKNOWN:
      "UNKNOWN",
  });

class RuntimeStaleOperationDetector {
  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      options.RuntimeRecoveryCheckpoint ||
      runtimeRecoveryCheckpointRepository;

    this.legacyModel =
      Boolean(
        options.RuntimeRecoveryCheckpoint
      );
  }

  // ==========================================================================
  // SCAN
  // ==========================================================================

  async scan(
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
      this.buildScanFilter(
        input
      );

    const checkpoints =
      this.legacyModel
        ? await this.repository.find(
            filter
          )
        : await this.repository.list(
            filter
          );

    const items =
      checkpoints.map(
        (
          checkpoint
        ) =>
          this.classify(
            checkpoint,
            {
              now,
            }
          )
      );

    return {
      scanned:
        checkpoints.length,

      recoverableCandidates:
        items.filter(
          (
            item
          ) =>
            item.recoveryCandidate ===
            true
        ),

      live:
        items.filter(
          (
            item
          ) =>
            item.classification ===
            DETECTION_CLASS
              .LIVE
        ),

      stale:
        items.filter(
          (
            item
          ) =>
            item.classification ===
            DETECTION_CLASS
              .STALE
        ),

      waiting:
        items.filter(
          (
            item
          ) =>
            item.classification ===
            DETECTION_CLASS
              .WAITING
        ),

      terminal:
        items.filter(
          (
            item
          ) =>
            [
              DETECTION_CLASS
                .FAILED,

              DETECTION_CLASS
                .COMPLETED,
            ].includes(
              item.classification
            )
        ),

      items,

      executionStarted:
        false,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // CLASSIFY
  // ==========================================================================

  classify(
    checkpoint,
    {
      now =
        new Date(),
    } = {}
  ) {
    if (
      !checkpoint
    ) {
      throw createError(
        "Runtime checkpoint is required for classification",
        "RUNTIME_STALE_CHECKPOINT_REQUIRED"
      );
    }

    if (
      checkpoint
        .executionAuthorized ===
      true
    ) {
      throw createError(
        "Runtime checkpoint contains forbidden execution authorization",
        "RUNTIME_STALE_UNSAFE_CHECKPOINT"
      );
    }

    const normalizedNow =
      normalizeDate(
        now
      );

    const status =
      checkpoint.status;

    const base = {
      checkpointId:
        checkpoint._id ||
        null,

      organizationId:
        checkpoint.organizationId,

      environmentId:
        checkpoint.environmentId,

      incidentId:
        checkpoint.incidentId,

      operationKey:
        checkpoint.operationKey,

      stage:
        checkpoint.stage,

      status,

      workerId:
        checkpoint
          ?.owner
          ?.workerId ||
        null,

      claimToken:
        checkpoint
          ?.owner
          ?.claimToken ||
        null,

      leaseExpiresAt:
        checkpoint
          ?.owner
          ?.leaseExpiresAt ||
        null,

      interruptionReason:
        checkpoint
          ?.interruption
          ?.reason ||
        null,

      resumeSafety:
        checkpoint.resumeSafety ||
        RESUME_SAFETY
          .UNKNOWN,

      recoveryCandidate:
        false,

      mutationReconciliationRequired:
        false,

      executionStarted:
        false,

      executionAuthorized:
        false,
    };

    // ========================================================================
    // PROCESSING
    // ========================================================================

    if (
      status ===
      CHECKPOINT_STATUS
        .PROCESSING
    ) {
      if (
        this.hasLiveLease(
          checkpoint,
          normalizedNow
        )
      ) {
        return {
          ...base,

          classification:
            DETECTION_CLASS
              .LIVE,

          reason:
            "PROCESSING_LEASE_ACTIVE",
        };
      }

      return {
        ...base,

        classification:
          DETECTION_CLASS
            .STALE,

        reason:
          "PROCESSING_LEASE_EXPIRED",

        interruptionReason:
          INTERRUPTION_REASON
            .LEASE_EXPIRED,

        recoveryCandidate:
          true,

        mutationReconciliationRequired:
          checkpoint.stage ===
          RUNTIME_STAGE
            .EXECUTION,
      };
    }

    // ========================================================================
    // ABANDONED
    // ========================================================================

    if (
      status ===
      CHECKPOINT_STATUS
        .ABANDONED
    ) {
      return {
        ...base,

        classification:
          DETECTION_CLASS
            .ABANDONED,

        reason:
          "CHECKPOINT_ALREADY_ABANDONED",

        recoveryCandidate:
          true,

        mutationReconciliationRequired:
          checkpoint.stage ===
          RUNTIME_STAGE
            .EXECUTION,
      };
    }

    // ========================================================================
    // WAITING
    // ========================================================================

    if (
      status ===
      CHECKPOINT_STATUS
        .WAITING
    ) {
      return {
        ...base,

        classification:
          DETECTION_CLASS
            .WAITING,

        reason:
          "CHECKPOINT_WAITING",

        recoveryCandidate:
          false,
      };
    }

    // ========================================================================
    // PENDING
    // ========================================================================

    if (
      status ===
      CHECKPOINT_STATUS
        .PENDING
    ) {
      return {
        ...base,

        classification:
          DETECTION_CLASS
            .PENDING,

        reason:
          "CHECKPOINT_PENDING",

        recoveryCandidate:
          true,
      };
    }

    // ========================================================================
    // FAILED
    // ========================================================================

    if (
      status ===
      CHECKPOINT_STATUS
        .FAILED
    ) {
      return {
        ...base,

        classification:
          DETECTION_CLASS
            .FAILED,

        reason:
          "CHECKPOINT_FAILED",

        /*
         * FAILED is terminal in persistence.
         *
         * The resume resolver may still later decide RETRY_SAFE
         * for explicitly safe non-execution stages.
         */
        recoveryCandidate:
          checkpoint
            ?.error
            ?.retryable ===
            true &&
          checkpoint
            .resumeSafety ===
            RESUME_SAFETY
              .SAFE &&
          checkpoint.stage !==
            RUNTIME_STAGE
              .EXECUTION,
      };
    }

    // ========================================================================
    // COMPLETED
    // ========================================================================

    if (
      status ===
      CHECKPOINT_STATUS
        .COMPLETED
    ) {
      return {
        ...base,

        classification:
          DETECTION_CLASS
            .COMPLETED,

        reason:
          "CHECKPOINT_COMPLETED",

        recoveryCandidate:
          false,
      };
    }

    // ========================================================================
    // INCONCLUSIVE
    // ========================================================================

    if (
      status ===
      CHECKPOINT_STATUS
        .INCONCLUSIVE
    ) {
      return {
        ...base,

        classification:
          DETECTION_CLASS
            .INCONCLUSIVE,

        reason:
          "CHECKPOINT_INCONCLUSIVE",

        recoveryCandidate:
          true,

        mutationReconciliationRequired:
          checkpoint.stage ===
          RUNTIME_STAGE
            .EXECUTION,
      };
    }

    return {
      ...base,

      classification:
        DETECTION_CLASS
          .UNKNOWN,

      reason:
        "UNKNOWN_CHECKPOINT_STATUS",

      recoveryCandidate:
        false,
    };
  }

  // ==========================================================================
  // LEASE
  // ==========================================================================

  hasLiveLease(
    checkpoint,
    now
  ) {
    const leaseExpiresAt =
      checkpoint
        ?.owner
        ?.leaseExpiresAt;

    if (
      !leaseExpiresAt
    ) {
      return false;
    }

    const expiry =
      new Date(
        leaseExpiresAt
      );

    if (
      Number.isNaN(
        expiry.getTime()
      )
    ) {
      return false;
    }

    return (
      expiry.getTime() >
      now.getTime()
    );
  }

  // ==========================================================================
  // FILTER
  // ==========================================================================

  buildScanFilter(
    input
  ) {
    const filter =
      {};

    if (
      input.organizationId
    ) {
      filter.organizationId =
        input.organizationId;
    }

    if (
      input.environmentId
    ) {
      filter.environmentId =
        input.environmentId;
    }

    if (
      input.incidentId
    ) {
      filter.incidentId =
        input.incidentId;
    }

    if (
      input.stage
    ) {
      filter.stage =
        input.stage;
    }

    if (
      input.onlyRecoverable ===
      true
    ) {
      filter.status = {
        $in: [
          CHECKPOINT_STATUS
            .PENDING,

          CHECKPOINT_STATUS
            .PROCESSING,

          CHECKPOINT_STATUS
            .ABANDONED,

          CHECKPOINT_STATUS
            .FAILED,

          CHECKPOINT_STATUS
            .INCONCLUSIVE,
        ],
      };
    }

    return filter;
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
        "object"
    ) {
      throw createError(
        "Runtime stale-operation scan input is required",
        "RUNTIME_STALE_INPUT_REQUIRED"
      );
    }

    assertNoExecutionAuthorization(
      input
    );
  }
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
      "Invalid stale-operation scan timestamp",
      "RUNTIME_STALE_TIME_INVALID"
    );
  }

  return date;
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
  new RuntimeStaleOperationDetector();

module.exports
  .RuntimeStaleOperationDetector =
  RuntimeStaleOperationDetector;

module.exports
  .DETECTION_CLASS =
  DETECTION_CLASS;
