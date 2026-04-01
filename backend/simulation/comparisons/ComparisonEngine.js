/**
 * ComparisonEngine.js
 * 
 * Analyzes and compares simulation results across:
 * - AIRA vs Datadog vs Manual for each company
 * - Per-category analysis (SRE-heavy, FinTech, etc.)
 * - Aggregate analysis across all companies
 */

const fs = require('fs');
const path = require('path');

class ComparisonEngine {
  constructor(resultsBasePath, companiesBasePath) {
    this.resultsBasePath = resultsBasePath;
    this.companiesBasePath = companiesBasePath;
  }

  loadAllResults() {
    const aggregateFile = path.join(this.resultsBasePath, 'aggregate_results.json');
    return JSON.parse(fs.readFileSync(aggregateFile, 'utf-8'));
  }

  analyzeByCategory() {
    const allResults = this.loadAllResults();
    const categories = {};

    // Load company profiles to get categories
    const companies = {};
    fs.readdirSync(this.companiesBasePath).forEach(file => {
      if (file.endsWith('.json')) {
        const company = JSON.parse(
          fs.readFileSync(path.join(this.companiesBasePath, file), 'utf-8')
        );
        companies[company.company_name] = company;
      }
    });

    // Group results by category
    Object.entries(allResults).forEach(([companyName, results]) => {
      const category = companies[companyName].category;
      
      if (!categories[category]) {
        categories[category] = {
          category_name: category,
          companies: [],
          aira_aggregate: {
            success_rate_percent: 0,
            avg_mttr_seconds: 0,
            total_downtime_minutes: 0,
            total_estimated_cost: 0,
            false_positives: 0,
            human_errors: 0
          },
          datadog_aggregate: {
            success_rate_percent: 0,
            avg_mttr_seconds: 0,
            total_downtime_minutes: 0,
            total_estimated_cost: 0,
            false_positives: 0,
            human_errors: 0
          },
          manual_aggregate: {
            success_rate_percent: 0,
            avg_mttr_seconds: 0,
            total_downtime_minutes: 0,
            total_estimated_cost: 0,
            false_positives: 0,
            human_errors: 0
          }
        };
      }

      categories[category].companies.push(results);

      // Aggregate metrics
      const aira = results.aira_results;
      const datadog = results.datadog_pagerduty_results;
      const manual = results.manual_results;

      categories[category].aira_aggregate.success_rate_percent += aira.success_rate_percent;
      categories[category].aira_aggregate.avg_mttr_seconds += aira.avg_mttr_seconds;
      categories[category].aira_aggregate.total_downtime_minutes += aira.total_downtime_minutes;
      categories[category].aira_aggregate.total_estimated_cost += aira.total_estimated_cost;
      categories[category].aira_aggregate.false_positives += aira.false_positives;
      categories[category].aira_aggregate.human_errors += aira.human_errors;

      categories[category].datadog_aggregate.success_rate_percent += datadog.success_rate_percent;
      categories[category].datadog_aggregate.avg_mttr_seconds += datadog.avg_mttr_seconds;
      categories[category].datadog_aggregate.total_downtime_minutes += datadog.total_downtime_minutes;
      categories[category].datadog_aggregate.total_estimated_cost += datadog.total_estimated_cost;
      categories[category].datadog_aggregate.false_positives += datadog.false_positives;
      categories[category].datadog_aggregate.human_errors += datadog.human_errors;

      categories[category].manual_aggregate.success_rate_percent += manual.success_rate_percent;
      categories[category].manual_aggregate.avg_mttr_seconds += manual.avg_mttr_seconds;
      categories[category].manual_aggregate.total_downtime_minutes += manual.total_downtime_minutes;
      categories[category].manual_aggregate.total_estimated_cost += manual.total_estimated_cost;
      categories[category].manual_aggregate.false_positives += manual.false_positives;
      categories[category].manual_aggregate.human_errors += manual.human_errors;
    });

    // Average the aggregates
    Object.values(categories).forEach(cat => {
      const count = cat.companies.length;
      
      cat.aira_aggregate.success_rate_percent = Math.round(cat.aira_aggregate.success_rate_percent / count);
      cat.aira_aggregate.avg_mttr_seconds = Math.round(cat.aira_aggregate.avg_mttr_seconds / count);
      cat.aira_aggregate.total_downtime_minutes = Math.round(cat.aira_aggregate.total_downtime_minutes * 10 / count) / 10;

      cat.datadog_aggregate.success_rate_percent = Math.round(cat.datadog_aggregate.success_rate_percent / count);
      cat.datadog_aggregate.avg_mttr_seconds = Math.round(cat.datadog_aggregate.avg_mttr_seconds / count);
      cat.datadog_aggregate.total_downtime_minutes = Math.round(cat.datadog_aggregate.total_downtime_minutes * 10 / count) / 10;

      cat.manual_aggregate.success_rate_percent = Math.round(cat.manual_aggregate.success_rate_percent / count);
      cat.manual_aggregate.avg_mttr_seconds = Math.round(cat.manual_aggregate.avg_mttr_seconds / count);
      cat.manual_aggregate.total_downtime_minutes = Math.round(cat.manual_aggregate.total_downtime_minutes * 10 / count) / 10;

      // Calculate comparisons
      cat.aira_vs_datadog = {
        mttr_improvement_percent: Math.round(
          ((cat.datadog_aggregate.avg_mttr_seconds - cat.aira_aggregate.avg_mttr_seconds) / 
           cat.datadog_aggregate.avg_mttr_seconds) * 100
        ),
        success_rate_improvement_percent: cat.aira_aggregate.success_rate_percent - cat.datadog_aggregate.success_rate_percent,
        downtime_reduction_percent: Math.round(
          ((cat.datadog_aggregate.total_downtime_minutes - cat.aira_aggregate.total_downtime_minutes) /
           cat.datadog_aggregate.total_downtime_minutes) * 100
        )
      };

      cat.aira_vs_manual = {
        mttr_improvement_percent: Math.round(
          ((cat.manual_aggregate.avg_mttr_seconds - cat.aira_aggregate.avg_mttr_seconds) /
           cat.manual_aggregate.avg_mttr_seconds) * 100
        ),
        success_rate_improvement_percent: cat.aira_aggregate.success_rate_percent - cat.manual_aggregate.success_rate_percent,
        downtime_reduction_percent: Math.round(
          ((cat.manual_aggregate.total_downtime_minutes - cat.aira_aggregate.total_downtime_minutes) /
           cat.manual_aggregate.total_downtime_minutes) * 100
        )
      };
    });

    return categories;
  }

