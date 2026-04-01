/**
 * Prometheus Metrics Handler
 * Exposes real-time metrics from simulated services
 */

class MetricsHandler {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.metrics = {
      // Counters
      requests_total: 0,
      requests_failed_total: 0,
      requests_latency_high_total: 0,
      errors_500_total: 0,
      errors_503_total: 0,
      errors_504_total: 0,
      
      // Gauges
      memory_usage_bytes: 0,
      response_time_ms: 0,
      active_connections: 0,
      queue_depth: 0,
      db_pool_available: 10,
      
      // Histograms (buckets)
      request_duration_buckets: {
        0.1: 0,    // < 100ms
        0.5: 0,    // < 500ms
        1: 0,      // < 1s
        5: 0,      // < 5s
        10: 0,     // < 10s
        30: 0,     // < 30s
      },
      
      // Other
      last_request_time: new Date().toISOString(),
      start_time: new Date().toISOString(),
    };

    this.startTime = Date.now();
  }

  recordRequest(statusCode, durationMs, success = true) {
    this.metrics.requests_total++;
    this.metrics.response_time_ms = durationMs;
    this.metrics.last_request_time = new Date().toISOString();

    if (!success) {
      this.metrics.requests_failed_total++;
    }

    if (durationMs > 1000) {
      this.metrics.requests_latency_high_total++;
    }

    // Record in histogram buckets
    if (durationMs < 100) this.metrics.request_duration_buckets[0.1]++;
    if (durationMs < 500) this.metrics.request_duration_buckets[0.5]++;
    if (durationMs < 1000) this.metrics.request_duration_buckets[1]++;
    if (durationMs < 5000) this.metrics.request_duration_buckets[5]++;
    if (durationMs < 10000) this.metrics.request_duration_buckets[10]++;
    this.metrics.request_duration_buckets[30]++;

    // Record status code errors
    if (statusCode === 500) this.metrics.errors_500_total++;
    if (statusCode === 503) this.metrics.errors_503_total++;
    if (statusCode === 504) this.metrics.errors_504_total++;
  }

  setGauge(name, value) {
    if (this.metrics.hasOwnProperty(name)) {
      this.metrics[name] = value;
    }
  }

  /**
   * Generate Prometheus text format output
   */
  toPrometheus() {
    const lines = [];
    const timestamp = Date.now();
    const uptime = timestamp - this.startTime;

    lines.push(`# HELP service_info Service information`);
    lines.push(`# TYPE service_info gauge`);
    lines.push(`service_info{service="${this.serviceName}",version="1.0"} 1`);
    lines.push(``);

    // Counters
    lines.push(`# HELP requests_total Total number of requests`);
    lines.push(`# TYPE requests_total counter`);
    lines.push(`requests_total{service="${this.serviceName}"} ${this.metrics.requests_total}`);
    lines.push(``);

    lines.push(`# HELP requests_failed_total Total number of failed requests`);
    lines.push(`# TYPE requests_failed_total counter`);
    lines.push(`requests_failed_total{service="${this.serviceName}"} ${this.metrics.requests_failed_total}`);
    lines.push(``);

    lines.push(`# HELP requests_latency_high_total Total requests with high latency (>1s)`);
    lines.push(`# TYPE requests_latency_high_total counter`);
    lines.push(`requests_latency_high_total{service="${this.serviceName}"} ${this.metrics.requests_latency_high_total}`);
    lines.push(``);

    lines.push(`# HELP errors_500_total Total 500 errors`);
    lines.push(`# TYPE errors_500_total counter`);
    lines.push(`errors_500_total{service="${this.serviceName}"} ${this.metrics.errors_500_total}`);
    lines.push(``);

    lines.push(`# HELP errors_503_total Total 503 errors (service unavailable)`);
    lines.push(`# TYPE errors_503_total counter`);
    lines.push(`errors_503_total{service="${this.serviceName}"} ${this.metrics.errors_503_total}`);
    lines.push(``);

    lines.push(`# HELP errors_504_total Total 504 errors (timeout)`);
    lines.push(`# TYPE errors_504_total counter`);
    lines.push(`errors_504_total{service="${this.serviceName}"} ${this.metrics.errors_504_total}`);
    lines.push(``);

    // Gauges
    lines.push(`# HELP response_time_ms Last response time in milliseconds`);
    lines.push(`# TYPE response_time_ms gauge`);
    lines.push(`response_time_ms{service="${this.serviceName}"} ${this.metrics.response_time_ms}`);
    lines.push(``);

    lines.push(`# HELP memory_usage_bytes Memory usage in bytes`);
    lines.push(`# TYPE memory_usage_bytes gauge`);
    lines.push(`memory_usage_bytes{service="${this.serviceName}"} ${this.metrics.memory_usage_bytes}`);
    lines.push(``);

    lines.push(`# HELP active_connections Active connections`);
    lines.push(`# TYPE active_connections gauge`);
    lines.push(`active_connections{service="${this.serviceName}"} ${this.metrics.active_connections}`);
    lines.push(``);

    lines.push(`# HELP queue_depth Request queue depth`);
    lines.push(`# TYPE queue_depth gauge`);
    lines.push(`queue_depth{service="${this.serviceName}"} ${this.metrics.queue_depth}`);
    lines.push(``);

    lines.push(`# HELP db_pool_available Available database connections`);
    lines.push(`# TYPE db_pool_available gauge`);
    lines.push(`db_pool_available{service="${this.serviceName}"} ${this.metrics.db_pool_available}`);
    lines.push(``);

    // Uptime
    lines.push(`# HELP process_uptime_seconds Uptime in seconds`);
    lines.push(`# TYPE process_uptime_seconds Counter`);
    lines.push(`process_uptime_seconds{service="${this.serviceName}"} ${(uptime / 1000).toFixed(1)}`);
    lines.push(``);

    lines.push(`# HELP service_info Generated timestamp`);
    lines.push(`# TYPE service_info gauge`);
    lines.push(`generated_timestamp{service="${this.serviceName}"} ${timestamp}`);

    return lines.join('\n');
  }

  getJSON() {
    return {
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      uptime_seconds: (Date.now() - this.startTime) / 1000,
      metrics: this.metrics,
    };
  }
}

module.exports = MetricsHandler;
