/**
 * Confidence Weight Optimizer
 * Adaptively adjusts confidence weights based on historical outcomes
 * Uses transparent, auditable algorithms - NO black-box ML
 * 
 * Algorithm: Outcome-Weighted Adjustment
 * - Tracks success/failure rates for each weight factor
 * - Increases weight for factors that correlate with good outcomes
 * - Decreases weight for factors that fail to predict outcomes
 * - Ensures weights always sum to 1.0
 * - Logs all changes with reasoning
 */

class ConfidenceWeightOptimizer {
  constructor() {
    // Default baseline weights
    this.baselineWeights = {
      pattern_match: 0.40,
      historical_success: 0.30,
      signal_strength: 0.15,
      recency: 0.10,
      policy_alignment: 0.05,
    };

    // Track factor effectiveness
    this.factorEffectiveness = {
      pattern_match: { predictions: 0, correct: 0, accuracy: 0.5 },
      historical_success: { predictions: 0, correct: 0, accuracy: 0.5 },
      signal_strength: { predictions: 0, correct: 0, accuracy: 0.5 },
      recency: { predictions: 0, correct: 0, accuracy: 0.5 },
      policy_alignment: { predictions: 0, correct: 0, accuracy: 0.5 },
    };

    // Track total outcomes recorded
    this.totalOutcomesRecorded = 0;

    // Weight change history for auditing
    this.weightHistory = [];

    // Configuration
    this.minAdjustment = 0.01; // Don't adjust if change < 1%
    this.maxWeightChange = 0.05; // Never change a weight by more than 5% per update
    this.updateThreshold = 10; // Need at least 10 outcomes before adjusting
  }

  /**
   * Record an outcome (decision with result)
   * Called after an action completes with success/failure
   */
  recordOutcome(decisionData, outcome) {
    if (!decisionData.factors) {
      return;
    }

    // Increment outcome counter
    this.totalOutcomesRecorded++;

    const wasSuccessful = outcome.success === true;

    // Update effectiveness for each factor that contributed
    Object.keys(decisionData.factors).forEach((factorName) => {
      const factor = decisionData.factors[factorName];
      const accuracy = this.factorEffectiveness[factorName];

      if (accuracy) {
        accuracy.predictions++;
        
        // If this factor was "confident" and outcome matched, increment correct
        if (factor.value > 0.6 && wasSuccessful) {
          accuracy.correct++;
        } else if (factor.value <= 0.6 && !wasSuccessful) {
          // If factor was "not confident" and action failed, that's also correct
          accuracy.correct++;
        }

        // Calculate rolling accuracy
        accuracy.accuracy =
          accuracy.predictions > 0 ? accuracy.correct / accuracy.predictions : 0.5;
      }
    });
  }

  /**
   * Get current optimized weights
   * Calculates weights based on factor effectiveness
   * Returns null if not enough data for adjustment
   */
  getOptimizedWeights(minOutcomesRequired = this.updateThreshold) {
    // Not enough data yet
    if (this.totalOutcomesRecorded < minOutcomesRequired) {
      return null;
    }

    const newWeights = this._calculateOptimizedWeights();
    return newWeights;
  }

  /**
   * Core optimization algorithm
   * Transparent formula: Weight ∝ (Baseline × Effectiveness)
   */
  _calculateOptimizedWeights() {
    // Step 1: Calculate effectiveness scores (0-1)
    const effectivenessScores = {};
    
    Object.keys(this.factorEffectiveness).forEach((factor) => {
      const eff = this.factorEffectiveness[factor];
      // Effectiveness = how well this factor predicted outcomes
      // Clamp to prevent extreme swings
      effectivenessScores[factor] = Math.max(0.3, Math.min(0.9, eff.accuracy));
    });

    // Step 2: Weight adjustment formula
    // New weight = Baseline × Effectiveness / Sum(Baseline × Effectiveness)
    const adjustedWeights = {};
    let sumAdjusted = 0;

    Object.keys(this.baselineWeights).forEach((factor) => {
      const baseline = this.baselineWeights[factor];
      const effectiveness = effectivenessScores[factor];
      adjustedWeights[factor] = baseline * effectiveness;
      sumAdjusted += adjustedWeights[factor];
    });

    // Step 3: Normalize to sum to 1.0
    const normalizedWeights = {};
    Object.keys(adjustedWeights).forEach((factor) => {
      normalizedWeights[factor] = adjustedWeights[factor] / sumAdjusted;
    });

    return normalizedWeights;
  }

