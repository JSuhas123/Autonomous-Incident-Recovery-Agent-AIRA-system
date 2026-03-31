const mongoose = require("mongoose");

/**
 * FeedbackOutcome Model
 * Records the results of executed actions for learning and optimization
 */

const feedbackOutcomeSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
    },
    decisionId: {
      type: String,
      required: true,
    },
    correlationId: {
      type: String,
    },
    recordedAt: {
      type: Date,
      default: Date.now,
    },

    // ACTION EXECUTION RESULTS
    action: {
      taken: {
        type: String,
        required: true,
        enum: ["log", "retry", "restart", "alert", "scale", "circuit-break", "cache-clear"],
      },
      success: {
        type: Boolean,
        required: true,
      },
      timeToRecoveryMs: {
        type: Number,
        default: 0,
      },
    },

    // SIDE EFFECTS AND CONSEQUENCES
    sideEffects: [
      {
        type: {
          type: String,
          enum: [
            "service_downtime",
            "resource_spike",
            "cascading_failure",
            "data_inconsistency",
            "user_impact",
            "database_load",
            "none",
          ],
        },
        severity: {
          type: String,
          enum: ["low", "medium", "high"],
        },
        duration: Number, // milliseconds
        description: String,
      },
    ],

    // DECISION ANALYSIS
    analysis: {
      expectedOutcome: Boolean, // Did confidence match reality?
      confidenceAtDecision: Number, // 0-1
      decisionFactors: {
        pattern_match: Object,
        historical_success: Object,
        signal_strength: Object,
        recency: Object,
        policy_alignment: Object,
      },
      incidentType: String,
    },

    // NOTES AND CONTEXT
    notes: String,
  },
  {
    timestamps: true,
    collection: "feedback_outcomes",
  }
);

// Indexes for common queries
feedbackOutcomeSchema.index({ tenantId: 1, recordedAt: -1 });
feedbackOutcomeSchema.index({ tenantId: 1, "action.taken": 1, recordedAt: -1 });
feedbackOutcomeSchema.index({ decisionId: 1 });

/**
 * Record an outcome for a decision
 * @param {string} tenantId - Tenant ID
 * @param {string} decisionId - Decision ID
 * @param {string} actionTaken - Action that was taken
 * @param {boolean} success - Whether the action succeeded
 * @param {object} metrics - Additional metrics (timeToRecoveryMs, sideEffects, notes, etc.)
 * @returns {Promise<Document>} Created FeedbackOutcome document
 */
feedbackOutcomeSchema.statics.recordOutcome = async function(tenantId, decisionId, actionTaken, success, metrics = {}) {
  try {
    const outcome = await this.create({
      tenantId,
      decisionId,
      correlationId: metrics.correlationId || null,
      action: {
        taken: actionTaken,
        success,
        timeToRecoveryMs: metrics.timeToRecoveryMs || 0,
      },
      sideEffects: metrics.sideEffects || [],
      analysis: metrics.analysis || {},
      notes: metrics.notes || null,
    });
    console.log(`[feedback] ✓ Recorded outcome for decision ${decisionId}: ${actionTaken} (${success ? 'success' : 'failed'})`);
    return outcome;
  } catch (error) {
    console.error(`[feedback] Error recording outcome: ${error.message}`);
    throw error;
  }
};

/**
 * Get outcome history for a tenant/decision
 * @param {string} tenantId - Tenant ID
 * @param {string} decisionId - Optional: Filter by decision ID
 * @param {number} limit - Max results (default: 50)
 * @returns {Promise<Array>} Array of outcomes sorted by most recent first
 */
feedbackOutcomeSchema.statics.getOutcomeHistory = async function(tenantId, decisionId = null, limit = 50) {
  try {
    const query = { tenantId };
    if (decisionId) {
      query.decisionId = decisionId;
    }
    
    const outcomes = await this.find(query)
      .sort({ recordedAt: -1 })
      .limit(limit)
      .lean();
    
    return outcomes;
  } catch (error) {
    console.error(`[feedback] Error fetching outcome history: ${error.message}`);
    throw error;
  }
};

/**
 * Calculate effectiveness of an action
 * @param {number} successCount - How many times this action succeeded
 * @param {number} totalCount - Total times this action was taken
 * @returns {object} Effectiveness metrics (successRate, confidence, recommendation)
 */
feedbackOutcomeSchema.statics.calculateEffectiveness = function(successCount, totalCount) {
  if (totalCount === 0) {
    return {
      successRate: 0,
      confidence: 0,
      dataPoints: 0,
      recommendation: 'insufficient_data',
      message: 'No outcome data available yet',
    };
  }

  const successRate = successCount / totalCount;
  // Confidence increases with more data points (max at 100 data points)
  const confidence = Math.min(totalCount / 100, 1.0);
  
  let recommendation = 'uncertain';
  if (successRate >= 0.8) {
    recommendation = 'highly_recommended';
  } else if (successRate >= 0.6) {
    recommendation = 'recommended';
  } else if (successRate >= 0.4) {
    recommendation = 'use_with_caution';
  } else {
    recommendation = 'not_recommended';
  }

  return {
    successRate: parseFloat((successRate * 100).toFixed(2)),
    confidence: parseFloat((confidence * 100).toFixed(2)),
    dataPoints: totalCount,
    recommendation,
    message: `${successCount}/${totalCount} successful outcomes`,
  };
};

module.exports = mongoose.model("FeedbackOutcome", feedbackOutcomeSchema);
