/**
 * Dry-Run Service
 * Simulates action execution without actually modifying infrastructure
 * Predicts outcomes based on historical data and current state
 */

const { decisionTraceService } = require('../');

class DryRunService {
  constructor() {
    this.executionHistory = new Map(); // Store past executions for prediction
    this.dryRunResults = [];
  }

  /**
   * Simulate action execution without actually running it
   */
  async simulateAction(action, conditions, incidentData, policy) {
    const simulationId = `DRY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    // Get historical outcomes for this action
    const historicalOutcomes = this.getHistoricalOutcomes(action, conditions.severity);

    // Predict success probability
    const successProbability = this.predictSuccessProbability(action, conditions, historicalOutcomes);

    // Estimate execution time
    const estimatedDurationMs = this.estimateExecutionTime(action, conditions);

    // Assess blast radius
    const blastRadius = this.assessBlastRadius(action, incidentData);

    // Predict side effects
    const potentialSideEffects = this.predictSideEffects(action, conditions);

    // Check if action would be safe
    const safetyAssessment = this.assessSafety(action, successProbability, blastRadius, policy);

    // Build recommendation
    const recommendation = this.buildRecommendation(
      action,
      successProbability,
      safetyAssessment,
      estimatedDurationMs,
      blastRadius
    );

    const result = {
      simulationId,
      action,
      conditions,
      timestamp: new Date().toISOString(),
      analysis: {
        successProbability: parseFloat(successProbability.toFixed(3)),
        estimatedDurationMs,
        blastRadius,
        potentialSideEffects,
        safetyAssessment,
        historicalSuccessRate: historicalOutcomes.successRate,
        historicalSampleSize: historicalOutcomes.sampleSize,
      },
      recommendation,
      executionTime: Date.now() - startTime,
    };

    // Store result
    this.dryRunResults.push(result);

    return result;
  }

  /**
   * Get historical outcomes for an action
   */
  getHistoricalOutcomes(action, severity) {
    // This would typically query a database
    // For now, return mock data

    const outcomes = {
      restart: {
        low: { successRate: 0.75, sampleSize: 40 },
        medium: { successRate: 0.82, sampleSize: 50 },
        high: { successRate: 0.88, sampleSize: 25 },
        critical: { successRate: 0.91, sampleSize: 10 },
      },
      scale: {
        low: { successRate: 0.68, sampleSize: 22 },
        medium: { successRate: 0.79, sampleSize: 38 },
        high: { successRate: 0.85, sampleSize: 20 },
        critical: { successRate: 0.89, sampleSize: 9 },
      },
      'circuit-break': {
        low: { successRate: 0.72, sampleSize: 18 },
        medium: { successRate: 0.81, sampleSize: 32 },
        high: { successRate: 0.87, sampleSize: 16 },
        critical: { successRate: 0.90, sampleSize: 8 },
      },
      'failover': {
        low: { successRate: 0.80, sampleSize: 15 },
        medium: { successRate: 0.87, sampleSize: 23 },
        high: { successRate: 0.92, sampleSize: 12 },
        critical: { successRate: 0.94, sampleSize: 7 },
      },
      alert: {
        low: { successRate: 0.95, sampleSize: 100 },
        medium: { successRate: 0.97, sampleSize: 120 },
        high: { successRate: 0.98, sampleSize: 80 },
        critical: { successRate: 0.99, sampleSize: 50 },
      },
    };

    return outcomes[action]?.[severity.toLowerCase()] || {
      successRate: 0.5,
      sampleSize: 0,
    };
  }

  /**
   * Predict success probability based on historical data
   */
  predictSuccessProbability(action, conditions, historicalOutcomes) {
    const baseSuccessRate = historicalOutcomes.successRate;
    
    // Weight by sample size (more data = more confidence)
    const dataConfidenceFactor = Math.min(historicalOutcomes.sampleSize / 100, 1);
    
    // Adjust for confidence threshold
    const confidenceAdjustment = conditions.confidence >= 0.75 ? 0.05 : -0.05;
    
    // Adjust for pattern match
    const patternBonus = conditions.pattern ? 0.03 : 0;
    
    const predictedSuccessRate = Math.min(1, Math.max(0,
      baseSuccessRate * 0.8 +  // Weight historical data at 80%
      (baseSuccessRate * dataConfidenceFactor) * 0.1 + // Data confidence at 10%
      confidenceAdjustment * 0.1 + // Confidence adjustment at 10%
      patternBonus * 0.1
    ));

    return predictedSuccessRate;
  }

  /**
   * Estimate how long the action would take
   */
  estimateExecutionTime(action, conditions) {
    const baseTimes = {
      alert: 100,           // Fastest
      'log-only': 50,
      'circuit-break': 500,
      'cache-clear': 200,
      retry: 1000,
      restart: 3000,        // Moderate
      scale: 5000,
      'failover': 8000,     // Slowest
      'rolling-restart': 10000,
    };

    let estimatedMs = baseTimes[action] || 2000;

    // Adjust for severity (higher severity = more careful = longer)
    const severityMultiplier = {
      LOW: 0.8,
      MEDIUM: 1.0,
      HIGH: 1.5,
      CRITICAL: 2.0,
    };

    estimatedMs *= severityMultiplier[conditions.severity] || 1.0;

    // Add random variance (±20%)
    const variance = estimatedMs * 0.2 * (Math.random() - 0.5);

    return Math.round(estimatedMs + variance);
  }

  /**
   * Assess potential blast radius (% of users affected if action fails)
   */
  assessBlastRadius(action, incidentData) {
    const baseRadiusMap = {
      'log-only': 0,
      alert: 0,
      'circuit-break': 5,    // 5% of traffic diverted temporarily
      'cache-clear': 10,     // 10% cache miss spike
      retry: 15,             // Temporary slowdown
      restart: 30,           // Brief outage
      scale: 5,              // Minimal impact
      failover: 20,
      'rolling-restart': 2,  // Gradual, safe
    };

    const baseRadius = baseRadiusMap[action] || 25;

    // Adjust based on incident scope
    let radiusAdjustment = 1.0;
    if (incidentData.affectedServices?.length) {
      radiusAdjustment = incidentData.affectedServices.length * 0.3;
    }

    return Math.min(100, Math.round(baseRadius * radiusAdjustment));
  }

  /**
   * Predict side effects of an action
   */
  predictSideEffects(action, conditions) {
    const sideEffects = {
      restart: [
        'Brief service unavailability (30-60 seconds)',
        'In-flight requests will be lost',
        'Cache will be cleared',
        'Connections will be reset',
      ],
      scale: [
        'Increased infrastructure cost for scale-up',
        'Takes 2-3 minutes to spin up new instances',
        'Load will be re-balanced',
      ],
      'circuit-break': [
        'Traffic redirected to fallback endpoint',
        'Reduced functionality until circuit closes',
        'Dependent services must handle fallback',
      ],
      failover: [
        'Traffic switched to backup infrastructure',
        'Potential brief latency spike during switch',
        'Data inconsistency if backup is out-of-sync',
      ],
      'rolling-restart': [
        'Gradual restart of instances',
        'Maintains availability throughout process',
        'Longer total execution time',
      ],
      'cache-clear': [
        'First requests after clear will be slow',
        'Cache misses for ~5 minutes until warmed up',
        'Database load will spike temporary',
      ],
      alert: [
        'Notification sent to on-call engineer',
        'No automatic action taken',
        'Manual intervention may be required',
      ],
    };

    return sideEffects[action] || [
      'Action may impact service availability',
      'Monitor metrics during execution',
    ];
  }

  /**
   * Assess overall safety of the action
   */
  assessSafety(action, successProbability, blastRadius, policy) {
    const riskLevel = this.calculateRiskLevel(action, successProbability, blastRadius);
    
    let safe = true;
    let warnings = [];

    // Check safety gates from policy
    if (policy.safetyGates) {
      const { requireConfidence, maxBlastRadius } = policy.safetyGates;

      if (requireConfidence && successProbability < requireConfidence) {
        safe = false;
        warnings.push(`Confidence ${successProbability.toFixed(2)} below required ${requireConfidence}`);
      }

      if (maxBlastRadius && blastRadius > maxBlastRadius) {
        safe = false;
        warnings.push(`Blast radius ${blastRadius}% exceeds limit ${maxBlastRadius}%`);
      }
    }

    // Additional heuristics
    if (successProbability < 0.5) {
      safe = false;
      warnings.push('Success probability too low');
    }

    if (blastRadius > 50) {
      warnings.push('High blast radius - may affect many users');
    }

    return {
      safe,
      riskLevel,
      warnings,
    };
  }

  /**
   * Calculate risk level (low, medium, high, critical)
   */
  calculateRiskLevel(action, successProbability, blastRadius) {
    const failureRisk = 1 - successProbability;
    const impactScore = (failureRisk * blastRadius) / 100;

    if (impactScore > 0.5) return 'critical';
    if (impactScore > 0.3) return 'high';
    if (impactScore > 0.1) return 'medium';
    return 'low';
  }

  /**
   * Build dry-run recommendation
   */
  buildRecommendation(action, successProbability, safetyAssessment, duration, blastRadius) {
    let recommendation = 'CANNOT EXECUTE';
    let rationale = [];

    if (safetyAssessment.safe) {
      if (successProbability >= 0.85) {
        recommendation = 'EXECUTE IMMEDIATELY';
        rationale.push('High success probability and safety confirmed');
      } else if (successProbability >= 0.70) {
        recommendation = 'EXECUTE WITH MONITORING';
        rationale.push('Moderate success probability - monitor metrics closely');
      } else if (successProbability >= 0.50) {
        recommendation = 'CONSIDER ALTERNATIVES';
        rationale.push('Moderate-low success probability - consider other actions');
      } else {
        recommendation = 'DO NOT EXECUTE';
        rationale.push('Success probability too low');
      }
    } else {
      recommendation = 'DO NOT EXECUTE';
      rationale.push(...safetyAssessment.warnings);
    }

    return {
      recommendation,
      rationale,
      confidenceScore: parseFloat((successProbability * 100).toFixed(1)),
      estimatedDurationSec: (duration / 1000).toFixed(1),
      maxAffectedPercent: blastRadius,
    };
  }

  /**
   * Get recent dry-run results
   */
  getRecentResults(limit = 10) {
    return this.dryRunResults.slice(-limit);
  }

  /**
   * Compare multiple scenarios
   */
  compareScenarios(scenarios) {
    // scenarios: array of { action, conditions }
    return scenarios.map(scenario => ({
      ...scenario,
      simulation: this.simulateAction(scenario.action, scenario.conditions, {}, {}),
    }));
  }
}

module.exports = new DryRunService();
