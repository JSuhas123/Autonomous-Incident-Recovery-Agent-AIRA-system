/**
 * ISSUE #9 FIX: Confidence Service Learning Algorithm
 * 
 * BUG: The learning algorithm was backwards in measuring factor effectiveness.
 * 
 * ORIGINAL BUGGY LOGIC:
 * - Counted a factor as "correct" if: (factor confident AND action succeeded) OR (factor not confident AND action failed)
 * - This doesn't actually measure if the factor was PREDICTIVE - just agrees with outcome
 * 
 * CORRECT LOGIC:
 * - A factor is predictive if: high factor value → good decisions AND low factor value → bad decisions
 * - Measure actual predictiveness, not agreement with outcome
 * - Use correlation analysis to properly weight factors
 */

class FixedConfidenceWeightOptimizer {
  constructor() {
    this.baselineWeights = {
      pattern_match: 0.40,
      historical_success: 0.30,
      signal_strength: 0.15,
      recency: 0.10,
      policy_alignment: 0.05,
    };

    // FIXED: Track factor performance with correct metrics
    this.factorPerformance = {
      pattern_match: {
        successWhenHigh: 0,      // High value → succeeded
        successWhenLow: 0,       // Low value → succeeded (bad!)
        failureWhenHigh: 0,      // High value → failed (bad!)
        failureWhenLow: 0,       // Low value → failed (expected)
        correlationScore: 0.5,   // How strongly does this predict?
      },
      historical_success: { 
        successWhenHigh: 0, 
        successWhenLow: 0, 
        failureWhenHigh: 0, 
        failureWhenLow: 0, 
        correlationScore: 0.5 
      },
      signal_strength: { 
        successWhenHigh: 0, 
        successWhenLow: 0, 
        failureWhenHigh: 0, 
        failureWhenLow: 0, 
        correlationScore: 0.5 
      },
      recency: { 
        successWhenHigh: 0, 
        successWhenLow: 0, 
        failureWhenHigh: 0, 
        failureWhenLow: 0, 
        correlationScore: 0.5 
      },
      policy_alignment: { 
        successWhenHigh: 0, 
        successWhenLow: 0, 
        failureWhenHigh: 0, 
        failureWhenLow: 0, 
        correlationScore: 0.5 
      },
    };

    this.totalOutcomes = 0;
    this.weightHistory = [];
    this.updateThreshold = 20; // Need 20 outcomes before adjusting
  }

  /**
   * FIXED: Record outcome with proper correlation tracking
   * 
   * For each factor:
   * - If factor.value was HIGH (>0.6) and action succeeded → favorable outcome
   * - If factor.value was HIGH (>0.6) and action failed → adverse outcome (factor wrong!)
   * - If factor.value was LOW (<0.6) and action succeeded → factor missed opportunity (wrong!)
   * - If factor.value was LOW (<0.6) and action failed → expected outcome (correct direction)
   * 
   * The correlation score measures: "How well does high value → success mapping hold?"
   */
  recordOutcome(decisionData, outcome) {
    if (!decisionData.factors) {
      return;
    }

    this.totalOutcomes++;
    const wasSuccessful = outcome.success === true;

    Object.keys(decisionData.factors).forEach((factorName) => {
      const factor = decisionData.factors[factorName];
      const performance = this.factorPerformance[factorName];

      if (!performance) return;

      const isHighValue = factor.value > 0.6;

      // FIXED: Track outcomes correctly
      if (isHighValue && wasSuccessful) {
        performance.successWhenHigh++;  // Factor predicted well ✓
      } else if (isHighValue && !wasSuccessful) {
        performance.failureWhenHigh++;  // Factor was wrong ✗
      } else if (!isHighValue && wasSuccessful) {
        performance.successWhenLow++;   // Factor missed opportunity ✗
      } else if (!isHighValue && !wasSuccessful) {
        performance.failureWhenLow++;   // Factor predicted well ✓
      }

      // Recalculate correlation
      this._updateCorrelationScore(performance);
    });
  }

  /**
   * FIXED: Calculate proper correlation score
   * 
   * Correlation = (Correct Predictions) / (Total Predictions)
   * 
   * Correct = when high value → success OR when low value → failure
   * Incorrect = when high value → failure OR when low value → success
   */
  _updateCorrelationScore(performance) {
    const correctPredictions = 
      performance.successWhenHigh + performance.failureWhenLow;
    const totalPredictions = 
      performance.successWhenHigh + 
      performance.successWhenLow + 
      performance.failureWhenHigh + 
      performance.failureWhenLow;

    if (totalPredictions === 0) {
      performance.correlationScore = 0.5; // Neutral
      return;
    }

    // Correlation: how often high value predicts success (and low predicts failure)
    performance.correlationScore = correctPredictions / totalPredictions;
  }

