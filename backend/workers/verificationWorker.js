"use strict";

/**
 * AIRA Verification Worker
 *
 * Phase 9.12
 * Phase 11.1.10 â€” Idempotent Verification
 * Phase 11.2.10 â€” Durable Runtime Checkpoint Integration
 *
 * Runs complete post-execution verification lifecycle:
 *
 * execution request
 *      â†“
 * verification plan
 *      â†“
 * health / metrics / logs / incident verification
 *      â†“
 * evidence aggregation
 *      â†“
 * decision
 *      â†“
 * critic
 *      â†“
 * outcome routing
 *      â†“
 * persistence
 *
 * SAFETY:
 *
 * - does not close incidents
 * - does not start retry
 * - does not execute rollback
 * - never grants execution authorization
 * - runtime recovery does not execute infrastructure
 * - verification may be safely reconstructed after interruption
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
  executionAuthorizationRepository,
} =
  require(
    "../persistence/repositories"
  );

const verificationPlanBuilderService =
  require(
    "../services/verification/verificationPlanBuilderService"
  );

const healthVerificationService =
  require(
    "../services/verification/healthVerificationService"
  );

const metricsVerificationService =
  require(
    "../services/verification/metricsVerificationService"
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

const logVerificationService =
  require(
    "../services/verification/logVerificationService"
  );

const incidentStateVerificationService =
  require(
    "../services/verification/incidentStateVerificationService"
  );

const recoveryEvidenceAggregator =
  require(
    "../services/verification/recoveryEvidenceAggregator"
  );

const verificationDecisionEngine =
  require(
    "../services/verification/verificationDecisionEngine"
  );

const verificationDecisionCritic =
  require(
    "../services/verification/verificationDecisionCritic"
  );

const recoveryOutcomeRoutingService =
  require(
    "../services/verification/recoveryOutcomeRoutingService"
  );

const verificationPersistenceService =
  require(
    "../services/verification/verificationPersistenceService"
  );

const verificationQueueService =
  require(
    "../services/verification/verificationQueueService"
  );

const verificationLifecycleOutboxIntegrationService =
  require(
    "../services/workflowOutbox/verificationLifecycleOutboxIntegrationService"
  );

class VerificationWorker {
  constructor(
    options = {}
  ) {
    this.executionAuthorizationRepository =
      options.executionAuthorizationRepository ||
      executionAuthorizationRepository;

    /*
     * Backward-compatible Jest injection only.
     *
     * Production never imports the ExecutionRequest Mongoose model here.
     */
    this.ExecutionRequest =
      options.ExecutionRequest ||
      null;

    this.planBuilder =
      options.planBuilder ||
      verificationPlanBuilderService;

    this.healthVerifier =
      options.healthVerifier ||
      healthVerificationService;

    this.metricsVerifier =
      options.metricsVerifier ||
      metricsVerificationService;

    this.logVerifier =
      options.logVerifier ||
      logVerificationService;

    this.incidentVerifier =
      options.incidentVerifier ||
      incidentStateVerificationService;

    this.aggregator =
      options.aggregator ||
      recoveryEvidenceAggregator;

    this.decisionEngine =
      options.decisionEngine ||
      verificationDecisionEngine;

    this.critic =
      options.critic ||
      verificationDecisionCritic;

    this.router =
      options.router ||
      recoveryOutcomeRoutingService;

    this.persistence =
      options.persistence ||
      verificationPersistenceService;

    this.queue =
      options.queue ||
      verificationQueueService;

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
        : verificationLifecycleOutboxIntegrationService;

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
      this.outboxEnabled =
        process.env.NODE_ENV !==
        "test";
    }

    const hasInjectedIdempotentWorker =
      Object.prototype
        .hasOwnProperty
        .call(
          options,
          "idempotentWorker"
        );

    this.idempotentWorker =
      hasInjectedIdempotentWorker
        ? options.idempotentWorker
        : idempotentWorkerService;

    if (
      options.idempotencyEnabled !==
      undefined
    ) {
      this.idempotencyEnabled =
        options.idempotencyEnabled ===
        true;
    } else if (
      hasInjectedIdempotentWorker
    ) {
      this.idempotencyEnabled =
        true;
    } else {
      this.idempotencyEnabled =
        process.env.NODE_ENV !==
        "test";
    }

    this.workerId =
      options.workerId ||
      [
        "verification",
        os.hostname(),
        process.pid,
      ].join(
        ":"
      );

    this.runtimeCheckpoint =
      options.runtimeCheckpoint ||
      runtimeCheckpointPersistenceService;

    this.runtimeCheckpointEnabled =
      options.runtimeCheckpointEnabled !==
        undefined
        ? options.runtimeCheckpointEnabled ===
          true
        : process.env.NODE_ENV !==
          "test";
  }

  async process(
    job = {},
    dependencies = {}
  ) {
    this.assertJob(
      job
    );

    if (
      this.runtimeCheckpointEnabled ===
      false
    ) {
      return this.processWithIdempotency(
        job,
        dependencies
      );
    }

    const executionRequestId =
      job.executionRequestId ||
      job.executionResult
        ?.executionRequestId ||
      null;

    const verificationPlan =
      job.verificationPlan ||
      job.plan ||
      {};

    const verificationPlanId =
      job.verificationPlanId ||
      verificationPlan
        .verificationPlanId ||
      verificationPlan
        .planId ||
      null;

    const verificationPlanHash =
      job.verificationPlanHash ||
      verificationPlan
        .verificationPlanHash ||
      verificationPlan
        .planHash ||
      null;

    if (
      !executionRequestId ||
      !verificationPlanId ||
      !verificationPlanHash
    ) {
      throw Object.assign(
        new Error(
          "Verification worker requires immutable verification identity"
        ),
        {
          code:
            "VERIFICATION_JOB_IDENTITY_REQUIRED",
        }
      );
    }

    const operationKey =
      [
        "verification",
        job.incidentId,
        executionRequestId,
        verificationPlanId,
        verificationPlanHash,
      ].join(
        ":"
      );

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
            .VERIFICATION,

        operationKey,

        workflowIdentity: {
          executionRequestId,

          verificationId:
            job.verificationId ||
            null,

          verificationPlanId,

          verificationPlanHash,
        },

        executionAuthorized:
          false,
      });

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
              .VERIFICATION,

          operationKey,

          workerId:
            this.workerId,

          leaseMs:
            dependencies
              .verificationRuntimeLeaseMs ||
            60000,

          executionAuthorized:
            false,
        });

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
          "VERIFICATION_CHECKPOINT_NOT_CLAIMED",

        verificationStarted:
          false,

        verificationPerformed:
          false,

        retryStarted:
          false,

        rollbackStarted:
          false,

        incidentClosed:
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
      const result =
        await this.processWithIdempotency(
          job,
          dependencies
        );

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
              .VERIFICATION,

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
                .VERIFICATION,

            operationKey,

            workerId:
              this.workerId,

            claimToken,

            error: {
              code:
                error?.code ||
                "VERIFICATION_RUNTIME_FAILURE",

              message:
                error?.message ||
                "Verification runtime failed",

              retryable:
                this.isVerificationRetryable(
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
    this.assertJob(
      job
    );

    if (
      this.idempotencyEnabled ===
      false
    ) {
      const legacyResult =
        await this.processVerification(
          job,
          dependencies
        );

      return this.attachLifecycleOutboxHandoff({
        job: {
          ...job,

          executionAuthorized:
            false,
        },

        result:
          legacyResult,

        dependencies,
      });
    }

    const executionRequestId =
      job.executionRequestId ||
      job.executionResult
        ?.executionRequestId ||
      null;

    const verificationPlan =
      job.verificationPlan ||
      job.plan ||
      {};

    const verificationPlanId =
      job.verificationPlanId ||
      verificationPlan
        .verificationPlanId ||
      verificationPlan
        .planId ||
      null;

    const verificationPlanHash =
      job.verificationPlanHash ||
      verificationPlan
        .verificationPlanHash ||
      verificationPlan
        .planHash ||
      null;

    if (
      !executionRequestId ||
      !verificationPlanId ||
      !verificationPlanHash
    ) {
      throw Object.assign(
        new Error(
          "Verification worker requires immutable verification identity"
        ),
        {
          code:
            "VERIFICATION_JOB_IDENTITY_REQUIRED",
        }
      );
    }

    const effectiveJob = {
      ...job,

      executionRequestId,

      verificationPlanId,

      verificationPlanHash,

      verificationPlan,

      executionAuthorized:
        false,
    };

    const wrapped =
      await this.idempotentWorker
        .run({
          identity: {
            organizationId:
              effectiveJob
                .organizationId,

            environmentId:
              effectiveJob
                .environmentId,

            operation:
              IDEMPOTENCY_OPERATION
                .VERIFICATION,

            executionRequestId,

            verificationPlanId,

            verificationPlanHash,
          },

          ownerId:
            this.workerId,

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

            executionRequestId,

            verificationPlanId,

            verificationPlanHash,

            executionResult:
              effectiveJob
                .executionResult ||
              null,

            verificationPlan,

            context:
              effectiveJob
                .context ||
              null,
          },

          references: {
            incidentId:
              effectiveJob
                .incidentId,

            executionRequestId,

            verificationId:
              effectiveJob
                .verificationId ||
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
              executionRequestId,
          },

          leaseMs:
            dependencies
              .verificationLeaseMs ||
            120000,

          heartbeatMs:
            dependencies
              .verificationHeartbeatMs ||
            30000,

          isRetryable:
            (
              error
            ) =>
              this.isVerificationRetryable(
                error
              ),

          handler:
            async () =>
              this.processVerification(
                effectiveJob,
                dependencies
              ),

          executionAuthorized:
            false,
        });

    if (
      wrapped.executed ===
      false
    ) {
      const duplicateResult = {
        processed:
          true,

        success:
          wrapped.decision ===
            "DUPLICATE_COMPLETED",

        duplicate:
          wrapped.duplicate ===
          true,

        verificationPerformed:
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

        executionAuthorized:
          false,
      };

      if (
        wrapped.decision !==
          "DUPLICATE_COMPLETED" ||
        !wrapped.previousResult
      ) {
        return duplicateResult;
      }

      const handoff =
        await this.createLifecycleOutboxHandoff({
          job:
            effectiveJob,

          result:
            wrapped.previousResult,

          dependencies,
        });

      return {
        ...duplicateResult,

        outboxHandoff:
          handoff,

        executionAuthorized:
          false,
      };
    }

    const outboxHandoff =
      await this.createLifecycleOutboxHandoff({
        job:
          effectiveJob,

        result:
          wrapped.result,

        dependencies,
      });

    return {
      processed:
        true,

      success:
        true,

      duplicate:
        false,

      verificationPerformed:
        true,

      idempotencyDecision:
        wrapped.decision,

      idempotencyKey:
        wrapped.idempotencyKey,

      result:
        wrapped.result,

      outboxHandoff,

      executionAuthorized:
        false,
    };
  }

  async attachLifecycleOutboxHandoff({
    job,
    result,
    dependencies = {},
  } = {}) {
    const outboxHandoff =
      await this.createLifecycleOutboxHandoff({
        job,
        result,
        dependencies,
      });

    if (
      !result ||
      typeof result !==
        "object"
    ) {
      return result;
    }

    return {
      ...result,

      outboxHandoff,

      executionAuthorized:
        false,
    };
  }

  async createLifecycleOutboxHandoff({
    job,
    result,
    dependencies = {},
  } = {}) {
    if (
      this.outboxEnabled !==
      true
    ) {
      return null;
    }

    if (
      result?.blocked ===
        true ||
      result?.verificationStarted ===
        false
    ) {
      return {
        handoffCreated:
          false,

        required:
          false,

        reason:
          "VERIFICATION_NOT_COMPLETED",

        executionAuthorized:
          false,
      };
    }

    return this
      .outboxIntegration
      .createFromResult({
        job: {
          ...job,

          executionAuthorized:
            false,
        },

        result,

        dependencies,
      });
  }

  async processVerification(
    job,
    dependencies = {}
  ) {
    await this.safePublishStarted({
      job,
    });

    try {
      const executionRequest =
        await this.loadExecutionRequest(
          job
        );

      const executionValidation =
        this.validateExecutionRequest(
          executionRequest
        );

      if (
        executionValidation.allowed !==
        true
      ) {
        await this.safePublishBlocked({
          job,

          reason:
            executionValidation
              .reason,
        });

        return {
          processed:
            true,

          blocked:
            true,

          reason:
            executionValidation
              .reason,

          executionRequestId:
            job.executionRequestId,

          verificationStarted:
            false,

          retryStarted:
            false,

          rollbackStarted:
            false,

          incidentClosed:
            false,

          executionAuthorized:
            false,
        };
      }

      const verificationPlan =
        await this.planBuilder
          .build(
            {
              organizationId:
                job.organizationId,

              environmentId:
                job.environmentId,

              incidentId:
                job.incidentId,

              executionRequest,

              executionPlan:
                executionRequest
                  .executionPlan,

              executionRequestId:
                executionRequest
                  .executionRequestId,

              executionPlanId:
                executionRequest
                  .planId,

              executionPlanHash:
                executionRequest
                  .planHash,

              executionResult:
                executionRequest
                  .result ||
                executionRequest
                  .executionResult ||
                null,

              executionAuthorized:
                false,
            },
            dependencies
          );

      const healthResult =
        await this.healthVerifier
          .verify(
            {
              organizationId:
                job.organizationId,

              environmentId:
                job.environmentId,

              incidentId:
                job.incidentId,

              executionRequest,

              verificationPlan,

              executionAuthorized:
                false,
            },
            dependencies
          );

      const metricsResult =
        await this.metricsVerifier
          .verify(
            {
              organizationId:
                job.organizationId,

              environmentId:
                job.environmentId,

              incidentId:
                job.incidentId,

              executionRequest,

              verificationPlan,

              executionAuthorized:
                false,
            },
            dependencies
          );

      const logResult =
        await this.logVerifier
          .verify(
            {
              organizationId:
                job.organizationId,

              environmentId:
                job.environmentId,

              incidentId:
                job.incidentId,

              executionRequest,

              verificationPlan,

              executionAuthorized:
                false,
            },
            dependencies
          );

      const incidentResult =
        await this.incidentVerifier
          .verify(
            {
              organizationId:
                job.organizationId,

              environmentId:
                job.environmentId,

              incidentId:
                job.incidentId,

              executionRequest,

              verificationPlan,

              executionAuthorized:
                false,
            },
            dependencies
          );

      const evidencePackage =
        await this.aggregator
          .aggregate(
            {
              organizationId:
                job.organizationId,

              environmentId:
                job.environmentId,

              incidentId:
                job.incidentId,

              executionRequestId:
                executionRequest
                  .executionRequestId,

              executionPlanId:
                executionRequest
                  .planId,

              executionPlanHash:
                executionRequest
                  .planHash,

              verificationPlan,

              healthResult,

              metricsResult,

              logResult,

              incidentResult,

              executionAuthorized:
                false,
            },
            dependencies
          );

      const decision =
        await this.decisionEngine
          .decide(
            {
              organizationId:
                job.organizationId,

              environmentId:
                job.environmentId,

              incidentId:
                job.incidentId,

              executionRequest,

              verificationPlan,

              evidencePackage,

              executionAuthorized:
                false,
            },
            dependencies
          );

      const criticResult =
        await this.critic
          .review(
            {
              organizationId:
                job.organizationId,

              environmentId:
                job.environmentId,

              incidentId:
                job.incidentId,

              executionRequest,

              verificationPlan,

              evidencePackage,

              decision,

              executionAuthorized:
                false,
            },
            dependencies
          );

      const routingResult =
        await this.router
          .route(
            {
              organizationId:
                job.organizationId,

              environmentId:
                job.environmentId,

              incidentId:
                job.incidentId,

              executionRequest,

              verificationPlan,

              evidencePackage,

              decision,

              criticResult,

              executionAuthorized:
                false,
            },
            dependencies
          );

      const persisted =
        await this.persistence
          .persist(
            {
              organizationId:
                job.organizationId,

              environmentId:
                job.environmentId,

              incidentId:
                job.incidentId,

              executionRequestId:
                executionRequest
                  .executionRequestId,

              recoveryDecisionId:
                executionRequest
                  .recoveryDecisionId ||
                null,

              executionPlanId:
                executionRequest
                  .planId,

              executionPlanHash:
                executionRequest
                  .planHash,

              verificationPlan,

              evidencePackage,

              decision,

              criticResult,

              routingResult,

              executionAuthorized:
                false,
            },
            dependencies
          );

      const verificationId =
        persisted
          ?.verificationId ||
        persisted
          ?.verification
          ?.verificationId ||
        null;

      await this.safePublishCompleted({
        job,

        verificationId,

        result: {
          verificationPlan,

          evidencePackage,

          decision,

          criticResult,

          routingResult,

          persisted,
        },
      });

      return {
        processed:
          true,

        blocked:
          false,

        executionRequestId:
          executionRequest
            .executionRequestId,

        verificationId,

        verificationStarted:
          true,

        verificationPlan,

        evidencePackage,

        decision,

        criticResult,

        routingResult,

        persisted,

        retryStarted:
          false,

        rollbackStarted:
          false,

        incidentClosed:
          false,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      await this.safePublishFailed({
        job,
        error,
      });

      throw error;
    }
  }

  isVerificationRetryable(
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
      "DATABASE_TEMPORARY_FAILURE",
      "QUEUE_TEMPORARY_FAILURE",
      "METRICS_PROVIDER_TEMPORARY_FAILURE",
      "LOG_PROVIDER_TEMPORARY_FAILURE",
      "OBSERVABILITY_TEMPORARY_FAILURE",
    ].includes(
      error?.code
    );
  }

  async loadExecutionRequest(
    job
  ) {
    let request;

    if (
      this.ExecutionRequest &&
      typeof this.ExecutionRequest.findOne ===
        "function"
    ) {
      request =
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
    } else {
      request =
        await this.executionAuthorizationRepository
          .findExecutionRequestByIdentifier(
            {
              organizationId:
                job.organizationId,

              environmentId:
                job.environmentId,
            },
            job.executionRequestId
          );

      if (
        request &&
        String(
          request.incidentId
        ) !==
          String(
            job.incidentId
          )
      ) {
        request =
          null;
      }
    }

    if (
      !request
    ) {
      throw Object.assign(
        new Error(
          "Execution request not found for verification"
        ),
        {
          code:
            "VERIFICATION_EXECUTION_REQUEST_NOT_FOUND",

          status:
            404,
        }
      );
    }

    return request;
  }

  validateExecutionRequest(
    request
  ) {
    const allowedStates = [
      "SUCCEEDED",
      "FAILED",
    ];

    if (
      !allowedStates.includes(
        request.state
      )
    ) {
      return {
        allowed:
          false,

        reason:
          `Execution request state ${request.state} is not ready for post-execution verification.`,
      };
    }

    if (
      !request.executionPlan
    ) {
      return {
        allowed:
          false,

        reason:
          "Execution request has no persisted execution plan.",
      };
    }

    if (
      !request.planId ||
      !request.planHash
    ) {
      return {
        allowed:
          false,

        reason:
          "Execution request has no immutable plan identity.",
      };
    }

    return {
      allowed:
        true,

      reason:
        null,
    };
  }

  async safePublishStarted({
    job,
  }) {
    try {
      await this.queue
        .publishStarted({
          executionRequestId:
            job.executionRequestId,

          organizationId:
            job.organizationId,

          environmentId:
            job.environmentId,

          incidentId:
            job.incidentId,
        });
    } catch (
      error
    ) {
      console.error(
        "[verification-worker] Failed to publish started event:",
        error.message
      );
    }
  }

  async safePublishCompleted({
    job,
    verificationId,
    result,
  }) {
    try {
      await this.queue
        .publishCompleted({
          executionRequestId:
            job.executionRequestId,

          verificationId,

          organizationId:
            job.organizationId,

          environmentId:
            job.environmentId,

          incidentId:
            job.incidentId,

          result,
        });
    } catch (
      error
    ) {
      console.error(
        "[verification-worker] Failed to publish completed event:",
        error.message
      );
    }
  }

  async safePublishFailed({
    job,
    error,
  }) {
    try {
      await this.queue
        .publishFailed({
          executionRequestId:
            job.executionRequestId,

          organizationId:
            job.organizationId,

          environmentId:
            job.environmentId,

          incidentId:
            job.incidentId,

          error,
        });
    } catch (
      publishError
    ) {
      console.error(
        "[verification-worker] Failed to publish failed event:",
        publishError.message
      );
    }
  }

  async safePublishBlocked({
    job,
    reason,
  }) {
    try {
      await this.queue
        .publishBlocked({
          executionRequestId:
            job.executionRequestId,

          organizationId:
            job.organizationId,

          environmentId:
            job.environmentId,

          incidentId:
            job.incidentId,

          error: {
            code:
              "VERIFICATION_BLOCKED",

            message:
              reason,
          },
        });
    } catch (
      error
    ) {
      console.error(
        "[verification-worker] Failed to publish blocked event:",
        error.message
      );
    }
  }

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
          "Verification job is required"
        ),
        {
          code:
            "VERIFICATION_JOB_REQUIRED",
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
            `Verification job requires ${field}`
          ),
          {
            code:
              "VERIFICATION_JOB_SCOPE_REQUIRED",

            field,
          }
        );
      }
    }

    if (
      job.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Verification worker cannot receive execution authorization"
        ),
        {
          code:
            "VERIFICATION_JOB_UNSAFE_INPUT",
        }
      );
    }
  }
}
module.exports =
  new VerificationWorker();

module.exports
  .VerificationWorker =
  VerificationWorker;
