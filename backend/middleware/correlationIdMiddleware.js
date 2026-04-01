/**
 * Correlation ID Middleware
 * 
 * Propagates correlation IDs through entire request lifecycle
 * using async_hooks for proper context tracking
 * 
 * Features:
 * - Automatic correlation ID generation / extraction
 * - Propagation through async contexts
 * - Logging integration
 * - Distributed tracing support
 */

const { v4: uuidv4 } = require('uuid');
const { AsyncLocalStorage } = require('async_hooks');

// Create async local storage for correlation context
const correlationContext = new AsyncLocalStorage();

/**
 * Get current correlation ID from context
 */
function getCorrelationId() {
  const store = correlationContext.getStore();
  return store?.correlationId || 'unknown';
}

/**
 * Set correlation ID in context (for operation chains)
 */
function setCorrelationId(correlationId) {
  const store = correlationContext.getStore() || {};
  store.correlationId = correlationId;
  return correlationContext.run(store, () => correlationId);
}

/**
 * Run operation with correlation ID
 */
function runWithCorrelationId(correlationId, fn) {
  return correlationContext.run(
    { correlationId },
    fn
  );
}

/**
 * Express middleware for correlation ID handling
 */
function correlationIdMiddleware(req, res, next) {
  // Extract correlation ID from header or generate new one
  let correlationId =
    req.headers['x-correlation-id'] ||
    req.headers['x-request-id'] ||
    req.headers['x-trace-id'] ||
    uuidv4();

  // Store in context
  correlationContext.run({ correlationId }, () => {
    // Add to response headers for client tracking
    res.setHeader('X-Correlation-ID', correlationId);

    // Add to request object for handlers
    req.correlationId = correlationId;

    // Add lightweight logging wrapper
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      // Log response with correlation ID
      if (global.loggingService) {
        global.loggingService.logStructured({
          level: 'debug',
          message: 'Response sent',
          correlationId,
          path: req.path,
          method: req.method,
          statusCode: res.statusCode,
        });
      }
      return originalJson(data);
    };

    next();
  });
}

/**
 * Automatically propagate correlation ID through MongoDB operations
 */
function propagateThroughMongo(model, operationName, correlationId) {
  // Add metadata to query for tracing
  return {
    correlationId,
    operation: operationName,
    timestamp: new Date(),
  };
}

/**
 * Propagate through HTTP calls (axios interceptor)
 */
function axiosInterceptor(correlationId) {
  return {
    request(config) {
      config.headers['X-Correlation-ID'] = correlationId;
      return config;
    },
    response(response) {
      // Extract correlation ID from response if available
      const responseCorrelationId =
        response.headers['x-correlation-id'] ||
        response.headers['x-request-id'];
      if (responseCorrelationId) {
        setCorrelationId(responseCorrelationId);
      }
      return response;
    },
    error(error) {
      // Preserve correlation ID in error
      error.correlationId = correlationId;
      throw error;
    },
  };
}

/**
 * Wrap async function to maintain correlation context
 */
function wrapAsync(fn, correlationId) {
  return async function (...args) {
    return new Promise((resolve, reject) => {
      correlationContext.run({ correlationId }, async () => {
        try {
          const result = await fn(...args);
          resolve(result);
        } catch (error) {
          error.correlationId = correlationId;
          reject(error);
        }
      });
    });
  };
}

/**
 * Trace operation execution
 */
function traceOperation(operationName, correlationId, metadata = {}) {
  return {
    started: Date.now(),
    operationName,
    correlationId,
    metadata,
    end() {
      const duration = Date.now() - this.started;
      if (global.loggingService) {
        global.loggingService.logStructured({
          level: 'debug',
          message: `Operation completed: ${operationName}`,
          correlationId,
          duration,
          ...metadata,
        });
      }
      return duration;
    },
  };
}

module.exports = {
  correlationIdMiddleware,
  getCorrelationId,
  setCorrelationId,
  runWithCorrelationId,
  propagateThroughMongo,
  axiosInterceptor,
  wrapAsync,
  traceOperation,
};
