/**
 * Chaos Test Framework
 * 
 * Core orchestrator for chaos testing the Lean Incident Response Decision Engine
 * Manages:
 * - Test scenario execution
 * - Signal injection and timing
 * - Results collection and validation
 * - Performance metrics
 */

const axios = require('axios');
const crypto = require('crypto');

class ChaosTestFramework {
  constructor(baseUrl = 'http://localhost:5000', tenantId = 'chaos-test-tenant') {
    this.baseUrl = baseUrl;
    this.tenantId = tenantId;
    this.scenarios = [];
    this.results = {
      startTime: null,
      endTime: null,
      scenarios: [],
      globalMetrics: {
        totalSignalsInjected: 0,
        totalDecisionsReceived: 0,
        totalApiErrors: 0,
        avgLatencyMs: 0,
        maxLatencyMs: 0,
        minLatencyMs: Infinity,
        avgDecisionConfidence: 0,
        safetyViolations: [],
      },
    };
    
    // Test configuration
    this.config = {
      requestTimeout: 30000,
      maxRetries: 3,
      retryDelayMs: 1000,
      concurrencyLimit: 50, // Maximum concurrent requests
    };

    this.requestMetrics = [];
    this.decisionMetrics = [];
  }

  /**
   * Initialize chaos test framework (health checks, tenant setup)
   */
  async initialize() {
    console.log('[ChaosTest] Initializing framework...');
    
    // Health check
    try {
      const response = await this._makeRequest('GET', '/health');
      console.log('[ChaosTest] ✓ API is healthy:', response.status);
    } catch (error) {
      throw new Error(`[ChaosTest] Failed to connect to API: ${error.message}`);
    }

    // Create test tenant
    try {
      console.log(`[ChaosTest] ✓ Using tenant: ${this.tenantId}`);
    } catch (error) {
      console.warn('[ChaosTest] Warning:', error.message);
    }

    this.results.startTime = new Date();
  }

  /**
   * Register a chaos scenario
   */
  registerScenario(scenario) {
    if (!scenario.name || !scenario.execute) {
      throw new Error('Scenario must have name and execute function');
    }
    this.scenarios.push(scenario);
    console.log(`[ChaosTest] Registered scenario: ${scenario.name}`);
  }

