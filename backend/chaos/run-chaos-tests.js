#!/usr/bin/env node

/**
 * CHAOS TESTING HARNESS - Main Entry Point
 * 
 * Orchestrates the complete chaos testing suite for the
 * Lean Incident Response Decision Engine
 * 
 * Usage:
 *   node backend/chaos/run-chaos-tests.js [--baseUrl http://localhost:5000] [--tenant chaos-test]
 */

const ChaosTestFramework = require('./ChaosTestFramework');
const ChaosScenarios = require('./ChaosScenarios');
const ChaosTestReporter = require('./ChaosTestReporter');

async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  const options = {
    baseUrl: 'http://localhost:5000',
    tenantId: 'chaos-test-tenant',
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--baseUrl' && i + 1 < args.length) {
      options.baseUrl = args[i + 1];
    } else if (args[i] === '--tenant' && i + 1 < args.length) {
      options.tenantId = args[i + 1];
    }
  }

  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║     LEAN INCIDENT RESPONSE DECISION ENGINE                             ║');
  console.log('║           COMPREHENSIVE CHAOS TESTING HARNESS                          ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝');
  console.log(`\nConfiguration:`);
  console.log(`  API Base URL: ${options.baseUrl}`);
  console.log(`  Tenant ID: ${options.tenantId}`);

  // Initialize framework
  const framework = new ChaosTestFramework(options.baseUrl, options.tenantId);
  
  try {
    await framework.initialize();
    console.log('\n✓ Framework initialized successfully');
  } catch (error) {
    console.error(`\n✗ Failed to initialize framework: ${error.message}`);
    console.error('Make sure the API server is running on', options.baseUrl);
    process.exit(1);
  }

  // Register scenarios
  console.log('\n[Setup] Registering test scenarios...');
  framework.registerScenario({
    name: 'Scenario 1: Service Crash Simulation',
    execute: ChaosScenarios.scenarioServiceCrash,
  });

  framework.registerScenario({
    name: 'Scenario 2: Database Latency Spike',
    execute: ChaosScenarios.scenarioDatabaseLatency,
  });

  framework.registerScenario({
    name: 'Scenario 3: Network Partition / Cascade Failure',
    execute: ChaosScenarios.scenarioCascadeFailure,
  });

  framework.registerScenario({
    name: 'Scenario 4: Failure Storm (Stress Chaos)',
    execute: ChaosScenarios.scenarioFailureStorm,
  });

  console.log(`✓ Registered ${framework.scenarios.length} scenarios\n`);

  // Run all scenarios
  try {
    await framework.runAllScenarios();
    console.log('\n✓ All scenarios completed');
  } catch (error) {
    console.error(`\n✗ Scenario execution failed: ${error.message}`);
    process.exit(1);
  }

  // Prepare results for reporting
  const results = framework.exportResults();
  
  // Generate report
  console.log('\n[Reporting] Generating comprehensive report...');
  const reporter = new ChaosTestReporter('./chaos-test-results');

  // Add scenario results
  for (const scenario of framework.results.scenarios) {
    reporter.addScenarioResult(scenario);
  }

  // Add global metrics
  const executionTime = (framework.results.endTime - framework.results.startTime) / 1000;
  reporter.addGlobalMetrics({
    executionTime: `${executionTime.toFixed(2)}s`,
    ...results.metrics,
  });

  // Generate summary
  const summary = reporter.generateSummary(framework);

  // Export all results
  const exports = reporter.exportAll(framework);

  // Print detailed metrics
  console.log('\n[Metrics Summary]');
  console.log('-'.repeat(80));
  console.log(`Execution Time: ${executionTime.toFixed(2)}s`);
  console.log(`Total Signal Injections: ${results.json.globalMetrics.totalSignalsInjected}`);
  console.log(`Successful Decisions Received: ${results.json.globalMetrics.totalDecisionsReceived}`);
  console.log(`Failed Requests: ${results.json.globalMetrics.totalApiErrors}`);
  console.log(`P95 Latency: ${results.metrics.requestLatencies.max}`);
  console.log(`Avg Latency: ${results.metrics.requestLatencies.avg}`);
  console.log(`Decision Success Rate: ${(
    (results.json.globalMetrics.totalDecisionsReceived / 
     results.json.globalMetrics.totalSignalsInjected) * 100
  ).toFixed(1)}%`);

  // Output results locations
  console.log('\n[Results]');
  console.log('-'.repeat(80));
  console.log(`JSON Results: ${exports.jsonPath}`);
  console.log(`Markdown Report: ${exports.markdownPath}`);

  // Exit with appropriate code
  const failedCount = framework.results.scenarios.filter(s => !s.result.success).length;
  if (failedCount > 0) {
    console.error(`\n⚠ ${failedCount} scenario(s) failed. See reports for details.`);
    process.exit(1);
  } else {
    console.log('\n✓ All chaos scenarios completed successfully!');
    process.exit(0);
  }
}

// Run main function
main().catch(error => {
  console.error('Chaos test harness encountered a fatal error:', error);
  process.exit(1);
});
