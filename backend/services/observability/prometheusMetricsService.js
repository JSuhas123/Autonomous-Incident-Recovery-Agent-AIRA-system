/**
 * PHASE 2: PROMETHEUS METRICS SERVICE
 * 
 * Provides comprehensive system metrics in Prometheus format:
 * - Decision latency (histogram)
 * - Action execution time (histogram) 
 * - Error rates (counter)
 * - Escalation rates (counter)
 * - Confidence score distribution (histogram)
 * - Queue depths (gauge)
 * - Database query latency (histogram)
 * - System resource usage
 * 
 * Exposed at /metrics endpoint in Prometheus format
 */

const prometheus = require('prom-client');

class PrometheusMetricsService {
  constructor() {
    // Set default labels
    prometheus.register.setDefaultLabels({
      service: 'decision-engine',
      environment: process.env.NODE_ENV || 'development',
    });

    this._initializeMetrics();
  }

  /**
   * Initialize all metrics
   */
  _initializeMetrics() {
    // ===== DECISION METRICS =====
    this.decisionLatency = new prometheus.Histogram({
      name: 'decision_latency_ms',
      help: 'Latency of decision making in milliseconds',
      buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
      labelNames: ['tenantId', 'severity', 'tier'],
    });

    this.decisionCounter = new prometheus.Counter({
      name: 'decisions_total',
      help: 'Total number of decisions made',
      labelNames: ['tenantId', 'tier', 'outcome'],
    });

    this.decisionConfidence = new prometheus.Histogram({
      name: 'decision_confidence',
      help: 'Distribution of decision confidence scores',
      buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
      labelNames: ['tenantId', 'tier'],
    });

    // ===== ACTION METRICS =====
    this.actionLatency = new prometheus.Histogram({
      name: 'action_latency_ms',
      help: 'Latency of action execution in milliseconds',
      buckets: [10, 100, 500, 1000, 5000, 10000, 30000, 60000],
      labelNames: ['tenantId', 'action', 'result'],
    });

    this.actionCounter = new prometheus.Counter({
      name: 'actions_total',
      help: 'Total number of actions executed',
      labelNames: ['tenantId', 'action', 'result'],
    });

    // ===== ESCALATION METRICS =====
    this.escalationCounter = new prometheus.Counter({
      name: 'escalations_total',
      help: 'Total number of escalations to human review',
      labelNames: ['tenantId', 'reason'],
    });

    this.manualApprovalCounter = new prometheus.Counter({
      name: 'manual_approvals_total',
      help: 'Total number of manual approvals',
      labelNames: ['tenantId', 'outcome'],
    });

    // ===== ERROR METRICS =====
    this.errorCounter = new prometheus.Counter({
      name: 'errors_total',
      help: 'Total number of errors by type',
      labelNames: ['tenantId', 'errorType', 'component'],
    });

    this.errorRate = new prometheus.Gauge({
      name: 'error_rate_percent',
      help: 'Current error rate as percentage',
      labelNames: ['tenantId'],
    });

    // ===== QUEUE METRICS =====
    this.queueDepth = new prometheus.Gauge({
      name: 'queue_depth',
      help: 'Current depth of message queue',
      labelNames: ['tenantId', 'queueType'],
    });

    this.queueLatency = new prometheus.Histogram({
      name: 'queue_latency_ms',
      help: 'Message latency from enqueue to dequeue',
      buckets: [10, 100, 500, 1000, 5000, 10000],
      labelNames: ['tenantId', 'queueType'],
    });

    this.dlqSize = new prometheus.Gauge({
      name: 'dlq_size',
      help: 'Current size of dead-letter queue',
      labelNames: ['tenantId'],
    });

    // ===== DATABASE METRICS =====
    this.dbQueryLatency = new prometheus.Histogram({
      name: 'db_query_latency_ms',
      help: 'Database query latency in milliseconds',
      buckets: [1, 5, 10, 50, 100, 250, 500, 1000, 5000],
      labelNames: ['tenantId', 'operation', 'collection'],
    });

    this.dbConnectionPoolUsage = new prometheus.Gauge({
      name: 'db_connection_pool_usage',
      help: 'Current database connection pool usage ratio (0-1)',
      labelNames: ['tenantId'],
    });

    this.dbSlowQueryCount = new prometheus.Counter({
      name: 'db_slow_queries_total',
      help: 'Number of slow database queries (>500ms)',
      labelNames: ['tenantId', 'operation'],
    });

    // ===== LEARNING SYSTEM METRICS =====
    this.learningFitness = new prometheus.Gauge({
      name: 'learning_fitness',
      help: 'Fitness score of learning system (0-1)',
      labelNames: ['tenantId', 'model'],
    });

    this.predictionAccuracy = new prometheus.Gauge({
      name: 'prediction_accuracy_percent',
      help: 'Accuracy of system predictions as percentage',
      labelNames: ['tenantId', 'patternType'],
    });

    // ===== SECURITY METRICS =====
    this.xssSanitizationCounter = new prometheus.Counter({
      name: 'xss_sanitizations_total',
      help: 'Number of XSS sanitization events',
      labelNames: ['endpoint', 'method'],
    });

    this.securityEventCounter = new prometheus.Counter({
      name: 'security_events_total',
      help: 'Security-related events (auth failures, threats, etc)',
      labelNames: ['tenantId', 'eventType'],
    });

    // ===== SYSTEM METRICS =====
    this.systemUptime = new prometheus.Gauge({
      name: 'system_uptime_seconds',
      help: 'System uptime in seconds',
    });

    this.memoryUsage = new prometheus.Gauge({
      name: 'memory_usage_bytes',
      help: 'Node.js memory usage in bytes',
      labelNames: ['type'],
    });

    this.cpuUsage = new prometheus.Gauge({
      name: 'cpu_usage_percent',
      help: 'CPU usage as percentage (0-100)',
    });

    // ===== KILL SWITCH METRICS =====
    this.killSwitchStatus = new prometheus.Gauge({
      name: 'kill_switch_status',
      help: 'Status of kill switches (1=enabled, 0=disabled)',
      labelNames: ['switchName'],
    });

    // Register all metrics
    this._registerMetrics();
  }

