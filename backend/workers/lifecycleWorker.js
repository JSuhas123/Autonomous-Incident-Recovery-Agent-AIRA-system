"use strict";

/**
 * AIRA Lifecycle Worker
 *
 * Phase 10.13 + Phase 11.1.11
 *
 * Orchestrates:
 *
 * Phase 9 verification result
 *        â†“
 * closure eligibility
 *        â†“
 * stability observation
 *        â†“
 * regression / retry / rollback / escalation
 *        â†“
 * lifecycle persistence
 *        â†“
 * audit + notification
 *
 * Phase 11.1.11 adds:
 *
 * lifecycle queue delivery
 *        â†“
 * deterministic idempotency identity
 *        â†“
 * atomic claim
 *        â†“
 * duplicate? â”€â”€â”€â”€â”€â”€â†’ return safely
 *        â†“
 * existing Phase 10 lifecycle processing
 *
 * SAFETY:
 *
 * - no direct infrastructure execution
 * - no reuse of execution authorization
 * - retry / rollback are handoff requests only
 * - idempotency ownership never grants execution authorization
 */

const os =
  require(
    "node:os"
  );

const idempotentWorkerService =
  require(
    "../services/idempotency/idempotentWorkerService"
  );

const {
  IDEMPOTENCY_OPERATION,
} =
  require(
    "../services/idempotency/idempotencyContracts"
  );

