#!/usr/bin/env node

/**
 * Run Learning Validation Simulation
 * 
 * Comprehensive test harness to validate Decision Engine learning stability:
 * - Generates 1000+ realistic incidents
 * - Simulates continuous decision-making with feedback loop
 * - Tracks weight convergence and stability
 * - Validates confidence calibration
 * - Detects drift and adaptation capability
 * 
 * Usage:
 *   node run-learning-validation.js [--incidents=1000] [--output=./results]
 */

const path = require('path');
const fs = require('fs');

// Import simulation components
const IncidentGenerator = require('./IncidentGenerator');
const SimulationRunner = require('./SimulationRunner');
const ConvergenceAnalyzer = require('./ConvergenceAnalyzer');
const CalibrationValidator = require('./CalibrationValidator');
const SimulationReporter = require('./SimulationReporter');

// Mock confidence service and weight optimizer (in real scenario, import from main app)
const MockConfidenceService = require('./mocks/MockConfidenceService');
const MockWeightOptimizer = require('./mocks/MockWeightOptimizer');

// Parse command line arguments
function parseArgs() {
  const args = {
    incidents: 1000,
    output: './backend/simulation/simulation-results',
    verbose: false,
  };

  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--incidents=')) {
      args.incidents = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--output=')) {
      args.output = arg.split('=')[1];
    } else if (arg === '--verbose') {
      args.verbose = true;
    }
  });

  return args;
}

/**
 * Main simulation harness
 */
