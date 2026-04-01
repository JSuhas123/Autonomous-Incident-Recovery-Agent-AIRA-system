/**
 * Structured Logging Helper
 * Ensures all logs include critical context for debugging:
 * - correlationId: trace requests across agents
 * - tenantId: filter logs by tenant
 * - policyVersionId: link logs to policy decisions
 * - component: which service/agent is logging
 */

class StructuredLogger {
  constructor() {
    this.contextStack = new Map(); // Map<correlationId -> context>
  }

  /**
   * Set context for current request
   */
  setContext(correlationId, context = {}) {
    this.contextStack.set(correlationId, {
      correlationId,
      tenantId: context.tenantId,
      policyVersionId: context.policyVersionId,
      decisionId: context.decisionId,
      timestamp: new Date().toISOString(),
      ...context,
    });
  }

  /**
   * Get context for current request
   */
  getContext(correlationId) {
    return this.contextStack.get(correlationId) || { correlationId };
  }

  /**
   * Clear context when done
   */
  clearContext(correlationId) {
    this.contextStack.delete(correlationId);
  }

  /**
   * Log with automatic context injection
   */
  log(level, message, correlationId, additionalData = {}) {
    const context = this.getContext(correlationId);
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId: context.correlationId,
      tenantId: context.tenantId,
      policyVersionId: context.policyVersionId,
      decisionId: context.decisionId,
      ...additionalData,
    };

    // Output as JSON for structured log parsing
    if (level === 'ERROR' || level === 'CRITICAL') {
      console.error(JSON.stringify(logEntry));
    } else if (level === 'WARN') {
      console.warn(JSON.stringify(logEntry));
    } else {
      console.log(JSON.stringify(logEntry));
    }

    return logEntry;
  }

  /**
   * Helper methods for common log levels
   */
  info(message, correlationId, data) {
    return this.log('INFO', message, correlationId, data);
  }

  warn(message, correlationId, data) {
    return this.log('WARN', message, correlationId, data);
  }

  error(message, correlationId, data) {
    return this.log('ERROR', message, correlationId, data);
  }

  critical(message, correlationId, data) {
    return this.log('CRITICAL', message, correlationId, data);
  }

  /**
   * Log decision trace with full context
   */
  decision(correlationId, decisionData) {
    const context = this.getContext(correlationId);
    return this.log('DECISION', 'Decision executed', correlationId, {
      decisionId: decisionData.decisionId,
      action: decisionData.action,
      confidence: decisionData.confidence,
      policyVersionId: decisionData.policyVersionId,
      verdict: decisionData.verdict,
    });
  }

  /**
   * Log policy evaluation with version tracking
   */
  policyEvaluation(correlationId, policyData) {
    return this.log('POLICY', 'Policy evaluated', correlationId, {
      policyVersionId: policyData.policyVersionId,
      verdict: policyData.verdict,
      rulesApplied: policyData.rulesApplied?.length || 0,
    });
  }
}

// Export both the singleton instance and the class
const singleton = new StructuredLogger();
module.exports = singleton;
module.exports.StructuredLogger = StructuredLogger;
