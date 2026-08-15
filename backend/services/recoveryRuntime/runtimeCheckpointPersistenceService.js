"use strict";

/**
 * AIRA Runtime Checkpoint Persistence Service
 *
 * Phase 11.2.3
 *
 * Responsibilities:
 *
 * - create durable checkpoints
 * - claim checkpoints atomically
 * - renew checkpoint lease
 * - transition checkpoint status
 * - mark completion / failure / abandonment
 * - enforce worker fencing
 *
 * SAFETY:
 *
 * - never authorizes infrastructure execution
 * - stale workers cannot update checkpoints
 * - execution checkpoints may be persisted but not replayed here
 */

const crypto =
  require(
    "node:crypto"
  );

const RuntimeRecoveryCheckpoint =
  require(
    "../../models/RuntimeRecoveryCheckpoint"
  );

const {
  CHECKPOINT_STATUS,
  INTERRUPTION_REASON,
  RESUME_SAFETY,

  assertRuntimeStage,
  assertCheckpointStatus,
  assertResumeSafety,
  assertNoExecutionAuthorization,
} =
  require(
    "./recoveryRuntimeContracts"
  );

class RuntimeCheckpointPersistenceService {
  constructor(
    options = {}
  ) {
    this.RuntimeRecoveryCheckpoint =
      options.RuntimeRecoveryCheckpoint ||
      RuntimeRecoveryCheckpoint;

    this.defaultLeaseMs =
      normalizePositiveNumber(
        options.defaultLeaseMs,
        60000
      );
  }

  // ==========================================================================
  // CREATE / ENSURE
  // ==========================================================================

