const mongoose = require('mongoose');

/**
 * Confidence Calibration Service
 * 
 * Tracks confidence prediction accuracy and dynamically adjusts confidence weights
 * based on historical outcomes. Enables continuous improvement of confidence scoring.
 */

const confidenceMetricsSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  decisionTraceId: { type: String, required: true, unique: true },
  action: { type: String, required: true },
  service: { type: String },
  pattern: { type: String },
  
  // Predictions made by confidence system
  predicted_confidence: { type: Number, min: 0, max: 1 }, // 0.0-1.0
  predicted_success_probability: { type: Number, min: 0, max: 1 },
  confidence_factors: {
    historical_success_rate: Number,        // 0-1
    similarity_to_past: Number,              // 0-1 (how similar to past incidents)
    policy_alignment: Number,                // 0-1 (how well action aligns with policy)
    risk_level: Number,                     // 0-1 (risk adjusted confidence)
    resource_availability: Number            // 0-1 (resources available)
  },
  
  // Actual outcome
  actual_success: { type: Boolean },
  actual_execution_time_ms: Number,
  actual_effectiveness_score: Number,       // 0-100
  
  // Calibration metrics
  prediction_correct: Boolean,               // predicted_success == actual_success
  confidence_vs_accuracy: Number,            // confidence - actual_effectiveness/100
  
  // Timestamps
  predicted_at: { type: Date, default: Date.now },
  executed_at: Date,
  actual_outcome_recorded_at: Date,
  
  // Feedback
  feedback: String,
  manually_corrected: { type: Boolean, default: false }
});

const calibrationWeightsSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true, unique: true },
  version: { type: Number, default: 1 },
  
  // Current weights (sum should equal 1.0)
  weights: {
    historical_success_rate: { type: Number, default: 0.35 },
    similarity_to_past: { type: Number, default: 0.25 },
    policy_alignment: { type: Number, default: 0.20 },
    risk_level: { type: Number, default: 0.10 },
    resource_availability: { type: Number, default: 0.10 }
  },
  
  // Accuracy metrics
  total_predictions: { type: Number, default: 0 },
  correct_predictions: { type: Number, default: 0 },
  accuracy_percent: { type: Number, default: 0 },
  false_positives: { type: Number, default: 0 },
  false_negatives: { type: Number, default: 0 },
  
  // Weight adjustment history
  adjustment_history: [{
    timestamp: Date,
    previous_weights: Object,
    new_weights: Object,
    reason: String,
    accuracy_before: Number,
    accuracy_after: Number
  }],
  
  // Last recalibration
  last_calibrated_at: Date,
  calibration_interval_hours: { type: Number, default: 24 },
  
  // Factor performance
  factor_accuracy: {
    historical_success_rate: Number,
    similarity_to_past: Number,
    policy_alignment: Number,
    risk_level: Number,
    resource_availability: Number
  }
});

class ConfidenceCalibrationService {
  constructor() {
    this.ConfidenceMetrics = mongoose.model('ConfidenceMetrics', confidenceMetricsSchema, 'confidence_metrics');
    this.CalibrationWeights = mongoose.model('CalibrationWeights', calibrationWeightsSchema, 'calibration_weights');
  }

  /**
   * Record a confidence prediction
   */
  async recordPrediction(tenantId, decisionTraceId, predictionData) {
    try {
      const prediction = new this.ConfidenceMetrics({
        tenantId,
        decisionTraceId,
        action: predictionData.action,
        service: predictionData.service,
        pattern: predictionData.pattern,
        predicted_confidence: predictionData.predicted_confidence,
        predicted_success_probability: predictionData.predicted_success_probability,
        confidence_factors: predictionData.confidence_factors
      });

      await prediction.save();
      return { success: true, decisionTraceId };
    } catch (error) {
      throw new Error(`Failed to record prediction: ${error.message}`);
    }
  }

