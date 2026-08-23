"use strict";

const {
  Feedback,
  FeedbackOutcome,
} = require(
  "../../persistence/operational/legacyModels"
);
const crypto = require("crypto");
/**
 * Unified Feedback Service
 * 
 * Handles two feedback workflows:
 * 1. Simple feedback: Human verdict on decision quality (correct/incorrect/partial)
 * 2. Outcome feedback: Detailed action outcome + confidence analysis for learning
 * 
 * Flow: Decision â†’ Action â†’ Outcome â†’ Feedback Recording â†’ Weight Adjustment
 */

class FeedbackService {
  constructor(memoryService, confidenceWeightOptimizer) {
    this.memoryService = memoryService;
    this.optimizer = confidenceWeightOptimizer;
  }

  /**
   * WORKFLOW 1: Record simple human feedback on a decision
   * Used for: "This decision was correct/incorrect/partially correct"
   */
  async recordFeedback(tenantId, decisionId, feedback, notes = "", providedBy = "system") {
    try {
      const feedbackId = `fb-${crypto.randomUUID()}`;

      const feedbackRecord = new Feedback({
        feedbackId,
        tenantId,
        decisionId,
        feedback, // "correct", "incorrect", "partial"
        notes,
        providedBy,
        providedAt: new Date(),
        impactOnConfidence: this._calculateConfidenceImpact(feedback),
        actionTaken: false,
      });

      await feedbackRecord.save();
      console.log(`[FeedbackService] Recorded ${feedback} feedback on decision ${decisionId}`);
      return feedbackRecord.toObject();
    } catch (error) {
      console.error("[FeedbackService] Failed to record feedback:", error);
      throw error;
    }
  }

  /**
   * WORKFLOW 2: Record detailed action outcome after execution
   * Used for: Post-execution analysis with metrics (success, duration, side effects)
   * Ties back to original decision via decisionId
   */
  async recordOutcome(tenantId, outcomeData) {
    try {
      const {
        decisionId,
        correlationId,
        actionTaken,
        success,
        timeToRecoveryMs = 0,
        sideEffects = [],
        incidentType,
        patternId,
        confidenceAtDecision = 0.5,
        decisionFactors = null,
        notes = "",
      } = outcomeData;

      // Create outcome record
      const feedback = new FeedbackOutcome({
        tenantId,
        decisionId,
        correlationId,
        recordedAt: new Date(),
        action: {
          taken: actionTaken,
          success,
          timeToRecoveryMs,
        },
        sideEffects: sideEffects.map((se) => ({
          type: se.type, // e.g., "service_downtime", "resource_spike", "cascading_failure"
          severity: se.severity, // "low", "medium", "high"
          duration: se.duration,
          description: se.description,
        })),
        analysis: {
          expectedOutcome: success,
          confidenceAtDecision,
          decisionFactors,
        },
        notes,
      });

      await feedback.save();

      // Update incident memory with outcome
      if (patternId && incidentType && this.memoryService) {
        await this._recordPatternOutcome(
          tenantId,
          patternId,
          incidentType,
          actionTaken,
          success,
          timeToRecoveryMs,
          decisionId
        );
      }

      // Feed to optimizer for weight adjustment
      if (decisionFactors && this.optimizer) {
        this.optimizer.recordOutcome(decisionFactors, { success });
      }

      return {
        feedbackId: feedback._id,
        recorded: true,
        timestamp: feedback.recordedAt,
      };
    } catch (error) {
      console.error("[FeedbackService] Error recording outcome:", error);
      throw error;
    }
  }

  /**
   * Get feedback for a specific decision
   */
  async getFeedbackForDecision(tenantId, decisionId) {
    try {
      const feedbacks = await Feedback.find({
        tenantId,
        decisionId,
      })
        .sort({ providedAt: -1 })
        .lean();

      return feedbacks;
    } catch (error) {
      console.error("[FeedbackService] Failed to get feedback:", error);
      throw error;
    }
  }

