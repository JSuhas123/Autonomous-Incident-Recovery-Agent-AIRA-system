"use strict";

/**
 * AIRA Recovery Decision Worker
 *
 * Phase 7
 * Phase 11.1.8 — Idempotency
 * Phase 11.2.8 — Runtime Checkpoint Recovery
 *
 * Responsibilities:
 *
 * - validate recovery decision jobs
 * - create durable runtime checkpoints
 * - protect processing with deterministic idempotency
 * - run RecoveryDecisionLifecycleService exactly once per logical diagnosis
 * - persist runtime completion / failure
 * - publish completed / failed recovery events
 *
 * SAFETY:
 *
 * - duplicate deliveries do not repeat recovery processing
 * - runtime checkpoints do not grant execution authorization
 * - idempotency does not grant execution authorization
 * - worker never authorizes infrastructure execution
 * - runtime recovery never directly mutates infrastructure
 */

const os =
  require(
    "node:os"
  );

const recoveryDecisionLifecycleService =
  require(
    "../services/recovery/recoveryDecisionLifecycleService"
  );

const recoveryDecisionQueueService =
  require(
    "../services/recovery/recoveryDecisionQueueService"
  );

const idempotentWorkerService =
  require(
    "../services/idempotency/idempotentWorkerService"
  );

const runtimeCheckpointPersistenceService =
  require(
    "../services/recoveryRuntime/runtimeCheckpointPersistenceService"
  );

const {
  RUNTIME_STAGE,
  RESUME_SAFETY,
} =
  require(
    "../services/recoveryRuntime/recoveryRuntimeContracts"
  );

const {
  IDEMPOTENCY_OPERATION,
} =
  require(
    "../services/idempotency/idempotencyContracts"
  );

class RecoveryDecisionWorker {
  constructor(
    options = {}
  ) {
    this.lifecycle =
      options.lifecycle ||
      options.lifecycleService ||
      recoveryDecisionLifecycleService;

    this.queue =
      options.queue ||
      recoveryDecisionQueueService;

    this.idempotentWorker =
      options.idempotentWorker ||
      idempotentWorkerService;

    this.workerId =
      options.workerId ||
      [
        "recovery-decision",
        os.hostname(),
        process.pid,
      ].join(
        ":"
      );

    // =========================================================================
    // PHASE 11.2 RUNTIME CHECKPOINT
    // =========================================================================

    this.runtimeCheckpoint =
      options.runtimeCheckpoint ||
      runtimeCheckpointPersistenceService;

    /*
     * Existing pre-11.2 Jest tests should not touch the real Mongo-backed
     * checkpoint service.
     *
     * Production:
     *   enabled by default.
     *
     * New 11.2 tests:
     *   can explicitly enable using runtimeCheckpointEnabled:true.
     */
    this.runtimeCheckpointEnabled =
      options.runtimeCheckpointEnabled !==
        undefined
        ? options.runtimeCheckpointEnabled ===
          true
        : process.env.NODE_ENV !==
          "test";
  }

  // ==========================================================================
  // PUBLIC PROCESS ENTRY POINT
  //
  // Phase 11.2 checkpoint boundary sits OUTSIDE the Phase 11.1 idempotency
  // boundary.
  // ==========================================================================

