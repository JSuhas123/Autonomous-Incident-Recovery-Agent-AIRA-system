"use strict";

const { v4: uuidv4 } = require("uuid");
const Monitor = require("../../models/Monitor");
const { executeCheck, recordResult } = require("./monitorExecutionService");

const LOCK_TTL_MS = 60_000;  // 60 s — lock expires if worker crashes

class MonitorScheduler {
  constructor() {
    this.workerId = uuidv4();
    this._interval = null;
    this._inFlight = 0;
    this._stopping = false;
    this._stopResolve = null;
  }

  /** Start the scheduler loop. */
  start(intervalMs = 30_000) {
    if (this._interval) return;
    console.log(`[scheduler] Starting with workerId=${this.workerId} interval=${intervalMs}ms`);
    this._interval = setInterval(() => this.tick(), intervalMs);
    // Run first tick immediately (non-blocking)
    setImmediate(() => this.tick());
  }

  /** Stop the scheduler and wait for in-flight checks to complete. */
  stop() {
    return new Promise((resolve) => {
      if (this._interval) {
        clearInterval(this._interval);
        this._interval = null;
      }
      this._stopping = true;
      if (this._inFlight === 0) {
        resolve();
      } else {
        this._stopResolve = resolve;
      }
    });
  }

  /** Process all currently-due monitors in this tick. */
  async tick() {
    if (this._stopping) return;
    let monitor;
    while ((monitor = await this._claimDue()) !== null) {
      this._inFlight++;
      this._runOne(monitor).finally(() => {
        this._inFlight--;
        if (this._stopping && this._inFlight === 0 && this._stopResolve) {
          this._stopResolve();
        }
      });
    }
  }

  /**
   * Atomically claim one due monitor.
   * Returns the monitor doc, or null if nothing is due.
   */
  async _claimDue() {
    if (this._stopping) return null;
    const now     = new Date();
    const lockExp = new Date(Date.now() - LOCK_TTL_MS);
    try {
      return await Monitor.findOneAndUpdate(
        {
          enabled:     true,
          nextCheckAt: { $lte: now },
          $or: [
            { lockedAt: null },
            { lockedAt: { $lt: lockExp } },
          ],
        },
        {
          $set: { lockedAt: now, lockedBy: this.workerId },
        },
        { new: true }
      );
    } catch (err) {
      console.error("[scheduler] Error claiming monitor:", err.message);
      return null;
    }
  }

  /** Execute a check for one monitor and persist the result. */
  async _runOne(monitor) {
    try {
      const result = await executeCheck(monitor);
      await recordResult(monitor, result);
    } catch (err) {
      console.error(`[scheduler] Unhandled error for monitor ${monitor._id}:`, err.message);
      // Release lock so we try again next tick
      await Monitor.findByIdAndUpdate(monitor._id, {
        $set: { lockedAt: null, lockedBy: null },
      }).catch(() => {});
    }
  }
}

module.exports = { MonitorScheduler };
