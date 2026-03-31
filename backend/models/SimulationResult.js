const mongoose = require("mongoose");

/**
 * Simulation Result Model
 * Tracks decision simulations (runs without execution)
 */
const simulationResultSchema = new mongoose.Schema(
  {
    simulationId: {
      type: String,
      required: true,
      unique: true,
    },
    tenantId: {
      type: String,
      required: true,
    },
    correlationId: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    // Input signals
    input: {
      signals: mongoose.Schema.Types.Mixed,
      severity: String,
    },
    // Full decision trace (same as real decision)
    decisionTrace: mongoose.Schema.Types.Mixed,
    // Simulation-specific metadata
    simulation: {
      type: Boolean,
      default: true,
    },
    wouldExecute: {
      type: Boolean,
      required: true, // Would this pass all safety checks?
    },
    executionNote: String, // Why would/wouldn't it execute
    // Comparison with previous runs
    comparedWithDecisionId: String,
    differences: [String], // What changed from actual decision
    // User notes
    notes: String,
    createdBy: String,
  },
  { timestamps: true }
);

simulationResultSchema.index({ tenantId: 1, timestamp: -1 });
simulationResultSchema.index({ tenantId: 1, correlationId: 1 });
simulationResultSchema.index({ tenantId: 1, wouldExecute: 1 });

/**
 * Run a simulation without executing the action
 * @param {string} tenantId - Tenant ID
 * @param {object} policy - Policy definition to apply
 * @param {object} incident - Incident/signals to analyze
 * @param {string} proposedAction - Action that would be taken
 * @param {object} options - Additional options (decisionTrace, comparedWithDecisionId, etc.)
 * @returns {Promise<Document>} Created SimulationResult document
 */
simulationResultSchema.statics.runSimulation = async function(tenantId, policy, incident, proposedAction, options = {}) {
  try {
    const simulationId = `sim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Simulate whether this action would pass safety checks
    const passesPolicy = this.validateAgainstPolicy(policy, proposedAction);
    const passesLimits = this.validateLimits(incident);
    const wouldExecute = passesPolicy && passesLimits;
    
    const simulation = await this.create({
      simulationId,
      tenantId,
      correlationId: options.correlationId || null,
      input: {
        signals: incident.signals || {},
        severity: incident.severity || 'MEDIUM',
      },
      decisionTrace: options.decisionTrace || {},
      wouldExecute,
      executionNote: wouldExecute 
        ? `Action '${proposedAction}' would execute (passes policy and safety limits)`
        : `Action '${proposedAction}' would NOT execute (fails ${!passesPolicy ? 'policy' : 'limits'} check)`,
      comparedWithDecisionId: options.comparedWithDecisionId || null,
      differences: options.differences || [],
      notes: options.notes || null,
      createdBy: options.createdBy || 'system',
    });
    
    console.log(`[simulation] ✓ Simulated action '${proposedAction}' - would ${wouldExecute ? 'execute' : 'NOT execute'}`);
    return simulation;
  } catch (error) {
    console.error(`[simulation] Error running simulation: ${error.message}`);
    throw error;
  }
};

/**
 * Calculate risk score for an action based on impact and likelihood
 * @param {number} impact - Impact severity (1-10)
 * @param {number} likelihood - Likelihood of negative outcome (0-1)
 * @returns {object} Risk metrics (riskScore, level, recommendation)
 */
simulationResultSchema.statics.calculateRisk = function(impact, likelihood) {
  if (impact < 1 || impact > 10 || likelihood < 0 || likelihood > 1) {
    throw new Error('Impact must be 1-10, likelihood must be 0-1');
  }

  const riskScore = (impact * likelihood) / 10; // Normalize to 0-1
  
  let level = 'low';
  let recommendation = 'safe_to_execute';
  
  if (riskScore >= 0.75) {
    level = 'critical';
    recommendation = 'requires_approval';
  } else if (riskScore >= 0.5) {
    level = 'high';
    recommendation = 'monitor_closely';
  } else if (riskScore >= 0.25) {
    level = 'medium';
    recommendation = 'proceed_with_caution';
  }

  return {
    riskScore: parseFloat((riskScore * 100).toFixed(2)),
    impact,
    likelihood: parseFloat((likelihood * 100).toFixed(2)),
    level,
    recommendation,
  };
};

/**
 * Predict outcome of a simulation based on historical data
 * @param {object} simulation - Simulation result document
 * @param {object} historicalData - Historical outcomes for similar actions
 * @returns {object} Prediction with confidence and expected outcome
 */
simulationResultSchema.statics.predictOutcome = function(simulation, historicalData = {}) {
  const defaultPrediction = {
    expectedSuccess: 0.5,
    confidence: 0,
    reasoning: 'No historical data available',
    recommendation: 'proceed_with_caution',
  };

  if (!historicalData || Object.keys(historicalData).length === 0) {
    return defaultPrediction;
  }

  const successRate = historicalData.successRate || 0.5;
  const dataPoints = historicalData.dataPoints || 0;
  const confidence = Math.min(dataPoints / 20, 1.0); // High confidence at 20+ data points

  let recommendation = 'proceed_with_caution';
  if (successRate >= 0.8) {
    recommendation = 'highly_recommended';
  } else if (successRate >= 0.6) {
    recommendation = 'recommended';
  }

  return {
    expectedSuccess: parseFloat((successRate * 100).toFixed(2)),
    confidence: parseFloat((confidence * 100).toFixed(2)),
    dataPoints,
    reasoning: `Based on ${dataPoints} historical outcomes (${(successRate * 100).toFixed(0)}% success rate)`,
    recommendation,
  };
};

/**
 * Validate action against policy constraints
 * @private
 */
simulationResultSchema.statics.validateAgainstPolicy = function(policy, action) {
  // Simplified validation - in production would check policy rules
  if (!policy || !action) return false;
  return true;
};

/**
 * Validate action meets safety limits
 * @private
 */
simulationResultSchema.statics.validateLimits = function(incident) {
  // Simplified validation - in production would check rate limits, resource limits, etc.
  if (!incident) return false;
  return true;
};

module.exports = mongoose.model("SimulationResult", simulationResultSchema);
