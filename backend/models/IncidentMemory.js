const mongoose = require("mongoose");

/**
 * IncidentMemory Model - Track patterns and historical outcomes
 * Replaces ActionEffectiveness with focus on pattern learning
 */

const incidentMemorySchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
    },
    patternId: {
      type: String,
      required: true,
    },
    patternType: {
      type: String,
      enum: [
        "transient-timeout",
        "high-error-rate",
        "high-latency",
        "circuit-breaker-open",
        "resource-exhaustion",
        "cascading-failure",
      ],
      required: true,
    },
    patternName: String,
    description: String,

    // OCCURRENCE TRACKING
    occurrences: [
      {
        incidentId: String,
        decisionId: String,
        timestamp: Date,
        resolvedWith: String, // action taken
        success: Boolean,
        failureReason: String,
        recoveryTimeMs: Number,
        confidence: Number,
        severity: String,
      },
    ],

    // AGGREGATED STATISTICS
    stats: {
      totalOccurrences: {
        type: Number,
        default: 0,
      },
      lastOccurrence: Date,
      firstOccurrence: Date,
      frequency: String, // "every 2-3 days" (human readable)

      // Action effectiveness
      actions: {
        type: Map,
        of: {
          successes: Number,
          failures: Number,
          totalAttempts: Number,
          successRate: Number,
          avgRecoveryTimeMs: Number,
          lastUsed: Date,
        },
      },

      // Historical severity trends
      severityTrend: {
        avgSeverity: String,
        escalationPattern: Boolean, // getting worse?
      },

      // Confidence trends
      confidenceTrend: {
        avgConfidence: Number,
        improvingTrend: Boolean,
      },
    },

    // FORECASTING
    predictedNextOccurrence: {
      estimatedTime: Date,
      confidence: Number,
      reasoning: String,
    },

    // RECOMMENDED ACTION BASED ON HISTORY
    recommendedAction: {
      action: String,
      successRate: Number,
      reasoning: String,
      confidence: Number,
    },

    // ACTIVE CIRCUIT BREAKER STATUS
    circuitBreaker: {
      status: {
        type: String,
        enum: ["CLOSED", "OPEN", "HALF_OPEN"],
        default: "CLOSED",
      },
      failureThreshold: Number,
      failureCount: Number,
      successCount: Number,
      failureWindow: String,
      openedAt: Date,
      trialsRemaining: Number,
    },

    // METADATA
    isActive: {
      type: Boolean,
      default: true,
    },
    lastAnalyzedAt: Date,
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "incident_memory",
  }
);

// Indexes
incidentMemorySchema.index({ tenantId: 1, patternType: 1 });
incidentMemorySchema.index({ tenantId: 1, isActive: 1 });
incidentMemorySchema.index({ tenantId: 1, "stats.lastOccurrence": -1 });
incidentMemorySchema.index({ tenantId: 1, patternId: 1 }, { unique: true });

// TTL index for automatic cleanup (90 days for inactive patterns)
incidentMemorySchema.index(
  { updatedAt: 1 },
  { 
    expireAfterSeconds: 7776000, // 90 days
    partialFilterExpression: { isActive: false } // Only expire inactive patterns
  }
);

// ✅ NEW METHODS: Record outcomes and update learning (Phase 2 consolidation)

/**
 * Record action outcome - update success/failure metrics
 */
incidentMemorySchema.methods.recordOutcome = function(action, success, duration) {
  // Update action metrics
  if (!this.stats.actions) {
    this.stats.actions = new Map();
  }

  const actionStats = this.stats.actions.get(action) || {
    successes: 0,
    failures: 0,
    totalAttempts: 0,
    successRate: 0,
    avgRecoveryTimeMs: 0,
    lastUsed: new Date(),
  };

  actionStats.totalAttempts += 1;
  if (success) {
    actionStats.successes += 1;
  } else {
    actionStats.failures += 1;
  }

  actionStats.successRate = actionStats.successes / actionStats.totalAttempts;
  
  // Update recovery time
  if (duration && success) {
    const currentAvg = actionStats.avgRecoveryTimeMs || 0;
    actionStats.avgRecoveryTimeMs = 
      (currentAvg * (actionStats.successes - 1) + duration) / actionStats.successes;
  }

  actionStats.lastUsed = new Date();
  this.stats.actions.set(action, actionStats);

  // Update overall confidence trend
  if (!this.stats.confidenceTrend) {
    this.stats.confidenceTrend = {
      avgConfidence: 0,
      improvingTrend: false,
    };
  }

  this.stats.lastOccurrence = new Date();
  this.stats.totalOccurrences = (this.stats.totalOccurrences || 0) + 1;

  return this.save();
};

/**
 * Get recommended action based on historical success
 */
incidentMemorySchema.methods.getRecommendedAction = function() {
  if (!this.stats.actions || this.stats.actions.size === 0) {
    return null;
  }

  let bestAction = null;
  let bestSuccessRate = -1;

  for (const [action, stats] of this.stats.actions) {
    if (stats.successRate > bestSuccessRate) {
      bestSuccessRate = stats.successRate;
      bestAction = action;
    }
  }

  return {
    action: bestAction,
    successRate: bestSuccessRate,
    avgRecoveryTimeMs: this.stats.actions.get(bestAction)?.avgRecoveryTimeMs || 0,
  };
};

/**
 * Update confidence based on action effectiveness
 */
incidentMemorySchema.methods.updateConfidenceScore = function() {
  const recommended = this.getRecommendedAction();
  if (!recommended) return 0.5;

  // Base confidence on success rate
  let confidence = recommended.successRate;

  // Decay confidence if action hasn't been used recently
  const lastUsed = this.stats.actions.get(recommended.action)?.lastUsed;
  if (lastUsed) {
    const daysSinceUse = (new Date() - lastUsed) / (1000 * 60 * 60 * 24);
    if (daysSinceUse > 30) {
      confidence *= 0.8; // 20% reduction after 30 days
    }
  }

  return Math.max(0, Math.min(1, confidence));
};

module.exports = mongoose.model("IncidentMemory", incidentMemorySchema);
