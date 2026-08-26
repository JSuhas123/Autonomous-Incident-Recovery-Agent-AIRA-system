"use strict";

/*
 * ============================================================================
 * AIRA PHASE 11.4.5
 * REPLAY RUNTIME INTEGRATION
 * ============================================================================
 *
 * MERGED RESPONSIBILITIES
 * -----------------------
 *
 * 1. Recover interrupted durable replay records after process restart.
 * 2. Detect expired replay ownership.
 * 3. Retry explicitly retryable replay failures.
 * 4. Resume MANUAL_REVIEW only after explicit approval.
 * 5. Resume RECONCILIATION only after reconciliation says it is safe.
 * 6. Forward all resumed work back through DurableReplayService.
 *
 *
 * IMPORTANT
 * ---------
 *
 * This component does NOT:
 *
 * - execute infrastructure
 * - authorize infrastructure
 * - call ExecutionWorker directly
 * - call VerificationWorker directly
 * - call LifecycleWorker directly
 * - bypass Phase 11.3 durable workflow handoff
 *
 * ============================================================================
 */

const {
  WorkflowReplayRecord,
} = require(
  "../../persistence/operational/legacyModels"
);

const durableReplayService =
  require(
    "./durableReplayService"
  );

const {
  REPLAY_SOURCE,
  REPLAY_MODE,
  assertNoReplayExecutionAuthority,
} =
  require(
    "./replayOrchestrationContracts"
  );


class ReplayRuntimeIntegration {
  constructor(
    options = {}
  ) {
    this.WorkflowReplayRecord =
      options.WorkflowReplayRecord ||
      WorkflowReplayRecord;

    this.durableReplayService =
      options.durableReplayService ||
      durableReplayService;

    this.now =
      options.now ||
      (() =>
        new Date());

    this.batchSize =
      Math.max(
        1,
        Math.min(
          Number(
            options.batchSize
          ) ||
          50,
          500
        )
      );
  }


  // ==========================================================================
  // STARTUP / PROCESS-RESTART RECOVERY
  // ==========================================================================

