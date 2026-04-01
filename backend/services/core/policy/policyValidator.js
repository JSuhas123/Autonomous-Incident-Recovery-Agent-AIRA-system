/**
 * Policy Schema Validator
 * Validates policy YAML/JSON against schema before loading
 * Uses Joi for comprehensive schema validation
 */

const Joi = require('joi');

// Define the policy schema using Joi
const policySchema = Joi.object({
  version: Joi.string().required().description('Policy version'),
  tenantId: Joi.string().required().description('Tenant identifier'),
  effectiveFrom: Joi.date().required().description('When policy becomes effective'),
  effectiveTo: Joi.date().optional().description('When policy expires'),
  description: Joi.string().optional().description('Policy description'),
  
  // Rules section
  rules: Joi.array()
    .items(
      Joi.object({
        id: Joi.string().required().description('Unique rule ID'),
        description: Joi.string().required().description('Rule description'),
        actions: Joi.array().items(Joi.string()).required(),
        
        // Conditions
        allowedIf: Joi.array()
          .items(
            Joi.object({
              severity: Joi.array().items(Joi.string()).optional(),
              confidence: Joi.object({
                min: Joi.number().min(0).max(1).optional(),
                max: Joi.number().min(0).max(1).optional(),
              }).optional(),
              pattern: Joi.string().optional(),
              incidentCount: Joi.object({
                min: Joi.number().min(0).optional(),
                max: Joi.number().min(0).optional(),
              }).optional(),
            })
          )
          .required(),
        
        // Approval requirements
        requiresApproval: Joi.boolean().optional().default(false),
        approvers: Joi.array().items(Joi.string()).optional(),
        
        // Denial reason
        denialReason: Joi.string().required()
          .description('Why this action is denied if conditions not met'),
      })
    )
    .required(),
  
  // Action configurations
  actions: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().required(),
        description: Joi.string().required(),
        riskLevel: Joi.string().valid('low', 'medium', 'high', 'critical').required(),
        reversible: Joi.boolean().optional().default(false),
        dryRunAvailable: Joi.boolean().optional().default(false),
        maxBlastRadius: Joi.number().min(0).max(100).optional(),
        timeout_ms: Joi.number().min(1000).optional(),
        
        // Action-specific configs
        parameters: Joi.object()
          .pattern(Joi.string(), Joi.any())
          .optional(),
      })
    )
    .optional(),
  
  // Safety gates
  safetyGates: Joi.object({
    requireConfidence: Joi.number().min(0).max(1).optional(),
    preventConcurrentActions: Joi.boolean().optional().default(true),
    maxActionsPerIncident: Joi.number().min(1).optional(),
    cooldownBetweenActions_ms: Joi.number().min(0).optional(),
  }).optional(),
  
  // Monitoring and alerts
  monitoring: Joi.object({
    trackMetrics: Joi.boolean().optional().default(true),
    alertOnFailure: Joi.boolean().optional().default(true),
    alertChannels: Joi.array().items(Joi.string()).optional(),
  }).optional(),
}).unknown(true); // Allow additional fields for extensibility

/**
 * Validate policy against schema
 */
function validatePolicy(policy) {
  const { error, value, warning } = policySchema.validate(policy, {
    abortEarly: false,
    stripUnknown: false,
    warnings: true,
  });

  if (error) {
    return {
      valid: false,
      errors: error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type,
      })),
      value: null,
    };
  }

  return {
    valid: true,
    errors: [],
    warnings: warning ? warning.details.map(w => w.message) : [],
    value,
  };
}

/**
 * Get specific validation for a policy action
 */
function validatePolicyAction(action, policy) {
  const actionConfig = policy.actions?.find(a => a.name === action);
  
  if (!actionConfig) {
    return {
      valid: false,
      error: `Action '${action}' not defined in policy`,
    };
  }

  // Check risk level
  const riskLevels = { low: 0, medium: 1, high: 2, critical: 3 };
  const riskScore = riskLevels[actionConfig.riskLevel] || 0;

  // Check if requires approval
  const requiresApproval = policy.rules
    .filter(r => r.actions.includes(action))
    .some(r => r.requiresApproval);

  return {
    valid: true,
    actionConfig,
    requiresApproval,
    riskScore,
  };
}

/**
 * Check if an action is allowed under given conditions
 */
function checkActionAllowed(action, conditions, policy) {
  const relevantRules = policy.rules.filter(r => 
    r.actions.includes(action)
  );

  if (relevantRules.length === 0) {
    return {
      allowed: false,
      reason: `No rules defined for action '${action}'`,
    };
  }

  for (const rule of relevantRules) {
    let ruleMatches = true;

    // Check all conditions
    for (const allowedCondition of rule.allowedIf) {
      // Check severity
      if (allowedCondition.severity && !allowedCondition.severity.includes(conditions.severity)) {
        ruleMatches = false;
        break;
      }

      // Check confidence
      if (allowedCondition.confidence) {
        const { min, max } = allowedCondition.confidence;
        if (min && conditions.confidence < min) {
          ruleMatches = false;
          break;
        }
        if (max && conditions.confidence > max) {
          ruleMatches = false;
          break;
        }
      }

      // Check pattern match
      if (allowedCondition.pattern && !conditions.pattern?.includes(allowedCondition.pattern)) {
        ruleMatches = false;
        break;
      }

      // Check incident count
      if (allowedCondition.incidentCount) {
        const { min, max } = allowedCondition.incidentCount;
        if (min && conditions.incidentCount < min) {
          ruleMatches = false;
          break;
        }
        if (max && conditions.incidentCount > max) {
          ruleMatches = false;
          break;
        }
      }
    }

    if (ruleMatches) {
      return {
        allowed: true,
        rule: rule.id,
        requiresApproval: rule.requiresApproval,
        approvers: rule.approvers || [],
      };
    }
  }

  // No matching rule found
  const denyingRule = relevantRules[0];
  return {
    allowed: false,
    reason: denyingRule.denialReason,
    rule: denyingRule.id,
  };
}

/**
 * Calculate policy effectiveness score
 * Based on success rate and incident resolution time
 */
function calculatePolicyEffectiveness(policyVersion, outcomes) {
  if (outcomes.length === 0) {
    return {
      score: 0,
      successRate: 0,
      averageResolutionTimeMs: 0,
      sampleSize: 0,
    };
  }

  const successful = outcomes.filter(o => o.success).length;
  const successRate = successful / outcomes.length;

  const avgResolutionTime = outcomes.reduce((sum, o) => 
    sum + (o.resolutionTimeMs || 0), 0
  ) / outcomes.length;

  // Effectiveness score: 0-100
  // 70% of score from success rate, 30% from quick resolution
  const successScore = successRate * 70;
  const speedScore = Math.max(0, 30 - (avgResolutionTime / 1000)); // Penalize slow resolutions

  const score = Math.round(successScore + speedScore);

  return {
    score: Math.max(0, Math.min(100, score)),
    successRate: parseFloat((successRate * 100).toFixed(2)),
    averageResolutionTimeMs: Math.round(avgResolutionTime),
    sampleSize: outcomes.length,
  };
}

module.exports = {
  validatePolicy,
  validatePolicyAction,
  checkActionAllowed,
  calculatePolicyEffectiveness,
  policySchema,
};
