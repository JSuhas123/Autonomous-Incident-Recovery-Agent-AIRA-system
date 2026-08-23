"use strict";

/**
 * ============================================================================
 * PHASE 11.11 — RETENTION / CLEANUP SCHEDULER
 * ============================================================================
 *
 * Responsibilities:
 *
 * - schedule bounded retention cycles
 * - delegate archival/deletion decisions to RetentionService
 * - trim active IncidentMemory occurrence arrays
 * - update infrastructure metrics
 * - avoid overlapping cleanup cycles
 *
 * It MUST NOT directly delete audit/security chains.
 */

const {
  IncidentMemory,
} = require(
  "../../persistence/operational/legacyModels"
);

const {
  DecisionTrace,
} = require(
  "../../persistence/operational/extendedModels"
);

const {
  TenantConfig,
} = require(
  "../../persistence/operational/identityModels"
);

const retentionService =
  require(
    "./retentionService"
  );


// ============================================================================
// LAZY METRICS
// ============================================================================

let metricsServiceCache =
  null;


function getMetricsService() {
  if (
    metricsServiceCache
  ) {
    return metricsServiceCache;
  }


  try {
    const infrastructure =
      require(
        "./index"
      );


    metricsServiceCache =
      infrastructure
        .metricsService ||
      null;
  } catch (
    error
  ) {
    console.warn(
      "[memory-cleanup] Could not load metricsService:",
      error.message
    );
  }


  return metricsServiceCache;
}


// ============================================================================
// JOB
// ============================================================================

class MemoryCleanupJob {
  constructor(
    options = {}
  ) {
    this.intervalMinutes =
      this.normalizePositiveInteger(
        options
          .intervalMinutes ??
        process.env
          .RETENTION_JOB_INTERVAL_MINUTES,
        5
      );


    this.maxOccurrencesPerPattern =
      this.normalizePositiveInteger(
        options
          .maxOccurrencesPerPattern ??
        process.env
          .RETENTION_MAX_PATTERN_OCCURRENCES,
        100
      );


    this.isRunning =
      false;


    this.cleanupInProgress =
      false;


    this.timerId =
      null;


    this.startedAt =
      null;


    this.lastRunAt =
      null;


    this.lastCompletedAt =
      null;


    this.lastDurationMs =
      null;


    this.lastError =
      null;


    this.lastResult =
      null;
  }


  // ==========================================================================
  // NORMALIZATION
  // ==========================================================================

  normalizePositiveInteger(
    value,
    fallback
  ) {
    const parsed =
      Number.parseInt(
        value,
        10
      );


    return Number.isFinite(
      parsed
    ) &&
    parsed >
      0
      ? parsed
      : fallback;
  }


  // ==========================================================================
  // START
  // ==========================================================================

