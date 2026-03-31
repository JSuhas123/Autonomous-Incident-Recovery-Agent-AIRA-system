/**
 * Action Risk Service
 * Evaluates risk factors for proposed actions
 * Provides safety scoring before execution
 */

class ActionRiskService {
  /**
   * Comprehensive risk assessment
   */
  scoreActionRisk(decision, circuitBreakerStatus = {}) {
    const action = decision.recommendedAction;
    const affectedServices = decision.inputs.signals.affectedServices || [];

    return {
      baseRisk: this._getBaseRisk(action),
      blastRadius: this._calculateBlastRadius(affectedServices),
      reversibility: this._checkReversibility(action),
      circuitBreakerStatus: circuitBreakerStatus,
      estimatedRecoveryTime: this._estimateRecoveryTime(action),
      dryRunRequired: this._isDryRunRequired(
        action,
        affectedServices.length,
        decision.inputs.confidence,
        circuitBreakerStatus
      ),
      requiresApproval: this._requiresApproval(action, affectedServices.length),
      riskLevel: null, // Will be computed below
      recommendations: [],
    };
  }

  /**
   * Compute overall risk level
   */
  getRiskLevel(risk) {
    const baseScore =
      risk.baseRisk * 0.4 +
      (risk.blastRadius.serviceCount / 5) * 0.3 +
      (risk.circuitBreakerStatus.failureCount || 0) * 0.2 +
      (risk.reversibility ? 0 : 0.1);

    if (baseScore >= 0.7) return "CRITICAL";
    if (baseScore >= 0.5) return "HIGH";
    if (baseScore >= 0.3) return "MEDIUM";
    return "LOW";
  }

  /**
   * Get base risk for action type
   */
  _getBaseRisk(action) {
    const risks = {
      restart: 0.6, // Medium - service interruption
      "scale-replicas": 0.2, // Low - usually safe
      "rolling-restart": 0.5, // Medium-high
      "clear-cache": 0.3, // Low-medium
      "alert-human": 0.0, // No risk
    };

    return risks[action] || 0.5;
  }

  /**
   * Calculate blast radius
   */
  _calculateBlastRadius(affectedServices) {
    const criticalServices = [
      "database",
      "cache",
      "auth-service",
      "api-gateway",
    ];

    const criticality = affectedServices.some((s) =>
      criticalServices.some((cs) => s.toLowerCase().includes(cs))
    )
      ? "CRITICAL"
      : affectedServices.length >= 3
        ? "HIGH"
        : "MEDIUM";

    return {
      serviceCount: affectedServices.length,
      services: affectedServices,
      criticality: criticality,
      userImpactEstimate:
        affectedServices.length > 2 ? "HIGH" : "MEDIUM",
    };
  }

  /**
   * Check if action is reversible
   */
  _checkReversibility(action) {
    const reversible = [
      "restart",
      "scale-replicas",
      "clear-cache",
      "alert-human",
      "rolling-restart",
    ];
    return reversible.includes(action);
  }

  /**
   * Estimate recovery time
   */
  _estimateRecoveryTime(action) {
    const times = {
      restart: "30-60 seconds",
      "scale-replicas": "2-5 minutes",
      "clear-cache": "5-10 seconds",
      "rolling-restart": "5-10 minutes",
      "alert-human": "variable (depends on responder)",
    };

    return times[action] || "unknown";
  }

  /**
   * Determine if dry-run is required
   */
  _isDryRunRequired(
    action,
    blastRadius,
    confidence,
    circuitBreakerStatus
  ) {
    // Always dry-run high-risk actions
    if (action === "restart" && blastRadius > 2) {
      return true;
    }

    // Dry-run if confidence is moderate and blast radius is significant
    if (confidence < 0.75 && blastRadius >= 2) {
      return true;
    }

    // Dry-run if circuit breaker shows repeated failures
    if (
      circuitBreakerStatus &&
      circuitBreakerStatus.failureCount >= 3
    ) {
      return true;
    }

    return false;
  }

  /**
   * Determine if approval is required
   */
  _requiresApproval(action, blastRadius) {
    // High-risk actions with high blast radius require approval
    if (action === "restart" && blastRadius >= 2) {
      return true;
    }

    if (action === "rolling-restart") {
      return true;
    }

    return false;
  }

  /**
   * Generate risk assessment summary
   */
  getAssessmentSummary(risk) {
    const level = this.getRiskLevel(risk);
    const summary = {
      riskLevel: level,
      baseRisk: `${(risk.baseRisk * 100).toFixed(0)}%`,
      blastRadius: risk.blastRadius,
      reversible: risk.reversibility ? "YES" : "NO",
      estimatedRecoveryTime: risk.estimatedRecoveryTime,
      dryRunRequired: risk.dryRunRequired,
      requiresApproval: risk.requiresApproval,
      recommendations: this._getRecommendations(risk, level),
    };

    return summary;
  }

  /**
   * Generate safety recommendations
   */
  _getRecommendations(risk, level) {
    const recommendations = [];

    if (risk.dryRunRequired) {
      recommendations.push(
        "⚠️ Dry-run this action before execution due to risk profile"
      );
    }

    if (risk.requiresApproval) {
      recommendations.push("👤 Action requires approval from admin");
    }

    if (risk.circuitBreakerStatus.failureCount >= 3) {
      recommendations.push(
        "🔴 Repeated failures detected - consider manual investigation"
      );
    }

    if (risk.blastRadius.serviceCount >= 3) {
      recommendations.push(
        `⚡ Large blast radius (${risk.blastRadius.serviceCount} services) - ensure visibility`
      );
    }

    if (!risk.reversibility) {
      recommendations.push("⚠️ Action is potentially irreversible - use caution");
    }

    return recommendations;
  }
}

module.exports = new ActionRiskService();