  async process(
    job,
    dependencies = {}
  ) {
    this.assertJob(
      job
    );

    // =========================================================================
    // LEGACY / UNIT TEST PATH
    // =========================================================================

    if (
      this.runtimeCheckpointEnabled ===
      false
    ) {
      return this.processWithIdempotency(
        job,
        dependencies
      );
    }

    // =========================================================================
    // IMMUTABLE RECOVERY DECISION IDENTITY
    // =========================================================================

    const diagnosisId =
      job.diagnosisId ||
      job.diagnosis
        ?.diagnosisId;

    const diagnosisRevision =
      job.diagnosisRevision ??
      job.diagnosis
        ?.revision;

    const operationKey =
      [
        "recovery-decision",
        job.incidentId,
        diagnosisId,
        diagnosisRevision,
      ].join(
        ":"
      );

    // =========================================================================
    // 1. ENSURE DURABLE CHECKPOINT
    // =========================================================================

    await this.runtimeCheckpoint
      .ensureCheckpoint({
        organizationId:
          job.organizationId,

        environmentId:
          job.environmentId,

        incidentId:
          job.incidentId,

        stage:
          RUNTIME_STAGE
            .RECOVERY_DECISION,

        operationKey,

        workflowIdentity: {
          diagnosisId,

          diagnosisRevision,

          recoveryDecisionId:
            job.recoveryDecisionId ||
            null,
        },

        executionAuthorized:
          false,
      });

    // =========================================================================
    // 2. CLAIM CHECKPOINT
    // =========================================================================

    const claim =
      await this.runtimeCheckpoint
        .claim({
          organizationId:
            job.organizationId,

          environmentId:
            job.environmentId,

          incidentId:
            job.incidentId,

          stage:
            RUNTIME_STAGE
              .RECOVERY_DECISION,

          operationKey,

          workerId:
            this.workerId,

          leaseMs:
            dependencies
              .recoveryRuntimeLeaseMs ||
            60000,

          executionAuthorized:
            false,
        });

    // =========================================================================
    // 3. ANOTHER OWNER / TERMINAL CHECKPOINT
    // =========================================================================

    if (
      claim.claimed !==
      true
    ) {
      return {
        processed:
          true,

        checkpointClaimed:
          false,

        checkpointStatus:
          claim.checkpoint
            ?.status ||
          null,

        reason:
          claim.reason ||
          "CHECKPOINT_NOT_CLAIMED",

        duplicate:
          true,

        recoveryStarted:
          false,

        executionStarted:
          false,

        executionAuthorized:
          false,
      };
    }

    const claimToken =
      claim.claimToken;

    try {
      // =======================================================================
      // 4. EXISTING PHASE 11.1 IDEMPOTENT RECOVERY FLOW
      // =======================================================================

      const result =
        await this.processWithIdempotency(
          job,
          dependencies
        );

      // =======================================================================
      // 5. COMPLETE DURABLE RUNTIME CHECKPOINT
      // =======================================================================

      await this.runtimeCheckpoint
        .complete({
          organizationId:
            job.organizationId,

          environmentId:
            job.environmentId,

          incidentId:
            job.incidentId,

          stage:
            RUNTIME_STAGE
              .RECOVERY_DECISION,

          operationKey,

          workerId:
            this.workerId,

          claimToken,

          result,

          /*
           * Recovery-decision calculation is non-mutating and can be safely
           * reconstructed through the existing idempotency boundary.
           */
          resumeSafety:
            RESUME_SAFETY
              .SAFE,

          executionAuthorized:
            false,
        });

      return {
        ...result,

        checkpointClaimed:
          true,

        checkpointCompleted:
          true,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      // =======================================================================
      // 6. PERSIST CHECKPOINT FAILURE
      // =======================================================================

      try {
        await this.runtimeCheckpoint
          .fail({
            organizationId:
              job.organizationId,

            environmentId:
              job.environmentId,

            incidentId:
              job.incidentId,

            stage:
              RUNTIME_STAGE
                .RECOVERY_DECISION,

            operationKey,

            workerId:
              this.workerId,

            claimToken,

            error: {
              code:
                error.code ||
                "RECOVERY_DECISION_RUNTIME_FAILURE",

              message:
                error.message ||
                "Recovery decision runtime failed",

              retryable:
                this.isRetryable(
                  error
                ),
            },

            resumeSafety:
              RESUME_SAFETY
                .SAFE,

            executionAuthorized:
              false,
          });
      } catch (
        checkpointError
      ) {
        /*
         * Preserve the original domain failure.
         *
         * The checkpoint persistence failure is attached as secondary
         * diagnostic evidence instead of masking the actual worker failure.
         */
        error.runtimeCheckpointError =
          checkpointError;
      }

      throw error;
    }
  }

  // ==========================================================================
  // PHASE 11.1 IDEMPOTENT RECOVERY PROCESSOR
  //
  // This is the original idempotency-protected worker implementation.
  //
  // Phase 11.2 wraps this method but does NOT replace it.
  // ==========================================================================

  async processWithIdempotency(
    job,
    dependencies = {}
  ) {
    this.assertJob(
      job
    );

    const diagnosisId =
      job.diagnosisId ||
      job.diagnosis
        ?.diagnosisId;

    const diagnosisRevision =
      job.diagnosisRevision ??
      job.diagnosis
        ?.revision;

    try {
      const idempotentResult =
        await this.idempotentWorker
          .run({
            // ==================================================================
            // DETERMINISTIC LOGICAL IDENTITY
            //
            // Same:
            //
            // organization
            // environment
            // incident
            // diagnosis
            // diagnosis revision
            //
            // means the same recovery-decision operation.
            // ==================================================================

            identity: {
              organizationId:
                job.organizationId,

              environmentId:
                job.environmentId,

              operation:
                IDEMPOTENCY_OPERATION
                  .RECOVERY_DECISION,

              incidentId:
                job.incidentId,

              diagnosisId,

              diagnosisRevision,
            },

            ownerId:
              this.workerId,

            // ==================================================================
            // REQUEST FINGERPRINT
            //
            // Materially different input under the same identity fails closed.
            // ==================================================================

            payload: {
              organizationId:
                job.organizationId,

              environmentId:
                job.environmentId,

              incidentId:
                job.incidentId,

              diagnosisId,

              diagnosisRevision,

              diagnosis:
                job.diagnosis,

              safetyGate:
                job.safetyGate ||
                null,

              context:
                job.context ||
                null,
            },

            // ==================================================================
            // DOMAIN REFERENCES
            // ==================================================================

            references: {
              incidentId:
                job.incidentId,

              recoveryDecisionId:
                job.recoveryDecisionId ||
                null,

              eventId:
                job.eventId ||
                job.jobId ||
                null,

              correlationId:
                job.correlationId ||
                job.incidentId,
            },

            // ==================================================================
            // IDEMPOTENCY LEASE
            // ==================================================================

            leaseMs:
              dependencies
                .recoveryDecisionLeaseMs ||
              60000,

            heartbeatMs:
              dependencies
                .recoveryDecisionHeartbeatMs ||
              20000,

            // ==================================================================
            // RETRY CLASSIFICATION
            // ==================================================================

            isRetryable:
              (
                error
              ) =>
                this.isRetryable(
                  error
                ),

            // ==================================================================
            // ACTUAL RECOVERY DECISION BUSINESS LOGIC
            //
            // ONLY the idempotency owner enters this handler.
            // ==================================================================

            handler:
              async () => {
                const result =
                  await this.lifecycle
                    .run(
                      {
                        organizationId:
                          job.organizationId,

                        environmentId:
                          job.environmentId,

                        incidentId:
                          job.incidentId,

                        diagnosisId,

                        diagnosisRevision,

                        diagnosis:
                          job.diagnosis,

                        safetyGate:
                          job.safetyGate,

                        context:
                          job.context,

                        executionAuthorized:
                          false,
                      },

                      dependencies
                    );

                // ==============================================================
                // EXISTING PHASE 7 COMPLETED DOMAIN EVENT
                //
                // Keep this inside the idempotent handler so duplicate queue
                // deliveries cannot repeatedly emit completion events as though
                // recovery decision processing happened again.
                // ==============================================================

                try {
                  await this.queue
                    .publishCompleted({
                      job,

                      result,
                    });
                } catch (
                  error
                ) {
                  console.error(
                    "[recovery-worker] Could not publish completed event:",
                    error.message
                  );
                }

                return result;
              },

            /*
             * Idempotency ownership NEVER implies infrastructure authority.
             */
            executionAuthorized:
              false,
          });

      // ========================================================================
      // DUPLICATE DELIVERY
      // ========================================================================

      if (
        idempotentResult
          .executed ===
        false
      ) {
        return {
          processed:
            true,

          success:
            true,

          duplicate:
            idempotentResult
              .duplicate ===
            true,

          idempotencyDecision:
            idempotentResult
              .decision,

          idempotencyKey:
            idempotentResult
              .idempotencyKey,

          jobId:
            job.jobId ||
            null,

          /*
           * DUPLICATE_COMPLETED may contain the original result.
           *
           * DUPLICATE_PROCESSING normally has no previousResult because another
           * worker still owns the logical operation.
           */
          result:
            idempotentResult
              .previousResult ||
            null,

          previousResult:
            idempotentResult
              .previousResult ||
            null,

          resultReference:
            idempotentResult
              .resultReference ||
            null,

          reason:
            idempotentResult
              .reason ||
            null,

          recoveryStarted:
            false,

          executionStarted:
            false,

          executionAuthorized:
            false,
        };
      }

      // ========================================================================
      // ORIGINAL / RETRIED / STALE-RECLAIMED PROCESSING
      // ========================================================================

      return {
        processed:
          true,

        success:
          true,

        duplicate:
          false,

        idempotencyDecision:
          idempotentResult
            .decision,

        idempotencyKey:
          idempotentResult
            .idempotencyKey,

        jobId:
          job.jobId ||
          null,

        result:
          idempotentResult
            .result,

        recoveryStarted:
          false,

        executionStarted:
          false,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      // ========================================================================
      // EXISTING PHASE 7 FAILURE DOMAIN EVENT
      // ========================================================================

      try {
        await this.queue
          .publishFailed({
            job,

            error,
          });
      } catch (
        publishError
      ) {
        console.error(
          "[recovery-worker] Could not publish failed event:",
          publishError.message
        );
      }

      throw error;
    }
  }

  // ==========================================================================
  // RETRY CLASSIFICATION
  // ==========================================================================

  isRetryable(
    error
  ) {
    if (
      error?.retryable ===
      true
    ) {
      return true;
    }

    return [
      "ECONNRESET",
      "ETIMEDOUT",
      "ECONNREFUSED",

      "QUEUE_TEMPORARY_FAILURE",
      "DATABASE_TEMPORARY_FAILURE",

      "MONGODB_TEMPORARY_FAILURE",
      "REDIS_TEMPORARY_FAILURE",

      "RECOVERY_QUEUE_TEMPORARY_FAILURE",
    ].includes(
      error?.code
    );
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  assertJob(
    job
  ) {
    if (
      !job ||
      typeof job !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Recovery decision job is required"
        ),
        {
          code:
            "RECOVERY_JOB_REQUIRED",
        }
      );
    }

    for (
      const field
      of [
        "organizationId",
        "environmentId",
        "incidentId",
        "diagnosis",
      ]
    ) {
      if (
        !job[field]
      ) {
        throw Object.assign(
          new Error(
            `Recovery decision job requires ${field}`
          ),
          {
            code:
              "RECOVERY_JOB_SCOPE_REQUIRED",

            field,
          }
        );
      }
    }

    // ========================================================================
    // DIAGNOSIS IDENTITY
    //
    // Support both:
    //
    // job.diagnosisId / job.diagnosisRevision
    //
    // and:
    //
    // job.diagnosis.diagnosisId / job.diagnosis.revision
    // ========================================================================

    const diagnosisId =
      job.diagnosisId ||
      job.diagnosis
        ?.diagnosisId;

    const diagnosisRevision =
      job.diagnosisRevision ??
      job.diagnosis
        ?.revision;

    if (
      !diagnosisId
    ) {
      throw Object.assign(
        new Error(
          "Recovery decision job requires diagnosisId"
        ),
        {
          code:
            "RECOVERY_JOB_DIAGNOSIS_ID_REQUIRED",
        }
      );
    }

    if (
      diagnosisRevision ===
        undefined ||
      diagnosisRevision ===
        null
    ) {
      throw Object.assign(
        new Error(
          "Recovery decision job requires diagnosisRevision"
        ),
        {
          code:
            "RECOVERY_JOB_DIAGNOSIS_REVISION_REQUIRED",
        }
      );
    }

    if (
      !Number.isInteger(
        Number(
          diagnosisRevision
        )
      ) ||
      Number(
        diagnosisRevision
      ) <
        0
    ) {
      throw Object.assign(
        new Error(
          "Recovery decision job diagnosisRevision must be a non-negative integer"
        ),
        {
          code:
            "RECOVERY_JOB_DIAGNOSIS_REVISION_INVALID",
        }
      );
    }

    // ========================================================================
    // SAFETY
    // ========================================================================

    if (
      job.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Recovery decision worker cannot receive execution authorization"
        ),
        {
          code:
            "RECOVERY_DECISION_JOB_UNSAFE_INPUT",
        }
      );
    }
  }
}

module.exports =
  new RecoveryDecisionWorker();

module.exports
  .RecoveryDecisionWorker =
  RecoveryDecisionWorker;