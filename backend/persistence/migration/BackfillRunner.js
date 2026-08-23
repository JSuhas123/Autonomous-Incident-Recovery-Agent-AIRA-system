"use strict";

const {
  getMigrationConfig,
} =
  require(
    "../../config/migration"
  );

const MigrationDomainRegistry =
  require(
    "./MigrationDomainRegistry"
  );

const MigrationStateStore =
  require(
    "./MigrationStateStore"
  );

const MigrationCheckpointStore =
  require(
    "./MigrationCheckpointStore"
  );

const MigrationCutoverPolicy =
  require(
    "./MigrationCutoverPolicy"
  );

const MongoBackfillSource =
  require(
    "./MongoBackfillSource"
  );

const BackfillIdentityBootstrapper =
  require(
    "./BackfillIdentityBootstrapper"
  );

const DomainBackfillAdapterRegistry =
  require(
    "./DomainBackfillAdapterRegistry"
  );

const MigrationLock =
  require(
    "./MigrationLock"
  );

class BackfillRunner {
  constructor(
    options = {}
  ) {
    this.domainRegistry =
      options.domainRegistry ||
      new MigrationDomainRegistry();

    this.stateStore =
      options.stateStore ||
      new MigrationStateStore();

    this.checkpointStore =
      options.checkpointStore ||
      new MigrationCheckpointStore();

    this.cutoverPolicy =
      options.cutoverPolicy ||
      new MigrationCutoverPolicy();

    this.source =
      options.source ||
      new MongoBackfillSource();

    this.identityBootstrapper =
      options.identityBootstrapper ||
      new BackfillIdentityBootstrapper();

    this.adapterRegistry =
      options.adapterRegistry ||
      new DomainBackfillAdapterRegistry();

    this.lock =
      options.lock ||
      new MigrationLock();

    this.sleep =
      options.sleep ||
      (
        (
          ms
        ) =>
          new Promise(
            (
              resolve
            ) =>
              setTimeout(
                resolve,
                ms
              )
          )
      );

    this.now =
      options.now ||
      (() =>
        new Date());

    this.logger =
      options.logger ||
      console;
  }

  async run({
    organizationId,
    environmentId,
    tenantId = null,
    domain = null,
    dryRun = undefined,
    batchSize = undefined,
    failurePolicy = undefined,
    maxDocuments = undefined,
    resume = true,
  } = {}) {
    const config =
      getMigrationConfig();

    const effectiveDryRun =
      dryRun !==
      undefined
        ? dryRun ===
          true
        : config.dryRun;

    if (
      !effectiveDryRun &&
      config.mode !==
        "backfill"
    ) {
      throw Object.assign(
        new Error(
          "Real PostgreSQL backfill requires MIGRATION_MODE=backfill"
        ),
        {
          code:
            "MIGRATION_BACKFILL_MODE_REQUIRED",
        }
      );
    }

    const effectiveBatchSize =
      batchSize ??
      config.batchSize;

    this.assertBatchSize(
      effectiveBatchSize
    );

    const effectiveFailurePolicy =
      failurePolicy ??
      config.failurePolicy;

    this.assertFailurePolicy(
      effectiveFailurePolicy
    );

    const effectiveMaxDocuments =
      maxDocuments ??
      config.maxDocuments;

    const identityContext =
      await this
        .identityBootstrapper
        .resolve({
          organizationId,
          environmentId,
          tenantId,
        });

    const definitions =
      domain
        ? [
            this
              .domainRegistry
              .get(
                domain
              ),
          ]
        : this
            .domainRegistry
            .list();

    const results = [];

    for (
      const definition
      of definitions
    ) {
      const result =
        await this
          .runDomain({
            definition,
            identityContext,

            dryRun:
              effectiveDryRun,

            batchSize:
              effectiveBatchSize,

            failurePolicy:
              effectiveFailurePolicy,

            maxDocuments:
              effectiveMaxDocuments,

            batchDelayMs:
              config.batchDelayMs,

            logEveryBatch:
              config.logEveryBatch,

            resume,
          });

      results.push(
        result
      );
    }

    return {
      dryRun:
        effectiveDryRun,

      organizationId,

      environmentId,

      results,

      totals:
        this.calculateTotals(
          results
        ),
    };
  }

