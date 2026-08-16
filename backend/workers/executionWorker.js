"use strict";

/**
 * AIRA Execution Worker
 *
 * Phase 8.12
 * Phase 11.1.9 — Idempotent Execution
 * Phase 11.2.9 — Durable Runtime Checkpoint Integration
 *
 * Responsibilities:
 *
 * - validate immutable execution identity
 * - maintain durable execution runtime checkpoint
 * - protect execution using deterministic idempotency
 * - load the persisted ExecutionRequest
 * - load the persisted ExecutionAuthorization
 * - revalidate authorization at execution time
 * - revalidate immutable execution plan identity
 * - mark execution RUNNING / SUCCEEDED / FAILED / BLOCKED
 * - hand approved execution to the configured execution dependency
 * - publish lifecycle events
 *
 * IMPORTANT:
 *
 * Runtime recovery NEVER automatically replays an interrupted execution.
 *
 * A PROCESSING execution checkpoint that loses its owner eventually becomes:
 *
 * PROCESSING
 *      ↓
 * ABANDONED
 *      ↓
 * REQUIRES_RECONCILIATION
 *      ↓
 * MANUAL_INTERVENTION
 *
 * SAFETY:
 *
 * - runtime checkpoint ownership is NOT execution authorization
 * - idempotency ownership is NOT execution authorization
 * - persisted authorization is revalidated before execution
 * - immutable execution plan identity is revalidated
 * - duplicate deliveries do not repeat execution
 * - execution authorization is never returned as reusable authority
 */

