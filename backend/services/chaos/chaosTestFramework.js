/**
 * PHASE 3: CHAOS TESTING FRAMEWORK
 * 
 * Controlled failure injection to validate system resilience:
 * 1. Database failures (unavailable, slow queries)
 * 2. Queue failures (latency, saturation)
 * 3. External service failures (slow, timeouts)
 * 4. High-load scenarios (incident storms)
 * 
 * Each test validates:
 * - System doesn't crash
 * - Graceful degradation
 * - Proper error handling
 * - Recovery capability
 */

class ChaosTestFramework {
  constructor() {
    this.activeFailures = new Map();
    this.testResults = [];
  }

  /**
   * Register a failure mode
   */
  registerFailure(name, failureMode, options = {}) {
    this.activeFailures.set(name, {
      failureMode,
      options,
      startTime: Date.now(),
      duration: options.duration || 10000, // Default 10 seconds
    });
  }

  /**
   * Check if a specific failure should be active
   */
  isFailureActive(failureName) {
    const failure = this.activeFailures.get(failureName);
    if (!failure) return false;

    const elapsed = Date.now() - failure.startTime;
    if (elapsed > failure.duration) {
      this.activeFailures.delete(failureName);
      return false;
    }

    return true;
  }

  /**
   * Get failure details
   */
  getFailureDetails(failureName) {
    return this.activeFailures.get(failureName);
  }

  /**
   * Deactivate a failure
   */
  deactivateFailure(failureName) {
    this.activeFailures.delete(failureName);
  }

  /**
   * Record test result
   */
  recordResult(testName, result) {
    this.testResults.push({
      timestamp: new Date(),
      testName,
      passed: result.passed,
      duration: result.duration,
      message: result.message,
      details: result.details,
    });
  }

  /**
   * Get test report
   */
  getReport() {
    const total = this.testResults.length;
    const passed = this.testResults.filter(r => r.passed).length;
    const failed = total - passed;

    return {
      timestamp: new Date().toISOString(),
      summary: {
        total,
        passed,
        failed,
        passRate: total > 0 ? ((passed / total) * 100).toFixed(1) : 'N/A',
      },
      tests: this.testResults,
    };
  }

  /**
   * Clear results (for next test run)
   */
  clearResults() {
    this.testResults = [];
  }
}

/**
 * Database Failure Injection
 */
class DatabaseChaosInjector {
  constructor(dbService) {
    this.dbService = dbService;
    this.originalMethods = {};
  }

  /**
   * Simulate database unavailable
   */
  injectUnavailability(duration = 5000) {
    // Save original method
    if (!this.originalMethods.find) {
      this.originalMethods.find = this.dbService.find;
    }

    this.dbService.find = async () => {
      throw new Error('DATABASE_UNAVAILABLE: Connection refused');
    };

    setTimeout(() => {
      this.restore();
    }, duration);
  }

  /**
   * Simulate slow queries
   */
  injectLatency(delayMs = 1000, duration = 5000) {
    if (!this.originalMethods.find) {
      this.originalMethods.find = this.dbService.find;
    }

    const originalFind = this.originalMethods.find;
    this.dbService.find = async (...args) => {
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return originalFind.apply(this.dbService, args);
    };

    setTimeout(() => {
      this.restore();
    }, duration);
  }

  /**
   * Simulate intermittent failures
   */
  injectIntermittent(failureRate = 0.5, duration = 5000) {
    if (!this.originalMethods.find) {
      this.originalMethods.find = this.dbService.find;
    }

    const originalFind = this.originalMethods.find;
    this.dbService.find = async (...args) => {
      if (Math.random() < failureRate) {
        throw new Error('DATABASE_ERROR: Intermittent failure');
      }
      return originalFind.apply(this.dbService, args);
    };

    setTimeout(() => {
      this.restore();
    }, duration);
  }

  /**
   * Restore original methods
   */
  restore() {
    if (this.originalMethods.find) {
      this.dbService.find = this.originalMethods.find;
      delete this.originalMethods.find;
    }
  }
}

/**
 * Queue Failure Injection
 */
class QueueChaosInjector {
  constructor(queueService) {
    this.queueService = queueService;
    this.originalMethods = {};
    this.delayedMessages = [];
  }

  /**
   * Simulate queue saturation
   */
  injectSaturation(backlogSize = 1000, duration = 5000) {
    if (!this.originalMethods.publish) {
      this.originalMethods.publish = this.queueService.publishEvent;
    }

    // Simulate queue full error
    let messageCount = 0;
    this.queueService.publishEvent = async (topic, message) => {
      if (messageCount >= backlogSize) {
        throw new Error('QUEUE_FULL: Backpressure exceeded');
      }
      messageCount++;
      return this.originalMethods.publish.call(this.queueService, topic, message);
    };

    setTimeout(() => {
      this.restore();
    }, duration);
  }

  /**
   * Simulate message delays
   */
  injectMessageDelay(delayMs = 1000, duration = 5000) {
    if (!this.originalMethods.publish) {
      this.originalMethods.publish = this.queueService.publishEvent;
    }

    this.queueService.publishEvent = async (topic, message) => {
      // Delay message processing
      const delayedMessage = {
        topic,
        message,
        processTime: Date.now() + delayMs,
      };

      this.delayedMessages.push(delayedMessage);

      // Eventually process it
      setTimeout(() => {
        return this.originalMethods.publish.call(this.queueService, topic, message);
      }, delayMs);
    };

    setTimeout(() => {
      this.restore();
    }, duration);
  }

