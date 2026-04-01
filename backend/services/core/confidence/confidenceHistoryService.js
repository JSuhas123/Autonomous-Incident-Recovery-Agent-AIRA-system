/**
 * Confidence History Service
 * Tracks decision and action success/failure to calibrate confidence scores
 * 
 * CRITICAL: Replaces arbitrary hardcoded weights with data-driven scoring
 * 
 * Tracks:
 * - Decision patterns → actual outcomes
 * - Action effectiveness per pattern
 * - Confidence decay based on time since training data
 * - Per-tenant calibration
 */

const mongoose = require('mongoose');

const confidenceHistorySchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    // Pattern that was matched
    patternType: {
      type: String,
      required: true,
      enum: [
        'SERVICE_CRASH',
        'CASCADE_FAILURE',
        'DATABASE_LATENCY',
        'ELEVATED_LATENCY',
        'LATENCY_TREND',
        'HIGH_ERROR_RATE',
      ],
    },
    // Action recommended
    action: {
      type: String,
      required: true,
      enum: ['RESTART', 'SCALE', 'ISOLATE', 'ESCALATE', 'ALERT', 'OBSERVE'],
    },
    // Initial confidence from decision engine
    initialConfidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    // Decision outcome
    outcome: {
      type: String,
      required: true,
      enum: ['SUCCESS', 'PARTIAL_SUCCESS', 'FAILURE', 'NOT_APPLICABLE', 'NO_FEEDBACK'],
    },
    // Duration until resolution (milliseconds)
    timeToResolution: Number,
    
    // Pre-action metrics
    preMetrics: mongoose.Schema.Types.Mixed,
    // Post-action metrics
    postMetrics: mongoose.Schema.Types.Mixed,
    // Improvement (e.g., error rate reduction)
    improvement: {
      metric: String,
      before: Number,
      after: Number,
      percentImprovement: Number,
    },

    // Metadata
    decisionId: String,
    incidentId: String,
    feedback: String, // Optional human feedback
    feedbackSource: String, // 'human', 'automated', 'system'

    recordedAt: { type: Date, default: Date.now, index: true },
  },
  { collection: 'confidence_history' }
);

const ConfidenceHistory =
  mongoose.models.ConfidenceHistory ||
  mongoose.model('ConfidenceHistory', confidenceHistorySchema);

