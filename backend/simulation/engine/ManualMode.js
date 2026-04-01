/**
 * ManualMode.js
 * 
 * Simulates MANUAL ONLY incident response
 * - No alerts, pure manual detection
 * - Very slow response: 10-30+ minutes
 * - High human error rate
 * - Higher failure rate
 */

class ManualMode {
  constructor(company, metricsCollector) {
    this.company = company;
    this.metricsCollector = metricsCollector;
    this.responsePatterns = {
      'high_error_rate': {
        actions: ['user_reports_issue', 'manual_check', 'investigate', 'fix'],
        base_resolution_time_ms: 900000, // 15 minutes
        success_rate: 0.65
      },
      'latency_spike': {
        actions: ['user_complains', 'check_system', 'investigate', 'scale_or_fix'],
        base_resolution_time_ms: 1200000, // 20 minutes
        success_rate: 0.60
      },
      'pod_crash_loop': {
        actions: ['user_reports', 'manual_check', 'ssh_and_investigate', 'restart'],
        base_resolution_time_ms: 1500000, // 25 minutes
        success_rate: 0.58
      },
      'memory_leak': {
        actions: ['issue_noticed', 'manual_investigation', 'restart_service'],
        base_resolution_time_ms: 1800000, // 30 minutes
        success_rate: 0.45
      },
      'db_connection_exhaustion': {
        actions: ['users_report', 'manual_check', 'kill_connections', 'verify'],
        base_resolution_time_ms: 1200000, // 20 minutes
        success_rate: 0.70
      },
      'traffic_spike': {
        actions: ['site_down', 'manual_check', 'investigate', 'scale_manually'],
        base_resolution_time_ms: 1500000, // 25 minutes
        success_rate: 0.55
      },
      'cascading_failure': {
        actions: ['major_outage', 'long_investigation', 'manual_fix', 'recovery'],
        base_resolution_time_ms: 2400000, // 40 minutes
        success_rate: 0.40
      }
    };
  }

  respond(incident) {
    this.metricsCollector.recordMode('Manual');

    // DETECTION: Manual detection (user reports or logs check)
    // Very slow: 5-15 minutes for someone to notice
    const detectionDelay = 300000 + Math.random() * 600000; // 5-15 minutes

    this.metricsCollector.recordDetection('Manual', detectionDelay, 0.5);

    // RESPONSE: Person needs to respond to issue
    // Another 5-20 minutes
    const responseDelay = 300000 + Math.random() * 1200000;

    this.metricsCollector.recordResponse(
      responseDelay,
      'manual_investigation'
    );

    // Get baseline pattern
    const pattern = this.responsePatterns[incident.scenario] || {
      actions: ['manual_fix'],
      base_resolution_time_ms: 1500000, // 25 minutes
      success_rate: 0.50
    };

    // Record actions
    pattern.actions.forEach(action => {
      this.metricsCollector.recordAction(action);
    });

    // Execution time with HIGH variance (humans are very inconsistent without automation)
    const variance = gaussianRandom() * 0.5; // ±50% variance
    const executionTime = pattern.base_resolution_time_ms * (1 + variance);

    // Very high human error rate
    const humanErrorChance = 0.35; // 35% chance of wrong action, mistake

    let success = Math.random() < pattern.success_rate;

    // Human error is very likely in manual-only mode
    if (Math.random() < humanErrorChance) {
      this.metricsCollector.recordHumanError();
      success = false;
    }

    // Higher chance of false positives or wasted time
    if (Math.random() < 0.15) {
      this.metricsCollector.recordFalsePositive();
    }

    const totalResolutionTime = detectionDelay + responseDelay + executionTime;

    this.metricsCollector.recordResolution(
      success,
      totalResolutionTime,
      'Manual_only'
    );

    return {
      success,
      mttr_ms: totalResolutionTime,
      detection_time_ms: detectionDelay,
      response_time_ms: responseDelay,
      execution_time_ms: executionTime,
      mode: 'Manual'
    };
  }

  getName() {
    return 'Manual Only';
  }
}

// Helper: Gaussian random number
function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

module.exports = ManualMode;
