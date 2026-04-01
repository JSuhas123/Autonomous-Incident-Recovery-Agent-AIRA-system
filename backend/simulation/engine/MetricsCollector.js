/**
 * MetricsCollector.js
 * 
 * Collects comprehensive metrics for each incident during simulation
 */

class MetricsCollector {
  constructor() {
    this.incidents = [];
    this.currentIncident = null;
  }

  startIncident(incident) {
    this.currentIncident = {
      id: incident.id,
      company: incident.company_name,
      scenario: incident.scenario,
      severity: incident.severity,
      timestamp_start: incident.timestamp_start,
      
      // Detection metrics
      detection_time: null,
      detection_method: null,
      
      // Response metrics
      response_time: null,
      response_action: null,
      
      // Execution metrics
      execution_time: null,
      actions_taken: [],
      
      // Resolution metrics
      resolution_time: null,
      resolution_success: null,
      
      // AIRA-specific metrics
      confidence_score: null,
      decision_time: null,
      policy_applied: null,
      
      // Comparison metrics
      mode: null,
      false_positive: false,
      repeated_incident: false,
      
      // Outcome metrics
      downtime_minutes: null,
      estimated_cost_impact: null,
      human_error_occurred: false,
    };
  }

  recordDetection(mode, detectionTime, confidence = null) {
    if (!this.currentIncident) return;
    
    this.currentIncident.detection_time = detectionTime;
    this.currentIncident.detection_method = mode;
    this.currentIncident.confidence_score = confidence;
  }

  recordResponse(responseTime, action) {
    if (!this.currentIncident) return;
    
    this.currentIncident.response_time = responseTime;
    this.currentIncident.response_action = action;
  }

  recordDecisionTime(decisionTime) {
    if (!this.currentIncident) return;
    
    this.currentIncident.decision_time = decisionTime;
  }

  recordAction(action) {
    if (!this.currentIncident) return;
    
    this.currentIncident.actions_taken.push(action);
  }

  recordResolution(success, resolutionTime, policy = null) {
    if (!this.currentIncident) return;
    
    this.currentIncident.resolution_success = success;
    this.currentIncident.resolution_time = resolutionTime;
    this.currentIncident.policy_applied = policy;
  }

  recordMode(mode) {
    if (!this.currentIncident) return;
    
    this.currentIncident.mode = mode;
  }

  recordHumanError() {
    if (!this.currentIncident) return;
    
    this.currentIncident.human_error_occurred = true;
    this.currentIncident.resolution_success = false;
  }

  recordFalsePositive() {
    if (!this.currentIncident) return;
    
    this.currentIncident.false_positive = true;
  }

  finishIncident() {
    if (!this.currentIncident) return;
    
    // Calculate final metrics
    const mttr = this.currentIncident.resolution_time - this.currentIncident.detection_time;
    const downtimeMinutes = (mttr / 1000) / 60; // Convert ms to minutes
    
    this.currentIncident.mttr_seconds = Math.round(mttr / 1000);
    this.currentIncident.downtime_minutes = Math.round(downtimeMinutes * 10) / 10;
    
    // Estimate cost impact
    const companyLossPerMinute = 5000; // Default estimate
    this.currentIncident.estimated_cost_impact = Math.round(
      this.currentIncident.downtime_minutes * companyLossPerMinute
    );
    
    this.incidents.push(this.currentIncident);
    this.currentIncident = null;
  }

  getMetrics() {
    return {
      total_incidents: this.incidents.length,
      successful_resolutions: this.incidents.filter(i => i.resolution_success).length,
      failed_resolutions: this.incidents.filter(i => !i.resolution_success).length,
      false_positives: this.incidents.filter(i => i.false_positive).length,
      human_errors: this.incidents.filter(i => i.human_error_occurred).length,
      avg_mttr_seconds: Math.round(
        this.incidents.reduce((sum, i) => sum + (i.mttr_seconds || 0), 0) / Math.max(this.incidents.length, 1)
      ),
      avg_detection_time_seconds: Math.round(
        this.incidents.reduce((sum, i) => sum + (i.detection_time || 0), 0) / Math.max(this.incidents.length, 1) / 1000
      ),
      avg_response_time_seconds: Math.round(
        this.incidents.reduce((sum, i) => sum + (i.response_time || 0), 0) / Math.max(this.incidents.length, 1) / 1000
      ),
      total_downtime_minutes: Math.round(
        this.incidents.reduce((sum, i) => sum + (i.downtime_minutes || 0), 0) * 10
      ) / 10,
      success_rate_percent: Math.round(
        (this.incidents.filter(i => i.resolution_success).length / Math.max(this.incidents.length, 1)) * 100
      ),
      avg_confidence_score: this.incidents
        .filter(i => i.confidence_score !== null)
        .reduce((sum, i) => sum + i.confidence_score, 0) / 
        Math.max(this.incidents.filter(i => i.confidence_score !== null).length, 1),
      total_estimated_cost: this.incidents.reduce((sum, i) => sum + (i.estimated_cost_impact || 0), 0),
    };
  }

  getDetailedIncidents() {
    return this.incidents;
  }

  reset() {
    this.incidents = [];
    this.currentIncident = null;
  }
}

module.exports = MetricsCollector;