const os =
  require(
    "node:os"
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

const ExecutionRequest =
  require(
    "../models/ExecutionRequest"
  );

const ExecutionAuthorization =
  require(
    "../models/ExecutionAuthorization"
  );

const executionQueueService =
  require(
    "../services/execution/executionQueueService"
  );

const {
  AUTHORIZATION_DECISION,
  AUTHORIZATION_STATUS,
  EXECUTION_REQUEST_STATE,
} =
  require(
    "../services/execution/executionAuthorizationContracts"
  );

  const executionVerificationOutboxIntegrationService =
  require(
    "../services/workflowOutbox/executionVerificationOutboxIntegrationService"
  );

class ExecutionWorker {
  constructor(
    options = {}
  ) {
    this.ExecutionRequest =
      options.ExecutionRequest ||
      ExecutionRequest;

    this.ExecutionAuthorization =
      options.ExecutionAuthorization ||
      ExecutionAuthorization;

    this.queue =
      options.queue ||
      executionQueueService;

    // ========================================================================
    // PHASE 11.1 IDEMPOTENCY
    // ========================================================================

    this.idempotentWorker =
      options.idempotentWorker ||
      idempotentWorkerService;

    this.workerId =
      options.workerId ||
      [
        "execution",
        os.hostname(),
        process.pid,
      ].join(
        ":"
      );
    
      const hasInjectedOutboxIntegration =
  Object.prototype
    .hasOwnProperty
    .call(
      options,
      "outboxIntegration"
    );

this.outboxIntegration =
  hasInjectedOutboxIntegration
    ? options.outboxIntegration
    : executionVerificationOutboxIntegrationService;

if (
  options.outboxEnabled !==
  undefined
) {
  this.outboxEnabled =
    options.outboxEnabled ===
    true;
} else if (
  hasInjectedOutboxIntegration
) {
  this.outboxEnabled =
    true;
} else {
  /*
   * Preserve old ExecutionWorker tests.
   *
   * Production enables the durable handoff automatically.
   */
  this.outboxEnabled =
    process.env.NODE_ENV !==
    "test";
}
    // ========================================================================
    // PHASE 11.2 RUNTIME CHECKPOINT
    // ========================================================================

    this.runtimeCheckpoint =
      options.runtimeCheckpoint ||
      runtimeCheckpointPersistenceService;

    /*
     * Production:
     *   runtime checkpointing enabled.
     *
     * Existing Jest tests:
     *   disabled unless explicitly enabled, preventing accidental access
     *   to the real Mongo-backed RuntimeRecoveryCheckpoint model.
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
  // PUBLIC ENTRY POINT
  //
  // Phase 11.2 checkpointing sits OUTSIDE Phase 11.1 idempotency.
  // ==========================================================================

  async process(
    job = {},
    dependencies = {}
  ) {
    this.assertJob(
      job
    );

    const identity =
      this.resolveExecutionIdentity(
        job
      );

    // ========================================================================
    // EXISTING TEST / LEGACY PATH
    // ========================================================================

    if (
      this.runtimeCheckpointEnabled ===
      false
    ) {
      return this.processWithIdempotency(
        job,
        dependencies,
        identity
      );
    }

    const operationKey =
      [
        "execution",
        job.incidentId,
        identity.executionRequestId,
        identity.executionPlanId,
        identity.executionPlanHash,
      ].join(
        ":"
      );

    // ========================================================================
    // 1. ENSURE DURABLE EXECUTION CHECKPOINT
    // ========================================================================

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
            .EXECUTION,

        operationKey,

        workflowIdentity: {
          recoveryDecisionId:
            job.recoveryDecisionId ||
            null,

          executionRequestId:
            identity
              .executionRequestId,

          executionPlanHash:
            identity
              .executionPlanHash,
        },

        executionAuthorized:
          false,
      });

    // ========================================================================
    // 2. CLAIM CHECKPOINT
    // ========================================================================

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
              .EXECUTION,

          operationKey,

          workerId:
            this.workerId,

          leaseMs:
            dependencies
              .executionRuntimeLeaseMs ||
            120000,

          executionAuthorized:
            false,
        });

    // ========================================================================
    // 3. CHECKPOINT ALREADY OWNED / TERMINAL
    //
    // IMPORTANT:
    //
    // We do NOT call processWithIdempotency() if the runtime checkpoint cannot
    // be claimed.
    // ========================================================================

    if (
      claim.claimed !==
      true
    ) {
      return {
        processed:
          true,

        success:
          false,

        checkpointClaimed:
          false,

        checkpointStatus:
          claim.checkpoint
            ?.status ||
          null,

        reason:
          claim.reason ||
          "EXECUTION_CHECKPOINT_NOT_CLAIMED",

        duplicate:
          true,

        executionPerformed:
          false,

        executionStarted:
          false,

        mutationReconciliationRequired:
          claim.checkpoint
            ?.status ===
            "ABANDONED" ||
          claim.checkpoint
            ?.status ===
            "INCONCLUSIVE",

        executionAuthorized:
          false,
      };
    }

    const claimToken =
      claim.claimToken;

    try {
      // ======================================================================
      // 4. ENTER EXISTING PHASE 11.1 IDEMPOTENCY BOUNDARY
      // ======================================================================

      const result =
        await this.processWithIdempotency(
          job,
          dependencies,
          identity
        );

      // ======================================================================
      // 5. COMPLETE EXECUTION CHECKPOINT
      //
      // Once processWithIdempotency has returned normally, the execution
      // lifecycle has reached a durable terminal result.
      // ======================================================================

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
              .EXECUTION,

          operationKey,

          workerId:
            this.workerId,

          claimToken,

          result,

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
      // ======================================================================
      // 6. EXECUTION FAILURE CHECKPOINT
      //
      // Unlike recovery-decision/verification calculation, an execution
      // failure is NOT classified SAFE for runtime replay.
      //
      // Even a transport error can occur after an external mutation was
      // accepted, so runtime recovery must reconcile before another mutation.
      // ======================================================================

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
                .EXECUTION,

            operationKey,

            workerId:
              this.workerId,

            claimToken,

            error: {
              code:
                error?.code ||
                "EXECUTION_RUNTIME_FAILURE",

              message:
                error?.message ||
                "Execution runtime failed",

              /*
               * This is metadata only.
               *
               * Even if an execution error is technically retryable at the
               * 11.1 idempotency level, 11.2 runtime recovery MUST NOT
               * automatically replay an interrupted mutation.
               */
              retryable:
                this.isExecutionRetryable(
                  error
                ),
            },

            resumeSafety:
              RESUME_SAFETY
                .REQUIRES_RECONCILIATION,

            executionAuthorized:
              false,
          });
      } catch (
        checkpointError
      ) {
        /*
         * Never mask the real execution error.
         */
        error.runtimeCheckpointError =
          checkpointError;
      }

      throw error;
    }
  }

  // ==========================================================================
  // EXECUTION IDENTITY
  // ==========================================================================

  resolveExecutionIdentity(
    job
  ) {
    const executionRequestId =
      job.executionRequestId ||
      job.requestId ||
      job.executionRequest
        ?.executionRequestId;

    const executionPlan =
      job.executionPlan ||
      job.plan ||
      {};

    const executionPlanId =
      job.executionPlanId ||
      executionPlan.planId ||
      executionPlan.executionPlanId;

    const executionPlanHash =
      job.executionPlanHash ||
      executionPlan.planHash ||
      executionPlan.executionPlanHash;

    if (
      !executionRequestId ||
      !executionPlanId ||
      !executionPlanHash
    ) {
      throw Object.assign(
        new Error(
          "Execution worker requires immutable execution identity"
        ),
        {
          code:
            "EXECUTION_JOB_IDENTITY_REQUIRED",
        }
      );
    }

    return {
      executionRequestId,

      executionPlan,

      executionPlanId,

      executionPlanHash,
    };
  }

  // ==========================================================================
  // PHASE 11.1 IDEMPOTENT PROCESSOR
  // ==========================================================================

  async processWithIdempotency(
    job,
    dependencies = {},
    resolvedIdentity = null
  ) {
    this.assertJob(
      job
    );

    const identity =
      resolvedIdentity ||
      this.resolveExecutionIdentity(
        job
      );

    const {
      executionRequestId,
      executionPlan,
      executionPlanId,
      executionPlanHash,
    } =
      identity;

    const wrapped =
      await this.idempotentWorker
        .run({
          // ==================================================================
          // IMMUTABLE EXECUTION IDENTITY
          // ==================================================================

          identity: {
            organizationId:
              job.organizationId,

            environmentId:
              job.environmentId,

            operation:
              IDEMPOTENCY_OPERATION
                .EXECUTION,

            executionRequestId,

            executionPlanId,

            executionPlanHash,
          },

          ownerId:
            this.workerId,

          // ==================================================================
          // REQUEST FINGERPRINT
          // ==================================================================

          payload: {
            organizationId:
              job.organizationId,

            environmentId:
              job.environmentId,

            incidentId:
              job.incidentId,

            executionRequestId,

            executionPlanId,

            executionPlanHash,

            authorizationId:
              job.authorizationId ||
              null,

            executionPlan,

            context:
              job.context ||
              null,
          },

          // ==================================================================
          // REFERENCES
          // ==================================================================

          references: {
            incidentId:
              job.incidentId ||
              null,

            executionRequestId,

            recoveryDecisionId:
              job.recoveryDecisionId ||
              null,

            eventId:
              job.eventId ||
              job.jobId ||
              null,

            correlationId:
              job.correlationId ||
              executionRequestId,
          },

          // ==================================================================
          // IDEMPOTENCY LEASE
          // ==================================================================

          leaseMs:
            dependencies
              .executionLeaseMs ||
            120000,

          heartbeatMs:
            dependencies
              .executionHeartbeatMs ||
            30000,

          // ==================================================================
          // CONSERVATIVE RETRY CLASSIFICATION
          // ==================================================================

          isRetryable:
            (
              error
            ) =>
              this.isExecutionRetryable(
                error
              ),

          // ==================================================================
          // REAL PHASE 8 EXECUTION FLOW
          //
          // Authorization is revalidated INSIDE this handler.
          // ==================================================================

          handler:
  async () =>
    this.processAuthorizedExecutionWithDurableHandoff(
      job,
      dependencies
    ),

          executionAuthorized:
            false,
        });

    // =========================================================================
    // DUPLICATE / REJECTED
    // =========================================================================

    if (
      wrapped.executed ===
      false
    ) {
      return {
        processed:
          true,

        success:
          wrapped.decision ===
            "DUPLICATE_COMPLETED",

        duplicate:
          wrapped.duplicate ===
          true,

        executionPerformed:
          false,

        idempotencyDecision:
          wrapped.decision,

        idempotencyKey:
          wrapped.idempotencyKey,

        previousResult:
          wrapped.previousResult ||
          null,

        resultReference:
          wrapped.resultReference ||
          null,

        reason:
          wrapped.reason ||
          null,

        executionStarted:
          false,

        executionAuthorized:
          false,
      };
    }

    // =========================================================================
    // ORIGINAL / RETRY / RECLAIMED PROCESSING
    // =========================================================================

    return {
      processed:
        true,

      success:
        true,

      duplicate:
        false,

      executionPerformed:
        true,

      idempotencyDecision:
        wrapped.decision,

      idempotencyKey:
        wrapped.idempotencyKey,

      result:
        wrapped.result,

      /*
       * Authority existed only inside the approved execution operation.
       * It is never exposed as reusable authority.
       */
      executionAuthorized:
        false,
    };
  }


  // ============================================================================
