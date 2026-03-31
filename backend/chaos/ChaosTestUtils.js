/**
 * Chaos Testing Utilities
 * 
 * Helper functions for signal generation, timing, and result analysis
 */

/**
 * Signal Builder - Create realistic signals for different scenarios
 */
class SignalBuilder {
  /**
   * Create error rate signal
   */
  static createErrorRateSignal(service, errorRate, severity = 'warning') {
    return {
      signalType: 'errorRate',
      service,
      value: Math.max(0, Math.min(1, errorRate)), // Clamp 0-1
      severity,
      timestamp: new Date(),
    };
  }

  /**
   * Create latency signal
   */
  static createLatencySignal(service, latencyMs, severity = 'warning') {
    return {
      signalType: 'latency',
      service,
      value: Math.max(0, latencyMs),
      severity,
      timestamp: new Date(),
    };
  }

  /**
   * Create CPU usage signal
   */
  static createCPUSignal(service, cpuPercent, severity = 'warning') {
    return {
      signalType: 'cpu',
      service,
      value: Math.max(0, Math.min(100, cpuPercent)),
      severity,
      timestamp: new Date(),
    };
  }

  /**
   * Create memory usage signal
   */
  static createMemorySignal(service, memoryMB, severity = 'warning') {
    return {
      signalType: 'memory',
      service,
      value: Math.max(0, memoryMB),
      severity,
      timestamp: new Date(),
    };
  }

  /**
   * Create throughput signal
   */
  static createThroughputSignal(service, requestsPerSecond, severity = 'low') {
    return {
      signalType: 'throughput',
      service,
      value: Math.max(0, requestsPerSecond),
      severity,
      timestamp: new Date(),
    };
  }

  /**
   * Build signal burst with gradual escalation
   */
  static buildEscalationBurst(service, signalType, startValue, endValue, steps) {
    const signals = [];
    const increment = (endValue - startValue) / steps;

    for (let i = 0; i < steps; i++) {
      const value = startValue + increment * i;
      const severity = this._getSeverity(signalType, value);

      signals.push({
        signalType,
        service,
        value,
        severity,
        timestamp: new Date(Date.now() + i * 200), // 200ms apart
      });
    }

    return signals;
  }

  /**
   * Determine severity based on signal type and value
   */
  static _getSeverity(signalType, value) {
    switch (signalType) {
      case 'errorRate':
        if (value < 0.1) return 'low';
        if (value < 0.5) return 'warning';
        return 'critical';
      case 'latency':
        if (value < 200) return 'low';
        if (value < 1000) return 'warning';
        return 'critical';
      case 'cpu':
      case 'memory':
        if (value < 50) return 'low';
        if (value < 80) return 'warning';
        return 'critical';
      default:
        return 'warning';
    }
  }
}

/**
 * Result Analyzer - Analyze decision traces and outcomes
 */
class ResultAnalyzer {
  /**
   * Analyze decision correctness
   */
  static analyzeDecisionCorrectness(decisions, expectedBehavior) {
    const analysis = {
      total: decisions.length,
      correct: 0,
      incorrect: 0,
      details: [],
    };

    for (const decision of decisions) {
      const action = decision.explanation?.actionChosen?.action;
      const confidence = decision.explanation?.confidence?.score || 0;

      let isCorrect = false;

      // Check if action matches expected behavior
      if (expectedBehavior.expectedActions) {
        isCorrect = expectedBehavior.expectedActions.includes(action);
      }

      // Check confidence threshold
      if (expectedBehavior.minConfidence !== undefined) {
        isCorrect = isCorrect && confidence >= expectedBehavior.minConfidence;
      }

      if (isCorrect) {
        analysis.correct++;
      } else {
        analysis.incorrect++;
        analysis.details.push({
          decisionId: decision.decisionId,
          expectedActions: expectedBehavior.expectedActions,
          actualAction: action,
          confidence,
        });
      }
    }

    analysis.accuracy = (analysis.correct / analysis.total * 100).toFixed(1);
    return analysis;
  }

  /**
   * Analyze confidence distribution
   */
  static analyzeConfidenceDistribution(decisions) {
    const distribution = {
      high: { count: 0, threshold: 0.8 },
      medium: { count: 0, threshold: [0.6, 0.8] },
      low: { count: 0, threshold: 0.6 },
      details: {
        highConfidenceDecisions: [],
        lowConfidenceDecisions: [],
      },
    };

    for (const decision of decisions) {
      const confidence = decision.explanation?.confidence?.score || 0;

      if (confidence >= 0.8) {
        distribution.high.count++;
      } else if (confidence >= 0.6) {
        distribution.medium.count++;
      } else {
        distribution.low.count++;
        distribution.details.lowConfidenceDecisions.push({
          decisionId: decision.decisionId,
          confidence,
          action: decision.explanation?.actionChosen?.action,
        });
      }

      if (confidence >= 0.8) {
        distribution.details.highConfidenceDecisions.push({
          decisionId: decision.decisionId,
          confidence,
        });
      }
    }

    distribution.total = decisions.length;
    distribution.avgConfidence = decisions.reduce(
      (sum, d) => sum + (d.explanation?.confidence?.score || 0),
      0
    ) / decisions.length;

    return distribution;
  }

