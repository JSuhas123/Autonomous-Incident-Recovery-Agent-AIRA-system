/**
 * Input Validation Middleware
 * Validates all API inputs using Joi schemas
 * Prevents invalid data from reaching core decision logic
 */

const Joi = require('joi');

/**
 * Validation schemas for core API endpoints
 */
const schemas = {
  // Decision request
  makeDecision: Joi.object({
    signals: Joi.object({
      errorRate: Joi.number().min(0).max(100),
      responseTime: Joi.number().min(0),
      cpuUsage: Joi.number().min(0).max(100),
      memoryUsage: Joi.number().min(0).max(100),
      affectedServices: Joi.array().items(Joi.string()).max(100),
      custom: Joi.object().unknown(true),
    })
      .required()
      .unknown(false),
    
    severity: Joi.string()
      .valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
      .optional(),
    
    context: Joi.object({
      incidentId: Joi.string().optional(),
      timestamp: Joi.date().optional(),
      metadata: Joi.object().unknown(true).optional(),
    })
      .optional()
      .unknown(false),
  }).unknown(false),

  // Action execution request
  executeAction: Joi.object({
    actionId: Joi.string().required().max(256),
    action: Joi.string()
      .valid(
        'restart',
        'scale-replicas',
        'restart-pod',
        'clear-cache',
        'migrate-traffic',
        'fail-over',
        'alert-human'
      )
      .required(),
    
    parameters: Joi.object().unknown(true).required(),
    
    dryRun: Joi.boolean().optional().default(false),
    
    approvalRequired: Joi.boolean().optional().default(false),
  }).unknown(false),

  // Feedback submission
  submitFeedback: Joi.object({
    decisionId: Joi.string().required().max(256),
    successful: Joi.boolean().required(),
    outcome: Joi.string()
      .valid('resolved', 'worsened', 'no_change', 'inconclusive')
      .required(),
    
    recoveryTimeMs: Joi.number().min(0).optional(),
    
    notes: Joi.string().max(5000).optional(),
    
    solutionApplied: Joi.string().max(1000).optional(),
  }).unknown(false),

  // Policy update
  updatePolicy: Joi.object({
    policyYaml: Joi.string().required().max(100000),
    description: Joi.string().max(5000).optional(),
    createdBy: Joi.string().required().max(256),
  }).unknown(false),

  // Runbook execution
  executeRunbook: Joi.object({
    runbookId: Joi.string().required().max(256),
    parameters: Joi.object().unknown(true).optional(),
    dryRun: Joi.boolean().optional().default(false),
  }).unknown(false),

  // Configuration update
  updateConfig: Joi.object({
    enableFeedback: Joi.boolean().optional(),
    enableSimulation: Joi.boolean().optional(),
    enableCascadeDetection: Joi.boolean().optional(),
    rateLimits: Joi.object({
      decision: Joi.number().min(1).max(100000).optional(),
      action: Joi.number().min(1).max(100000).optional(),
      policy: Joi.number().min(1).max(100000).optional(),
    })
      .optional()
      .unknown(false),
  }).unknown(false),
};

/**
 * Validation middleware factory
 * @param {string} schemaName - Schema to validate against
 * @param {string} source - Where to validate (body, query, params)
 */
function validateInput(schemaName, source = 'body') {
  const schema = schemas[schemaName];

  if (!schema) {
    throw new Error(`Unknown validation schema: ${schemaName}`);
  }

  return (req, res, next) => {
    try {
      const data = req[source];

      if (!data && source === 'body') {
        return res.status(400).json({
          error: 'Request body is empty',
          code: 'EMPTY_BODY',
        });
      }

      const { error, value } = schema.validate(data, {
        abortEarly: false,
        stripUnknown: true, // Remove unknown fields
      });

      if (error) {
        const details = error.details.map((d) => ({
          field: d.path.join('.'),
          message: d.message,
          type: d.type,
        }));

        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details,
        });
      }

      // Replace original data with validated/stripped data
      req[source] = value;

      // Add metadata about validation
      req.validated = {
        schema: schemaName,
        source,
        cleanedData: true,
      };

      next();
    } catch (error) {
      console.error('[validation] Unexpected validation error:', error.message);
      res.status(500).json({
        error: 'Validation error',
        message: error.message,
      });
    }
  };
}

/**
 * Custom validators for common fields
 */
const validators = {
  /**
   * Validate tenant ID format
   */
  tenantId: (value) => {
    const valid = /^[a-zA-Z0-9_-]+$/.test(value);
    if (!valid) {
      throw new Error('Invalid tenant ID format');
    }
    return true;
  },

  /**
   * Validate correlation ID
   */
  correlationId: (value) => {
    const valid = /^[a-zA-Z0-9_-]{8,}$/.test(value);
    if (!valid) {
      throw new Error('Invalid correlation ID format');
    }
    return true;
  },

  /**
   * Validate signal object
   */
  signal: (signal) => {
    if (typeof signal !== 'object') {
      throw new Error('Signal must be an object');
    }

    // At least one metric required
    const hasMetric =
      signal.errorRate !== undefined ||
      signal.responseTime !== undefined ||
      signal.cpuUsage !== undefined ||
      signal.memoryUsage !== undefined;

    if (!hasMetric) {
      throw new Error('Signal must contain at least one metric');
    }

    return true;
  },
};

module.exports = {
  validateInput,
  schemas,
  validators,
};