  async runDomain({
    definition,
    identityContext,
    dryRun,
    batchSize,
    failurePolicy,
    maxDocuments,
    batchDelayMs,
    logEveryBatch,
    resume,
  }) {
    const domain =
      definition.name;

    if (
      definition
        .migrationMode ===
      "derived"
    ) {
      return {
        domain,

        derived:
          true,

        completed:
          true,

        scanned:
          0,

        migrated:
          0,

        skipped:
          0,

        failed:
          0,

        batches:
          0,
      };
    }

    const lockIdentity = {
      organizationId:
        identityContext
          .controlScope
          .organizationId,

      environmentId:
        identityContext
          .controlScope
          .environmentId,

      domain,
    };

    return this.lock.run(
      lockIdentity,
      () =>
        this.executeDomain({
          definition,
          identityContext,
          dryRun,
          batchSize,
          failurePolicy,
          maxDocuments,
          batchDelayMs,
          logEveryBatch,
          resume,
        })
    );
  }

  async executeDomain({
    definition,
    identityContext,
    dryRun,
    batchSize,
    failurePolicy,
    maxDocuments,
    batchDelayMs,
    logEveryBatch,
    resume,
  }) {
    const domain =
      definition.name;

    const startedAt =
      this.now();

    const sourceScope =
      identityContext
        .sourceScope;

    const controlScope =
      identityContext
        .controlScope;

    /*
     * Dry-run is intentionally completely in-memory.
     *
     * It never updates migration state/checkpoints/history.
     */
    if (
      dryRun
    ) {
      return this
        .executeBatches({
          definition,
          identityContext,

          checkpoint:
            null,

          highWatermark:
            await this.source
              .getHighWatermark(
                domain,
                sourceScope
              ),

          dryRun:
            true,

          batchSize,
          failurePolicy,
          maxDocuments,
          batchDelayMs,
          logEveryBatch,

          startedAt,
        });
    }

    let state =
      await this
        .stateStore
        .ensure(
          controlScope,
          domain
        );

    if (
      state.phase ===
        "backfilled" &&
      state.backfill_complete ===
        true
    ) {
      const checkpoint =
        await this
          .checkpointStore
          .get(
            controlScope,
            domain
          );

      return this
        .completedSummary({
          domain,
          checkpoint,
          alreadyComplete:
            true,
        });
    }

    this.assertBackfillTransition(
      state.phase
    );

    const previousPhase =
      state.phase;

    state =
      await this
        .stateStore
        .transition(
          controlScope,
          domain,
          "backfilling",
          {
            backfillComplete:
              false,

            startedAt,

            lastError:
              null,

            metadata: {
              resumed:
                previousPhase ===
                  "backfilling" ||
                previousPhase ===
                  "failed",

              migrationVersion:
                "13.5B",
            },
          }
        );

    await this
      .stateStore
      .appendHistory(
        controlScope,
        domain,
        {
          eventType:
            resume
              ? "backfill_resumed"
              : "backfill_started",

          previousPhase:
            previousPhase,

          nextPhase:
            state.phase,

          details: {
            batchSize,
            failurePolicy,
            maxDocuments:
              maxDocuments ??
              null,
          },
        }
      );

    let checkpoint =
      resume
        ? await this
            .checkpointStore
            .get(
              controlScope,
              domain
            )
        : null;

    if (
      checkpoint?.completed
    ) {
      return this
        .completedSummary({
          domain,
          checkpoint,
          alreadyComplete:
            true,
        });
    }

    const highWatermark =
      checkpoint
        ?.source_high_watermark ||
      await this.source
        .getHighWatermark(
          domain,
          sourceScope
        );

    if (
      !checkpoint
    ) {
      checkpoint = {
        cursor_value:
          null,

        batch_number:
          0,

        scanned_count:
          0,

        migrated_count:
          0,

        skipped_count:
          0,

        failed_count:
          0,

        source_high_watermark:
          highWatermark,

        completed:
          false,
      };

      await this
        .checkpointStore
        .save(
          controlScope,
          domain,
          this.toCheckpointInput(
            checkpoint,
            {
              startedAt,
              batchSize,
            }
          )
        );
    }

    try {
      const summary =
        await this
          .executeBatches({
            definition,
            identityContext,
            checkpoint,
            highWatermark,

            dryRun:
              false,

            batchSize,
            failurePolicy,
            maxDocuments,
            batchDelayMs,
            logEveryBatch,

            startedAt,
          });

      if (
        summary.failed >
        0
      ) {
        await this
          .stateStore
          .transition(
            controlScope,
            domain,
            "failed",
            {
              backfillComplete:
                false,

              lastError:
                `${summary.failed} source document(s) failed migration`,

              metadata: {
                summary,
              },
            }
          );

        await this
          .stateStore
          .appendHistory(
            controlScope,
            domain,
            {
              eventType:
                "backfill_failed",

              previousPhase:
                "backfilling",

              nextPhase:
                "failed",

              details:
                summary,
            }
          );

        return {
          ...summary,

          completed:
            false,
        };
      }

      const completedAt =
        this.now();

      await this
        .checkpointStore
        .save(
          controlScope,
          domain,
          {
            cursorValue:
              summary.cursor,

            batchNumber:
              summary.batches,

            scannedCount:
              summary.scanned,

            migratedCount:
              summary.migrated,

            skippedCount:
              summary.skipped,

            failedCount:
              summary.failed,

            sourceHighWatermark:
              highWatermark,

            completed:
              true,

            metadata: {
              startedAt,

              completedAt,

              batchSize,

              durationMs:
                completedAt.getTime() -
                startedAt.getTime(),

              migrationVersion:
                "13.5B",
            },
          }
        );

      this.cutoverPolicy
        .assertTransition(
          "backfilling",
          "backfilled"
        );

      await this
        .stateStore
        .transition(
          controlScope,
          domain,
          "backfilled",
          {
            backfillComplete:
              true,

            backfillCompletedAt:
              completedAt,

            lastError:
              null,

            metadata: {
              sourceHighWatermark:
                highWatermark,

              summary,
            },
          }
        );

      await this
        .stateStore
        .appendHistory(
          controlScope,
          domain,
          {
            eventType:
              "backfill_completed",

            previousPhase:
              "backfilling",

            nextPhase:
              "backfilled",

            details:
              summary,
          }
        );

      return {
        ...summary,

        completed:
          true,
      };
    } catch (
      error
    ) {
      await this
        .stateStore
        .transition(
          controlScope,
          domain,
          "failed",
          {
            backfillComplete:
              false,

            lastError:
              this.safeErrorMessage(
                error
              ),

            metadata: {
              errorCode:
                error.code ||
                "MIGRATION_BACKFILL_FAILED",
            },
          }
        );

      await this
        .stateStore
        .appendHistory(
          controlScope,
          domain,
          {
            eventType:
              "backfill_failed",

            previousPhase:
              "backfilling",

            nextPhase:
              "failed",

            details: {
              code:
                error.code ||
                "MIGRATION_BACKFILL_FAILED",

              message:
                this.safeErrorMessage(
                  error
                ),
            },
          }
        );

      throw error;
    }
  }