  /**
   * Analyze action distribution
   */
  static analyzeActionDistribution(decisions) {
    const distribution = {};

    for (const decision of decisions) {
      const action = decision.explanation?.actionChosen?.action || 'unknown';
      distribution[action] = (distribution[action] || 0) + 1;
    }

    return distribution;
  }

  /**
   * Analyze cascade risk indicators
   */
  static analyzeCascadeRisk(decisions) {
    const analysis = {
      totalDecisions: decisions.length,
      restarts: 0,
      escalations: 0,
      isolations: 0,
      cascadeRiskScore: 0,
      details: [],
    };

    for (const decision of decisions) {
      const action = decision.explanation?.actionChosen?.action;

      if (action === 'restart') {
        analysis.restarts++;
      } else if (action === 'escalate') {
        analysis.escalations++;
      } else if (action === 'isolate') {
        analysis.isolations++;
      }
    }

    // Calculate cascade risk score
    // Higher restart/total ratio indicates higher cascade risk
    analysis.cascadeRiskScore = (analysis.restarts / analysis.totalDecisions);

    if (analysis.cascadeRiskScore > 0.5) {
      analysis.riskLevel = 'HIGH';
      analysis.recommendation = 'Too many restart actions. Risk of cascading failures.';
    } else if (analysis.cascadeRiskScore > 0.3) {
      analysis.riskLevel = 'MEDIUM';
      analysis.recommendation = 'Consider increasing escalations over restarts.';
    } else {
      analysis.riskLevel = 'LOW';
      analysis.recommendation = 'Good balance between escalations and restarts.';
    }

    return analysis;
  }

  /**
   * Analyze policy compliance
   */
  static analyzePolicyCompliance(decisions) {
    const analysis = {
      total: decisions.length,
      policyApprovals: 0,
      policyBlocks: 0,
      violations: [],
    };

    for (const decision of decisions) {
      const policies = decision.explanation?.policiesApplied || [];

      for (const policy of policies) {
        if (policy.status === 'APPROVED') {
          analysis.policyApprovals++;
        } else if (policy.status === 'BLOCKED') {
          analysis.policyBlocks++;
          analysis.violations.push({
            decisionId: decision.decisionId,
            policy: policy.requirement || policy.name,
            action: decision.explanation?.actionChosen?.action,
          });
        }
      }
    }

    analysis.complianceRate = (
      (analysis.policyApprovals /
        (analysis.policyApprovals + analysis.policyBlocks)) *
      100
    ).toFixed(1);

    return analysis;
  }
}

/**
 * Latency Calculator - Analyze latency metrics
 */
class LatencyCalculator {
  /**
   * Calculate percentiles
   */
  static calculatePercentiles(latencies) {
    const sorted = [...latencies].sort((a, b) => a - b);

    return {
      min: sorted[0],
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p75: sorted[Math.floor(sorted.length * 0.75)],
      p90: sorted[Math.floor(sorted.length * 0.9)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      max: sorted[sorted.length - 1],
      avg: (sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2),
      count: sorted.length,
    };
  }

  /**
   * Check latency against SLA
   */
  static checkSLA(latencies, sla = { p95: 500, avg: 100 }) {
    const percentiles = this.calculatePercentiles(latencies);

    return {
      p95Compliant: percentiles.p95 <= sla.p95,
      avgCompliant: parseFloat(percentiles.avg) <= sla.avg,
      sla,
      actual: {
        p95: percentiles.p95,
        avg: percentiles.avg,
      },
    };
  }
}

/**
 * Service Dependency Tracker - Track service interactions
 */
class ServiceDependencyTracker {
  constructor() {
    this.dependencies = new Map();
    this.failures = new Map();
    this.timeline = [];
  }

  /**
   * Record service failure
   */
  recordFailure(service, timestamp = Date.now()) {
    if (!this.failures.has(service)) {
      this.failures.set(service, []);
    }

    this.failures.get(service).push(timestamp);
    this.timeline.push({
      type: 'failure',
      service,
      timestamp,
    });
  }

  /**
   * Add dependency between services
   */
  addDependency(from, to) {
    if (!this.dependencies.has(from)) {
      this.dependencies.set(from, []);
    }

    this.dependencies.get(from).push(to);
  }

  /**
   * Get cascade path (from root failure to downstream services)
   */
  getCascadePath(rootService, maxDepth = 10) {
    const path = [rootService];
    const visited = new Set([rootService]);

    const traverse = (service, depth) => {
      if (depth >= maxDepth) return;

      const dependents = this.dependencies.get(service) || [];
      for (const dependent of dependents) {
        if (!visited.has(dependent)) {
          visited.add(dependent);
          path.push(dependent);
          traverse(dependent, depth + 1);
        }
      }
    };

    traverse(rootService, 0);
    return path;
  }

  /**
   * Analyze cascade
   */
  analyzeCascade() {
    const analysis = {
      failedServices: Array.from(this.failures.keys()),
      failureCount: 0,
      cascadeDepth: 0,
      timeline: this.timeline,
    };

    for (const failures of this.failures.values()) {
      analysis.failureCount += failures.length;
    }

    if (analysis.failedServices.length > 0) {
      const cascadePath = this.getCascadePath(analysis.failedServices[0]);
      analysis.cascadeDepth = cascadePath.length;
    }

    return analysis;
  }
}

module.exports = {
  SignalBuilder,
  ResultAnalyzer,
  LatencyCalculator,
  ServiceDependencyTracker,
};
