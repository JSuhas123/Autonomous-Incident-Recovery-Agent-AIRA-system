/**
 * PHASE 2: OBSERVABILITY INFRASTRUCTURE
 * 
 * Structured JSON logging with correlation IDs, structured fields, and easy parsing.
 * All logs follow standard format for ELK, Datadog, CloudWatch integration.
 * 
 * Format:
 * {
 *   "timestamp": "2026-03-31T14:23:45.123Z",
 *   "level": "info|warn|error|debug",
 *   "service": "decision-agent",
 *   "tenantId": "tenant-123",
 *   "correlationId": "corr-uuid",
 *   "incidentId": "incident-uuid",
 *   "decisionId": "decision-uuid",
 *   "actionId": "action-uuid",
 *   "message": "Human readable message",
 *   "context": { ...structured fields... },
 *   "stackTrace": "if error",
 * }
 */

const winston = require('winston');
const path = require('path');

/**
 * Structured JSON logging sink
 * Outputs logs in parseable format for log aggregation services
 */
class StructuredLoggingService {
  constructor(serviceName = 'decision-engine') {
    this.serviceName = serviceName;

    // Create winston logger with JSON formatting
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(this._formatLog.bind(this))
      ),
      defaultMeta: { service: serviceName, environment: process.env.NODE_ENV || 'development' },
      transports: [
        // Console output - always log to console
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
        }),

        // File output - JSON format for parsing
        new winston.transports.File({
          filename: path.join(__dirname, '../../logs/error.log'),
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),

        new winston.transports.File({
          filename: path.join(__dirname, '../../logs/combined.log'),
          maxsize: 5242880, // 5MB
          maxFiles: 10,
        }),
      ],
    });
  }

  /**
   * Format log entry as structured JSON
   */
  _formatLog(info) {
    const entry = {
      timestamp: info.timestamp,
      level: info.level,
      service: this.serviceName,
      message: info.message,
      ...info.context, // Spread context fields
    };

    if (info.stack) {
      entry.stackTrace = info.stack;
    }

    return JSON.stringify(entry);
  }

  /**
   * Log with full context
   */
  log(level, message, context = {}) {
    this.logger.log({
      level,
      message,
      context: {
        ...context,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Log decision made
   */
  logDecision(tenantId, decisionId, action, confidence, tier, context = {}) {
    this.log('info', 'Decision made', {
      tenantId,
      decisionId,
      action,
      confidence: parseFloat(confidence).toFixed(2),
      tier,
      ...context,
    });
  }

  /**
   * Log action execution
   */
  logActionExecution(tenantId, actionId, decisionId, action, result, context = {}) {
    this.log(result === 'SUCCESS' ? 'info' : 'warn', `Action ${result}`, {
      tenantId,
      actionId,
      decisionId,
      action,
      result,
      ...context,
    });
  }

  /**
   * Log security event
   */
  logSecurityEvent(tenantId, eventType, message, context = {}) {
    this.log('warn', `Security: ${eventType}`, {
      tenantId,
      eventType,
      message,
      ...context,
    });
  }

  /**
   * Log error with full context
   */
  logError(message, error, context = {}) {
    this.log('error', message, {
      error: error?.message,
      stack: error?.stack,
      ...context,
    });
  }

  /**
   * Log performance metric
   */
  logPerformance(component, operation, durationMs, context = {}) {
    const level = durationMs > 1000 ? 'warn' : 'debug';
    this.log(level, `Performance: ${component}/${operation}`, {
      component,
      operation,
      durationMs,
      level: durationMs > 1000 ? 'slow' : 'normal',
      ...context,
    });
  }
}

// Singleton instance
let structuredLoggingService = null;

function getStructuredLoggingService(serviceName = 'decision-engine') {
  if (!structuredLoggingService) {
    structuredLoggingService = new StructuredLoggingService(serviceName);
  }
  return structuredLoggingService;
}

module.exports = {
  StructuredLoggingService,
  getStructuredLoggingService,
};