async function runLearningValidation() {
  try {
    const args = parseArgs();

    console.log(`
╔════════════════════════════════════════════════════════════════╗
║          DECISION ENGINE LEARNING VALIDATION HARNESS           ║
║                                                                ║
║  Validating: Convergence, Calibration, Stability, Adaptation  ║
╚════════════════════════════════════════════════════════════════╝
`);

    console.log(`⚙️  Configuration:`);
    console.log(`   Incidents to simulate: ${args.incidents}`);
    console.log(`   Output directory: ${args.output}\n`);

    // ======================================================================
    // STEP 1: Generate realistic incident stream
    // ======================================================================
    console.log(`\n📋 STEP 1: Generating Incident Stream`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const incidentGenerator = new IncidentGenerator({
      totalIncidents: args.incidents,
      successRate: 0.7,
    });

    const incidents = incidentGenerator.generateIncidentStream();
    const incidentStats = incidentGenerator.getStatistics();

    console.log(`✅ Generated ${incidents.length} incidents`);
    console.log(`   Pattern breakdown:`);
    incidentStats.patternStatistics.forEach(stat => {
      console.log(`   - ${stat.pattern}: ${stat.total} incidents (${stat.successRate} success rate)`);
    });
    console.log(`   Timeline:`);
    console.log(`   - Learning phase: ${incidentStats.phaseInfo.learningPhase}`);
    console.log(`   - Adaptation phase: ${incidentStats.phaseInfo.adaptationPhase}`);
    console.log(`   - Drift resilience phase: ${incidentStats.phaseInfo.driftResiliencePhase}`);

    // ======================================================================
    // STEP 2: Initialize Decision Engine components
    // ======================================================================
    console.log(`\n🔧 STEP 2: Initializing Decision Engine`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const confidenceService = new MockConfidenceService();
    const weightOptimizer = new MockWeightOptimizer();

    console.log(`✅ Confidence Service initialized`);
    console.log(`   Initial weights:`, confidenceService.weights);
    console.log(`✅ Weight Optimizer initialized`);
    console.log(`   Update threshold: ${weightOptimizer.updateThreshold} outcomes`);
    console.log(`   Max weight change: ${weightOptimizer.maxWeightChange * 100}%`);

    // ======================================================================
    // STEP 3: Run simulation
    // ======================================================================
    console.log(`\n🎯 STEP 3: Running Simulation`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const simulationRunner = new SimulationRunner(confidenceService, weightOptimizer, {
      checkpointInterval: 10,
    });

    const simulationResults = await simulationRunner.runSimulation(incidents);

    console.log(`✅ Simulation complete`);
    console.log(`   Decisions processed: ${simulationResults.totalProcessed}`);
    console.log(`   Weight updates: ${simulationResults.weightSnapshots.length}`);
    console.log(`   Execution time: ${(simulationResults.executionTimeMs / 1000).toFixed(2)}s`);

    const accuracy = simulationRunner.computeAccuracyMetrics();
    console.log(`   Overall accuracy: ${accuracy.accuracyPercent}%`);

    // ======================================================================
    // STEP 4: Analyze convergence
    // ======================================================================
    console.log(`\n📊 STEP 4: Analyzing Weight Convergence`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const convergenceAnalyzer = new ConvergenceAnalyzer();
    const convergenceAnalysis = convergenceAnalyzer.analyzeConvergence(
      simulationResults.weightSnapshots,
      simulationResults.decisionHistory
    );

    const converged = convergenceAnalysis.hasConverged;
    console.log(`${converged ? '✅' : '⚠️ '} Convergence Status: ${converged ? 'CONVERGED' : 'NOT YET CONVERGED'}`);
    console.log(`   Convergence Score: ${convergenceAnalysis.convergenceScore}`);
    console.log(`   Stability: ${convergenceAnalysis.oscillationAnalysis.overallStability}`);
    console.log(`   Dominant Factor: ${convergenceAnalysis.dominantFactors.topFactor}`);
    console.log(`   Pattern: ${convergenceAnalysis.dominantFactors.emergentPattern}`);

    if (convergenceAnalysis.recommendations.length > 0) {
      console.log(`\n   📝 Recommendations:`);
      convergenceAnalysis.recommendations.forEach(rec => {
        console.log(`   ${rec}`);
      });
    }

    // ======================================================================
    // STEP 5: Validate calibration
    // ======================================================================
    console.log(`\n📈 STEP 5: Validating Confidence Calibration`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const calibrationValidator = new CalibrationValidator();
    const calibrationAnalysis = calibrationValidator.validateCalibration(
      simulationResults.confidenceCalibrationData,
      simulationResults.decisionHistory
    );

    console.log(`${calibrationAnalysis.status === 'EXCELLENT' || calibrationAnalysis.status === 'GOOD' ? '✅' : '⚠️ '} Calibration Status: ${calibrationAnalysis.status}`);
    console.log(`   Calibration Score: ${calibrationAnalysis.calibrationScore}`);
    console.log(`   Mean Absolute Error: ${calibrationAnalysis.calibrationMetrics.meanAbsoluteErrorPercent}`);
    console.log(`   High Confidence Success Rate: ${calibrationAnalysis.reliability.highConfidenceDecisions.avgSuccessRatePercent}`);
    console.log(`   Low Confidence Success Rate: ${calibrationAnalysis.reliability.lowConfidenceDecisions.avgSuccessRatePercent}`);
    console.log(`   Ordering Type: ${calibrationAnalysis.reliability.orderingType}`);
    console.log(`   Reliability: ${calibrationAnalysis.reliability.reliability}`);

    if (calibrationAnalysis.recommendations.length > 0) {
      console.log(`\n   📝 Recommendations:`);
      calibrationAnalysis.recommendations.forEach(rec => {
        console.log(`   ${rec}`);
      });
    }

    // ======================================================================
    // STEP 6: Generate comprehensive reports
    // ======================================================================
    console.log(`\n📄 STEP 6: Generating Reports`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const reporter = new SimulationReporter(args.output);
    const report = reporter.generateReport(
      incidentStats,
      simulationResults,
      convergenceAnalysis,
      calibrationAnalysis,
      {
        totalIncidents: args.incidents,
        simulationType: 'long-term-learning-validation',
        version: '1.0',
      }
    );

    // ======================================================================
    // STEP 7: Final validation summary
    // ======================================================================
    console.log(`\n🎯 STEP 7: Final Validation Summary`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const summary = report.executive_summary;
    const validation = report.validation_results;

    console.log(`\n📋 OVERALL SYSTEM STATUS: ${summary.overallSystemStatus}`);
    console.log(`\n   Validation Results:`);
    console.log(`   ✅ Convergence:  ${validation.convergenceValidation.passed ? 'PASSED' : 'FAILED'} (${validation.convergenceValidation.details.convergenceScore})`);
    console.log(`   ✅ Calibration:  ${validation.calibrationValidation.passed ? 'PASSED' : 'FAILED'} (${validation.calibrationValidation.details.calibrationScore})`);
    console.log(`   ✅ Learning:     ${validation.learningValidation.passed ? 'PASSED' : 'FAILED'} (${validation.learningValidation.details.updateCount} updates)`);
    console.log(`\n   Performance:`);
    console.log(`   📊 Initial Accuracy:    ${summary.initialAccuracy}`);
    console.log(`   📊 Final Accuracy:      ${summary.finalAccuracy}`);
    console.log(`   📊 Improvement:         ${summary.accuracyImprovement}%`);
    console.log(`\n   🎯 OVERALL: ${validation.overallPassed ? '✅ VALIDATION PASSED' : '❌ VALIDATION FAILED'}`);

    console.log(`\n✅ All reports saved to: ${args.output}`);
    console.log(`\n🎉 Learning Validation Complete\n`);

    return {
      passed: validation.overallPassed,
      summary,
      validation,
      reportPath: args.output,
    };

  } catch (error) {
    console.error(`\n❌ Error during simulation:`, error);
    process.exit(1);
  }
}

// Run the harness
if (require.main === module) {
  runLearningValidation().then(result => {
    process.exit(result.passed ? 0 : 1);
  });
}

module.exports = { runLearningValidation };
