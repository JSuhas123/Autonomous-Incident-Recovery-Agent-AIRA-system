"use strict";


const {
  PostgresRealityReplayRepository,
} =
  require(
    "../../persistence/postgres/PostgresRealityReplayRepository"
  );


const {
  RealityEvidenceStoreService,
} =
  require(
    "./realityEvidenceStoreService"
  );


const {
  REALITY_REPLAY_VERSION,

  REPLAY_RUN_STATUS,
} =
  require(
    "../../constants/realityReplay"
  );


function replayError(
  code,
  message,
  status =
    422,
  metadata =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      status,

      executionAuthorized:
        false,

      ...metadata,
    }
  );
}


function requireString(
  value,
  field
) {
  if (
    typeof value !==
      "string" ||

    !value.trim()
  ) {
    throw replayError(
      "REALITY_REPLAY_FIELD_REQUIRED",

      `${field} is required`
    );
  }


  return value.trim();
}


function sleep(
  milliseconds
) {
  return new Promise(
    (
      resolve
    ) =>
      setTimeout(
        resolve,

        milliseconds
      )
  );
}


class RealityReplayService {
  constructor(
    options =
      {}
  ) {
    this.repository =
      options.repository ||

      new PostgresRealityReplayRepository(
        options.postgres ||
        {}
      );


    this.evidenceStore =
      options.evidenceStore ||

      new RealityEvidenceStoreService(
        options.evidence ||
        {}
      );


    this.evidenceConsumer =
      options.evidenceConsumer ||

      null;


    this.sleep =
      options.sleep ||
      sleep;


    this.maxWallDelayMs =
      Number.isFinite(
        Number(
          options.maxWallDelayMs
        )
      )
        ? Math.max(
            0,

            Number(
              options.maxWallDelayMs
            )
          )
        : 60000;
  }


  async createRun(
    input =
      {}
  ) {
    const organizationId =
      requireString(
        input.organizationId,

        "organizationId"
      );


    const environmentId =
      requireString(
        input.environmentId,

        "environmentId"
      );


    const caseId =
      requireString(
        input.caseId,

        "caseId"
      );


    const airaVersion =
      requireString(
        input.airaVersion,

        "airaVersion"
      );


    const run =
      await this.repository
        .createRun({
          organizationId,

          environmentId,

          caseId,

          airaVersion,

          seed:
            input.seed ??
            0,

          speedMultiplier:
            input.speedMultiplier ??
            1,

          deterministicTimestamps:
            input.deterministicTimestamps !==
            false,

          disorderWindowMs:
            input.disorderWindowMs ??
            0,

          metadata: {
            ...(
              input.metadata ||
              {}
            ),

            replayVersion:
              REALITY_REPLAY_VERSION,

            evidenceChannelOnly:
              true,

            groundTruthAgentVisible:
              false,
          },
        });


    return {
      ...run,

      replayVersion:
        REALITY_REPLAY_VERSION,

      groundTruthAgentVisible:
        false,

      executionAuthorized:
        false,
    };
  }


  async getRun(
    input =
      {}
  ) {
    const run =
      await this.repository
        .getRun(
          input
        );


    if (
      !run
    ) {
      throw replayError(
        "REALITY_REPLAY_RUN_NOT_FOUND",

        "Replay run was not found",

        404
      );
    }


    return {
      ...run,

      groundTruthAgentVisible:
        false,

      executionAuthorized:
        false,
    };
  }


  async pause(
    input =
      {}
  ) {
    return this.repository
      .transitionRun({
        ...input,

        allowedFrom: [
          REPLAY_RUN_STATUS
            .RUNNING,
        ],

        nextStatus:
          REPLAY_RUN_STATUS
            .PAUSED,
      });
  }


  async resume(
    input =
      {}
  ) {
    await this.repository
      .transitionRun({
        ...input,

        allowedFrom: [
          REPLAY_RUN_STATUS
            .PAUSED,
        ],

        nextStatus:
          REPLAY_RUN_STATUS
            .RUNNING,
      });


    return this.play({
      ...input,

      alreadyRunning:
        true,
    });
  }