class ConfidenceHistoryService {
  /**
   * Record decision outcome for calibration
   */
  async recordOutcome(record) {
    const {
      tenantId,
      patternType,
      action,
      initialConfidence,
      outcome,
      preMetrics,
      postMetrics,
      decisionId,
      feedback,
    } = record;

    try {
      const entry = new ConfidenceHistory({
        tenantId,
        patternType,
        action,
        initialConfidence,
        outcome,
        preMetrics,
        postMetrics,
        decisionId,
        feedback,
        feedbackSource: 'human',
        recordedAt: new Date(),
      });

      // Calculate improvement if metrics available
      if (preMetrics && postMetrics) {
        entry.improvement = this._calculateImprovement(preMetrics, postMetrics);
      }

      await entry.save();
      return entry;
    } catch (error) {
      console.error(
        `[confidence-history] Failed to record outcome: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Get calibrated confidence for pattern + action
   * Based on historical success rate
   *
   * Formula: baseConfidence * successRate * decayFactor
   * - baseConfidence: Initial confidence from decision engine
   * - successRate: Historical success %
   * - decayFactor: Reduces confidence if training data is old
   */
  async getCalibratedConfidence(tenantId, patternType, action) {
    try {
      // Get recent history for this pattern/action
      const recentDays = parseInt(process.env.CONFIDENCE_HISTORY_DAYS || '30');
      const cutoffDate = new Date(Date.now() - recentDays * 24 * 60 * 60 * 1000);

      const history = await ConfidenceHistory.find({
        tenantId,
        patternType,
        action,
        recordedAt: { $gte: cutoffDate },
      });

      if (history.length === 0) {
        // No history - return neutral adjustment
        return {
          calibrated: 0.5, // Default to 50% confidence
          reason: 'No historical data',
          dataPoints: 0,
          successRate: null,
        };
      }

      // Calculate metrics
      const successCount = history.filter(
        (h) => h.outcome === 'SUCCESS' || h.outcome === 'PARTIAL_SUCCESS'
      ).length;
      const successRate = successCount / history.length;

      const avgInitialConfidence =
        history.reduce((sum, h) => sum + h.initialConfidence, 0) /
        history.length;

      // Decay factor based on age of data
      const oldestData = Math.min(
        ...history.map((h) => h.recordedAt.getTime())
      );
      const dataAgeMs = Date.now() - oldestData;
      const dataAgeDays = dataAgeMs / (24 * 60 * 60 * 1000);
      const decayFactor = Math.exp(-dataAgeDays / (recentDays * 2)); // Exponential decay

      // Calibrated confidence = base * success rate * decay
      const calibrated = Math.min(
        1.0,
        avgInitialConfidence * Math.max(0.3, successRate) * decayFactor
      );

      return {
        calibrated,
        reason: `Calibrated by ${history.length} historical outcomes`,
        dataPoints: history.length,
        successRate,
        avgInitialConfidence,
        decayFactor,
        dataAgeDays: Math.round(dataAgeDays),
      };
    } catch (error) {
      console.error(
        `[confidence-history] Error calculating calibrated confidence: ${error.message}`
      );
      // Return neutral default on error
      return {
        calibrated: 0.5,
        reason: 'Error calculating calibration',
        error: error.message,
      };
    }
  }

  /**
   * Get success stats for pattern
   */
  async getPatternStats(tenantId, patternType) {
    try {
      const stats = await ConfidenceHistory.aggregate([
        {
          $match: {
            tenantId,
            patternType,
          },
        },
        {
          $group: {
            _id: '$action',
            totalCount: { $sum: 1 },
            successCount: {
              $sum: {
                $cond: [
                  {
                    $in: ['$outcome', ['SUCCESS', 'PARTIAL_SUCCESS']],
                  },
                  1,
                  0,
                ],
              },
            },
            failureCount: {
              $sum: {
                $cond: [
                  {
                    $eq: ['$outcome', 'FAILURE'],
                  },
                  1,
                  0,
                ],
              },
            },
            avgConfidence: { $avg: '$initialConfidence' },
            avgTimeToResolution: {
              $avg: '$timeToResolution',
            },
          },
        },
        {
          $project: {
            action: '$_id',
            totalCount: 1,
            successCount: 1,
            failureCount: 1,
            successRate: {
              $divide: ['$successCount', '$totalCount'],
            },
            avgConfidence: { $round: ['$avgConfidence', 2] },
            avgTimeToResolution: {
              $round: ['$avgTimeToResolution', 0],
            },
          },
        },
      ]);

      return stats;
    } catch (error) {
      console.error(
        `[confidence-history] Error getting pattern stats: ${error.message}`
      );
      return [];
    }
  }

  /**
   * Calculate improvement between pre and post metrics
   * @private
   */
  _calculateImprovement(preMetrics, postMetrics) {
    // Try common metrics
    const metrics = [
      'errorRate',
      'latency',
      'cpu',
      'memory',
      'queueLength',
      'errorCount',
    ];

    for (const metric of metrics) {
      if (
        preMetrics[metric] !== undefined &&
        postMetrics[metric] !== undefined
      ) {
        const before = parseFloat(preMetrics[metric]);
        const after = parseFloat(postMetrics[metric]);

        if (before > 0) {
          const improvement = ((before - after) / before) * 100;
          return {
            metric,
            before,
            after,
            percentImprovement: Math.round(improvement),
          };
        }
      }
    }

    return null;
  }

  /**
   * Clean up old history entries (older than X days)
   */
  async cleanupOldEntries(retentionDays = 365) {
    try {
      const cutoffDate = new Date(
        Date.now() - retentionDays * 24 * 60 * 60 * 1000
      );
      const result = await ConfidenceHistory.deleteMany({
        recordedAt: { $lt: cutoffDate },
      });

      console.log(
        `[confidence-history] Cleaned up ${result.deletedCount} old entries`
      );
      return result.deletedCount;
    } catch (error) {
      console.error(
        `[confidence-history] Error cleaning up old entries: ${error.message}`
      );
      throw error;
    }
  }
}

module.exports = {
  ConfidenceHistory,
  ConfidenceHistoryService,
  confidenceHistoryService: new ConfidenceHistoryService(),
};
