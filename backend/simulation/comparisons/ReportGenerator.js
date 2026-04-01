/**
 * ReportGenerator.js
 * 
 * Generates human-readable reports from simulation results
 * - Per-company summaries
 * - Aggregate report
 * - Category-based analysis
 * - CSV exports for easy analysis
 */

const fs = require('fs');
const path = require('path');

class ReportGenerator {
  constructor(resultsBasePath) {
    this.resultsBasePath = resultsBasePath;
  }

  loadAggregateResults() {
    const file = path.join(this.resultsBasePath, 'aggregate_results.json');
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  }

  loadComparisonReport() {
    const file = path.join(this.resultsBasePath, 'comparison_report.json');
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  }

  generateMarkdownReport() {
    const comparison = this.loadComparisonReport();
    const aggregateResults = this.loadAggregateResults();

    let markdown = `# AIRA Simulation Framework - Comprehensive Report

Generated: ${new Date().toISOString()}

## Executive Summary

This report analyzes AIRA's performance against traditional monitoring (Datadog + PagerDuty) and manual incident response across **${comparison.summary.companies_analyzed}** representative companies.

### Key Numbers

- **Companies Analyzed**: ${comparison.summary.companies_analyzed}
- **Total Incidents Simulated**: ${comparison.summary.total_incidents_simulated}
- **Simulation Period**: ${comparison.summary.simulation_duration_days} days
- **Comparison Modes**: AIRA vs Datadog+PagerDuty vs Manual

---

## Overall Performance Summary

### AIRA (Autonomous)
- **Success Rate**: ${comparison.overall_metrics.aira.avg_success_rate_percent}%
- **Avg MTTR**: ${comparison.overall_metrics.aira.avg_mttr_seconds}s (${Math.round(comparison.overall_metrics.aira.avg_mttr_seconds / 60)}m)
- **Total Monthly Downtime**: ${comparison.overall_metrics.aira.total_downtime_minutes}m
- **Estimated Monthly Cost**: $${comparison.overall_metrics.aira.total_estimated_cost.toLocaleString()}

### Datadog + PagerDuty (Human)
- **Success Rate**: ${comparison.overall_metrics.datadog_pagerduty.avg_success_rate_percent}%
- **Avg MTTR**: ${comparison.overall_metrics.datadog_pagerduty.avg_mttr_seconds}s (${Math.round(comparison.overall_metrics.datadog_pagerduty.avg_mttr_seconds / 60)}m)
- **Total Monthly Downtime**: ${comparison.overall_metrics.datadog_pagerduty.total_downtime_minutes}m
- **Estimated Monthly Cost**: $${comparison.overall_metrics.datadog_pagerduty.total_estimated_cost.toLocaleString()}

### Manual Only
- **Success Rate**: ${comparison.overall_metrics.manual.avg_success_rate_percent}%
- **Avg MTTR**: ${comparison.overall_metrics.manual.avg_mttr_seconds}s (${Math.round(comparison.overall_metrics.manual.avg_mttr_seconds / 60)}m)
- **Total Monthly Downtime**: ${comparison.overall_metrics.manual.total_downtime_minutes}m
- **Estimated Monthly Cost**: $${comparison.overall_metrics.manual.total_estimated_cost.toLocaleString()}

---

## Comparative Analysis

### AIRA vs Datadog+PagerDuty
- **MTTR Improvement**: ${comparison.comparative_analysis.aira_vs_datadog.mttr_improvement_percent}% faster
- **Success Rate Improvement**: ${comparison.comparative_analysis.aira_vs_datadog.success_rate_improvement_percent}% better
- **Downtime Reduction**: ${comparison.comparative_analysis.aira_vs_datadog.downtime_reduction_percent}% less downtime
- **Cost Savings**: $${comparison.comparative_analysis.aira_vs_datadog.cost_savings_dollars.toLocaleString()} per month

### AIRA vs Manual
- **MTTR Improvement**: ${comparison.comparative_analysis.aira_vs_manual.mttr_improvement_percent}% faster
- **Success Rate Improvement**: ${comparison.comparative_analysis.aira_vs_manual.success_rate_improvement_percent}% better
- **Downtime Reduction**: ${comparison.comparative_analysis.aira_vs_manual.downtime_reduction_percent}% less downtime
- **Cost Savings**: $${comparison.comparative_analysis.aira_vs_manual.cost_savings_dollars.toLocaleString()} per month

---

## Category-Based Analysis

`;

    // Add category analysis
    Object.entries(comparison.category_breakdown).forEach(([category, data]) => {
      markdown += `### ${category}

**Companies**: ${data.companies.length}

#### AIRA Performance
- Success Rate: ${data.aira_aggregate.success_rate_percent}%
- Avg MTTR: ${data.aira_aggregate.avg_mttr_seconds}s
- Monthly Downtime: ${data.aira_aggregate.total_downtime_minutes}m

#### Datadog Performance
- Success Rate: ${data.datadog_aggregate.success_rate_percent}%
- Avg MTTR: ${data.datadog_aggregate.avg_mttr_seconds}s
- Monthly Downtime: ${data.datadog_aggregate.total_downtime_minutes}m

#### AIRA Advantage
- MTTR: ${data.aira_vs_datadog.mttr_improvement_percent}% faster
- Success: ${data.aira_vs_datadog.success_rate_improvement_percent}% better
- Downtime: ${data.aira_vs_datadog.downtime_reduction_percent}% less

---

`;
    });

    // Add key insights
    markdown += `## Key Insights & Findings

`;

    comparison.key_insights.forEach((insight, index) => {
      markdown += `${index + 1}. **${insight.insight}**\n   ${insight.description}\n\n`;
    });

    markdown += `---

## Per-Company Analysis

`;

    // Add per-company results
    Object.entries(aggregateResults).forEach(([company, results]) => {
      markdown += `### ${company}

**Profile**: ${results.company_profile.domain}
- Architecture: ${results.company_profile.architecture}
- Observability: ${results.company_profile.observability_maturity}
- Automation: ${results.company_profile.automation_maturity}

#### Results Comparison

| Metric | AIRA | Datadog | Manual |
|--------|------|---------|--------|
| Success Rate | ${results.aira_results.success_rate_percent}% | ${results.datadog_pagerduty_results.success_rate_percent}% | ${results.manual_results.success_rate_percent}% |
| Avg MTTR | ${results.aira_results.avg_mttr_seconds}s | ${results.datadog_pagerduty_results.avg_mttr_seconds}s | ${results.manual_results.avg_mttr_seconds}s |
| Downtime/Month | ${results.aira_results.total_downtime_minutes}m | ${results.datadog_pagerduty_results.total_downtime_minutes}m | ${results.manual_results.total_downtime_minutes}m |

`;

      // Add findings
      markdown += `#### Key Findings\n\n`;
      results.key_findings.forEach(finding => {
        markdown += `- **${finding.title}**: ${finding.description}\n`;
      });

      markdown += `\n`;
    });

    markdown += `---

## Conclusion

AIRA demonstrates significant improvements in incident resolution across multiple scenarios:

1. **Automation Wins**: Faster decision-making and action execution
2. **Reduced Human Error**: Deterministic policies eliminate human mistakes
3. **Cost Impact**: Substantial savings through reduced downtime
4. **Best Fit**: Highly effective for SRE-heavy and FinTech companies with mature infrastructure

### Recommendations

- **Deploy AIRA For**: SRE-heavy systems, FinTech platforms, high-observability environments
- **Augment First**: Companies with low observability should improve monitoring before AIRA deployment
- **Hybrid Approach**: Use AIRA for deterministic issues, humans for complex scenarios
- **Continuous Learning**: Collect feedback and refine policies over time

---

Generated on ${new Date().toISOString()}
`;

    return markdown;
  }