  async step(
    input =
      {}
  ) {
    const run =
      await this.getRun(
        input
      );


    if (
      run.status ===
      REPLAY_RUN_STATUS
        .COMPLETED
    ) {
      return {
        run,

        event:
          null,

        completed:
          true,

        executionAuthorized:
          false,
      };
    }


    if (
      run.status ===
      REPLAY_RUN_STATUS
        .RUNNING
    ) {
      throw replayError(
        "REALITY_REPLAY_STEP_WHILE_RUNNING",

        "Pause a running replay before stepping",

        409
      );
    }


    if (
      run.status ===
      REPLAY_RUN_STATUS
        .FAILED
    ) {
      throw replayError(
        "REALITY_REPLAY_FAILED_RUN",

        "Restart a failed replay before stepping",

        409
      );
    }


    if (
      run.status ===
      REPLAY_RUN_STATUS
        .READY
    ) {
      await this.repository
        .transitionRun({
          ...input,

          allowedFrom: [
            REPLAY_RUN_STATUS
              .READY,
          ],

          nextStatus:
            REPLAY_RUN_STATUS
              .PAUSED,
        });
    }


    return this.releaseNext(
      input
    );
  }


  async play(
    input =
      {}
  ) {
    let run =
      await this.getRun(
        input
      );


    if (
      run.status ===
      REPLAY_RUN_STATUS
        .COMPLETED
    ) {
      return {
        run,

        releasedEvents:
          [],

        completed:
          true,

        executionAuthorized:
          false,
      };
    }


    if (
      run.status ===
      REPLAY_RUN_STATUS
        .FAILED
    ) {
      throw replayError(
        "REALITY_REPLAY_FAILED_RUN",

        "Restart a failed replay before playing",

        409
      );
    }


    if (
      !input.alreadyRunning
    ) {
      if (
        run.status ===
        REPLAY_RUN_STATUS
          .READY
      ) {
        run =
          await this.repository
            .transitionRun({
              ...input,

              allowedFrom: [
                REPLAY_RUN_STATUS
                  .READY,
              ],

              nextStatus:
                REPLAY_RUN_STATUS
                  .RUNNING,
            });
      } else if (
        run.status ===
        REPLAY_RUN_STATUS
          .PAUSED
      ) {
        run =
          await this.repository
            .transitionRun({
              ...input,

              allowedFrom: [
                REPLAY_RUN_STATUS
                  .PAUSED,
              ],

              nextStatus:
                REPLAY_RUN_STATUS
                  .RUNNING,
            });
      }
    }


    const releasedEvents =
      [];


    let previousOffsetMs =
      null;


    while (
      true
    ) {
      run =
        await this.getRun(
          input
        );


      if (
        run.status ===
        REPLAY_RUN_STATUS
          .PAUSED
      ) {
        break;
      }


      if (
        run.status ===
        REPLAY_RUN_STATUS
          .COMPLETED
      ) {
        break;
      }


      if (
        run.status !==
        REPLAY_RUN_STATUS
          .RUNNING
      ) {
        throw replayError(
          "REALITY_REPLAY_STATE_INVALID",

          (
            "Replay must be RUNNING while "
            `playing; current state=${run.status}`
          ),

          409
        );
      }


      const nextEvent =
        await this.repository
          .getNextEvent(
            input
          );


      if (
        !nextEvent
      ) {
        if (
          run.cursorPosition >=
          run.eventCount
        ) {
          break;
        }


        throw replayError(
          "REALITY_REPLAY_CURSOR_GAP",

          "Replay cursor points to a missing pending event",

          500
        );
      }


      if (
        previousOffsetMs !==
        null
      ) {
        const replayDelay =
          Math.max(
            0,

            nextEvent
              .effectiveOffsetMs -
            previousOffsetMs
          );


        const wallDelay =
          Math.min(
            this.maxWallDelayMs,

            replayDelay /
              run.speedMultiplier
          );


        if (
          wallDelay >
          0
        ) {
          await this.sleep(
            wallDelay
          );
        }
      }


      const released =
        await this.releaseNext(
          input,

          nextEvent
        );


      releasedEvents.push(
        released.event
      );


      previousOffsetMs =
        nextEvent
          .effectiveOffsetMs;


      if (
        released.completed
      ) {
        run =
          released.run;

        break;
      }
    }


    run =
      await this.getRun(
        input
      );


    return {
      run,

      releasedEvents,

      completed:
        run.status ===
        REPLAY_RUN_STATUS
          .COMPLETED,

      executionAuthorized:
        false,
    };
  }


