/**
 * Chaos Test Results Reporter
 * 
 * Aggregates test results and generates comprehensive reports
 * Output formats: JSON, console logs, readable summary
 */

const fs = require('fs');
const path = require('path');

class ChaosTestReporter {
  constructor(outputDir = './chaos-test-results') {
    this.outputDir = outputDir;
    this.results = {
      executionId: require('crypto').randomUUID(),
      timestamp: new Date().toISOString(),
      scenarios: [],
      summary: {},
      metrics: {},
    };

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  /**
   * Add scenario results
   */
  addScenarioResult(scenario) {
    this.results.scenarios.push(scenario);
  }

  /**
   * Add global metrics
   */
  addGlobalMetrics(metrics) {
    this.results.metrics = metrics;
  }

  /**
   * Generate comprehensive summary
   */
  generateSummary(framework) {
    const scenarios = this.results.scenarios;
    const metrics = this.results.metrics;

    const passedScenarios = scenarios.filter(s => s.result.success).length;
    const failedScenarios = scenarios.filter(s => !s.result.success).length;

    this.results.summary = {
      executionTime: metrics.executionTime || 'unknown',
      totalScenarios: scenarios.length,
      passedScenarios,
      failedScenarios,
      successRate: `${((passedScenarios / scenarios.length) * 100).toFixed(1)}%`,
      globalMetrics: metrics,
      scenarioBreakdown: scenarios.map(s => ({
        name: s.name,
        success: s.result.success,
        details: s.result.details ? s.result.details[0] : {},
      })),
    };

    return this.results.summary;
  }

  /**
   * Export results to JSON file
   */
  exportJSON(filename = 'chaos-test-results.json') {
    const filepath = path.join(this.outputDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));
    console.log(`\n✓ Results exported to: ${filepath}`);
    return filepath;
  }

  /**
   * Generate and export markdown report
   */
  generateMarkdownReport(filename = 'CHAOS-TEST-REPORT.md') {
    const summary = this.results.summary;
    const scenarios = this.results.scenarios;

    let markdown = `# Chaos Testing Report\n\n`;
    markdown += `**Execution ID**: ${this.results.executionId}\n`;
    markdown += `**Timestamp**: ${this.results.timestamp}\n\n`;

    // Executive Summary
    markdown += `## Executive Summary\n\n`;
    markdown += `- **Total Scenarios**: ${summary.totalScenarios}\n`;
    markdown += `- **Passed**: ${summary.passedScenarios} ✓\n`;
    markdown += `- **Failed**: ${summary.failedScenarios} ✗\n`;
    markdown += `- **Success Rate**: ${summary.successRate}\n\n`;

    // Key Metrics
    markdown += `## Key Metrics\n\n`;
    markdown += `| Metric | Value |\n`;
    markdown += `|--------|-------|\n`;
    const metrics = summary.globalMetrics || {};
    markdown += `| Total Signals Injected | ${metrics.totalSignalsInjected || 0} |\n`;
    markdown += `| Total Decisions Received | ${metrics.totalDecisionsReceived || 0} |\n`;
    markdown += `| API Errors | ${metrics.totalApiErrors || 0} |\n`;
    markdown += `| Avg Latency | ${((metrics.avgLatencyMs || 0).toFixed(2))}ms |\n`;
    markdown += `| Max Latency | ${metrics.maxLatencyMs || 0}ms |\n`;
    markdown += `| Min Latency | ${metrics.minLatencyMs !== Infinity && metrics.minLatencyMs !== undefined ? metrics.minLatencyMs : 'N/A'}ms |\n`;
    markdown += `| Avg Decision Confidence | ${(((metrics.avgDecisionConfidence || 0) * 100).toFixed(1))}% |\n`;
    markdown += `| Safety Violations | ${(metrics.safetyViolations || []).length} |\n\n`;

    // Scenario Details
    markdown += `## Scenario Results\n\n`;

    for (const scenario of scenarios) {
      const status = scenario.result.success ? '✓ PASSED' : '✗ FAILED';
      markdown += `### ${scenario.name} - ${status}\n\n`;

      if (scenario.result.error) {
        markdown += `**Error**: ${scenario.result.error}\n\n`;
      } else {
        markdown += `**Metrics**:\n`;
        if (scenario.result.details && scenario.result.details.length > 0) {
          const detail = scenario.result.details[0];
          for (const [key, value] of Object.entries(detail)) {
            markdown += `- ${this._formatKeyName(key)}: ${value}\n`;
          }
        }
        markdown += '\n';

        if (scenario.result.validations && scenario.result.validations.violations) {
          const violations = scenario.result.validations.violations;
          if (violations.length > 0) {
            markdown += `**Safety Violations Detected**:\n`;
            for (const violation of violations) {
              markdown += `- ${violation.type}: ${violation.reason || 'see details'}\n`;
            }
            markdown += '\n';
          }
        }
      }
    }

    // Safety Analysis
    markdown += `## Safety Analysis\n\n`;
    markdown += `### Overall Safety Posture\n\n`;

    let totalViolations = 0;
    for (const scenario of scenarios) {
      if (scenario.result.validations && scenario.result.validations.violations) {
        totalViolations += scenario.result.validations.violations.length;
      }
    }

    if (totalViolations === 0) {
      markdown += `**✓ No safety violations detected**\n\n`;
      markdown += `The system correctly:\n`;
      markdown += `- Prevented duplicate actions (idempotency)\n`;
      markdown += `- Enforced policy constraints\n`;
      markdown += `- Maintained confidence-based decision gating\n`;
      markdown += `- Prevented cascading failures\n`;
    } else {
      markdown += `**⚠ ${totalViolations} safety violation(s) detected**\n\n`;
    }

    // Recommendations
    markdown += `## Recommendations\n\n`;

    const failedScenarios = scenarios.filter(s => !s.result.success);
    if (failedScenarios.length > 0) {
      markdown += `### Failed Scenarios\n`;
      for (const scenario of failedScenarios) {
        markdown += `- **${scenario.name}**: Review error logs and validation results\n`;
      }
      markdown += '\n';
    }

    if (this.results.metrics.avgLatencyMs > 300) {
      markdown += `### Performance\n`;
      markdown += `- Average latency (${this.results.metrics.avgLatencyMs.toFixed(2)}ms) should be optimized\n`;
      markdown += `- Consider implementing caching or async processing\n\n`;
    }

    // Conclusion
    markdown += `## Conclusion\n\n`;
    markdown += `The Lean Incident Response Decision Engine has been subjected to comprehensive chaos testing `;
    markdown += `across four critical scenarios. `;
    
    if (summary.passedScenarios === summary.totalScenarios) {
      markdown += `All scenarios passed, demonstrating robust behavior under failure conditions.`;
    } else {
      markdown += `${summary.failedScenarios} scenario(s) failed and require remediation.`;
    }

    const filepath = path.join(this.outputDir, filename);
    fs.writeFileSync(filepath, markdown);
    console.log(`✓ Markdown report exported to: ${filepath}`);
    return filepath;
  }

