/**
 * Enhanced Confidence Service
 * Calculates confidence with weighted, explainable factors
 * Each component contributes a portion to final confidence
 */

class ConfidenceService {
  constructor() {
    // Default weights (must sum to 1.0)
    this.weights = {
      pattern_match: 0.4,      // How well signal matches known patterns
      historical_success: 0.3, // Success rate of similar past actions
      signal_strength: 0.15,   // Signal clarity and certainty
      recency: 0.1,           // How recent are relevant patterns
      policy_alignment: 0.05, // How well action aligns with policy
    };
  }

  /**
   * Calculate confidence with breakdown
   * Returns score (0-1) and detailed factors
   */
  async calculateConfidence(analysisResult, memoryService, policyMatch) {
    try {
      // Extract individual factors
      const patternMatch = this._getPatternMatchScore(analysisResult);
      const historicalSuccess = await this._getHistoricalSuccessScore(
        analysisResult,
        memoryService
      );
      const signalStrength = this._getSignalStrengthScore(analysisResult);
      const recency = this._getRecencyScore(analysisResult);
      const policyAlignment = policyMatch ? 0.8 : 0.2;

      // Weighted calculation
      const confidence =
        patternMatch * this.weights.pattern_match +
        historicalSuccess * this.weights.historical_success +
        signalStrength * this.weights.signal_strength +
        recency * this.weights.recency +
        policyAlignment * this.weights.policy_alignment;

      return {
        score: Math.min(Math.max(confidence, 0), 1), // Clamp 0-1
        level: this._getConfidenceLevel(confidence),
        factors: {
          pattern_match: {
            value: patternMatch,
            weight: this.weights.pattern_match,
            contribution: (patternMatch * this.weights.pattern_match).toFixed(3),
            explanation: `Signal matches ${(patternMatch * 100).toFixed(0)}% of known patterns`,
          },
          historical_success: {
            value: historicalSuccess,
            weight: this.weights.historical_success,
            contribution: (
              historicalSuccess * this.weights.historical_success
            ).toFixed(3),
            explanation: `Past actions succeeded in ${(historicalSuccess * 100).toFixed(
              0
            )}% of cases`,
          },
          signal_strength: {
            value: signalStrength,
            weight: this.weights.signal_strength,
            contribution: (signalStrength * this.weights.signal_strength).toFixed(
              3
            ),
            explanation: `Signal clarity at ${(signalStrength * 100).toFixed(0)}%`,
          },
          recency: {
            value: recency,
            weight: this.weights.recency,
            contribution: (recency * this.weights.recency).toFixed(3),
            explanation: `Pattern recency score ${(recency * 100).toFixed(0)}%`,
          },
          policy_alignment: {
            value: policyAlignment,
            weight: this.weights.policy_alignment,
            contribution: (policyAlignment * this.weights.policy_alignment).toFixed(
              3
            ),
            explanation: policyMatch
              ? "Action aligns with policy rules"
              : "Action conflicts with policy",
          },
        },
        breakdown: {
          totalFactors: 5,
          weightsSum: Object.values(this.weights).reduce((a, b) => a + b, 0),
          calculationMethod: "weighted_average",
        },
      };
    } catch (error) {
      console.error("[ConfidenceService] Calculation failed:", error);
      // Return fallback confidence
      return {
        score: 0.5,
        level: "MEDIUM",
        factors: {},
        error: error.message,
      };
    }
  }

  /**
   * Pattern matching score
   * How closely does this signal match known patterns?
   */
  _getPatternMatchScore(analysisResult) {
    if (!analysisResult?.patternMatch) {
      return 0.3;
    }

    // Pattern match is typically 0-1
    return Math.min(analysisResult.patternMatch, 1);
  }

  /**
   * Historical success score
   * How successful were similar actions in the past?
   */
  async _getHistoricalSuccessScore(analysisResult, memoryService) {
    try {
      if (!analysisResult?.incidentType) {
        return 0.5; // Default neutral
      }

      // Query memory for similar incidents
      const history = await memoryService.getIncidentHistory(
        analysisResult.incidentType,
        10
      );

      if (!history || history.length === 0) {
        return 0.5;
      }

      const successCount = history.filter((h) => h.success).length;
      return successCount / history.length;
    } catch (error) {
      console.warn("[ConfidenceService] Could not calculate historical success:", error);
      return 0.5;
    }
  }

  /**
   * Signal strength score
   * How clear/definitive is the signal?
   */
  _getSignalStrengthScore(analysisResult) {
    if (!analysisResult?.severity) {
      return 0.3;
    }

    // Severity levels map to strength
    const severityMap = {
      LOW: 0.3,
      MEDIUM: 0.6,
      HIGH: 0.85,
      CRITICAL: 0.95,
    };

    return severityMap[analysisResult.severity] || 0.5;
  }

  /**
   * Recency score
   * How recent are the patterns?
   */
  _getRecencyScore(analysisResult) {
    if (!analysisResult?.patternAge) {
      return 0.5;
    }

    // Older patterns = lower score
    const ageHours = analysisResult.patternAge;
    const maxAge = 168; // 1 week

    if (ageHours > maxAge) {
      return 0.3;
    }

    // Linear falloff
    return 1 - ageHours / maxAge;
  }

  /**
   * Confidence level classification
   */
  _getConfidenceLevel(score) {
    if (score >= 0.8) return "HIGH";
    if (score >= 0.6) return "MEDIUM";
    return "LOW";
  }

  /**
   * Update weights (admin operation)
   */
  updateWeights(newWeights) {
    const sum = Object.values(newWeights).reduce((a, b) => a + b, 0);

    if (Math.abs(sum - 1) > 0.01) {
      throw new Error(
        `Weights must sum to 1.0, got ${sum.toFixed(3)}`
      );
    }

    this.weights = newWeights;
    console.log("[ConfidenceService] Weights updated:", newWeights);
    return this.weights;
  }

  /**
   * Get current weights
   */
  getWeights() {
    return { ...this.weights };
  }
}

module.exports = new ConfidenceService();
