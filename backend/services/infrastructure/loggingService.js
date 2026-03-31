/**
 * Structured Logging Service
 * Provides JSON structured logging with correlation ID propagation
 * 
 * All logs include:
 * - timestamp
 * - correlationId (for request tracing)
 * - tenantId (for multi-tenant isolation)
 * - component (which service logged)
 * - level (INFO, WARN, ERROR)
 * - message
 * - context (additional data)
 */

const winston = require('winston');
const path = require('path');

class LoggingService {
  constructor() {
    // Create logs directory if it doesn't exist
    const logsDir = path.join(__dirname, '../../logs');
    const fs = require('fs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Custom format for structured logging
    const customFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.printf(({ timestamp, level, message, correlationId, tenantId, component, ...meta }) => {
        // Build the log entry
        const entry = {
          timestamp,
          level: level.toUpperCase(),
          correlationId,
          tenantId,
          component,
          message,
        };

        // Add any additional context
        if (Object.keys(meta).length > 0) {
          entry.context = meta;
        }

        return JSON.stringify(entry);
      })
    );

    // Create the logger
    this.logger = winston.createLogger({
      format: customFormat,
      defaultMeta: { component: 'decision-engine' },
      transports: [
        // Console output
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
        }),
        // All logs to file
        new winston.transports.File({
          filename: path.join(logsDir, 'combined.log'),
          maxsize: 5242880, // 5MB
          maxFiles: 10,
        }),
        // Error logs to separate file
        new winston.transports.File({
          filename: path.join(logsDir, 'error.log'),
          level: 'error',
          maxsize: 5242880,
          maxFiles: 10,
        }),
      ],
    });
  }

  /**
   * Log with context
   */
  log(level, message, context = {}) {
    const { correlationId = 'N/A', tenantId = 'default', component = 'decision-engine', ...meta } = context;

    this.logger.log(level, message, {
      correlationId,
      tenantId,
      component,
      ...meta,
    });
  }

  /**
   * Log info level
   */
  info(message, context = {}) {
    this.log('info', message, context);
  }

  /**
   * Log warn level
   */
  warn(message, context = {}) {
    this.log('warn', message, context);
  }

  /**
   * Log error level
   */
  error(message, context = {}) {
    this.log('error', message, context);
  }

  /**
   * Log debug level
   */
  debug(message, context = {}) {
    this.log('debug', message, context);
  }

  /**
   * Log with decision context
   */
  logDecision(decisionId, message, context = {}) {
    this.info(message, {
      component: 'decision-engine',
      decisionId,
      ...context,
    });
  }

  /**
   * Log action execution
   */
  logAction(actionId, message, context = {}) {
    this.info(message, {
      component: 'action-executor',
      actionId,
      ...context,
    });
  }

  /**
   * Log policy evaluation
   */
  logPolicy(policyVersion, message, context = {}) {
    this.info(message, {
      component: 'policy-engine',
      policyVersion,
      ...context,
    });
  }

  /**
   * Log queue event
   */
  logQueue(eventId, message, context = {}) {
    this.info(message, {
      component: 'queue-service',
      eventId,
      ...context,
    });
  }

  /**
   * Create a scoped logger for a component
   */
  createComponentLogger(component) {
    return {
      info: (message, context = {}) =>
        this.info(message, { component, ...context }),
      warn: (message, context = {}) =>
        this.warn(message, { component, ...context }),
      error: (message, context = {}) =>
        this.error(message, { component, ...context }),
      debug: (message, context = {}) =>
        this.debug(message, { component, ...context }),
    };
  }
}

module.exports = new LoggingService();
