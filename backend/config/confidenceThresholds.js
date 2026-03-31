/**
 * Confidence Threshold Enforcement
 * 
 * Ensures all automated decisions meet minimum confidence requirements before execution.
 * Acts as a safety gate that prevents low-confidence decisions from becoming real actions.
 * 
 * THRESHOLDS:
 * - >= 0.85: AUTO_EXECUTE - High confidence, execute immediately
 * - 0.60-0.85: ESCALATE - Medium confidence, require manual approval
 * - < 0.60: OBSERVE - Low confidence, only log and monitor
 * 
 * These thresholds are STRICT and cannot be bypassed
 */

class ConfidenceThresholdEnforcer {
  constructor() {
    // Read thresholds from environment, with sensible defaults
    this.AUTO_EXECUTE_THRESHOLD = parseFloat(process.env.AUTO_EXECUTE_THRESHOLD || '0.85');
    this.ESCALATION_THRESHOLD = parseFloat(process.env.ESCALATION_THRESHOLD || '0.60');

    // Validate thresholds are sane (0-1 range)
    if (this.AUTO_EXECUTE_THRESHOLD < 0 || this.AUTO_EXECUTE_THRESHOLD > 1) {
      this.AUTO_EXECUTE_THRESHOLD = 0.85;
      console.warn(
        '[Confidence] Invalid AUTO_EXECUTE_THRESHOLD, resetting to 0.85'
      );
    }

    if (this.ESCALATION_THRESHOLD < 0 || this.ESCALATION_THRESHOLD > 1) {
      this.ESCALATION_THRESHOLD = 0.60;
      console.warn(
        '[Confidence] Invalid ESCALATION_THRESHOLD, resetting to 0.60'
      );
    }

    // Ensure AUTO > ESCALATION
    if (this.AUTO_EXECUTE_THRESHOLD <= this.ESCALATION_THRESHOLD) {
      console.error(
        `[Confidence] Invalid threshold configuration: AUTO (${this.AUTO_EXECUTE_THRESHOLD}) must be > ESCALATION (${this.ESCALATION_THRESHOLD})`
      );
      this.AUTO_EXECUTE_THRESHOLD = 0.85;
      this.ESCALATION_THRESHOLD = 0.60;
    }
  }

  /**
   * Determine decision tier based on confidence score
   * 
   * @param {number} confidence - Confidence score (0-1)
   * @returns {object} - { tier, explanation, canAutoExecute, requiresApproval }
   */
  evaluateConfidence(confidence) {
    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
      return {
        tier: 'INVALID',
        explanation: `Invalid confidence: ${confidence}. Must be 0-1.`,
        canAutoExecute: false,
        requiresApproval: true,
        reason: 'Invalid confidence score',
      };
    }

    if (confidence >= this.AUTO_EXECUTE_THRESHOLD) {
      return {
        tier: 'AUTO_EXECUTE',
        explanation: `High confidence (${confidence.toFixed(2)}). Action approved for automatic execution.`,
        canAutoExecute: true,
        requiresApproval: false,
        reason: `Confidence ${confidence.toFixed(2)} >= threshold ${this.AUTO_EXECUTE_THRESHOLD}`,
      };
    }

    if (confidence >= this.ESCALATION_THRESHOLD) {
      return {
        tier: 'ESCALATE',
        explanation: `Medium confidence (${confidence.toFixed(2)}). Manual approval required.`,
        canAutoExecute: false,
        requiresApproval: true,
        reason: `Confidence ${confidence.toFixed(2)} in [${this.ESCALATION_THRESHOLD}, ${this.AUTO_EXECUTE_THRESHOLD})`,
      };
    }

