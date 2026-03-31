/**
 * Retry Handler Service
 * Implements exponential backoff strategy for failed messages
 * Routes failures to DLQ after max retries exceeded
 * 
 * CRITICAL FIX #5: DLQ CIRCUIT BREAKER
 * - Monitors DLQ failure rate: if >80% of last 100 messages are permanent failures
 * - Detects poison pills: same message failing 5+ times
 * - Prevents retry storms and infinite loops
 */

const FailedMessage = require('../../models/FailedMessage');
const crypto = require('crypto');

// Circuit breaker state tracking per tenant
const circuitBreakerState = new Map();

class RetryHandler {
  constructor() {
    this.config = {
      maxRetries: 5,
      initialDelayMs: 100,
      maxDelayMs: 30000, // 30 seconds max
      backoffMultiplier: 2.5,
      jitterFactor: 0.1, // 10% random jitter to prevent thundering herd
      maxMessageAgeHours: 24, // CRITICAL FIX: Messages older than 24h are rejected from retry
      // CRITICAL FIX #5: Circuit breaker thresholds
      dlqFailureRateThreshold: 0.80, // 80% failure rate triggers circuit breaker
      dlqSampleSize: 100, // Sample last 100 messages for failure rate calculation
      poisonPillThreshold: 5, // 5 failures = poison pill
    };
  }

  /**
   * Get circuit breaker state for a tenant
   * @param {string} tenantId - Tenant ID
   * @returns {object} Circuit breaker state (open/closed) and metrics
   */
  getCircuitBreakerState(tenantId) {
    if (!circuitBreakerState.has(tenantId)) {
      circuitBreakerState.set(tenantId, {
        state: 'closed', // closed = accepting retries, open = blocking retries
        failureRate: 0,
        dlqSize: 0,
        poisonPills: 0,
        lastTriggeredAt: null,
        lastCheckedAt: null,
      });
    }
    return circuitBreakerState.get(tenantId);
  }

  /**
   * Check and update circuit breaker state based on DLQ metrics
   * CRITICAL: If >80% of recent DLQ messages are unresolved, open the circuit breaker
   * @param {string} tenantId - Tenant ID
   * @returns {object} Updated circuit breaker state
   */
  async updateCircuitBreakerState(tenantId) {
    try {
      const state = this.getCircuitBreakerState(tenantId);
      state.lastCheckedAt = new Date();

      // Count total DLQ messages
      const dlqTotal = await FailedMessage.countDocuments({
        tenantId,
        status: 'permanent_failure',
      });
      state.dlqSize = dlqTotal;

      // Sample recent DLQ messages to calculate failure rate
      const recentDLQMessages = await FailedMessage.find({
        tenantId,
        status: 'permanent_failure',
      })
        .sort({ dlqEntryTime: -1 })
        .limit(this.config.dlqSampleSize)
        .lean();

      // Calculate unresolved failure rate (messages not yet investigated/fixed)
      const unresolvedCount = recentDLQMessages.filter(m => !m.resolution).length;
      const failureRate = recentDLQMessages.length > 0 
        ? unresolvedCount / recentDLQMessages.length 
        : 0;
      
      state.failureRate = failureRate;

      // CRITICAL: Check for poison pills (same message failing 5+ times)
      const poisonPillCount = await FailedMessage.countDocuments({
        tenantId,
        status: 'permanent_failure',
        failureCount: { $gte: this.config.poisonPillThreshold },
      });
      state.poisonPills = poisonPillCount;

      // Open circuit breaker if failure rate exceeds threshold
      const previousState = state.state;
      if (failureRate >= this.config.dlqFailureRateThreshold) {
        state.state = 'open';
        if (previousState === 'closed') {
          state.lastTriggeredAt = new Date();
          console.error(
            `[retry-circuit-breaker] ⚠️ CIRCUIT BREAKER OPENED for tenant=${tenantId} | ` +
            `Failure rate: ${(failureRate * 100).toFixed(1)}% (threshold: ${(this.config.dlqFailureRateThreshold * 100).toFixed(0)}%) | ` +
            `DLQ Size: ${dlqTotal} | Poison Pills: ${poisonPillCount}`
          );
        }
      } else if (failureRate < (this.config.dlqFailureRateThreshold * 0.7)) {
        // Close circuit breaker if failure rate drops to 70% of threshold
        state.state = 'closed';
        console.log(
          `[retry-circuit-breaker] ✓ Circuit breaker CLOSED for tenant=${tenantId} | ` +
          `Failure rate: ${(failureRate * 100).toFixed(1)}% | DLQ Size: ${dlqTotal}`
        );
      }

      return state;
    } catch (error) {
      console.error('[retry-circuit-breaker] Error checking circuit breaker:', error.message);
      // Return safe state on error
      return this.getCircuitBreakerState(tenantId);
    }
  }