  /**
   * Get all feedback for a tenant
   */
  async getFeedbackForTenant(tenantId, limit = 100, filter = {}) {
    try {
      const query = { tenantId, ...filter };
      const feedbacks = await Feedback.find(query)
        .sort({ providedAt: -1 })
        .limit(limit)
        .lean();

      return feedbacks;
    } catch (error) {
      console.error("[FeedbackService] Failed to fetch tenant feedback:", error);
      throw error;
    }
  }

  /**
   * Get aggregated feedback statistics
   */
  async getAggregatedStats(tenantId, timeRangeHours = 24) {
    try {
      const startTime = new Date(Date.now() - timeRangeHours * 3600 * 1000);

      const feedbacks = await Feedback.find({
        tenantId,
        providedAt: { $gte: startTime },
      }).lean();

      const totalFeedback = feedbacks.length;
      const correct = feedbacks.filter((f) => f.feedback === "correct").length;
      const incorrect = feedbacks.filter((f) => f.feedback === "incorrect").length;
      const partial = feedbacks.filter((f) => f.feedback === "partial").length;

      return {
        totalFeedback,
        correctCount: correct,
        incorrectCount: incorrect,
        partialCount: partial,
        correctRate: totalFeedback > 0 ? ((correct / totalFeedback) * 100).toFixed(2) : "N/A",
        incorrectRate: totalFeedback > 0 ? ((incorrect / totalFeedback) * 100).toFixed(2) : "N/A",
        partialRate: totalFeedback > 0 ? ((partial / totalFeedback) * 100).toFixed(2) : "N/A",
        timeRange: `${timeRangeHours} hours`,
      };
    } catch (error) {
      console.error("[FeedbackService] Failed to aggregate stats:", error);
      throw error;
    }
  }

  /**
   * Mark action taken on feedback
   */
  async markActionTaken(tenantId, feedbackId, actionDescription) {
    try {
      const feedback = await Feedback.findOneAndUpdate(
        { tenantId, feedbackId },
        {
          actionTaken: true,
          actionDescription,
        },
        { new: true }
      );

      return feedback.toObject();
    } catch (error) {
      console.error("[FeedbackService] Failed to mark action:", error);
      throw error;
    }
  }

  /**
   * Get actionable feedback (not yet addressed)
   */
  async getActionableFeedback(tenantId, limit = 50) {
    try {
      const feedbacks = await Feedback.find({
        tenantId,
        actionTaken: false,
        feedback: { $in: ["incorrect", "partial"] },
      })
        .sort({ providedAt: -1 })
        .limit(limit)
        .lean();

      return feedbacks;
    } catch (error) {
      console.error("[FeedbackService] Failed to fetch actionable feedback:", error);
      throw error;
    }
  }

  /**
   * Get feedback history for pattern learning
   */
  async getFeedbackHistory(tenantId, patternId, limit = 10) {
    try {
      const feedbackRecords = await FeedbackOutcome.find({ tenantId })
        .sort({ recordedAt: -1 })
        .limit(limit)
        .lean();

      return feedbackRecords.map((f) => ({
        decisionId: f.decisionId,
        actionTaken: f.action.taken,
        success: f.action.success,
        timeToRecoveryMs: f.action.timeToRecoveryMs,
        sideEffects: f.sideEffects,
        confidenceAtDecision: f.analysis.confidenceAtDecision,
        recordedAt: f.recordedAt,
      }));
    } catch (error) {
      console.error("[FeedbackService] Error getting feedback history:", error);
      return [];
    }
  }

