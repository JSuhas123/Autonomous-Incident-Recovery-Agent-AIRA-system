"use strict";

const {
  Monitor,
} =
  require(
    "../../persistence/operational/legacyModels"
  );

const crypto = require("crypto");

const {
  executeCheck,
  recordResult,
} = require("./monitorExecutionService");

const DEFAULT_POLL_INTERVAL_MS =
  5 * 1000;

const DEFAULT_LOCK_TIMEOUT_MS =
  2 * 60 * 1000;

const DEFAULT_MAX_CONCURRENCY =
  5;

/**
 * Background monitor scheduler.
 *
 * Responsibilities:
 *
 * - find due monitors
 * - atomically claim monitors
 * - execute health checks
 * - persist results
 * - release stale locks
 *
 * IMPORTANT:
 *
 * Monitors already carry:
 *
 * organizationId
 * environmentId
 * serviceId
 *
 * so every autonomous check preserves its complete
 * enterprise ownership context.
 */
class MonitorScheduler {
  constructor(options = {}) {
    this.workerId =
      options.workerId ||
      `monitor-worker-${crypto
        .randomBytes(6)
        .toString("hex")}`;

    this.pollIntervalMs =
      Number(
        options.pollIntervalMs
      ) ||
      DEFAULT_POLL_INTERVAL_MS;

    this.lockTimeoutMs =
      Number(
        options.lockTimeoutMs
      ) ||
      DEFAULT_LOCK_TIMEOUT_MS;

    this.maxConcurrency =
      Number(
        options.maxConcurrency
      ) ||
      DEFAULT_MAX_CONCURRENCY;

    this.running =
      false;

    this.timer =
      null;

    this.activeChecks =
      0;
  }

  /**
   * Claim one monitor atomically.
   *
   * A monitor is eligible when:
   *
   * enabled = true
   * environmentId exists
   * nextCheckAt <= now
   * lock is absent or stale
   */
  async claimNextMonitor() {
    const now =
      new Date();

    const staleLockBefore =
      new Date(
        Date.now() -
          this.lockTimeoutMs
      );

    return Monitor.findOneAndUpdate(
      {
        enabled:
          true,

        environmentId: {
          $ne:
            null,
        },

        nextCheckAt: {
          $lte:
            now,
        },

        $or: [
          {
            lockedAt:
              null,
          },
          {
            lockedAt: {
              $exists:
                false,
            },
          },
          {
            lockedAt: {
              $lte:
                staleLockBefore,
            },
          },
        ],
      },

      {
        $set: {
          lockedAt:
            now,

          lockedBy:
            this.workerId,
        },
      },

      {
        new:
          true,

        sort: {
          nextCheckAt:
            1,
        },
      }
    );
  }

  /**
   * Release a monitor lock safely.
   *
   * Only this worker may release its own lock.
   */
  async releaseLock(
    monitor
  ) {
    if (!monitor?._id) {
      return;
    }

    await Monitor.updateOne(
      {
        _id:
          monitor._id,

        organizationId:
          monitor.organizationId,

        environmentId:
          monitor.environmentId,

        lockedBy:
          this.workerId,
      },

      {
        $set: {
          lockedAt:
            null,

          lockedBy:
            null,
        },
      }
    );
  }

  /**
   * Schedule a retry after an unexpected worker failure.
   */
  async scheduleRetry(
    monitor
  ) {
    if (!monitor?._id) {
      return;
    }

    const retryAt =
      new Date(
        Date.now() +
          Math.max(
            monitor.intervalSeconds *
              1000,
            30 * 1000
          )
      );

    await Monitor.updateOne(
      {
        _id:
          monitor._id,

        organizationId:
          monitor.organizationId,

        environmentId:
          monitor.environmentId,

        lockedBy:
          this.workerId,
      },

      {
        $set: {
          nextCheckAt:
            retryAt,

          lockedAt:
            null,

          lockedBy:
            null,
        },
      }
    );
  }

  /**
   * Process one claimed monitor.
   */
  async processMonitor(
    monitor
  ) {
    this.activeChecks +=
      1;

    try {
      /**
       * Fail closed if an old/unmigrated monitor reaches
       * the worker.
       */
      if (
        !monitor.organizationId ||
        !monitor.environmentId ||
        !monitor.serviceId
      ) {
        throw Object.assign(
          new Error(
            "Monitor ownership context is incomplete"
          ),
          {
            code:
              "MONITOR_CONTEXT_INCOMPLETE",
          }
        );
      }

      const result =
        await executeCheck(
          monitor
        );

      await recordResult(
        monitor,
        result
      );

      console.log(
        [
          "[monitor-scheduler]",
          "check complete",
          `worker=${this.workerId}`,
          `monitor=${monitor._id}`,
          `org=${monitor.organizationId}`,
          `env=${monitor.environmentId}`,
          `status=${result.status}`,
        ].join(" | ")
      );
    } catch (error) {
      console.error(
        [
          "[monitor-scheduler]",
          "check failed",
          `worker=${this.workerId}`,
          `monitor=${monitor?._id || "-"}`,
          `org=${monitor?.organizationId || "-"}`,
          `env=${monitor?.environmentId || "-"}`,
          `code=${error.code || "UNKNOWN"}`,
          `message=${error.message}`,
        ].join(" | ")
      );

      try {
        await this.scheduleRetry(
          monitor
        );
      } catch (
        releaseError
      ) {
        console.error(
          "[monitor-scheduler] Failed to release/retry monitor:",
          releaseError.message
        );
      }
    } finally {
      this.activeChecks -=
        1;
    }
  }

  /**
   * Claim as much work as available within concurrency limit.
   */
  async poll() {
    if (!this.running) {
      return;
    }

    try {
      while (
        this.running &&
        this.activeChecks <
          this.maxConcurrency
      ) {
        const monitor =
          await this.claimNextMonitor();

        if (!monitor) {
          break;
        }

        /**
         * Run asynchronously while the polling loop may claim
         * another monitor up to maxConcurrency.
         */
        void this.processMonitor(
          monitor
        );
      }
    } catch (error) {
      console.error(
        "[monitor-scheduler] Poll error:",
        error.message
      );
    }
  }

  /**
   * Scheduler loop.
   */
  async start() {
    if (this.running) {
      return;
    }

    this.running =
      true;

    console.log(
      `[monitor-scheduler] Started worker=${this.workerId}`
    );

    await this.poll();

    this.timer =
      setInterval(
        () => {
          void this.poll();
        },
        this.pollIntervalMs
      );

    /**
     * Don't keep Node alive solely because of this timer.
     */
    this.timer.unref?.();
  }

  async stop() {
    if (!this.running) {
      return;
    }

    this.running =
      false;

    if (this.timer) {
      clearInterval(
        this.timer
      );

      this.timer =
        null;
    }

    console.log(
      `[monitor-scheduler] Stopped worker=${this.workerId}`
    );
  }
}

module.exports = {
  MonitorScheduler,
};