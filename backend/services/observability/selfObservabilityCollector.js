"use strict";

/**
 * ============================================================================
 * PHASE 11.12 — AIRA SELF OBSERVABILITY COLLECTOR
 * ============================================================================
 *
 * Collects bounded internal AIRA state and publishes it into the canonical
 * MetricsService.
 *
 * IMPORTANT:
 *
 * - does not grant execution authority
 * - does not expose secrets
 * - does not create Prometheus metrics itself
 * - tolerates unavailable optional subsystems
 * - collection failures never crash AIRA
 */

const metricsService =
  require(
    "../infrastructure/metricsService"
  );

const dependencyIsolationService =
  require(
    "../infrastructure/dependencyIsolationService"
  );

const retentionService =
  require(
    "../infrastructure/retentionService"
  );


class SelfObservabilityCollector {
  constructor(
    options = {}
  ) {
    this.metrics =
      options.metrics ||
      metricsService;

    this.dependencies =
      options.dependencies ||
      dependencyIsolationService;

    this.retention =
      options.retention ||
      retentionService;


    this.lastCollectionAt =
      null;

    this.lastDurationMs =
      null;

    this.lastError =
      null;

    this.collectionCount =
      0;

    this.failureCount =
      0;


    /*
     * Used to convert cumulative subsystem counters into
     * Prometheus Counter increments without double-counting.
     */
    this.lastQueueBackpressureEvents =
      0;

    this.lastRetentionCompletedAt =
      null;
  }


  // ==========================================================================
  // COMPLETE COLLECTION
  // ==========================================================================

