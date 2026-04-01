/**
 * SimulationRunner.js
 * 
 * Main orchestrator that:
 * 1. Loads company config
 * 2. Generates incidents over simulation time
 * 3. Runs all 3 modes (AIRA, Datadog, Manual) for each incident
 * 4. Collects metrics
 * 5. Generates results
 */

const fs = require('fs');
const path = require('path');
const IncidentGenerator = require('./IncidentGenerator');
const MetricsCollector = require('./MetricsCollector');
const AIRAMode = require('./AIRAMode');
const DatadogMode = require('./DatadogMode');
const ManualMode = require('./ManualMode');

class SimulationRunner {
  constructor(companiesBasePath, scenariosBasePath, resultsBasePath) {
    this.companiesBasePath = companiesBasePath;
    this.scenariosBasePath = scenariosBasePath;
    this.resultsBasePath = resultsBasePath;
    this.simulationDurationDays = 30; // Simulate 30 days
    this.simulationDurationSeconds = this.simulationDurationDays * 24 * 3600;
  }

  runSimulation(companyName) {
    console.log(`\n🔄 Running simulation for ${companyName}...`);

    // Load company config
    const companyPath = path.join(this.companiesBasePath, `${companyName}.json`);
    const company = JSON.parse(fs.readFileSync(companyPath, 'utf-8'));

    // Initialize components
    const incidentGenerator = new IncidentGenerator(company, this.scenariosBasePath);
    const airaMetrics = new MetricsCollector();
    const datadogMetrics = new MetricsCollector();
    const manualMetrics = new MetricsCollector();

    const airaMode = new AIRAMode(company, airaMetrics);
    const datadogMode = new DatadogMode(company, datadogMetrics);
    const manualMode = new ManualMode(company, manualMetrics);

    // Generate and simulate incidents
    let incidentCount = 0;
    while (incidentGenerator.hasMoreIncidents(this.simulationDurationSeconds)) {
      const incident = incidentGenerator.generateIncident();
      
      if (!incident || !incident.true_positive) {
        continue; // Skip false positives or non-incidents
      }

      incidentCount++;

      console.log(`  📍 Incident ${incidentCount}: ${incident.scenario} (${incident.severity})`);

      // Run AIRA mode
      airaMetrics.startIncident(incident);
      const airaResult = airaMode.respond(incident);
      airaMetrics.finishIncident();

      // Run Datadog mode
      datadogMetrics.startIncident(incident);
      const datadogResult = datadogMode.respond(incident);
      datadogMetrics.finishIncident();

      // Run Manual mode
      manualMetrics.startIncident(incident);
      const manualResult = manualMode.respond(incident);
      manualMetrics.finishIncident();

      // Log incident results
      console.log(`    ✅ AIRA: ${Math.round(airaResult.mttr_ms / 1000)}s (${airaResult.success ? 'SUCCESS' : 'FAILED'})`);
      console.log(`    ✅ Datadog: ${Math.round(datadogResult.mttr_ms / 1000)}s (${datadogResult.success ? 'SUCCESS' : 'FAILED'})`);
      console.log(`    ✅ Manual: ${Math.round(manualResult.mttr_ms / 1000)}s (${manualResult.success ? 'SUCCESS' : 'FAILED'})`);
    }

    // Compile results
    const results = {
      simulation_metadata: {
        company: company.company_name,
        category: company.category,
        simulation_days: this.simulationDurationDays,
        total_incidents_simulated: incidentCount,
        timestamp: new Date().toISOString()
      },
      company_profile: {
        domain: company.domain,
        architecture: company.system_architecture,
        infra_type: company.infra_type,
        observability_maturity: company.observability_maturity,
        automation_maturity: company.automation_maturity,
        sla_target_minutes: company.sla_target_minutes,
        estimated_loss_per_minute: company.estimated_loss_per_minute
      },
      aira_results: {
        mode_name: 'AIRA (Autonomous)',
        mode_name_pretty: 'AIRA (Autonomous)',
        ...airaMetrics.getMetrics(),
        incidents: airaMetrics.getDetailedIncidents()
      },
      datadog_pagerduty_results: {
        mode_name: 'Datadog + PagerDuty (Human)',
        mode_name_pretty: 'Datadog + PagerDuty',
        ...datadogMetrics.getMetrics(),
        incidents: datadogMetrics.getDetailedIncidents()
      },
      manual_results: {
        mode_name: 'Manual Only',
        mode_name_pretty: 'Manual',
        ...manualMetrics.getMetrics(),
        incidents: manualMetrics.getDetailedIncidents()
      },
      comparisons: this.generateComparisons(airaMetrics, datadogMetrics, manualMetrics, company),
      key_findings: this.generateKeyFindings(airaMetrics, datadogMetrics, manualMetrics, company)
    };

    // Save results
    const resultsFile = path.join(this.resultsBasePath, `${companyName}_results.json`);
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
    console.log(`  💾 Results saved to ${resultsFile}`);

    return results;
  }

