/**
 * Memory Cleanup Job
 * Scheduled job to clean up old incident memory and prevent unbounded growth
 * 
 * Runs every 5 minutes to:
 * - Delete incident memory older than TTL
 * - Archive old decision traces
 * - Trim oversized pattern histories
 * - Enforce max entries per tenant
 */

const IncidentMemory = require('../../models/IncidentMemory');
const DecisionTrace = require('../../models/DecisionTrace');
const RunbookExecution = require('../../models/RunbookExecution');
const FailedMessage = require('../../models/FailedMessage');
const TenantConfig = require('../../models/TenantConfig');

// Lazy getter for metricsService to avoid circular dependencies
let metricsServiceCache = null;
const getMetricsService = () => {
  if (!metricsServiceCache) {
    try {
      const infraServices = require('./index');
      metricsServiceCache = infraServices.metricsService;
    } catch (e) {
      console.warn('[memory-cleanup] Could not load metricsService:', e.message);
      return null;
    }
  }
  return metricsServiceCache;
};

class MemoryCleanupJob {
  constructor() {
    this.config = {
      // TTL for different data types (in days)
      ttls: {
        incidentMemory: 30,
        decisionTrace: 90,
        runbookExecution: 90,
        failedMessage: 7,
      },
      // Max entries per tenant
      limits: {
        incidentMemoryPerTenant: 10000,
        decisionTracePerTenant: 50000,
      },
      // Trim old occurrences in IncidentMemory
      maxOccurrencesPerPattern: 100,
      // Job interval (minutes)
      intervalMinutes: 5,
    };

    this.isRunning = false;
    this.timerId = null;
  }

  /**
   * Start cleanup job
   */
  start() {
    if (this.isRunning) {
      console.warn('[memory-cleanup] Job already running');
      return;
    }

    this.isRunning = true;
    console.log(
      `[memory-cleanup] ✓ Started cleanup job (runs every ${this.config.intervalMinutes} minutes)`
    );

    // Run immediately, then on interval
    this.cleanup();
    this.timerId = setInterval(() => this.cleanup(), this.config.intervalMinutes * 60 * 1000);
  }

