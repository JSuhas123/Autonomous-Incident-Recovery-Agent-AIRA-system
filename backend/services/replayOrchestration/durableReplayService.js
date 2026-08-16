"use strict";

const crypto =
  require(
    "node:crypto"
  );

const os =
  require(
    "node:os"
  );

const WorkflowReplayRecord =
  require(
    "../../models/WorkflowReplayRecord"
  );

const workflowRecoveryOrchestrator =
  require(
    "./workflowRecoveryOrchestrator"
  );

const {
  assertReplayRequest,
  assertNoReplayExecutionAuthority,
} =
  require(
    "./replayOrchestrationContracts"
  );


/*
 * ============================================================================
 * AIRA PHASE 11.4.4
 * DURABLE REPLAY SERVICE
 * ============================================================================
 *
 * MERGED RESPONSIBILITIES
 * -----------------------
 *
 * 1. deterministic replay identity
 * 2. replay persistence
 * 3. duplicate suppression
 * 4. concurrency / lease ownership
 * 5. audit history
 * 6. invoke recovery orchestrator
 * 7. record durable handoff result
 *
 *
 * THIS SERVICE DOES NOT:
 *
 * - execute infrastructure
 * - create authorization
 * - bypass the outbox
 * - call execution workers directly
 *
 * ============================================================================
 */