  generateComparisons(airaMetrics, datadogMetrics, manualMetrics, company) {
    const airaData = airaMetrics.getMetrics();
    const datadogData = datadogMetrics.getMetrics();
    const manualData = manualMetrics.getMetrics();

    return {
      aira_vs_datadog: {
        mttr_improvement_percent: Math.round(
          ((datadogData.avg_mttr_seconds - airaData.avg_mttr_seconds) / datadogData.avg_mttr_seconds) * 100
        ),
        success_rate_improvement_percent: airaData.success_rate_percent - datadogData.success_rate_percent,
        downtime_reduction_percent: Math.round(
          ((datadogData.total_downtime_minutes - airaData.total_downtime_minutes) / datadogData.total_downtime_minutes) * 100
        ),
        cost_savings_dollars: datadogData.total_estimated_cost - airaData.total_estimated_cost
      },
      aira_vs_manual: {
        mttr_improvement_percent: Math.round(
          ((manualData.avg_mttr_seconds - airaData.avg_mttr_seconds) / manualData.avg_mttr_seconds) * 100
        ),
        success_rate_improvement_percent: airaData.success_rate_percent - manualData.success_rate_percent,
        downtime_reduction_percent: Math.round(
          ((manualData.total_downtime_minutes - airaData.total_downtime_minutes) / manualData.total_downtime_minutes) * 100
        ),
        cost_savings_dollars: manualData.total_estimated_cost - airaData.total_estimated_cost
      },
      datadog_vs_manual: {
        mttr_improvement_percent: Math.round(
          ((manualData.avg_mttr_seconds - datadogData.avg_mttr_seconds) / manualData.avg_mttr_seconds) * 100
        ),
        success_rate_improvement_percent: datadogData.success_rate_percent - manualData.success_rate_percent,
        downtime_reduction_percent: Math.round(
          ((manualData.total_downtime_minutes - datadogData.total_downtime_minutes) / manualData.total_downtime_minutes) * 100
        )
      }
    };
  }

  generateKeyFindings(airaMetrics, datadogMetrics, manualMetrics, company) {
    const airaData = airaMetrics.getMetrics();
    const datadogData = datadogMetrics.getMetrics();
    const manualData = manualMetrics.getMetrics();

    const findings = [];

    // Finding 1: AIRA effectiveness
    if (airaData.success_rate_percent >= 85) {
      findings.push({
        title: 'AIRA Highly Effective',
        description: `${company.company_name} sees exceptional AIRA success rate of ${airaData.success_rate_percent}%`,
        impact: 'high'
      });
    } else if (airaData.success_rate_percent >= 70) {
      findings.push({
        title: 'AIRA Moderately Effective',
        description: `${company.company_name} achieves ${airaData.success_rate_percent}% success with AIRA`,
        impact: 'medium'
      });
    } else {
      findings.push({
        title: 'AIRA Needs Improvement',
        description: `${company.company_name} shows low AIRA success rate of ${airaData.success_rate_percent}%`,
        impact: 'high'
      });
    }

    // Finding 2: MTTR improvement
    const mttrImprovement = ((datadogData.avg_mttr_seconds - airaData.avg_mttr_seconds) / datadogData.avg_mttr_seconds) * 100;
    findings.push({
      title: 'MTTR Reduction vs Datadog',
      description: `AIRA reduces MTTR by ${Math.round(mttrImprovement)}% compared to Datadog+PagerDuty`,
      impact: 'high'
    });

    // Finding 3: Human error impact
    if (datadogData.human_errors > 0) {
      findings.push({
        title: 'Human Error Impact',
        description: `${datadogData.human_errors} human errors occurred in Datadog mode vs ${airaData.human_errors} in AIRA`,
        impact: 'medium'
      });
    }

    // Finding 4: Cost impact
    const costSavings = datadogData.total_estimated_cost - airaData.total_estimated_cost;
    if (costSavings > 0) {
      findings.push({
        title: 'Estimated Cost Savings',
        description: `AIRA could save $${costSavings.toLocaleString()} per month compared to Datadog`,
        impact: 'high'
      });
    }

    // Finding 5: AIRA fit for company
    if (company.observability_maturity === 'high' && company.automation_maturity === 'high') {
      findings.push({
        title: 'Ideal AIRA Candidate',
        description: `${company.company_name} is well-positioned for AIRA with mature observability and automation`,
        impact: 'high'
      });
    } else if (company.observability_maturity === 'low') {
      findings.push({
        title: 'AIRA Readiness Gap',
        description: `${company.company_name} needs better observability infrastructure before AIRA deployment`,
        impact: 'medium'
      });
    }

    return findings;
  }

  runAllCompanies() {
    const companies = fs.readdirSync(this.companiesBasePath)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));

    console.log(`\n\n╔═══════════════════════════════════════════════╗`);
    console.log(`║  AIRA SIMULATION FRAMEWORK - BATCH RUN        ║`);
    console.log(`║  ${companies.length} companies × 3 modes = ${companies.length * 3} scenarios        ║`);
    console.log(`╚═══════════════════════════════════════════════╝\n`);

    const allResults = {};

    for (const company of companies) {
      try {
        const results = this.runSimulation(company);
        allResults[company] = results;
      } catch (error) {
        console.error(`❌ Error simulating ${company}: ${error.message}`);
      }
    }

    // Save aggregate results
    const aggregateFile = path.join(this.resultsBasePath, 'aggregate_results.json');
    fs.writeFileSync(aggregateFile, JSON.stringify(allResults, null, 2));
    console.log(`\n💾 Aggregate results saved to ${aggregateFile}`);

    return allResults;
  }
}

module.exports = SimulationRunner;