  async executeBatches({
    definition,
    identityContext,
    checkpoint,
    highWatermark,
    dryRun,
    batchSize,
    failurePolicy,
    maxDocuments,
    batchDelayMs,
    logEveryBatch,
    startedAt,
  }) {
    const domain =
      definition.name;

    const sourceScope =
      identityContext
        .sourceScope;

    const controlScope =
      identityContext
        .controlScope;

    let cursor =
      checkpoint
        ?.cursor_value ||
      null;

    let batches =
      Number(
        checkpoint
          ?.batch_number ||
        0
      );

    let scanned =
      Number(
        checkpoint
          ?.scanned_count ||
        0
      );

    let migrated =
      Number(
        checkpoint
          ?.migrated_count ||
        0
      );

    let skipped =
      Number(
        checkpoint
          ?.skipped_count ||
        0
      );

    let failed =
      Number(
        checkpoint
          ?.failed_count ||
        0
      );

    let complete =
      false;

    while (
      !complete
    ) {
      if (
        maxDocuments &&
        scanned >=
          maxDocuments
      ) {
        break;
      }

      const remaining =
        maxDocuments
          ? Math.max(
              maxDocuments -
                scanned,
              0
            )
          : batchSize;

      const effectiveLimit =
        Math.min(
          batchSize,
          remaining ||
            batchSize
        );

      const batchStartedAt =
        this.now();

      const batch =
        await this.source
          .readBatch({
            domain,

            scope:
              sourceScope,

            cursor,

            highWatermark,

            limit:
              effectiveLimit,
          });

      if (
        !batch.documents ||
        batch.documents.length ===
          0
      ) {
        complete =
          true;

        break;
      }

      let batchMigrated =
        0;

      let batchSkipped =
        0;

      let batchFailed =
        0;

      for (
        const document
        of batch.documents
      ) {
        try {
          const result =
            await this
              .adapterRegistry
              .migrate({
                domain,

                document,

                context:
                  identityContext,

                dryRun,
              });

          if (
            result.status ===
              "skipped"
          ) {
            batchSkipped +=
              1;
          } else {
            batchMigrated +=
              1;
          }
        } catch (
          error
        ) {
          batchFailed +=
            1;

          if (
            failurePolicy ===
            "fail-fast"
          ) {
            throw Object.assign(
              error instanceof
                Error
                ? error
                : new Error(
                    "Backfill document migration failed"
                  ),
              {
                migrationContext: {
                  domain,

                  sourceDocumentId:
                    document
                      ?._id ||
                    null,
                },
              }
            );
          }

          this.logger.error(
            "[migration] document failed",
            {
              domain,

              sourceDocumentId:
                document
                  ?._id ||
                null,

              code:
                error.code ||
                "MIGRATION_DOCUMENT_FAILED",

              message:
                this.safeErrorMessage(
                  error
                ),
            }
          );
        }
      }

      /*
       * Cursor advances only after the entire batch was processed.
       */
      cursor =
        batch.cursor;

      batches +=
        1;

      scanned +=
        batch.documents.length;

      migrated +=
        batchMigrated;

      skipped +=
        batchSkipped;

      failed +=
        batchFailed;

      const batchCompletedAt =
        this.now();

      if (
        !dryRun
      ) {
        await this
          .checkpointStore
          .save(
            controlScope,
            domain,
            {
              cursorValue:
                cursor,

              batchNumber:
                batches,

              scannedCount:
                scanned,

              migratedCount:
                migrated,

              skippedCount:
                skipped,

              failedCount:
                failed,

              sourceHighWatermark:
                highWatermark,

              completed:
                false,

              metadata: {
                startedAt,

                lastBatchStartedAt:
                  batchStartedAt,

                lastBatchCompletedAt:
                  batchCompletedAt,

                batchSize,

                lastDocumentId:
                  cursor,

                durationMs:
                  batchCompletedAt
                    .getTime() -
                  batchStartedAt
                    .getTime(),

                migrationVersion:
                  "13.5B",
              },
            }
          );

        await this
          .stateStore
          .appendHistory(
            controlScope,
            domain,
            {
              eventType:
                "backfill_batch_completed",

              previousPhase:
                "backfilling",

              nextPhase:
                "backfilling",

              details: {
                batchNumber:
                  batches,

                scanned:
                  batch.documents
                    .length,

                migrated:
                  batchMigrated,

                skipped:
                  batchSkipped,

                failed:
                  batchFailed,

                cursor,
              },
            }
          );
      }

      if (
        logEveryBatch
      ) {
        this.logger.log(
          `[migration] ${domain} batch=${batches} scanned=${scanned} migrated=${migrated} skipped=${skipped} failed=${failed}`
        );
      }

      if (
        batch.exhausted
      ) {
        complete =
          true;
      }

      if (
        maxDocuments &&
        scanned >=
          maxDocuments
      ) {
        complete =
          false;

        break;
      }

      if (
        batchDelayMs >
        0
      ) {
        await this.sleep(
          batchDelayMs
        );
      }
    }

    const endedAt =
      this.now();

    return {
      domain,

      sourceHighWatermark:
        highWatermark,

      cursor,

      batches,

      scanned,

      migrated,

      skipped,

      failed,

      sourceExhausted:
        complete,

      maxDocumentsReached:
        Boolean(
          maxDocuments &&
          scanned >=
            maxDocuments &&
          !complete
        ),

      dryRun,

      durationMs:
        endedAt.getTime() -
        startedAt.getTime(),
    };
  }