// PHASE 11.3.10C
// EXECUTION + DURABLE VERIFICATION HANDOFF
// ============================================================================

async processAuthorizedExecutionWithDurableHandoff(
  job,
  dependencies = {}
) {
  /*
   * CRITICAL:
   *
   * Phase 11.3 does NOT replace the existing execution engine.
   *
   * The original protected Phase 8 path remains responsible for:
   *
   * - loading ExecutionRequest
   * - loading ExecutionAuthorization
   * - immutable plan validation
   * - policy / approval enforcement
   * - infrastructure execution
   * - execution result persistence
   *
   * Only after that path returns do we consider creating a durable
   * verification handoff.
   */
  const result =
    await this
      .processAuthorizedExecution(
        job,
        dependencies
      );

  // ==========================================================================
  // LEGACY / TEST COMPATIBILITY
  // ==========================================================================

  if (
    this.outboxEnabled !==
    true
  ) {
    return {
      ...result,

      outboxHandoff:
        null,

      executionAuthorized:
        false,
    };
  }

  /*
   * The integration service decides whether this result actually requires
   * verification.
   *
   * Failed / blocked / non-executed requests must not generate verification
   * work.
   */
  const outboxHandoff =
    await this
      .outboxIntegration
      .createFromResult({
        job: {
          ...job,

          /*
           * Never propagate authorization as transport authority.
           *
           * authorizationId may remain in the job as a reference.
           */
          executionAuthorized:
            false,
        },

        result,

        dependencies,
      });

  return {
    ...result,

    outboxHandoff,

    /*
     * The execution may already have been legitimately authorized and
     * performed inside processAuthorizedExecution().
     *
     * But the RESULT leaving this workflow boundary cannot itself become
     * reusable authorization.
     */
    executionAuthorized:
      false,
  };
}


  // ==========================================================================
  // REAL PHASE 8 EXECUTION ORCHESTRATION
  // ==========================================================================

  async processAuthorizedExecution(
    job,
    dependencies = {}
  ) {
    // =========================================================================
    // 1. LOAD PERSISTED EXECUTION REQUEST
    // =========================================================================

    const request =
      await this.loadRequest(
        job
      );

    // =========================================================================
    // 2. LOAD PERSISTED AUTHORIZATION
    // =========================================================================

    const authorization =
      await this.loadAuthorization(
        request,
        job
      );

    // =========================================================================
    // 3. REVALIDATE PERSISTED AUTHORIZATION BOUNDARY
    // =========================================================================

    const persistedValidation =
      this.validatePersistedState({
        request,
        authorization,
      });

    if (
      persistedValidation.allowed !==
      true
    ) {
      await this.markBlocked({
        request,

        reason:
          persistedValidation
            .reason,
      });

      await this.safePublishBlocked({
        request,
        authorization,

        reason:
          persistedValidation
            .reason,
      });

      return {
        processed:
          true,

        success:
          false,

        blocked:
          true,

        reason:
          persistedValidation
            .reason,

        executionRequestId:
          request
            .executionRequestId,

        authorizationId:
          authorization
            .authorizationId,

        executionPerformed:
          false,

        executionStarted:
          false,

        executionAuthorized:
          false,
      };
    }

    // =========================================================================
    // 4. IMMUTABLE REQUEST ↔ JOB PLAN VALIDATION
    //
    // The job may not substitute a different plan after authorization.
    // =========================================================================

    const identityValidation =
      this.validateImmutableExecutionIdentity({
        request,
        authorization,
        job,
      });

    if (
      identityValidation.allowed !==
      true
    ) {
      await this.markBlocked({
        request,

        reason:
          identityValidation
            .reason,
      });

      await this.safePublishBlocked({
        request,
        authorization,

        reason:
          identityValidation
            .reason,
      });

      return {
        processed:
          true,

        success:
          false,

        blocked:
          true,

        reason:
          identityValidation
            .reason,

        executionRequestId:
          request
            .executionRequestId,

        authorizationId:
          authorization
            .authorizationId,

        executionPerformed:
          false,

        executionStarted:
          false,

        executionAuthorized:
          false,
      };
    }

    // =========================================================================
    // 5. MARK RUNNING
    //
    // From this point onward, an unexpected process crash represents an
    // uncertain mutation boundary and 11.2 must require reconciliation.
    // =========================================================================

    await this.markRunning(
      request
    );

    await this.safePublishStarted({
      request,
      authorization,
    });

    try {
      // =======================================================================
      // 6. EXECUTE THROUGH THE EXISTING CANONICAL DEPENDENCY
      //
      // This worker itself does not invent shell/kubectl operations.
      //
      // For compatibility with the existing Phase 8 architecture/tests we
      // support executeExistingWorkerLogic().
      //
      // A production caller may alternatively inject executeApprovedExecution()
      // or executionExecutor.execute().
      // =======================================================================

      const result =
        await this.invokeApprovedExecution({
          job,
          request,
          authorization,
          dependencies,
        });

      // =======================================================================
      // 7. PERSIST SUCCESS
      // =======================================================================

      await this.markCompleted({
        request,
        result,
      });

      await this.safePublishCompleted({
        request,
        authorization,
        result,
      });

      return {
        processed:
          true,

        success:
          true,

        blocked:
          false,

        executionRequestId:
          request
            .executionRequestId,

        authorizationId:
          authorization
            .authorizationId,

        result,

        executionPerformed:
          true,

        /*
         * Execution did happen internally, but reusable authorization is never
         * exported in the worker response.
         */
        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      // =======================================================================
      // 8. PERSIST FAILURE
      // =======================================================================

      try {
        await this.markFailed({
          request,
          error,
        });
      } catch (
        persistenceError
      ) {
        error.executionPersistenceError =
          persistenceError;
      }

      await this.safePublishFailed({
        request,
        authorization,
        error,
      });

      throw error;
    }
  }

  // ==========================================================================
  // CANONICAL EXECUTION DEPENDENCY
  // ==========================================================================

  async invokeApprovedExecution({
    job,
    request,
    authorization,
    dependencies,
  }) {
    /*
     * Existing Phase 8 compatibility path.
     */
    if (
      typeof dependencies
        .executeExistingWorkerLogic ===
      "function"
    ) {
      return dependencies
        .executeExistingWorkerLogic(
          {
            job,

            request,

            authorization,

            /*
             * This internal flag communicates only that the persisted
             * authorization boundary has already been revalidated here.
             *
             * It is not placed back onto the queue job and is never returned.
             */
            executionAuthorized:
              true,
          }
        );
    }

    /*
     * Preferred explicit approved-execution dependency.
     */
    if (
      typeof dependencies
        .executeApprovedExecution ===
      "function"
    ) {
      return dependencies
        .executeApprovedExecution({
          job,

          request,

          authorization,

          executionAuthorized:
            true,
        });
    }

    /*
     * Executor object form.
     */
    if (
      dependencies
        .executionExecutor &&
      typeof dependencies
        .executionExecutor
        .execute ===
        "function"
    ) {
      return dependencies
        .executionExecutor
        .execute({
          job,

          request,

          authorization,

          executionAuthorized:
            true,
        });
    }

    throw Object.assign(
      new Error(
        "Approved execution dependency is not configured"
      ),
      {
        code:
          "EXECUTION_WORKER_EXECUTOR_NOT_CONFIGURED",
      }
    );
  }

  // ==========================================================================
  // IMMUTABLE EXECUTION IDENTITY VALIDATION
  // ==========================================================================

  validateImmutableExecutionIdentity({
    request,
    authorization,
    job,
  }) {
    const jobPlanId =
      job.executionPlanId ||
      job.executionPlan
        ?.planId ||
      job.executionPlan
        ?.executionPlanId;

    const jobPlanHash =
      job.executionPlanHash ||
      job.executionPlan
        ?.planHash ||
      job.executionPlan
        ?.executionPlanHash;

    // ========================================================================
    // REQUEST ID
    // ========================================================================

    if (
      String(
        request.executionRequestId
      ) !==
      String(
        job.executionRequestId
      )
    ) {
      return {
        allowed:
          false,

        reason:
          "Execution job request identity does not match persisted execution request.",
      };
    }

    // ========================================================================
    // PLAN ID
    //
    // Only enforce when persisted request contains the ID.
    // ========================================================================

    const persistedPlanId =
      request.planId ||
      request.executionPlanId ||
      request.executionPlan
        ?.planId ||
      null;

    if (
      persistedPlanId &&
      String(
        persistedPlanId
      ) !==
      String(
        jobPlanId
      )
    ) {
      return {
        allowed:
          false,

        reason:
          "Execution job plan ID does not match persisted execution request.",
      };
    }

    // ========================================================================
    // PLAN HASH
    // ========================================================================

    const persistedPlanHash =
      request.planHash ||
      request.executionPlanHash ||
      request.executionPlan
        ?.planHash ||
      null;

    if (
      persistedPlanHash &&
      String(
        persistedPlanHash
      ) !==
      String(
        jobPlanHash
      )
    ) {
      return {
        allowed:
          false,

        reason:
          "Execution job plan hash does not match persisted execution request.",
      };
    }

    if (
      authorization.planHash &&
      String(
        authorization.planHash
      ) !==
      String(
        jobPlanHash
      )
    ) {
      return {
        allowed:
          false,

        reason:
          "Execution job plan hash does not match persisted authorization.",
      };
    }

    return {
      allowed:
        true,

      reason:
        null,
    };
  }

  // ==========================================================================
  // RETRY CLASSIFICATION
  // ==========================================================================

  isExecutionRetryable(
    error
  ) {
    if (
      error?.retryable ===
      true
    ) {
      return true;
    }

    /*
     * This classification belongs to Phase 11.1 idempotency.
     *
     * It does NOT mean 11.2 may automatically replay an interrupted
     * infrastructure mutation.
     */
    return [
      "ECONNRESET",
      "ETIMEDOUT",
      "ECONNREFUSED",

      "DATABASE_TEMPORARY_FAILURE",
      "QUEUE_TEMPORARY_FAILURE",
    ].includes(
      error?.code
    );
  }

  // ==========================================================================
  // LOAD REQUEST
  // ==========================================================================

  async loadRequest(
    job
  ) {
    const request =
      await this.ExecutionRequest
        .findOne({
          executionRequestId:
            job.executionRequestId,

          organizationId:
            job.organizationId,

          environmentId:
            job.environmentId,

          incidentId:
            job.incidentId,
        });

    if (
      !request
    ) {
      throw Object.assign(
        new Error(
          "Execution request not found"
        ),
        {
          code:
            "EXECUTION_REQUEST_NOT_FOUND",

          status:
            404,
        }
      );
    }

    return request;
  }

  // ==========================================================================
  // LOAD AUTHORIZATION
  // ==========================================================================

  async loadAuthorization(
    request,
    job
  ) {
    const authorizationId =
      job.authorizationId ||
      request.authorizationId;

    if (
      !authorizationId
    ) {
      throw Object.assign(
        new Error(
          "Execution authorization ID is required"
        ),
        {
          code:
            "EXECUTION_AUTHORIZATION_ID_REQUIRED",
        }
      );
    }

    const authorization =
      await this.ExecutionAuthorization
        .findOne({
          authorizationId,

          organizationId:
            request.organizationId,

          environmentId:
            request.environmentId,

          incidentId:
            request.incidentId,
        });

    if (
      !authorization
    ) {
      throw Object.assign(
        new Error(
          "Execution authorization not found"
        ),
        {
          code:
            "EXECUTION_AUTHORIZATION_NOT_FOUND",

          status:
            404,
        }
      );
    }

    return authorization;
  }

  // ==========================================================================
  // PERSISTED AUTHORIZATION SAFETY
  // ==========================================================================

  validatePersistedState({
    request,
    authorization,
  }) {
    if (
      String(
        request.authorizationId
      ) !==
      String(
        authorization.authorizationId
      )
    ) {
      return {
        allowed:
          false,

        reason:
          "Execution request references a different authorization.",
      };
    }

    if (
      authorization
        .authorizationGranted !==
      true
    ) {
      return {
        allowed:
          false,

        reason:
          "Persisted authorization was not granted.",
      };
    }

    if (
      authorization.decision !==
      AUTHORIZATION_DECISION
        .AUTHORIZED
    ) {
      return {
        allowed:
          false,

        reason:
          "Persisted authorization decision is not AUTHORIZED.",
      };
    }

    if (
      authorization.status !==
      AUTHORIZATION_STATUS
        .AUTHORIZED
    ) {
      return {
        allowed:
          false,

        reason:
          "Persisted authorization status is not AUTHORIZED.",
      };
    }

    if (
      authorization
        .criticResult
        ?.accepted !==
      true ||
      authorization
        .criticResult
        ?.authorizationGranted !==
      true
    ) {
      return {
        allowed:
          false,

        reason:
          "Persisted authorization was not accepted by authorization critic.",
      };
    }

    if (
      request.state !==
        EXECUTION_REQUEST_STATE
          .AUTHORIZED &&
      request.state !==
        EXECUTION_REQUEST_STATE
          .QUEUED
    ) {
      return {
        allowed:
          false,

        reason:
          `Execution request state ${request.state} is not executable.`,
      };
    }

    if (
      String(
        request
          .recoveryDecisionId
      ) !==
      String(
        authorization
          .recoveryDecisionId
      )
    ) {
      return {
        allowed:
          false,

        reason:
          "Execution request recovery decision does not match authorization.",
      };
    }

    if (
      String(
        request.playbookId
      ) !==
      String(
        authorization
          .selectedPlaybookId
      )
    ) {
      return {
        allowed:
          false,

        reason:
          "Execution request playbook does not match authorization.",
      };
    }

    if (
      request.planHash &&
      authorization.planHash &&
      String(
        request.planHash
      ) !==
      String(
        authorization.planHash
      )
    ) {
      return {
        allowed:
          false,

        reason:
          "Execution request plan hash does not match authorization.",
      };
    }

    return {
      allowed:
        true,

      reason:
        null,
    };
  }

  // ==========================================================================
  // STATE TRANSITIONS
  // ==========================================================================

  async markRunning(
    request
  ) {
    request.state =
      EXECUTION_REQUEST_STATE
        .RUNNING;

    request.startedAt =
      new Date();

    request.attempt =
      Number(
        request.attempt ||
        0
      ) +
      1;

    await request.save();
  }

  async markCompleted({
    request,
    result,
  }) {
    request.state =
      EXECUTION_REQUEST_STATE
        .SUCCEEDED;

    request.completedAt =
      new Date();

    request.result =
      result ||
      null;

    await request.save();
  }

  async markFailed({
    request,
    error,
  }) {
    request.state =
      EXECUTION_REQUEST_STATE
        .FAILED;

    request.completedAt =
      new Date();

    request.failure = {
      code:
        error
          ?.code ||
        "EXECUTION_FAILED",

      message:
        String(
          error
            ?.message ||
          "Execution failed"
        )
          .slice(
            0,
            2048
          ),
    };

    await request.save();
  }

  async markBlocked({
    request,
    reason,
  }) {
    request.state =
      EXECUTION_REQUEST_STATE
        .BLOCKED;

    request.completedAt =
      new Date();

    request.failure = {
      code:
        "EXECUTION_BLOCKED",

      message:
        reason,
    };

    await request.save();
  }

  // ==========================================================================
  // EVENTS
  // ==========================================================================

  async safePublishStarted({
    request,
    authorization,
  }) {
    try {
      await this.queue
        .publishStarted({
          executionRequestId:
            request
              .executionRequestId,

          authorizationId:
            authorization
              .authorizationId,

          organizationId:
            request
              .organizationId,

          environmentId:
            request
              .environmentId,

          incidentId:
            request
              .incidentId,
        });
    } catch (
      error
    ) {
      console.error(
        "[execution-worker] Failed to publish started event:",
        error.message
      );
    }
  }

  async safePublishCompleted({
    request,
    authorization,
    result,
  }) {
    try {
      await this.queue
        .publishCompleted({
          executionRequestId:
            request
              .executionRequestId,

          authorizationId:
            authorization
              .authorizationId,

          organizationId:
            request
              .organizationId,

          environmentId:
            request
              .environmentId,

          incidentId:
            request
              .incidentId,

          result,
        });
    } catch (
      error
    ) {
      console.error(
        "[execution-worker] Failed to publish completed event:",
        error.message
      );
    }
  }

  async safePublishFailed({
    request,
    authorization,
    error,
  }) {
    try {
      await this.queue
        .publishFailed({
          executionRequestId:
            request
              .executionRequestId,

          authorizationId:
            authorization
              .authorizationId,

          organizationId:
            request
              .organizationId,

          environmentId:
            request
              .environmentId,

          incidentId:
            request
              .incidentId,

          error,
        });
    } catch (
      publishError
    ) {
      console.error(
        "[execution-worker] Failed to publish failure event:",
        publishError.message
      );
    }
  }

  async safePublishBlocked({
    request,
    authorization,
    reason,
  }) {
    try {
      await this.queue
        .publishBlocked({
          executionRequestId:
            request
              .executionRequestId,

          authorizationId:
            authorization
              .authorizationId,

          organizationId:
            request
              .organizationId,

          environmentId:
            request
              .environmentId,

          incidentId:
            request
              .incidentId,

          error: {
            code:
              "EXECUTION_BLOCKED",

            message:
              reason,
          },
        });
    } catch (
      error
    ) {
      console.error(
        "[execution-worker] Failed to publish blocked event:",
        error.message
      );
    }
  }

  // ==========================================================================
  // INPUT
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
          "Execution job is required"
        ),
        {
          code:
            "EXECUTION_JOB_REQUIRED",
        }
      );
    }

    for (
      const field
      of [
        "executionRequestId",
        "organizationId",
        "environmentId",
        "incidentId",
      ]
    ) {
      if (
        !job[field]
      ) {
        throw Object.assign(
          new Error(
            `Execution job requires ${field}`
          ),
          {
            code:
              "EXECUTION_JOB_SCOPE_REQUIRED",

            field,
          }
        );
      }
    }
  }
}

module.exports =
  new ExecutionWorker();

module.exports
  .ExecutionWorker =
  ExecutionWorker;