  /**
   * Check if we should allow a retry attempt
   * CRITICAL: Returns false if circuit breaker is open
   * @param {string} tenantId - Tenant ID
   * @param {number} failureCount - Current failure count
   * @returns {object} {allowed: boolean, reason: string}
   */
  async canRetry(tenantId, failureCount) {
    // Check for poison pill
    if (failureCount >= this.config.poisonPillThreshold) {
      return {
        allowed: false,
        reason: `Poison pill detected: ${failureCount} failures (threshold: ${this.config.poisonPillThreshold})`,
        isPoisonPill: true,
      };
    }

    // Check circuit breaker state
    const cbState = await this.updateCircuitBreakerState(tenantId);
    if (cbState.state === 'open') {
      return {
        allowed: false,
        reason: `Circuit breaker open: failure rate ${(cbState.failureRate * 100).toFixed(1)}% ` +
                `(threshold: ${(this.config.dlqFailureRateThreshold * 100).toFixed(0)}%)`,
        isCircuitBreakerOpen: true,
      };
    }

    return {
      allowed: true,
      reason: 'Retry allowed',
    };
  }

  /**
   * Calculate next retry delay with exponential backoff + jitter
   * @param {number} attemptNumber - Attempt number (0-indexed)
   * @returns {number} Delay in milliseconds
   */
  calculateDelay(attemptNumber) {
    const baseDelay = Math.min(
      this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attemptNumber),
      this.config.maxDelayMs
    );