  /**
   * Generate console-friendly report
   */
  printConsoleSummary() {
    const summary = this.results.summary;
    const scenarios = this.results.scenarios;

    console.log('\n' + '='.repeat(80));
    console.log('CHAOS TESTING FINAL REPORT');
    console.log('='.repeat(80));

    console.log('\nEXECUTION SUMMARY:');
    console.log('-'.repeat(80));
    console.log(`Total Scenarios: ${summary.totalScenarios}`);
    console.log(`Passed: ${summary.passedScenarios} ✓`);
    console.log(`Failed: ${summary.failedScenarios} ✗`);
    console.log(`Success Rate: ${summary.successRate}`);

    console.log('\nGLOBAL METRICS:');
    console.log('-'.repeat(80));
    const metrics = summary.globalMetrics || {};
    console.log(`Total Signals Injected: ${metrics.totalSignalsInjected || 0}`);
    console.log(`Total Decisions Received: ${metrics.totalDecisionsReceived || 0}`);
    console.log(`API Errors: ${metrics.totalApiErrors || 0}`);
    console.log(`Average Latency: ${(metrics.avgLatencyMs || 0).toFixed(2)}ms`);
    console.log(`Max Latency: ${metrics.maxLatencyMs || 0}ms`);
    console.log(`Min Latency: ${metrics.minLatencyMs !== Infinity ? metrics.minLatencyMs : 'N/A'}ms`);
    console.log(`Average Decision Confidence: ${((metrics.avgDecisionConfidence || 0) * 100).toFixed(1)}%`);
    console.log(`Safety Violations: ${(metrics.safetyViolations || []).length}`);

    console.log('\nSCENARIO BREAKDOWN:');
    console.log('-'.repeat(80));
    for (const scenario of scenarios) {
      const status = scenario.result.success ? '✓' : '✗';
      console.log(`${status} ${scenario.name}`);
      
      if (scenario.result.details && scenario.result.details.length > 0) {
        const detail = scenario.result.details[0];
        for (const [key, value] of Object.entries(detail)) {
          if (key !== 'phase') {
            console.log(`  - ${this._formatKeyName(key)}: ${value}`);
          }
        }
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('END OF REPORT');
    console.log('='.repeat(80) + '\n');
  }

  /**
   * Format key names for display
   */
  _formatKeyName(key) {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Export all results
   */
  exportAll(framework) {
    console.log('\n' + '='.repeat(80));
    console.log('EXPORTING TEST RESULTS');
    console.log('='.repeat(80));

    this.printConsoleSummary();
    const jsonPath = this.exportJSON();
    const markdownPath = this.generateMarkdownReport();

    console.log(`\nResults Summary:`);
    console.log(`- JSON export: ${jsonPath}`);
    console.log(`- Markdown report: ${markdownPath}`);

    return {
      jsonPath,
      markdownPath,
      summary: this.results.summary,
    };
  }
}

module.exports = ChaosTestReporter;
