/**
 * Decision Pipeline Observability Service
 * 
 * Tracks and reports on:
 * - Signal injection rate
 * - Decision generation rate
 * - Confidence score distribution
 * - Signal drop reasons
 * - Action execution results
 * - Latency metrics
 * 
 * Provides structured logs and Prometheus-style metrics
 */

const EventEmitter = require('node:events');

class DecisionPipelineObservability extends EventEmitter {
  constructor() {
    super();
    
    // Metrics aggregation buckets
    this.metrics = {
      signals: {
        total_injected: 0,
        by_type: {},
        by_severity: {},
        by_pattern: {},
      },
      decisions: {
        total_generated: 0,
        by_tier: {
          execute: 0,
          safe_fallback: 0,
          escalate: 0,
          observe: 0,
        },
        by_action: {},
        by_confidence_bucket: {
          'very_high_0.9+': 0,
          'high_0.8+': 0,
          'medium_0.65+': 0,
          'low_0.5+': 0,
          'very_low_<0.5': 0,
        }
      },
      actions: {
        total_executed: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        by_action: {}
      },
      drops: {
        total: 0,
        by_reason: {},
      },
      latency: {
        decision_ms: [],
        action_execution_ms: [],
        p50_decision: 0,
        p95_decision: 0,
        p99_decision: 0,
      }
    };

    // Rolling window for recent signals (last 1000)
    this.recentSignals = [];
    this.maxRecentBuffer = 1000;

    // Initialize timestamp
    this.sessionStart = new Date();
  }

  /**
   * Record signal injection
   */
  recordSignalInjected(signal, tenantId) {
    const signalRecord = {
      timestamp: new Date(),
      tenantId,
      type: signal.signalType || 'UNKNOWN',
      severity: signal.severity || 'MEDIUM',
      pattern: 'unknown',
      errorRate: signal.errorRate,
      responseTime: signal.responseTime,
    };

    // Update metrics
    this.metrics.signals.total_injected++;
    this.metrics.signals.by_type[signalRecord.type] = 
      (this.metrics.signals.by_type[signalRecord.type] || 0) + 1;
    this.metrics.signals.by_severity[signalRecord.severity] = 
      (this.metrics.signals.by_severity[signalRecord.severity] || 0) + 1;

    // Maintain rolling buffer
    this.recentSignals.push(signalRecord);
    if (this.recentSignals.length > this.maxRecentBuffer) {
      this.recentSignals.shift();
    }

    return signalRecord;
  }

  /**
   * Record decision generated
   */
  recordDecisionGenerated(decision, confidence, tier, action, patternType) {
    const decisionRecord = {
      timestamp: new Date(),
      confidence,
      tier,
      action,
      patternType,
    };

    // Update metrics
    this.metrics.decisions.total_generated++;
    this.metrics.decisions.by_tier[tier] = 
      (this.metrics.decisions.by_tier[tier] || 0) + 1;
    this.metrics.decisions.by_action[action] = 
      (this.metrics.decisions.by_action[action] || 0) + 1;

    // Confidence bucket
    let bucket;
    if (confidence >= 0.9) bucket = 'very_high_0.9+';
    else if (confidence >= 0.8) bucket = 'high_0.8+';
    else if (confidence >= 0.65) bucket = 'medium_0.65+';
    else if (confidence >= 0.5) bucket = 'low_0.5+';
    else bucket = 'very_low_<0.5';
    
    this.metrics.decisions.by_confidence_bucket[bucket]++;

    return decisionRecord;
  }

  /**
   * Record signal drop
   */
  recordSignalDropped(tenantId, signal, reason) {
    const dropRecord = {
      timestamp: new Date(),
      tenantId,
      reason,
      signalType: signal.signalType,
      severity: signal.severity,
    };

    this.metrics.drops.total++;
    this.metrics.drops.by_reason[reason] = 
      (this.metrics.drops.by_reason[reason] || 0) + 1;

    // Warn about drops  
    console.warn(`[Observability] ⚠ Signal dropped: reason=${reason}, type=${signal.signalType}, severity=${signal.severity}`);

    return dropRecord;
  }

