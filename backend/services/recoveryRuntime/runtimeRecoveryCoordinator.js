"use strict";

/**
 * AIRA Runtime Recovery Coordinator
 *
 * Phase 11.2.6
 *
 * Responsibilities:
 *
 * - scan durable runtime checkpoints
 * - classify restart candidates
 * - mark expired PROCESSING checkpoints abandoned
 * - resolve safe resume decisions
 * - produce a restart recovery plan
 *
 * SAFETY:
 *
 * - does not execute infrastructure
 * - does not authorize execution
 * - interrupted EXECUTION is never blindly resumed
 * - mutations happen only through checkpoint persistence
 */

const runtimeStaleOperationDetector =
  require(
    "./runtimeStaleOperationDetector"
  );

const runtimeResumeStateResolver =
  require(
    "./runtimeResumeStateResolver"
  );

const runtimeCheckpointPersistenceService =
  require(
    "./runtimeCheckpointPersistenceService"
  );

const {
  RUNTIME_STAGE,
  CHECKPOINT_STATUS,
  RESUME_DECISION,
  INTERRUPTION_REASON,
  RESUME_SAFETY,

  assertNoExecutionAuthorization,
} =
  require(
    "./recoveryRuntimeContracts"
  );

const {
  DETECTION_CLASS,
} =
  require(
    "./runtimeStaleOperationDetector"
  );

class RuntimeRecoveryCoordinator {
  constructor(
    options = {}
  ) {
    this.detector =
      options.detector ||
      runtimeStaleOperationDetector;

    this.resolver =
      options.resolver ||
      runtimeResumeStateResolver;

    this.persistence =
      options.persistence ||
      runtimeCheckpointPersistenceService;
  }

  // ==========================================================================
  // RECOVER
  // ==========================================================================

