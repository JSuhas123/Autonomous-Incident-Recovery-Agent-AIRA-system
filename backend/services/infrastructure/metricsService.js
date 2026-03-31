/**
 * Metrics Service
 * Collects and exposes Prometheus metrics for the decision engine
 * 
 * Tracks:
 * - Decision latency histogram
 * - Queue depth gauge
 * - Action success/failure rate
 * - Error rate per component
 * - Policy evaluation time
 * - Memory usage per tenant
 */

const prom = require('prom-client');

class MetricsService {
  constructor() {
    // Default metrics (CPU, memory)
    prom.collectDefaultMetrics();

    // Decision pipeline metrics
    this.decisionLatency = new prom.Histogram({
      name: 'decision_latency_ms',
      help: 'Decision processing latency in milliseconds',
      labelNames: ['tenantId', 'severity', 'status'],
      buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000],
    });

    this.queueDepth = new prom.Gauge({
      name: 'queue_depth_total',
      help: 'Total messages in queue',
      labelNames: ['tenantId', 'topic'],
    });

    this.dlqSize = new prom.Gauge({
      name: 'dlq_size_total',
      help: 'Messages in dead letter queue',
      labelNames: ['tenantId'],
    });

    this.actionExecutions = new prom.Counter({
      name: 'action_executions_total',
      help: 'Total action executions',
      labelNames: ['tenantId', 'actionType', 'status'],
    });

    this.actionLatency = new prom.Histogram({
      name: 'action_latency_ms',
      help: 'Action execution latency in milliseconds',
      labelNames: ['tenantId', 'actionType', 'status'],
      buckets: [100, 500, 1000, 2500, 5000, 10000, 30000],
    });

    this.policyEvaluations = new prom.Counter({
      name: 'policy_evaluations_total',
      help: 'Total policy evaluations',
      labelNames: ['tenantId', 'verdict'],
    });

    this.policyLatency = new prom.Histogram({
      name: 'policy_latency_ms',
      help: 'Policy evaluation latency in milliseconds',
      labelNames: ['tenantId'],
      buckets: [10, 25, 50, 100, 250, 500],
    });

    this.idempotencyHits = new prom.Counter({
      name: 'idempotency_hits_total',
      help: 'Idempotency check hits (duplicate prevention)',
      labelNames: ['tenantId'],
    });

    this.circuitBreakerState = new prom.Gauge({
      name: 'circuit_breaker_state',
      help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
      labelNames: ['tenantId', 'service'],
    });

    this.memoryPatterns = new prom.Gauge({
      name: 'memory_patterns_count',
      help: 'Number of incident patterns in memory',
      labelNames: ['tenantId'],
    });

    this.decisionTraces = new prom.Gauge({
      name: 'decision_traces_count',
      help: 'Number of decision traces in database',
      labelNames: ['tenantId'],
    });

    this.errors = new prom.Counter({
      name: 'errors_total',
      help: 'Total errors',
      labelNames: ['tenantId', 'component', 'errorType'],
    });

    this.retries = new prom.Counter({
      name: 'retries_total',
      help: 'Total retry attempts',
      labelNames: ['tenantId', 'status'],
    });

    this.lockAcquisitions = new prom.Histogram({
      name: 'lock_acquisition_ms',
      help: 'Distributed lock acquisition time in milliseconds',
      labelNames: ['lockKey'],
      buckets: [1, 5, 10, 25, 50, 100, 250],
    });

    this.tenantIsolationViolations = new prom.Counter({
      name: 'tenant_isolation_violations_total',
      help: 'Tenant isolation violations (security incidents)',
      labelNames: ['type'],
    });
  }

  /**
   * Record decision execution
   */
  recordDecision(tenantId, severity, status, latencyMs) {
    this.decisionLatency.observe({ tenantId, severity, status }, latencyMs);
  }

  /**
   * Record action execution
   */
  recordAction(tenantId, actionType, status, latencyMs) {
    this.actionExecutions.inc({ tenantId, actionType, status });
    this.actionLatency.observe({ tenantId, actionType, status }, latencyMs);
  }

  /**
   * Update queue depth
   */
  updateQueueDepth(tenantId, topic, depth) {
    this.queueDepth.set({ tenantId, topic }, depth);
  }

  /**
   * Update DLQ size
   */
  updateDLQSize(tenantId, size) {
    this.dlqSize.set({ tenantId }, size);
  }

  /**
   * Record policy evaluation
   */
  recordPolicyEvaluation(tenantId, verdict, latencyMs) {
    this.policyEvaluations.inc({ tenantId, verdict });
    this.policyLatency.observe({ tenantId }, latencyMs);
  }

  /**
   * Record idempotency hit
   */
  recordIdempotencyHit(tenantId) {
    this.idempotencyHits.inc({ tenantId });
  }

  /**
   * Update circuit breaker state
   */
  updateCircuitBreakerState(tenantId, service, state) {
    // state: 'CLOSED' = 0, 'OPEN' = 1, 'HALF_OPEN' = 2
    const stateMap = { CLOSED: 0, OPEN: 1, HALF_OPEN: 2 };
    this.circuitBreakerState.set({ tenantId, service }, stateMap[state] || 0);
  }

  /**
   * Update memory metrics
   */
  updateMemoryMetrics(tenantId, patternCount, traceCount) {
    this.memoryPatterns.set({ tenantId }, patternCount);
    this.decisionTraces.set({ tenantId }, traceCount);
  }

  /**
   * Record error
   */
  recordError(tenantId, component, errorType) {
    this.errors.inc({ tenantId, component, errorType });
  }

  /**
   * Record retry
   */
  recordRetry(tenantId, status) {
    this.retries.inc({ tenantId, status });
  }

  /**
   * Record lock acquisition time
   */
  recordLockAcquisition(lockKey, latencyMs) {
    this.lockAcquisitions.observe({ lockKey }, latencyMs);
  }

  /**
   * Record tenant isolation violation
   */
  recordIsolationViolation(type) {
    this.tenantIsolationViolations.inc({ type });
  }

  /**
   * Get all metrics in Prometheus format
   */
  getMetrics() {
    return prom.register.metrics();
  }

  /**
   * Get metrics as JSON (for debugging)
   */
  getMetricsJSON() {
    return {
      timestamp: new Date().toISOString(),
      decisionLatency: this.decisionLatency.get(),
      queueDepth: this.queueDepth.get(),
      dlqSize: this.dlqSize.get(),
      actionExecutions: this.actionExecutions.get(),
      policyEvaluations: this.policyEvaluations.get(),
      errors: this.errors.get(),
      retries: this.retries.get(),
    };
  }

  /**
   * Reset metrics (for testing)
   */
  reset() {
    prom.register.resetMetrics();
  }
}

module.exports = new MetricsService();
