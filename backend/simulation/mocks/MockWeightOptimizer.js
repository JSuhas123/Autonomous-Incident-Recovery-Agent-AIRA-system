/**
 * Mock Weight Optimizer
 * 
 * Simulates an optimizer that learns weight adjustments from decision outcomes
 * Tracks factor accuracy and adjusts weights accordingly
 */
class MockWeightOptimizer {
  constructor(config = {}) {
    // Configuration
    this.updateThreshold = config.updateThreshold || 50; // Update weights every N outcomes
    this.maxWeightChange = config.maxWeightChange || 0.05; // Max 5% change per update
    this.minWeight = config.minWeight || 0.01;
    this.maxWeight = config.maxWeight || 1.0;

    // Tracking
    this.outcomeBuffer = [];
    this.factorAccuracies = {
      pattern_match: { correct: 0, total: 0 },
      historical_success: { correct: 0, total: 0 },
      signal_strength: { correct: 0, total: 0 },
      recency: { correct: 0, total: 0 },
      policy_alignment: { correct: 0, total: 0 },
    };

    this.optimizationHistory = [];
  }

  /**
   * Record an outcome from a decision
   * @param {object} decisionRecord - Decision record with confidence factors
   * @param {object} outcomeData - { success: boolean }
   */
  recordOutcome(decisionRecord, outcomeData) {
    this.outcomeBuffer.push({
      timestamp: new Date(),
      decisionRecord,
      success: outcomeData.success,
      factors: decisionRecord.factors,
    });

    // Update factor accuracies based on decision correctness
    if (decisionRecord.wasCorrect) {
      // Decision was correct - increase accuracy tracking for factors that contributed
      for (const factorName in decisionRecord.factors) {
        const factor = decisionRecord.factors[factorName];
        
        // Weight the accuracy by the factor's contribution
        const weight = factor.weight > 0 ? 1 : 0.5;
        
        this.factorAccuracies[factorName].correct += weight;
        this.factorAccuracies[factorName].total += 1;
      }
    } else {
      // Decision was wrong - still track but more conservatively
      for (const factorName in decisionRecord.factors) {
        this.factorAccuracies[factorName].total += 1;
      }
    }
  }

  /**
   * Check if enough outcomes have been recorded for optimization
   * @returns {boolean}
   */
  shouldOptimize() {
    return this.outcomeBuffer.length >= this.updateThreshold;
  }

  /**
   * Calculate accuracy for a specific factor
   * @param {string} factorName
   * @returns {number} - Accuracy between 0 and 1
   */
  getFactorAccuracy(factorName) {
    const stats = this.factorAccuracies[factorName];
    if (stats.total === 0) return 0.5; // Default to neutral if no data
    return stats.correct / stats.total;
  }

