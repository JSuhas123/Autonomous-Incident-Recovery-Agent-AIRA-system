/**
 * Failure Injection Framework
 * Simulates realistic infrastructure failures for testing AIRA's resilience
 */

class FailureInjector {
  constructor(serviceName, config = {}) {
    this.serviceName = serviceName;
    this.failureMode = config.failureMode || process.env.FAILURE_MODE || 'none';
    this.failureRate = config.failureRate || parseInt(process.env.FAILURE_RATE || 0);
    this.failureDurationMs = config.failureDurationMs || parseInt(process.env.FAILURE_DURATION_MS || 5000);
    
    this.isFailureActive = false;
    this.failureStartTime = null;
    this.requestCount = 0;
    this.failedRequests = 0;
    this.metrics = {
      totalRequests: 0,
      failedRequests: 0,
      crashCount: 0,
      latencyInjections: 0,
      memoryLeaks: 0,
      dbExhaustions: 0,
    };

    // Memory leak tracking
    this.leakedMemory = [];
  }

  /**
   * Should this request fail?
   */
  shouldInjectFailure() {
    if (this.failureMode === 'none') return false;
    
    // Check if we're in failure window
    if (this.isFailureActive) {
      const elapsed = Date.now() - this.failureStartTime;
      if (elapsed > this.failureDurationMs) {
        this.isFailureActive = false;
      } else {
        return true;
      }
    }

    // Probabilistic failure injection
    if (Math.random() * 100 < this.failureRate) {
      this.isFailureActive = true;
      this.failureStartTime = Date.now();
      return true;
    }

    return false;
  }

  /**
   * Execute request with potential failure injection
   */
  async injectFailure(req, res, next) {
    this.metrics.totalRequests++;
    
    if (!this.shouldInjectFailure()) {
      return next();
    }

    this.metrics.failedRequests++;
    const failureType = this.failureMode;

    console.log(`[${this.serviceName}] Injecting failure: ${failureType}`);

    switch (failureType) {
      case 'crash':
        return this.injectCrash(res);
      case 'latency':
        return this.injectLatency(req, res, next);
      case 'memory-leak':
        return this.injectMemoryLeak(req, res, next);
      case 'db-exhaustion':
        return this.injectDbExhaustion(res);
      default:
        return next();
    }
  }

  /**
   * Crash: Immediate 500 error
   */
  injectCrash(res) {
    this.metrics.crashCount++;
    return res.status(500).json({
      error: 'Service crashed',
      service: this.serviceName,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Latency: Delay response by 5-20 seconds
   */
  async injectLatency(req, res, next) {
    const delay = 5000 + Math.random() * 15000;
    console.log(`[${this.serviceName}] Injecting ${(delay/1000).toFixed(1)}s latency`);
    this.metrics.latencyInjections++;
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    return res.status(504).json({
      error: 'Service timeout',
      service: this.serviceName,
      injectedLatencyMs: delay,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Memory Leak: Allocate and hold memory
   */
  async injectMemoryLeak(req, res, next) {
    this.metrics.memoryLeaks++;
    
    // Allocate 50MB of memory and don't release it
    try {
      const leakSize = 50 * 1024 * 1024; // 50MB
      const leaked = Buffer.alloc(leakSize);
      this.leakedMemory.push(leaked);
      
      console.log(`[${this.serviceName}] Memory leak: +${(leakSize / 1024 / 1024).toFixed(1)}MB`);
      
      return res.status(503).json({
        error: 'Out of memory',
        service: this.serviceName,
        leakedMB: (leakSize / 1024 / 1024),
        totalLeakedMB: (this.getTotalLeakedMemory() / 1024 / 1024).toFixed(1),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return res.status(500).json({
        error: 'Memory allocation failed',
        service: this.serviceName,
      });
    }
  }

  /**
   * DB Exhaustion: Simulate database connection pool depletion
   */
  injectDbExhaustion(res) {
    this.metrics.dbExhaustions++;
    return res.status(503).json({
      error: 'Database connection pool exhausted',
      service: this.serviceName,
      availableConnections: 0,
      poolSize: 10,
      activeConnections: 10,
      queuedRequests: Math.floor(Math.random() * 50) + 10,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get metrics endpoint data
   */
  getMetrics() {
    return {
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      failureMode: this.failureMode,
      failureRate: this.failureRate,
      isFailureActive: this.isFailureActive,
      failureDurationMs: this.failureDurationMs,
      metrics: this.metrics,
      memoryUsageMB: (this.getTotalLeakedMemory() / 1024 / 1024).toFixed(1),
    };
  }

  /**
   * Set failure mode dynamically
   */
  setFailureMode(mode, rate = null, duration = null) {
    this.failureMode = mode;
    if (rate !== null) this.failureRate = rate;
    if (duration !== null) this.failureDurationMs = duration;
    
    console.log(`[${this.serviceName}] Failure mode updated: ${mode} (${this.failureRate}%)`);
  }

  getTotalLeakedMemory() {
    return this.leakedMemory.reduce((sum, buf) => sum + buf.length, 0);
  }

  /**
   * Reset failure injection (useful for tests)
   */
  reset() {
    this.isFailureActive = false;
    this.failureStartTime = null;
    this.leakedMemory = [];
    this.metrics = {
      totalRequests: 0,
      failedRequests: 0,
      crashCount: 0,
      latencyInjections: 0,
      memoryLeaks: 0,
      dbExhaustions: 0,
    };
  }
}

module.exports = FailureInjector;
