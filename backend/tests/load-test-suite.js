/**
 * PRODUCTION LOAD TESTING SUITE
 * 
 * Measures actual system throughput, latency, and reliability at scale
 * This is not a benchmark; it's a production readiness validator
 * 
 * Run: npm run test:load
 * Reports: See test-results/load-test-report.json
 */

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class ProductionLoadTester {
  constructor(baseUrl = 'http://localhost:5000', tenantId = 'load-test-tenant') {
    this.baseUrl = baseUrl;
    this.tenantId = tenantId;
    this.startTime = null;
    this.endTime = null;
    
    this.results = {
      timestamp: new Date().toISOString(),
      config: {},
      metrics: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalDurationMs: 0,
        avgLatencyMs: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        maxLatencyMs: 0,
        minLatencyMs: Infinity,
        requestsPerSecond: 0,
        errorsPerSecond: 0,
        confidenceScores: {
          min: Infinity,
          max: 0,
          avg: 0,
        },
        decisionsByAction: {},
      },
      scenarios: [],
      bottlenecks: [],
      recommendations: [],
    };
    
    this.latencies = [];
    this.decisionConfidences = [];
    this.decisions = [];
  }

  /**
   * Generate realistic incident signal
   */
  generateSignal(scenario = 'baseline') {
    const signals = {
      baseline: {
        errorRate: 0.05 + Math.random() * 0.1,
        responseTime: 200 + Math.random() * 300,
        affectedServices: ['api-gateway'],
      },
      high_error: {
        errorRate: 0.4 + Math.random() * 0.3,
        responseTime: 500 + Math.random() * 1000,
        affectedServices: ['api-gateway', 'auth-service'],
      },
      latency_spike: {
        errorRate: 0.1 + Math.random() * 0.1,
        responseTime: 2000 + Math.random() * 2000,
        affectedServices: ['database', 'cache'],
      },
      cascade_failure: {
        errorRate: 0.5 + Math.random() * 0.3,
        responseTime: 3000 + Math.random() * 2000,
        affectedServices: ['api-gateway', 'auth-service', 'database', 'payment-service'],
      },
    };
    
    return signals[scenario] || signals.baseline;
  }

  /**
   * Test 1: Sustained load (measures throughput and latency)
   */
  async testSustainedLoad(signalsPerSecond = 100, durationSeconds = 30) {
    console.log(`\n[LOAD TEST] Starting sustained load test: ${signalsPerSecond} signals/sec for ${durationSeconds}s`);
    
    const scenario = {
      name: 'Sustained Load',
      config: { signalsPerSecond, durationSeconds },
      results: {
        totalSignals: 0,
        successes: 0,
        failures: 0,
        startTime: Date.now(),
        endTime: null,
      },
    };

    const interval = 1000 / signalsPerSecond;
    const endTime = Date.now() + (durationSeconds * 1000);
    let lastLogTime = Date.now();

    while (Date.now() < endTime) {
      const batchPromises = [];
      
      // Send burst of signals
      for (let i = 0; i < signalsPerSecond; i++) {
        const promise = this._sendSignal(this.generateSignal('baseline'))
          .then(() => {
            scenario.results.successes++;
            scenario.results.totalSignals++;
          })
          .catch((err) => {
            scenario.results.failures++;
            scenario.results.totalSignals++;
            console.error(`[LOAD TEST] Signal failed: ${err.message}`);
          });
        
        batchPromises.push(promise);
      }

      // Wait for batch and track progress
      await Promise.all(batchPromises);

      // Log progress every 5 seconds
      if (Date.now() - lastLogTime > 5000) {
        const elapsed = (Date.now() - scenario.results.startTime) / 1000;
        const throughput = scenario.results.totalSignals / elapsed;
        console.log(
          `[LOAD TEST] Progress: ${scenario.results.totalSignals} signals, ` +
          `${throughput.toFixed(1)} signals/sec, ` +
          `${scenario.results.failures} failures`
        );
        lastLogTime = Date.now();
      }

      // Wait before next batch to maintain rate
      await new Promise(r => setTimeout(r, interval));
    }

    scenario.results.endTime = Date.now();
    const durationSec = (scenario.results.endTime - scenario.results.startTime) / 1000;
    scenario.results.actualThroughput = scenario.results.totalSignals / durationSec;
    scenario.results.successRate = scenario.results.successes / scenario.results.totalSignals;

    this.results.scenarios.push(scenario);
    return scenario;
  }

  /**
   * Test 2: Spike load (measures burst handling)
   */
  async testSpikeLoad(signalsPerSecond = 500, durationSeconds = 10) {
    console.log(`\n[LOAD TEST] Starting spike load test: ${signalsPerSecond} signals/sec for ${durationSeconds}s`);
    
    const scenario = {
      name: 'Spike Load',
      config: { signalsPerSecond, durationSeconds },
      results: {
        totalSignals: 0,
        successes: 0,
        failures: 0,
        startTime: Date.now(),
        endTime: null,
      },
    };

    const endTime = Date.now() + (durationSeconds * 1000);
    let lastLogTime = Date.now();

    while (Date.now() < endTime) {
      const batchPromises = [];
      
      // Send massive batch of signals
      for (let i = 0; i < signalsPerSecond; i++) {
        const promise = this._sendSignal(this.generateSignal('high_error'))
          .then(() => {
            scenario.results.successes++;
            scenario.results.totalSignals++;
          })
          .catch((err) => {
            scenario.results.failures++;
            scenario.results.totalSignals++;
          });
        
        batchPromises.push(promise);
      }

      await Promise.all(batchPromises);

      if (Date.now() - lastLogTime > 5000) {
        const elapsed = (Date.now() - scenario.results.startTime) / 1000;
        const throughput = scenario.results.totalSignals / elapsed;
        console.log(
          `[LOAD TEST] Spike: ${scenario.results.totalSignals} signals, ` +
          `${throughput.toFixed(1)} signals/sec, ` +
          `${scenario.results.failures} failures`
        );
        lastLogTime = Date.now();
      }
    }

    scenario.results.endTime = Date.now();
    const durationSec = (scenario.results.endTime - scenario.results.startTime) / 1000;
    scenario.results.actualThroughput = scenario.results.totalSignals / durationSec;
    scenario.results.successRate = scenario.results.successes / scenario.results.totalSignals;

    this.results.scenarios.push(scenario);
    return scenario;
  }

  /**
   * Test 3: Failure injection (measures error handling)
   */
  async testFailureInjection(durationSeconds = 20) {
    console.log(`\n[LOAD TEST] Starting failure injection test for ${durationSeconds}s`);
    
    const scenario = {
      name: 'Failure Injection',
      config: { durationSeconds },
      results: {
        totalSignals: 0,
        cascadeFailures: 0,
        silentFailures: 0,
        recoveries: 0,
        startTime: Date.now(),
        endTime: null,
      },
    };

    const endTime = Date.now() + (durationSeconds * 1000);
    const signalTypes = ['baseline', 'high_error', 'latency_spike', 'cascade_failure'];
    let signalIndex = 0;

    while (Date.now() < endTime) {
      const promises = [];
      
      // Send mixed signals including cascades
      for (let i = 0; i < 50; i++) {
        const signalType = signalTypes[signalIndex % signalTypes.length];
        signalIndex++;
        
        const promise = this._sendSignal(this.generateSignal(signalType))
          .then(() => scenario.results.totalSignals++)
          .catch(() => {
            if (signalType === 'cascade_failure') {
              scenario.results.cascadeFailures++;
            } else {
              scenario.results.silentFailures++;
            }
          });
        
        promises.push(promise);
      }

      await Promise.all(promises);
      await new Promise(r => setTimeout(r, 500));
    }

    scenario.results.endTime = Date.now();
    this.results.scenarios.push(scenario);
    return scenario;
  }

  /**
   * Test 4: Latency tail analysis (p95, p99)
   */
  async testLatencyTails(totalRequests = 1000) {
    console.log(`\n[LOAD TEST] Testing latency tail distribution (${totalRequests} requests)`);
    
    const scenario = {
      name: 'Latency Tail Analysis',
      config: { totalRequests },
      results: {
        p50: 0,
        p95: 0,
        p99: 0,
        max: 0,
        min: Infinity,
        avg: 0,
      },
    };

    const promises = [];
    for (let i = 0; i < totalRequests; i++) {
      const promise = this._sendSignal(this.generateSignal('baseline'));
      promises.push(promise);
      
      // Send without rate limiting to see natural latency
      if (i % 100 === 0) {
        await new Promise(r => setTimeout(r, 10));
      }
    }

    await Promise.all(promises);

    // Calculate percentiles
    this.latencies.sort((a, b) => a - b);
    scenario.results.p50 = this.latencies[Math.floor(this.latencies.length * 0.50)];
    scenario.results.p95 = this.latencies[Math.floor(this.latencies.length * 0.95)];
    scenario.results.p99 = this.latencies[Math.floor(this.latencies.length * 0.99)];
    scenario.results.max = Math.max(...this.latencies);
    scenario.results.min = Math.min(...this.latencies);
    scenario.results.avg = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;

    this.results.scenarios.push(scenario);
    return scenario;
  }

  /**
   * Send signal and measure latency
   * @private
   */
  async _sendSignal(signal) {
    const startTime = Date.now();
    
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/v1/tenants/${this.tenantId}/signals`,
        signal,
        {
          headers: {
            'Authorization': `Bearer load-test-tenant:fake-secret`,
            'X-Timestamp': Date.now(),
            'X-Idempotency-Key': crypto.randomUUID(),
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      const latency = Date.now() - startTime;
      this.latencies.push(latency);
      this.results.metrics.totalRequests++;
      this.results.metrics.successfulRequests++;

      if (response.data && response.data.decisionId) {
        this.decisions.push(response.data.decisionId);
      }

      return latency;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.results.metrics.totalRequests++;
      this.results.metrics.failedRequests++;
      throw error;
    }
  }

  /**
   * Analyze results and generate report
   */
  analyzeResults() {
    console.log('\n🔬 ANALYZING RESULTS...\n');

    // Overall metrics
    this.results.metrics.avgLatencyMs = this.latencies.length > 0
      ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
      : 0;
    
    this.latencies.sort((a, b) => a - b);
    this.results.metrics.p50LatencyMs = this.latencies[Math.floor(this.latencies.length * 0.50)] || 0;
    this.results.metrics.p95LatencyMs = this.latencies[Math.floor(this.latencies.length * 0.95)] || 0;
    this.results.metrics.p99LatencyMs = this.latencies[Math.floor(this.latencies.length * 0.99)] || 0;
    this.results.metrics.maxLatencyMs = Math.max(...this.latencies, 0);
    this.results.metrics.minLatencyMs = Math.min(...this.latencies, Infinity) === Infinity ? 0 : this.results.metrics.minLatencyMs;

    // Identify bottlenecks
    if (this.results.metrics.p99LatencyMs > 500) {
      this.results.bottlenecks.push({
        issue: 'P99 latency exceeds 500ms',
        severity: this.results.metrics.p99LatencyMs > 1000 ? 'CRITICAL' : 'WARNING',
        value: this.results.metrics.p99LatencyMs,
        recommendation: 'Check database query performance, Redis latency, or queue processing',
      });
    }

    if (this.results.metrics.failedRequests / this.results.metrics.totalRequests > 0.01) {
      this.results.bottlenecks.push({
        issue: 'Error rate > 1%',
        severity: 'WARNING',
        value: (this.results.metrics.failedRequests / this.results.metrics.totalRequests * 100).toFixed(2) + '%',
        recommendation: 'Check system health; may be running out of resources',
      });
    }

    // Save report
    const reportDir = path.join(__dirname, '../../test-results');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportPath = path.join(reportDir, 'load-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));

    console.log(`✓ Report saved to ${reportPath}`);
  }

  /**
   * Print summary
   */
  printSummary() {
    console.log('\n═════════════════════════════════════════════════════════════');
    console.log('LOAD TEST RESULTS SUMMARY');
    console.log('═════════════════════════════════════════════════════════════\n');

    console.log('📊 THROUGHPUT:');
    console.log(`   Total Requests: ${this.results.metrics.totalRequests}`);
    console.log(`   Successful: ${this.results.metrics.successfulRequests}`);
    console.log(`   Failed: ${this.results.metrics.failedRequests}`);
    console.log(`   Success Rate: ${((this.results.metrics.successfulRequests / this.results.metrics.totalRequests) * 100).toFixed(2)}%\n`);

    console.log('⏱️  LATENCY:');
    console.log(`   Avg: ${this.results.metrics.avgLatencyMs.toFixed(2)}ms`);
    console.log(`   P50: ${this.results.metrics.p50LatencyMs.toFixed(2)}ms`);
    console.log(`   P95: ${this.results.metrics.p95LatencyMs.toFixed(2)}ms`);
    console.log(`   P99: ${this.results.metrics.p99LatencyMs.toFixed(2)}ms`);
    console.log(`   Max: ${this.results.metrics.maxLatencyMs.toFixed(2)}ms\n`);

    console.log('⚠️  BOTTLENECKS DETECTED:');
    if (this.results.bottlenecks.length === 0) {
      console.log('   ✓ No major bottlenecks\n');
    } else {
      this.results.bottlenecks.forEach((bn) => {
        console.log(`   [${bn.severity}] ${bn.issue}`);
        console.log(`      Value: ${bn.value}`);
        console.log(`      Fix: ${bn.recommendation}\n`);
      });
    }

    console.log('═════════════════════════════════════════════════════════════\n');
  }
}

module.exports = ProductionLoadTester;
