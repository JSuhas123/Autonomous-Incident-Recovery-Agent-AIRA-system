#!/usr/bin/env node

/**
 * run-simulation.js
 * 
 * Main CLI entry point for the AIRA Simulation Framework
 * 
 * Usage:
 *   npm run simulate              # Run full simulation
 *   npm run simulate company1 company2  # Run specific companies
 */

const path = require('path');
const SimulationRunner = require('./simulation/engine/SimulationRunner');
const ComparisonEngine = require('./simulation/comparisons/ComparisonEngine');
const ReportGenerator = require('./simulation/comparisons/ReportGenerator');

const projectRoot = __dirname;
const companiesPath = path.join(projectRoot, 'simulation', 'companies');
const scenariosPath = path.join(projectRoot, 'simulation', 'scenarios');
const resultsPath = path.join(projectRoot, 'simulation', 'results');

console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🚀 AIRA SIMULATION FRAMEWORK                            ║
║   Incident Recovery Comparison Engine                     ║
║                                                            ║
║   Simulating: AIRA vs Datadog+PagerDuty vs Manual         ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
`);

async function main() {
  try {
    // Initialize simulation runner
    const runner = new SimulationRunner(companiesPath, scenariosPath, resultsPath);

    // Run all company simulations
    console.log(`\n⚙️  Starting simulations for all companies...\n`);
    const allResults = runner.runAllCompanies();

    // Generate comparison report
    console.log(`\n\n📊 Generating comparison analysis...\n`);
    const comparisonEngine = new ComparisonEngine(resultsPath, companiesPath);
    comparisonEngine.saveReports();

    // Generate human-readable reports
    console.log(`\n\n📝 Generating comprehensive reports...\n`);
    const reportGenerator = new ReportGenerator(resultsPath);
    reportGenerator.saveReports();

    console.log(`\n\n✅ SIMULATION COMPLETE!\n`);
    console.log(`📂 Results saved to: ${resultsPath}`);
    console.log(`\n📄 Key outputs:`);
    console.log(`  - aggregate_results.json     (Full raw data)`);
    console.log(`  - comparison_report.json     (Analysis & comparisons)`);
    console.log(`  - SIMULATION_REPORT.md       (Human-readable report)`);
    console.log(`  - simulation_results.csv     (Spreadsheet export)`);

  } catch (error) {
    console.error(`\n❌ Simulation failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