  start() {
    if (
      this.isRunning
    ) {
      return {
        started:
          false,

        reason:
          "ALREADY_RUNNING",

        executionAuthorized:
          false,
      };
    }


    this.isRunning =
      true;


    this.startedAt =
      new Date();


    console.log(
      `[memory-cleanup] ✓ Started retention job interval=${this.intervalMinutes}m`
    );


    /*
     * Initial run is asynchronous but failures are contained.
     */
    void this
      .cleanup()
      .catch(
        (
          error
        ) => {
          console.error(
            "[memory-cleanup] Initial retention cycle failed:",
            error.message
          );
        }
      );


    this.timerId =
      setInterval(
        () => {
          void this
            .cleanup()
            .catch(
              (
                error
              ) => {
                console.error(
                  "[memory-cleanup] Scheduled retention cycle failed:",
                  error.message
                );
              }
            );
        },
        this.intervalMinutes *
          60 *
          1000
      );


    if (
      typeof this.timerId
        .unref ===
      "function"
    ) {
      this.timerId
        .unref();
    }


    return {
      started:
        true,

      intervalMinutes:
        this.intervalMinutes,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // STOP
  // ==========================================================================

  stop() {
    if (
      this.timerId
    ) {
      clearInterval(
        this.timerId
      );


      this.timerId =
        null;
    }


    this.isRunning =
      false;


    console.log(
      "[memory-cleanup] ✓ Stopped retention job"
    );


    return {
      stopped:
        true,

      cleanupInProgress:
        this.cleanupInProgress,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  async cleanup(
    options = {}
  ) {
    if (
      this.cleanupInProgress
    ) {
      return {
        skipped:
          true,

        reason:
          "CLEANUP_ALREADY_RUNNING",

        executionAuthorized:
          false,
      };
    }


    this.cleanupInProgress =
      true;


    const startTime =
      Date.now();


    this.lastRunAt =
      new Date();


    this.lastError =
      null;


    try {
      const dryRun =
        options.dryRun ===
        true;


      const retention =
        await retentionService
          .runCycle({
            dryRun,
          });


      /*
       * Active patterns are never deleted by retention.
       *
       * Their embedded occurrence history is bounded separately.
       */
      const patternTrim =
        await this
          .trimActivePatternHistory({
            dryRun,
          });


      if (
        !dryRun
      ) {
        await this
          .updateInfrastructureMetrics();
      }


      const duration =
        Date.now() -
        startTime;


      this.lastDurationMs =
        duration;


      this.lastCompletedAt =
        new Date();


      this.lastResult = {
        retention,

        patternTrim,

        durationMs:
          duration,

        dryRun,

        executionAuthorized:
          false,
      };


      console.log(
        `[memory-cleanup] ✓ Retention cycle completed duration=${duration}ms dryRun=${dryRun}`
      );


      return this.lastResult;
    } catch (
      error
    ) {
      this.lastError =
        error.message;


      this.lastDurationMs =
        Date.now() -
        startTime;


      console.error(
        "[memory-cleanup] Retention cycle failed:",
        error.message
      );


      return {
        error:
          error.message,

        code:
          error.code ||
          "RETENTION_CYCLE_FAILED",

        executionAuthorized:
          false,
      };
    } finally {
      this.cleanupInProgress =
        false;
    }
  }


  // ==========================================================================
  // DRY RUN
  // ==========================================================================

  async dryRun() {
    return this
      .cleanup({
        dryRun:
          true,
      });
  }


  // ==========================================================================
  // ACTIVE PATTERN HISTORY
  // ==========================================================================

  async trimActivePatternHistory({
    dryRun =
      false,
  } = {}) {
    const tenants =
      await TenantConfig
        .find({
          status: {
            $ne:
              "archived",
          },
        })
        .select(
          "tenantId"
        )
        .lean();


    let trimmed =
      0;


    let patterns =
      0;


    for (
      const tenant
      of tenants
    ) {
      const activePatterns =
        await IncidentMemory
          .find({
            tenantId:
              tenant
                .tenantId,

            isActive:
              true,

            $expr: {
              $gt: [
                {
                  $size: {
                    $ifNull: [
                      "$occurrences",
                      [],
                    ],
                  },
                },

                this
                  .maxOccurrencesPerPattern,
              ],
            },
          });


      for (
        const pattern
        of activePatterns
      ) {
        const occurrences =
          Array.isArray(
            pattern
              .occurrences
          )
            ? pattern
                .occurrences
            : [];


        if (
          occurrences.length <=
          this
            .maxOccurrencesPerPattern
        ) {
          continue;
        }


        const removed =
          occurrences.length -
          this
            .maxOccurrencesPerPattern;


        patterns +=
          1;


        trimmed +=
          removed;


        if (
          dryRun
        ) {
          continue;
        }


        pattern.occurrences =
          occurrences
            .slice(
              -this
                .maxOccurrencesPerPattern
            );


        await pattern
          .save();
      }
    }


    return {
      patterns,

      trimmed,

      dryRun,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // METRICS
  // ==========================================================================

  async updateInfrastructureMetrics() {
    try {
      const tenants =
        await TenantConfig
          .find({
            status: {
              $ne:
                "archived",
            },
          })
          .select(
            "tenantId"
          )
          .lean();


      const metrics =
        getMetricsService();


      if (
        !metrics
      ) {
        return;
      }


      for (
        const tenant
        of tenants
      ) {
        try {
          const tenantId =
            tenant
              .tenantId;


          const [
            patternCount,
            traceCount,
          ] =
            await Promise
              .all([
                IncidentMemory
                  .countDocuments({
                    tenantId,
                  }),

                DecisionTrace
                  .countDocuments({
                    tenantId,
                  }),
              ]);


          if (
            typeof metrics
              .updateMemoryMetrics ===
            "function"
          ) {
            metrics
              .updateMemoryMetrics(
                tenantId,
                patternCount,
                traceCount
              );
          }
        } catch (
          error
        ) {
          console.warn(
            `[memory-cleanup] Metric update failed tenant=${tenant.tenantId}:`,
            error.message
          );
        }
      }
    } catch (
      error
    ) {
      console.warn(
        "[memory-cleanup] Infrastructure metric update failed:",
        error.message
      );
    }
  }


  // ==========================================================================
  // STATUS
  // ==========================================================================

  async getStatus() {
    try {
      const intervalMs =
        this.intervalMinutes *
        60 *
        1000;


      const elapsed =
        this.lastRunAt
          ? Date.now() -
            this.lastRunAt
              .getTime()
          : 0;


      const nextRunMs =
        this.isRunning
          ? Math.max(
              0,
              intervalMs -
              elapsed
            )
          : 0;


      const tenants =
        await TenantConfig
          .find({
            status: {
              $ne:
                "archived",
            },
          })
          .select(
            "tenantId"
          )
          .lean();


      const tenantStatus =
        {};


      for (
        const tenant
        of tenants
      ) {
        const tenantId =
          tenant
            .tenantId;


        const [
          memoryCount,
          traceCount,
        ] =
          await Promise
            .all([
              IncidentMemory
                .countDocuments({
                  tenantId,
                }),

              DecisionTrace
                .countDocuments({
                  tenantId,
                }),
            ]);


        tenantStatus[
          tenantId
        ] = {
          incidentMemoryRecords:
            memoryCount,

          decisionTraces:
            traceCount,
        };
      }


      return {
        isRunning:
          this.isRunning,

        cleanupInProgress:
          this.cleanupInProgress,

        intervalMinutes:
          this.intervalMinutes,

        nextRunMs,

        startedAt:
          this.startedAt,

        lastRunAt:
          this.lastRunAt,

        lastCompletedAt:
          this.lastCompletedAt,

        lastDurationMs:
          this.lastDurationMs,

        lastError:
          this.lastError,

        retention:
          retentionService
            .getStatus(),

        tenants:
          tenantStatus,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      return {
        error:
          error.message,

        isRunning:
          this.isRunning,

        cleanupInProgress:
          this.cleanupInProgress,

        executionAuthorized:
          false,
      };
    }
  }
}


module.exports =
  new MemoryCleanupJob();

module.exports
  .MemoryCleanupJob =
  MemoryCleanupJob;