  async ensureCheckpoint(
    input = {}
  ) {
    this.assertBaseInput(
      input
    );

    const now =
      normalizeDate(
        input.now
      );

    const insert = {
      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      incidentId:
        input.incidentId,

      operationKey:
        input.operationKey,

      stage:
        input.stage,

      status:
        CHECKPOINT_STATUS
          .PENDING,

      workflowIdentity:
        sanitizeWorkflowIdentity(
          input.workflowIdentity
        ),

      owner: {
        workerId:
          null,

        claimToken:
          null,

        claimedAt:
          null,

        heartbeatAt:
          null,

        leaseExpiresAt:
          null,
      },

      attempt:
        0,

      interruption: {
        interrupted:
          false,

        reason:
          null,

        detectedAt:
          null,
      },

      resumeSafety:
        RESUME_SAFETY
          .UNKNOWN,

      result:
        null,

      error: {
        code:
          null,

        message:
          null,

        retryable:
          false,
      },

      startedAt:
        null,

      completedAt:
        null,

      lastTransitionAt:
        now,

      executionAuthorized:
        false,
    };

    try {
      const checkpoint =
        await this.RuntimeRecoveryCheckpoint
          .create(
            insert
          );

      return {
        created:
          true,

        checkpoint,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      if (
        error?.code !==
        11000
      ) {
        throw error;
      }

      const checkpoint =
        await this.findByIdentity(
          input
        );

      if (
        !checkpoint
      ) {
        throw createError(
          "Checkpoint insert conflicted but existing checkpoint could not be found",
          "RUNTIME_CHECKPOINT_CREATE_CONFLICT"
        );
      }

      return {
        created:
          false,

        checkpoint,

        executionAuthorized:
          false,
      };
    }
  }

  // ==========================================================================
  // ATOMIC CLAIM
  // ==========================================================================

  async claim(
    input = {}
  ) {
    this.assertBaseInput(
      input
    );

    if (
      !input.workerId
    ) {
      throw createError(
        "Checkpoint claim requires workerId",
        "RUNTIME_CHECKPOINT_WORKER_REQUIRED"
      );
    }

    const now =
      normalizeDate(
        input.now
      );

    const leaseMs =
      normalizePositiveNumber(
        input.leaseMs,
        this.defaultLeaseMs
      );

    const claimToken =
      input.claimToken ||
      crypto
        .randomUUID();

    const leaseExpiresAt =
      new Date(
        now.getTime() +
        leaseMs
      );

    const checkpoint =
      await this.RuntimeRecoveryCheckpoint
        .findOneAndUpdate(
          {
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            incidentId:
              input.incidentId,

            stage:
              input.stage,

            operationKey:
              input.operationKey,

            status: {
              $in: [
                CHECKPOINT_STATUS
                  .PENDING,

                CHECKPOINT_STATUS
                  .ABANDONED,
              ],
            },
          },

          {
            $set: {
              status:
                CHECKPOINT_STATUS
                  .PROCESSING,

              "owner.workerId":
                input.workerId,

              "owner.claimToken":
                claimToken,

              "owner.claimedAt":
                now,

              "owner.heartbeatAt":
                now,

              "owner.leaseExpiresAt":
                leaseExpiresAt,

              startedAt:
                now,

              lastTransitionAt:
                now,

              "interruption.interrupted":
                false,

              "interruption.reason":
                null,

              "interruption.detectedAt":
                null,

              executionAuthorized:
                false,
            },

            $inc: {
              attempt:
                1,
            },
          },

          {
            new:
              true,
          }
        );

    if (
      checkpoint
    ) {
      return {
        claimed:
          true,

        claimToken,

        checkpoint,

        leaseExpiresAt,

        executionAuthorized:
          false,
      };
    }

    const existing =
      await this.findByIdentity(
        input
      );

    return {
      claimed:
        false,

      claimToken:
        null,

      checkpoint:
        existing,

      reason:
        resolveClaimFailureReason(
          existing
        ),

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // HEARTBEAT
  // ==========================================================================

  async heartbeat(
    input = {}
  ) {
    this.assertOwnedInput(
      input
    );

    const now =
      normalizeDate(
        input.now
      );

    const leaseMs =
      normalizePositiveNumber(
        input.leaseMs,
        this.defaultLeaseMs
      );

    const leaseExpiresAt =
      new Date(
        now.getTime() +
        leaseMs
      );

    const checkpoint =
      await this.RuntimeRecoveryCheckpoint
        .findOneAndUpdate(
          this.buildOwnedFilter(
            input,
            CHECKPOINT_STATUS
              .PROCESSING
          ),

          {
            $set: {
              "owner.heartbeatAt":
                now,

              "owner.leaseExpiresAt":
                leaseExpiresAt,

              lastTransitionAt:
                now,
            },
          },

          {
            new:
              true,
          }
        );

    if (
      !checkpoint
    ) {
      await this.throwOwnershipFailure(
        input
      );
    }

    return {
      renewed:
        true,

      checkpoint,

      leaseExpiresAt,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // STATUS TRANSITION
  // ==========================================================================

  async transition(
    input = {}
  ) {
    this.assertOwnedInput(
      input
    );

    assertCheckpointStatus(
      input.toStatus
    );

    const now =
      normalizeDate(
        input.now
      );

    const checkpoint =
      await this.RuntimeRecoveryCheckpoint
        .findOneAndUpdate(
          this.buildOwnedFilter(
            input,
            input.fromStatus ||
              CHECKPOINT_STATUS
                .PROCESSING
          ),

          {
            $set: {
              status:
                input.toStatus,

              resumeSafety:
                input.resumeSafety ||
                RESUME_SAFETY
                  .UNKNOWN,

              lastTransitionAt:
                now,

              executionAuthorized:
                false,
            },
          },

          {
            new:
              true,
          }
        );

    if (
      !checkpoint
    ) {
      await this.throwOwnershipFailure(
        input
      );
    }

    return {
      transitioned:
        true,

      checkpoint,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // COMPLETE
  // ==========================================================================

  async complete(
    input = {}
  ) {
    this.assertOwnedInput(
      input
    );

    const now =
      normalizeDate(
        input.now
      );

    const checkpoint =
      await this.RuntimeRecoveryCheckpoint
        .findOneAndUpdate(
          this.buildOwnedFilter(
            input,
            CHECKPOINT_STATUS
              .PROCESSING
          ),

          {
            $set: {
              status:
                CHECKPOINT_STATUS
                  .COMPLETED,

              result:
                sanitizeResult(
                  input.result
                ),

              completedAt:
                now,

              lastTransitionAt:
                now,

              resumeSafety:
                input.resumeSafety ||
                RESUME_SAFETY
                  .SAFE,

              "owner.workerId":
                null,

              "owner.claimToken":
                null,

              "owner.heartbeatAt":
                null,

              "owner.leaseExpiresAt":
                null,

              "error.code":
                null,

              "error.message":
                null,

              "error.retryable":
                false,

              executionAuthorized:
                false,
            },
          },

          {
            new:
              true,
          }
        );

    if (
      !checkpoint
    ) {
      await this.throwOwnershipFailure(
        input
      );
    }

    return {
      completed:
        true,

      checkpoint,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // FAIL
  // ==========================================================================

  async fail(
    input = {}
  ) {
    this.assertOwnedInput(
      input
    );

    const now =
      normalizeDate(
        input.now
      );

    const checkpoint =
      await this.RuntimeRecoveryCheckpoint
        .findOneAndUpdate(
          this.buildOwnedFilter(
            input,
            CHECKPOINT_STATUS
              .PROCESSING
          ),

          {
            $set: {
              status:
                CHECKPOINT_STATUS
                  .FAILED,

              lastTransitionAt:
                now,

              "error.code":
                input.error?.code ||
                "RUNTIME_CHECKPOINT_STAGE_FAILED",

              "error.message":
                String(
                  input.error?.message ||
                  "Runtime checkpoint stage failed"
                ),

              "error.retryable":
                input.error?.retryable ===
                true,

              resumeSafety:
                input.resumeSafety ||
                RESUME_SAFETY
                  .UNKNOWN,

              "owner.workerId":
                null,

              "owner.claimToken":
                null,

              "owner.heartbeatAt":
                null,

              "owner.leaseExpiresAt":
                null,

              executionAuthorized:
                false,
            },
          },

          {
            new:
              true,
          }
        );

    if (
      !checkpoint
    ) {
      await this.throwOwnershipFailure(
        input
      );
    }

    return {
      failed:
        true,

      checkpoint,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // ABANDON
  // ==========================================================================

  async markAbandoned(
    input = {}
  ) {
    this.assertBaseInput(
      input
    );

    const now =
      normalizeDate(
        input.now
      );

    const reason =
      input.reason ||
      INTERRUPTION_REASON
        .UNKNOWN;

    const checkpoint =
      await this.RuntimeRecoveryCheckpoint
        .findOneAndUpdate(
          {
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            incidentId:
              input.incidentId,

            stage:
              input.stage,

            operationKey:
              input.operationKey,

            status:
              CHECKPOINT_STATUS
                .PROCESSING,

            "owner.leaseExpiresAt": {
              $lte:
                now,
            },
          },

          {
            $set: {
              status:
                CHECKPOINT_STATUS
                  .ABANDONED,

              "interruption.interrupted":
                true,

              "interruption.reason":
                reason,

              "interruption.detectedAt":
                now,

              resumeSafety:
                input.resumeSafety ||
                RESUME_SAFETY
                  .UNKNOWN,

              "owner.workerId":
                null,

              "owner.claimToken":
                null,

              "owner.heartbeatAt":
                null,

              "owner.leaseExpiresAt":
                null,

              lastTransitionAt:
                now,

              executionAuthorized:
                false,
            },
          },

          {
            new:
              true,
          }
        );

    return {
      abandoned:
        Boolean(
          checkpoint
        ),

      checkpoint:
        checkpoint ||
        null,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // READ
  // ==========================================================================

  async findByIdentity(
    input = {}
  ) {
    this.assertBaseInput(
      input
    );

    return this.RuntimeRecoveryCheckpoint
      .findOne({
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        incidentId:
          input.incidentId,

        stage:
          input.stage,

        operationKey:
          input.operationKey,
      });
  }

  // ==========================================================================
  // OWNERSHIP / FENCING
  // ==========================================================================

  buildOwnedFilter(
    input,
    status
  ) {
    return {
      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      incidentId:
        input.incidentId,

      stage:
        input.stage,

      operationKey:
        input.operationKey,

      status,

      "owner.workerId":
        input.workerId,

      "owner.claimToken":
        input.claimToken,
    };
  }

  async throwOwnershipFailure(
    input
  ) {
    const checkpoint =
      await this.findByIdentity(
        input
      );

    if (
      !checkpoint
    ) {
      throw createError(
        "Runtime checkpoint not found",
        "RUNTIME_CHECKPOINT_NOT_FOUND"
      );
    }

    if (
      String(
        checkpoint
          ?.owner
          ?.workerId
      ) !==
      String(
        input.workerId
      )
    ) {
      throw createError(
        "Runtime checkpoint is owned by another worker",
        "RUNTIME_CHECKPOINT_OWNER_MISMATCH"
      );
    }

    if (
      String(
        checkpoint
          ?.owner
          ?.claimToken
      ) !==
      String(
        input.claimToken
      )
    ) {
      throw createError(
        "Runtime checkpoint claim token is stale",
        "RUNTIME_CHECKPOINT_CLAIM_TOKEN_MISMATCH"
      );
    }

    throw createError(
      "Runtime checkpoint state changed during update",
      "RUNTIME_CHECKPOINT_CONFLICT"
    );
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  assertBaseInput(
    input
  ) {
    if (
      !input ||
      typeof input !==
        "object"
    ) {
      throw createError(
        "Runtime checkpoint input is required",
        "RUNTIME_CHECKPOINT_INPUT_REQUIRED"
      );
    }

    for (
      const field
      of [
        "organizationId",
        "environmentId",
        "incidentId",
        "operationKey",
        "stage",
      ]
    ) {
      if (
        !input[field]
      ) {
        throw createError(
          `Runtime checkpoint requires ${field}`,
          "RUNTIME_CHECKPOINT_SCOPE_REQUIRED"
        );
      }
    }

    assertRuntimeStage(
      input.stage
    );

    assertNoExecutionAuthorization(
      input
    );

    if (
      input.resumeSafety
    ) {
      assertResumeSafety(
        input.resumeSafety
      );
    }
  }

  assertOwnedInput(
    input
  ) {
    this.assertBaseInput(
      input
    );

    if (
      !input.workerId
    ) {
      throw createError(
        "Runtime checkpoint operation requires workerId",
        "RUNTIME_CHECKPOINT_WORKER_REQUIRED"
      );
    }

    if (
      !input.claimToken
    ) {
      throw createError(
        "Runtime checkpoint operation requires claimToken",
        "RUNTIME_CHECKPOINT_CLAIM_TOKEN_REQUIRED"
      );
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function sanitizeWorkflowIdentity(
  identity = {}
) {
  return {
    diagnosisId:
      identity.diagnosisId ||
      null,

    diagnosisRevision:
      identity.diagnosisRevision ??
      null,

    recoveryDecisionId:
      identity.recoveryDecisionId ||
      null,

    executionRequestId:
      identity.executionRequestId ||
      null,

    executionPlanHash:
      identity.executionPlanHash ||
      null,

    verificationId:
      identity.verificationId ||
      null,

    lifecycleId:
      identity.lifecycleId ||
      null,
  };
}

function sanitizeResult(
  result
) {
  if (
    !result ||
    typeof result !==
      "object"
  ) {
    return result ??
      null;
  }

  const clone = {
    ...result,
  };

  delete clone
    .executionAuthorized;

  return clone;
}

function resolveClaimFailureReason(
  checkpoint
) {
  if (
    !checkpoint
  ) {
    return "NOT_FOUND";
  }

  return `STATUS_${checkpoint.status}`;
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
      "Invalid runtime checkpoint timestamp",
      "RUNTIME_CHECKPOINT_TIME_INVALID"
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
  new RuntimeCheckpointPersistenceService();

module.exports
  .RuntimeCheckpointPersistenceService =
  RuntimeCheckpointPersistenceService;