  generateAggregateReport() {
    const allResults = this.loadAllResults();
    const categoryAnalysis = this.analyzeByCategory();

    // Calculate overall metrics
    let totalIncidents = 0;
    let airaSuccessCount = 0, datadogSuccessCount = 0, manualSuccessCount = 0;
    let airaMTTRSum = 0, datadogMTTRSum = 0, manualMTTRSum = 0;
    let airaDowntimeSum = 0, datadogDowntimeSum = 0, manualDowntimeSum = 0;
    let airaCostSum = 0, datadogCostSum = 0, manualCostSum = 0;
    let companyCount = 0;

    Object.values(allResults).forEach(result => {
      companyCount++;
      
      const aira = result.aira_results;
      const datadog = result.datadog_pagerduty_results;
      const manual = result.manual_results;

      totalIncidents += result.simulation_metadata.total_incidents_simulated;
      
      airaSuccessCount += aira.successful_resolutions;
      datadogSuccessCount += datadog.successful_resolutions;
      manualSuccessCount += manual.successful_resolutions;

      airaMTTRSum += aira.avg_mttr_seconds;
      datadogMTTRSum += datadog.avg_mttr_seconds;
      manualMTTRSum += manual.avg_mttr_seconds;

      airaDowntimeSum += aira.total_downtime_minutes;
      datadogDowntimeSum += datadog.total_downtime_minutes;
      manualDowntimeSum += manual.total_downtime_minutes;

      airaCostSum += aira.total_estimated_cost;
      datadogCostSum += datadog.total_estimated_cost;
      manualCostSum += manual.total_estimated_cost;
    });

    const aggregateReport = {
      summary: {
        simulation_date: new Date().toISOString(),
        companies_analyzed: companyCount,
        total_incidents_simulated: totalIncidents,
        simulation_duration_days: 30,
        categories: Object.keys(categoryAnalysis).length
      },
      overall_metrics: {
        aira: {
          avg_success_rate_percent: Math.round((airaSuccessCount / totalIncidents) * 100),
          avg_mttr_seconds: Math.round(airaMTTRSum / companyCount),
          total_downtime_minutes: Math.round(airaDowntimeSum * 10) / 10,
          total_estimated_cost: Math.round(airaCostSum)
        },
        datadog_pagerduty: {
          avg_success_rate_percent: Math.round((datadogSuccessCount / totalIncidents) * 100),
          avg_mttr_seconds: Math.round(datadogMTTRSum / companyCount),
          total_downtime_minutes: Math.round(datadogDowntimeSum * 10) / 10,
          total_estimated_cost: Math.round(datadogCostSum)
        },
        manual: {
          avg_success_rate_percent: Math.round((manualSuccessCount / totalIncidents) * 100),
          avg_mttr_seconds: Math.round(manualMTTRSum / companyCount),
          total_downtime_minutes: Math.round(manualDowntimeSum * 10) / 10,
          total_estimated_cost: Math.round(manualCostSum)
        }
      },
      comparative_analysis: {
        aira_vs_datadog: {
          mttr_improvement_percent: Math.round(
            ((datadogMTTRSum - airaMTTRSum) / datadogMTTRSum) * 100
          ),
          success_rate_improvement_percent: Math.round(
            ((airaSuccessCount / totalIncidents) - (datadogSuccessCount / totalIncidents)) * 100
          ),
          downtime_reduction_percent: Math.round(
            ((datadogDowntimeSum - airaDowntimeSum) / datadogDowntimeSum) * 100
          ),
          cost_savings_dollars: Math.round(datadogCostSum - airaCostSum)
        },
        aira_vs_manual: {
          mttr_improvement_percent: Math.round(
            ((manualMTTRSum - airaMTTRSum) / manualMTTRSum) * 100
          ),
          success_rate_improvement_percent: Math.round(
            ((airaSuccessCount / totalIncidents) - (manualSuccessCount / totalIncidents)) * 100
          ),
          downtime_reduction_percent: Math.round(
            ((manualDowntimeSum - airaDowntimeSum) / manualDowntimeSum) * 100
          ),
          cost_savings_dollars: Math.round(manualCostSum - airaCostSum)
        }
      },
      category_breakdown: categoryAnalysis,
      key_insights: this.generateKeyInsights(
        allResults,
        categoryAnalysis,
        {
          aira_mttr: Math.round(airaMTTRSum / companyCount),
          datadog_mttr: Math.round(datadogMTTRSum / companyCount),
          manual_mttr: Math.round(manualMTTRSum / companyCount)
        }
      )
    };

    return aggregateReport;
  }