  /**
   * Register all metrics with Prometheus
   */
  _registerMetrics() {
    const metrics = [
      this.decisionLatency, this.decisionCounter, this.decisionConfidence,
      this.actionLatency, this.actionCounter,
      this.escalationCounter, this.manualApprovalCounter,
      this.errorCounter, this.errorRate,
      this.queueDepth, this.queueLatency, this.dlqSize,
      this.dbQueryLatency, this.dbConnectionPoolUsage, this.dbSlowQueryCount,
      this.learningFitness, this.predictionAccuracy,
      this.xssSanitizationCounter, this.securityEventCounter,
      this.systemUptime, this.memoryUsage, this.cpuUsage,
      this.killSwitchStatus,
    ];

    // Note: prom-client auto-registers in default register
  }

  /**
   * Record decision latency
   */
  recordDecisionLatency(tenantId, durationMs, severity, tier) {
    this.decisionLatency.labels(tenantId, severity, tier).observe(durationMs);
    this.decisionCounter.labels(tenantId, tier, 'made').inc();
  }

  /**
   * Record decision outcome
   */
  recordDecisionOutcome(tenantId, tier, outcome) {
    this.decisionCounter.labels(tenantId, tier, outcome).inc();
  }

  /**
   * Record decision confidence
   */
  recordDecisionConfidence(tenantId, confidenceScore, tier) {
    this.decisionConfidence.labels(tenantId, tier).observe(confidenceScore);
  }

