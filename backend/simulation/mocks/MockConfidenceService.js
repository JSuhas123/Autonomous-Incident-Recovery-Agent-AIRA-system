/**
 * Mock Confidence Service
 * 
 * Simulates the real ConfidenceService but with adjustable weights
 * for testing convergence and learning behavior
 */
class MockConfidenceService {
  constructor(initialWeights = null) {
    // Default initial weights (equal distribution)
    this.weights = initialWeights || {
      pattern_match: 0.2,
      historical_success: 0.2,
      signal_strength: 0.2,
      recency: 0.2,
      policy_alignment: 0.2,
    };

    // Track weight history for convergence analysis
    this.weightHistory = [{ ...this.weights }];
    this.updateCount = 0;
  }

  /**
   * Calculate confidence score based on factors and current weights
   * @param {object} factors - Confidence factors (pattern_match, historical_success, etc.)
   * @returns {number} - Confidence score between 0 and 1
   */
  calculateConfidence(factors) {
    const score = 
      factors.pattern_match * this.weights.pattern_match +
      factors.historical_success * this.weights.historical_success +
      factors.signal_strength * this.weights.signal_strength +
      factors.recency * this.weights.recency +
      factors.policy_alignment * this.weights.policy_alignment;

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Evaluate confidence level based on score
   * @param {number} score - Confidence score
   * @returns {string} - Confidence level (VERY_LOW, LOW, MEDIUM, HIGH, VERY_HIGH)
   */
  evaluateConfidence(score) {
    if (score >= 0.8) {
      return {
        level: 'VERY_HIGH',
        description: 'Extremely confident in decision',
        recommendedAction: 'APPROVE',
      };
    } else if (score >= 0.6) {
      return {
        level: 'HIGH',
        description: 'Confident in decision',
        recommendedAction: 'APPROVE',
      };
    } else if (score >= 0.4) {
      return {
        level: 'MEDIUM',
        description: 'Moderate confidence in decision',
        recommendedAction: 'REVIEW',
      };
    } else if (score >= 0.2) {
      return {
        level: 'LOW',
        description: 'Low confidence in decision',
        recommendedAction: 'ESCALATE',
      };
    } else {
      return {
        level: 'VERY_LOW',
        description: 'Very low confidence in decision',
        recommendedAction: 'BLOCK',
      };
    }
  }

  /**
   * Update a specific weight
   * @param {string} factorName - Name of the factor to update
   * @param {number} newValue - New weight value
   */
  updateWeight(factorName, newValue) {
    if (!(factorName in this.weights)) {
      throw new Error(`Unknown factor: ${factorName}`);
    }

    const clampedValue = Math.max(0, Math.min(1, newValue));
    this.weights[factorName] = clampedValue;
    this.updateCount++;
    this.weightHistory.push({ ...this.weights });
  }

  /**
   * Set all weights at once
   * @param {object} newWeights - New weights object
   */
  setWeights(newWeights) {
    for (const key in newWeights) {
      if (key in this.weights) {
        this.weights[key] = Math.max(0, Math.min(1, newWeights[key]));
      }
    }
    this.updateCount++;
    this.weightHistory.push({ ...this.weights });
  }

  /**
   * Get current weights
   * @returns {object} - Current weights
   */
  getWeights() {
    return { ...this.weights };
  }

  /**
   * Get weight update history
   * @returns {array} - Array of weight snapshots
   */
  getWeightHistory() {
    return this.weightHistory.map(w => ({ ...w }));
  }

  /**
   * Reset weights to initial state
   */
  reset(newInitialWeights = null) {
    this.weights = newInitialWeights || {
      pattern_match: 0.2,
      historical_success: 0.2,
      signal_strength: 0.2,
      recency: 0.2,
      policy_alignment: 0.2,
    };
    this.weightHistory = [{ ...this.weights }];
    this.updateCount = 0;
  }

  /**
   * Get statistics about weight changes
   * @returns {object} - Weight statistics
   */
  getWeightStatistics() {
    if (this.weightHistory.length < 2) {
      return {
        totalUpdates: 0,
        averageChange: 0,
        maxChangePerUpdate: 0,
        convergenceIndicator: 0,
      };
    }

    const changes = [];
    for (let i = 1; i < this.weightHistory.length; i++) {
      const prev = this.weightHistory[i - 1];
      const curr = this.weightHistory[i];
      const change = Object.keys(this.weights).reduce((sum, key) => {
        return sum + Math.abs(curr[key] - prev[key]);
      }, 0);
      changes.push(change);
    }

    const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
    const maxChange = Math.max(...changes);

    // Convergence indicator: lower is more converged (0-1)
    const convergence = Math.min(avgChange * 10, 1);

    return {
      totalUpdates: this.weightHistory.length - 1,
      averageChange: avgChange,
      maxChangePerUpdate: maxChange,
      convergenceIndicator: convergence,
      recentChanges: changes.slice(-5),
    };
  }
}

module.exports = MockConfidenceService;
