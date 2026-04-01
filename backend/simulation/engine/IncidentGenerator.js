/**
 * IncidentGenerator.js
 * 
 * Generates realistic incidents over simulation time based on company profile
 * Uses Poisson distribution to model realistic incident patterns
 */

const fs = require('fs');
const path = require('path');

class IncidentGenerator {
  constructor(company, scenariosBasePath) {
    this.company = company;
    this.scenariosBasePath = scenariosBasePath;
    this.scenarios = this.loadScenarios();
    this.currentTime = 0;
    this.nextIncidentTime = this.generateNextIncidentTime();
  }

  loadScenarios() {
    const scenarios = {};
    const files = fs.readdirSync(this.scenariosBasePath);
    
    files.forEach(file => {
      if (file.endsWith('.json')) {
        const data = fs.readFileSync(
          path.join(this.scenariosBasePath, file),
          'utf-8'
        );
        const scenario = JSON.parse(data);
        scenarios[scenario.scenario_name] = scenario;
      }
    });
    
    return scenarios;
  }

  generateNextIncidentTime() {
    // Use Poisson distribution: average incidents per day = company.average_incidents_per_day
    const avgIncidentsPerSecond = this.company.average_incidents_per_day / (24 * 3600);
    const lambda = 1 / avgIncidentsPerSecond;
    
    // Generate exponential random variable (Poisson inter-arrival time)
    const u = Math.random();
    const timeToNextIncident = -lambda * Math.log(u);
    
    return this.currentTime + timeToNextIncident;
  }

  generateIncident() {
    // Select a scenario weighted by probability and company relevance
    const validScenarios = this.company.incident_types.filter(
      type => this.scenarios[type]
    );
    
    if (validScenarios.length === 0) {
      return null; // No valid scenarios for this company
    }

    const selectedScenario = validScenarios[
      Math.floor(Math.random() * validScenarios.length)
    ];
    
    const scenario = this.scenarios[selectedScenario];
    
    // Check probability of occurrence
    if (Math.random() > scenario.probability_of_occurrence) {
      return null; // Incident didn't occur this time
    }

    const incident = {
      id: `incident_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      company_name: this.company.company_name,
      scenario: selectedScenario,
      scenario_data: scenario,
      timestamp_start: this.currentTime,
      severity: scenario.severity,
      difficulty: scenario.recovery_difficulty,
      root_cause: this.selectRandomRootCause(scenario),
      is_cascading: Math.random() < 0.3 && scenario.cascading_potential,
      detection_delay_variance: Math.random() * 0.5, // variance in detection delay
      human_error_chance: this.calculateHumanErrorChance(),
      confidence_threshold: this.company.observability_maturity === 'high' ? 0.85 : 
                           this.company.observability_maturity === 'medium' ? 0.75 : 0.65,
      true_positive: Math.random() < 0.95 || this.company.observability_maturity !== 'low', // 5% false positive rate
    };

    this.currentTime = this.nextIncidentTime;
    this.nextIncidentTime = this.generateNextIncidentTime();

    return incident;
  }

  selectRandomRootCause(scenario) {
    const causes = scenario.chaos_characteristics.root_causes;
    return causes[Math.floor(Math.random() * causes.length)];
  }

  calculateHumanErrorChance() {
    // Higher automation maturity = lower chance of human error
    const automationMatrix = {
      'very_low': 0.35,
      'low': 0.28,
      'low-medium': 0.20,
      'medium': 0.15,
      'medium-high': 0.10,
      'high': 0.05
    };
    
    return automationMatrix[this.company.automation_maturity] || 0.15;
  }

  hasMoreIncidents(simulationEndTime) {
    return this.nextIncidentTime < simulationEndTime;
  }

  getNextIncidentTime() {
    return this.nextIncidentTime;
  }

  reset() {
    this.currentTime = 0;
    this.nextIncidentTime = this.generateNextIncidentTime();
  }
}

module.exports = IncidentGenerator;
