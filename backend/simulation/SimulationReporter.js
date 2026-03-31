/**
 * Simulation Reporter
 * Generates comprehensive reports and graph-ready JSON output
 * Produces:
 * - Weight evolution data (for graphing)
 * - Accuracy over time (for graphing)
 * - Confidence vs outcome correlation (for graphing)
 * - Final convergence report
 * - Calibration report
 */

const fs = require('fs');
const path = require('path');

class SimulationReporter {
  constructor(outputDir = './simulation-results') {
    this.outputDir = outputDir;
    this.ensureOutputDir();
  }

  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Generate and save complete simulation report
   */
  generateReport(
    incidentStats,
    simulationResults,
    convergenceAnalysis,
    calibrationAnalysis,
    metadata = {}
  ) {
    const timestamp = new Date().toISOString();
    const reportId = `simulation-${Date.now()}`;

    // Generate graph-ready datasets
    const graphData = this._generateGraphData(
      simulationResults,
      convergenceAnalysis,
      calibrationAnalysis
    );

    // Generate final report
    const report = {
      metadata: {
        reportId,
        timestamp,
        ...metadata,
      },
      executive_summary: this._generateExecutiveSummary(
        simulationResults,
        convergenceAnalysis,
        calibrationAnalysis
      ),
      incident_statistics: incidentStats,
      simulation_results: this._summarizeSimulationResults(simulationResults),
      convergence_analysis: convergenceAnalysis,
      calibration_analysis: calibrationAnalysis,
      graph_data: graphData,
      validation_results: this._generateValidationResults(
        convergenceAnalysis,
        calibrationAnalysis,
        simulationResults
      ),
    };

    // Save reports
    this._saveJsonReport(reportId, report);
    this._saveHumanReadableReport(reportId, report);
    this._saveGraphData(reportId, graphData);

    console.log(`\n📊 Reports generated:`);
    console.log(`   - ${path.join(this.outputDir, `${reportId}-report.json`)}`);
    console.log(`   - ${path.join(this.outputDir, `${reportId}-summary.md`)}`);
    console.log(`   - ${path.join(this.outputDir, `${reportId}-graphs.json`)}`);

    return report;
  }

  /**
   * Generate graph-ready datasets
   */
  _generateGraphData(simulationResults, convergenceAnalysis, calibrationAnalysis) {
    return {
      weight_evolution: this._generateWeightEvolution(simulationResults),
      accuracy_over_time: this._generateAccuracyOverTime(simulationResults),
      confidence_vs_outcome: this._generateConfidenceVsOutcome(simulationResults),
      calibration_curve: this._generateCalibrationCurve(calibrationAnalysis),
      factor_effectiveness: this._generateFactorEffectiveness(simulationResults),
    };
  }

  /**
   * Weight evolution data for line chart
   */
  _generateWeightEvolution(simulationResults) {
    const snapshots = simulationResults.weightSnapshots;
    
    if (snapshots.length === 0) {
      // Generate data from baseline
      const factors = [
        'pattern_match',
        'historical_success',
        'signal_strength',
        'recency',
        'policy_alignment',
      ];

      return factors.map(factor => ({
        factor,
        dataPoints: [{
          decisionCount: 0,
          weight: 0.4, // Placeholder
        }],
      }));
    }

    const factors = Object.keys(snapshots[0].newWeights);

    return factors.map(factor => ({
      factor,
      dataPoints: snapshots.map((snapshot, index) => ({
        decisionCount: snapshot.decisionCount,
        weight: snapshot.newWeights[factor],
        timestamp: snapshot.timestamp,
        checkpointNumber: snapshot.checkpointNumber,
      })),
    }));
  }

  /**
   * Accuracy over time for line chart
   */
  _generateAccuracyOverTime(simulationResults) {
    const history = simulationResults.decisionHistory;
    const dataPoints = [];

    // Calculate accuracy every N decisions
    const interval = Math.max(1, Math.floor(history.length / 100)); // ~100 data points

    for (let i = interval; i < history.length; i += interval) {
      const subset = history.slice(0, i);
      const correct = subset.filter(d => d.wasCorrect).length;
      const accuracy = correct / subset.length;

      dataPoints.push({
        decisionNumber: i,
        accuracy,
        accuracyPercent: (accuracy * 100).toFixed(2),
        correctDecisions: correct,
        totalDecisions: subset.length,
      });
    }

    return {
      type: 'line',
      title: 'Decision Accuracy Over Time',
      unit: 'percentage',
      dataPoints,
    };
  }

