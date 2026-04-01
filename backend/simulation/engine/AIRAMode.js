/**
 * AIRAMode.js
 * 
 * Simulates AIRA (Autonomous Incident Recovery Agent) response
 * - Uses deterministic decision engine
 * - Applies policies
 * - Measures decision time and execution time
 */

class AIRAMode {
  constructor(company, metricsCollector) {
    this.company = company;
    this.metricsCollector = metricsCollector;
    this.responsePatterns = {
      'high_error_rate': {
        actions: ['identify_service', 'check_logs', 'rollback_or_redeploy'],
        success_rate: 0.88,
        execution_time_ms: { min: 5000, max: 15000 }
      },
      'latency_spike': {
        actions: ['identify_service', 'scale_resources', 'optimize_queries'],
        success_rate: 0.82,
        execution_time_ms: { min: 8000, max: 20000 }
      },
      'pod_crash_loop': {
        actions: ['identify_pod', 'check_logs', 'redeploy_image'],
        success_rate: 0.85,
        execution_time_ms: { min: 6000, max: 18000 }
      },
      'memory_leak': {
        actions: ['identify_service', 'collect_dump', 'restart_service'],
        success_rate: 0.65,
        execution_time_ms: { min: 15000, max: 45000 }
      },
      'db_connection_exhaustion': {
        actions: ['kill_idle_connections', 'increase_pool', 'verify_connections'],
        success_rate: 0.90,
        execution_time_ms: { min: 4000, max: 10000 }
      },
      'traffic_spike': {
        actions: ['enable_rate_limiting', 'scale_up', 'cache_aggressively'],
        success_rate: 0.78,
        execution_time_ms: { min: 3000, max: 12000 }
      },
      'cascading_failure': {
        actions: ['identify_root_cause', 'circuit_breaker', 'drain_traffic', 'fix_root_cause'],
        success_rate: 0.72,
        execution_time_ms: { min: 20000, max: 60000 }
      }
    };
  }

  respond(incident) {
    this.metricsCollector.recordMode('AIRA');

    // AIRA has fast detection due to observability (based on maturity)
    const baseDetectionDelay = this.company.observability_maturity === 'high' ? 2000 :
                               this.company.observability_maturity === 'medium' ? 5000 : 8000;
    const detectionDelay = baseDetectionDelay + (Math.random() * 2000 * incident.detection_delay_variance);

    this.metricsCollector.recordDetection(
      'AIRA',
      detectionDelay,
      incident.confidence_threshold + (Math.random() * 0.1)
    );

    // AIRA decision time (very fast due to deterministic policies)
    const decisionTime = 500 + Math.random() * 1000; // 0.5-1.5 seconds
    this.metricsCollector.recordDecisionTime(decisionTime);

    // Get response pattern
    const pattern = this.responsePatterns[incident.scenario] || {
      actions: ['generic_remediation'],
      success_rate: 0.70,
      execution_time_ms: { min: 5000, max: 15000 }
    };

    // Record response time
    this.metricsCollector.recordResponse(
      decisionTime,
      pattern.actions[0]
    );

    // Execute actions
    pattern.actions.forEach(action => {
      this.metricsCollector.recordAction(action);
    });

    // Determine success based on:
    // 1. AIRA success rate for this scenario
    // 2. Company automation maturity (better automation = higher success)
    // 3. Incident confidence threshold
    const automationBonus = (
      this.company.automation_maturity === 'high' ? 0.1 :
      this.company.automation_maturity === 'medium-high' ? 0.05 : 0
    );

    const confidence = incident.confidence_threshold + (Math.random() * 0.15);
    let success = Math.random() < (pattern.success_rate + automationBonus);

    // Fail if confidence is too low
    if (confidence < 0.7) {
      success = success && Math.random() < 0.5;
    }

    // Execute actions take time
    const executionTime = pattern.execution_time_ms.min + 
                         Math.random() * (pattern.execution_time_ms.max - pattern.execution_time_ms.min);

    const totalResolutionTime = detectionDelay + decisionTime + executionTime;

    this.metricsCollector.recordResolution(
      success,
      totalResolutionTime,
      'AIRA_automated_policy'
    );

    return {
      success,
      mttr_ms: totalResolutionTime,
      detection_time_ms: detectionDelay,
      decision_time_ms: decisionTime,
      execution_time_ms: executionTime,
      confidence_score: confidence,
      mode: 'AIRA'
    };
  }

  getName() {
    return 'AIRA (Autonomous)';
  }
}

module.exports = AIRAMode;
