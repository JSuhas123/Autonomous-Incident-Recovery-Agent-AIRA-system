"use strict";

const {
  ReplayRuntimeIntegration,
} =
  require(
    "../replayRuntimeIntegration"
  );


describe(
  "ReplayRuntimeIntegration",
  () => {
    const now =
      new Date(
        "2026-08-16T12:00:00.000Z"
      );


    function record(
      overrides = {}
    ) {
      return {
        replayId:
          "replay-1",

        replayKey:
          "org-1|prod|incident-1|PROCESS_RESTART:RESUME:AUTO",

        organizationId:
          "org-1",

        environmentId:
          "prod",

        incidentId:
          "incident-1",

        correlationId:
          "correlation-1",

        source:
          "PROCESS_RESTART",

        mode:
          "RESUME",

        requestedStage:
          null,

        status:
          "FAILED",

        failure: {
          retryable:
            true,
        },

        owner: {
          workerId:
            null,

          claimToken:
            null,

          leaseExpiresAt:
            null,
        },

        executionAuthorized:
          false,

        ...overrides,
      };
    }


    function createModel({
      records = [],
      updatedRecord = null,
    } = {}) {
      return {
        find:
          jest.fn(
            () => ({
              sort:
                jest.fn()
                  .mockReturnThis(),

              limit:
                jest.fn()
                  .mockReturnThis(),

              lean:
                jest.fn()
                  .mockResolvedValue(
                    records
                  ),
            })
          ),

        findOneAndUpdate:
          jest.fn()
            .mockImplementation(
              async (
                query,
                update
              ) => {
                if (
                  updatedRecord
                ) {
                  return updatedRecord;
                }

                const existing =
                  records.find(
                    (
                      item
                    ) =>
                      item.replayId ===
                      query.replayId
                  );

                if (
                  !existing
                ) {
                  return null;
                }

                const next = {
                  ...existing,

                  failure: {
                    ...existing.failure,
                  },

                  owner: {
                    ...existing.owner,
                  },
                };

                if (
                  update.$set
                ) {
                  for (
                    const [
                      key,
                      value,
                    ]
                    of Object.entries(
                      update.$set
                    )
                  ) {
                    if (
                      key.startsWith(
                        "owner."
                      )
                    ) {
                      const ownerField =
                        key.slice(
                          "owner.".length
                        );

                      next.owner[
                        ownerField
                      ] =
                        value;

                      continue;
                    }

                    if (
                      key.startsWith(
                        "failure."
                      )
                    ) {
                      const failureField =
                        key.slice(
                          "failure.".length
                        );

                      next.failure[
                        failureField
                      ] =
                        value;

                      continue;
                    }

                    next[key] =
                      value;
                  }
                }

                return next;
              }
            ),

        findOne:
          jest.fn(
            () => ({
              lean:
                jest.fn()
                  .mockResolvedValue(
                    records[0] ||
                    null
                  ),
            })
          ),
      };
    }


    test(
      "startup recovery retries retryable failed replay",
      async () => {
        const failed =
          record();

        const durableReplayService = {
          replay:
            jest.fn()
              .mockResolvedValue({
                processed:
                  true,

                replayed:
                  true,

                status:
                  "COMPLETED",

                executionAuthorized:
                  false,
              }),
        };

        const integration =
          new ReplayRuntimeIntegration({
            WorkflowReplayRecord:
              createModel({
                records: [
                  failed,
                ],
              }),

            durableReplayService,

            now:
              () =>
                now,
          });

        const result =
          await integration
            .recoverInterrupted();

        expect(
          durableReplayService
            .replay
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result
        )
          .toMatchObject({
            discovered:
              1,

            recovered:
              1,

            failed:
              0,

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "expired RUNNING replay is released before recovery",
      async () => {
        const expired =
          record({
            status:
              "RUNNING",

            owner: {
              workerId:
                "dead-worker",

              claimToken:
                "old-token",

              leaseExpiresAt:
                new Date(
                  "2026-08-16T11:00:00.000Z"
                ),
            },
          });

        const model =
          createModel({
            records: [
              expired,
            ],
          });

        const durableReplayService = {
          replay:
            jest.fn()
              .mockResolvedValue({
                processed:
                  true,

                replayed:
                  true,

                status:
                  "COMPLETED",

                executionAuthorized:
                  false,
              }),
        };

        const integration =
          new ReplayRuntimeIntegration({
            WorkflowReplayRecord:
              model,

            durableReplayService,

            now:
              () =>
                now,
          });

        const result =
          await integration
            .recoverInterrupted();

        expect(
          model.findOneAndUpdate
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          durableReplayService
            .replay
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result.recovered
        )
          .toBe(
            1
          );

        expect(
          result.failed
        )
          .toBe(
            0
          );
      }
    );


    test(
      "expired replay release records retryable lease failure",
      async () => {
        const expired =
          record({
            status:
              "RUNNING",

            owner: {
              workerId:
                "dead-worker",

              claimToken:
                "expired-token",

              leaseExpiresAt:
                new Date(
                  "2026-08-16T11:00:00.000Z"
                ),
            },
          });

        const model =
          createModel({
            records: [
              expired,
            ],
          });

        const integration =
          new ReplayRuntimeIntegration({
            WorkflowReplayRecord:
              model,

            durableReplayService: {
              replay:
                jest.fn(),
            },

            now:
              () =>
                now,
          });

        const result =
          await integration
            .releaseExpiredReplay(
              expired
            );

        expect(
          result.status
        )
          .toBe(
            "FAILED"
          );

        const call =
          model
            .findOneAndUpdate
            .mock
            .calls[0];

        expect(
          call[0]
        )
          .toMatchObject({
            replayId:
              "replay-1",

            status:
              "RUNNING",

            "owner.claimToken":
              "expired-token",
          });

        expect(
          call[1].$set
        )
          .toMatchObject({
            status:
              "FAILED",

            failure: {
              code:
                "REPLAY_WORKER_LEASE_EXPIRED",

              retryable:
                true,
            },
          });
      }
    );


    test(
      "manual waiting replay requires explicit actor",
      async () => {
        const integration =
          new ReplayRuntimeIntegration({
            WorkflowReplayRecord:
              createModel(),

            durableReplayService: {
              replay:
                jest.fn(),
            },
          });

        await expect(
          integration
            .approveManualReplay({
              replayId:
                "replay-1",
            })
        )
          .rejects
          .toMatchObject({
            code:
              "REPLAY_MANUAL_ACTOR_REQUIRED",

            retryable:
              false,
          });
      }
    );


    test(
      "manual approval transitions replay then resumes durable service",
      async () => {
        const waiting =
          record({
            status:
              "WAITING_MANUAL_REVIEW",
          });

        const durableReplayService = {
          replay:
            jest.fn()
              .mockResolvedValue({
                processed:
                  true,

                replayed:
                  true,

                status:
                  "COMPLETED",

                executionAuthorized:
                  false,
              }),
        };

        const integration =
          new ReplayRuntimeIntegration({
            WorkflowReplayRecord:
              createModel({
                records: [
                  waiting,
                ],
              }),

            durableReplayService,

            now:
              () =>
                now,
          });

        const result =
          await integration
            .approveManualReplay({
              replayId:
                "replay-1",

              actorId:
                "operator-1",
            });

        expect(
          durableReplayService
            .replay
        )
          .toHaveBeenCalledTimes(
            1
          );

        const replayRequest =
          durableReplayService
            .replay
            .mock
            .calls[0][0];

        expect(
          replayRequest
        )
          .toMatchObject({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            incidentId:
              "incident-1",

            source:
              "MANUAL",

            mode:
              "MANUAL_REPLAY",

            actorId:
              "operator-1",

            executionAuthorized:
              false,
          });

        expect(
          result.status
        )
          .toBe(
            "COMPLETED"
          );
      }
    );


    test(
      "manual replay approval rejects incorrect durable state",
      async () => {
        const integration =
          new ReplayRuntimeIntegration({
            WorkflowReplayRecord:
              createModel({
                records: [],
              }),

            durableReplayService: {
              replay:
                jest.fn(),
            },

            now:
              () =>
                now,
          });

        await expect(
          integration
            .approveManualReplay({
              replayId:
                "missing-replay",

              actorId:
                "operator-1",
            })
        )
          .rejects
          .toMatchObject({
            code:
              "REPLAY_WAITING_STATE_INVALID",

            retryable:
              false,
          });
      }
    );


    test(
      "unsafe reconciliation escalates to manual review",
      async () => {
        const waiting =
          record({
            status:
              "WAITING_RECONCILIATION",
          });

        const durableReplayService = {
          replay:
            jest.fn(),
        };

        const integration =
          new ReplayRuntimeIntegration({
            WorkflowReplayRecord:
              createModel({
                records: [
                  waiting,
                ],
              }),

            durableReplayService,

            now:
              () =>
                now,
          });

        const result =
          await integration
            .resolveReconciliation({
              replayId:
                "replay-1",

              safe:
                false,

              evidence: {
                infrastructureState:
                  "UNKNOWN",
              },
            });

        expect(
          result
        )
          .toMatchObject({
            processed:
              true,

            replayed:
              false,

            status:
              "WAITING_MANUAL_REVIEW",

            manualReviewRequired:
              true,

            executionAuthorized:
              false,
          });

        expect(
          durableReplayService
            .replay
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "safe reconciliation resumes through durable replay service",
      async () => {
        const waiting =
          record({
            status:
              "WAITING_RECONCILIATION",
          });

        const durableReplayService = {
          replay:
            jest.fn()
              .mockResolvedValue({
                processed:
                  true,

                replayed:
                  true,

                status:
                  "COMPLETED",

                executionAuthorized:
                  false,
              }),
        };

        const integration =
          new ReplayRuntimeIntegration({
            WorkflowReplayRecord:
              createModel({
                records: [
                  waiting,
                ],
              }),

            durableReplayService,

            now:
              () =>
                now,
          });

        const result =
          await integration
            .resolveReconciliation({
              replayId:
                "replay-1",

              safe:
                true,

              actorId:
                "operator-1",

              evidence: {
                executionObserved:
                  false,
              },
            });

        expect(
          durableReplayService
            .replay
        )
          .toHaveBeenCalledTimes(
            1
          );

        const replayRequest =
          durableReplayService
            .replay
            .mock
            .calls[0][0];

        expect(
          replayRequest.source
        )
          .toBe(
            "ADMIN_REPAIR"
          );

        expect(
          replayRequest.mode
        )
          .toBe(
            "RESUME"
          );

        expect(
          replayRequest.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.status
        )
          .toBe(
            "COMPLETED"
          );
      }
    );


    test(
      "startup scanner never queries manual or reconciliation waiting states",
      async () => {
        const model =
          createModel({
            records: [],
          });

        const durableReplayService = {
          replay:
            jest.fn(),
        };

        const integration =
          new ReplayRuntimeIntegration({
            WorkflowReplayRecord:
              model,

            durableReplayService,

            now:
              () =>
                now,
          });

        await integration
          .recoverInterrupted();

        expect(
          model.find
        )
          .toHaveBeenCalledTimes(
            1
          );

        const query =
          model.find
            .mock
            .calls[0][0];

        const serialized =
          JSON.stringify(
            query
          );

        expect(
          serialized
        )
          .not
          .toContain(
            "WAITING_MANUAL_REVIEW"
          );

        expect(
          serialized
        )
          .not
          .toContain(
            "WAITING_RECONCILIATION"
          );

        expect(
          serialized
        )
          .toContain(
            "FAILED"
          );

        expect(
          serialized
        )
          .toContain(
            "RUNNING"
          );

        expect(
          durableReplayService
            .replay
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "one failed replay does not stop recovery of another replay",
      async () => {
        const first =
          record({
            replayId:
              "replay-1",
          });

        const second =
          record({
            replayId:
              "replay-2",

            incidentId:
              "incident-2",
          });

        const durableReplayService = {
          replay:
            jest.fn()
              .mockRejectedValueOnce(
                Object.assign(
                  new Error(
                    "temporary failure"
                  ),
                  {
                    code:
                      "DATABASE_TEMPORARY_FAILURE",
                  }
                )
              )
              .mockResolvedValueOnce({
                processed:
                  true,

                status:
                  "COMPLETED",

                executionAuthorized:
                  false,
              }),
        };

        const integration =
          new ReplayRuntimeIntegration({
            WorkflowReplayRecord:
              createModel({
                records: [
                  first,
                  second,
                ],
              }),

            durableReplayService,

            now:
              () =>
                now,
          });

        const result =
          await integration
            .recoverInterrupted();

        expect(
          durableReplayService
            .replay
        )
          .toHaveBeenCalledTimes(
            2
          );

        expect(
          result.discovered
        )
          .toBe(
            2
          );

        expect(
          result.recovered
        )
          .toBe(
            1
          );

        expect(
          result.failed
        )
          .toBe(
            1
          );
      }
    );


    test(
      "reconstructed runtime request never grants execution authority",
      () => {
        const integration =
          new ReplayRuntimeIntegration({
            WorkflowReplayRecord:
              createModel(),

            durableReplayService: {
              replay:
                jest.fn(),
            },
          });

        const replayRequest =
          integration
            .buildReplayRequest(
              record()
            );

        expect(
          replayRequest.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          replayRequest.authorizationGranted
        )
          .toBeUndefined();
      }
    );

    test(
  "manual approval preserves original durable replay identity",
  async () => {
    const waiting =
      record({
        status:
          "WAITING_MANUAL_REVIEW",
      });

    const durableReplayService = {
      replay:
        jest.fn()
          .mockResolvedValue({
            status:
              "COMPLETED",

            executionAuthorized:
              false,
          }),
    };

    const integration =
      new ReplayRuntimeIntegration({
        WorkflowReplayRecord:
          createModel({
            records: [
              waiting,
            ],
          }),

        durableReplayService,

        now:
          () =>
            now,
      });

    await integration
      .approveManualReplay({
        replayId:
          "replay-1",

        actorId:
          "operator-1",
      });

    const replayRequest =
      durableReplayService
        .replay
        .mock
        .calls[0][0];

    expect(
      replayRequest.replayRequestId
    )
      .toBe(
        waiting.replayId
      );

    expect(
      replayRequest.replayKey
    )
      .toBe(
        waiting.replayKey
      );

    expect(
      replayRequest.source
    )
      .toBe(
        "MANUAL"
      );

    expect(
      replayRequest.mode
    )
      .toBe(
        "MANUAL_REPLAY"
      );

    expect(
      replayRequest.executionAuthorized
    )
      .toBe(
        false
      );
  }
);

    test(
      "invalid replay id fails closed",
      async () => {
        const integration =
          new ReplayRuntimeIntegration({
            WorkflowReplayRecord:
              createModel(),

            durableReplayService: {
              replay:
                jest.fn(),
            },
          });

        await expect(
          integration
            .approveManualReplay({
              replayId:
                null,

              actorId:
                "operator-1",
            })
        )
          .rejects
          .toMatchObject({
            code:
              "REPLAY_ID_REQUIRED",

            retryable:
              false,
          });
      }
    );
  }
);