  /**
   * Confidence vs outcome scatter plot data
   */
  _generateConfidenceVsOutcome(simulationResults) {
    const calibrationData = simulationResults.confidenceCalibrationData;

    // Generate scatter points
    const scatterPoints = calibrationData.map((record, index) => ({
      sequenceNumber: record.sequenceNumber,
      confidence: record.confidence,
      outcome: record.outcome,
      timeToRecoveryMs: record.timeToRecoveryMs,
    }));

    // Also generate binned averages for trend line
    const bins = 10;
    const binSize = 1.0 / bins;
    const binnedData = [];

    for (let b = 0; b < bins; b++) {
      const lower = b * binSize;
      const upper = (b + 1) * binSize;
      
      const binPoints = scatterPoints.filter(p => p.confidence >= lower && p.confidence < upper);
      if (binPoints.length > 0) {
        const avgOutcome = binPoints.reduce((sum, p) => sum + p.outcome, 0) / binPoints.length;
        binnedData.push({
          confidenceBin: ((lower + upper) / 2).toFixed(2),
          avgOutcomeRate: avgOutcome.toFixed(4),
          sampleCount: binPoints.length,
        });
      }
    }

    return {
      type: 'scatter',
      title: 'Confidence vs Actual Outcomes',
      unit: 'correlation',
      scatterPoints,
      trendLine: binnedData,
    };
  }

  /**
   * Calibration curve data
   */
  _generateCalibrationCurve(calibrationAnalysis) {
    if (!calibrationAnalysis.calibrationCurve) {
      return {
        type: 'line',
        title: 'Calibration Curve (Expected vs Actual)',
        dataPoints: [],
      };
    }

    const perfectCalibration = [
      { confidence: 0, successRate: 0 },
      { confidence: 0.5, successRate: 0.5 },
      { confidence: 1, successRate: 1 },
    ];

    return {
      type: 'line',
      title: 'Calibration Curve (Expected vs Actual)',
      dataPoints: calibrationAnalysis.calibrationCurve.map(point => ({
        expectedConfidence: point.confidenceMidpoint,
        actualSuccessRate: point.actualRate,
        distance: point.distance,
      })),
      perfectCalibration,
    };
  }

  /**
   * Factor effectiveness over time
   */
  _generateFactorEffectiveness(simulationResults) {
    // Track how each factor's effectiveness changes
    const factors = ['pattern_match', 'historical_success', 'signal_strength', 'recency', 'policy_alignment'];
    
    // Sample decisions to track factor contribution
    const sampleInterval = Math.max(1, Math.floor(simulationResults.decisionHistory.length / 50));
    const factorContributions = {};

    factors.forEach(factor => {
      factorContributions[factor] = {
        factor,
        dataPoints: [],
      };
    });

    for (let i = 0; i < simulationResults.decisionHistory.length; i += sampleInterval) {
      const decision = simulationResults.decisionHistory[i];
      
      if (decision.factors) {
        factors.forEach(factor => {
          if (decision.factors[factor]) {
            factorContributions[factor].dataPoints.push({
              decisionNumber: i,
              contribution: decision.factors[factor].contribution,
              weight: decision.factors[factor].weight,
            });
          }
        });
      }
    }

    return Object.values(factorContributions);
  }

  /**
   * Generate executive summary
   */
  _generateExecutiveSummary(simulationResults, convergenceAnalysis, calibrationAnalysis) {
    const finalAccuracy = simulationResults.decisionHistory.filter(d => d.wasCorrect).length / 
      simulationResults.decisionHistory.length;

    const initialAccuracy = simulationResults.decisionHistory.slice(0, Math.floor(simulationResults.decisionHistory.length / 4))
      .filter(d => d.wasCorrect).length / 
      Math.min(simulationResults.decisionHistory.length / 4, simulationResults.decisionHistory.length);

    const accuracyImprovement = ((finalAccuracy - initialAccuracy) / initialAccuracy * 100).toFixed(2);

    return {
      systemLearned: convergenceAnalysis.hasConverged ? 'YES' : 'NO',
      convergenceScore: convergenceAnalysis.convergenceScore,
      convergenceAchieved: convergenceAnalysis.hasConverged,
      calibrationStatus: calibrationAnalysis.status,
      calibrationScore: calibrationAnalysis.calibrationScore,
      initialAccuracy: (initialAccuracy * 100).toFixed(2) + '%',
      finalAccuracy: (finalAccuracy * 100).toFixed(2) + '%',
      accuracyImprovement: accuracyImprovement + '%',
      weightUpdatesApplied: simulationResults.weightSnapshots.length,
      totalDecisionsProcessed: simulationResults.decisionHistory.length,
      executionTimeMs: simulationResults.executionTimeMs,
      executionTimeSec: (simulationResults.executionTimeMs / 1000).toFixed(2),
      overallSystemStatus: this._determineOverallStatus(
        convergenceAnalysis.hasConverged,
        calibrationAnalysis.status,
        accuracyImprovement
      ),
    };
  }