class DurableReplayService {
  constructor(
    options = {}
  ) {
    this.WorkflowReplayRecord =
      options.WorkflowReplayRecord ||
      WorkflowReplayRecord;

    this.orchestrator =
      options.orchestrator ||
      workflowRecoveryOrchestrator;

    this.workerId =
      options.workerId ||
      [
        "replay",
        os.hostname(),
        process.pid,
      ].join(
        ":"
      );

    this.now =
      options.now ||
      (() =>
        new Date());

    this.generateClaimToken =
      options.generateClaimToken ||
      (() =>
        crypto.randomUUID());

    this.defaultLeaseMs =
      Number(
        options.defaultLeaseMs
      ) ||
      60000;

    this.defaultMaxAttempts =
      Number(
        options.defaultMaxAttempts
      ) ||
      5;
  }


  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async replay(
    request = {},
    dependencies = {}
  ) {
    assertReplayRequest(
      request
    );

    assertNoReplayExecutionAuthority(
      request,
      "Durable replay request"
    );

   /*
 * A resumed durable replay may change operational context
 * such as source/mode:
 *
 * PROCESS_RESTART → MANUAL
 * RESUME          → MANUAL_REPLAY
 *
 * Those changes must NOT manufacture another logical replay.
 *
 * When runtime recovery supplies the persisted replay identity,
 * preserve it exactly.
 */
const replayKey =
  request.replayKey ||
  this.buildReplayKey(
    request
  );

const replayId =
  request.replayRequestId ||
  this.buildReplayId(
    replayKey
  );

    const record =
      await this.ensureRecord({
        replayId,
        replayKey,
        request,
      });

    // ========================================================================
    // ALREADY TERMINAL
    // ========================================================================

    if (
      this.isTerminal(
        record.status
      )
    ) {
      return {
        processed:
          true,

        replayed:
          record.status ===
            "COMPLETED",

        duplicate:
          true,

        decision:
          "ALREADY_TERMINAL",

        replayId:
          record.replayId,

        status:
          record.status,

        result:
          record.result ||
          null,

        executionAuthorized:
          false,
      };
    }


    // ========================================================================
    // CLAIM
    // ========================================================================

    const claim =
      await this.claim({
        replayId,

        leaseMs:
          dependencies
            .leaseMs ||
          this.defaultLeaseMs,
      });

    if (
      claim.claimed !==
      true
    ) {
      return {
        processed:
          true,

        replayed:
          false,

        duplicate:
          true,

        decision:
          claim.decision,

        replayId,

        status:
          claim.record
            ?.status ||
          null,

        executionAuthorized:
          false,
      };
    }


    const claimToken =
      claim.claimToken;

    try {
      // ======================================================================
      // ORCHESTRATE
      // ======================================================================

      const result =
        await this.orchestrator
          .recover(
            {
              ...request,

              replayRequestId:
                replayId,

              executionAuthorized:
                false,
            },

            {
              dispatchReplay:
                dependencies
                  .dispatchReplay,
            }
          );

      assertNoReplayExecutionAuthority(
        result,
        "Durable replay result"
      );


      // ======================================================================
      // PASSIVE OUTCOME
      // ======================================================================

      if (
        result.dispatched !==
        true
      ) {
        const passiveStatus =
          this.resolvePassiveStatus(
            result
          );

        const completed =
          await this.finish({
            replayId,

            claimToken,

            status:
              passiveStatus,

            result,

            eventType:
              passiveStatus ===
                "COMPLETED"
                ? "REPLAY_NO_ACTION"
                : "REPLAY_PAUSED",

            message:
              result.reason ||
              result.outcome ||
              null,
          });

        return {
          processed:
            true,

          replayed:
            false,

          duplicate:
            false,

          replayId,

          status:
            completed.status,

          result,

          executionAuthorized:
            false,
        };
      }


      // ======================================================================
      // DURABLE HANDOFF CREATED
      // ======================================================================

      const completed =
        await this.finish({
          replayId,

          claimToken,

          status:
            "COMPLETED",

          result,

          dispatch:
            {
              dispatched:
                true,

              dispatchedAt:
                this.now(),

              stage:
                result.resumeStage,

              durableEventId:
                result
                  .dispatchResult
                  ?.eventId ||
                result
                  .dispatchResult
                  ?.outboxEventId ||
                null,

              duplicate:
                result
                  .dispatchResult
                  ?.duplicate ===
                true,
            },

          eventType:
            "REPLAY_DISPATCHED",

          message:
            `Replay resume dispatched for ${result.resumeStage}`,
        });

      return {
        processed:
          true,

        replayed:
          true,

        duplicate:
          false,

        replayId,

        status:
          completed.status,

        resumeStage:
          result.resumeStage,

        dispatch:
          completed.dispatch,

        result,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      await this.fail({
        replayId,

        claimToken,

        error,
      });

      throw error;
    }
  }


  // ==========================================================================
  // ENSURE DURABLE REPLAY RECORD
  // ==========================================================================

  async ensureRecord({
    replayId,
    replayKey,
    request,
  }) {
    const now =
      this.now();

    const record =
      await this
        .WorkflowReplayRecord
        .findOneAndUpdate(
          {
            replayKey,
          },

          {
            $setOnInsert: {
              replayId,

              replayKey,

              organizationId:
                request.organizationId,

              environmentId:
                request.environmentId,

              incidentId:
                request.incidentId,

              correlationId:
                request.correlationId ||
                null,

              source:
                request.source,

              mode:
                request.mode,

              requestedStage:
                request.resumeStage ||
                null,

              status:
                "REQUESTED",

              attempts: {
                count:
                  0,

                maxAttempts:
                  request.maxAttempts ||
                  this.defaultMaxAttempts,
              },

              owner: {
                workerId:
                  null,

                claimToken:
                  null,

                claimedAt:
                  null,

                leaseExpiresAt:
                  null,
              },

              history: [
                {
                  type:
                    "REPLAY_REQUESTED",

                  occurredAt:
                    now,

                  actorType:
                    request.actorType ||
                    "system",

                  actorId:
                    request.actorId ||
                    null,

                  message:
                    "Workflow replay requested.",

                  metadata: {
                    source:
                      request.source,

                    mode:
                      request.mode,
                  },
                },
              ],

              executionAuthorized:
                false,
            },
          },

          {
            upsert:
              true,

            new:
              true,

            setDefaultsOnInsert:
              true,
          }
        );

    return this.toObject(
      record
    );
  }


  // ==========================================================================
  // CLAIM
  // ==========================================================================

  async claim({
    replayId,
    leaseMs,
  }) {
    const now =
      this.now();

    const leaseExpiresAt =
      new Date(
        now.getTime() +
        leaseMs
      );

    const claimToken =
      this.generateClaimToken();

    const claimed =
      await this
        .WorkflowReplayRecord
        .findOneAndUpdate(
          {
            replayId,

            status: {
              $in: [
                "REQUESTED",
                "FAILED",
                "RUNNING",
              ],
            },

            $or: [
              {
                "owner.workerId":
                  null,
              },

              {
                "owner.leaseExpiresAt":
                  null,
              },

              {
                "owner.leaseExpiresAt": {
                  $lte:
                    now,
                },
              },
            ],
          },

          {
            $set: {
              status:
                "RUNNING",

              "owner.workerId":
                this.workerId,

              "owner.claimToken":
                claimToken,

              "owner.claimedAt":
                now,

              "owner.leaseExpiresAt":
                leaseExpiresAt,
            },

            $inc: {
              "attempts.count":
                1,
            },

            $push: {
              history: {
                type:
                  "REPLAY_CLAIMED",

                occurredAt:
                  now,

                actorType:
                  "worker",

                actorId:
                  this.workerId,

                message:
                  "Replay claimed for processing.",

                metadata: {
                  leaseExpiresAt,
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
      claimed
    ) {
      return {
        claimed:
          true,

        claimToken,

        record:
          this.toObject(
            claimed
          ),

        executionAuthorized:
          false,
      };
    }


    const existing =
      await this
        .WorkflowReplayRecord
        .findOne({
          replayId,
        })
        .lean();

    if (
      !existing
    ) {
      throw Object.assign(
        new Error(
          "Replay record disappeared during claim"
        ),
        {
          code:
            "REPLAY_RECORD_NOT_FOUND",
        }
      );
    }

    if (
      this.isTerminal(
        existing.status
      )
    ) {
      return {
        claimed:
          false,

        decision:
          "ALREADY_TERMINAL",

        record:
          existing,

        executionAuthorized:
          false,
      };
    }

    return {
      claimed:
        false,

      decision:
        "LEASE_ACTIVE",

      record:
        existing,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // COMPLETE / PAUSE
  // ==========================================================================

  async finish({
    replayId,
    claimToken,
    status,
    result,
    dispatch = null,
    eventType,
    message,
  }) {
    const now =
      this.now();

    const set = {
      status,

      result,

      decision:
        result
          ?.plan
          ?.decision ||
        null,

      safety:
        result
          ?.plan
          ?.safety ||
        result
          ?.safety ||
        null,

      resumeStage:
        result
          ?.resumeStage ||
        null,

      reason:
        result
          ?.reason ||
        null,

      "owner.workerId":
        null,

      "owner.claimToken":
        null,

      "owner.claimedAt":
        null,

      "owner.leaseExpiresAt":
        null,
    };

    if (
      status ===
      "COMPLETED"
    ) {
      set.completedAt =
        now;
    }

    if (
      dispatch
    ) {
      set.dispatch =
        dispatch;
    }

    const updated =
      await this
        .WorkflowReplayRecord
        .findOneAndUpdate(
          {
            replayId,

            status:
              "RUNNING",

            "owner.workerId":
              this.workerId,

            "owner.claimToken":
              claimToken,

            "owner.leaseExpiresAt": {
              $gt:
                now,
            },
          },

          {
            $set:
              set,

            $push: {
              history: {
                type:
                  eventType,

                occurredAt:
                  now,

                actorType:
                  "worker",

                actorId:
                  this.workerId,

                message:
                  message ||
                  null,

                metadata: {
                  resumeStage:
                    result
                      ?.resumeStage ||
                    null,

                  outcome:
                    result
                      ?.outcome ||
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
      !updated
    ) {
      throw Object.assign(
        new Error(
          "Replay ownership was lost before completion"
        ),
        {
          code:
            "REPLAY_CLAIM_LOST",

          retryable:
            true,
        }
      );
    }

    return this.toObject(
      updated
    );
  }


  // ==========================================================================
  // FAILURE
  // ==========================================================================

  async fail({
    replayId,
    claimToken,
    error,
  }) {
    const now =
      this.now();

    const retryable =
      error
        ?.retryable ===
      true;

    const updated =
      await this
        .WorkflowReplayRecord
        .findOneAndUpdate(
          {
            replayId,

            status:
              "RUNNING",

            "owner.workerId":
              this.workerId,

            "owner.claimToken":
              claimToken,
          },

          {
            $set: {
              status:
                "FAILED",

              failure: {
                code:
                  error
                    ?.code ||
                  "REPLAY_FAILURE",

                message:
                  String(
                    error
                      ?.message ||
                    "Replay failed"
                  )
                    .slice(
                      0,
                      2048
                    ),

                retryable,

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
                  "REPLAY_FAILED",

                occurredAt:
                  now,

                actorType:
                  "worker",

                actorId:
                  this.workerId,

                message:
                  error
                    ?.message ||
                  "Replay failed",

                metadata: {
                  code:
                    error
                      ?.code ||
                    null,

                  retryable,
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
  // IDENTITY
  // ==========================================================================

  buildReplayKey(
    request
  ) {
    /*
     * A replay request identity should represent one logical resume request.
     *
     * Same incident + same mode + same requested stage + same source
     * produces the same replay key unless caller supplies replayOperationId.
     */

    const logicalOperation =
      request
        .replayOperationId ||
      request
        .operationKey ||
      [
        request.source,
        request.mode,
        request.resumeStage ||
          "AUTO",
      ].join(
        ":"
      );

    return [
      request.organizationId,
      request.environmentId,
      request.incidentId,
      logicalOperation,
    ].join(
      "|"
    );
  }


  buildReplayId(
    replayKey
  ) {
    const hash =
      crypto
        .createHash(
          "sha256"
        )
        .update(
          replayKey
        )
        .digest(
          "hex"
        )
        .slice(
          0,
          32
        );

    return `replay_${hash}`;
  }


  // ==========================================================================
  // PASSIVE STATUS
  // ==========================================================================

  resolvePassiveStatus(
    result
  ) {
    if (
      result.outcome ===
        "NO_ACTION" ||
      result.outcome ===
        "INSPECTED"
    ) {
      return "COMPLETED";
    }

    if (
      result.outcome ===
        "BLOCKED"
    ) {
      return "BLOCKED";
    }

    if (
      result.outcome ===
        "MANUAL_REVIEW_REQUIRED"
    ) {
      return "WAITING_MANUAL_REVIEW";
    }

    if (
      result.outcome ===
        "RECONCILIATION_REQUIRED"
    ) {
      return "WAITING_RECONCILIATION";
    }

    return "FAILED";
  }


  // ==========================================================================
  // TERMINAL
  // ==========================================================================

  isTerminal(
    status
  ) {
    return [
      "COMPLETED",
      "BLOCKED",
      "CANCELLED",
    ].includes(
      status
    );
  }


  // ==========================================================================
  // HELPERS
  // ==========================================================================

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
  new DurableReplayService();

module.exports
  .DurableReplayService =
  DurableReplayService;