  /**
   * Stop cleanup job
   */
  stop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
      this.isRunning = false;
      console.log('[memory-cleanup] ✓ Stopped cleanup job');
    }
  }

  /**
   * Run cleanup
   */
  async cleanup() {
    try {
      const startTime = Date.now();
      const results = {};

      // Clean each collection
      results.incidentMemory = await this.cleanIncidentMemory();
      results.decisionTrace = await this.cleanDecisionTrace();
      results.runbookExecution = await this.cleanRunbookExecution();
      results.failedMessages = await this.cleanFailedMessages();
      results.enforcement = await this.enforcePerTenantLimits();

      // FIX #6: INFRASTRUCTURE METRICS - Update memory and trace count gauges
      // After cleanup, update metrics to reflect current database state
      await this.updateInfrastructureMetrics();

      const duration = Date.now() - startTime;

      // Log summary
      console.log(
        `[memory-cleanup] ✓ Cleanup cycle completed (${duration}ms):`,
        results
      );

      return results;
    } catch (error) {
      console.error('[memory-cleanup] Error during cleanup:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Update infrastructure metrics after cleanup
   * Counts current incident patterns and decision traces per tenant
   */
  async updateInfrastructureMetrics() {
    try {
      // Get all tenants
      const tenants = await TenantConfig.find({}).select('tenantId').lean();

      for (const tenant of tenants) {
        try {
          const tenantId = tenant.tenantId;

          // Count incident memory patterns
          const patternCount = await IncidentMemory.countDocuments({ tenantId });

          // Count decision traces
          const traceCount = await DecisionTrace.countDocuments({ tenantId });

          // Update metrics in Prometheus
          const metrics = getMetricsService();
          if (metrics) {
            metrics.updateMemoryMetrics(tenantId, patternCount, traceCount);
          }

          console.log(
            `[memory-cleanup] Updated metrics: tenant=${tenantId}, patterns=${patternCount}, traces=${traceCount}`
          );
        } catch (error) {
          console.warn(`[memory-cleanup] Failed to update metrics for tenant=${tenant.tenantId}:`, error.message);
        }
      }
    } catch (error) {
      console.error('[memory-cleanup] Error updating infrastructure metrics:', error.message);
    }
  }

  /**
   * Clean old incident memory records
   */
  async cleanIncidentMemory() {
    try {
      const ttlMs = this.config.ttls.incidentMemory * 24 * 60 * 60 * 1000;
      const cutoffTime = new Date(Date.now() - ttlMs);

      // Delete inactive patterns older than TTL
      const deleteResult = await IncidentMemory.deleteMany({
        isActive: false,
        updatedAt: { $lt: cutoffTime },
      });

      // Trim occurrences in active patterns (keep only recent 100)
      const activePatterns = await IncidentMemory.find({ isActive: true });
      let trimmedCount = 0;

      for (const pattern of activePatterns) {
        if (pattern.occurrences && pattern.occurrences.length > this.config.maxOccurrencesPerPattern) {
          const toTrim = pattern.occurrences.length - this.config.maxOccurrencesPerPattern;
          pattern.occurrences = pattern.occurrences.slice(-this.config.maxOccurrencesPerPattern);
          trimmedCount += toTrim;
          await pattern.save();
        }
      }

      return {
        deleted: deleteResult.deletedCount,
        trimmed: trimmedCount,
      };
    } catch (error) {
      console.error('[memory-cleanup] Error cleaning IncidentMemory:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Clean old decision traces
   */
  async cleanDecisionTrace() {
    try {
      const ttlMs = this.config.ttls.decisionTrace * 24 * 60 * 60 * 1000;
      const cutoffTime = new Date(Date.now() - ttlMs);

      const result = await DecisionTrace.deleteMany({
        createdAt: { $lt: cutoffTime },
      });

      return { deleted: result.deletedCount };
    } catch (error) {
      console.error('[memory-cleanup] Error cleaning DecisionTrace:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Clean old runbook executions
   */
  async cleanRunbookExecution() {
    try {
      const ttlMs = this.config.ttls.runbookExecution * 24 * 60 * 60 * 1000;
      const cutoffTime = new Date(Date.now() - ttlMs);

      const result = await RunbookExecution.deleteMany({
        startTime: { $lt: cutoffTime },
      });

      return { deleted: result.deletedCount };
    } catch (error) {
      console.error('[memory-cleanup] Error cleaning RunbookExecution:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Clean old failed messages from DLQ
   */
  async cleanFailedMessages() {
    try {
      const ttlMs = this.config.ttls.failedMessage * 24 * 60 * 60 * 1000;
      const cutoffTime = new Date(Date.now() - ttlMs);

      // Delete old resolved messages
      const result = await FailedMessage.deleteMany({
        status: 'resolved',
        dlqEntryTime: { $lt: cutoffTime },
      });

      return { deleted: result.deletedCount };
    } catch (error) {
      console.error('[memory-cleanup] Error cleaning FailedMessage:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Enforce per-tenant limits
   */
  async enforcePerTenantLimits() {
    try {
      const results = { tenants: {} };

      // Get all unique tenant IDs
      const tenants = await IncidentMemory.distinct('tenantId');

      for (const tenantId of tenants) {
        // Enforce IncidentMemory limit
        const memoryCount = await IncidentMemory.countDocuments({ tenantId });
        if (memoryCount > this.config.limits.incidentMemoryPerTenant) {
          // Delete oldest inactive patterns
          const excess = memoryCount - this.config.limits.incidentMemoryPerTenant;
          const toDelete = await IncidentMemory.find({
            tenantId,
            isActive: false,
          })
            .sort({ updatedAt: 1 })
            .limit(excess);

          const ids = toDelete.map((m) => m._id);
          const deleteResult = await IncidentMemory.deleteMany({
            _id: { $in: ids },
          });

          results.tenants[tenantId] = {
            memoryDeleted: deleteResult.deletedCount,
          };
        }

        // Enforce DecisionTrace limit
        const traceCount = await DecisionTrace.countDocuments({ tenantId });
        if (traceCount > this.config.limits.decisionTracePerTenant) {
          const excess = traceCount - this.config.limits.decisionTracePerTenant;
          const toDelete = await DecisionTrace.find({ tenantId })
            .sort({ createdAt: 1 })
            .limit(excess);

          const ids = toDelete.map((t) => t._id);
          await DecisionTrace.deleteMany({ _id: { $in: ids } });

          if (!results.tenants[tenantId]) {
            results.tenants[tenantId] = {};
          }
          results.tenants[tenantId].tracesDeleted = excess;
        }
      }

      return results;
    } catch (error) {
      console.error('[memory-cleanup] Error enforcing limits:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Get current memory status
   */
  async getStatus() {
    try {
      const tenants = await IncidentMemory.distinct('tenantId');
      const status = {
        isRunning: this.isRunning,
        nextRunMs: this.timerId
          ? this.config.intervalMinutes * 60 * 1000 - ((Date.now() - startTime) % (this.config.intervalMinutes * 60 * 1000))
          : 0,
        tenants: {},
      };

      for (const tenantId of tenants) {
        const memoryCount = await IncidentMemory.countDocuments({ tenantId });
        const traceCount = await DecisionTrace.countDocuments({ tenantId });

        status.tenants[tenantId] = {
          incidentMemoryRecords: memoryCount,
          decisionTraces: traceCount,
          atCapacity:
            memoryCount >= this.config.limits.incidentMemoryPerTenant ||
            traceCount >= this.config.limits.decisionTracePerTenant,
        };
      }

      return status;
    } catch (error) {
      console.error('[memory-cleanup] Error getting status:', error.message);
      return { error: error.message };
    }
  }
}

module.exports = new MemoryCleanupJob();
