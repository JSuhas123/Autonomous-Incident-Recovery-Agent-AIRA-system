"use strict";


const fs =
  require(
    "node:fs"
  );


const path =
  require(
    "node:path"
  );


const {
  buildReplaySchedule,
} =
  require(
    "../../persistence/postgres/PostgresRealityReplayRepository"
  );


const {
  RealityReplayService,
} =
  require(
    "../../services/reality/realityReplayService"
  );


const {
  REPLAY_RUN_STATUS,
} =
  require(
    "../../constants/realityReplay"
  );


describe(
  "Phase 23R.4 Evidence Replay Engine",

  () => {
    test(
      "0096 migration makes PostgreSQL canonical replay authority and forces RLS",

      () => {
        const migration =
          fs.readFileSync(
            path.resolve(
              __dirname,

              "../../persistence/postgres/migrations/0096_reality_evidence_replay.sql"
            ),

            "utf8"
          );


        expect(
          migration
        ).toContain(
          "reality.replay_runs"
        );


        expect(
          migration
        ).toContain(
          "reality.replay_events"
        );


        expect(
          migration
        ).toContain(
          "reality.replay_checkpoints"
        );


        expect(
          migration
        ).toContain(
          "FORCE ROW LEVEL SECURITY"
        );


        expect(
          migration
        ).toContain(
          "execution_authorized = FALSE"
        );


        expect(
          migration
        ).toContain(
          "channel"
        );


        expect(
          migration
        ).toContain(
          "'EVIDENCE'"
        );
      }
    );


    test(
      "same case timeline plus same seed creates identical deterministic schedule",

      () => {
        const timeline = [
          {
            eventId:
              "metrics",

            offsetMs:
              30000,

            artifactId:
              "metric_1",

            kind:
              "METRIC",
          },

          {
            eventId:
              "signal",

            offsetMs:
              0,

            artifactId:
              "signal_1",

            kind:
              "SIGNAL",
          },

          {
            eventId:
              "logs",

            offsetMs:
              60000,

            artifactId:
              "log_1",

            kind:
              "LOG",
          },
        ];


        const artifacts = [
          {
            id:
              "artifact-db-1",

            publicId:
              "metric_1",

            artifactKind:
              "METRIC",

            contentHash:
              "1".repeat(
                64
              ),
          },

          {
            id:
              "artifact-db-2",

            publicId:
              "signal_1",

            artifactKind:
              "SIGNAL",

            contentHash:
              "2".repeat(
                64
              ),
          },

          {
            id:
              "artifact-db-3",

            publicId:
              "log_1",

            artifactKind:
              "LOG",

            contentHash:
              "3".repeat(
                64
              ),
          },
        ];


        const first =
          buildReplaySchedule({
            timeline,

            artifacts,

            seed:
              23,

            disorderWindowMs:
              500,

            deterministicTimestamps:
              true,
          });


        const second =
          buildReplaySchedule({
            timeline,

            artifacts,

            seed:
              23,

            disorderWindowMs:
              500,

            deterministicTimestamps:
              true,
          });


        expect(
          first
        ).toEqual(
          second
        );


        expect(
          first
            .map(
              (
                event
              ) =>
                event.sequenceNo
            )
        ).toEqual(
          [
            0,
            1,
            2,
          ]
        );


        for (
          const event
          of first
        ) {
          expect(
            event.logicalTimestamp
          ).toMatch(
            /^2000-01-01T/
          );
        }
      }
    );


    test(
      "replay schedule rejects a timeline artifact absent from EVIDENCE channel",

      () => {
        expect(
          () =>
            buildReplaySchedule({
              timeline: [
                {
                  eventId:
                    "secret_event",

                  offsetMs:
                    0,

                  artifactId:
                    "sealed_truth",
                },
              ],

              artifacts: [],

              seed:
                1,
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_REPLAY_ARTIFACT_NOT_VISIBLE",

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "replay schedule rejects sealed answer keys in timeline",

      () => {
        expect(
          () =>
            buildReplaySchedule({
              timeline: [
                {
                  eventId:
                    "bad_event",

                  offsetMs:
                    0,

                  expectedDiagnosis:
                    "database outage",
                },
              ],

              artifacts: [],

              seed:
                1,
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_REPLAY_GROUND_TRUTH_LEAKAGE",

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "step releases exactly one evidence event while paused",

      async () => {
        const consumer =
          jest.fn();


        const repository = {
          getRun:
            jest
              .fn()
              .mockResolvedValueOnce({
                runId:
                  "replay_1",

                caseId:
                  "case_1",

                caseRevision:
                  1,

                status:
                  REPLAY_RUN_STATUS
                    .READY,

                eventCount:
                  2,

                cursorPosition:
                  0,

                speedMultiplier:
                  1,

                executionAuthorized:
                  false,
              })
              .mockResolvedValueOnce({
                runId:
                  "replay_1",

                caseId:
                  "case_1",

                caseRevision:
                  1,

                status:
                  REPLAY_RUN_STATUS
                    .PAUSED,

                eventCount:
                  2,

                cursorPosition:
                  0,

                speedMultiplier:
                  1,

                executionAuthorized:
                  false,
              }),


          transitionRun:
            jest
              .fn()
              .mockResolvedValue({
                runId:
                  "replay_1",

                status:
                  REPLAY_RUN_STATUS
                    .PAUSED,
              }),


          getNextEvent:
            jest
              .fn()
              .mockResolvedValue({
                sequenceNo:
                  0,

                eventId:
                  "event_1",

                originalOffsetMs:
                  0,

                effectiveOffsetMs:
                  0,

                logicalTimestamp:
                  "2000-01-01T00:00:00.000Z",

                artifactId:
                  "signal_1",

                artifactKind:
                  "SIGNAL",

                artifactContentHash:
                  "a".repeat(
                    64
                  ),

                eventPayload: {
                  eventId:
                    "event_1",

                  offsetMs:
                    0,
                },

                deliveryId:
                  "replay_1:0",
              }),


          commitEventRelease:
            jest
              .fn()
              .mockResolvedValue({
                event: {
                  releasedAt:
                    new Date(),
                },

                run: {
                  runId:
                    "replay_1",

                  caseId:
                    "case_1",

                  status:
                    REPLAY_RUN_STATUS
                      .PAUSED,

                  cursorPosition:
                    1,

                  eventCount:
                    2,
                },

                completed:
                  false,

                executionAuthorized:
                  false,
              }),


          markFailed:
            jest.fn(),
        };


        const evidenceStore = {
          getReplayArtifactContent:
            jest
              .fn()
              .mockResolvedValue({
                artifact: {
                  artifactId:
                    "signal_1",

                  channel:
                    "EVIDENCE",

                  contentHash:
                    "a".repeat(
                      64
                    ),

                  mediaType:
                    "application/json",
                },

                body:
                  Buffer.from(
                    "{}"
                  ),

                verified:
                  true,

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new RealityReplayService({
            repository,

            evidenceStore,

            evidenceConsumer:
              consumer,
          });


        const result =
          await service.step({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            runId:
              "replay_1",
          });


        expect(
          consumer
        ).toHaveBeenCalledTimes(
          1
        );


        const envelope =
          consumer
            .mock
            .calls[0][0];


        expect(
          envelope.visibility
        ).toBe(
          "EVIDENCE"
        );


        expect(
          envelope
            .groundTruthAgentVisible
        ).toBe(
          false
        );


        expect(
          envelope
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          envelope
            .deliveryId
        ).toBe(
          "replay_1:0"
        );


        expect(
          result.completed
        ).toBe(
          false
        );
      }
    );


    test(
      "replay rejects non-EVIDENCE material returned by storage",

      async () => {
        const repository = {
          getRun:
            jest
              .fn()
              .mockResolvedValue({
                runId:
                  "replay_1",

                caseId:
                  "case_1",

                caseRevision:
                  1,

                status:
                  REPLAY_RUN_STATUS
                    .PAUSED,

                eventCount:
                  1,

                cursorPosition:
                  0,

                speedMultiplier:
                  1,

                executionAuthorized:
                  false,
              }),


          getNextEvent:
            jest
              .fn()
              .mockResolvedValue({
                sequenceNo:
                  0,

                eventId:
                  "event_1",

                originalOffsetMs:
                  0,

                effectiveOffsetMs:
                  0,

                logicalTimestamp:
                  "2000-01-01T00:00:00.000Z",

                artifactId:
                  "secret",

                artifactKind:
                  "LOG",

                artifactContentHash:
                  "b".repeat(
                    64
                  ),

                eventPayload: {},

                deliveryId:
                  "replay_1:0",
              }),


          markFailed:
            jest
              .fn()
              .mockResolvedValue({
                status:
                  REPLAY_RUN_STATUS
                    .FAILED,
              }),
        };


        const evidenceStore = {
          getReplayArtifactContent:
            jest
              .fn()
              .mockResolvedValue({
                artifact: {
                  artifactId:
                    "secret",

                  channel:
                    "SEALED_EVALUATION",

                  contentHash:
                    "b".repeat(
                      64
                    ),
                },

                body:
                  Buffer.from(
                    "secret"
                  ),

                verified:
                  true,
              }),
        };


        const service =
          new RealityReplayService({
            repository,

            evidenceStore,
          });


        await expect(
          service.releaseNext({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            runId:
              "replay_1",
          })
        ).rejects.toMatchObject({
          code:
            "REALITY_REPLAY_SEALED_ARTIFACT_LEAKAGE",

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "play releases incremental evidence and never grants execution authority",

      async () => {
        let cursor =
          0;


        let status =
          REPLAY_RUN_STATUS
            .READY;


        const events = [
          {
            sequenceNo:
              0,

            eventId:
              "signal",

            originalOffsetMs:
              0,

            effectiveOffsetMs:
              0,

            logicalTimestamp:
              "2000-01-01T00:00:00.000Z",

            artifactId:
              null,

            artifactKind:
              null,

            artifactContentHash:
              null,

            eventPayload: {
              kind:
                "SIGNAL",
            },

            deliveryId:
              "replay_1:0",
          },

          {
            sequenceNo:
              1,

            eventId:
              "logs",

            originalOffsetMs:
              30000,

            effectiveOffsetMs:
              30000,

            logicalTimestamp:
              "2000-01-01T00:00:30.000Z",

            artifactId:
              null,

            artifactKind:
              null,

            artifactContentHash:
              null,

            eventPayload: {
              kind:
                "LOG",
            },

            deliveryId:
              "replay_1:1",
          },
        ];


        const repository = {
          getRun:
            jest
              .fn()
              .mockImplementation(
                async () => ({
                  runId:
                    "replay_1",

                  caseId:
                    "case_1",

                  caseRevision:
                    1,

                  status,

                  eventCount:
                    2,

                  cursorPosition:
                    cursor,

                  speedMultiplier:
                    1000,

                  executionAuthorized:
                    false,
                })
              ),


          transitionRun:
            jest
              .fn()
              .mockImplementation(
                async (
                  input
                ) => {
                  status =
                    input.nextStatus;


                  return {
                    runId:
                      "replay_1",

                    caseId:
                      "case_1",

                    caseRevision:
                      1,

                    status,

                    eventCount:
                      2,

                    cursorPosition:
                      cursor,

                    speedMultiplier:
                      1000,

                    executionAuthorized:
                      false,
                  };
                }
              ),


          getNextEvent:
            jest
              .fn()
              .mockImplementation(
                async () =>
                  events[
                    cursor
                  ] ||
                  null
              ),


          commitEventRelease:
            jest
              .fn()
              .mockImplementation(
                async (
                  input
                ) => {
                  cursor =
                    input
                      .sequenceNo +
                    1;


                  const completed =
                    cursor >=
                    events.length;


                  if (
                    completed
                  ) {
                    status =
                      REPLAY_RUN_STATUS
                        .COMPLETED;
                  }


                  return {
                    event: {
                      releasedAt:
                        new Date(),
                    },

                    run: {
                      runId:
                        "replay_1",

                      caseId:
                        "case_1",

                      caseRevision:
                        1,

                      status,

                      eventCount:
                        events.length,

                      cursorPosition:
                        cursor,

                      speedMultiplier:
                        1000,

                      executionAuthorized:
                        false,
                    },

                    completed,

                    executionAuthorized:
                      false,
                  };
                }
              ),


          markFailed:
            jest.fn(),
        };


        const consumer =
          jest.fn();


        const sleepMock =
          jest
            .fn()
            .mockResolvedValue();


        const service =
          new RealityReplayService({
            repository,

            evidenceStore: {},

            evidenceConsumer:
              consumer,

            sleep:
              sleepMock,
          });


        const result =
          await service.play({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            runId:
              "replay_1",
          });


        expect(
          consumer
        ).toHaveBeenCalledTimes(
          2
        );


        expect(
          consumer.mock.calls[0][0]
            .eventId
        ).toBe(
          "signal"
        );


        expect(
          consumer.mock.calls[1][0]
            .eventId
        ).toBe(
          "logs"
        );


        expect(
          sleepMock
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          result.completed
        ).toBe(
          true
        );


        expect(
          result.run.status
        ).toBe(
          REPLAY_RUN_STATUS
            .COMPLETED
        );


        for (
          const call
          of consumer.mock.calls
        ) {
          expect(
            call[0]
              .groundTruthAgentVisible
          ).toBe(
            false
          );


          expect(
            call[0]
              .executionAuthorized
          ).toBe(
            false
          );
        }
      }
    );


    test(
      "checkpoint and restart remain control operations and never authorize execution",

      async () => {
        const repository = {
          createCheckpoint:
            jest
              .fn()
              .mockResolvedValue({
                checkpointId:
                  "checkpoint_1",

                runId:
                  "replay_1",

                cursorPosition:
                  2,

                runStatus:
                  REPLAY_RUN_STATUS
                    .PAUSED,

                timelineHash:
                  "c".repeat(
                    64
                  ),

                executionAuthorized:
                  false,
              }),


          restartRun:
            jest
              .fn()
              .mockResolvedValue({
                runId:
                  "replay_1",

                status:
                  REPLAY_RUN_STATUS
                    .READY,

                cursorPosition:
                  0,

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new RealityReplayService({
            repository,

            evidenceStore: {},
          });


        const checkpoint =
          await service
            .createCheckpoint({
              organizationId:
                "org_test",

              environmentId:
                "env_test",

              runId:
                "replay_1",
            });


        expect(
          checkpoint
            .groundTruthAgentVisible
        ).toBe(
          false
        );


        expect(
          checkpoint
            .executionAuthorized
        ).toBe(
          false
        );


        const restarted =
          await service.restart({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            runId:
              "replay_1",
          });


        expect(
          restarted.status
        ).toBe(
          REPLAY_RUN_STATUS
            .READY
        );


        expect(
          restarted.cursorPosition
        ).toBe(
          0
        );


        expect(
          restarted
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );
  }
);