  /**
   * Apply optimized weights based on factor accuracies
   * @param {object} currentWeights - Current weight values
   * @param {object} confidenceService - Confidence service to update
   * @returns {object} - Optimization result
   */
  applyOptimizedWeights(currentWeights, confidenceService) {
    if (!this.shouldOptimize()) {
      return {
        applied: false,
        reason: `Buffer not full (${this.outcomeBuffer.length}/${this.updateThreshold})`,
      };
    }

    const previousWeights = { ...currentWeights };
    const newWeights = { ...currentWeights };
    const deltas = {};
    const factorAccuracies = {};

    // Calculate accuracy for each factor
    for (const factorName in currentWeights) {
      const accuracy = this.getFactorAccuracy(factorName);
      factorAccuracies[factorName] = accuracy;

      // Adjust weight based on accuracy
      // Higher accuracy = should increase weight (more influence)
      // Lower accuracy = should decrease weight (less influence)
      
      if (accuracy > 0.6) {
        // Good accuracy - increase weight
        const increase = this.maxWeightChange * (accuracy - 0.6) / 0.4;
        newWeights[factorName] = Math.min(
          this.maxWeight,
          previousWeights[factorName] * (1 + increase)
        );
      } else if (accuracy < 0.4) {
        // Poor accuracy - decrease weight
        const decrease = this.maxWeightChange * (0.4 - accuracy) / 0.4;
        newWeights[factorName] = Math.max(
          this.minWeight,
          previousWeights[factorName] * (1 - decrease)
        );
      }
      // If accuracy is 0.4-0.6, keep weight unchanged

      deltas[factorName] = newWeights[factorName] - previousWeights[factorName];
    }

    // Normalize weights to maintain sum (optional, for interpretability)
    const sum = Object.values(newWeights).reduce((a, b) => a + b, 0);
    if (sum > 0) {
      for (const key in newWeights) {
        newWeights[key] = newWeights[key] / sum * Object.keys(newWeights).length / 5;
      }
    }

    // Generate reasoning
    const reasoning = this._generateReasoning(factorAccuracies, deltas);

    // Record this optimization
    const optimizationRecord = {
      timestamp: new Date(),
      previousWeights,
      newWeights,
      deltas,
      factorAccuracies,
      reasoning,
      outcomeCount: this.outcomeBuffer.length,
    };
    this.optimizationHistory.push(optimizationRecord);

    // Clear outcome buffer for next cycle
    this.outcomeBuffer = [];

    // Reset factor accuracies for next cycle
    for (const key in this.factorAccuracies) {
      this.factorAccuracies[key] = { correct: 0, total: 0 };
    }

    return {
      applied: true,
      previousWeights,
      newWeights,
      changeRecord: {
        deltas,
        factorAccuracies,
        reasoning,
      },
    };
  }

  /**
   * Generate human-readable reasoning for weight changes
   * @private
   */
  _generateReasoning(factorAccuracies, deltas) {
    const improved = [];
    const diminished = [];

    for (const [factor, delta] of Object.entries(deltas)) {
      if (delta > 0.001) {
        improved.push(`${factor} (+${(delta * 100).toFixed(1)}%)`);
      } else if (delta < -0.001) {
        diminished.push(`${factor} (${(delta * 100).toFixed(1)}%)`);
      }
    }

    let reasoning = 'Weight adjustment based on factor accuracy: ';
    
    if (improved.length > 0) {
      reasoning += `↑ ${improved.join(', ')}`;
    }
    
    if (diminished.length > 0) {
      if (improved.length > 0) reasoning += '; ';
      reasoning += `↓ ${diminished.join(', ')}`;
    }

    if (improved.length === 0 && diminished.length === 0) {
      reasoning += 'All factors converged at optimal accuracy levels';
    }

    return reasoning;
  }

  /**
   * Get optimization history
   * @returns {array}
   */
  getOptimizationHistory() {
    return this.optimizationHistory;
  }

  /**
   * Get current factor accuracies
   * @returns {object}
   */
  getCurrentAccuracies() {
    const accuracies = {};
    for (const [key, stats] of Object.entries(this.factorAccuracies)) {
      accuracies[key] = stats.total > 0 ? stats.correct / stats.total : 0.5;
    }
    return accuracies;
  }

  /**
   * Reset optimizer state
   */
  reset() {
    this.outcomeBuffer = [];
    this.factorAccuracies = {
      pattern_match: { correct: 0, total: 0 },
      historical_success: { correct: 0, total: 0 },
      signal_strength: { correct: 0, total: 0 },
      recency: { correct: 0, total: 0 },
      policy_alignment: { correct: 0, total: 0 },
    };
    this.optimizationHistory = [];
  }

  /**
   * Get summary statistics
   * @returns {object}
   */
  getSummary() {
    return {
      totalOptimizations: this.optimizationHistory.length,
      outcomesRecorded: this.outcomeBuffer.length,
      currentAccuracies: this.getCurrentAccuracies(),
      lastOptimization: this.optimizationHistory.length > 0 
        ? this.optimizationHistory[this.optimizationHistory.length - 1]
        : null,
    };
  }
}

module.exports = MockWeightOptimizer;
