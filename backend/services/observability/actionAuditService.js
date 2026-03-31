/**
 * PHASE 2: ACTION AUDIT TRAIL SERVICE
 * 
 * Records immutable audit log of all decisions and actions:
 * - What action was executed
 * - Who/what triggered it (decision ID, policy, etc)
 * - When it was executed
 * - The result (success/failure)
 * - Any side effects or errors
 * 
 * Audit trail is:
 * - Queryable for compliance/debugging
 * - Immutable (append-only)
 * - Tenant-isolated
 * - Timestamped with correlation IDs
 */

const AuditEvent = require('../../models/AuditEvent');
const { getStructuredLoggingService } = require('./structuredLoggingService');

class ActionAuditService {
  constructor() {
    this.loggingService = getStructuredLoggingService('audit-service');
  }

  /**
   * Record a decision made by the system
   */
  async recordDecision(tenantId, {
    decisionId,
    correlationId,
    incidentId,
    severityLevel,
    patternDetected,
    confidence,
    recommendedAction,
    tier,
    policiesApplied,
    context = {},
  }) {
    try {
      const audit = new AuditEvent({
        tenantId,
        eventType: 'DECISION_MADE',
        eventId: decisionId,
        correlationId,
        incidentId,
        timestamp: new Date(),
        actor: 'system',
        severity: severityLevel,
        action: recommendedAction,
        decisionDetails: {
          confidence: parseFloat(confidence).toFixed(2),
          tier,
          patternDetected,
          policiesApplied,
        },
        result: 'SUCCESS',
        context,
      });

      await audit.save();

      this.loggingService.logDecision(tenantId, decisionId, recommendedAction, confidence, tier, {
        correlationId,
        incidentId,
        patternDetected,
        policiesApplied,
      });
    } catch (error) {
      this.loggingService.logError('Failed to record decision in audit trail', error, {
        tenantId,
        decisionId,
      });
    }
  }

  /**
   * Record an action execution
   */
  async recordActionExecution(tenantId, {
    actionId,
    decisionId,
    correlationId,
    incidentId,
    action,
    parameters,
    durationMs,
    result,
    output,
    errorMessage,
    context = {},
  }) {
    try {
      const audit = new AuditEvent({
        tenantId,
        eventType: 'ACTION_EXECUTED',
        eventId: actionId,
        correlationId,
        decisionId,
        incidentId,
        timestamp: new Date(),
        actor: 'system',
        action,
        actionDetails: {
          parameters: this._sanitizeParameters(parameters),
          durationMs,
          output: output ? output.substring(0, 1000) : null, // Limit output size
          errorMessage: errorMessage ? errorMessage.substring(0, 500) : null,
        },
        result: result === 'SUCCESS' ? 'SUCCESS' : 'FAILURE',
        context: {
          ...context,
          httpStatusCode: output?.statusCode,
        },
      });

      await audit.save();

      this.loggingService.logActionExecution(tenantId, actionId, decisionId, action, result, {
        correlationId,
        incidentId,
        durationMs,
        errorMessage,
      });
    } catch (error) {
      this.loggingService.logError('Failed to record action execution in audit trail', error, {
        tenantId,
        actionId,
        decisionId,
      });
    }
  }

  /**
   * Record action approval
   */
  async recordActionApproval(tenantId, {
    decisionId,
    actionId,
    correlationId,
    incidentId,
    approver,
    approvalTime,
    comment,
    context = {},
  }) {
    try {
      const audit = new AuditEvent({
        tenantId,
        eventType: 'ACTION_APPROVED',
        eventId: actionId,
        correlationId,
        decisionId,
        incidentId,
        timestamp: new Date(),
        actor: approver,
        action: 'APPROVE',
        actionDetails: {
          approvalTime,
          comment,
        },
        result: 'SUCCESS',
        context,
      });

      await audit.save();

      this.loggingService.log('info', 'Action approved', {
        tenantId,
        decisionId,
        actionId,
        approver,
        comment,
      });
    } catch (error) {
      this.loggingService.logError('Failed to record action approval', error, {
        tenantId,
        actionId,
      });
    }
  }

  /**
   * Record action rejection
   */
  async recordActionRejection(tenantId, {
    decisionId,
    actionId,
    correlationId,
    incidentId,
    reviewer,
    reason,
    context = {},
  }) {
    try {
      const audit = new AuditEvent({
        tenantId,
        eventType: 'ACTION_REJECTED',
        eventId: actionId,
        correlationId,
        decisionId,
        incidentId,
        timestamp: new Date(),
        actor: reviewer,
        action: 'REJECT',
        actionDetails: {
          reason,
        },
        result: 'REJECTED',
        context,
      });

      await audit.save();

      this.loggingService.log('warn', 'Action rejected', {
        tenantId,
        decisionId,
        actionId,
        reviewer,
        reason,
      });
    } catch (error) {
      this.loggingService.logError('Failed to record action rejection', error, {
        tenantId,
        actionId,
      });
    }
  }