const {
  RecoveryVerification,
  IncidentLifecycle,
} = require(
  "../persistence/operational/lifecycleModels"
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

const closureEligibilityGuard =
  require(
    "../services/lifecycle/closureEligibilityGuard"
  );

const incidentLifecycleStateMachine =
  require(
    "../services/lifecycle/incidentLifecycleStateMachine"
  );

const incidentClosureService =
  require(
    "../services/lifecycle/incidentClosureService"
  );

const recoveryRetryOrchestrator =
  require(
    "../services/lifecycle/recoveryRetryOrchestrator"
  );

const rollbackHandoffOrchestrator =
  require(
    "../services/lifecycle/rollbackHandoffOrchestrator"
  );

const escalationService =
  require(
    "../services/lifecycle/escalationService"
  );

const stabilityObservationService =
  require(
    "../services/lifecycle/stabilityObservationService"
  );

const regressionReopenEngine =
  require(
    "../services/lifecycle/regressionReopenEngine"
  );

const lifecycleNotificationService =
  require(
    "../services/lifecycle/lifecycleNotificationService"
  );

const lifecycleAuditService =
  require(
    "../services/lifecycle/lifecycleAuditService"
  );

const lifecyclePersistenceService =
  require(
    "../services/lifecycle/lifecyclePersistenceService"
  );

const lifecycleQueueService =
  require(
    "../services/lifecycle/lifecycleQueueService"
  );

const {
  INCIDENT_LIFECYCLE_STATE,
  LIFECYCLE_ACTION,
  LIFECYCLE_EVENT,
  STABILITY_RESULT,
  ESCALATION_REASON,
} =
  require(
    "../services/lifecycle/incidentLifecycleContracts"
  );

const {
  AUDIT_EVENT_TYPE,
} =
  require(
    "../services/lifecycle/lifecycleAuditService"
  );

class LifecycleWorker {
  constructor(
    options = {}
  ) {
    this.RecoveryVerification =
      options.RecoveryVerification ||
      RecoveryVerification;

    this.IncidentLifecycle =
      options.IncidentLifecycle ||
      IncidentLifecycle;

    this.closureGuard =
      options.closureGuard ||
      closureEligibilityGuard;

    this.stateMachine =
      options.stateMachine ||
      incidentLifecycleStateMachine;

    this.closureService =
      options.closureService ||
      incidentClosureService;

    this.retryOrchestrator =
      options.retryOrchestrator ||
      recoveryRetryOrchestrator;

    this.rollbackOrchestrator =
      options.rollbackOrchestrator ||
      rollbackHandoffOrchestrator;

    this.escalationService =
      options.escalationService ||
      escalationService;

    this.stabilityService =
      options.stabilityService ||
      stabilityObservationService;

    this.regressionEngine =
      options.regressionEngine ||
      regressionReopenEngine;

    this.notificationService =
      options.notificationService ||
      lifecycleNotificationService;

    this.auditService =
      options.auditService ||
      lifecycleAuditService;

    this.persistence =
      options.persistence ||
      lifecyclePersistenceService;

    this.queue =
      options.queue ||
      lifecycleQueueService;

    // ========================================================================
    // PHASE 11.1.11 â€” IDEMPOTENCY
    // ========================================================================

    this.idempotentWorker =
  options.idempotentWorker ||
  idempotentWorkerService;

/*
 * Phase 10 unit tests were written before Phase 11 idempotency existed
 * and instantiate LifecycleWorker without an idempotency dependency.
 *
 * In test mode:
 *
 * - explicitly injected idempotentWorker â†’ idempotency ON
 * - no injected idempotentWorker         â†’ legacy Phase 10 path
 *
 * In production:
 *
 * - idempotency is always ON by default
 *
 * This keeps old unit tests isolated from MongoDB while retaining the
 * production safety boundary.
 */
this.idempotencyEnabled =
  options.idempotencyEnabled !==
    undefined
    ? options.idempotencyEnabled ===
      true
    : (
        options.idempotentWorker
          ? true
          : process.env.NODE_ENV !==
            "test"
      );

this.workerId =
  options.workerId ||
  [
    "lifecycle",
    os.hostname(),
    process.pid,
  ].join(
    ":"
  );

// ==========================================================================
// PHASE 11.2.11 â€” RUNTIME CHECKPOINT
// ==========================================================================

this.runtimeCheckpoint =
  options.runtimeCheckpoint ||
  runtimeCheckpointPersistenceService;

/*
 * Production:
 *   runtime checkpointing ON.
 *
 * Existing Jest suites:
 *   runtime checkpointing OFF unless explicitly enabled.
 *
 * This prevents older Phase 10 / 11.1 unit tests from touching the
 * real Mongo-backed runtime checkpoint store.
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
  // PHASE 11.1.11
  // IDEMPOTENT LIFECYCLE ENTRY POINT
  // ==========================================================================
async process(
  job = {},
  dependencies = {}
) {
  // ==========================================================================
  // BASIC CONTRACT
  // ==========================================================================

  this.assertJob(
    job
  );

  // ==========================================================================
  // LEGACY / EXISTING TEST PATH
  // ==========================================================================

  if (
    this.runtimeCheckpointEnabled ===
    false
  ) {
    return this.processWithIdempotency(
      job,
      dependencies
    );
  }

  // ==========================================================================
  // IMMUTABLE LIFECYCLE IDENTITY
  // ==========================================================================

  const verificationId =
    job.verificationId ||
    job.verification
      ?.verificationId ||
    null;

  if (
    !verificationId
  ) {
    throw Object.assign(
      new Error(
        "Lifecycle worker requires verificationId"
      ),
      {
        code:
          "LIFECYCLE_JOB_VERIFICATION_REQUIRED",
      }
    );
  }

  const lifecycleIntent =
    this.resolveLifecycleIntent(
      job
    );

  /*
   * Lifecycle runtime identity represents the logical processing of one
   * immutable verification outcome for one lifecycle intent.
   */
  const operationKey =
    [
      "lifecycle",
      job.incidentId,
      verificationId,
      lifecycleIntent,
    ].join(
      ":"
    );

  // ==========================================================================
  // 1. ENSURE DURABLE CHECKPOINT
  // ==========================================================================

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
          .LIFECYCLE,

      operationKey,

      workflowIdentity: {
        verificationId,

        lifecycleId:
          job.lifecycleId ||
          null,

        lifecycleIntent,
      },

      executionAuthorized:
        false,
    });

  // ==========================================================================
  // 2. CLAIM CHECKPOINT
  // ==========================================================================

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
            .LIFECYCLE,

        operationKey,

        workerId:
          this.workerId,

        leaseMs:
          dependencies
            .lifecycleRuntimeLeaseMs ||
          60000,

        executionAuthorized:
          false,
      });

  // ==========================================================================
  // 3. CHECKPOINT NOT ACQUIRED
  // ==========================================================================

  if (
    claim.claimed !==
    true
  ) {
    return {
      processed:
        true,

      success:
        false,

      duplicate:
        true,

      checkpointClaimed:
        false,

      checkpointStatus:
        claim.checkpoint
          ?.status ||
        null,

      reason:
        claim.reason ||
        "LIFECYCLE_CHECKPOINT_NOT_CLAIMED",

      lifecyclePerformed:
        false,

      lifecycleIntent,

      recoveryStarted:
        false,

      rollbackStarted:
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
    // ========================================================================
    // 4. EXISTING PHASE 11.1 + PHASE 10 LIFECYCLE PIPELINE
    // ========================================================================

    const result =
      await this.processWithIdempotency(
        {
          ...job,

          verificationId,

          lifecycleIntent,

          executionAuthorized:
            false,
        },
        dependencies
      );

    // ========================================================================
    // 5. COMPLETE CHECKPOINT
    //
    // Lifecycle does not directly execute infrastructure. Retry and rollback
    // are protected handoffs into separate execution boundaries.
    // ========================================================================

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
            .LIFECYCLE,

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
    // ========================================================================
    // 6. FAILED LIFECYCLE CHECKPOINT
    //
    // Lifecycle itself does not perform raw infrastructure execution.
    // Re-entry still passes through the Phase 11.1 idempotency boundary.
    // ========================================================================

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
              .LIFECYCLE,

          operationKey,

          workerId:
            this.workerId,

          claimToken,

          error: {
            code:
              error?.code ||
              "LIFECYCLE_RUNTIME_FAILURE",

            message:
              error?.message ||
              "Lifecycle runtime failed",

            retryable:
              this.isLifecycleRetryable(
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
       * Checkpoint persistence failure must never hide the original
       * lifecycle failure.
       */
      error.runtimeCheckpointError =
        checkpointError;
    }

    throw error;
  }
}

async processWithIdempotency(
  job = {},
  dependencies = {}
) {
  // ==========================================================================
  // VALIDATE BEFORE IDEMPOTENCY
  // ==========================================================================

  this.assertJob(
    job
  );

  // ==========================================================================
  // BACKWARD-COMPATIBLE PHASE 10 PATH
  //
  // Existing Phase 10 unit tests instantiate LifecycleWorker without injecting
  // an idempotent worker. In test mode those tests must continue using the
  // original Phase 10 processLifecycle() path and must not touch real MongoDB.
  //
  // Production remains protected by idempotency.
  // ==========================================================================

  if (
    this.idempotencyEnabled ===
    false
  ) {
    return this.processLifecycle(
      job,
      dependencies
    );
  }

  // ==========================================================================
  // PHASE 11 IDEMPOTENT PATH
  //
  // An idempotent lifecycle operation requires a concrete verificationId.
  // Do not query "current verification" here because the identity must be
  // deterministic before acquiring the idempotency claim.
  // ==========================================================================

  const verificationId =
    job.verificationId ||
    job.verification
      ?.verificationId ||
    null;

  if (
    !verificationId
  ) {
    throw Object.assign(
      new Error(
        "Lifecycle worker requires verificationId"
      ),
      {
        code:
          "LIFECYCLE_JOB_VERIFICATION_REQUIRED",
      }
    );
  }

  // ==========================================================================
  // RESOLVE LOGICAL LIFECYCLE INTENT
  // ==========================================================================

  const lifecycleIntent =
    this.resolveLifecycleIntent(
      job
    );

  // ==========================================================================
  // NORMALIZE JOB
  //
  // Force executionAuthorized:false. Phase 10 may prepare retry/rollback
  // handoffs, but this worker must never manufacture reusable infrastructure
  // execution authority.
  // ==========================================================================

  const effectiveJob = {
    ...job,

    verificationId,

    lifecycleIntent,

    executionAuthorized:
      false,
  };

  // ==========================================================================
  // IDEMPOTENCY WRAPPER
  // ==========================================================================

  const wrapped =
    await this.idempotentWorker
      .run({
        // ====================================================================
        // DETERMINISTIC IDENTITY
        //
        // Same:
        //   organization
        //   environment
        //   incident
        //   verification
        //   lifecycle intent
        //
        // means the same logical lifecycle operation.
        // ====================================================================

        identity: {
          organizationId:
            effectiveJob
              .organizationId,

          environmentId:
            effectiveJob
              .environmentId,

          operation:
            IDEMPOTENCY_OPERATION
              .LIFECYCLE,

          incidentId:
            effectiveJob
              .incidentId,

          verificationId,

          lifecycleIntent,
        },

        // ====================================================================
        // WORKER OWNER
        // ====================================================================

        ownerId:
          this.workerId,

        // ====================================================================
        // REQUEST FINGERPRINT
        //
        // Do NOT include volatile delivery metadata such as:
        //
        //   jobId
        //   eventId
        //   requestedAt
        //   queue delivery count
        //
        // because RabbitMQ may legitimately change those across redelivery.
        //
        // The fingerprint should represent the logical request, not transport
        // metadata.
        // ====================================================================

        payload: {
          organizationId:
            effectiveJob
              .organizationId,

          environmentId:
            effectiveJob
              .environmentId,

          incidentId:
            effectiveJob
              .incidentId,

          verificationId,

          lifecycleIntent,

          lifecycleContext:
            effectiveJob
              .lifecycleContext ||
            null,
        },

        // ====================================================================
        // DOMAIN REFERENCES
        // ====================================================================

        references: {
          incidentId:
            effectiveJob
              .incidentId,

          verificationId,

          lifecycleId:
            effectiveJob
              .lifecycleId ||
            null,

          eventId:
            effectiveJob
              .eventId ||
            effectiveJob
              .jobId ||
            null,

          correlationId:
            effectiveJob
              .correlationId ||
            effectiveJob
              .incidentId,
        },

        // ====================================================================
        // CLAIM LEASE
        // ====================================================================

        leaseMs:
          dependencies
            .lifecycleLeaseMs ||
          120000,

        heartbeatMs:
          dependencies
            .lifecycleHeartbeatMs ||
          30000,

        // ====================================================================
        // TRANSIENT FAILURE CLASSIFICATION
        //
        // Logical/safety errors are NOT retryable unless explicitly classified
        // elsewhere as retryable.
        // ====================================================================

        isRetryable:
          (
            error
          ) =>
            this.isLifecycleRetryable(
              error
            ),

        // ====================================================================
        // ORIGINAL PHASE 10 LOGIC
        //
        // Only the worker owning the idempotency claim enters this handler.
        //
        // DUPLICATE_PROCESSING and DUPLICATE_COMPLETED never invoke
        // processLifecycle().
        // ====================================================================

        handler:
          async () =>
            this.processLifecycle(
              effectiveJob,
              dependencies
            ),

        // ====================================================================
        // SAFETY
        // ====================================================================

        executionAuthorized:
          false,
      });

  // ==========================================================================
  // CLAIM NOT ACQUIRED
  //
  // Possible examples:
  //
  // DUPLICATE_PROCESSING
  // DUPLICATE_COMPLETED
  // REJECTED
  //
  // No Phase 10 lifecycle side effects occur here.
  // ==========================================================================

  if (
    wrapped.executed ===
    false
  ) {
    return {
      processed:
        true,

      /*
       * A completed duplicate is already successfully finished.
       *
       * DUPLICATE_PROCESSING is not treated as completion because another
       * worker still owns the logical operation.
       */
      success:
        wrapped.decision ===
          "DUPLICATE_COMPLETED",

      duplicate:
        wrapped.duplicate ===
        true,

      lifecyclePerformed:
        false,

      lifecycleIntent,

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

      // ======================================================================
      // SAFETY FLAGS
      // ======================================================================

      recoveryStarted:
        false,

      rollbackStarted:
        false,

      executionStarted:
        false,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // CLAIM ACQUIRED AND PHASE 10 PROCESSING COMPLETED
  //
  // Covers:
  //
  // ACQUIRED
  // RETRY_FAILED
  // RECLAIM_STALE
  // ==========================================================================

  return {
    processed:
      true,

    success:
      true,

    duplicate:
      false,

    lifecyclePerformed:
      true,

    lifecycleIntent,

    idempotencyDecision:
      wrapped.decision,

    idempotencyKey:
      wrapped.idempotencyKey,

    result:
      wrapped.result,

    // ========================================================================
    // SAFETY FLAGS
    //
    // Phase 10 may create handoff requests internally, but this outer wrapper
    // itself never starts infrastructure recovery/rollback/execution.
    // ========================================================================

    recoveryStarted:
      false,

    rollbackStarted:
      false,

    executionStarted:
      false,

    executionAuthorized:
      false,
  };
}

  // ==========================================================================
  // ORIGINAL PHASE 10.13 PROCESSOR
  //
  // This is the original process() implementation.
  //
  // Phase 11 wraps it but does not change its lifecycle decisions.
  // ==========================================================================

  async processLifecycle(
    job = {},
    dependencies = {}
  ) {
    this.assertJob(
      job
    );

    await this.safePublishStarted(
      job
    );

    try {
      const verification =
        await this.loadVerification(
          job
        );

      if (
        !verification
      ) {
        throw Object.assign(
          new Error(
            "Recovery verification not found"
          ),
          {
            code:
              "LIFECYCLE_VERIFICATION_NOT_FOUND",
          }
        );
      }

      const incident =
        await this.loadIncident(
          job,
          dependencies
        );

      const lifecycle =
        await this.loadLifecycle(
          job
        );

      const currentState =
        lifecycle
          ?.lifecycleState ||
        incident
          ?.lifecycleState ||
        incident
          ?.status ||
        INCIDENT_LIFECYCLE_STATE
          .OPEN;

      // ======================================================================
      // 1. RECOVERED â†’ STABILITY OBSERVATION
      // ======================================================================

      if (
        verification.decision ===
          "RECOVERED" &&
        verification.recoveryConfirmed ===
          true &&
        (
          currentState ===
            INCIDENT_LIFECYCLE_STATE
              .RECOVERED ||
          currentState ===
            INCIDENT_LIFECYCLE_STATE
              .VERIFYING
        )
      ) {
        const initialEligibility =
          this.closureGuard
            .evaluate({
              verification,

              executionAuthorized:
                false,
            });

        if (
          initialEligibility
            .waitForStability ===
          true
        ) {
          const transition =
            this.stateMachine
              .transition({
                fromState:
                  currentState,

                toState:
                  INCIDENT_LIFECYCLE_STATE
                    .STABILITY_OBSERVATION,

                reason:
                  initialEligibility
                    .reason,

                source: {
                  phase:
                    10,

                  component:
                    "lifecycleWorker",

                  referenceId:
                    verification
                      .verificationId,
                },

                executionAuthorized:
                  false,
              });

          const persisted =
            await this.persistence
              .persistTransition({
                organizationId:
                  job.organizationId,

                environmentId:
                  job.environmentId,

                incidentId:
                  job.incidentId,

                verificationId:
                  verification
                    .verificationId,

                transition,

                closureEligibility:
                  initialEligibility,

                executionAuthorized:
                  false,
              });

          await this.recordTransition(
            {
              job,
              transition,

              verificationId:
                verification
                  .verificationId,

              lifecycleEvent:
                LIFECYCLE_EVENT
                  .STABILITY_STARTED,

              lifecycleAction:
                LIFECYCLE_ACTION
                  .BEGIN_STABILITY_OBSERVATION,
            },
            dependencies
          );

          await this.notify(
            {
              job,

              eventType:
                LIFECYCLE_EVENT
                  .STABILITY_STARTED,

              lifecycleState:
                INCIDENT_LIFECYCLE_STATE
                  .STABILITY_OBSERVATION,

              verificationId:
                verification
                  .verificationId,
            },
            dependencies
          );

          return this.finish({
            type:
              "STABILITY_STARTED",

            verification,

            transition,

            persisted,
          });
        }
      }

      // ======================================================================
      // 2. STABILITY OBSERVATION
      // ======================================================================

      if (
        currentState ===
        INCIDENT_LIFECYCLE_STATE
          .STABILITY_OBSERVATION
      ) {
        const samples =
          typeof dependencies
            .getStabilitySamples ===
          "function"
            ? await dependencies
                .getStabilitySamples({
                  organizationId:
                    job.organizationId,

                  environmentId:
                    job.environmentId,

                  incidentId:
                    job.incidentId,

                  verificationId:
                    verification
                      .verificationId,
                })
            : [];

        const stability =
          this.stabilityService
            .evaluate({
              organizationId:
                job.organizationId,

              environmentId:
                job.environmentId,

              incidentId:
                job.incidentId,

              samples,

              startedAt:
                lifecycle
                  ?.latestTransition
                  ?.transitionedAt ||
                lifecycle
                  ?.updatedAt ||
                new Date(),

              now:
                dependencies.now ||
                new Date(),

              windowMs:
                dependencies
                  .stabilityWindowMs,

              minimumSamples:
                dependencies
                  .minimumStabilitySamples,

              maximumFailureRatio:
                dependencies
                  .maximumFailureRatio,

              executionAuthorized:
                false,
            });

        await this.persistence
          .saveStabilityObservation({
            organizationId:
              job.organizationId,

            environmentId:
              job.environmentId,

            incidentId:
              job.incidentId,

            stabilityObservation:
              stability,
          });

        // --------------------------------------------------------------------
        // STABLE
        // --------------------------------------------------------------------

        if (
          stability.result ===
            STABILITY_RESULT
              .STABLE &&
          stability.completed ===
            true
        ) {
          const eligibility =
            this.closureGuard
              .evaluate({
                verification,

                stabilityResult:
                  stability,

                executionAuthorized:
                  false,
              });

          if (
            eligibility.eligible ===
            true
          ) {
            const closureResult =
              await this.closureService
                .finalize(
                  {
                    organizationId:
                      job.organizationId,

                    environmentId:
                      job.environmentId,

                    incidentId:
                      job.incidentId,

                    verificationId:
                      verification
                        .verificationId,

                    closureEligibility:
                      eligibility,

                    stabilityResult:
                      stability,

                    incident,

                    executionAuthorized:
                      false,
                  },
                  dependencies
                );

            await this.notify(
              {
                job,

                eventType:
                  LIFECYCLE_EVENT
                    .INCIDENT_CLOSED,

                lifecycleState:
                  INCIDENT_LIFECYCLE_STATE
                    .CLOSED,

                verificationId:
                  verification
                    .verificationId,
              },
              dependencies
            );

            return this.finish({
              type:
                "INCIDENT_CLOSED",

              verification,

              stability,

              eligibility,

              closureResult,
            });
          }
        }

        // --------------------------------------------------------------------
        // REGRESSION
        // --------------------------------------------------------------------

        if (
          stability.result ===
          STABILITY_RESULT
            .UNSTABLE
        ) {
          const regression =
            await this.regressionEngine
              .evaluate({
                organizationId:
                  job.organizationId,

                environmentId:
                  job.environmentId,

                incidentId:
                  job.incidentId,

                verificationId:
                  verification
                    .verificationId,

                incident,

                stabilityResult:
                  stability,

                retryAllowed:
                  dependencies
                    .retryAllowed !==
                  false,

                currentAttempt:
                  dependencies
                    .currentAttempt ||
                  0,

                maxAttempts:
                  dependencies
                    .maxAttempts ||
                  1,

                rollbackAvailable:
                  dependencies
                    .rollbackAvailable ===
                  true,

                preferRollback:
                  dependencies
                    .preferRollback ===
                  true,

                executionAuthorized:
                  false,
              });

          if (
            regression.action ===
            "REQUEST_RETRY"
          ) {
            const retry =
              await this.retryOrchestrator
                .prepareRetry(
                  {
                    organizationId:
                      job.organizationId,

                    environmentId:
                      job.environmentId,

                    incidentId:
                      job.incidentId,

                    verificationId:
                      verification
                        .verificationId,

                    recoveryDecisionId:
                      verification
                        .recoveryDecisionId,

                    executionRequestId:
                      verification
                        .executionRequestId,

                    routingResult: {
                      route:
                        "REQUEST_RETRY",
                    },

                    criticResult:
                      verification
                        .criticResult,

                    retryAllowed:
                      true,

                    currentAttempt:
                      dependencies
                        .currentAttempt ||
                      0,

                    maxAttempts:
                      dependencies
                        .maxAttempts ||
                      1,

                    incident: {
                      ...incident,

                      lifecycleState:
                        INCIDENT_LIFECYCLE_STATE
                          .REGRESSED,
                    },

                    executionAuthorized:
                      false,
                  },
                  dependencies
                );

            return this.finish({
              type:
                "RETRY_REQUESTED",

              verification,

              stability,

              regression,

              retry,
            });
          }

          if (
            regression.action ===
            "REQUEST_ROLLBACK"
          ) {
            const rollback =
              await this.rollbackOrchestrator
                .prepareRollback(
                  {
                    organizationId:
                      job.organizationId,

                    environmentId:
                      job.environmentId,

                    incidentId:
                      job.incidentId,

                    verificationId:
                      verification
                        .verificationId,

                    recoveryDecisionId:
                      verification
                        .recoveryDecisionId,

                    executionRequestId:
                      verification
                        .executionRequestId,

                    executionPlanId:
                      verification
                        .executionPlanId,

                    executionPlanHash:
                      verification
                        .executionPlanHash,

                    routingResult: {
                      route:
                        "REQUEST_ROLLBACK",
                    },

                    criticResult:
                      verification
                        .criticResult,

                    rollbackAvailable:
                      true,

                    incident: {
                      ...incident,

                      lifecycleState:
                        INCIDENT_LIFECYCLE_STATE
                          .REGRESSED,
                    },

                    executionAuthorized:
                      false,
                  },
                  dependencies
                );

            return this.finish({
              type:
                "ROLLBACK_REQUESTED",

              verification,

              stability,

              regression,

              rollback,
            });
          }

          const escalation =
            await this.escalationService
              .escalate(
                {
                  organizationId:
                    job.organizationId,

                  environmentId:
                    job.environmentId,

                  incidentId:
                    job.incidentId,

                  verificationId:
                    verification
                      .verificationId,

                  reason:
                    ESCALATION_REASON
                      .STABILITY_REGRESSION,

                  incident: {
                    ...incident,

                    lifecycleState:
                      INCIDENT_LIFECYCLE_STATE
                        .REGRESSED,
                  },

                  executionAuthorized:
                    false,
                },
                dependencies
              );

          return this.finish({
            type:
              "ESCALATED",

            verification,

            stability,

            regression,

            escalation,
          });
        }

        return this.finish({
          type:
            "STABILITY_PENDING",

          verification,

          stability,
        });
      }
            // ======================================================================
      // 3. PHASE 9 ROUTING FALLBACK
      // ======================================================================

      const route =
        verification
          ?.routingResult
          ?.route;

      if (
        route ===
        "REQUEST_RETRY"
      ) {
        const retry =
          await this.retryOrchestrator
            .prepareRetry(
              {
                organizationId:
                  job.organizationId,

                environmentId:
                  job.environmentId,

                incidentId:
                  job.incidentId,

                verificationId:
                  verification
                    .verificationId,

                recoveryDecisionId:
                  verification
                    .recoveryDecisionId,

                executionRequestId:
                  verification
                    .executionRequestId,

                routingResult:
                  verification
                    .routingResult,

                criticResult:
                  verification
                    .criticResult,

                retryAllowed:
                  dependencies
                    .retryAllowed !==
                  false,

                currentAttempt:
                  dependencies
                    .currentAttempt ||
                  0,

                maxAttempts:
                  dependencies
                    .maxAttempts ||
                  1,

                incident,

                executionAuthorized:
                  false,
              },
              dependencies
            );

        return this.finish({
          type:
            "RETRY_REQUESTED",

          verification,

          retry,
        });
      }

      if (
        route ===
        "REQUEST_ROLLBACK"
      ) {
        const rollback =
          await this.rollbackOrchestrator
            .prepareRollback(
              {
                organizationId:
                  job.organizationId,

                environmentId:
                  job.environmentId,

                incidentId:
                  job.incidentId,

                verificationId:
                  verification
                    .verificationId,

                recoveryDecisionId:
                  verification
                    .recoveryDecisionId,

                executionRequestId:
                  verification
                    .executionRequestId,

                executionPlanId:
                  verification
                    .executionPlanId,

                executionPlanHash:
                  verification
                    .executionPlanHash,

                routingResult:
                  verification
                    .routingResult,

                criticResult:
                  verification
                    .criticResult,

                rollbackAvailable:
                  dependencies
                    .rollbackAvailable ===
                  true,

                incident,

                executionAuthorized:
                  false,
              },
              dependencies
            );

        return this.finish({
          type:
            "ROLLBACK_REQUESTED",

          verification,

          rollback,
        });
      }

      if (
        route ===
          "ESCALATE" ||
        route ===
          "MANUAL_INTERVENTION"
      ) {
        const escalation =
          await this.escalationService
            .escalate(
              {
                organizationId:
                  job.organizationId,

                environmentId:
                  job.environmentId,

                incidentId:
                  job.incidentId,

                verificationId:
                  verification
                    .verificationId,

                reason:
                  route ===
                    "MANUAL_INTERVENTION"
                    ? ESCALATION_REASON
                        .MANUAL_APPROVAL_REQUIRED
                    : ESCALATION_REASON
                        .UNKNOWN_FAILURE,

                incident,

                executionAuthorized:
                  false,
              },
              dependencies
            );

        return this.finish({
          type:
            "ESCALATED",

          verification,

          escalation,
        });
      }

      return this.finish({
        type:
          "NO_ACTION",

        verification,
      });
    } catch (
      error
    ) {
      await this.safePublishFailed(
        job,
        error
      );

      throw error;
    }
  }

  // ==========================================================================
  // PHASE 11 IDEMPOTENCY HELPERS
  // ==========================================================================

  resolveLifecycleIntent(
    job
  ) {
    if (
      job.lifecycleIntent
    ) {
      return String(
        job.lifecycleIntent
      );
    }

    /*
     * Generic intent used for normal queue-driven lifecycle processing.
     *
     * The existing Phase 10 processor determines whether the persisted
     * state means:
     *
     * - begin stability observation
     * - continue stability observation
     * - close incident
     * - request recovery retry
     * - request rollback
     * - escalate
     * - perform no action
     */
    return "PROCESS_VERIFICATION_OUTCOME";
  }

  isLifecycleRetryable(
    error
  ) {
    if (
      error?.retryable ===
      true
    ) {
      return true;
    }

    /*
     * Only transient dependency failures are automatically retryable.
     *
     * Intentionally NOT included:
     *
     * LIFECYCLE_JOB_UNSAFE_INPUT
     * INCIDENT_LIFECYCLE_TRANSITION_FORBIDDEN
     * INCIDENT_CLOSURE_NOT_ELIGIBLE
     * ROLLBACK_HANDOFF_UNSAFE_INPUT
     * RECOVERY_RETRY_UNSAFE_INPUT
     * LIFECYCLE_PERSISTENCE_STATE_MISMATCH
     * IDEMPOTENCY_FINGERPRINT_MISMATCH
     *
     * Those represent logical or safety failures and must fail closed.
     */

    return [
      "ECONNRESET",
      "ETIMEDOUT",
      "ECONNREFUSED",

      "DATABASE_TEMPORARY_FAILURE",
      "QUEUE_TEMPORARY_FAILURE",

      "LIFECYCLE_PERSISTENCE_TEMPORARY_FAILURE",
      "NOTIFICATION_TEMPORARY_FAILURE",
      "AUDIT_TEMPORARY_FAILURE",
    ].includes(
      error?.code
    );
  }

  // ==========================================================================
  // VERIFICATION LOADING
  // ==========================================================================

  async loadVerification(
    job
  ) {
    if (
      job.verificationId
    ) {
      return this
        .RecoveryVerification
        .findOne({
          verificationId:
            job.verificationId,

          organizationId:
            job.organizationId,

          environmentId:
            job.environmentId,

          incidentId:
            job.incidentId,
        });
    }

    return this
      .RecoveryVerification
      .findOne({
        organizationId:
          job.organizationId,

        environmentId:
          job.environmentId,

        incidentId:
          job.incidentId,

        isCurrent:
          true,
      });
  }

  // ==========================================================================
  // LIFECYCLE LOADING
  // ==========================================================================

  async loadLifecycle(
    job
  ) {
    return this
      .IncidentLifecycle
      .findOne({
        organizationId:
          job.organizationId,

        environmentId:
          job.environmentId,

        incidentId:
          job.incidentId,
      });
  }

  // ==========================================================================
  // INCIDENT LOADING
  // ==========================================================================

  async loadIncident(
    job,
    dependencies
  ) {
    if (
      typeof dependencies
        .getIncident ===
      "function"
    ) {
      const incident =
        await dependencies
          .getIncident({
            organizationId:
              job.organizationId,

            environmentId:
              job.environmentId,

            incidentId:
              job.incidentId,
          });

      if (
        !incident
      ) {
        throw Object.assign(
          new Error(
            "Incident not found"
          ),
          {
            code:
              "LIFECYCLE_INCIDENT_NOT_FOUND",
          }
        );
      }

      return incident;
    }

    return {
      incidentId:
        job.incidentId,

      lifecycleState:
        INCIDENT_LIFECYCLE_STATE
          .OPEN,
    };
  }

  // ==========================================================================
  // AUDIT
  // ==========================================================================

  async recordTransition(
    input,
    dependencies
  ) {
    try {
      await this.auditService
        .record(
          {
            organizationId:
              input.job
                .organizationId,

            environmentId:
              input.job
                .environmentId,

            incidentId:
              input.job
                .incidentId,

            eventType:
              AUDIT_EVENT_TYPE
                .STATE_TRANSITION,

            lifecycleEvent:
              input.lifecycleEvent,

            lifecycleAction:
              input.lifecycleAction,

            fromState:
              input.transition
                .fromState,

            toState:
              input.transition
                .toState,

            verificationId:
              input.verificationId,

            reason:
              input.transition
                .reason,

            executionAuthorized:
              false,
          },
          dependencies
        );
    } catch (
      error
    ) {
      console.error(
        "[lifecycle-worker] audit failed:",
        error.message
      );
    }
  }

  // ==========================================================================
  // NOTIFICATION
  // ==========================================================================

  async notify(
    input,
    dependencies
  ) {
    try {
      await this
        .notificationService
        .notify(
          {
            organizationId:
              input.job
                .organizationId,

            environmentId:
              input.job
                .environmentId,

            incidentId:
              input.job
                .incidentId,

            eventType:
              input.eventType,

            lifecycleState:
              input.lifecycleState,

            verificationId:
              input.verificationId,

            executionAuthorized:
              false,
          },
          dependencies
        );
    } catch (
      error
    ) {
      console.error(
        "[lifecycle-worker] notification failed:",
        error.message
      );
    }
  }

  // ==========================================================================
  // RESULT NORMALIZATION
  // ==========================================================================

  finish(
    result
  ) {
    return {
      processed:
        true,

      ...result,

      recoveryStarted:
        false,

      rollbackStarted:
        false,

      executionStarted:
        false,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // QUEUE EVENTS
  // ==========================================================================

  async safePublishStarted(
    job
  ) {
    try {
      await this.queue
        .publishStarted({
          ...job,

          executionAuthorized:
            false,
        });
    } catch (
      error
    ) {
      console.error(
        "[lifecycle-worker] started event failed:",
        error.message
      );
    }
  }

  async safePublishFailed(
    job,
    error
  ) {
    try {
      await this.queue
        .publishFailed({
          ...job,

          error,

          executionAuthorized:
            false,
        });
    } catch (
      publishError
    ) {
      console.error(
        "[lifecycle-worker] failed event failed:",
        publishError.message
      );
    }
  }

  // ==========================================================================
  // JOB VALIDATION
  // ==========================================================================

  assertJob(
    job
  ) {
    if (
      !job ||
      typeof job !==
        "object" ||
      Object.keys(
        job
      ).length ===
        0
    ) {
      throw Object.assign(
        new Error(
          "Lifecycle job is required"
        ),
        {
          code:
            "LIFECYCLE_JOB_REQUIRED",
        }
      );
    }

    for (
      const field
      of [
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
            `Lifecycle job requires ${field}`
          ),
          {
            code:
              "LIFECYCLE_JOB_SCOPE_REQUIRED",
          }
        );
      }
    }

    // ========================================================================
    // SAFETY
    //
    // Lifecycle orchestration can request recovery/rollback handoffs but must
    // never itself carry reusable infrastructure execution authorization.
    // ========================================================================

    if (
      job.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Lifecycle worker cannot receive execution authorization"
        ),
        {
          code:
            "LIFECYCLE_JOB_UNSAFE_INPUT",
        }
      );
    }
  }
}

module.exports =
  new LifecycleWorker();

module.exports
  .LifecycleWorker =
  LifecycleWorker;
