/**
 * Decision Execution Publisher Service
 * 
 * Bridges decisions and action execution by publishing decisions to queue
 * Ensures every decision (except those intentionally held) triggers an execution attempt
 * Handles decision publishing, transformation, and queuing
 */

const { getQueueService } = require('../infrastructure/queueService');
const decisionMapperService = require('../infrastructure/decisionMapperService');

class DecisionExecutionPublisher {
  constructor() {
    this.topic = 'DECISION_PROPOSED'; // Queue topic for actions
    this.metricsBlacklist = new Set(); // Track silently dropped signals
  }

  /**
   * Publish decision for execution
   * Called after decision is made - transforms to action and queues
   * 
   * @param {object} decision - The decision object from decision trace
   * @param {string} tenantId - Tenant ID
   * @param {string} correlationId - Correlation ID for tracing
   * @returns {Promise<object>} Publishing result
   */
  async publishDecisionForExecution(decision, tenantId, correlationId) {
    try {
      const {
        decisionId,
        recommendedAction,
        inputs = {},
        reasoning = {},
        severity = 'MEDIUM',
        confidence = 0.5
      } = decision;

      if (!decisionId || !correlationId || !tenantId) {
        throw new Error('Missing critical decision fields: decisionId, correlationId, tenantId');
      }

      // Step 1: Map decision to executable action
      const actionMapping = decisionMapperService.mapDecisionToAction(
        recommendedAction,
        confidence,
        inputs.patternType || 'UNKNOWN'
      );

      // Step 2: Create action event
      const actionEvent = {
        eventId: `action-${decisionId}`,
        decisionId,
        correlationId,
        tenantId,
        action: actionMapping.action,
        tier: actionMapping.tier,
        confidence: confidence,
        confidenceLevel: actionMapping.confidenceLevel,
        severity,
        patternType: inputs.patternType || 'UNKNOWN',
        metadata: {
          recommended: recommendedAction,
          mapping: actionMapping,
          reasoning: reasoning.hypothesis || '',
          affectedServices: inputs.affectedServices || [],
          dryRunRequired: actionMapping.metadata?.dryRunRequired || false,
          reversible: actionMapping.metadata?.reversible || true,
          estimatedRecoveryMs: actionMapping.metadata?.estimatedRecoveryMs || 0
        },
        decisionInputs: inputs,
        timestamp: new Date().toISOString()
      };

      // Step 3: Publish to queue
      const queue = await getQueueService();
      await queue.publishEvent(
        queue.topics.DECISION_PROPOSED,
        actionEvent,
        { tenantId, correlationId }
      );

      console.log(`[DecisionExecutor] ✓ Published decision for execution`, {
        decisionId,
        action: actionMapping.action,
        tier: actionMapping.tier,
        confidence: (confidence * 100).toFixed(1) + '%'
      });

      return {
        success: true,
        eventId: actionEvent.eventId,
        action: actionMapping.action,
        tier: actionMapping.tier,
        confidence: confidence
      };

    } catch (error) {
      console.error('[DecisionExecutor] Error publishing decision:', error.message);
      throw error;
    }
  }

  /**
   * Record signal drop (when signal is filtered/rejected)
   * Important for observability - prevents silent failures
   */
  recordSignalDrop(tenantId, signal, reason, correlationId) {
    try {
      const dropEvent = {
        tenantId,
        correlationId,
        signal,
        droppedAt: new Date(),
        reason, // e.g. "confidence_threshold", "pattern_unrecognized", "temporary_unavailable"
        severity: signal.severity || 'MEDIUM'
      };

      // Log the drop
      console.warn('[DecisionExecutor] ⚠ Signal dropped', {
        reason,
        severity: signal.severity,
        correlation: correlationId.substring(0, 8) + '...'
      });

      // Increment metric
      this.metricsBlacklist.add(`${tenantId}:${reason}`);

      // Could publish to alerting if drops exceed threshold
      return dropEvent;

    } catch (error) {
      console.error('[DecisionExecutor] Error recording drop:', error);
    }
  }

  /**
   * Get drop statistics
   */
  getDropStatistics() {
    const stats = {};
    for (const key of this.metricsBlacklist) {
      const [tenantId, reason] = key.split(':');
      if (!stats[tenantId]) {
        stats[tenantId] = { total: 0, byReason: {} };
      }
      stats[tenantId].byReason[reason] = (stats[tenantId].byReason[reason] || 0) + 1;
      stats[tenantId].total++;
    }
    return stats;
  }
}

module.exports = new DecisionExecutionPublisher();
