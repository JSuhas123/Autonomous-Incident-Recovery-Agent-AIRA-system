/**
 * DatadogMode.js
 * 
 * Simulates traditional monitoring (Datadog) + human response (PagerDuty style)
 * - Alert detection delay: 5-30 seconds
 * - Human response time: 2-10 minutes (varies by on-call availability)
 * - Variability and human error chance
 */

class DatadogMode {
  constructor(company, metricsCollector) {
    this.company = company;
    this.metricsCollector = metricsCollector;
    this.responsePatterns = {
      'high_error_rate': {
        actions: ['page_on_call', 'check_logs', 'decide_action', 'execute'],
        avg_resolution_time_ms: 270000, // 4.5 minutes
        success_rate: 0.85
      },
      'latency_spike': {
        actions: ['page_on_call', 'investigate', 'scale_or_optimize'],
        avg_resolution_time_ms: 480000, // 8 minutes
        success_rate: 0.78
      },
      'pod_crash_loop': {
        actions: ['page_on_call', 'ssh_to_server', 'investigate', 'redeploy'],
        avg_resolution_time_ms: 600000, // 10 minutes
        success_rate: 0.80
      },
      'memory_leak': {
        actions: ['page_on_call', 'collect_dump', 'analyze', 'restart'],
        avg_resolution_time_ms: 1200000, // 20 minutes
        success_rate: 0.60
      },
      'db_connection_exhaustion': {
        actions: ['page_on_call', 'check_connections', 'kill_idle', 'verify'],
        avg_resolution_time_ms: 300000, // 5 minutes
        success_rate: 0.87
      },
      'traffic_spike': {
        actions: ['detect_spike', 'page_on_call', 'enable_limiting', 'scale'],
        avg_resolution_time_ms: 420000, // 7 minutes
        success_rate: 0.75
      },
      'cascading_failure': {
        actions: ['escalate', 'conference_call', 'investigate', 'fix'],
        avg_resolution_time_ms: 900000, // 15 minutes
        success_rate: 0.65
      }
    };
  }

  respond(incident) {
    this.metricsCollector.recordMode('Datadog+PagerDuty');

    // Alert detection delay: 5-30 seconds (Datadog metrics collection)
    const alertDelay = 5000 + Math.random() * 25000;
    this.metricsCollector.recordDetection('Datadog', alertDelay, 0.8);

    // Human response time depends on on-call availability
    const responseDelay = this.calculateHumanResponseDelay();

    this.metricsCollector.recordResponse(
      responseDelay,
      'human_investigation'
    );

    // Get baseline response pattern
    const pattern = this.responsePatterns[incident.scenario] || {
      actions: ['generic_fix'],
      avg_resolution_time_ms: 600000, // 10 minutes default
      success_rate: 0.70
    };

    // Record actions
    pattern.actions.forEach(action => {
      this.metricsCollector.recordAction(action);
    });

    // Add variance to execution time (humans are less consistent)
    const variance = gaussianRandom() * 0.3; // ±30% variance
    const executionTime = pattern.avg_resolution_time_ms * (1 + variance);

    // Success rate reduced by human error chance
    const humanErrorChance = this.company.observability_maturity === 'high' ? 0.12 :
                            this.company.observability_maturity === 'medium' ? 0.20 : 0.30;

    let success = Math.random() < pattern.success_rate;

    // Human error can cause failure
    if (Math.random() < humanErrorChance) {
      this.metricsCollector.recordHumanError();
      success = false;
    }

    const totalResolutionTime = alertDelay + responseDelay + executionTime;

    this.metricsCollector.recordResolution(
      success,
      totalResolutionTime,
      'Human_with_Datadog_alerts'
    );

    return {
      success,
      mttr_ms: totalResolutionTime,
      detection_time_ms: alertDelay,
      response_time_ms: responseDelay,
      execution_time_ms: executionTime,
      mode: 'Datadog+PagerDuty'
    };
  }

  calculateHumanResponseDelay() {
    const onCallAvailability = this.company.on_call_availability;

    if (onCallAvailability === '24/7') {
      // Quick response: 2-5 minutes
      return 120000 + Math.random() * 180000;
    } else if (onCallAvailability === 'business_hours_plus') {
      // Medium response: 5-15 minutes
      return 300000 + Math.random() * 600000;
    } else if (onCallAvailability === 'business_hours') {
      // Slow response: 10-30 minutes
      return 600000 + Math.random() * 1200000;
    } else {
      // Very slow: 15-45 minutes
      return 900000 + Math.random() * 1800000;
    }
  }

  getName() {
    return 'Datadog + PagerDuty (Human)';
  }
}

// Helper: Gaussian random number
function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

module.exports = DatadogMode;