  /**
   * Record actual outcome and calculate prediction accuracy
   */
  async recordOutcome(tenantId, decisionTraceId, outcomeData) {
    try {
      const prediction = await this.ConfidenceMetrics.findOne({
        tenantId,
        decisionTraceId
      });

      if (!prediction) {
        throw new Error('Prediction not found for this decision');
      }

      // Record actual outcome
      prediction.actual_success = outcomeData.actual_success;
      prediction.actual_execution_time_ms = outcomeData.actual_execution_time_ms;
      prediction.actual_effectiveness_score = outcomeData.actual_effectiveness_score;
      prediction.executed_at = outcomeData.executed_at || new Date();
      prediction.actual_outcome_recorded_at = new Date();

      // Calculate calibration metrics
      prediction.prediction_correct = prediction.predicted_success_probability >= 0.5 
        ? outcomeData.actual_success 
        : !outcomeData.actual_success;
      
      prediction.confidence_vs_accuracy = 
        prediction.predicted_confidence - (outcomeData.actual_effectiveness_score / 100);

      await prediction.save();

      // Update weights accuracy
      await this.updateWeightsAccuracy(tenantId);

      return {
        success: true,
        decisionTraceId,
        prediction_correct: prediction.prediction_correct,
        confidence_vs_accuracy: prediction.confidence_vs_accuracy
      };
    } catch (error) {
      throw new Error(`Failed to record outcome: ${error.message}`);
    }
  }

  /**
   * Update calibration weights based on recent predictions
   */
  async updateWeightsAccuracy(tenantId) {
    try {
      const weights = await this.CalibrationWeights.findOne({ tenantId }) ||
        new this.CalibrationWeights({ tenantId });

      // Get recent predictions (last 100)
      const recentPredictions = await this.ConfidenceMetrics.find({
        tenantId,
        actual_success: { $exists: true }
      })
        .sort({ actual_outcome_recorded_at: -1 })
        .limit(100);

      if (recentPredictions.length === 0) {
        return weights;
      }

      // Calculate accuracy
      const correctCount = recentPredictions.filter(p => p.prediction_correct).length;
      const accuracy = (correctCount / recentPredictions.length) * 100;

      weights.total_predictions = recentPredictions.length;
      weights.correct_predictions = correctCount;
      weights.accuracy_percent = accuracy;

      // Calculate false positives and false negatives
      weights.false_positives = recentPredictions.filter(
        p => p.predicted_success_probability >= 0.5 && !p.actual_success
      ).length;

      weights.false_negatives = recentPredictions.filter(
        p => p.predicted_success_probability < 0.5 && p.actual_success
      ).length;

      // Calculate factor accuracy
      const factorStats = {
        historical_success_rate: 0,
        similarity_to_past: 0,
        policy_alignment: 0,
        risk_level: 0,
        resource_availability: 0
      };

      const factorCounts = { ...factorStats };

      for (const prediction of recentPredictions) {
        if (!prediction.confidence_factors) continue;

        for (const factor of Object.keys(factorStats)) {
          if (prediction.confidence_factors[factor] !== undefined) {
            if (prediction.prediction_correct) {
              factorStats[factor] += prediction.confidence_factors[factor];
            }
            factorCounts[factor]++;
          }
        }
      }

      // Calculate average factor accuracy
      for (const factor of Object.keys(factorStats)) {
        if (factorCounts[factor] > 0) {
          weights.factor_accuracy[factor] = 
            (factorStats[factor] / factorCounts[factor]) * 100;
        }
      }

      await weights.save();
      return weights;
    } catch (error) {
      throw new Error(`Failed to update weights accuracy: ${error.message}`);
    }
  }

