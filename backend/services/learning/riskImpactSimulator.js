/**
 * Risk Impact Simulator
 * Simulates expected impact of actions BEFORE execution
 * Uses historical patterns to estimate:
 * - Downtime impact
 * - Resource pressure
 * - Cascading failure risk
 * - Side effect probability
 * 
 * All calculations are transparent and based on observable data
 */

class RiskImpactSimulator {
  constructor(memoryService, correlationEngine) {
    this.memoryService = memoryService;
    this.correlationEngine = correlationEngine;

    // Impact severity thresholds
    this.impactLevels = {
      LOW: { maxDowntime: 1000, maxAffected: 1 },
      MEDIUM: { maxDowntime: 5000, maxAffected: 5 },
      HIGH: { maxDowntime: 30000, maxAffected: 10 },
      CRITICAL: { maxDowntime: Infinity, maxAffected: Infinity },
    };
  }

  /**
   * Simulate action impact
   * Returns what we expect to happen if we execute this action
   */
  async simulateActionImpact(action, appliedTo, context = {}) {
    const simulation = {
      action,
      appliedTo,
      timestamp: new Date(),
      estimates: {
        estimatedDowntimeMs: 0,
        estimatedRecoveryTimeMs: 0,
        cascadingFailureRisk: 0.0, // 0-1
        resourceSpikeRisk: 0.0,
        dataInconsistencyRisk: 0.0,
        estimatedAffectedServices: [],
      },
      reasoning: [],
      warnings: [],
    };

    switch (action) {
      case "restart":
        await this._simulateRestart(simulation, appliedTo, context);
        break;
      case "scale":
        await this._simulateScale(simulation, appliedTo, context);
        break;
      case "circuit-break":
        await this._simulateCircuitBreak(simulation, appliedTo, context);
        break;
      case "cache-clear":
        await this._simulateCacheClear(simulation, appliedTo, context);
        break;
      case "alert":
        await this._simulateAlert(simulation, appliedTo, context);
        break;
      default:
        simulation.reasoning.push(`Unknown action: ${action}`);
    }

    // Overall impact assessment
    simulation.overallRisk = this._calculateOverallRisk(simulation.estimates);
    simulation.recommendation = this._getRecommendation(simulation);

    return simulation;
  }

  /**
   * Simulate service restart impact
   */
  async _simulateRestart(simulation, serviceId, context) {
    simulation.reasoning.push(`Simulating restart of ${serviceId}`);

    // Get historical restart data
    const history = await this.memoryService.getIncidentHistory(
      `restart-${serviceId}`,
      20
    );

    if (history && history.length > 0) {
      const avgRecoveryTime =
        history.reduce((sum, h) => sum + (h.recoveryTimeMs || 0), 0) / history.length;
      const successRate = history.filter((h) => h.success).length / history.length;

      simulation.estimates.estimatedRecoveryTimeMs = Math.round(avgRecoveryTime);
      simulation.reasoning.push(
        `Historical average recovery time: ${avgRecoveryTime.toFixed(0)}ms (${(successRate * 100).toFixed(0)}% success rate)`
      );
    } else {
      // Default estimates
      simulation.estimates.estimatedRecoveryTimeMs = 3000;
      simulation.reasoning.push("No history available, using default estimate: 3000ms");
    }

    // Estimate downtime
    simulation.estimates.estimatedDowntimeMs = simulation.estimates.estimatedRecoveryTimeMs * 1.2;

    // Cascading failure risk based on dependency graph
    const cascade = this.correlationEngine.predictCascadeImpact(serviceId);
    const cascadeRisk =
      Math.min(cascade.affectedServices.length / 10, 1) *
      (cascade.cascadeDepth > 3 ? 0.8 : cascade.cascadeDepth > 1 ? 0.4 : 0.1);

    simulation.estimates.cascadingFailureRisk = parseFloat(cascadeRisk.toFixed(2));
    simulation.estimates.estimatedAffectedServices = cascade.affectedServices;

    if (cascade.affectedServices.length > 0) {
      simulation.reasoning.push(
        `Potential cascading failure to ${cascade.affectedServices.length} dependent services`
      );

      if (cascadeRisk > 0.5) {
        simulation.warnings.push("HIGH: Restart could trigger cascading failures");
      }
    }

    // Resource spike risk (restart can spike memory/CPU)
    simulation.estimates.resourceSpikeRisk = 0.6; // Restart typically has resource impact
    simulation.reasoning.push("Restart typically causes resource spike during recovery");

    // Check if enough time has passed since last restart (cooldown)
    if (context.lastRestartAgeMinutes && context.lastRestartAgeMinutes < 10) {
      simulation.warnings.push(
        `WARNING: Last restart was ${context.lastRestartAgeMinutes}min ago - rapid restarts increase failure risk`
      );
      simulation.estimates.cascadingFailureRisk = Math.min(
        1,
        simulation.estimates.cascadingFailureRisk + 0.2
      );
    }
  }