  assertBackfillTransition(
    phase
  ) {
    if (
      phase ===
        "backfilling"
    ) {
      return true;
    }

    this.cutoverPolicy
      .assertTransition(
        phase,
        "backfilling"
      );

    return true;
  }

  assertBatchSize(
    batchSize
  ) {
    if (
      !Number.isInteger(
        batchSize
      ) ||
      batchSize <
        1 ||
      batchSize >
        5000
    ) {
      throw Object.assign(
        new Error(
          "Backfill batch size must be between 1 and 5000"
        ),
        {
          code:
            "MIGRATION_BATCH_SIZE_INVALID",
        }
      );
    }
  }

  assertFailurePolicy(
    policy
  ) {
    if (
      policy !==
        "fail-fast" &&
      policy !==
        "continue"
    ) {
      throw Object.assign(
        new Error(
          `Unsupported migration failure policy: ${policy}`
        ),
        {
          code:
            "MIGRATION_FAILURE_POLICY_INVALID",
        }
      );
    }
  }

  completedSummary({
    domain,
    checkpoint,
    alreadyComplete,
  }) {
    return {
      domain,

      sourceHighWatermark:
        checkpoint
          ?.source_high_watermark ||
        null,

      cursor:
        checkpoint
          ?.cursor_value ||
        null,

      batches:
        Number(
          checkpoint
            ?.batch_number ||
          0
        ),

      scanned:
        Number(
          checkpoint
            ?.scanned_count ||
          0
        ),

      migrated:
        Number(
          checkpoint
            ?.migrated_count ||
          0
        ),

      skipped:
        Number(
          checkpoint
            ?.skipped_count ||
          0
        ),

      failed:
        Number(
          checkpoint
            ?.failed_count ||
          0
        ),

      completed:
        true,

      alreadyComplete:
        alreadyComplete ===
        true,

      dryRun:
        false,
    };
  }