  async recoverInterrupted(
  dependencies = {},
  scope = null
) {
  const now =
    this.now();

  const scopedFilter =
    scope &&
    scope.organizationId &&
    scope.environmentId
      ? {
          organizationId:
            String(
              scope.organizationId
            ),

          environmentId:
            String(
              scope.environmentId
            ),
        }
      : {};

    /*
     * Recover:
     *
     * 1. Explicit retryable failures.
     *
     * 2. RUNNING replay whose process disappeared and lease expired.
     *
     * Do NOT automatically touch:
     *
     * - WAITING_MANUAL_REVIEW
     * - WAITING_RECONCILIATION
     * - BLOCKED
     * - COMPLETED
     *
     * Those represent intentional durable states.
     */
    const records =
  await this
    .WorkflowReplayRecord
    .find({
      ...scopedFilter,

      $or: [
            {
              status:
                "FAILED",

              "failure.retryable":
                true,
            },

            {
              status:
                "RUNNING",

              "owner.leaseExpiresAt": {
                $lte:
                  now,
              },
            },
          ],
        })
        .sort({
          updatedAt:
            1,
        })
        .limit(
          this.batchSize
        )
        .lean();

    const results =
      [];

    for (
      const record
      of records
    ) {
      try {
        /*
         * Expired RUNNING ownership must first be released.
         *
         * We use an atomic transition so an active/new owner cannot
         * accidentally be overwritten.
         */
        if (
          record.status ===
          "RUNNING"
        ) {
          const released =
            await this
              .releaseExpiredReplay(
                record
              );

          if (
            !released
          ) {
            results.push({
              replayId:
                record.replayId,

              recovered:
                false,

              decision:
                "STALE_RECORD_ALREADY_RECLAIMED",

              executionAuthorized:
                false,
            });

            continue;
          }
        }

        const request =
          this.buildReplayRequest(
            record,
            {
              source:
                REPLAY_SOURCE
                  .PROCESS_RESTART,
            }
          );

        const result =
          await this
            .durableReplayService
            .replay(
              request,
              dependencies
            );

        assertNoReplayExecutionAuthority(
          result,
          "Startup replay recovery result"
        );

        results.push({
          replayId:
            record.replayId,

          recovered:
            true,

          result,

          executionAuthorized:
            false,
        });
      } catch (
        error
      ) {
        /*
         * One poisoned replay must not prevent the startup recovery scanner
         * from checking other workflows.
         */
        results.push({
          replayId:
            record.replayId,

          recovered:
            false,

          error: {
            code:
              error.code ||
              "REPLAY_RUNTIME_RECOVERY_FAILED",

            message:
              String(
                error.message ||
                "Replay recovery failed"
              )
                .slice(
                  0,
                  2048
                ),
          },

          executionAuthorized:
            false,
        });
      }
    }

    return {
      processed:
        true,

      discovered:
        records.length,

      recovered:
        results.filter(
          (
            result
          ) =>
            result.recovered ===
            true
        ).length,

      failed:
        results.filter(
          (
            result
          ) =>
            result.recovered !==
            true
        ).length,

      results,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // RELEASE EXPIRED RUNNING REPLAY
  // ==========================================================================

  async releaseExpiredReplay(
    record
  ) {
    const now =
      this.now();

    const updated =
      await this
        .WorkflowReplayRecord
        .findOneAndUpdate(
          {
            replayId:
              record.replayId,

            status:
              "RUNNING",

            "owner.claimToken":
              record.owner
                ?.claimToken ||
              null,

            "owner.leaseExpiresAt": {
              $lte:
                now,
            },
          },

          {
            $set: {
              status:
                "FAILED",

              failure: {
                code:
                  "REPLAY_WORKER_LEASE_EXPIRED",

                message:
                  "Replay worker disappeared before the durable replay completed.",

                retryable:
                  true,

                failedAt:
                  now,
              },

              "owner.workerId":
                null,

              "owner.claimToken":
                null,

              "owner.claimedAt":
                null,

              "owner.leaseExpiresAt":
                null,
            },

            $push: {
              history: {
                type:
                  "REPLAY_LEASE_EXPIRED",

                occurredAt:
                  now,

                actorType:
                  "system",

                actorId:
                  null,

                message:
                  "Expired replay ownership released during runtime recovery.",

                metadata: {
                  previousWorkerId:
                    record.owner
                      ?.workerId ||
                    null,
                },
              },
            },
          },

          {
            new:
              true,
          }
        );

    return updated
      ? this.toObject(
          updated
        )
      : null;
  }


  // ==========================================================================
  // MANUAL REVIEW â†’ RESUME
  // ==========================================================================

  async approveManualReplay(
    {
      replayId,
      actorId,
      reason = null,
    } = {},
    dependencies = {}
  ) {
    this.assertReplayId(
      replayId
    );

    if (
      !actorId
    ) {
      throw Object.assign(
        new Error(
          "Manual replay approval requires actorId"
        ),
        {
          code:
            "REPLAY_MANUAL_ACTOR_REQUIRED",

          retryable:
            false,
        }
      );
    }

    const record =
      await this.transitionWaitingReplay({
        replayId,

        expectedStatus:
          "WAITING_MANUAL_REVIEW",

        eventType:
          "REPLAY_MANUAL_APPROVED",

        actorType:
          "human",

        actorId,

        message:
          reason ||
          "Manual replay approved.",
      });

    const request =
      this.buildReplayRequest(
        record,
        {
          source:
            REPLAY_SOURCE
              .MANUAL,

          mode:
            REPLAY_MODE
              .MANUAL_REPLAY,

          actorType:
            "human",

          actorId,
        }
      );

    return this
      .durableReplayService
      .replay(
        request,
        dependencies
      );
  }


  // ==========================================================================
  // RECONCILIATION â†’ RESUME
  // ==========================================================================

  async resolveReconciliation(
    {
      replayId,
      safe,
      actorId = null,
      evidence = null,
      reason = null,
    } = {},
    dependencies = {}
  ) {
    this.assertReplayId(
      replayId
    );

    /*
     * An ambiguous execution must NEVER be converted to replay merely because
     * the caller invoked this function.
     *
     * Reconciliation must explicitly resolve safe === true.
     */
    if (
      safe !==
      true
    ) {
      const blocked =
        await this
          .WorkflowReplayRecord
          .findOneAndUpdate(
            {
              replayId,

              status:
                "WAITING_RECONCILIATION",
            },

            {
              $set: {
                status:
                  "WAITING_MANUAL_REVIEW",

                reason:
                  reason ||
                  "Reconciliation could not prove automatic replay safety.",
              },

              $push: {
                history: {
                  type:
                    "REPLAY_RECONCILIATION_UNSAFE",

                  occurredAt:
                    this.now(),

                  actorType:
                    actorId
                      ? "human"
                      : "system",

                  actorId:
                    actorId ||
                    null,

                  message:
                    reason ||
                    "Reconciliation did not prove replay safety.",

                  metadata: {
                    evidence:
                      evidence ||
                      null,
                  },
                },
              },
            },

            {
              new:
                true,
            }
          );

      if (
        !blocked
      ) {
        throw Object.assign(
          new Error(
            "Replay is not waiting for reconciliation"
          ),
          {
            code:
              "REPLAY_RECONCILIATION_STATE_INVALID",

            retryable:
              false,
          }
        );
      }

      return {
        processed:
          true,

        replayed:
          false,

        status:
          "WAITING_MANUAL_REVIEW",

        manualReviewRequired:
          true,

        replayId,

        executionAuthorized:
          false,
      };
    }


    const record =
      await this.transitionWaitingReplay({
        replayId,

        expectedStatus:
          "WAITING_RECONCILIATION",

        eventType:
          "REPLAY_RECONCILIATION_PASSED",

        actorType:
          actorId
            ? "human"
            : "system",

        actorId:
          actorId ||
          null,

        message:
          reason ||
          "Reconciliation proved replay resume is safe.",

        metadata: {
          evidence:
            evidence ||
            null,
        },
      });

    const request =
      this.buildReplayRequest(
        record,
        {
          source:
            REPLAY_SOURCE
              .ADMIN_REPAIR,

          mode:
            REPLAY_MODE
              .RESUME,

          actorId:
            actorId ||
            null,
        }
      );

    return this
      .durableReplayService
      .replay(
        request,
        dependencies
      );
  }


  // ==========================================================================
  // WAITING STATE â†’ REQUESTED
  // ==========================================================================

  async transitionWaitingReplay({
    replayId,
    expectedStatus,
    eventType,
    actorType,
    actorId,
    message,
    metadata = {},
  }) {
    const now =
      this.now();

    const updated =
      await this
        .WorkflowReplayRecord
        .findOneAndUpdate(
          {
            replayId,

            status:
              expectedStatus,
          },

          {
            $set: {
              status:
                "REQUESTED",

              failure: {
                code:
                  null,

                message:
                  null,

                retryable:
                  false,

                failedAt:
                  null,
              },

              "owner.workerId":
                null,

              "owner.claimToken":
                null,

              "owner.claimedAt":
                null,

              "owner.leaseExpiresAt":
                null,
            },

            $push: {
              history: {
                type:
                  eventType,

                occurredAt:
                  now,

                actorType:
                  actorType ||
                  "system",

                actorId:
                  actorId ||
                  null,

                message:
                  message ||
                  null,

                metadata,
              },
            },
          },

          {
            new:
              true,
          }
        );

    if (
      !updated
    ) {
      throw Object.assign(
        new Error(
          `Replay is not in expected state ${expectedStatus}`
        ),
        {
          code:
            "REPLAY_WAITING_STATE_INVALID",

          expectedStatus,

          retryable:
            false,
        }
      );
    }

    return this.toObject(
      updated
    );
  }


  // ==========================================================================
  // RECONSTRUCT REQUEST FROM DURABLE RECORD
  // ==========================================================================

  buildReplayRequest(
  record,
  overrides = {}
) {
  const request = {
    organizationId:
      record.organizationId,

    environmentId:
      record.environmentId,

    incidentId:
      record.incidentId,

    correlationId:
      record.correlationId ||
      null,

    /*
     * CRITICAL:
     *
     * Preserve the original durable replay identity even when
     * source/mode changes during:
     *
     * - process restart
     * - manual approval
     * - reconciliation
     */
    replayKey:
      record.replayKey,

    replayRequestId:
      record.replayId,

    source:
      record.source,

    mode:
      record.mode,

    resumeStage:
      record.requestedStage ||
      null,

    actorType:
      "system",

    actorId:
      null,

    executionAuthorized:
      false,

    ...overrides,
  };

  assertNoReplayExecutionAuthority(
    request,
    "Runtime reconstructed replay request"
  );

  return request;
}


  // ==========================================================================
  // LOOKUP
  // ==========================================================================

  async getReplay(
    replayId
  ) {
    this.assertReplayId(
      replayId
    );

    return this
      .WorkflowReplayRecord
      .findOne({
        replayId,
      })
      .lean();
  }


  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  assertReplayId(
    replayId
  ) {
    if (
      !replayId ||
      typeof replayId !==
        "string"
    ) {
      throw Object.assign(
        new Error(
          "replayId is required"
        ),
        {
          code:
            "REPLAY_ID_REQUIRED",

          retryable:
            false,
        }
      );
    }

    return true;
  }


  toObject(
    value
  ) {
    if (
      !value
    ) {
      return value;
    }

    if (
      typeof value.toObject ===
      "function"
    ) {
      return value
        .toObject();
    }

    return value;
  }
}


module.exports =
  new ReplayRuntimeIntegration();

module.exports
  .ReplayRuntimeIntegration =
  ReplayRuntimeIntegration;