  /**
   * Summarize simulation results
   */
  _summarizeSimulationResults(simulationResults) {
    const history = simulationResults.decisionHistory;
    
    const correctByConfidence = {
      veryHigh: history.filter(d => d.confidence >= 0.8).filter(d => d.wasCorrect).length,
      high: history.filter(d => d.confidence >= 0.6 && d.confidence < 0.8).filter(d => d.wasCorrect).length,
      medium: history.filter(d => d.confidence >= 0.4 && d.confidence < 0.6).filter(d => d.wasCorrect).length,
      low: history.filter(d => d.confidence < 0.4).filter(d => d.wasCorrect).length,
    };

    const totalByConfidence = {
      veryHigh: history.filter(d => d.confidence >= 0.8).length,
      high: history.filter(d => d.confidence >= 0.6 && d.confidence < 0.8).length,
      medium: history.filter(d => d.confidence >= 0.4 && d.confidence < 0.6).length,
      low: history.filter(d => d.confidence < 0.4).length,
    };

    return {
      totalDecisions: history.length,
      correctDecisions: history.filter(d => d.wasCorrect).length,
      wrongDecisions: history.filter(d => !d.wasCorrect).length,
      overallAccuracy: (history.filter(d => d.wasCorrect).length / history.length * 100).toFixed(2) + '%',
      accuracyByConfidence: {
        veryHigh: totalByConfidence.veryHigh > 0 ? (correctByConfidence.veryHigh / totalByConfidence.veryHigh * 100).toFixed(2) + '%' : 'N/A',
        high: totalByConfidence.high > 0 ? (correctByConfidence.high / totalByConfidence.high * 100).toFixed(2) + '%' : 'N/A',
        medium: totalByConfidence.medium > 0 ? (correctByConfidence.medium / totalByConfidence.medium * 100).toFixed(2) + '%' : 'N/A',
        low: totalByConfidence.low > 0 ? (correctByConfidence.low / totalByConfidence.low * 100).toFixed(2) + '%' : 'N/A',
      },
    };
  }

  /**
   * Generate validation results
   */
  _generateValidationResults(convergenceAnalysis, calibrationAnalysis, simulationResults) {
    return {
      convergenceValidation: {
        passed: convergenceAnalysis.hasConverged,
        details: {
          convergenceScore: convergenceAnalysis.convergenceScore,
          stabilityStatus: convergenceAnalysis.oscillationAnalysis.overallStability,
          dominantFactor: convergenceAnalysis.dominantFactors.topFactor,
        },
      },
      calibrationValidation: {
        passed: calibrationAnalysis.status === 'GOOD' || calibrationAnalysis.status === 'EXCELLENT',
        details: {
          calibrationScore: calibrationAnalysis.calibrationScore,
          status: calibrationAnalysis.status,
          reliabilityStatus: calibrationAnalysis.reliability.reliability,
        },
      },
      learningValidation: {
        passed: simulationResults.weightSnapshots.length > 0,
        details: {
          weightsUpdated: simulationResults.weightSnapshots.length > 0,
          updateCount: simulationResults.weightSnapshots.length,
        },
      },
      overallPassed: convergenceAnalysis.hasConverged && 
        (calibrationAnalysis.status === 'GOOD' || calibrationAnalysis.status === 'EXCELLENT') &&
        simulationResults.weightSnapshots.length > 0,
    };
  }

  /**
   * Determine overall system status
   */
  _determineOverallStatus(hasConverged, calibrationStatus, accuracyImprovement) {
    const improvementPercent = parseFloat(accuracyImprovement);
    
    if (hasConverged && (calibrationStatus === 'GOOD' || calibrationStatus === 'EXCELLENT') && improvementPercent > 10) {
      return 'HEALTHY: System learned, converged, and improved accuracy';
    } else if (hasConverged && improvementPercent > 5) {
      return 'ACCEPTABLE: System converged with modest improvement';
    } else if (hasConverged) {
      return 'MIXED: System converged but limited improvement';
    } else if (improvementPercent > 15) {
      return 'LEARNING: Still adapting but showing strong improvement';
    } else {
      return 'NEEDS_REVIEW: Monitor for stability and improvement';
    }
  }

  /**
   * Save JSON report
   */
  _saveJsonReport(reportId, report) {
    const filepath = path.join(this.outputDir, `${reportId}-report.json`);
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  }

