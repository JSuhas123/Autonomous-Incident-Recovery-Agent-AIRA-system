/**
 * Convergence Analyzer
 * Validates that confidence weights converge and stabilize
 * Checks for:
 * - Weight convergence (weights stabilize over time)
 * - No excessive oscillations (swings < 10% regularly)
 * - Dominant factors emerge (logical pattern in weight ordering)
 * - System stability (no sudden jumps)
 */

class ConvergenceAnalyzer {
  constructor(config = {}) {
    this.config = {
      oscillationThreshold: config.oscillationThreshold || 0.1, // 10% max swing
      convergenceWindow: config.convergenceWindow || 50, // Check last 50 snapshots
      convergenceTolerance: config.convergenceTolerance || 0.01, // 1% stability threshold
      ...config,
    };
  }

  /**
   * Analyze weight convergence from simulation results
   */
  analyzeConvergence(weightSnapshots, decisionHistory) {
    if (weightSnapshots.length === 0) {
      return {
        hasConverged: true,
        reason: 'No weight updates recorded - system stable at baseline',
        metrics: this._getBaselineMetrics(decisionHistory),
      };
    }

    const convergenceMetrics = this._calculateConvergenceMetrics(weightSnapshots);
    const oscillationAnalysis = this._analyzeOscillation(weightSnapshots);
    const dominantFactorsAnalysis = this._analyzeDominantFactors(weightSnapshots);
    const trendAnalysis = this._analyzeTrends(weightSnapshots);

    const hasConverged = this._determineConvergence(
      convergenceMetrics,
      oscillationAnalysis
    );

    return {
      hasConverged,
      convergenceScore: convergenceMetrics.convergenceScore.toFixed(4),
      metrics: convergenceMetrics,
      oscillationAnalysis,
      dominantFactors: dominantFactorsAnalysis,
      trends: trendAnalysis,
      recommendations: this._generateRecommendations(
        hasConverged,
        convergenceMetrics,
        oscillationAnalysis,
        trendAnalysis
      ),
    };
  }

  /**
   * Calculate convergence metrics
   * Measures how stable weights have become over time
   */
  _calculateConvergenceMetrics(weightSnapshots) {
    const lastWindow = Math.min(
      this.config.convergenceWindow,
      weightSnapshots.length
    );

    // Get the last N snapshots
    const recentSnapshots = weightSnapshots.slice(-lastWindow);
    const latestWeights = recentSnapshots[recentSnapshots.length - 1].newWeights;

    // Calculate variance in each weight over recent period
    const weightVariances = {};
    const factors = Object.keys(latestWeights);

    factors.forEach(factor => {
      const values = recentSnapshots.map(s => s.newWeights[factor]);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      
      weightVariances[factor] = {
        mean: mean.toFixed(4),
        stdDev: stdDev.toFixed(4),
        variance: variance.toFixed(6),
        coefficient: (stdDev / mean).toFixed(4), // Coefficient of variation
      };
    });

    // Calculate overall convergence score (0-1, 1 = fully converged)
    const avgVariance = Object.values(weightVariances)
      .reduce((sum, v) => sum + parseFloat(v.variance), 0) / factors.length;
    const convergenceScore = Math.max(0, 1 - avgVariance * 100); // Invert and scale

    // Check if recent updates are getting smaller
    const recentDeltas = recentSnapshots.map(s => {
      const deltaSum = Object.values(s.deltas || {})
        .reduce((sum, d) => sum + Math.abs(d), 0);
      return deltaSum;
    });

    const deltaTrendStabilizing = recentDeltas.length >= 2 &&
      recentDeltas[recentDeltas.length - 1] < recentDeltas[recentDeltas.length - 2];

    return {
      convergenceScore: Math.min(1, convergenceScore),
      windowSize: lastWindow,
      totalUpdates: weightSnapshots.length,
      weightVariances,
      recentUpdateMagnitude: lastWindow > 0 
        ? recentSnapshots[recentSnapshots.length - 1].deltas
        : {},
      deltaStabilizing: deltaTrendStabilizing,
      latestWeights,
    };
  }

  /**
   * Analyze weight oscillation patterns
   * Excessive oscillation (swings >10%) indicates instability
   */
  _analyzeOscillation(weightSnapshots) {
    const factors = Object.keys(weightSnapshots[0].newWeights);
    const oscillationData = {};

    factors.forEach(factor => {
      const weights = weightSnapshots.map(s => s.newWeights[factor]);
      
      // Find min/max swings
      let maxSwing = 0;
      let swingSamples = [];
      
      for (let i = 1; i < weights.length; i++) {
        const swing = Math.abs(weights[i] - weights[i - 1]);
        if (swing > maxSwing) maxSwing = swing;
        swingSamples.push(swing);
      }

      const avgSwing = swingSamples.reduce((a, b) => a + b, 0) / swingSamples.length;
      const largeOscillations = swingSamples.filter(s => s > this.config.oscillationThreshold).length;

      oscillationData[factor] = {
        maxSwing: (maxSwing * 100).toFixed(2) + '%',
        avgSwing: (avgSwing * 100).toFixed(2) + '%',
        swingCount: swingSamples.length,
        largeOscillations,
        isStable: largeOscillations === 0 || largeOscillations < swingSamples.length * 0.1,
      };
    });

    const unstableFactors = Object.entries(oscillationData)
      .filter(([_, data]) => !data.isStable)
      .map(([factor]) => factor);

    return {
      oscillationByFactor: oscillationData,
      unstableFactors,
      overallStability: unstableFactors.length === 0 
        ? 'STABLE' 
        : unstableFactors.length <= 1 
          ? 'MOSTLY_STABLE' 
          : 'UNSTABLE',
    };
  }