  /**
   * Record action execution attempt
   */
  recordActionExecution(action, status, durationMs) {
    const record = {
      timestamp: new Date(),
      action,
      status, // SUCCESS | FAILED | SKIPPED
      durationMs,
    };

    this.metrics.actions.total_executed++;
    this.metrics.actions[status.toLowerCase()]++;
    this.metrics.actions.by_action[action] = 
      (this.metrics.actions.by_action[action] || 0) + 1;

    // Track latency
    this.metrics.latency.action_execution_ms.push(durationMs);
    if (this.metrics.latency.action_execution_ms.length > 10000) {
      this.metrics.latency.action_execution_ms.shift();
    }

    this._updateLatencyPercentiles();

    return record;
  }

  /**
   * Record decision latency
   */
  recordDecisionLatency(durationMs) {
    this.metrics.latency.decision_ms.push(durationMs);
    if (this.metrics.latency.decision_ms.length > 10000) {
      this.metrics.latency.decision_ms.shift();
    }
    this._updateLatencyPercentiles();
  }

  /**
   * Get comprehensive metrics report
   */
  getMetricsReport() {
    const now = new Date();
    const uptime = now - this.sessionStart;

    return {
      timestamp: now.toISOString(),
      uptime_ms: uptime,
      signals: {
        total_injected: this.metrics.signals.total_injected,
        by_type: this.metrics.signals.by_type,
        by_severity: this.metrics.signals.by_severity,
        injection_rate_per_min: Math.round((this.metrics.signals.total_injected / uptime) * 60000),
      },
      decisions: {
        total_generated: this.metrics.decisions.total_generated,
        generation_rate_per_min: Math.round((this.metrics.decisions.total_generated / uptime) * 60000),
        decision_rate_percent: uptime > 0 
          ? ((this.metrics.decisions.total_generated / this.metrics.signals.total_injected) * 100).toFixed(2)
          : '0.00',
        by_tier: this.metrics.decisions.by_tier,
        by_action: this.metrics.decisions.by_action,
        confidence_distribution: this.metrics.decisions.by_confidence_bucket,
      },
      actions: {
        total_executed: this.metrics.actions.total_executed,
        successful: this.metrics.actions.successful,
        failed: this.metrics.actions.failed,
        skipped: this.metrics.actions.skipped,
        success_rate_percent: this.metrics.actions.total_executed > 0
          ? ((this.metrics.actions.successful / this.metrics.actions.total_executed) * 100).toFixed(2)
          : '0.00',
        by_action: this.metrics.actions.by_action,
      },
      signal_drops: {
        total_dropped: this.metrics.drops.total,
        drop_rate_percent: uptime > 0
          ? ((this.metrics.drops.total / this.metrics.signals.total_injected) * 100).toFixed(2)
          : '0.00',
        by_reason: this.metrics.drops.by_reason,
      },
      latency: {
        decision: {
          p50_ms: this.metrics.latency.p50_decision,
          p95_ms: this.metrics.latency.p95_decision,
          p99_ms: this.metrics.latency.p99_decision,
          samples: this.metrics.latency.decision_ms.length,
        },
        action_execution: {
          p50_ms: this._calculatePercentile(this.metrics.latency.action_execution_ms, 50),
          p95_ms: this._calculatePercentile(this.metrics.latency.action_execution_ms, 95),
          p99_ms: this._calculatePercentile(this.metrics.latency.action_execution_ms, 99),
          samples: this.metrics.latency.action_execution_ms.length,
        }
      },
      health_indicators: {
        decision_rate_acceptable: Number.parseFloat(this.getMetricsReport().decisions.decision_rate_percent) >= 95,
        error_rate_low: Number.parseFloat(this.getMetricsReport().actions.success_rate_percent) >= 95,
        latency_good: this.metrics.latency.p95_decision < 500,
        signal_handling_healthy: Number.parseFloat(this.getMetricsReport().signal_drops.drop_rate_percent) < 5,
      }
    };
  }