  /**
   * Recalibrate weights based on accuracy and factor performance
   */
  async recalibrateWeights(tenantId) {
    try {
      const weights = await this.CalibrationWeights.findOne({ tenantId });
      if (!weights) {
        throw new Error('Calibration weights not found');
      }

      // Check if recalibration is needed (every 24 hours)
      const lastCalibration = weights.last_calibrated_at || new Date(0);
      const hoursSinceCalibration = 
        (new Date() - lastCalibration) / (1000 * 60 * 60);

      if (hoursSinceCalibration < weights.calibration_interval_hours) {
        return weights;
      }

      const previousWeights = { ...weights.weights };

      // New weights based on factor accuracy
      const totalAccuracy = Object.values(weights.factor_accuracy || {})
        .reduce((a, b) => a + b, 0) || 100;

      const newWeights = {};
      for (const factor of Object.keys(weights.weights)) {
        const factorAccuracy = weights.factor_accuracy?.[factor] || 0;
        newWeights[factor] = (factorAccuracy / totalAccuracy) * 1.0;
      }

      // Normalize weights to sum to 1.0
      const weightSum = Object.values(newWeights).reduce((a, b) => a + b, 0);
      for (const factor of Object.keys(newWeights)) {
        newWeights[factor] = newWeights[factor] / weightSum;
      }

      // Record adjustment
      const adjustmentRecord = {
        timestamp: new Date(),
        previous_weights: previousWeights,
        new_weights: newWeights,
        reason: 'Automatic recalibration based on factor accuracy',
        accuracy_before: weights.accuracy_percent
      };

      weights.weights = newWeights;
      weights.version++;
      weights.last_calibrated_at = new Date();
      weights.adjustment_history.push(adjustmentRecord);

      // Recalculate accuracy after adjustment
      await this.updateWeightsAccuracy(tenantId);
      const updatedWeights = await this.CalibrationWeights.findOne({ tenantId });
      adjustmentRecord.accuracy_after = updatedWeights.accuracy_percent;

      await weights.save();
      return weights;
    } catch (error) {
      throw new Error(`Failed to recalibrate weights: ${error.message}`);
    }
  }

  /**
   * Get current calibration weights for tenant
   */
  async getWeights(tenantId) {
    try {
      let weights = await this.CalibrationWeights.findOne({ tenantId });
      
      if (!weights) {
        weights = new this.CalibrationWeights({ tenantId });
        await weights.save();
      }

      return weights;
    } catch (error) {
      throw new Error(`Failed to get weights: ${error.message}`);
    }
  }

  /**
   * Get prediction accuracy across all actions
   */
  async getAccuracyByAction(tenantId, timeRangeHours = 24) {
    try {
      const cutoffTime = new Date(Date.now() - timeRangeHours * 3600 * 1000);

      const results = await this.ConfidenceMetrics.aggregate([
        {
          $match: {
            tenantId,
            actual_outcome_recorded_at: { $gte: cutoffTime },
            actual_success: { $exists: true }
          }
        },
        {
          $group: {
            _id: '$action',
            total: { $sum: 1 },
            correct: {
              $sum: { $cond: ['$prediction_correct', 1, 0] }
            },
            avgConfidence: { $avg: '$predicted_confidence' },
            avgEffectiveness: { $avg: '$actual_effectiveness_score' },
            avgConfidenceVsAccuracy: { $avg: '$confidence_vs_accuracy' }
          }
        },
        {
          $project: {
            _id: 1,
            total: 1,
            correct: 1,
            accuracy_percent: {
              $multiply: [{ $divide: ['$correct', '$total'] }, 100]
            },
            avgConfidence: { $round: ['$avgConfidence', 3] },
            avgEffectiveness: { $round: ['$avgEffectiveness', 1] },
            calibrationGap: { $round: ['$avgConfidenceVsAccuracy', 3] }
          }
        },
        { $sort: { accuracy_percent: -1 } }
      ]);

      return results;
    } catch (error) {
      throw new Error(`Failed to get accuracy by action: ${error.message}`);
    }
  }