  /**
   * Analyze which factors emerge as dominant
   */
  _analyzeDominantFactors(weightSnapshots) {
    const latestWeights = weightSnapshots[weightSnapshots.length - 1].newWeights;
    const baselineWeights = weightSnapshots[0].previousWeights;

    // Rank factors by final weight
    const rankedCurrent = Object.entries(latestWeights)
      .sort(([, a], [, b]) => b - a)
      .map(([factor, weight], rank) => ({
        rank: rank + 1,
        factor,
        weight: weight.toFixed(4),
        percentage: (weight * 100).toFixed(1) + '%',
      }));

    const rankedBaseline = Object.entries(baselineWeights)
      .sort(([, a], [, b]) => b - a)
      .map(([factor, weight], rank) => ({
        rank: rank + 1,
        factor,
        weight: weight.toFixed(4),
        percentage: (weight * 100).toFixed(1) + '%',
      }));

    // Calculate changes in ranking
    const rankChanges = {};
    rankedBaseline.forEach(baseline => {
      const currentRank = rankedCurrent.findIndex(c => c.factor === baseline.factor) + 1;
      rankChanges[baseline.factor] = {
        baselineRank: baseline.rank,
        currentRank,
        rankChange: baseline.rank - currentRank,
        baselineWeight: baseline.weight,
        currentWeight: rankedCurrent.find(c => c.factor === baseline.factor)?.weight || 0,
      };
    });

    return {
      currentRanking: rankedCurrent,
      baselineRanking: rankedBaseline,
      rankChanges,
      topFactor: rankedCurrent[0].factor,
      emergentPattern: this._describeEmergentPattern(rankedCurrent),
    };
  }

  /**
   * Describe what pattern has emerged in weight distribution
   */
  _describeEmergentPattern(ranking) {
    const top3 = ranking.slice(0, 3);
    const concentration = parseFloat(top3.reduce((sum, r) => sum + r.weight, 0)) / 3;

    if (concentration > 0.5) {
      return 'CONCENTRATED: Top 3 factors dominate heavily';
    } else if (concentration > 0.35) {
      return 'BALANCED: Top factors have significant but not dominating influence';
    } else {
      return 'DISTRIBUTED: Weight spread more evenly across factors';
    }
  }

  /**
   * Analyze trends in weight evolution
   */
  _analyzeTrends(weightSnapshots) {
    const factors = Object.keys(weightSnapshots[0].newWeights);
    const trends = {};

    factors.forEach(factor => {
      const weights = weightSnapshots.map(s => s.newWeights[factor]);
      
      // Simple linear trend: if recent avg > early avg
      const midpoint = Math.floor(weights.length / 2);
      const earlyAvg = weights.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;
      const recentAvg = weights.slice(midpoint).reduce((a, b) => a + b, 0) / (weights.length - midpoint);
      
      const trend = recentAvg > earlyAvg ? 'INCREASING' : recentAvg < earlyAvg ? 'DECREASING' : 'STABLE';
      const changePercent = ((recentAvg - earlyAvg) / earlyAvg * 100).toFixed(2);

      trends[factor] = {
        trend,
        changePercent,
        earlyAverage: earlyAvg.toFixed(4),
        recentAverage: recentAvg.toFixed(4),
      };
    });

    return trends;
  }

  /**
   * Determine if system has converged
   */
  _determineConvergence(convergenceMetrics, oscillationAnalysis) {
    const hasLowVariance = parseFloat(convergenceMetrics.convergenceScore) > 0.7;
    const isStable = oscillationAnalysis.overallStability !== 'UNSTABLE';
    const deltasStabilizing = convergenceMetrics.deltaStabilizing;

    return hasLowVariance && isStable && deltasStabilizing;
  }

  /**
   * Generate recommendations based on analysis
   */
  _generateRecommendations(
    hasConverged,
    convergenceMetrics,
    oscillationAnalysis,
    trendAnalysis
  ) {
    const recommendations = [];

    if (!hasConverged) {
      recommendations.push('⚠️  System has not fully converged. Continue monitoring.');
      
      if (oscillationAnalysis.overallStability === 'UNSTABLE') {
        recommendations.push(
          '🔄 Consider reducing max weight change constraint to prevent oscillation.'
        );
      }

      if (!convergenceMetrics.deltaStabilizing) {
        recommendations.push(
          '📈 Weight changes still increasing - more data needed for stabilization.'
        );
      }
    } else {
      recommendations.push('✅ System has converged successfully.');
      recommendations.push(
        `📊 Dominant factor: ${convergenceMetrics.latestWeights}`
      );
    }

    // Factor-specific recommendations
    oscillationAnalysis.unstableFactors.forEach(factor => {
      recommendations.push(
        `⚡ '${factor}' showing instability - verify data quality for this factor.`
      );
    });

    return recommendations;
  }

  /**
   * Get baseline metrics when no updates occur
   */
  _getBaselineMetrics(decisionHistory) {
    return {
      message: 'System remained at baseline weights',
      possibleReasons: [
        'Insufficient outcome data (< threshold)',
        'Current weights already optimal',
        'Changes below minimum adjustment threshold',
      ],
    };
  }
}

module.exports = ConvergenceAnalyzer;
