"use strict";

const os =
  require(
    "node:os"
  );

/*
 * ============================================================================
 * AIRA PHASE 11.3.13B
 * WORKFLOW OUTBOX RUNTIME CONTROLLER
 * ============================================================================
 *
 * PURPOSE
 * -------
 *
 * Controls when the durable workflow outbox is allowed to drain.
 *
 *
 * WorkflowOutbox DB
 *        │
 *        ▼
 * Runtime Controller
 *        │
 *        ├── transport healthy? ── NO ──► leave records untouched
 *        │
 *        └── YES
 *             │
 *             ▼
 *       WorkflowOutboxWorker
 *
 *
 * SAFETY
 * ------
 *
 * This controller:
 *
 * - never grants execution authority
 * - never executes recovery actions
 * - never calls execution/verification/lifecycle workers directly
 * - never marks records delivered itself
 * - does not drain when RabbitMQ transport is unavailable
 * - prevents overlapping polling cycles
 * - supports graceful shutdown
 *
 * ============================================================================
 */

class WorkflowOutboxRuntimeController {
  constructor(
    options = {}
  ) {
    if (
      !options.worker
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox runtime requires worker"
        ),
        {
          code:
            "OUTBOX_RUNTIME_WORKER_REQUIRED",
        }
      );
    }

    if (
      !options.queueService
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox runtime requires queueService"
        ),
        {
          code:
            "OUTBOX_RUNTIME_QUEUE_REQUIRED",
        }
      );
    }

    this.worker =
      options.worker;

    this.queueService =
      options.queueService;

    this.intervalMs =
      this.normalizePositiveInteger(
        options.intervalMs,
        1000
      );

    this.workerId =
      options.workerId ||
      [
        "workflow-outbox-runtime",
        os.hostname(),
        process.pid,
      ].join(
        ":"
      );

    this.logger =
      options.logger ||
      console;

    this.setIntervalFn =
      options.setIntervalFn ||
      setInterval;

    this.clearIntervalFn =
      options.clearIntervalFn ||
      clearInterval;

    this.timer =
      null;

    this.running =
      false;

    this.processing =
      false;

    this.stopping =
      false;

    this.lastRunAt =
      null;

    this.lastSuccessAt =
      null;

    this.lastFailureAt =
      null;

    this.lastError =
      null;

    this.totalRuns =
      0;

    this.totalFailures =
      0;

    this.totalSkipped =
      0;
  }

  // ==========================================================================
  // START
  // ==========================================================================

  start() {
    if (
      this.running
    ) {
      return {
        started:
          false,

        alreadyRunning:
          true,

        workerId:
          this.workerId,

        executionAuthorized:
          false,
      };
    }

    /*
     * Fail closed.
     *
     * We don't even install a draining loop if the supplied queue transport
     * cannot be identified as healthy.
     */
    if (
      !this.isTransportReady()
    ) {
      return {
        started:
          false,

        alreadyRunning:
          false,

        reason:
          "TRANSPORT_NOT_READY",

        workerId:
          this.workerId,

        executionAuthorized:
          false,
      };
    }

    this.running =
      true;

    this.stopping =
      false;

    this.timer =
      this.setIntervalFn(
        () => {
          /*
           * Timer callbacks intentionally do not return their promise to the
           * timer implementation.
           *
           * tick() catches its own operational failures.
           */
          void this.tick();
        },
        this.intervalMs
      );

    /*
     * A timer should not keep Node alive by itself during graceful shutdown.
     */
    if (
      this.timer &&
      typeof this.timer.unref ===
        "function"
    ) {
      this.timer.unref();
    }

    this.safeLog(
      "info",
      `[workflow-outbox] runtime started workerId=${this.workerId} intervalMs=${this.intervalMs}`
    );

    return {
      started:
        true,

      alreadyRunning:
        false,

      workerId:
        this.workerId,

      intervalMs:
        this.intervalMs,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // TICK
  // ==========================================================================

  async tick() {
    if (
      !this.running ||
      this.stopping
    ) {
      this.totalSkipped +=
        1;

      return {
        processed:
          false,

        skipped:
          true,

        reason:
          "RUNTIME_NOT_RUNNING",

        executionAuthorized:
          false,
      };
    }

    /*
     * Do not allow concurrent drain loops.
     *
     * Claim leases protect individual outbox records, but preventing overlap
     * in the same process removes unnecessary contention and makes shutdown
     * deterministic.
     */
    if (
      this.processing
    ) {
      this.totalSkipped +=
        1;

      return {
        processed:
          false,

        skipped:
          true,

        reason:
          "RUN_ALREADY_IN_PROGRESS",

        executionAuthorized:
          false,
      };
    }

    /*
     * RabbitMQ can disappear after startup.
     *
     * Do not ask the worker to drain while transport is unavailable.
     */
    if (
      !this.isTransportReady()
    ) {
      this.totalSkipped +=
        1;

      return {
        processed:
          false,

        skipped:
          true,

        reason:
          "TRANSPORT_NOT_READY",

        executionAuthorized:
          false,
      };
    }

    this.processing =
      true;

    this.lastRunAt =
      new Date();

    this.totalRuns +=
      1;

    try {
      const result =
        await this.runWorkerOnce();

      this.lastSuccessAt =
        new Date();

      this.lastError =
        null;

      return {
        processed:
          true,

        skipped:
          false,

        result,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      this.totalFailures +=
        1;

      this.lastFailureAt =
        new Date();

      this.lastError =
        {
          name:
            error?.name ||
            "Error",

          message:
            error?.message ||
            "Unknown workflow outbox runtime error",

          code:
            error?.code ||
            null,
        };

      this.safeLog(
        "error",
        "[workflow-outbox] runtime tick failed",
        error
      );

      /*
       * Runtime polling errors must not crash the entire HTTP process.
       *
       * Durable records remain persisted and can be retried by later ticks.
       */
      return {
        processed:
          false,

        skipped:
          false,

        failed:
          true,

        error:
          this.lastError,

        executionAuthorized:
          false,
      };
    } finally {
      this.processing =
        false;
    }
  }

  // ==========================================================================
  // WORKER ADAPTER
  // ==========================================================================

  async runWorkerOnce() {
    /*
     * Keep the runtime compatible with the worker contract without coupling
     * startup code to internal implementation details.
     *
     * Prefer processBatch() if exposed by the Phase 11 worker.
     */
    if (
      typeof this.worker
        .processBatch ===
      "function"
    ) {
      return this.worker
        .processBatch();
    }

    /*
     * Support runOnce() if the worker uses that naming.
     */
    if (
      typeof this.worker
        .runOnce ===
      "function"
    ) {
      return this.worker
        .runOnce();
    }

    /*
     * Finally support process() for workers whose public entry point follows
     * the existing AIRA worker convention.
     */
    if (
      typeof this.worker
        .process ===
      "function"
    ) {
      return this.worker
        .process();
    }

    throw Object.assign(
      new Error(
        "Workflow outbox worker has no supported processing method"
      ),
      {
        code:
          "OUTBOX_RUNTIME_WORKER_METHOD_MISSING",
      }
    );
  }

  // ==========================================================================
  // TRANSPORT HEALTH
  // ==========================================================================

  isTransportReady() {
    const queue =
      this.queueService;

    if (
      !queue
    ) {
      return false;
    }

    /*
     * Real AIRA QueueService exposes:
     *
     *     queueService.connected
     *
     * Use strict === true intentionally.
     *
     * Missing state must NOT be interpreted as healthy.
     */
    if (
      queue.connected ===
      true
    ) {
      return true;
    }

    /*
     * Some queue implementations may expose an explicit health method.
     *
     * Only accept an explicit boolean true.
     */
    if (
      typeof queue.isConnected ===
        "function"
    ) {
      try {
        return queue
          .isConnected() ===
          true;
      } catch (
        error
      ) {
        return false;
      }
    }

    return false;
  }

  // ==========================================================================
  // STOP
  // ==========================================================================

  async stop(
    options = {}
  ) {
    const waitForCurrent =
      options.waitForCurrent !==
      false;

    const timeoutMs =
      this.normalizePositiveInteger(
        options.timeoutMs,
        10000
      );

    if (
      !this.running &&
      !this.processing
    ) {
      return {
        stopped:
          true,

        alreadyStopped:
          true,

        executionAuthorized:
          false,
      };
    }

    this.stopping =
      true;

    this.running =
      false;

    if (
      this.timer
    ) {
      this.clearIntervalFn(
        this.timer
      );

      this.timer =
        null;
    }

    if (
      waitForCurrent &&
      this.processing
    ) {
      await this.waitUntilIdle(
        timeoutMs
      );
    }

    this.stopping =
      false;

    this.safeLog(
      "info",
      `[workflow-outbox] runtime stopped workerId=${this.workerId}`
    );

    return {
      stopped:
        true,

      alreadyStopped:
        false,

      processing:
        this.processing,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // WAIT FOR CURRENT DELIVERY
  // ==========================================================================

  async waitUntilIdle(
    timeoutMs
  ) {
    const startedAt =
      Date.now();

    while (
      this.processing
    ) {
      if (
        Date.now() -
          startedAt >=
        timeoutMs
      ) {
        throw Object.assign(
          new Error(
            "Timed out waiting for workflow outbox runtime to become idle"
          ),
          {
            code:
              "OUTBOX_RUNTIME_STOP_TIMEOUT",
          }
        );
      }

      await new Promise(
        (
          resolve
        ) =>
          setTimeout(
            resolve,
            10
          )
      );
    }
  }

  // ==========================================================================
  // STATUS
  // ==========================================================================

  getStatus() {
    return {
      workerId:
        this.workerId,

      running:
        this.running,

      processing:
        this.processing,

      stopping:
        this.stopping,

      transportReady:
        this.isTransportReady(),

      intervalMs:
        this.intervalMs,

      lastRunAt:
        this.lastRunAt,

      lastSuccessAt:
        this.lastSuccessAt,

      lastFailureAt:
        this.lastFailureAt,

      lastError:
        this.lastError,

      totalRuns:
        this.totalRuns,

      totalFailures:
        this.totalFailures,

      totalSkipped:
        this.totalSkipped,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  normalizePositiveInteger(
    value,
    fallback
  ) {
    const parsed =
      Number(
        value
      );

    if (
      !Number.isFinite(
        parsed
      ) ||
      parsed <=
        0
    ) {
      return fallback;
    }

    return Math.floor(
      parsed
    );
  }

  safeLog(
    level,
    ...args
  ) {
    try {
      if (
        this.logger &&
        typeof this.logger[
          level
        ] ===
          "function"
      ) {
        this.logger[
          level
        ](
          ...args
        );
      }
    } catch (
      error
    ) {
      /*
       * Logging failure must never affect durable workflow delivery.
       */
    }
  }
}


module.exports =
  WorkflowOutboxRuntimeController;

module.exports
  .WorkflowOutboxRuntimeController =
  WorkflowOutboxRuntimeController;