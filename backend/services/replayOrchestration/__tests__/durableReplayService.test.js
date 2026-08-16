"use strict";

const {
  DurableReplayService,
} =
  require(
    "../durableReplayService"
  );

const {
  REPLAY_SOURCE,
  REPLAY_MODE,
} =
  require(
    "../replayOrchestrationContracts"
  );


describe(
  "DurableReplayService",
  () => {
    let records;


    beforeEach(
      () => {
        records =
          new Map();
      }
    );


    function clone(
      value
    ) {
      return JSON.parse(
        JSON.stringify(
          value
        )
      );
    }


    function matches(
      record,
      query
    ) {
      if (
        !record
      ) {
        return false;
      }

      for (
        const [
          key,
          expected,
        ]
        of Object.entries(
          query
        )
      ) {
        if (
          key ===
          "$or"
        ) {
          if (
            !expected.some(
              (
                entry
              ) =>
                matches(
                  record,
                  entry
                )
            )
          ) {
            return false;
          }

          continue;
        }

        const actual =
          key
            .split(".")
            .reduce(
              (
                current,
                part
              ) =>
                current
                  ? current[part]
                  : undefined,
              record
            );

        if (
          expected &&
          typeof expected ===
            "object" &&
          !Array.isArray(
            expected
          )
        ) {
          if (
            "$in" in
            expected &&
          !expected.$in
            .includes(
              actual
            )
          ) {
            return false;
          }

          if (
            "$lte" in
            expected &&
          actual != null &&
          new Date(
            actual
          ) >
            new Date(
              expected.$lte
            )
          ) {
            return false;
          }

          if (
            "$gt" in
            expected &&
          (
            actual == null ||
            new Date(
              actual
            ) <=
              new Date(
                expected.$gt
              )
          )
          ) {
            return false;
          }

          continue;
        }

        if (
          actual !==
          expected
        ) {
          return false;
        }
      }

      return true;
    }


    function setPath(
      target,
      path,
      value
    ) {
      const parts =
        path.split(
          "."
        );

      const final =
        parts.pop();

      let cursor =
        target;

      for (
        const part
        of parts
      ) {
        cursor[part] =
          cursor[part] ||
          {};

        cursor =
          cursor[part];
      }

      cursor[final] =
        value;
    }


    function createModel() {
      return {
        async findOneAndUpdate(
          query,
          update,
          options = {}
        ) {
          let record =
            [...records.values()]
              .find(
                (
                  item
                ) =>
                  matches(
                    item,
                    query
                  )
              );

          if (
            !record &&
            options.upsert ===
              true
          ) {
            record =
              clone(
                update.$setOnInsert
              );

            records.set(
              record.replayId,
              record
            );
          }

          if (
            !record
          ) {
            return null;
          }

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
              setPath(
                record,
                key,
                value
              );
            }
          }

          if (
            update.$inc
          ) {
            for (
              const [
                key,
                value,
              ]
              of Object.entries(
                update.$inc
              )
            ) {
              const parts =
                key.split(
                  "."
                );

              let current =
                record;

              for (
                let index =
                  0;
                index <
                  parts.length -
                    1;
                index++
              ) {
                current =
                  current[
                    parts[
                      index
                    ]
                  ];
              }

              const final =
                parts[
                  parts.length -
                    1
                ];

              current[final] =
                (
                  current[final] ||
                  0
                ) +
                value;
            }
          }

          if (
            update.$push
          ) {
            for (
              const [
                key,
                value,
              ]
              of Object.entries(
                update.$push
              )
            ) {
              record[key] =
                record[key] ||
                [];

              record[key]
                .push(
                  clone(
                    value
                  )
                );
            }
          }

          return clone(
            record
          );
        },


        findOne(
          query
        ) {
          const record =
            [...records.values()]
              .find(
                (
                  item
                ) =>
                  matches(
                    item,
                    query
                  )
              );

          return {
            lean:
              async () =>
                record
                  ? clone(
                      record
                    )
                  : null,
          };
        },
      };
    }


    function request(
      overrides = {}
    ) {
      return {
        organizationId:
          "org-1",

        environmentId:
          "prod",

        incidentId:
          "incident-1",

        source:
          REPLAY_SOURCE
            .PROCESS_RESTART,

        mode:
          REPLAY_MODE
            .RESUME,

        correlationId:
          "correlation-1",

        executionAuthorized:
          false,

        ...overrides,
      };
    }


    function createService({
      orchestratorResult,
    } = {}) {
      const orchestrator = {
        recover:
          jest.fn()
            .mockResolvedValue(
              orchestratorResult ||
              {
                processed:
                  true,

                replayed:
                  true,

                dispatched:
                  true,

                outcome:
                  "RESUME_DISPATCHED",

                resumeStage:
                  "VERIFICATION",

                reason:
                  "EXECUTION_COMPLETE_VERIFICATION_INCOMPLETE",

                plan: {
                  decision:
                    "RESUME",

                  safety:
                    "SAFE",
                },

                dispatchResult: {
                  persisted:
                    true,

                  eventId:
                    "outbox-event-1",

                  duplicate:
                    false,

                  executionAuthorized:
                    false,
                },

                executionAuthorized:
                  false,
              }
            ),
      };

      return {
        orchestrator,

        service:
          new DurableReplayService({
            WorkflowReplayRecord:
              createModel(),

            orchestrator,

            workerId:
              "replay-worker-A",

            generateClaimToken:
              () =>
                "claim-token-A",

            now:
              () =>
                new Date(
                  "2026-08-16T11:00:00.000Z"
                ),
          }),
      };
    }


    test(
      "creates deterministic replay identity",
      () => {
        const {
          service,
        } =
          createService();

        const first =
          service.buildReplayKey(
            request()
          );

        const second =
          service.buildReplayKey(
            request()
          );

        expect(
          first
        )
          .toBe(
            second
          );

        expect(
          service.buildReplayId(
            first
          )
        )
          .toBe(
            service.buildReplayId(
              second
            )
          );
      }
    );


    test(
      "safe replay is durably recorded and completed",
      async () => {
        const {
          service,
          orchestrator,
        } =
          createService();

        const result =
          await service
            .replay(
              request(),
              {
                dispatchReplay:
                  jest.fn(),
              }
            );

        expect(
          orchestrator.recover
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result
        )
          .toMatchObject({
            processed:
              true,

            replayed:
              true,

            duplicate:
              false,

            status:
              "COMPLETED",

            resumeStage:
              "VERIFICATION",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "same logical replay becomes duplicate after completion",
      async () => {
        const {
          service,
          orchestrator,
        } =
          createService();

        const first =
          await service
            .replay(
              request()
            );

        const second =
          await service
            .replay(
              request()
            );

        expect(
          first.replayed
        )
          .toBe(
            true
          );

        expect(
          second
        )
          .toMatchObject({
            duplicate:
              true,

            decision:
              "ALREADY_TERMINAL",

            status:
              "COMPLETED",

            executionAuthorized:
              false,
          });

        expect(
          orchestrator.recover
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );


    test(
      "manual review remains durable without dispatch",
      async () => {
        const {
          service,
        } =
          createService({
            orchestratorResult: {
              processed:
                true,

              replayed:
                false,

              dispatched:
                false,

              outcome:
                "MANUAL_REVIEW_REQUIRED",

              resumeStage:
                "EXECUTION",

              reason:
                "CHECKPOINT_REQUIRES_MANUAL_RESUME",

              safety:
                "MANUAL_REQUIRED",

              plan: {
                decision:
                  "MANUAL_REVIEW",

                safety:
                  "MANUAL_REQUIRED",
              },

              executionAuthorized:
                false,
            },
          });

        const result =
          await service
            .replay(
              request()
            );

        expect(
          result.status
        )
          .toBe(
            "WAITING_MANUAL_REVIEW"
          );

        expect(
          result.replayed
        )
          .toBe(
            false
          );
      }
    );


    test(
      "reconciliation remains durable without replay",
      async () => {
        const {
          service,
        } =
          createService({
            orchestratorResult: {
              processed:
                true,

              replayed:
                false,

              dispatched:
                false,

              outcome:
                "RECONCILIATION_REQUIRED",

              resumeStage:
                "EXECUTION",

              reason:
                "AMBIGUOUS_EXECUTION_STATE",

              safety:
                "RECONCILE_REQUIRED",

              plan: {
                decision:
                  "RECONCILE",

                safety:
                  "RECONCILE_REQUIRED",
              },

              executionAuthorized:
                false,
            },
          });

        const result =
          await service
            .replay(
              request()
            );

        expect(
          result.status
        )
          .toBe(
            "WAITING_RECONCILIATION"
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "orchestrator failure is persisted as FAILED",
      async () => {
        const orchestrator = {
          recover:
            jest.fn()
              .mockRejectedValue(
                Object.assign(
                  new Error(
                    "temporary database failure"
                  ),
                  {
                    code:
                      "DATABASE_TEMPORARY_FAILURE",

                    retryable:
                      true,
                  }
                )
              ),
        };

        const service =
          new DurableReplayService({
            WorkflowReplayRecord:
              createModel(),

            orchestrator,

            workerId:
              "replay-worker-A",

            generateClaimToken:
              () =>
                "claim-token-A",

            now:
              () =>
                new Date(
                  "2026-08-16T11:00:00.000Z"
                ),
          });

        await expect(
          service.replay(
            request()
          )
        )
          .rejects
          .toMatchObject({
            code:
              "DATABASE_TEMPORARY_FAILURE",

            retryable:
              true,
          });

        const replayKey =
          service.buildReplayKey(
            request()
          );

        const replayId =
          service.buildReplayId(
            replayKey
          );

        expect(
          records.get(
            replayId
          )
            .status
        )
          .toBe(
            "FAILED"
          );
      }
    );


    test(
      "replay request cannot inject execution authority",
      async () => {
        const {
          service,
          orchestrator,
        } =
          createService();

        await expect(
          service.replay(
            request({
              executionAuthorized:
                true,
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "REPLAY_EXECUTION_AUTHORITY_FORBIDDEN",
          });

        expect(
          orchestrator.recover
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "different replayOperationId creates separate logical replay",
      () => {
        const {
          service,
        } =
          createService();

        const first =
          service.buildReplayKey(
            request({
              replayOperationId:
                "operation-A",
            })
          );

        const second =
          service.buildReplayKey(
            request({
              replayOperationId:
                "operation-B",
            })
          );

        expect(
          first
        )
          .not
          .toBe(
            second
          );
      }
    );

    test(
  "persisted replay identity overrides changed source and mode",
  async () => {
    const {
      service,
    } =
      createService();

    const original =
      request();

    const replayKey =
      service.buildReplayKey(
        original
      );

    const replayId =
      service.buildReplayId(
        replayKey
      );

    const resumed = {
      ...original,

      source:
        "MANUAL",

      mode:
        "MANUAL_REPLAY",

      replayKey,

      replayRequestId:
        replayId,
    };

    await service.replay(
      resumed
    );

    const stored =
      records.get(
        replayId
      );

    expect(
      stored.replayId
    )
      .toBe(
        replayId
      );

    expect(
      stored.replayKey
    )
      .toBe(
        replayKey
      );

    expect(
      records.size
    )
      .toBe(
        1
      );
  }
);

    test(
      "completed replay records durable outbox event id",
      async () => {
        const {
          service,
        } =
          createService();

        const result =
          await service
            .replay(
              request()
            );

        expect(
          result.dispatch
            .durableEventId
        )
          .toBe(
            "outbox-event-1"
          );

        expect(
          result.dispatch
            .dispatched
        )
          .toBe(
            true
          );
      }
    );
  }
);