  toCheckpointInput(
    checkpoint,
    metadata = {}
  ) {
    return {
      cursorValue:
        checkpoint
          .cursor_value,

      batchNumber:
        checkpoint
          .batch_number,

      scannedCount:
        checkpoint
          .scanned_count,

      migratedCount:
        checkpoint
          .migrated_count,

      skippedCount:
        checkpoint
          .skipped_count,

      failedCount:
        checkpoint
          .failed_count,

      sourceHighWatermark:
        checkpoint
          .source_high_watermark,

      completed:
        checkpoint
          .completed,

      metadata,
    };
  }

  calculateTotals(
    results
  ) {
    return results.reduce(
      (
        totals,
        result
      ) => {
        totals.domains +=
          1;

        totals.scanned +=
          Number(
            result.scanned ||
            0
          );

        totals.migrated +=
          Number(
            result.migrated ||
            0
          );

        totals.skipped +=
          Number(
            result.skipped ||
            0
          );

        totals.failed +=
          Number(
            result.failed ||
            0
          );

        if (
          result.completed
        ) {
          totals.completed +=
            1;
        }

        return totals;
      },
      {
        domains:
          0,

        completed:
          0,

        scanned:
          0,

        migrated:
          0,

        skipped:
          0,

        failed:
          0,
      }
    );
  }

  safeErrorMessage(
    error
  ) {
    return String(
      error?.message ||
      "Migration operation failed"
    )
      .slice(
        0,
        1000
      );
  }
}

module.exports =
  BackfillRunner;