  /**
   * Run all registered scenarios
   */
  async runAllScenarios() {
    console.log('\n' + '='.repeat(80));
    console.log('CHAOS TESTING HARNESS STARTING');
    console.log('='.repeat(80));
    
    for (const scenario of this.scenarios) {
      console.log('\n' + '-'.repeat(80));
      console.log(`Running: ${scenario.name}`);
      console.log('-'.repeat(80));
      
      try {
        const result = await scenario.execute(this);
        this.results.scenarios.push({
          name: scenario.name,
          result,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error(`[ChaosTest] Scenario failed: ${error.message}`);
        this.results.scenarios.push({
          name: scenario.name,
          result: {
            success: false,
            error: error.message,
          },
          timestamp: new Date(),
        });
      }

      // Small delay between scenarios
      await this._wait(1000);
    }

    this.results.endTime = new Date();
    this._aggregateMetrics();
  }

  /**
   * Transform test signal format to API format
   */
  transformSignal(testSignal) {
    // Convert test signal format (signalType, value) to API format (errorRate, responseTime, affectedServices)
    let errorRate = 0;
    let responseTime = 0;
    const affectedServices = [testSignal.service || 'api-gateway'];

    if (testSignal.signalType === 'errorRate') {
      errorRate = testSignal.value; // e.g., 0.8
      responseTime = 500; // Default moderate latency
    } else if (testSignal.signalType === 'latency') {
      responseTime = testSignal.value; // e.g., 2000ms
      errorRate = 0.1; // Default low error rate
    } else if (testSignal.signalType === 'throughput') {
      // Low throughput indicates service degradation
      responseTime = testSignal.value > 5000 ? 300 : (testSignal.value < 1000 ? 2000 : 800);
      errorRate = testSignal.value < 1000 ? 0.3 : 0.05;
    } else {
      // Unknown signal type - use moderate defaults
      errorRate = 0.3;
      responseTime = 1000;
    }

    return {
      errorRate,
      responseTime,
      affectedServices,
      severity: testSignal.severity || 'medium',
      signalType: testSignal.signalType,
      service: testSignal.service || 'api-gateway',
      timestamp: testSignal.timestamp || new Date(),
    };
  }

  /**
   * Inject a single signal (helper for scenarios)
   */
  async injectSignal(signal) {
    const startTime = Date.now();
    
    try {
      // Transform test signal to API format
      const apiSignal = this.transformSignal(signal);
      
      const response = await this._makeRequest(
        'POST',
        `/api/v1/tenants/${this.tenantId}/signals`,
        apiSignal
      );
      
      const latency = Date.now() - startTime;
      this.requestMetrics.push({
        signal: signal.signalType,
        latency,
        status: 'success',
        timestamp: new Date(),
      });

      this.results.globalMetrics.totalSignalsInjected++;
      return {
        success: true,
        decisionId: response.data.decisionId, // Use decisionId for decision retrieval
        correlationId: response.data.correlationId,
        latency,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      this.requestMetrics.push({
        signal: signal.signalType,
        latency,
        status: 'error',
        error: error.message,
        timestamp: new Date(),
      });
      
      this.results.globalMetrics.totalApiErrors++;
      return {
        success: false,
        error: error.message,
        latency,
      };
    }
  }

  /**
   * Inject multiple signals with concurrency control
   */
  async injectSignalBurst(signals) {
    console.log(`[ChaosTest] Injecting ${signals.length} signals with concurrency limit ${this.config.concurrencyLimit}`);
    
    const results = [];
    for (let i = 0; i < signals.length; i += this.config.concurrencyLimit) {
      const batch = signals.slice(i, i + this.config.concurrencyLimit);
      const batchResults = await Promise.all(
        batch.map(signal => this.injectSignal(signal))
      );
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Retrieve decision for validation
   */
  async getDecision(decisionId) {
    try {
      const response = await this._makeRequest(
        'GET',
        `/api/v1/tenants/${this.tenantId}/decisions/${decisionId}`
      );
      
      const decision = response.data;
      
      // Extract confidence from decision object
      const confidence = decision.decision?.inputs?.confidence || 
                        decision.explanation?.confidence?.score || 
                        decision.decision?.confidence || 0.5;
      
      // Track decision metrics
      this.decisionMetrics.push({
        decisionId,
        confidence,
        action: decision.decision?.recommendedAction || decision.explanation?.actionChosen?.action,
        policyVerdict: decision.explanation?.policiesApplied,
        timestamp: new Date(),
        decision,
      });

      this.results.globalMetrics.totalDecisionsReceived++;
      return decision;
    } catch (error) {
      console.error(`[ChaosTest] Failed to retrieve decision ${decisionId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get recent decisions for validation
   */
  async getRecentDecisions(limit = 50) {
    try {
      const response = await this._makeRequest(
        'GET',
        `/api/v1/tenants/${this.tenantId}/decisions?limit=${limit}`
      );
      return response.data.recentDecisions;
    } catch (error) {
      console.error(`[ChaosTest] Failed to retrieve recent decisions: ${error.message}`);
      return [];
    }
  }

  /**
   * Wait for decisions to be processed
   */
  async waitForDecisions(correlationIds, maxWaitMs = 10000) {
    const startTime = Date.now();
    const decisions = new Map();

    console.log(`[ChaosTest] Waiting for ${correlationIds.length} decisions (max ${maxWaitMs}ms)...`);

    while (decisions.size < correlationIds.length && Date.now() - startTime < maxWaitMs) {
      for (const id of correlationIds) {
        if (!decisions.has(id)) {
          const decision = await this.getDecision(id);
          if (decision) {
            decisions.set(id, decision);
          }
        }
      }

      if (decisions.size < correlationIds.length) {
        await this._wait(500);
      }
    }

    const missing = correlationIds.filter(id => !decisions.has(id));
    if (missing.length > 0) {
      console.warn(`[ChaosTest] ⚠ ${missing.length} decisions not received after ${maxWaitMs}ms`);
    }

    return decisions;
  }

  /**
   * Internal: Make HTTP request with retry logic
   */
  async _makeRequest(method, path, data = null, retryCount = 0, previousTimestamp = null, previousSignature = null) {
    try {
      // Generate fresh or reuse timestamp for retries
      const timestamp = previousTimestamp || Date.now().toString();
      const idempotencyKey = `${timestamp}-${crypto.randomBytes(8).toString('hex')}`;
      
      // For GET requests without body, use empty string for signature
      // For POST/PUT, serialize the data if present
      const bodyString = (method === 'GET' || !data) ? '' : JSON.stringify(data);
      
      // Compute signature: HMAC-SHA256(body + timestamp, secret)
      // Reuse signature from first attempt to avoid mismatch on retry
      let signature = previousSignature;
      if (!signature) {
        const messageToSign = bodyString + timestamp;
        signature = crypto
          .createHmac('sha256', 'chaos-secret')
          .update(messageToSign)
          .digest('hex');
      }
      
      const config = {
        method,
        url: `${this.baseUrl}${path}`,
        timeout: this.config.requestTimeout,
        headers: {
          'Authorization': `Bearer chaos-key:chaos-secret`,
          'X-Timestamp': timestamp,
          'X-Idempotency-Key': idempotencyKey,
          'X-Signature': signature,
        },
      };

      // Only set JSON content-type and body for POST/PUT requests
      if (method !== 'GET' && bodyString) {
        config.headers['Content-Type'] = 'application/json';
        config.data = bodyString;
      }

      const response = await axios(config);
      return response;
    } catch (error) {
      // Log error details on first retry attempt
      if (retryCount === 0 && error.response?.status) {
        const errorMsg = error.response?.data?.error || error.message;
        console.log(`[ChaosTest] ${error.response.status} - ${errorMsg}`);
      }
      
      if (retryCount < this.config.maxRetries && error.code !== 'ECONNREFUSED') {
        console.log(`[ChaosTest] Retry ${retryCount + 1}/${this.config.maxRetries}`);
        await this._wait(this.config.retryDelayMs);
        
        // Compute timestamp and signature once, reuse on retries
        const timestamp = previousTimestamp || Date.now().toString();
        const bodyString = (method === 'GET' || !data) ? '' : JSON.stringify(data);
        let signature = previousSignature;
        if (!signature) {
          const messageToSign = bodyString + timestamp;
          signature = crypto
            .createHmac('sha256', 'chaos-secret')
            .update(messageToSign)
            .digest('hex');
        }
        
        return this._makeRequest(method, path, data, retryCount + 1, timestamp, signature);
      }
      throw error;
    }
  }

  /**
   * Internal: Wait helper
   */
  async _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Internal: Aggregate metrics
   */
  _aggregateMetrics() {
    // Aggregate request latencies
    if (this.requestMetrics.length > 0) {
      const successMetrics = this.requestMetrics.filter(m => m.status === 'success');
      if (successMetrics.length > 0) {
        const latencies = successMetrics.map(m => m.latency);
        this.results.globalMetrics.avgLatencyMs = 
          latencies.reduce((a, b) => a + b, 0) / latencies.length;
        this.results.globalMetrics.maxLatencyMs = Math.max(...latencies);
        this.results.globalMetrics.minLatencyMs = Math.min(...latencies);
      }
      
      const errorMetrics = this.requestMetrics.filter(m => m.status === 'error');
      this.results.globalMetrics.totalApiErrors = errorMetrics.length;
    }

    // Aggregate decision metrics
    if (this.decisionMetrics.length > 0) {
      const confidences = this.decisionMetrics.map(m => m.confidence || 0);
      this.results.globalMetrics.avgDecisionConfidence = 
        confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
    }
    
    console.log('[ChaosTest] Aggregated metrics:', {
      requestsProcessed: this.requestMetrics.length,
      decisionsReceived: this.decisionMetrics.length,
      totalSignalsInjected: this.results.globalMetrics.totalSignalsInjected,
      avgLatency: this.results.globalMetrics.avgLatencyMs,
      avgConfidence: this.results.globalMetrics.avgDecisionConfidence,
    });
  }

  /**
   * Export results in various formats
   */
  exportResults() {
    return {
      json: this.results,
      summary: this._generateSummary(),
      metrics: this._formatMetrics(),
    };
  }

  /**
   * Generate readable summary
   */
  _generateSummary() {
    const duration = (this.results.endTime - this.results.startTime) / 1000;
    
    return {
      executionTime: `${duration.toFixed(2)}s`,
      totalScenarios: this.results.scenarios.length,
      passedScenarios: this.results.scenarios.filter(s => s.result.success).length,
      failedScenarios: this.results.scenarios.filter(s => !s.result.success).length,
      signalsInjected: this.results.globalMetrics.totalSignalsInjected,
      decisionsReceived: this.results.globalMetrics.totalDecisionsReceived,
      apiErrors: this.results.globalMetrics.totalApiErrors,
      avgLatencyMs: this.results.globalMetrics.avgLatencyMs.toFixed(2),
      avgConfidence: (this.results.globalMetrics.avgDecisionConfidence * 100).toFixed(1) + '%',
      safetyViolations: this.results.globalMetrics.safetyViolations.length,
    };
  }

  /**
   * Format metrics for display
   */
  _formatMetrics() {
    return {
      requestLatencies: {
        avg: this.results.globalMetrics.avgLatencyMs.toFixed(2) + 'ms',
        max: this.results.globalMetrics.maxLatencyMs + 'ms',
        min: this.results.globalMetrics.minLatencyMs + 'ms',
      },
      decisionConfidence: {
        avg: (this.results.globalMetrics.avgDecisionConfidence * 100).toFixed(1) + '%',
        decisions: this.results.globalMetrics.totalDecisionsReceived,
      },
      throughput: {
        signalsInjected: this.results.globalMetrics.totalSignalsInjected,
        apiErrors: this.results.globalMetrics.totalApiErrors,
        errorRate: ((this.results.globalMetrics.totalApiErrors / 
          this.results.globalMetrics.totalSignalsInjected) * 100).toFixed(2) + '%',
      },
    };
  }
}

module.exports = ChaosTestFramework;