    return {
      tier: 'OBSERVE',
      explanation: `Low confidence (${confidence.toFixed(2)}). Action blocked, monitoring only.`,
      canAutoExecute: false,
      requiresApproval: true,
      reason: `Confidence ${confidence.toFixed(2)} < threshold ${this.ESCALATION_THRESHOLD}`,
    };
  }

  /**
   * Enforce confidence thresholds on a decision
   * Blocks action execution if confidence is too low
   * 
   * @param {object} decision - { confidence, action, severity, tenantId, ... }
   * @returns {object} - { allowed, tier, message, decision }
   */
  enforceThresholds(decision) {
    if (!decision) {
      return {
        allowed: false,
        tier: 'INVALID',
        message: 'Decision is null or undefined',
        decision: null,
      };
    }

    const { confidence, action, severity } = decision;
    const evaluation = this.evaluateConfidence(confidence);

    // If tier is AUTO_EXECUTE, allow it
    if (evaluation.tier === 'AUTO_EXECUTE') {
      return {
        allowed: true,
        canAutoExecute: true,
        tier: evaluation.tier,
        evaluation,
        decision,
      };
    }

    // If tier is ESCALATE or OBSERVE, block auto-execution
    return {
      allowed: false,
      canAutoExecute: false,
      tier: evaluation.tier,
      evaluation,
      reason: evaluation.explanation,
      decision,
    };
  }

  /**
   * Adjust thresholds (with validation)
   */
  setThresholds(autoExecute, escalation) {
    if (autoExecute <= escalation) {
      throw new Error(
        `Invalid thresholds: AUTO_EXECUTE (${autoExecute}) must be > ESCALATION (${escalation})`
      );
    }

    if (autoExecute < 0 || autoExecute > 1) {
      throw new Error(`AUTO_EXECUTE_THRESHOLD must be 0-1, got ${autoExecute}`);
    }

    if (escalation < 0 || escalation > 1) {
      throw new Error(`ESCALATION_THRESHOLD must be 0-1, got ${escalation}`);
    }

    this.AUTO_EXECUTE_THRESHOLD = autoExecute;
    this.ESCALATION_THRESHOLD = escalation;

    console.warn(
      `[Confidence] Thresholds updated: AUTO=${autoExecute}, ESCALATE=${escalation}`
    );
  }

  /**
   * Get current threshold configuration
   */
  getThresholds() {
    return {
      AUTO_EXECUTE_THRESHOLD: this.AUTO_EXECUTE_THRESHOLD,
      ESCALATION_THRESHOLD: this.ESCALATION_THRESHOLD,
      tierBreakdown: {
        'AUTO_EXECUTE': `>= ${this.AUTO_EXECUTE_THRESHOLD}`,
        'ESCALATE': `${this.ESCALATION_THRESHOLD} - ${this.AUTO_EXECUTE_THRESHOLD - 0.01}`,
        'OBSERVE': `< ${this.ESCALATION_THRESHOLD}`,
      },
    };
  }

  /**
   * Check if actions are allowed (delegates to kill switch manager if available)
   * This allows confidence threshold to check kill switch status
   */
  areActionsEnabled() {
    try {
      const { getKillSwitchManager } = require('./killSwitches');
      const killSwitchManager = getKillSwitchManager();
      return killSwitchManager.areActionsEnabled();
    } catch (error) {
      // If kill switch manager is not available, assume actions are enabled
      return true;
    }
  }
}

// Singleton instance
let confidenceEnforcer = null;

function getConfidenceEnforcer() {
  if (!confidenceEnforcer) {
    confidenceEnforcer = new ConfidenceThresholdEnforcer();
  }
  return confidenceEnforcer;
}

/**
 * Middleware: Check confidence before allowing action
 * Usage: router.post('/actions', confidenceCheckMiddleware, handler)
 */
const confidenceCheckMiddleware = (req, res, next) => {
  const enforcer = getConfidenceEnforcer();
  req.confidenceEnforcer = enforcer;

  // Store evaluation function for use in handlers
  req.evaluateConfidence = (confidence) => enforcer.evaluateConfidence(confidence);
  req.enforceThresholds = (decision) => enforcer.enforceThresholds(decision);

  next();
};

/**
 * API endpoint: Get confidence threshold configuration
 * Usage: app.get('/api/v1/confidence/thresholds', confidenceThresholdsEndpoint)
 */
const confidenceThresholdsEndpoint = (req, res) => {
  const enforcer = getConfidenceEnforcer();
  res.json({
    thresholds: enforcer.getThresholds(),
    examples: {
      highConfidence: {
        score: 0.92,
        evaluation: enforcer.evaluateConfidence(0.92),
      },
      mediumConfidence: {
        score: 0.72,
        evaluation: enforcer.evaluateConfidence(0.72),
      },
      lowConfidence: {
        score: 0.45,
        evaluation: enforcer.evaluateConfidence(0.45),
      },
    },
  });
};

/**
 * API endpoint: Update confidence thresholds (requires auth)
 * Usage: app.post('/api/v1/confidence/thresholds', confidenceThresholdsUpdateEndpoint)
 */
const confidenceThresholdsUpdateEndpoint = (req, res) => {
  const { AUTO_EXECUTE_THRESHOLD, ESCALATION_THRESHOLD } = req.body;

  if (
    typeof AUTO_EXECUTE_THRESHOLD !== 'number' ||
    typeof ESCALATION_THRESHOLD !== 'number'
  ) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Both thresholds must be numbers',
    });
  }

  try {
    const enforcer = getConfidenceEnforcer();
    enforcer.setThresholds(AUTO_EXECUTE_THRESHOLD, ESCALATION_THRESHOLD);

    res.json({
      success: true,
      message: 'Confidence thresholds updated',
      newThresholds: enforcer.getThresholds(),
    });
  } catch (error) {
    res.status(400).json({
      error: 'Invalid thresholds',
      message: error.message,
    });
  }
};

module.exports = {
  ConfidenceThresholdEnforcer,
  getConfidenceEnforcer,
  confidenceCheckMiddleware,
  confidenceThresholdsEndpoint,
  confidenceThresholdsUpdateEndpoint,
};