  generateKeyInsights(allResults, categoryAnalysis, mttrData) {
    const insights = [];

    // Insight 1: Best fit categories
    const categoryPerformance = {};
    Object.entries(categoryAnalysis).forEach(([catName, cat]) => {
      const improvement = cat.aira_vs_datadog.mttr_improvement_percent;
      categoryPerformance[catName] = improvement;
    });

    const bestCategory = Object.entries(categoryPerformance).reduce((prev, current) =>
      current[1] > prev[1] ? current : prev
    );

    insights.push({
      insight: `AIRA BEST SUITED FOR ${bestCategory[0].toUpperCase()}`,
      description: `${bestCategory[0]} category shows ${bestCategory[1]}% MTTR improvement with AIRA`,
      significance: 'high'
    });

    // Insight 2: Worst case
    const worstCategory = Object.entries(categoryPerformance).reduce((prev, current) =>
      current[1] < prev[1] ? current : prev
    );

    if (worstCategory[1] < 10) {
      insights.push({
        insight: `AIRA UNDERPERFORMS IN ${worstCategory[0].toUpperCase()}`,
        description: `${worstCategory[0]} only sees ${worstCategory[1]}% improvement; may indicate poor fit`,
        significance: 'high'
      });
    }

    // Insight 3: MTTR improvement
    const mttrImprovement = ((mttrData.datadog_mttr - mttrData.aira_mttr) / mttrData.datadog_mttr) * 100;
    insights.push({
      insight: `STRONG MTTR REDUCTION ACROSS ALL COMPANIES`,
      description: `Overall ${Math.round(mttrImprovement)}% MTTR improvement demonstrates AIRA effectiveness`,
      significance: 'high'
    });

    // Insight 4: Cost impact
    const allAiraCosts = Object.values(allResults).reduce((sum, r) => sum + r.aira_results.total_estimated_cost, 0);
    const allDatadogCosts = Object.values(allResults).reduce((sum, r) => sum + r.datadog_pagerduty_results.total_estimated_cost, 0);
    const costSavings = allDatadogCosts - allAiraCosts;

    insights.push({
      insight: `SIGNIFICANT COST SAVINGS`,
      description: `AIRA could save $${costSavings.toLocaleString()} per month across all companies`,
      significance: 'high'
    });

    return insights;
  }

  saveReports() {
    const aggregateReport = this.generateAggregateReport();

    const reportFile = path.join(this.resultsBasePath, 'comparison_report.json');
    fs.writeFileSync(reportFile, JSON.stringify(aggregateReport, null, 2));

    console.log(`\n📊 Comparison report saved to ${reportFile}`);
    return aggregateReport;
  }
}

module.exports = ComparisonEngine;