    // Add jitter to prevent thundering herd
    const jitter = baseDelay * this.config.jitterFactor * (Math.random() - 0.5);
    return Math.max(baseDelay + jitter, this.config.initialDelayMs);
  }

  /**
   * Record failed message with retry scheduling
   * @param {object} event - {eventId, correlationId, tenantId, topic, originalMessage, errorMessage}
   * @param {number} failureCount - Current retry attempt
   * @returns {object} Message record and next retry info
   */
  async recordFailure(event, failureCount = 1) {
    try {
      const { eventId, correlationId, tenantId, topic, originalMessage, errorMessage, errorStack } = event;

      let failedMessage = await FailedMessage.findOne({
        tenantId,
        eventId,
      });

      if (!failedMessage) {
        failedMessage = new FailedMessage({
          tenantId,
          eventId,
          correlationId,
          topic,
          originalMessage,
        });
      }

      failedMessage.errorMessage = errorMessage;
      failedMessage.errorStack = errorStack;
      failedMessage.failureCount = failureCount;
      failedMessage.lastFailureTime = new Date();

      // Determine if retriable
      if (failureCount >= this.config.maxRetries) {
        failedMessage.status = 'permanent_failure';
        console.error(
          `[retry] ✗ Max retries exceeded for eventId=${eventId} | Moving to DLQ`
        );
      } else {
        failedMessage.status = 'retriable';
        const nextDelayMs = this.calculateDelay(failureCount);
        failedMessage.nextRetryTime = new Date(Date.now() + nextDelayMs);

        console.warn(
          `[retry] Scheduled retry ${failureCount}/${this.config.maxRetries} for eventId=${eventId} | Next: +${nextDelayMs}ms`
        );
      }

      await failedMessage.save();

      return {
        recorded: true,
        status: failedMessage.status,
        failureCount: failedMessage.failureCount,
        nextRetryTime: failedMessage.nextRetryTime,
        dlqEligible: failedMessage.status === 'permanent_failure',
      };
    } catch (error) {
      console.error('[retry] Error recording failure:', error.message);
      throw error;
    }
  }

  /**
   * Get messages due for retry
   * CRITICAL SAFETY: Messages exceeding maxMessageAgeHours are moved to DLQ immediately
   * This prevents infinite retry loops for old messages
   * @param {string} tenantId - Tenant ID
   * @param {number} limit - Max messages to fetch
   * @returns {array} Messages ready for retry
   */
  async getRetryableMessages(tenantId, limit = 100) {
    try {
      const maxAgeMs = this.config.maxMessageAgeHours * 60 * 60 * 1000;
      const oldestAllowedTime = new Date(Date.now() - maxAgeMs);

      // Find messages that are due for retry
      const messages = await FailedMessage.find({
        tenantId,
        status: 'retriable',
        nextRetryTime: { $lte: new Date() },
        createdAt: { $gte: oldestAllowedTime }, // CRITICAL: Only retry recent messages
      })
        .sort({ nextRetryTime: 1 })
        .limit(limit);

      // Move old messages to DLQ to prevent infinite retries
      const failCountBeforeDLQ = await FailedMessage.countDocuments({
        tenantId,
        status: 'retriable',
        createdAt: { $lt: oldestAllowedTime },
      });

      if (failCountBeforeDLQ > 0) {
        console.warn(
          `[retry] Moving ${failCountBeforeDLQ} old messages to DLQ (older than ${this.config.maxMessageAgeHours}h)`
        );

        // Move old retriable messages to permanent failure state
        await FailedMessage.updateMany(
          {
            tenantId,
            status: 'retriable',
            createdAt: { $lt: oldestAllowedTime },
          },
          {
            $set: {
              status: 'permanent_failure',
              dlqEntryTime: new Date(),
              reason: `Message exceeded max retry age (${this.config.maxMessageAgeHours}h) without resolution`,
            },
          }
        );

        console.error(
          `[retry] CRITICAL: ${failCountBeforeDLQ} messages exceeded retry TTL and moved to DLQ`
        );
      }

      return messages;
    } catch (error) {
      console.error('[retry] Error fetching retryable messages:', error.message);
      return [];
    }
  }

  /**
   * Retry a message
   * @param {object} failedMessage - FailedMessage document
   * @param {function} handler - Handler function to execute
   * @returns {object} Retry result
   */
  async retryMessage(failedMessage, handler) {
    try {
      const { eventId, correlationId, tenantId, topic, originalMessage } = failedMessage;

      console.log(
        `[retry] Retrying eventId=${eventId} (attempt ${failedMessage.failureCount + 1}/${this.config.maxRetries})`
      );

      // Execute handler
      const result = await handler({
        eventId,
        correlationId,
        tenantId,
        topic,
        payload: originalMessage.payload,
      });

      // Mark as success
      failedMessage.status = 'resolved';
      failedMessage.lastRetryTime = new Date();
      await failedMessage.save();

      console.log(`[retry] ✓ Successfully retried eventId=${eventId}`);

      return { success: true, result };
    } catch (error) {
      console.error(`[retry] Retry failed for eventId=${failedMessage.eventId}:`, error.message);

      // Record the failure and schedule next retry or move to DLQ
      const nextFailureCount = failedMessage.failureCount + 1;
      return this.recordFailure(
        {
          eventId: failedMessage.eventId,
          correlationId: failedMessage.correlationId,
          tenantId: failedMessage.tenantId,
          topic: failedMessage.topic,
          originalMessage: failedMessage.originalMessage,
          errorMessage: error.message,
          errorStack: error.stack,
        },
        nextFailureCount
      );
    }
  }

  /**
   * Get DLQ statistics
   * @param {string} tenantId - Tenant ID
   * @returns {object} DLQ stats
   */
  async getDLQStats(tenantId) {
    try {
      const permanentFailures = await FailedMessage.countDocuments({
        tenantId,
        status: 'permanent_failure',
      });

      const retriable = await FailedMessage.countDocuments({
        tenantId,
        status: 'retriable',
      });

      const oldestFailure = await FailedMessage.findOne({
        tenantId,
        status: 'permanent_failure',
      })
        .sort({ dlqEntryTime: 1 })
        .lean();

      return {
        permanentFailures,
        retriableMessages: retriable,
        oldestFailureAge: oldestFailure
          ? new Date().getTime() - new Date(oldestFailure.dlqEntryTime).getTime()
          : 0,
        dlqSize: permanentFailures + retriable,
      };
    } catch (error) {
      console.error('[retry] Error getting DLQ stats:', error.message);
      return { permanentFailures: 0, retriableMessages: 0, dlqSize: 0 };
    }
  }

  /**
   * Purge old resolved messages from DLQ
   * @param {string} tenantId - Tenant ID
   * @param {number} ageHours - Delete messages older than this many hours
   * @returns {number} Count deleted
   */
  async purgeOldMessages(tenantId, ageHours = 168) {
    try {
      const cutoffTime = new Date(Date.now() - ageHours * 60 * 60 * 1000);

      const result = await FailedMessage.deleteMany({
        tenantId,
        status: 'resolved',
        dlqEntryTime: { $lt: cutoffTime },
      });

      console.log(`[retry] Purged ${result.deletedCount} old messages from DLQ`);
      return result.deletedCount;
    } catch (error) {
      console.error('[retry] Error purging old messages:', error.message);
      return 0;
    }
  }

  /**
   * Get all circuit breaker states (for monitoring/metrics)
   * @returns {object} Map of tenant IDs to circuit breaker states
   */
  getAllCircuitBreakerStates() {
    const states = {};
    for (const [tenantId, state] of circuitBreakerState.entries()) {
      states[tenantId] = state;
    }
    return states;
  }
}

module.exports = new RetryHandler();