  /**
   * Apply optimized weights with constraints and auditing
   */
  applyOptimizedWeights(currentWeights, confidenceService) {
    const optimizedWeights = this.getOptimizedWeights();

    if (!optimizedWeights) {
      // Not enough data yet
      return {
        applied: false,
        reason: "Insufficient outcome data for weight optimization",
        outcomesRecorded: this.totalOutcomesRecorded,
        requiredForOptimization: this.updateThreshold,
      };
    }

    // Check if changes are significant enough
    const changes = this._calculateWeightDeltas(currentWeights, optimizedWeights);
    const maxDelta = Math.max(...Object.values(changes).map(Math.abs));

    if (maxDelta < this.minAdjustment) {
      return {
        applied: false,
        reason: "Weight changes below minimum threshold (< 1%)",
        maxChange: maxDelta,
      };
    }

    // Apply constraints: don't change more than maxWeightChange per update
    const constrainedWeights = this._constrainWeightChanges(
      currentWeights,
      optimizedWeights
    );

    // Update confidence service
    confidenceService.updateWeights(constrainedWeights);

    // Record to history
    const changeRecord = {
      timestamp: new Date(),
      outcomesProcessed: this.totalOutcomesRecorded,
      previousWeights: { ...currentWeights },
      newWeights: { ...constrainedWeights },
      deltas: this._calculateWeightDeltas(currentWeights, constrainedWeights),
      factorAccuracies: { ...this.factorEffectiveness },
      reasoning: this._generateReasoningExplanation(constrainedWeights),
    };

    this.weightHistory.push(changeRecord);

    return {
      applied: true,
      previousWeights: currentWeights,
      newWeights: constrainedWeights,
      changeRecord,
    };
  }

  /**
   * Calculate deltas between two weight configurations
   */
  _calculateWeightDeltas(oldWeights, newWeights) {
    const deltas = {};
    Object.keys(oldWeights).forEach((factor) => {
      deltas[factor] =
        ((newWeights[factor] - oldWeights[factor]) / oldWeights[factor]) * 100;
    });
    return deltas;
  }

  /**
   * Apply maximum change constraint to prevent wild swings
   */
  _constrainWeightChanges(current, optimized) {
    const constrained = { ...current };

    Object.keys(current).forEach((factor) => {
      const delta = Math.abs(optimized[factor] - current[factor]);

      if (delta > this.maxWeightChange) {
        // Cap the change at maxWeightChange
        if (optimized[factor] > current[factor]) {
          constrained[factor] = current[factor] + this.maxWeightChange;
        } else {
          constrained[factor] = current[factor] - this.maxWeightChange;
        }
      } else {
        constrained[factor] = optimized[factor];
      }
    });

    // Normalize to ensure sum = 1.0
    const sum = Object.values(constrained).reduce((a, b) => a + b, 0);
    Object.keys(constrained).forEach((factor) => {
      constrained[factor] = constrained[factor] / sum;
    });

    return constrained;
  }

  /**
   * Generate human-readable explanation of weight changes
   */
  _generateReasoningExplanation(weights) {
    const ordered = Object.entries(weights)
      .sort(([, a], [, b]) => b - a)
      .map(([name, weight]) => `${name} (${(weight * 100).toFixed(1)}%)`);

    return `Weights optimized based on historical outcome data. ` +
      `Priority order: ${ordered.join(', ')}`;
  }

  /**
   * Get optimization metrics for monitoring
   */
  getMetrics() {
    return {
      totalOutcomesRecorded: this.totalOutcomesRecorded,
      factorAccuracies: { ...this.factorEffectiveness },
      weightHistoryLength: this.weightHistory.length,
      lastWeightUpdate: this.weightHistory[this.weightHistory.length - 1] || null,
      configuration: {
        minAdjustment: this.minAdjustment,
        maxWeightChange: this.maxWeightChange,
        updateThreshold: this.updateThreshold,
      },
    };
  }

  /**
   * Get weight change history for auditing
   */
  getWeightHistory(limit = 20) {
    return this.weightHistory.slice(-limit);
  }

  /**
   * Reset optimizer to baseline
   */
  resetToBaseline() {
    Object.keys(this.factorEffectiveness).forEach((factor) => {
      this.factorEffectiveness[factor] = {
        predictions: 0,
        correct: 0,
        accuracy: 0.5,
      };
    });
    this.totalOutcomesRecorded = 0;
    this.weightHistory = [];
  }

  /**
   * Alias for resetToBaseline for backward compatibility
   */
  reset() {
    return this.resetToBaseline();
  }
}

module.exports = ConfidenceWeightOptimizer;