  /**
   * Save human-readable markdown report
   */
  _saveHumanReadableReport(reportId, report) {
    const summary = report.executive_summary;
    const convergence = report.convergence_analysis;
    const calibration = report.calibration_analysis;
    const validation = report.validation_results;

    const md = `# Decision Engine Learning Validation Report

**Report ID**: ${report.metadata.reportId}  
**Generated**: ${report.metadata.timestamp}

## Executive Summary

| Metric | Value |
|--------|-------|
| Overall Status | ${summary.overallSystemStatus} |
| System Learned | ${summary.systemLearned} |
| Convergence Achieved | ${summary.convergenceAchieved ? '✅ YES' : '❌ NO'} |
| Calibration Status | ${calibration.status} |
| Initial Accuracy | ${summary.initialAccuracy} |
| Final Accuracy | ${summary.finalAccuracy} |
| Accuracy Improvement | **${summary.accuracyImprovement}%** |
| Weight Updates Applied | ${summary.weightUpdatesApplied} |
| Total Decisions Processed | ${summary.totalDecisionsProcessed} |
| Execution Time | ${summary.executionTimeSec}s |

## Convergence Analysis

**Converged**: ${convergence.hasConverged ? '✅ YES' : '❌ NO'}  
**Convergence Score**: ${convergence.convergenceScore} / 1.0

### Stability Status
- **Overall Stability**: ${convergence.oscillationAnalysis.overallStability}
- **Dominant Factor**: ${convergence.dominantFactors.topFactor}
- **Emergent Pattern**: ${convergence.dominantFactors.emergentPattern}

### Weight Changes
- **History Length**: ${convergence.metrics.totalUpdates}
- **Factors Analyzed**: ${Object.keys(convergence.metrics.weightVariances).length}

${this._formatWeightVariances(convergence.metrics.weightVariances)}

### Trends
${this._formatTrends(convergence.trends)}

## Calibration Analysis

**Status**: ${calibration.status}  
**Calibration Score**: ${calibration.calibrationScore} / 1.0  
**MAE**: ${calibration.calibrationMetrics.meanAbsoluteErrorPercent}

### High vs Low Confidence Performance
| Metric | Value |
|--------|-------|
| High Confidence Success Rate | ${calibration.reliability.highConfidenceDecisions.avgSuccessRatePercent} |
| Low Confidence Success Rate | ${calibration.reliability.lowConfidenceDecisions.avgSuccessRatePercent} |
| Ordering Type | ${calibration.reliability.orderingType} |
| Reliability | ${calibration.reliability.reliability} |

## Validation Results

| Category | Passed | Details |
|----------|--------|---------|
| Convergence | ${validation.convergenceValidation.passed ? '✅' : '❌'} | Score: ${validation.convergenceValidation.details.convergenceScore} |
| Calibration | ${validation.calibrationValidation.passed ? '✅' : '❌'} | Status: ${validation.calibrationValidation.details.calibrationStatus} |
| Learning | ${validation.learningValidation.passed ? '✅' : '❌'} | ${validation.learningValidation.details.updateCount} updates |
| **Overall** | **${validation.overallPassed ? '✅ PASSED' : '❌ FAILED'}** | |

## Incident Statistics

${this._formatIncidentStats(report.incident_statistics)}

## Recommendations

${convergence.recommendations.join('\n')}

${calibration.recommendations.join('\n')}

---
*Report generated by Decision Engine Learning Validation Harness*
`;

    const filepath = path.join(this.outputDir, `${reportId}-summary.md`);
    fs.writeFileSync(filepath, md);
  }

  /**
   * Save graph-ready data
   */
  _saveGraphData(reportId, graphData) {
    const filepath = path.join(this.outputDir, `${reportId}-graphs.json`);
    fs.writeFileSync(filepath, JSON.stringify(graphData, null, 2));
  }

  /**
   * Format weight variance data for markdown
   */
  _formatWeightVariances(variances) {
    let md = '\n| Factor | Mean | StdDev | CoeffVar |\n|--------|------|--------|----------|\n';
    Object.entries(variances).forEach(([factor, data]) => {
      md += `| ${factor} | ${data.mean} | ${data.stdDev} | ${data.coefficient} |\n`;
    });
    return md;
  }

  /**
   * Format trends data for markdown
   */
  _formatTrends(trends) {
    let md = '\n| Factor | Trend | Change |\n|--------|-------|--------|\n';
    Object.entries(trends).forEach(([factor, data]) => {
      md += `| ${factor} | ${data.trend} | ${data.changePercent}% |\n`;
    });
    return md;
  }

  /**
   * Format incident statistics for markdown
   */
  _formatIncidentStats(stats) {
    let md = `\n**Overall Success Rate**: ${stats.overallSuccessRate}\n\n`;
    md += '| Pattern | Total | Successful | Rate |\n';
    md += '|---------|-------|------------|------|\n';
    stats.patternStatistics.forEach(stat => {
      md += `| ${stat.pattern} | ${stat.total} | ${stat.successful} | ${stat.successRate} |\n`;
    });
    return md;
  }
}

module.exports = SimulationReporter;
