"use strict";

const BackfillRunner =
  require(
    "../migration/BackfillRunner"
  );

describe(
  "BackfillRunner",
  () => {
    let state;
    let checkpoint;

    let stateStore;
    let checkpointStore;
    let source;
    let adapters;
    let lock;
    let identityBootstrapper;
    let domainRegistry;
    let cutoverPolicy;

    beforeEach(
      () => {
        process.env
          .MIGRATION_MODE =
          "backfill";

        state = {
          phase:
            "pending",

          backfill_complete:
            false,
        };

        checkpoint =
          null;

        stateStore = {
          ensure:
            jest.fn(
              async () =>
                state
            ),

          transition:
            jest.fn(
              async (
                _scope,
                _domain,
                nextPhase,
                changes
              ) => {
                state = {
                  ...state,

                  phase:
                    nextPhase,

                  backfill_complete:
                    changes
                      .backfillComplete ??
                    state
                      .backfill_complete,
                };

                return state;
              }
            ),

          appendHistory:
            jest.fn(),
        };

        checkpointStore = {
          get:
            jest.fn(
              async () =>
                checkpoint
            ),

          save:
            jest.fn(
              async (
                _scope,
                _domain,
                value
              ) => {
                checkpoint = {
                  cursor_value:
                    value.cursorValue,

                  batch_number:
                    value.batchNumber,

                  scanned_count:
                    value.scannedCount,

                  migrated_count:
                    value.migratedCount,

                  skipped_count:
                    value.skippedCount,

                  failed_count:
                    value.failedCount,

                  source_high_watermark:
                    value
                      .sourceHighWatermark,

                  completed:
                    value.completed,
                };

                return checkpoint;
              }
            ),
        };

        source = {
          getHighWatermark:
            jest.fn(
              async () =>
                "mongo-3"
            ),

          readBatch:
            jest
              .fn()
              .mockResolvedValueOnce({
                documents: [
                  {
                    _id:
                      "mongo-1",
                  },
                  {
                    _id:
                      "mongo-2",
                  },
                ],

                cursor:
                  "mongo-2",

                exhausted:
                  false,
              })
              .mockResolvedValueOnce({
                documents: [
                  {
                    _id:
                      "mongo-3",
                  },
                ],

                cursor:
                  "mongo-3",

                exhausted:
                  true,
              }),
        };

        adapters = {
          migrate:
            jest.fn(
              async () => ({
                status:
                  "migrated",
              })
            ),
        };

        lock = {
          run:
            jest.fn(
              async (
                _identity,
                work
              ) =>
                work()
            ),
        };

        identityBootstrapper = {
          resolve:
            jest.fn(
              async () => ({
                sourceScope: {
                  organizationId:
                    "mongo-org",

                  environmentId:
                    "mongo-env",

                  tenantId:
                    "tenant-1",
                },

                repositoryScope: {
                  organizationId:
                    "org-public",

                  environmentId:
                    "env-public",

                  tenantId:
                    "tenant-public",
                },

                controlScope: {
                  organizationId:
                    "org-uuid",

                  environmentId:
                    "env-uuid",
                },
              })
            ),
        };

        domainRegistry = {
          get:
            jest.fn(
              () => ({
                name:
                  "incidents",

                migrationMode:
                  "write",
              })
            ),

          list:
            jest.fn(
              () => [
                {
                  name:
                    "incidents",

                  migrationMode:
                    "write",
                },
              ]
            ),
        };

        cutoverPolicy = {
          assertTransition:
            jest.fn(),
        };
      }
    );

    afterEach(
      () => {
        delete process.env
          .MIGRATION_MODE;
      }
    );

    function createRunner() {
      return new BackfillRunner({
        stateStore,
        checkpointStore,
        source,

        adapterRegistry:
          adapters,

        lock,

        identityBootstrapper,

        domainRegistry,

        cutoverPolicy,

        logger: {
          log:
            jest.fn(),

          error:
            jest.fn(),
        },
      });
    }

    test(
      "migrates deterministic batches and finishes backfilled",
      async () => {
        const runner =
          createRunner();

        const result =
          await runner.run({
            organizationId:
              "mongo-org",

            environmentId:
              "mongo-env",

            domain:
              "incidents",

            batchSize:
              2,
          });

        expect(
          result.results[0]
            .scanned
        ).toBe(
          3
        );

        expect(
          result.results[0]
            .migrated
        ).toBe(
          3
        );

        expect(
          result.results[0]
            .completed
        ).toBe(
          true
        );

        expect(
          adapters.migrate
        ).toHaveBeenCalledTimes(
          3
        );

        expect(
          stateStore.transition
        )
          .toHaveBeenCalledWith(
            expect.anything(),
            "incidents",
            "backfilled",
            expect.objectContaining({
              backfillComplete:
                true,
            })
          );
      }
    );

    test(
      "dry run performs no checkpoint or state writes",
      async () => {
        const runner =
          createRunner();

        const result =
          await runner.run({
            organizationId:
              "mongo-org",

            environmentId:
              "mongo-env",

            domain:
              "incidents",

            dryRun:
              true,

            batchSize:
              2,
          });

        expect(
          result.dryRun
        ).toBe(
          true
        );

        expect(
          checkpointStore.save
        ).not
          .toHaveBeenCalled();

        expect(
          stateStore.ensure
        ).not
          .toHaveBeenCalled();

        expect(
          stateStore.transition
        ).not
          .toHaveBeenCalled();

        expect(
          adapters.migrate
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              dryRun:
                true,
            })
          );
      }
    );

    test(
      "resumes from persisted checkpoint",
      async () => {
        checkpoint = {
          cursor_value:
            "mongo-2",

          batch_number:
            1,

          scanned_count:
            2,

          migrated_count:
            2,

          skipped_count:
            0,

          failed_count:
            0,

          source_high_watermark:
            "mongo-3",

          completed:
            false,
        };

        source.readBatch =
          jest.fn(
            async () => ({
              documents: [
                {
                  _id:
                    "mongo-3",
                },
              ],

              cursor:
                "mongo-3",

              exhausted:
                true,
            })
          );

        const runner =
          createRunner();

        const result =
          await runner.run({
            organizationId:
              "mongo-org",

            environmentId:
              "mongo-env",

            domain:
              "incidents",
          });

        expect(
          source
            .getHighWatermark
        ).not
          .toHaveBeenCalled();

        expect(
          source.readBatch
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              cursor:
                "mongo-2",

              highWatermark:
                "mongo-3",
            })
          );

        expect(
          result.results[0]
            .scanned
        ).toBe(
          3
        );
      }
    );

    test(
      "continue mode records failures and never marks backfill complete",
      async () => {
        adapters.migrate
          .mockRejectedValueOnce(
            Object.assign(
              new Error(
                "bad document"
              ),
              {
                code:
                  "BAD_DOCUMENT",
              }
            )
          )
          .mockResolvedValue({
            status:
              "migrated",
          });

        source.readBatch =
          jest.fn(
            async () => ({
              documents: [
                {
                  _id:
                    "mongo-1",
                },
                {
                  _id:
                    "mongo-2",
                },
              ],

              cursor:
                "mongo-2",

              exhausted:
                true,
            })
          );

        const runner =
          createRunner();

        const result =
          await runner.run({
            organizationId:
              "mongo-org",

            environmentId:
              "mongo-env",

            domain:
              "incidents",

            failurePolicy:
              "continue",
          });

        expect(
          result.results[0]
            .failed
        ).toBe(
          1
        );

        expect(
          result.results[0]
            .completed
        ).toBe(
          false
        );

        expect(
          stateStore.transition
        )
          .toHaveBeenCalledWith(
            expect.anything(),
            "incidents",
            "failed",
            expect.objectContaining({
              backfillComplete:
                false,
            })
          );
      }
    );

    test(
      "fail-fast stops on first document failure",
      async () => {
        adapters.migrate
          .mockRejectedValueOnce(
            Object.assign(
              new Error(
                "dependency missing"
              ),
              {
                code:
                  "DEPENDENCY_MISSING",
              }
            )
          );

        const runner =
          createRunner();

        await expect(
          runner.run({
            organizationId:
              "mongo-org",

            environmentId:
              "mongo-env",

            domain:
              "incidents",

            failurePolicy:
              "fail-fast",
          })
        )
          .rejects
          .toMatchObject({
            code:
              "DEPENDENCY_MISSING",
          });

        expect(
          stateStore.transition
        )
          .toHaveBeenCalledWith(
            expect.anything(),
            "incidents",
            "failed",
            expect.objectContaining({
              backfillComplete:
                false,
            })
          );
      }
    );

    test(
      "derived domain performs no source migration",
      async () => {
        domainRegistry.get =
          jest.fn(
            () => ({
              name:
                "correlationTopology",

              migrationMode:
                "derived",
            })
          );

        const runner =
          createRunner();

        const result =
          await runner.run({
            organizationId:
              "mongo-org",

            environmentId:
              "mongo-env",

            domain:
              "correlationTopology",
          });

        expect(
          result.results[0]
            .derived
        ).toBe(
          true
        );

        expect(
          source.readBatch
        ).not
          .toHaveBeenCalled();

        expect(
          adapters.migrate
        ).not
          .toHaveBeenCalled();
      }
    );

    test(
      "real migration is rejected unless MIGRATION_MODE is backfill",
      async () => {
        process.env
          .MIGRATION_MODE =
          "disabled";

        const runner =
          createRunner();

        await expect(
          runner.run({
            organizationId:
              "mongo-org",

            environmentId:
              "mongo-env",

            domain:
              "incidents",
          })
        )
          .rejects
          .toMatchObject({
            code:
              "MIGRATION_BACKFILL_MODE_REQUIRED",
          });
      }
    );

    test(
      "max document safety cap stops without marking domain complete",
      async () => {
        const runner =
          createRunner();

        const result =
          await runner.run({
            organizationId:
              "mongo-org",

            environmentId:
              "mongo-env",

            domain:
              "incidents",

            batchSize:
              2,

            maxDocuments:
              2,
          });

        expect(
          result.results[0]
            .scanned
        ).toBe(
          2
        );

        expect(
          result.results[0]
            .maxDocumentsReached
        ).toBe(
          true
        );
      }
    );
  }
);
