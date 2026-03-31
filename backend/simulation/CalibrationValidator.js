/**
 * Calibration Validator
 * Validates that confidence scores align with actual outcomes
 * Calibration check: does HIGH confidence → high success rate?
 *                    does LOW confidence → lower success rate?
 */

class CalibrationValidator {
  constructor(config = {}) {
    this.config = {
      confidenceBins: config.confidenceBins || 5, // Divide into 5 bins (0-1)
      minSamplesPerBin: config.minSamplesPerBin || 20,
      calibrationTarget: config.calibrationTarget || 0.85, // Want >85% calibration
      ...config,
    };
  }

  /**
   * Validate calibration across all decisions
   * Returns calibration score and breakdown by confidence level
   */
  validateCalibration(calibrationData, decisionHistory) {
    if (calibrationData.length === 0) {
      return {
        calibrationScore: null,
        status: 'INSUFFICIENT_DATA',
        message: 'No calibration data available',
      };
    }

    const binAnalysis = this._binByConfidence(calibrationData);
    const calibrationMetrics = this._calculateCalibrationMetrics(binAnalysis);
    const expectedVsActual = this._compareExpectedVsActual(binAnalysis);
    const calibrationCurve = this._generateCalibrationCurve(binAnalysis);
    const reliability = this._analyzeReliability(binAnalysis, decisionHistory);

    const calibrationScore = this._calculateOverallScore(calibrationMetrics);
    const status = this._determineCalibrationStatus(calibrationScore);

    return {
      calibrationScore: calibrationScore.toFixed(4),
      status,
      binAnalysis,
      calibrationMetrics,
      expectedVsActual,
      calibrationCurve,
      reliability,
      recommendations: this._generateRecommendations(
        calibrationScore,
        calibrationMetrics,
        reliability
      ),
    };
  }

  /**
   * Bin decisions by confidence level
   */
  _binByConfidence(calibrationData) {
    const bins = Array(this.config.confidenceBins)
      .fill(null)
      .map(() => ({
        decisions: [],
        successes: 0,
        failures: 0,
        confidence: 0,
      }));

    const binSize = 1.0 / this.config.confidenceBins;

    calibrationData.forEach(record => {
      const binIndex = Math.min(
        this.config.confidenceBins - 1,
        Math.floor(record.confidence / binSize)
      );

      bins[binIndex].decisions.push(record);
      if (record.outcome === 1) {
        bins[binIndex].successes++;
      } else {
        bins[binIndex].failures++;
      }
    });

    // Calculate bin statistics
    return bins.map((bin, index) => {
      const successRate = bin.decisions.length > 0
        ? bin.successes / bin.decisions.length
        : 0;

      const avgConfidence = bin.decisions.length > 0
        ? bin.decisions.reduce((sum, d) => sum + d.confidence, 0) / bin.decisions.length
        : 0;

      const avgRecoveryTime = bin.decisions.length > 0
        ? bin.decisions.reduce((sum, d) => sum + d.timeToRecoveryMs, 0) / bin.decisions.length
        : 0;

      return {
        binIndex: index,
        confidenceRange: `${(binSize * index).toFixed(2)}-${(binSize * (index + 1)).toFixed(2)}`,
        confidenceRangePercent: `${(binSize * index * 100).toFixed(0)}-${(binSize * (index + 1) * 100).toFixed(0)}%`,
        count: bin.decisions.length,
        successes: bin.successes,
        failures: bin.failures,
        successRate: successRate.toFixed(4),
        successRatePercent: (successRate * 100).toFixed(1) + '%',
        avgConfidence: avgConfidence.toFixed(4),
        avgRecoveryTimeMs: Math.round(avgRecoveryTime),
      };
    }).filter(bin => bin.count >= this.config.minSamplesPerBin || bin.count > 0);
  }

  /**
   * Calculate calibration metrics
   */
  _calculateCalibrationMetrics(binAnalysis) {
    const metrics = {};
    let totalAbsError = 0;
    let validBins = 0;

    binAnalysis.forEach(bin => {
      // Expected success rate (confidence) vs actual success rate
      const expectedRate = parseFloat(bin.avgConfidence);
      const actualRate = parseFloat(bin.successRate);
      const error = Math.abs(expectedRate - actualRate);

      metrics[`bin_${bin.binIndex}`] = {
        confidenceRange: bin.confidenceRange,
        expectedRate: expectedRate.toFixed(4),
        actualRate: actualRate.toFixed(4),
        error: error.toFixed(4),
        errorPercent: (error * 100).toFixed(2) + '%',
        sampleCount: bin.count,
      };

      totalAbsError += error;
      validBins++;
    });

    const meanAbsoluteError = validBins > 0 ? totalAbsError / validBins : 0;

    return {
      meanAbsoluteError: meanAbsoluteError.toFixed(4),
      meanAbsoluteErrorPercent: (meanAbsoluteError * 100).toFixed(2) + '%',
      binMetrics: metrics,
      totalBinsAnalyzed: validBins,
    };
  }