  async collect({
    lifecycle =
      null,

    replayRecovery =
      null,

    queue =
      null,

    workers =
      {},
  } = {}) {
    const startedAt =
      Date.now();


    try {
      this.collectLifecycle(
        lifecycle
      );


      this.collectReplayRecovery(
        replayRecovery
      );


      this.collectDependencies();


      this.collectQueue(
        queue
      );


      this.collectRetention();


      this.collectWorkers(
        workers
      );


      this.lastCollectionAt =
        new Date();


      this.lastDurationMs =
        Date.now() -
        startedAt;


      this.lastError =
        null;


      this.collectionCount +=
        1;


      return {
        collected:
          true,

        timestamp:
          this.lastCollectionAt,

        durationMs:
          this.lastDurationMs,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      this.failureCount +=
        1;


      this.lastCollectionAt =
        new Date();


      this.lastDurationMs =
        Date.now() -
        startedAt;


      this.lastError =
        error.message;


      try {
        this.metrics
          .recordSelfError(
            "self-observability",
            error.code ||
            "COLLECTION_FAILED"
          );
      } catch {
        // Metrics failures must not recursively break collection.
      }


      return {
        collected:
          false,

        error:
          error.message,

        code:
          error.code ||
          "SELF_OBSERVABILITY_COLLECTION_FAILED",

        timestamp:
          this.lastCollectionAt,

        executionAuthorized:
          false,
      };
    }
  }


  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  collectLifecycle(
    lifecycle
  ) {
    if (
      !lifecycle
    ) {
      return;
    }


    this.metrics
      .updateApplicationLifecycle(
        lifecycle.state ||
        "STARTING",

        lifecycle.ready ===
        true
      );
  }


  // ==========================================================================
  // STARTUP RECOVERY
  // ==========================================================================

  collectReplayRecovery(
    replayRecovery
  ) {
    if (
      !replayRecovery
    ) {
      return;
    }


    /*
     * Current values are represented as gauges by the canonical
     * MetricsService. We only increment the run counter when the
     * collector sees a completed startup state.
     */

    const status =
      replayRecovery
        .startupRecoveryCompleted
        ? (
            Number(
              replayRecovery
                .failed ||
              0
            ) >
            0
              ? "partial"
              : "success"
          )
        : (
            replayRecovery
              .lastError
              ? "failed"
              : "pending"
          );


    this.metrics
      .startupRecoveryRecords
      .set(
        {
          result:
            "discovered",
        },

        Math.max(
          0,
          Number(
            replayRecovery
              .discovered ||
            0
          )
        )
      );


    this.metrics
      .startupRecoveryRecords
      .set(
        {
          result:
            "recovered",
        },

        Math.max(
          0,
          Number(
            replayRecovery
              .recovered ||
            0
          )
        )
      );


    this.metrics
      .startupRecoveryRecords
      .set(
        {
          result:
            "failed",
        },

        Math.max(
          0,
          Number(
            replayRecovery
              .failed ||
            0
          )
        )
      );


    /*
     * Represent startup worker state without high-cardinality labels.
     */
    this.metrics
      .updateWorkerState(
        "startup-recovery",
        status ===
          "success"
          ? "IDLE"
          : status ===
              "pending"
            ? "ACTIVE"
            : "DEGRADED"
      );
  }


  // ==========================================================================
  // DEPENDENCY ISOLATION
  // ==========================================================================

  collectDependencies() {
    if (
      !this.dependencies ||
      typeof this.dependencies
        .getAllStatuses !==
      "function"
    ) {
      return;
    }


    const statuses =
      this.dependencies
        .getAllStatuses();


    if (
      !statuses
    ) {
      return;
    }


    const entries =
      Array.isArray(
        statuses
      )
        ? statuses
        : Object.entries(
            statuses
          )
            .map(
              (
                [
                  name,
                  status,
                ]
              ) => ({
                name,

                ...(
                  status ||
                  {}
                ),
              })
            );


    for (
      const dependency
      of entries
    ) {
      const name =
        dependency.name ||
        dependency.dependency ||
        dependency.id ||
        "unknown";


      const circuitState =
        dependency
          .circuit
          ?.state ||
        dependency
          .state ||
        (
          dependency
            .healthy ===
          true
            ? "HEALTHY"
            : dependency
                .degraded ===
              true
              ? "DEGRADED"
              : "UNAVAILABLE"
        );


      this.metrics
        .updateDependencyState(
          name,
          circuitState
        );
    }
  }


  // ==========================================================================
  // QUEUE
  // ==========================================================================

  collectQueue(
    queue
  ) {
    if (
      !queue
    ) {
      this.metrics
        .updateWorkerState(
          "queue",
          "STOPPED"
        );

      return;
    }


    const status =
      typeof queue
        .getLoadStatus ===
      "function"
        ? queue
            .getLoadStatus()
        : {
            connected:
              Boolean(
                queue.connected
              ),

            saturated:
              false,

            inFlightPublishes:
              0,

            backpressureEvents:
              0,
          };


    this.metrics
      .updateQueueLoad({
        saturated:
          Boolean(
            status
              ?.saturated ||
            status
              ?.publisherBlocked
          ),

        inFlightPublishes:
          Number(
            status
              ?.inFlightPublishes ||
            0
          ),
      });


    const currentBackpressure =
      Math.max(
        0,
        Number(
          status
            ?.backpressureEvents ||
          0
        )
      );


    /*
     * Queue service exposes a cumulative value.
     *
     * Prometheus Counter expects increments, so record only
     * the delta since the previous collection.
     */
    if (
      currentBackpressure >
      this.lastQueueBackpressureEvents
    ) {
      this.metrics
        .recordQueueBackpressure(
          currentBackpressure -
          this
            .lastQueueBackpressureEvents
        );
    }


    this.lastQueueBackpressureEvents =
      currentBackpressure;


    this.metrics
      .updateWorkerState(
        "queue",
        status
          ?.connected
          ? (
              status
                ?.saturated ||
              status
                ?.publisherBlocked
                ? "DEGRADED"
                : "IDLE"
            )
          : "DEGRADED"
      );
  }


  // ==========================================================================
  // RETENTION
  // ==========================================================================

  collectRetention() {
    if (
      !this.retention ||
      typeof this.retention
        .getStatus !==
      "function"
    ) {
      return;
    }


    const status =
      this.retention
        .getStatus();


    const lastRun =
      status
        ?.lastRun;


    if (
      !lastRun
    ) {
      this.metrics
        .updateWorkerState(
          "retention",
          "IDLE"
        );

      return;
    }


    this.metrics
      .updateWorkerState(
        "retention",
        lastRun
          .lastError
          ? "DEGRADED"
          : "IDLE"
      );


    const completedAt =
      lastRun
        .completedAt
        ? new Date(
            lastRun
              .completedAt
          )
            .toISOString()
        : null;


    /*
     * Record each completed retention run only once.
     */
    if (
      completedAt &&
      completedAt !==
      this.lastRetentionCompletedAt
    ) {
      this.metrics
        .recordRetentionRun({
          status:
            lastRun
              .lastError
              ? "failed"
              : "success",

          dryRun:
            lastRun
              .dryRun ===
            true,

          durationMs:
            Number(
              lastRun
                .durationMs ||
              0
            ),

          archived:
            Number(
              lastRun
                .archived ||
              0
            ),

          deleted:
            Number(
              lastRun
                .deleted ||
              0
            ),
        });


      this.lastRetentionCompletedAt =
        completedAt;
    }
  }


  // ==========================================================================
  // WORKERS
  // ==========================================================================

  collectWorkers(
    workers
  ) {
    if (
      !workers ||
      typeof workers !==
      "object"
    ) {
      return;
    }


    for (
      const [
        workerName,
        workerStatus,
      ]
      of Object.entries(
        workers
      )
    ) {
      if (
        !workerStatus
      ) {
        this.metrics
          .updateWorkerState(
            workerName,
            "STOPPED"
          );

        continue;
      }


      let state =
        "IDLE";


      if (
        workerStatus
          .error ||
        workerStatus
          .failed ||
        workerStatus
          .degraded
      ) {
        state =
          "DEGRADED";
      } else if (
        workerStatus
          .processing ||
        workerStatus
          .active ||
        workerStatus
          .running
      ) {
        state =
          "ACTIVE";
      } else if (
        workerStatus
          .stopped ===
        true ||
        workerStatus
          .running ===
        false
      ) {
        state =
          "STOPPED";
      }


      this.metrics
        .updateWorkerState(
          workerName,
          state
        );
    }
  }


  // ==========================================================================
  // ERROR RECORDING
  // ==========================================================================

  recordError(
    component,
    error
  ) {
    const errorType =
      error
        ?.code ||
      error
        ?.name ||
      "UNKNOWN_ERROR";


    this.metrics
      .recordSelfError(
        component ||
        "unknown",
        errorType
      );


    return {
      recorded:
        true,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // STATUS
  // ==========================================================================

  getStatus() {
    return {
      lastCollectionAt:
        this.lastCollectionAt,

      lastDurationMs:
        this.lastDurationMs,

      lastError:
        this.lastError,

      collectionCount:
        this.collectionCount,

      failureCount:
        this.failureCount,

      executionAuthorized:
        false,
    };
  }
}


module.exports =
  new SelfObservabilityCollector();

module.exports
  .SelfObservabilityCollector =
  SelfObservabilityCollector;