  /**
   * Analyze confidence calibration
   * Does high confidence correlate with success?
   */
  async analyzeConfidenceCalibration(tenantId) {
    try {
      const allFeedback = await FeedbackOutcome.find({ tenantId }).lean();

      if (allFeedback.length === 0) {
        return { samplesAnalyzed: 0, calibration: "insufficient_data" };
      }

      const buckets = {
        high: { count: 0, successes: 0 },    // >= 0.8
        medium: { count: 0, successes: 0 },  // 0.6-0.79
        low: { count: 0, successes: 0 },     // < 0.6
      };

      allFeedback.forEach((f) => {
        const conf = f.analysis.confidenceAtDecision;
        const bucket = conf >= 0.8 ? "high" : conf >= 0.6 ? "medium" : "low";

        buckets[bucket].count++;
        if (f.action.success) {
          buckets[bucket].successes++;
        }
      });

      const calibration = {
        high: buckets.high.count > 0 ? buckets.high.successes / buckets.high.count : 0,
        medium: buckets.medium.count > 0 ? buckets.medium.successes / buckets.medium.count : 0,
        low: buckets.low.count > 0 ? buckets.low.successes / buckets.low.count : 0,
      };

      const calibrationError =
        Math.abs(calibration.high - 0.8) +
        Math.abs(calibration.medium - 0.65) +
        Math.abs(calibration.low - 0.4);

      return {
        samplesAnalyzed: allFeedback.length,
        calibration,
        bucketCounts: {
          high: buckets.high.count,
          medium: buckets.medium.count,
          low: buckets.low.count,
        },
        calibrationError,
        wellCalibrated: calibrationError < 0.3,
        recommendation:
          calibrationError > 0.5
            ? "Confidence scores need recalibration - not matching actual outcomes"
            : calibrationError > 0.3
            ? "Confidence scores show minor calibration issues"
            : "Confidence scores well-calibrated",
      };
    } catch (error) {
      console.error("[FeedbackService] Error analyzing calibration:", error);
      return { error: error.message };
    }
  }

  /**
   * Get action effectiveness summary
   */
  async getActionEffectiveness(tenantId, incidentType = null, limit = 10) {
    try {
      const query = { tenantId };
      if (incidentType) {
        query["analysis.incidentType"] = incidentType;
      }

      const feedbackRecords = await FeedbackOutcome.find(query)
        .sort({ recordedAt: -1 })
        .limit(limit * 5)
        .lean();

      const actionStats = {};
      feedbackRecords.forEach((f) => {
        const action = f.action.taken;
        if (!actionStats[action]) {
          actionStats[action] = {
            attempts: 0,
            successes: 0,
            failures: 0,
            avgRecoveryTimeMs: 0,
            sideEffectCount: 0,
          };
        }

        actionStats[action].attempts++;
        if (f.action.success) {
          actionStats[action].successes++;
        } else {
          actionStats[action].failures++;
        }

        if (f.action.timeToRecoveryMs > 0) {
          const prevSum = actionStats[action].avgRecoveryTimeMs * (actionStats[action].attempts - 1);
          actionStats[action].avgRecoveryTimeMs =
            (prevSum + f.action.timeToRecoveryMs) / actionStats[action].attempts;
        }

        if (f.sideEffects && f.sideEffects.length > 0) {
          actionStats[action].sideEffectCount++;
        }
      });

      const results = Object.entries(actionStats)
        .map(([action, stats]) => ({
          action,
          successRate: stats.attempts > 0 ? stats.successes / stats.attempts : 0,
          attempts: stats.attempts,
          successes: stats.successes,
          failures: stats.failures,
          avgRecoveryTimeMs: Math.round(stats.avgRecoveryTimeMs || 0),
          sideEffectPercentage:
            stats.attempts > 0 ? (stats.sideEffectCount / stats.attempts) * 100 : 0,
          recommendation:
            stats.successes / stats.attempts > 0.7
              ? "HIGHLY_EFFECTIVE"
              : stats.successes / stats.attempts > 0.5
              ? "MODERATELY_EFFECTIVE"
              : "INEFFECTIVE",
        }))
        .sort((a, b) => b.successRate - a.successRate)
        .slice(0, limit);

      return results;
    } catch (error) {
      console.error("[FeedbackService] Error getting action effectiveness:", error);
      return [];
    }
  }