  /**
   * Compare expected (confidence) vs actual (outcomes) success rates
   */
  _compareExpectedVsActual(binAnalysis) {
    return binAnalysis.map(bin => ({
      confidenceRange: bin.confidenceRange,
      expected: parseFloat(bin.avgConfidence).toFixed(4),
      actual: parseFloat(bin.successRate).toFixed(4),
      match: Math.abs(parseFloat(bin.avgConfidence) - parseFloat(bin.successRate)) < 0.1,
    }));
  }

  /**
   * Generate calibration curve (for plotting)
   */
  _generateCalibrationCurve(binAnalysis) {
    // Perfect calibration would be a diagonal line from (0,0) to (1,1)
    return binAnalysis.map(bin => ({
      confidenceMidpoint: (parseFloat(bin.confidenceRange.split('-')[0]) + parseFloat(bin.confidenceRange.split('-')[1])) / 2,
      expectedRate: parseFloat(bin.avgConfidence),
      actualRate: parseFloat(bin.successRate),
      distance: Math.abs(parseFloat(bin.avgConfidence) - parseFloat(bin.successRate)),
    }));
  }

  /**
   * Analyze reliability across different confidence ranges
   */
  _analyzeReliability(binAnalysis, decisionHistory) {
    // High confidence decisions should have high success rate
    const highConfidenceBins = binAnalysis.filter(b => parseFloat(b.avgConfidence) >= 0.7);
    const lowConfidenceBins = binAnalysis.filter(b => parseFloat(b.avgConfidence) < 0.4);

    const highConfidenceSuccessRate = highConfidenceBins.length > 0
      ? highConfidenceBins.reduce((sum, b) => sum + parseFloat(b.successRate), 0) / highConfidenceBins.length
      : 0;

    const lowConfidenceSuccessRate = lowConfidenceBins.length > 0
      ? lowConfidenceBins.reduce((sum, b) => sum + parseFloat(b.successRate), 0) / lowConfidenceBins.length
      : 0;

    // System is reliable if high confidence → high success AND low confidence → lower success
    const hasProperOrderingType = highConfidenceSuccessRate > lowConfidenceSuccessRate ? 'PROPER' : 'INVERTED';
    const successRateDifference = highConfidenceSuccessRate - lowConfidenceSuccessRate;

    return {
      highConfidenceDecisions: {
        count: highConfidenceBins.reduce((sum, b) => sum + b.count, 0),
        avgSuccessRate: highConfidenceSuccessRate.toFixed(4),
        avgSuccessRatePercent: (highConfidenceSuccessRate * 100).toFixed(1) + '%',
      },
      lowConfidenceDecisions: {
        count: lowConfidenceBins.reduce((sum, b) => sum + b.count, 0),
        avgSuccessRate: lowConfidenceSuccessRate.toFixed(4),
        avgSuccessRatePercent: (lowConfidenceSuccessRate * 100).toFixed(1) + '%',
      },
      orderingType: hasProperOrderingType,
      successRateDifference: successRateDifference.toFixed(4),
      reliability: hasProperOrderingType === 'PROPER' 
        ? 'RELIABLE'
        : 'UNRELIABLE',
    };
  }

  /**
   * Calculate overall calibration score (0-1)
   * Higher = better calibrated
   */
  _calculateOverallScore(metrics) {
    // Score based on mean absolute error
    // 0% error = 1.0, 50% error = 0.5, etc.
    const mae = parseFloat(metrics.meanAbsoluteError);
    return Math.max(0, 1.0 - mae);
  }

  /**
   * Determine calibration status
   */
  _determineCalibrationStatus(score) {
    if (score >= 0.9) return 'EXCELLENT';
    if (score >= 0.8) return 'GOOD';
    if (score >= 0.65) return 'ACCEPTABLE';
    if (score >= 0.5) return 'POOR';
    return 'VERY_POOR';
  }

  /**
   * Generate recommendations
   */
  _generateRecommendations(score, metrics, reliability) {
    const recommendations = [];

    if (score >= 0.8) {
      recommendations.push('✅ Excellent calibration - confidence aligns well with outcomes.');
    } else if (score >= 0.65) {
      recommendations.push('⚠️  Acceptable calibration with some drift - monitor for improvement.');
    } else {
      recommendations.push('❌ Poor calibration - confidence does not align with outcomes.');
      recommendations.push('   Consider retraining weights or adjusting confidence thresholds.');
    }

    if (reliability.orderingType === 'INVERTED') {
      recommendations.push(
        '🔄 WARNING: High confidence → lower success rate (inverted ordering).'
      );
      recommendations.push(
        '   System may be overconfident in wrong cases. Review factors.'
      );
    }

    const bins = Object.values(metrics.binMetrics);
    const worstBin = bins.reduce((max, bin) => 
      parseFloat(bin.error) > parseFloat(max.error) ? bin : max
    );

    recommendations.push(
      `📊 Largest calibration gap: ${worstBin.confidenceRange} with ${worstBin.errorPercent} error`
    );

    return recommendations;
  }
}

module.exports = CalibrationValidator;