  /**
   * Record security event
   */
  async recordSecurityEvent(tenantId, {
    eventType, // XSS_DETECTED, AUTH_FAILED, RATE_LIMIT_EXCEEDED, etc
    correlationId,
    severity = 'WARN',
    message,
    details,
    actor = 'unknown',
    context = {},
  }) {
    try {
      const audit = new AuditEvent({
        tenantId,
        eventType: `SECURITY_${eventType}`,
        correlationId,
        timestamp: new Date(),
        actor,
        severity,
        action: eventType,
        actionDetails: details || {},
        result: 'LOGGED',
        context,
      });

      await audit.save();

      this.loggingService.logSecurityEvent(tenantId, eventType, message, {
        correlationId,
        severity,
        details,
      });
    } catch (error) {
      this.loggingService.logError('Failed to record security event', error, {
        tenantId,
        eventType,
      });
    }
  }

  /**
   * Record system error
   */
  async recordSystemError(tenantId, {
    correlationId,
    errorType,
    errorMessage,
    component,
    stackTrace,
    context = {},
  }) {
    try {
      const audit = new AuditEvent({
        tenantId,
        eventType: `ERROR_${errorType}`,
        correlationId,
        timestamp: new Date(),
        actor: 'system',
        severity: 'ERROR',
        action: errorType,
        actionDetails: {
          component,
          errorMessage,
          stackTrace: stackTrace ? stackTrace.substring(0, 1000) : null,
        },
        result: 'FAILED',
        context,
      });

      await audit.save();

      this.loggingService.logError(
        `System error: ${errorType}`,
        new Error(errorMessage),
        {
          correlationId,
          component,
        }
      );
    } catch (error) {
      this.loggingService.logError('Failed to record system error', error, {
        tenantId,
        errorType,
      });
    }
  }

  /**
   * Query audit trail
   */
  async queryAuditTrail(tenantId, filters = {}) {
    try {
      const query = { tenantId };

      if (filters.eventType) query.eventType = filters.eventType;
      if (filters.startTime) query.timestamp = { $gte: filters.startTime };
      if (filters.endTime) {
        query.timestamp = { ...query.timestamp, $lte: filters.endTime };
      }
      if (filters.actor) query.actor = filters.actor;
      if (filters.severity) query.severity = filters.severity;

      const limit = Math.min(filters.limit || 100, 1000); // Max 1000 results
      const skip = (filters.page || 0) * limit;

      const events = await AuditEvent.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      const total = await AuditEvent.countDocuments(query).exec();

      return {
        total,
        page: filters.page || 0,
        pageSize: limit,
        events,
      };
    } catch (error) {
      this.loggingService.logError('Failed to query audit trail', error, {
        tenantId,
        filters,
      });
      throw error;
    }
  }

  /**
   * Get audit summary (for dashboards)
   */
  async getAuditSummary(tenantId, timeWindowHours = 24) {
    try {
      const startTime = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);

      const events = await AuditEvent.find({
        tenantId,
        timestamp: { $gte: startTime },
      }).exec();

      const summary = {
        totalEvents: events.length,
        byType: {},
        byResult: {},
        byActor: {},
        byEventType: {},
      };

      for (const event of events) {
        summary.byType[event.eventType] = (summary.byType[event.eventType] || 0) + 1;
        summary.byResult[event.result] = (summary.byResult[event.result] || 0) + 1;
        summary.byActor[event.actor] = (summary.byActor[event.actor] || 0) + 1;
      }

      return summary;
    } catch (error) {
      this.loggingService.logError('Failed to get audit summary', error, {
        tenantId,
      });
      throw error;
    }
  }

  /**
   * Sanitize sensitive parameters
   */
  _sanitizeParameters(params) {
    if (!params || typeof params !== 'object') {
      return params;
    }

    const sanitized = { ...params };

    // Remove sensitive fields
    const sensitiveFields = ['password', 'apiKey', 'secret', 'token', 'credential'];
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
    }

    return sanitized;
  }
}

// Singleton instance
let actionAuditService = null;

function getActionAuditService() {
  if (!actionAuditService) {
    actionAuditService = new ActionAuditService();
  }
  return actionAuditService;
}

module.exports = {
  ActionAuditService,
  getActionAuditService,
};
