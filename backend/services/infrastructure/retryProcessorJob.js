"use strict";

const {
  FailedMessage,
} =
  require(
    "../../persistence/operational/extendedModels"
  );

/**
 * Retry Processor Job
 * Scheduled job to process retry queue and move messages due for retry
 * 
 * Runs every 5 minutes to:
 * - Fetch all tenants with pending retries
 * - Get messages due for retry for each tenant
 * - Age-limit old messages (>24h) and move to DLQ
 * 
 * CRITICAL SAFETY: This job prevents infinite retry loops by implementing
 * a 24-hour age limit on retry messages. Messages older than 24 hours are
 * automatically moved to the Dead Letter Queue (DLQ) even if not yet at max retries.
 * This prevents the system from endlessly retrying ancient failures that should be
 * manually investigated and cleared.
 */

const {
  TenantConfig,
} = require(
  "../../persistence/operational/identityModels"
);
const retryHandler = require('./retryHandler');

// Lazy getter for metricsService to avoid circular dependencies
let metricsServiceCache = null;
const getMetricsService = () => {
  if (!metricsServiceCache) {
    try {
      const infraServices = require('./index');
      metricsServiceCache = infraServices.metricsService;
    } catch (e) {
      console.warn('[retry-processor] Could not load metricsService:', e.message);
      return null;
    }
  }
  return metricsServiceCache;
};

class RetryProcessorJob {
  constructor() {
    this.config = {
      // How often to check for retryable messages (minutes)
      intervalMinutes: 5,
      // Max messages to check per tenant per cycle
      maxMessagesPerTenant: 100,
    };

    this.isRunning = false;
    this.timerId = null;
  }

  /**
   * Start retry processor job
   */
  start() {
    if (this.isRunning) {
      console.warn('[retry-processor] Job already running');
      return;
    }

    this.isRunning = true;
    console.log(
      `[retry-processor] âœ“ Started retry processor job (runs every ${this.config.intervalMinutes} minutes)`
    );

    // Run immediately, then on interval
    this.processRetries();
    this.timerId = setInterval(() => this.processRetries(), this.config.intervalMinutes * 60 * 1000);
  }

  /**
   * Stop retry processor job
   */
  stop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
      this.isRunning = false;
      console.log('[retry-processor] âœ“ Stopped retry processor job');
    }
  }

  /**
   * Process retries for all tenants
   * Gets messages due for retry and ages out old messages
   * CRITICAL FIX #5: Checks circuit breaker state before allowing retries
   */
  async processRetries() {
    try {
      const startTime = Date.now();
      const results = {
        tenantsProcessed: 0,
        messagesChecked: 0,
        messagesAgedOut: 0,
        circuitBreakersOpen: [],
        poisonPillsDetected: 0,
        errors: [],
      };

      // Get all active tenants
      const tenants = await TenantConfig.find({}).select('tenantId').lean();
      
      if (!tenants || tenants.length === 0) {
        console.log('[retry-processor] No tenants found to process');
        return results;
      }

      // Process each tenant
      for (const tenant of tenants) {
        try {
          const tenantId = tenant.tenantId;
          
          // CRITICAL FIX #5: Check circuit breaker state before retrying
          const cbCheck = await retryHandler.canRetry(tenantId, 0);
          
          if (!cbCheck.allowed && cbCheck.isCircuitBreakerOpen) {
            console.warn(
              `[retry-processor] âš ï¸ Circuit breaker OPEN for tenant=${tenantId} | Reason: ${cbCheck.reason}`
            );
            results.circuitBreakersOpen.push({
              tenantId,
              reason: cbCheck.reason,
            });
          }
          
          // Get messages due for retry for this tenant
          // This call automatically ages out messages > 24h and moves them to DLQ
          const retryableMessages = await retryHandler.getRetryableMessages(
            tenantId,
            this.config.maxMessagesPerTenant
          );

          if (retryableMessages && retryableMessages.length > 0) {
            console.log(
              `[retry-processor] âœ“ Found ${retryableMessages.length} messages for retry in tenant=${tenantId}`
            );
            results.messagesChecked += retryableMessages.length;
          }

          // Get DLQ stats to track aged-out messages and poison pills
          const dlqStats = await retryHandler.getDLQStats(tenantId);
          const cbState = retryHandler.getCircuitBreakerState(tenantId);
          
          results.poisonPillsDetected += cbState.poisonPills;
          
          // FIX #6: INFRASTRUCTURE METRICS - Update DLQ size gauge
          // Update the dlqSize metric so ops team can see which tenants are accumulating failures
          try {
            const metrics = getMetricsService();
            if (metrics) {
              metrics.updateDLQSize(tenantId, dlqStats.dlqSize);
            }
            if (dlqStats.permanentFailures > 0) {
              console.warn(
                `[retry-processor] âš ï¸  Tenant=${tenantId} has ${dlqStats.permanentFailures} permanent failures in DLQ` +
                ` | Poison Pills: ${cbState.poisonPills} | Circuit Breaker: ${cbState.state}`
              );
            }
          } catch (metricError) {
            console.warn(`[retry-processor] Failed to update DLQ metrics for tenant=${tenantId}:`, metricError.message);
          }
          
          results.tenantsProcessed++;
        } catch (error) {
          console.error(`[retry-processor] Error processing tenant=${tenant.tenantId}:`, error.message);
          results.errors.push({
            tenantId: tenant.tenantId,
            error: error.message,
          });
        }
      }

      const duration = Date.now() - startTime;

      // Log summary
      console.log(
        `[retry-processor] âœ“ Retry cycle completed (${duration}ms):`,
        {
          tenantsProcessed: results.tenantsProcessed,
          messagesChecked: results.messagesChecked,
          circuitBreakersOpen: results.circuitBreakersOpen.length,
          poisonPillsDetected: results.poisonPillsDetected,
          errors: results.errors.length,
        }
      );

      return results;
    } catch (error) {
      console.error('[retry-processor] CRITICAL: Error during retry processing:', error.message);
      return { error: error.message };
    }
  }
}

module.exports = new RetryProcessorJob();