  async releaseNext(
    input =
      {},
    prefetchedEvent =
      null
  ) {
    const organizationId =
      requireString(
        input.organizationId,

        "organizationId"
      );


    const environmentId =
      requireString(
        input.environmentId,

        "environmentId"
      );


    const runId =
      requireString(
        input.runId,

        "runId"
      );


    const run =
      await this.getRun({
        organizationId,

        environmentId,

        runId,
      });


    if (
      run.status ===
      REPLAY_RUN_STATUS
        .COMPLETED
    ) {
      return {
        run,

        event:
          null,

        completed:
          true,

        executionAuthorized:
          false,
      };
    }


    if (
      run.status !==
        REPLAY_RUN_STATUS
          .RUNNING &&

      run.status !==
        REPLAY_RUN_STATUS
          .PAUSED
    ) {
      throw replayError(
        "REALITY_REPLAY_RELEASE_STATE_INVALID",

        (
          "Replay event release requires "+
          "RUNNING or PAUSED state"
        ),

        409
      );
    }


    const event =
      prefetchedEvent ||

      await this.repository
        .getNextEvent({
          organizationId,

          environmentId,

          runId,
        });


    if (
      !event
    ) {
      throw replayError(
        "REALITY_REPLAY_EVENT_NOT_FOUND",

        "No pending replay event exists at the current cursor",

        404
      );
    }


    let artifact =
      null;


    if (
      event.artifactId
    ) {
      const stored =
        await this.evidenceStore
          .getReplayArtifactContent({
            organizationId,

            environmentId,

            caseId:
              run.caseId,

            artifactId:
              event.artifactId,
          });


      if (
        stored
          ?.artifact
          ?.channel &&

        stored
          .artifact
          .channel !==
          "EVIDENCE"
      ) {
        throw replayError(
          "REALITY_REPLAY_SEALED_ARTIFACT_LEAKAGE",

          "Replay evidence store returned a non-EVIDENCE artifact",

          500
        );
      }


      const actualHash =
        stored
          ?.artifact
          ?.contentHash;


      if (
        actualHash &&

        event
          .artifactContentHash &&

        actualHash !==
          event
            .artifactContentHash
      ) {
        throw replayError(
          "REALITY_REPLAY_ARTIFACT_VERSION_DRIFT",

          "Replay artifact hash differs from the immutable run schedule",

          409
        );
      }


      artifact = {
        artifactId:
          event.artifactId,

        kind:
          event.artifactKind,

        contentHash:
          event
            .artifactContentHash,

        mediaType:
          stored
            ?.artifact
            ?.mediaType ||
          null,

        body:
          stored.body,

        verified:
          stored.verified ===
          true,

        channel:
          "EVIDENCE",

        trustedGroundTruth:
          false,

        executionAuthorized:
          false,
      };
    }


    const envelope = {
      replayVersion:
        REALITY_REPLAY_VERSION,

      runId,

      deliveryId:
        event.deliveryId,

      caseId:
        run.caseId,

      caseRevision:
        run.caseRevision,

      sequenceNo:
        event.sequenceNo,

      eventId:
        event.eventId,

      originalOffsetMs:
        event.originalOffsetMs,

      effectiveOffsetMs:
        event.effectiveOffsetMs,

      replayTimestamp:
        event.logicalTimestamp,

      event:
        event.eventPayload,

      artifact,

      visibility:
        "EVIDENCE",

      groundTruthAgentVisible:
        false,

      executionAuthorized:
        false,
    };


    try {
      if (
        this.evidenceConsumer
      ) {
        await this.evidenceConsumer(
          envelope
        );
      }


      const committed =
        await this.repository
          .commitEventRelease({
            organizationId,

            environmentId,

            runId,

            sequenceNo:
              event.sequenceNo,
          });


      return {
        ...committed,

        event: {
          ...envelope,

          releasedAt:
            committed
              .event
              .releasedAt,
        },

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      try {
        await this.repository
          .markFailed({
            organizationId,

            environmentId,

            runId,

            failureCode:
              error.code ||
              "REALITY_REPLAY_DELIVERY_FAILED",

            failureMessage:
              error.message ||
              String(
                error
              ),
          });
      } catch {
        // Preserve the original replay error.
      }


      throw error;
    }
  }


  async createCheckpoint(
    input =
      {}
  ) {
    const checkpoint =
      await this.repository
        .createCheckpoint(
          input
        );


    return {
      ...checkpoint,

      groundTruthAgentVisible:
        false,

      executionAuthorized:
        false,
    };
  }


  async restoreCheckpoint(
    input =
      {}
  ) {
    const run =
      await this.repository
        .restoreCheckpoint(
          input
        );


    return {
      ...run,

      groundTruthAgentVisible:
        false,

      executionAuthorized:
        false,
    };
  }


  async restart(
    input =
      {}
  ) {
    const run =
      await this.repository
        .restartRun(
          input
        );


    return {
      ...run,

      groundTruthAgentVisible:
        false,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  RealityReplayService,

  replayError,
};