  async recover(
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

    if (
      Number.isNaN(
        now.getTime()
      )
    ) {
      throw createError(
        "Invalid runtime recovery timestamp",
        "RUNTIME_RECOVERY_TIME_INVALID"
      );
    }

    // ========================================================================
    // 1. SCAN
    // ========================================================================

    const scan =
      await this.detector
        .scan({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          incidentId:
            input.incidentId,

          onlyRecoverable:
            input.onlyRecoverable !==
            false,

          now,

          executionAuthorized:
            false,
        });

    const plans =
      [];

    // ========================================================================
    // 2. PROCESS CANDIDATES
    // ========================================================================

    for (
      const item
      of scan.items
    ) {
      const plan =
        await this.planItem(
          item,
          {
            now,
          }
        );

      plans.push(
        plan
      );
    }

    // ========================================================================
    // 3. SUMMARY
    // ========================================================================

    return {
      scanned:
        scan.scanned,

      planned:
        plans.length,

      start:
        plans.filter(
          (
            item
          ) =>
            item.decision ===
            RESUME_DECISION
              .START
        ),

      resume:
        plans.filter(
          (
            item
          ) =>
            item.decision ===
            RESUME_DECISION
              .RESUME
        ),

      retrySafe:
        plans.filter(
          (
            item
          ) =>
            item.decision ===
            RESUME_DECISION
              .RETRY_SAFE
        ),

      wait:
        plans.filter(
          (
            item
          ) =>
            item.decision ===
            RESUME_DECISION
              .WAIT
        ),

      skipCompleted:
        plans.filter(
          (
            item
          ) =>
            item.decision ===
            RESUME_DECISION
              .SKIP_COMPLETED
        ),

      manualIntervention:
        plans.filter(
          (
            item
          ) =>
            item.decision ===
            RESUME_DECISION
              .MANUAL_INTERVENTION
        ),

      blocked:
        plans.filter(
          (
            item
          ) =>
            item.decision ===
            RESUME_DECISION
              .BLOCK
        ),

      plans,

      executionStarted:
        false,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // PLAN ONE CHECKPOINT
  // ==========================================================================

  async planItem(
    detection,
    {
      now,
    } = {}
  ) {
    if (
      !detection
    ) {
      throw createError(
        "Runtime recovery detection item is required",
        "RUNTIME_RECOVERY_DETECTION_REQUIRED"
      );
    }

    let checkpoint =
      detection.checkpoint ||
      null;

    /*
     * Detector results intentionally do not need to expose a full checkpoint.
     * Re-read the durable record when necessary.
     */
    if (
      !checkpoint
    ) {
      checkpoint =
        await this.persistence
          .findByIdentity({
            organizationId:
              detection.organizationId,

            environmentId:
              detection.environmentId,

            incidentId:
              detection.incidentId,

            stage:
              detection.stage,

            operationKey:
              detection.operationKey,

            executionAuthorized:
              false,
          });
    }

    if (
      !checkpoint
    ) {
      return this.createPlan({
        detection,

        decision:
          RESUME_DECISION
            .BLOCK,

        reason:
          "CHECKPOINT_DISAPPEARED_DURING_RECOVERY",

        resumeSafety:
          RESUME_SAFETY
            .UNKNOWN,
      });
    }

    // ========================================================================
    // STALE PROCESSING
    //
    // First convert expired PROCESSING -> ABANDONED durably.
    // ========================================================================

    if (
      detection.classification ===
      DETECTION_CLASS
        .STALE &&
      checkpoint.status ===
        CHECKPOINT_STATUS
          .PROCESSING
    ) {
      const resumeSafety =
        checkpoint.stage ===
          RUNTIME_STAGE
            .EXECUTION
          ? RESUME_SAFETY
              .REQUIRES_RECONCILIATION
          : (
              checkpoint.resumeSafety ||
              RESUME_SAFETY
                .UNKNOWN
            );

      const abandoned =
        await this.persistence
          .markAbandoned({
            organizationId:
              checkpoint.organizationId,

            environmentId:
              checkpoint.environmentId,

            incidentId:
              checkpoint.incidentId,

            stage:
              checkpoint.stage,

            operationKey:
              checkpoint.operationKey,

            reason:
              INTERRUPTION_REASON
                .LEASE_EXPIRED,

            resumeSafety,

            now,

            executionAuthorized:
              false,
          });

      if (
        abandoned.abandoned &&
        abandoned.checkpoint
      ) {
        checkpoint =
          abandoned.checkpoint;
      } else {
        /*
         * Another worker may have renewed/reclaimed between scan and mutation.
         * Re-read and resolve current durable truth.
         */
        checkpoint =
          await this.persistence
            .findByIdentity({
              organizationId:
                detection.organizationId,

              environmentId:
                detection.environmentId,

              incidentId:
                detection.incidentId,

              stage:
                detection.stage,

              operationKey:
                detection.operationKey,

              executionAuthorized:
                false,
            });
      }
    }

    // ========================================================================
    // RESOLVE SAFE NEXT ACTION
    // ========================================================================

    const resolution =
      this.resolver
        .resolve({
          checkpoint,

          now,

          executionAuthorized:
            false,
        });

    return this.createPlan({
      detection,

      checkpoint,

      decision:
        resolution.decision,

      reason:
        resolution.reason,

      resumeSafety:
        resolution.resumeSafety,

      previousResult:
        resolution.previousResult,
    });
  }

  // ==========================================================================
  // NORMALIZED PLAN
  // ==========================================================================

  createPlan({
    detection,
    checkpoint = null,
    decision,
    reason,
    resumeSafety,
    previousResult = null,
  }) {
    return {
      organizationId:
        detection.organizationId,

      environmentId:
        detection.environmentId,

      incidentId:
        detection.incidentId,

      operationKey:
        detection.operationKey,

      stage:
        detection.stage,

      originalClassification:
        detection.classification,

      checkpointStatus:
        checkpoint
          ?.status ||
        detection.status ||
        null,

      decision,

      reason,

      resumeSafety:

        resumeSafety ||
        RESUME_SAFETY
          .UNKNOWN,

      workflowIdentity:
        checkpoint
          ?.workflowIdentity ||
        null,

      previousResult:
        previousResult ||
        null,

      mutationReconciliationRequired:
        detection
          .mutationReconciliationRequired ===
        true ||
        (
          detection.stage ===
            RUNTIME_STAGE
              .EXECUTION &&
          [
            RESUME_DECISION
              .MANUAL_INTERVENTION,

            RESUME_DECISION
              .BLOCK,
          ].includes(
            decision
          )
        ),

      executionStarted:
        false,

      executionAuthorized:
        false,
    };
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
        "Runtime recovery input is required",
        "RUNTIME_RECOVERY_INPUT_REQUIRED"
      );
    }

    assertNoExecutionAuthorization(
      input
    );
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
  new RuntimeRecoveryCoordinator();

module.exports
  .RuntimeRecoveryCoordinator =
  RuntimeRecoveryCoordinator;