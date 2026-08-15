"use strict";

/**
 * AIRA Runtime Resume-State Resolver
 *
 * Phase 11.2.4
 *
 * Converts durable checkpoint state into a safe runtime recovery decision.
 *
 * IMPORTANT:
 *
 * This service does NOT:
 *
 * - execute infrastructure actions
 * - enqueue execution
 * - authorize execution
 * - modify checkpoints
 * - assume interrupted execution is safe to replay
 *
 * It is a pure decision layer.
 */

const {
  RUNTIME_STAGE,
  CHECKPOINT_STATUS,
  RESUME_DECISION,
  RESUME_SAFETY,

  assertRuntimeStage,
  assertCheckpointStatus,
  assertNoExecutionAuthorization,

  requiresReconciliationBeforeResume,
} =
  require(
    "./recoveryRuntimeContracts"
  );

class RuntimeResumeStateResolver {
  resolve(
    input = {}
  ) {
    if (
      !input ||
      typeof input !==
        "object"
    ) {
      throw createError(
        "Runtime resume input is required",
        "RUNTIME_RESUME_INPUT_REQUIRED"
      );
    }

    assertNoExecutionAuthorization(
      input
    );

    const checkpoint =
      input.checkpoint ||
      null;

    // ========================================================================
    // NO CHECKPOINT
    //
    // Nothing durable says this stage has started.
    // START means the coordinator may proceed to the normal protected worker
    // entry point. It does NOT mean infrastructure execution is authorized.
    // ========================================================================

    if (
      !checkpoint
    ) {
      if (
        !input.stage
      ) {
        throw createError(
          "Runtime resume requires stage when checkpoint is absent",
          "RUNTIME_RESUME_STAGE_REQUIRED"
        );
      }

      assertRuntimeStage(
        input.stage
      );

      return this.result({
        decision:
          RESUME_DECISION
            .START,

        stage:
          input.stage,

        reason:
          "CHECKPOINT_NOT_FOUND",

        resumeSafety:
          RESUME_SAFETY
            .SAFE,
      });
    }

    const stage =
      checkpoint.stage;

    const status =
      checkpoint.status;

    assertRuntimeStage(
      stage
    );

    assertCheckpointStatus(
      status
    );

    if (
      checkpoint
        .executionAuthorized ===
      true
    ) {
      throw createError(
        "Runtime checkpoint contains forbidden execution authorization",
        "RUNTIME_RESUME_UNSAFE_CHECKPOINT"
      );
    }

    // ========================================================================
    // COMPLETED
    //
    // Never rerun completed work.
    // ========================================================================

    if (
      status ===
      CHECKPOINT_STATUS
        .COMPLETED
    ) {
      return this.result({
        decision:
          RESUME_DECISION
            .SKIP_COMPLETED,

        stage,

        reason:
          "CHECKPOINT_ALREADY_COMPLETED",

        resumeSafety:
          RESUME_SAFETY
            .SAFE,

        result:
          checkpoint.result ||
          null,
      });
    }

    // ========================================================================
    // CURRENTLY PROCESSING
    //
    // If the lease is still valid, another worker may still own the stage.
    // Wait instead of racing it.
    //
    // If the lease is expired, classify it as interrupted.
    // ========================================================================

    if (
      status ===
      CHECKPOINT_STATUS
        .PROCESSING
    ) {
      if (
        this.hasLiveLease(
          checkpoint,
          input.now
        )
      ) {
        return this.result({
          decision:
            RESUME_DECISION
              .WAIT,

          stage,

          reason:
            "CHECKPOINT_STILL_OWNED",

          resumeSafety:
            checkpoint
              .resumeSafety ||
            RESUME_SAFETY
              .UNKNOWN,
        });
      }

      return this.resolveInterrupted({
        checkpoint,

        stage,

        reason:
          "PROCESSING_LEASE_EXPIRED",
      });
    }

    // ========================================================================
    // ABANDONED
    // ========================================================================

    if (
      status ===
      CHECKPOINT_STATUS
        .ABANDONED
    ) {
      return this.resolveInterrupted({
        checkpoint,

        stage,

        reason:
          checkpoint
            .interruption
            ?.reason ||
          "CHECKPOINT_ABANDONED",
      });
    }

    // ========================================================================
    // INCONCLUSIVE
    //
    // We explicitly know there is insufficient evidence to continue normally.
    // ========================================================================

    if (
      status ===
      CHECKPOINT_STATUS
        .INCONCLUSIVE
    ) {
      if (
        stage ===
        RUNTIME_STAGE
          .EXECUTION
      ) {
        return this.result({
          decision:
            RESUME_DECISION
              .MANUAL_INTERVENTION,

          stage,

          reason:
            "EXECUTION_OUTCOME_INCONCLUSIVE",

          resumeSafety:
            RESUME_SAFETY
              .REQUIRES_RECONCILIATION,
        });
      }

      return this.result({
        decision:
          RESUME_DECISION
            .BLOCK,

        stage,

        reason:
          "CHECKPOINT_INCONCLUSIVE",

        resumeSafety:
          checkpoint
            .resumeSafety ||
          RESUME_SAFETY
            .UNKNOWN,
      });
    }

    // ========================================================================
    // FAILED
    //
    // FAILED is terminal in the checkpoint model.
    //
    // We only expose RETRY_SAFE when:
    //
    // 1. failure explicitly says retryable
    // 2. resumeSafety explicitly says SAFE
    // 3. stage is not EXECUTION
    //
    // Execution retry must go through reconciliation / a new explicitly
    // authorized execution decision rather than runtime recovery.
    // ========================================================================

    if (
      status ===
      CHECKPOINT_STATUS
        .FAILED
    ) {
      const retryable =
        checkpoint
          .error
          ?.retryable ===
        true;

      const explicitlySafe =
        checkpoint
          .resumeSafety ===
        RESUME_SAFETY
          .SAFE;

      if (
        retryable &&
        explicitlySafe &&
        stage !==
          RUNTIME_STAGE
            .EXECUTION
      ) {
        return this.result({
          decision:
            RESUME_DECISION
              .RETRY_SAFE,

          stage,

          reason:
            "FAILED_STAGE_EXPLICITLY_RETRYABLE",

          resumeSafety:
            RESUME_SAFETY
              .SAFE,
        });
      }

      return this.result({
        decision:
          RESUME_DECISION
            .BLOCK,

        stage,

        reason:
          stage ===
            RUNTIME_STAGE
              .EXECUTION
            ? "FAILED_EXECUTION_NOT_RUNTIME_RETRYABLE"
            : "FAILED_STAGE_NOT_SAFE_TO_RETRY",

        resumeSafety:
          checkpoint
            .resumeSafety ||
          RESUME_SAFETY
            .UNKNOWN,
      });
    }

    // ========================================================================
    // WAITING
    //
    // Waiting represents an intentional durable pause, such as waiting for
    // another workflow dependency or future approval/resolution.
    // ========================================================================

    if (
      status ===
      CHECKPOINT_STATUS
        .WAITING
    ) {
      return this.result({
        decision:
          RESUME_DECISION
            .WAIT,

        stage,

        reason:
          "CHECKPOINT_WAITING",

        resumeSafety:
          checkpoint
            .resumeSafety ||
          RESUME_SAFETY
            .UNKNOWN,
      });
    }

    // ========================================================================
    // PENDING
    //
    // Durable record exists, but work has not yet been claimed.
    // ========================================================================

    if (
      status ===
      CHECKPOINT_STATUS
        .PENDING
    ) {
      return this.result({
        decision:
          RESUME_DECISION
            .START,

        stage,

        reason:
          "CHECKPOINT_PENDING",

        resumeSafety:
          RESUME_SAFETY
            .SAFE,
      });
    }

    // Defensive fail-closed fallback.
    return this.result({
      decision:
        RESUME_DECISION
          .BLOCK,

      stage,

      reason:
        "UNHANDLED_CHECKPOINT_STATE",

      resumeSafety:
        RESUME_SAFETY
          .UNKNOWN,
    });
  }