  generateCSVReport() {
    const aggregateResults = this.loadAggregateResults();
    
    let csv = 'Company,Category,AIRA Success %,Datadog Success %,Manual Success %,AIRA MTTR (s),Datadog MTTR (s),Manual MTTR (s),AIRA Downtime (m),Datadog Downtime (m),Manual Downtime (m)\n';

    Object.entries(aggregateResults).forEach(([company, results]) => {
      csv += `${company},`;
      csv += `${results.company_profile.infra_type},`;
      csv += `${results.aira_results.success_rate_percent},`;
      csv += `${results.datadog_pagerduty_results.success_rate_percent},`;
      csv += `${results.manual_results.success_rate_percent},`;
      csv += `${results.aira_results.avg_mttr_seconds},`;
      csv += `${results.datadog_pagerduty_results.avg_mttr_seconds},`;
      csv += `${results.manual_results.avg_mttr_seconds},`;
      csv += `${results.aira_results.total_downtime_minutes},`;
      csv += `${results.datadog_pagerduty_results.total_downtime_minutes},`;
      csv += `${results.manual_results.total_downtime_minutes}\n`;
    });

    return csv;
  }

  saveReports() {
    const markdown = this.generateMarkdownReport();
    const csv = this.generateCSVReport();

    // Save markdown
    const mdFile = path.join(this.resultsBasePath, 'SIMULATION_REPORT.md');
    fs.writeFileSync(mdFile, markdown);
    console.log(`\n📄 Markdown report saved to ${mdFile}`);

    // Save CSV
    const csvFile = path.join(this.resultsBasePath, 'simulation_results.csv');
    fs.writeFileSync(csvFile, csv);
    console.log(`📊 CSV export saved to ${csvFile}`);

    // Print summary to console
    console.log('\n' + '='.repeat(60));
    console.log('SIMULATION COMPLETE - KEY METRICS');
    console.log('='.repeat(60));
    
    const comparison = this.loadComparisonReport();
    console.log(`\nAIRA vs Datadog+PagerDuty:`);
    console.log(`  ✅ MTTR: ${comparison.comparative_analysis.aira_vs_datadog.mttr_improvement_percent}% faster`);
    console.log(`  ✅ Success: ${comparison.comparative_analysis.aira_vs_datadog.success_rate_improvement_percent}% better`);
    console.log(`  ✅ Downtime: ${comparison.comparative_analysis.aira_vs_datadog.downtime_reduction_percent}% less`);
    console.log(`  💰 Cost Savings: $${comparison.comparative_analysis.aira_vs_datadog.cost_savings_dollars.toLocaleString()} per month`);
    
    console.log(`\nAIRA vs Manual Only:`);
    console.log(`  ✅ MTTR: ${comparison.comparative_analysis.aira_vs_manual.mttr_improvement_percent}% faster`);
    console.log(`  ✅ Success: ${comparison.comparative_analysis.aira_vs_manual.success_rate_improvement_percent}% better`);
    console.log(`  ✅ Downtime: ${comparison.comparative_analysis.aira_vs_manual.downtime_reduction_percent}% less`);
    console.log(`  💰 Cost Savings: $${comparison.comparative_analysis.aira_vs_manual.cost_savings_dollars.toLocaleString()} per month`);
    
    console.log('\n' + '='.repeat(60));

    return { mdFile, csvFile };
  }
}

module.exports = ReportGenerator;