  /**
   * Record action execution
   */
  recordActionExecution(tenantId, action, durationMs, result) {
    this.actionLatency.labels(tenantId, action, result).observe(durationMs);
    this.actionCounter.labels(tenantId, action, result).inc();
  }

  /**
   * Record escalation
   */
  recordEscalation(tenantId, reason) {
    this.escalationCounter.labels(tenantId, reason).inc();
  }

  /**
   * Record error
   */
  recordError(tenantId, errorType, component) {
    this.errorCounter.labels(tenantId, errorType, component).inc();
  }

  /**
   * Update queue depth
   */
  updateQueueDepth(tenantId, queueType, depth) {
    this.queueDepth.labels(tenantId, queueType).set(depth);
  }

  /**
   * Record queue latency
   */
  recordQueueLatency(tenantId, queueType, durationMs) {
    this.queueLatency.labels(tenantId, queueType).observe(durationMs);
  }

  /**
   * Update DLQ size
   */
  updateDLQSize(tenantId, size) {
    this.dlqSize.labels(tenantId).set(size);
  }

  /**
   * Record database query latency
   */
  recordDBQuery(tenantId, operation, collection, durationMs) {
    this.dbQueryLatency.labels(tenantId, operation, collection).observe(durationMs);

    if (durationMs > 500) {
      this.dbSlowQueryCount.labels(tenantId, operation).inc();
    }
  }

  /**
   * Update database connection pool usage
   */
  updateDBPoolUsage(tenantId, usageRatio) {
    this.dbConnectionPoolUsage.labels(tenantId).set(Math.min(usageRatio, 1.0));
  }

  /**
   * Update kill switch status
   */
  updateKillSwitchStatus(switchName, enabled) {
    this.killSwitchStatus.labels(switchName).set(enabled ? 1 : 0);
  }

  /**
   * Record XSS sanitization
   */
  recordXSSSanitization(endpoint, method) {
    this.xssSanitizationCounter.labels(endpoint, method).inc();
  }

  /**
   * Record security event
   */
  recordSecurityEvent(tenantId, eventType) {
    this.securityEventCounter.labels(tenantId, eventType).inc();
  }

  /**
   * Update system metrics
   */
  updateSystemMetrics() {
    const uptime = process.uptime();
    this.systemUptime.set(uptime);

    const memUsage = process.memoryUsage();
    this.memoryUsage.labels('heap_used').set(memUsage.heapUsed);
    this.memoryUsage.labels('heap_total').set(memUsage.heapTotal);
    this.memoryUsage.labels('rss').set(memUsage.rss);
  }

  /**
   * Get Prometheus metrics in text format
   */
  async getMetrics() {
    this.updateSystemMetrics();
    return await prometheus.register.metrics();
  }

  /**
   * Get metrics object (for testing/debugging)
   */
  getMetricsObject() {
    return {
      decisions: {
        latency: this.decisionLatency,
        count: this.decisionCounter,
        confidence: this.decisionConfidence,
      },
      actions: {
        latency: this.actionLatency,
        count: this.actionCounter,
      },
      escalations: this.escalationCounter,
      errors: {
        count: this.errorCounter,
        rate: this.errorRate,
      },
      queue: {
        depth: this.queueDepth,
        latency: this.queueLatency,
        dlqSize: this.dlqSize,
      },
      database: {
        queryLatency: this.dbQueryLatency,
        poolUsage: this.dbConnectionPoolUsage,
        slowQueries: this.dbSlowQueryCount,
      },
    };
  }

  /**
   * Reset all metrics (for testing)
   */
  resetMetrics() {
    prometheus.register.clear();
    this._initializeMetrics();
  }
}

// Singleton instance
let prometheusMetricsService = null;

function getPrometheusMetricsService() {
  if (!prometheusMetricsService) {
    prometheusMetricsService = new PrometheusMetricsService();
  }
  return prometheusMetricsService;
}

module.exports = {
  PrometheusMetricsService,
  getPrometheusMetricsService,
};
