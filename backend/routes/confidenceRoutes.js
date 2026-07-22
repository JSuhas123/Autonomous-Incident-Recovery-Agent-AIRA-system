const express = require('express');
const router = express.Router();
const confidenceCalibrationService = require('../services/core/confidence/confidenceCalibrationService');

/**
 * Phase 4: Adaptive Confidence Routes
 * 
 * Endpoints for tracking, analyzing, and adjusting confidence predictions
 * based on historical accuracy of AIRA decisions.
 */

/**
 * POST /record-prediction
 * Record a confidence prediction before action execution
 */
router.post('/record-prediction', async (req, res, next) => {
  try {
    const { tenantId = 'default', decisionTraceId, predictionData } = req.body;

    if (!decisionTraceId || !predictionData) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: decisionTraceId, predictionData'
      });
    }

    const result = await confidenceCalibrationService.recordPrediction(
      tenantId,
      decisionTraceId,
      predictionData
    );

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /record-outcome
 * Record actual outcome of decision and calculate prediction accuracy
 */
router.post('/record-outcome', async (req, res, next) => {
  try {
    const { tenantId = 'default', decisionTraceId, outcomeData } = req.body;

    if (!decisionTraceId || !outcomeData) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: decisionTraceId, outcomeData'
      });
    }

    const result = await confidenceCalibrationService.recordOutcome(
      tenantId,
      decisionTraceId,
      outcomeData
    );

    res.json({
      success: true,
      data: result,
      message: result.prediction_correct 
        ? 'Prediction was accurate' 
        : 'Prediction was inaccurate - consider weight adjustment'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /weights
 * Get current confidence weights for tenant
 */
router.get('/weights', async (req, res, next) => {
  try {
    const { tenantId = 'default' } = req.query;

    const weights = await confidenceCalibrationService.getWeights(tenantId);

    res.json({
      success: true,
      tenantId,
      weights: weights.weights,
      accuracy: {
        percent: weights.accuracy_percent,
        totalPredictions: weights.total_predictions,
        correctPredictions: weights.correct_predictions,
        falsePositives: weights.false_positives,
        falseNegatives: weights.false_negatives
      },
      factorAccuracy: weights.factor_accuracy,
      version: weights.version,
      lastCalibratedAt: weights.last_calibrated_at
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /recalibrate
 * Recalibrate weights based on recent prediction accuracy
 */
router.post('/recalibrate', async (req, res, next) => {
  try {
    const { tenantId = 'default' } = req.body;

    const weights = await confidenceCalibrationService.recalibrateWeights(tenantId);

    res.json({
      success: true,
      message: 'Weights recalibrated',
      weights: weights.weights,
      version: weights.version,
      accuracy: weights.accuracy_percent,
      adjustmentHistory: weights.adjustment_history.slice(-3) // Last 3 adjustments
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /accuracy/by-action
 * Get prediction accuracy broken down by action type
 */
router.get('/accuracy/by-action', async (req, res, next) => {
  try {
    const { tenantId = 'default', timeRangeHours = 24 } = req.query;

    const results = await confidenceCalibrationService.getAccuracyByAction(
      tenantId,
      parseInt(timeRangeHours)
    );

    res.json({
      success: true,
      tenantId,
      timeRangeHours: parseInt(timeRangeHours),
      results,
      summary: {
        actionsAnalyzed: results.length,
        averageAccuracy: results.length > 0
          ? Math.round(
              results.reduce((a, b) => a + b.accuracy_percent, 0) / results.length
            )
          : 0,
        bestPerformer: results[0]?.action,
        bestAccuracy: results[0]?.accuracy_percent
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /accuracy/by-pattern
 * Get prediction accuracy by incident pattern
 */
router.get('/accuracy/by-pattern', async (req, res, next) => {
  try {
    const { tenantId = 'default', timeRangeHours = 24 } = req.query;

    const results = await confidenceCalibrationService.getAccuracyByPattern(
      tenantId,
      parseInt(timeRangeHours)
    );

    res.json({
      success: true,
      tenantId,
      timeRangeHours: parseInt(timeRangeHours),
      results,
      summary: {
        patternsAnalyzed: results.length,
        averageAccuracy: results.length > 0
          ? Math.round(
              results.reduce((a, b) => a + b.accuracy_percent, 0) / results.length
            )
          : 0
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /calibration-data
 * Get raw calibration data (confidence vs effectiveness scatter points)
 */
router.get('/calibration-data', async (req, res, next) => {
  try {
    const { tenantId = 'default', limit = 50 } = req.query;

    const data = await confidenceCalibrationService.getConfidenceCalibrationData(
      tenantId,
      parseInt(limit)
    );

    // Calculate linear regression if we have enough data points
    let regression = null;
    if (data.length > 5) {
      const points = data.map(d => ({
        x: d.predicted_confidence,
        y: (d.actual_effectiveness_score / 100)
      }));

      const n = points.length;
      const sumX = points.reduce((a, p) => a + p.x, 0);
      const sumY = points.reduce((a, p) => a + p.y, 0);
      const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
      const sumX2 = points.reduce((a, p) => a + p.x * p.x, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      regression = {
        slope: Math.round(slope * 1000) / 1000,
        intercept: Math.round(intercept * 1000) / 1000,
        accuracy: slope > 0.8 && slope < 1.2 ? 'Well calibrated' : 'Needs recalibration'
      };
    }

    res.json({
      success: true,
      tenantId,
      sampleCount: data.length,
      calibrationData: data,
      regressionAnalysis: regression,
      interpretation: regression?.accuracy || 'Insufficient data for calibration analysis'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /trends
 * Get confidence and accuracy trends over time
 */
router.get('/trends', async (req, res, next) => {
  try {
    const { 
      tenantId = 'default', 
      intervalHours = 24, 
      periodsCount = 7 
    } = req.query;

    const trends = await confidenceCalibrationService.getConfidenceTrends(
      tenantId,
      parseInt(intervalHours),
      parseInt(periodsCount)
    );

    res.json({
      success: true,
      tenantId,
      intervalHours: parseInt(intervalHours),
      periods: trends.length,
      trends,
      summary: {
        latestAccuracy: trends[trends.length - 1]?.accuracyPercent,
        averageConfidence: trends.length > 0
          ? Math.round(
              trends.reduce((a, t) => a + t.avgConfidence, 0) / trends.length * 1000
            ) / 1000
          : 0,
        trend: trends.length >= 2
          ? (trends[trends.length - 1].accuracyPercent - trends[0].accuracyPercent) > 0
            ? 'Improving' 
            : 'Degrading'
          : 'No trend'
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /adjust-confidence
 * Apply calibrated weights to adjust a raw confidence score
 */
router.post('/adjust-confidence', async (req, res, next) => {
  try {
    const { tenantId = 'default', rawConfidence, factors } = req.body;

    if (rawConfidence === undefined || !factors) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: rawConfidence, factors'
      });
    }

    const result = await confidenceCalibrationService.adjustConfidenceScore(
      tenantId,
      rawConfidence,
      factors
    );

    res.json({
      success: true,
      data: result,
      message: `Confidence adjusted from ${Math.round(result.raw_confidence * 1000) / 10}% to ${Math.round(result.adjusted_confidence * 1000) / 10}%`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /stats
 * Get overall confidence calibration statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const { tenantId = 'default' } = req.query;

    const weights = await confidenceCalibrationService.getWeights(tenantId);
    const actionAccuracy = await confidenceCalibrationService.getAccuracyByAction(tenantId, 168); // 7 days
    const trends = await confidenceCalibrationService.getConfidenceTrends(tenantId, 24, 7);

    res.json({
      success: true,
      tenantId,
      overallMetrics: {
        totalPredictions: weights.total_predictions,
        correctPredictions: weights.correct_predictions,
        accuracyPercent: Math.round(weights.accuracy_percent * 10) / 10,
        falsePositives: weights.false_positives,
        falseNegatives: weights.false_negatives,
        precision: weights.total_predictions > 0
          ? Math.round((weights.correct_predictions / weights.total_predictions) * 10000) / 100
          : 0
      },
      currentWeights: weights.weights,
      factorPerformance: weights.factor_accuracy,
      topActions: actionAccuracy.slice(0, 5),
      recentTrend: trends.slice(-3),
      calibrationStatus: weights.accuracy_percent >= 80 ? 'Well calibrated' : 'Needs attention',
      nextRecalibrationDue: weights.last_calibrated_at 
        ? new Date(weights.last_calibrated_at.getTime() + weights.calibration_interval_hours * 3600000)
        : new Date()
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