  /**
   * Simulate message reordering
   */
  injectReordering(duration = 5000) {
    if (!this.originalMethods.publish) {
      this.originalMethods.publish = this.queueService.publishEvent;
    }

    const messages = [];
    this.queueService.publishEvent = async (topic, message) => {
      messages.push({ topic, message });

      // Reorder and publish every 100ms
      if (messages.length > 1) {
        // Random order
        messages.sort(() => Math.random() - 0.5);
        
        while (messages.length > 0) {
          const next = messages.shift();
          await this.originalMethods.publish.call(this.queueService, next.topic, next.message);
        }
      }
    };

    setTimeout(() => {
      this.restore();
    }, duration);
  }

  /**
   * Restore original methods
   */
  restore() {
    if (this.originalMethods.publish) {
      this.queueService.publishEvent = this.originalMethods.publish;
      delete this.originalMethods.publish;
    }
    this.delayedMessages = [];
  }
}

/**
 * External Service Failure Injection
 */
class ExternalServiceChaosInjector {
  constructor() {
    this.originalFetches = {};
  }

  /**
   * Simulate slow external service
   */
  injectLatency(delayMs = 2000, duration = 5000) {
    const originalFetch = global.fetch || require('axios').get;

    global.fetch = async (...args) => {
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return originalFetch.apply(this, args);
    };

    setTimeout(() => {
      global.fetch = originalFetch;
    }, duration);
  }

  /**
   * Simulate service timeout
   */
  injectTimeout(duration = 5000) {
    const originalFetch = global.fetch;

    global.fetch = async (...args) => {
      throw new Error('EXTERNAL_SERVICE_TIMEOUT: Request timed out after 30s');
    };

    setTimeout(() => {
      global.fetch = originalFetch;
    }, duration);
  }

  /**
   * Simulate service unavailable
   */
  injectUnavailability(duration = 5000) {
    const originalFetch = global.fetch;

    global.fetch = async (...args) => {
      throw new Error('EXTERNAL_SERVICE_UNAVAILABLE: Service returned 503');
    };

    setTimeout(() => {
      global.fetch = originalFetch;
    }, duration);
  }
}

/**
 * Load Injection (Incident Storm)
 */
class LoadChaosInjector {
  /**
   * Simulate incident storm
   */
  static async injectIncidentStorm(incidentCount, incidentGenerator) {
    const incidents = [];

    for (let i = 0; i < incidentCount; i++) {
      incidents.push({
        id: `incident-${i}`,
        timestamp: Date.now(),
        severity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][Math.floor(Math.random() * 4)],
        pattern: ['HIGH_LATENCY', 'HIGH_ERROR_RATE', 'MEMORY_LEAK', 'CASCADE_FAILURE'][
          Math.floor(Math.random() * 4)
        ],
      });
    }

    // Ensure array is returned with proper length
    if (!Array.isArray(incidents) || incidents.length === 0) {
      console.warn(`[LoadChaosInjector] Warning: incidents array empty or invalid, returning generated array with ${incidentCount} items`);
      // Fallback: regenerate if something went wrong
      const fallback = [];
      for (let i = 0; i < incidentCount; i++) {
        fallback.push({
          id: `incident-${i}`,
          timestamp: Date.now(),
          severity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][Math.floor(Math.random() * 4)],
          pattern: ['HIGH_LATENCY', 'HIGH_ERROR_RATE', 'MEMORY_LEAK', 'CASCADE_FAILURE'][Math.floor(Math.random() * 4)],
        });
      }
      return fallback;
    }

    return incidents;
  }

  /**
   * Measure system response under load
   */
  static async measureLoadResponse(incidents, decisionEngine) {
    const startTime = Date.now();
    const results = [];

    for (const incident of incidents) {
      try {
        const decisionStartTime = Date.now();
        const decision = await decisionEngine.makeDecision(incident);
        const decisionDuration = Date.now() - decisionStartTime;

        results.push({
          incidentId: incident.id,
          success: true,
          duration: decisionDuration,
          decision,
        });
      } catch (error) {
        results.push({
          incidentId: incident.id,
          success: false,
          duration: Date.now() - startTime,
          error: error.message,
        });
      }
    }

    const totalDuration = Date.now() - startTime;

    return {
      totalIncidents: incidents.length,
      successfulDecisions: results.filter(r => r.success).length,
      failedDecisions: results.filter(r => !r.success).length,
      totalDuration,
      avgLatencyMs: totalDuration / incidents.length,
      maxLatencyMs: Math.max(...results.map(r => r.duration)),
      minLatencyMs: Math.min(...results.map(r => r.duration)),
      throughputIncidentsPerSecond: (incidents.length / (totalDuration / 1000)).toFixed(2),
      results,
    };
  }
}

module.exports = {
  ChaosTestFramework,
  DatabaseChaosInjector,
  QueueChaosInjector,
  ExternalServiceChaosInjector,
  LoadChaosInjector,
};