  /**
   * Get prediction accuracy by pattern (incident type)
   */
  async getAccuracyByPattern(tenantId, timeRangeHours = 24) {
    try {
      const cutoffTime = new Date(Date.now() - timeRangeHours * 3600 * 1000);

      const results = await this.ConfidenceMetrics.aggregate([
        {
          $match: {
            tenantId,
            actual_outcome_recorded_at: { $gte: cutoffTime },
            actual_success: { $exists: true }
          }
        },
        {
          $group: {
            _id: '$pattern',
            total: { $sum: 1 },
            correct: { $sum: { $cond: ['$prediction_correct', 1, 0] } },
            avgConfidence: { $avg: '$predicted_confidence' },
            avgEffectiveness: { $avg: '$actual_effectiveness_score' }
          }
        },
        {
          $project: {
            _id: 1,
            total: 1,
            correct: 1,
            accuracy_percent: {
              $multiply: [{ $divide: ['$correct', '$total'] }, 100]
            },
            avgConfidence: { $round: ['$avgConfidence', 3] },
            avgEffectiveness: { $round: ['$avgEffectiveness', 1] }
          }
        },
        { $sort: { accuracy_percent: -1 } }
      ]);

      return results;
    } catch (error) {
      throw new Error(`Failed to get accuracy by pattern: ${error.message}`);
    }
  }

  /**
   * Get confidence vs effectiveness scatter (for calibration analysis)
   */
  async getConfidenceCalibrationData(tenantId, limit = 50) {
    try {
      const predictions = await this.ConfidenceMetrics.find({
        tenantId,
        actual_success: { $exists: true }
      })
        .sort({ actual_outcome_recorded_at: -1 })
        .limit(limit)
        .select({
          action: 1,
          predicted_confidence: 1,
          actual_effectiveness_score: 1,
          prediction_correct: 1,
          predicted_at: 1,
          actual_outcome_recorded_at: 1
        });

      return predictions;
    } catch (error) {
      throw new Error(`Failed to get calibration data: ${error.message}`);
    }
  }

  /**
   * Get confidence trending over time
   */
  async getConfidenceTrends(tenantId, intervalHours = 24, periodsCount = 7) {
    try {
      const intervals = [];
      const now = new Date();

      for (let i = periodsCount - 1; i >= 0; i--) {
        const endTime = new Date(now.getTime() - i * intervalHours * 3600 * 1000);
        const startTime = new Date(endTime.getTime() - intervalHours * 3600 * 1000);
        
        const metrics = await this.ConfidenceMetrics.aggregate([
          {
            $match: {
              tenantId,
              actual_outcome_recorded_at: { $gte: startTime, $lt: endTime },
              actual_success: { $exists: true }
            }
          },
          {
            $group: {
              _id: null,
              sampleCount: { $sum: 1 },
              avgConfidence: { $avg: '$predicted_confidence' },
              accuracy: {
                $avg: { $cond: ['$prediction_correct', 1, 0] }
              },
              avgEffectiveness: { $avg: '$actual_effectiveness_score' }
            }
          }
        ]);

        if (metrics.length > 0) {
          intervals.push({
            timestamp: endTime.toISOString(),
            sampleCount: metrics[0].sampleCount,
            avgConfidence: Math.round(metrics[0].avgConfidence * 1000) / 1000,
            accuracyPercent: Math.round(metrics[0].accuracy * 100),
            avgEffectiveness: Math.round(metrics[0].avgEffectiveness * 10) / 10
          });
        }
      }

      return intervals;
    } catch (error) {
      throw new Error(`Failed to get confidence trends: ${error.message}`);
    }
  }

  /**
   * Apply confidence adjustment to raw confidence score
   */
  async adjustConfidenceScore(tenantId, rawConfidence, factors) {
    try {
      const weights = await this.getWeights(tenantId);

      let adjustedConfidence = 0;
      for (const factor of Object.keys(weights.weights)) {
        adjustedConfidence += (factors[factor] || 0) * weights.weights[factor];
      }

      return {
        raw_confidence: rawConfidence,
        adjusted_confidence: Math.min(1.0, Math.max(0, adjustedConfidence)),
        weights_applied: weights.weights,
        version: weights.version
      };
    } catch (error) {
      throw new Error(`Failed to adjust confidence score: ${error.message}`);
    }
  }
}

module.exports = new ConfidenceCalibrationService();
