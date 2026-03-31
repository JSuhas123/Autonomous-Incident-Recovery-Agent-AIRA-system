/**
 * Production Load Testing Suite
 * 
 * Provides orchestration and metrics collection for load testing scenarios
 */

const axios = require('axios');

class ProductionLoadTester {
  constructor(baseUrl, tenantId) {
    this.baseUrl = baseUrl;
    this.tenantId = tenantId;
    this.results = {
      metrics: {
        avgLatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        minLatencyMs: Infinity,
        maxLatencyMs: 0,
        successCount: 0,
        failureCount: 0,
        totalRequests: 0,
      },
    };
    this.latencies = [];
  }

  /**
   * Test sustained load over time
   * @param {number} signalsPerSecond - Target throughput
   * @param {number} durationSeconds - How long to test
   */
  async testSustainedLoad(signalsPerSecond, durationSeconds) {
    console.log(`\n📈 Testing sustained load: ${signalsPerSecond} signals/sec for ${durationSeconds}s`);
    
    const startTime = Date.now();
    const endTime = startTime + (durationSeconds * 1000);
    let requestCount = 0;
    let successCount = 0;
    const latencies = [];

    const intervalMs = 1000 / signalsPerSecond;

    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        if (Date.now() > endTime) {
          clearInterval(interval);

          // Calculate metrics
          const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
          latencies.sort((a, b) => a - b);
          const p95 = latencies[Math.floor(latencies.length * 0.95)];
          const p99 = latencies[Math.floor(latencies.length * 0.99)];

          this.results.metrics.avgLatencyMs = avgLatency;
          this.results.metrics.p95LatencyMs = p95;
          this.results.metrics.p99LatencyMs = p99;
          this.results.metrics.successCount = successCount;
          this.results.metrics.failureCount = requestCount - successCount;
          this.results.metrics.totalRequests = requestCount;

          const actualThroughput = requestCount / durationSeconds;

          resolve({
            results: {
              actualThroughput,
              successRate: successCount / requestCount,
              avgLatencyMs: avgLatency,
              p95LatencyMs: p95,
              p99LatencyMs: p99,
            },
            status: 'completed',
          });
          return;
        }

        // Send signal
        (async () => {
          try {
            const reqStart = Date.now();
            await axios.post(`${this.baseUrl}/api/signals/${this.tenantId}`, {
              severity: 'HIGH',
              signalType: 'error_rate',
              value: 0.15,
              service: 'payment-api',
              timestamp: new Date(),
            }, { timeout: 5000 });
            
            const latency = Date.now() - reqStart;
            latencies.push(latency);
            successCount++;
          } catch (err) {
            // Request failed, but tester continues
          }
          requestCount++;
        })();
      }, intervalMs);
    });
  }

  /**
   * Test spike/burst scenarios
   */
  async testSpikeLoad(signalsPerSecond, durationSeconds) {
    console.log(`\n🚀 Testing spike load: ${signalsPerSecond} signals/sec for ${durationSeconds}s`);
    
    const startTime = Date.now();
    const endTime = startTime + (durationSeconds * 1000);
    let requestCount = 0;
    let successCount = 0;
    const latencies = [];

    const intervalMs = 1000 / signalsPerSecond;

    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        if (Date.now() > endTime) {
          clearInterval(interval);

          // Calculate metrics
          latencies.sort((a, b) => a - b);
          const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
          const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
          const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;

          this.results.metrics.avgLatencyMs = avgLatency;
          this.results.metrics.p95LatencyMs = p95;
          this.results.metrics.p99LatencyMs = p99;
          this.results.metrics.successCount = successCount;
          this.results.metrics.failureCount = requestCount - successCount;
          this.results.metrics.totalRequests = requestCount;

          resolve({
            results: {
              actualThroughput: requestCount / durationSeconds,
              successRate: requestCount > 0 ? successCount / requestCount : 0,
              avgLatencyMs: avgLatency,
              p95LatencyMs: p95,
              p99LatencyMs: p99,
            },
            status: 'completed',
          });
          return;
        }

        // Burst mode: send multiple signals in rapid succession
        (async () => {
          try {
            const reqStart = Date.now();
            await axios.post(`${this.baseUrl}/api/signals/${this.tenantId}`, {
              severity: 'CRITICAL',
              signalType: 'service_crash',
              value: Math.random(),
              service: `service-${Math.floor(Math.random() * 5)}`,
              timestamp: new Date(),
            }, { timeout: 5000 });
            
            const latency = Date.now() - reqStart;
            latencies.push(latency);
            successCount++;
          } catch (err) {
            // Continue despite failures
          }
          requestCount++;
        })();
      }, intervalMs);
    });
  }

  /**
   * Test with failures (inject errors)
   */
  async testWithFailureInjection(failureRate, durationSeconds) {
    console.log(`\n💥 Testing with failure injection: ${(failureRate * 100).toFixed(0)}% failure rate`);
    
    const startTime = Date.now();
    let requestCount = 0;
    let successCount = 0;

    while (Date.now() - startTime < durationSeconds * 1000) {
      const shouldFail = Math.random() < failureRate;

      try {
        const reqStart = Date.now();
        const response = await axios.post(`${this.baseUrl}/api/signals/${this.tenantId}`, {
          severity: shouldFail ? 'CRITICAL' : 'HIGH',
          signalType: shouldFail ? 'cascading_failure' : 'latency_spike',
          value: shouldFail ? 0.95 : 0.25,
          service: 'test-service',
          timestamp: new Date(),
        }, { timeout: 5000 });

        successCount++;
      } catch (err) {
        // Track failures
      }
      requestCount++;

      await new Promise(r => setTimeout(r, 10)); // Small delay
    }

    return {
      results: {
        totalRequests: requestCount,
        successRate: successCount / requestCount,
      },
      status: 'completed',
    };
  }

  /**
   * Get latency percentiles
   */
  getLatencyPercentiles() {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    return {
      p50: sorted[Math.floor(sorted.length * 0.50)],
      p75: sorted[Math.floor(sorted.length * 0.75)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      max: Math.max(...sorted),
    };
  }

  /**
   * Test failure injection and cascade detection
   */
  async testFailureInjection(cascadeCount) {
    console.log(`\n⚡ Testing failure injection: injecting ${cascadeCount} cascading failures`);
    
    let totalSignals = 0;
    let cascadeFailures = 0;
    let silentFailures = 0;

    // Simulate sending signals with injected failures
    for (let i = 0; i < cascadeCount; i++) {
      try {
        await axios.post(`${this.baseUrl}/api/signals/${this.tenantId}`, {
          severity: 'CRITICAL',
          signalType: 'cascading_failure',
          value: 0.95,
          service: `service-${i % 5}`,
          timestamp: new Date(),
        }, { timeout: 5000 });
        
        cascadeFailures++;
        totalSignals++;
      } catch (err) {
        silentFailures++;
        totalSignals++;
      }
    }

    return {
      results: {
        totalSignals,
        cascadeFailures,
        silentFailures,
      },
      status: 'completed',
    };
  }

  /**
   * Test latency tail distribution with many requests
   */
  async testLatencyTails(requestCount) {
    console.log(`\n📊 Testing latency tail distribution: ${requestCount} requests`);
    
    const latencies = [];

    for (let i = 0; i < requestCount; i++) {
      try {
        const reqStart = Date.now();
        await axios.post(`${this.baseUrl}/api/signals/${this.tenantId}`, {
          severity: 'HIGH',
          signalType: 'latency_spike',
          value: Math.random() * 0.5,
          service: `service-${i % 5}`,
          timestamp: new Date(),
        }, { timeout: 5000 });
        
        const latency = Date.now() - reqStart;
        latencies.push(latency);
      } catch (err) {
        // Continue on failure
      }

      // Small delay to avoid overwhelming the server
      if (i % 10 === 0) {
        await new Promise(r => setTimeout(r, 5));
      }
    }

    latencies.sort((a, b) => a - b);
    this.latencies = latencies;

    const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.50)] : 0;
    const p75 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.75)] : 0;
    const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
    const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;
    const maxLat = latencies.length > 0 ? Math.max(...latencies) : 0;

    // Store in metrics for printSummary
    this.results.metrics.p50LatencyMs = p50;
    this.results.metrics.p75LatencyMs = p75;
    this.results.metrics.p95LatencyMs = p95;
    this.results.metrics.p99LatencyMs = p99;
    this.results.metrics.maxLatencyMs = maxLat;
    this.results.metrics.totalRequests = latencies.length;

    return {
      results: {
        p50,
        p75,
        p95,
        p99,
        max: maxLat,
      },
      status: 'completed',
    };
  }

  /**
   * Analyze results for bottlenecks
   */
  analyzeResults() {
    this.results.bottlenecks = [];

    // Check for latency issues
    if (this.results.metrics.p99LatencyMs && this.results.metrics.p99LatencyMs > 500) {
      this.results.bottlenecks.push({
        severity: 'HIGH',
        issue: 'P99 latency exceeds acceptable threshold',
        value: this.results.metrics.p99LatencyMs,
      });
    }

    // Check for high failure rates
    if (this.results.metrics.failureCount && this.results.metrics.totalRequests) {
      const failureRate = this.results.metrics.failureCount / this.results.metrics.totalRequests;
      if (failureRate > 0.05) {
        this.results.bottlenecks.push({
          severity: 'CRITICAL',
          issue: 'High failure rate detected',
          value: failureRate,
        });
      }
    }
  }

  /**
   * Print summary of results
   */
  printSummary() {
    console.log('\n═══════════════════════════════════════════');
    console.log('       LOAD TEST SUMMARY REPORT');
    console.log('═══════════════════════════════════════════');
    
    if (this.results.metrics) {
      console.log(`\n📊 Metrics:`);
      console.log(`   Total Requests: ${this.results.metrics.totalRequests || 0}`);
      console.log(`   Successful: ${this.results.metrics.successCount || 0}`);
      console.log(`   Failed: ${this.results.metrics.failureCount || 0}`);
      const avgLat = (this.results.metrics.avgLatencyMs ?? 0);
      const p95Lat = (this.results.metrics.p95LatencyMs ?? 0);
      const p99Lat = (this.results.metrics.p99LatencyMs ?? 0);
      console.log(`   Avg Latency: ${avgLat.toFixed(2)}ms`);
      console.log(`   P95 Latency: ${p95Lat.toFixed(2)}ms`);
      console.log(`   P99 Latency: ${p99Lat.toFixed(2)}ms`);
    }

    if (this.results.bottlenecks && this.results.bottlenecks.length > 0) {
      console.log(`\n⚠️  Bottlenecks Found:`);
      this.results.bottlenecks.forEach(b => {
        console.log(`   [${b.severity}] ${b.issue}: ${b.value}`);
      });
    } else {
      console.log(`\n✅ No critical bottlenecks detected`);
    }

    console.log('\n═══════════════════════════════════════════\n');
  }
}

module.exports = ProductionLoadTester;