  /**
   * Simulate scaling action impact
   */
  async _simulateScale(simulation, serviceId, context) {
    simulation.reasoning.push(`Simulating scale of ${serviceId}`);

    // Scaling is typically lower risk than restart
    simulation.estimates.estimatedRecoveryTimeMs = 2000; // Faster than restart
    simulation.estimates.estimatedDowntimeMs = 500; // Minimal downtime
    simulation.reasoning.push("Scaling typically completes in 2000ms with minimal downtime");

    // Resource spike is high during scaling
    simulation.estimates.resourceSpikeRisk = 0.5;
    simulation.reasoning.push("Scaling can cause temporary resource pressure");

    // Cascading risk is lower
    simulation.estimates.cascadingFailureRisk = 0.2;

    // Get scaling history
    const history = await this.memoryService.getIncidentHistory(`scale-${serviceId}`, 10);
    if (history && history.length > 0) {
      const failureCount = history.filter((h) => !h.success).length;
      if (failureCount > history.length * 0.3) {
        simulation.warnings.push("WARNING: Scaling has high failure rate historically");
        simulation.estimates.cascadingFailureRisk += 0.2;
      }
    }

    if (context.currentResourceUtilization >= 80) {
      simulation.warnings.push(
        "WARNING: Current resource utilization is high - scaling may fail"
      );
    }
  }

  /**
   * Simulate circuit breaker impact
   */
  async _simulateCircuitBreak(simulation, serviceId, context) {
    simulation.reasoning.push(`Simulating circuit break of ${serviceId}`);

    // Circuit breaking is low risk - it's defensive
    simulation.estimates.estimatedDowntimeMs = 0;
    simulation.estimates.estimatedRecoveryTimeMs = 1000;
    simulation.reasoning.push("Circuit breaking is defensive - no downtime expected");

    // But it can cause cascading failures in dependent services
    const cascade = this.correlationEngine.predictCascadeImpact(serviceId);
    simulation.estimates.cascadingFailureRisk = Math.min(
      0.7,
      cascade.affectedServices.length * 0.1
    );

    if (cascade.affectedServices.length > 0) {
      simulation.warnings.push(
        `CAUTION: Circuit breaking could fail ${cascade.affectedServices.length} dependent services`
      );
    }

    simulation.estimates.estimatedAffectedServices = cascade.affectedServices;
  }

  /**
   * Simulate cache clear impact
   */
  async _simulateCacheClear(simulation, cacheKey, context) {
    simulation.reasoning.push(`Simulating cache clear for ${cacheKey}`);

    // Cache clearing is low-risk
    simulation.estimates.estimatedDowntimeMs = 0;
    simulation.estimates.estimatedRecoveryTimeMs = 500;
    simulation.reasoning.push("Cache clearing has minimal direct impact");

    // Main risk: dependent services may see cache misses
    simulation.estimates.cascadingFailureRisk = 0.1;
    simulation.estimates.resourceSpikeRisk = 0.4; // CPU spike from cache regeneration;

    if (context.cacheSizeBytes && context.cacheSizeBytes > 1000000000) {
      // > 1GB
      simulation.warnings.push("WARNING: Large cache - clearing may cause rebuild spike");
      simulation.estimates.resourceSpikeRisk = 0.7;
    }
  }

  /**
   * Simulate alert action (escalation)
   */
  async _simulateAlert(simulation, escalationPath, context) {
    simulation.reasoning.push(`Simulating alert escalation`);

    // Alerts have minimal technical impact, but human response time matters
    simulation.estimates.estimatedDowntimeMs = 0;
    simulation.estimates.estimatedRecoveryTimeMs = 300000; // 5 minutes (human response)
    simulation.reasoning.push("Alert escalation relies on human response time (estimated 5min)");

    // No cascading failures from alerting
    simulation.estimates.cascadingFailureRisk = 0;

    if (context.isNighttime) {
      simulation.warnings.push(
        "WARNING: Alert during off-hours - expect slower human response"
      );
      simulation.estimates.estimatedRecoveryTimeMs = 900000; // 15 minutes
    }
  }

  /**
   * Calculate overall risk level
   */
  _calculateOverallRisk(estimates) {
    const downtimeScore = Math.min(estimates.estimatedDowntimeMs / 30000, 1) * 0.4;
    const cascadeScore = estimates.cascadingFailureRisk * 0.4;
    const resourceScore = estimates.resourceSpikeRisk * 0.2;

    return Math.min(1, (downtimeScore + cascadeScore + resourceScore).toFixed(2));
  }

  /**
   * Get human-readable recommendation
   */
  _getRecommendation(simulation) {
    const risk = simulation.overallRisk;

    if (risk < 0.3) {
      return {
        level: "LOW_RISK",
        text: "Safe to execute immediately",
        shouldProceed: true,
      };
    } else if (risk < 0.6) {
      return {
        level: "MEDIUM_RISK",
        text: "Can proceed with monitoring",
        shouldProceed: true,
      };
    } else if (risk < 0.8) {
      return {
        level: "HIGH_RISK",
        text: "Consider waiting for maintenance window",
        shouldProceed: false,
      };
    } else {
      return {
        level: "CRITICAL_RISK",
        text: "Should NOT proceed without human approval",
        shouldProceed: false,
      };
    }
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      simulationsSupported: [
        "restart",
        "scale",
        "circuit-break",
        "cache-clear",
        "alert",
      ],
      correlationEngineAvailable: !!this.correlationEngine,
      memoryServiceAvailable: !!this.memoryService,
    };
  }
}

module.exports = RiskImpactSimulator;