  // ==========================================================================
  // INTERRUPTED WORK
  // ==========================================================================

  resolveInterrupted({
    checkpoint,
    stage,
    reason,
  }) {
    const reconciliationRequired =
      requiresReconciliationBeforeResume(
        stage,
        checkpoint.status
      );

    // ========================================================================
    // EXECUTION
    //
    // Never blindly replay an interrupted infrastructure mutation.
    // ========================================================================

    if (
      stage ===
      RUNTIME_STAGE
        .EXECUTION ||
      reconciliationRequired
    ) {
      return this.result({
        decision:
          RESUME_DECISION
            .MANUAL_INTERVENTION,

        stage,

        reason:
          reason ||
          "EXECUTION_RECONCILIATION_REQUIRED",

        resumeSafety:
          RESUME_SAFETY
            .REQUIRES_RECONCILIATION,
      });
    }

    // ========================================================================
    // NON-MUTATING / ORCHESTRATION STAGES
    //
    // Resume is allowed only when explicitly SAFE.
    // ========================================================================

    if (
      checkpoint
        .resumeSafety ===
      RESUME_SAFETY
        .SAFE
    ) {
      return this.result({
        decision:
          RESUME_DECISION
            .RESUME,

        stage,

        reason:
          reason ||
          "INTERRUPTED_STAGE_SAFE_TO_RESUME",

        resumeSafety:
          RESUME_SAFETY
            .SAFE,
      });
    }

    // ========================================================================
    // UNKNOWN IS NOT SAFE
    // ========================================================================

    return this.result({
      decision:
        RESUME_DECISION
          .BLOCK,

      stage,

      reason:
        reason ||
        "INTERRUPTED_STAGE_SAFETY_UNKNOWN",

      resumeSafety:
        checkpoint
          .resumeSafety ||
        RESUME_SAFETY
          .UNKNOWN,
    });
  }

  // ==========================================================================
  // LEASE
  // ==========================================================================

  hasLiveLease(
    checkpoint,
    nowInput
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

    const now =
      nowInput
        ? new Date(
            nowInput
          )
        : new Date();

    if (
      Number.isNaN(
        now.getTime()
      )
    ) {
      throw createError(
        "Invalid runtime resume timestamp",
        "RUNTIME_RESUME_TIME_INVALID"
      );
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
  // RESULT
  // ==========================================================================

  result({
    decision,
    stage,
    reason,
    resumeSafety,
    result = null,
  }) {
    return {
      decision,

      stage,

      reason,

      resumeSafety,

      previousResult:
        result,

      executionStarted:
        false,

      executionAuthorized:
        false,
    };
  }
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
  new RuntimeResumeStateResolver();

module.exports
  .RuntimeResumeStateResolver =
  RuntimeResumeStateResolver;