  /**
   * FIXED: Calculate optimized weights based on correlation
   * 
   * Factors with higher correlation scores should get higher weights
   * A factor with 70% correlation is trustworthy
   * A factor with 50% correlation is random noise
   */
  getOptimizedWeights() {
    if (this.totalOutcomes < this.updateThreshold) {
      return null; // Not enough data
    }

    // Get correlation scores for all factors
    const correlations = {};
    Object.keys(this.factorPerformance).forEach((factor) => {
      correlations[factor] = this.factorPerformance[factor].correlationScore;
    });

    // Initialize new weights from baseline
    const newWeights = { ...this.baselineWeights };

    // Adjust based on correlation relative to neutral (0.5)
    // A correlation of 0.7 means this factor is 40% better than random
    // A correlation of 0.4 means this factor is 20% worse than random
    const totalUtility = Object.keys(correlations).reduce((sum, factor) => {
      const correlation = correlations[factor];
      const baseline = this.baselineWeights[factor];
      
      // Utility = how much this factor helps compared to baseline
      // High correlation (>0.6) = boost weight
      // Low correlation (<0.4) = reduce weight
      const utility = baseline * (correlation / 0.5); // Normalize to 0.5 baseline
      return sum + utility;
    }, 0);

    // Normalize weights to sum to 1.0
    Object.keys(newWeights).forEach((factor) => {
      const correlation = correlations[factor];
      const baseline = this.baselineWeights[factor];
      const utility = baseline * (correlation / 0.5);
      newWeights[factor] = utility / totalUtility;
    });

    return newWeights;
  }

  /**
   * Apply optimized weights with auditing
   */
  applyOptimizedWeights(currentWeights, confidenceService) {
    const optimized = this.getOptimizedWeights();

    if (!optimized) {
      return {
        applied: false,
        reason: "Insufficient outcome data",
        recordedOutcomes: this.totalOutcomes,
        requiredOutcomes: this.updateThreshold,
      };
    }

    // Apply new weights
    confidenceService.updateWeights(optimized);

    // Record to history
    const record = {
      timestamp: new Date(),
      outcomesProcessed: this.totalOutcomes,
      previousWeights: { ...currentWeights },
      newWeights: { ...optimized },
      factorCorrelations: {},
      reasoning: "",
    };

    // Track correlations for each factor
    Object.keys(this.factorPerformance).forEach((factor) => {
      const perf = this.factorPerformance[factor];
      record.factorCorrelations[factor] = {
        correlation: perf.correlationScore,
        successWhenHigh: perf.successWhenHigh,
        failureWhenHigh: perf.failureWhenHigh,
        successWhenLow: perf.successWhenLow,
        failureWhenLow: perf.failureWhenLow,
      };
    });

    // Generate explanation
    const ordered = Object.entries(optimized)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name, weight]) => `${name} (${(weight * 100).toFixed(1)}%)`);

    record.reasoning = `Weights adjusted based on factor predictiveness. ` +
      `Top factors: ${ordered.join(', ')}`;

    this.weightHistory.push(record);

    return {
      applied: true,
      previousWeights: currentWeights,
      newWeights: optimized,
      record,
    };
  }

  /**
   * Get factor effectiveness for monitoring
   */
  getFactorEffectiveness() {
    const effectiveness = {};
    
    Object.keys(this.factorPerformance).forEach((factor) => {
      const perf = this.factorPerformance[factor];
      const total = 
        perf.successWhenHigh + perf.failureWhenHigh + 
        perf.successWhenLow + perf.failureWhenLow;

      effectiveness[factor] = {
        correlation: perf.correlationScore,
        predictiveAccuracy: `${(perf.correlationScore * 100).toFixed(1)}%`,
        totalSamples: total,
        interpretation: 
          perf.correlationScore > 0.65 ? "HIGHLY PREDICTIVE" :
          perf.correlationScore > 0.55 ? "MODERATELY PREDICTIVE" :
          perf.correlationScore < 0.45 ? "LOW PREDICTIVE VALUE" :
          "NEUTRAL/RANDOM",
      };
    });

    return effectiveness;
  }

  /**
   * Get weight history for auditing
   */
  getWeightHistory(limit = 20) {
    return this.weightHistory.slice(-limit);
  }

  /**
   * Reset to baseline
   */
  reset() {
    Object.keys(this.factorPerformance).forEach((factor) => {
      this.factorPerformance[factor] = {
        successWhenHigh: 0,
        successWhenLow: 0,
        failureWhenHigh: 0,
        failureWhenLow: 0,
        correlationScore: 0.5,
      };
    });
    this.totalOutcomes = 0;
    this.weightHistory = [];
  }
}

module.exports = FixedConfidenceWeightOptimizer;