  /**
   * Apply weight optimization if conditions are met
   */
  async applyWeightOptimization(confidenceService) {
    if (!this.optimizer) {
      return { applied: false, reason: "No weight optimizer configured" };
    }

    try {
      const result = this.optimizer.applyOptimizedWeights(
        confidenceService.weights,
        confidenceService
      );

      if (result.applied) {
        console.log("[FeedbackService] Weight optimization applied:", {
          timestamp: new Date(),
          deltas: result.changeRecord.deltas,
          reasoning: result.changeRecord.reasoning,
        });
      } else {
        console.log("[FeedbackService] Weight optimization not applied:", result.reason);
      }

      return result;
    } catch (error) {
      console.error("[FeedbackService] Error applying weight optimization:", error);
      return { applied: false, error: error.message };
    }
  }

  /**
   * Get insights from feedback patterns
   */
  async getInsights(tenantId, limit = 100) {
    try {
      const incorrectFeedback = await Feedback.find({
        tenantId,
        feedback: "incorrect",
      })
        .sort({ providedAt: -1 })
        .limit(limit)
        .lean();

      const failedDecisions = {};

      incorrectFeedback.forEach((fb) => {
        if (fb.originalDecision?.recommendedAction) {
          const action = fb.originalDecision.recommendedAction;
          failedDecisions[action] = (failedDecisions[action] || 0) + 1;
        }
      });

      return {
        totalIncorrect: incorrectFeedback.length,
        failedActionPatterns: failedDecisions,
        recommendations: this._generateRecommendations(failedDecisions),
      };
    } catch (error) {
      console.error("[FeedbackService] Failed to get insights:", error);
      throw error;
    }
  }

  // ============ PRIVATE METHODS ============

  /**
   * Calculate confidence impact based on feedback type
   * @private
   */
  _calculateConfidenceImpact(feedback) {
    switch (feedback) {
      case "correct":
        return 0.05; // Increase confidence
      case "partial":
        return -0.02; // Slight decrease
      case "incorrect":
        return -0.1; // Decrease confidence
      default:
        return 0;
    }
  }

  /**
   * Update pattern memory with outcome data
   * @private
   */
  async _recordPatternOutcome(
    tenantId,
    patternId,
    incidentType,
    actionTaken,
    success,
    recoveryTimeMs,
    decisionId
  ) {
    try {
      const memory = await this.memoryService.find(tenantId, patternId, incidentType);

      if (!memory) {
        return;
      }

      memory.occurrences = memory.occurrences || [];
      memory.occurrences.push({
        incidentId: patternId,
        decisionId,
        timestamp: new Date(),
        resolvedWith: actionTaken,
        success,
        recoveryTimeMs,
      });

      if (!memory.stats.actions[actionTaken]) {
        memory.stats.actions[actionTaken] = {
          successes: 0,
          failures: 0,
          totalAttempts: 0,
          successRate: 0,
          avgRecoveryTimeMs: 0,
          lastUsed: new Date(),
        };
      }

      const stats = memory.stats.actions[actionTaken];
      if (success) {
        stats.successes++;
      } else {
        stats.failures++;
      }
      stats.totalAttempts++;
      stats.successRate = stats.successes / stats.totalAttempts;
      stats.lastUsed = new Date();

      if (recoveryTimeMs > 0) {
        const prevSum = (stats.avgRecoveryTimeMs || 0) * (stats.totalAttempts - 1);
        stats.avgRecoveryTimeMs = (prevSum + recoveryTimeMs) / stats.totalAttempts;
      }

      await memory.save();
    } catch (error) {
      console.warn("[FeedbackService] Could not update pattern memory:", error);
    }
  }

  /**
   * Generate improvement recommendations
   * @private
   */
  _generateRecommendations(failedActions) {
    const recommendations = [];

    Object.entries(failedActions).forEach(([action, count]) => {
      if (count >= 3) {
        recommendations.push(
          `Action "${action}" has ${count} incorrect outcomes - consider reviewing its policy rules`
        );
      }
    });

    return recommendations;
  }
}

// Export as class (instantiate with dependencies or use static methods)
module.exports = FeedbackService;