  /**
   * Generate Prometheus-style metrics
   */
  getPrometheusMetrics() {
    const report = this.getMetricsReport();
    let output = '# HELP incident_response_signals_total Total signals injected\n';
    output += '# TYPE incident_response_signals_total counter\n';
    output += `incident_response_signals_total{} ${report.signals.total_injected}\n\n`;

    output += '# HELP incident_response_decisions_total Total decisions generated\n';
    output += '# TYPE incident_response_decisions_total counter\n';
    output += `incident_response_decisions_total{} ${report.decisions.total_generated}\n\n`;

    output += '# HELP incident_response_decision_rate Percentage of signals generating decisions\n';
    output += '# TYPE incident_response_decision_rate gauge\n';
    output += `incident_response_decision_rate{} ${report.decisions.decision_rate_percent}\n\n`;

    output += '# HELP incident_response_actions_executed Total actions executed\n';
    output += '# TYPE incident_response_actions_executed counter\n';
    output += `incident_response_actions_executed_total{} ${report.actions.total_executed}\n\n`;

    output += '# HELP incident_response_action_success_rate Action success rate\n';
    output += '# TYPE incident_response_action_success_rate gauge\n';
    output += `incident_response_action_success_rate{} ${report.actions.success_rate_percent}\n\n`;

    output += '# HELP incident_response_decision_latency_seconds Decision generation latency\n';
    output += '# TYPE incident_response_decision_latency_seconds gauge\n';
    output += `incident_response_decision_latency_seconds{quantile="0.5"} ${report.latency.decision.p50_ms / 1000}\n`;
    output += `incident_response_decision_latency_seconds{quantile="0.95"} ${report.latency.decision.p95_ms / 1000}\n`;
    output += `incident_response_decision_latency_seconds{quantile="0.99"} ${report.latency.decision.p99_ms / 1000}\n\n`;

    output += '# HELP incident_response_signal_drop_rate Signal drop rate\n';
    output += '# TYPE incident_response_signal_drop_rate gauge\n';
    output += `incident_response_signal_drop_rate{} ${report.signal_drops.drop_rate_percent}\n`;

    return output;
  }

  /**
   * Get recent signals (for debugging)
   */
  getRecentSignals(limit = 100) {
    return this.recentSignals.slice(-limit);
  }

  /**
   * Reset metrics (use with caution)
   */
  resetMetrics() {
    this.metrics = {
      signals: { total_injected: 0, by_type: {}, by_severity: {}, by_pattern: {} },
      decisions: { 
        total_generated: 0, 
        by_tier: { execute: 0, safe_fallback: 0, escalate: 0, observe: 0 },
        by_action: {},
        by_confidence_bucket: {
          'very_high_0.9+': 0,
          'high_0.8+': 0,
          'medium_0.65+': 0,
          'low_0.5+': 0,
          'very_low_<0.5': 0,
        }
      },
      actions: { total_executed: 0, successful: 0, failed: 0, skipped: 0, by_action: {} },
      drops: { total: 0, by_reason: {} },
      latency: { decision_ms: [], action_execution_ms: [], p50_decision: 0, p95_decision: 0, p99_decision: 0 }
    };
    this.sessionStart = new Date();
  }

  /**
   * Private: Update latency percentiles
   */
  _updateLatencyPercentiles() {
    this.metrics.latency.p50_decision = this._calculatePercentile(this.metrics.latency.decision_ms, 50);
    this.metrics.latency.p95_decision = this._calculatePercentile(this.metrics.latency.decision_ms, 95);
    this.metrics.latency.p99_decision = this._calculatePercentile(this.metrics.latency.decision_ms, 99);
  }

  /**
   * Private: Calculate percentile from array
   */
  _calculatePercentile(arr, percentile) {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return Math.round(sorted[Math.max(0, index)]);
  }
}

module.exports = new DecisionPipelineObservability();
