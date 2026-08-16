"use strict";

/**
 * ============================================================================
 * PHASE 11.12 / 11.13 — PROMETHEUS COMPATIBILITY + RELIABILITY FACADE
 * ============================================================================
 *
 * Metric ownership belongs exclusively to:
 *
 *   services/infrastructure/metricsService.js
 *
 * Reliability evaluation belongs exclusively to:
 *
 *   services/reliability/sloService.js
 *
 * This facade exists only for backwards compatibility.
 *
 * IMPORTANT:
 *
 * - does not register Prometheus metrics
 * - does not grant execution authority
 * - feeds existing observations into SLO evaluation
 */

const metricsService =
  require(
    "../infrastructure/metricsService"
  );

const sloService =
  require(
    "../reliability/sloService"
  );


function successFromResult(
  value
) {
  if (
    value ===
    true
  ) {
    return true;
  }

  if (
    value ===
    false
  ) {
    return false;
  }


  const normalized =
    String(
      value ||
      ""
    )
      .trim()
      .toLowerCase();


  return [
    "success",
    "successful",
    "ok",
    "healthy",
    "passed",
    "pass",
    "completed",
    "delivered",
    "made",
    "approved",
  ]
    .includes(
      normalized
    );
}


class PrometheusMetricsService {
  // ==========================================================================
  // DECISION
  // ==========================================================================

  recordDecisionLatency(
    tenantId,
    durationMs,
    severity,
    tier
  ) {
    metricsService
      .recordDecision(
        tenantId,
        severity,
        tier ||
          "unknown",
        durationMs
      );


    sloService
      .recordDecision(
        true,
        durationMs
      );


    return {
      recorded:
        true,

      objective:
        "decision",

      executionAuthorized:
        false,
    };
  }


  recordDecisionOutcome(
    tenantId,
    tier,
    outcome
  ) {
    metricsService
      .recordPolicyEvaluation(
        tenantId,
        outcome ||
          tier ||
          "unknown",
        0
      );


    sloService
      .recordDecision(
        successFromResult(
          outcome
        ),
        0
      );


    return {
      recorded:
        true,

      objective:
        "decision",

      executionAuthorized:
        false,
    };
  }


  recordDecisionConfidence(
    tenantId,
    confidenceScore,
    tier
  ) {
    return {
      tenantId,

      confidenceScore,

      tier,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // ACTION / EXECUTION
  // ==========================================================================

  recordActionExecution(
    tenantId,
    action,
    durationMs,
    result
  ) {
    metricsService
      .recordActionExecution(
        tenantId,
        action,
        result,
        durationMs
      );


    sloService
      .recordExecution(
        successFromResult(
          result
        ),
        durationMs
      );


    return {
      recorded:
        true,

      objective:
        "execution",

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // ESCALATION
  // ==========================================================================

  recordEscalation(
    tenantId,
    reason
  ) {
    metricsService
      .recordSelfError(
        "escalation",
        reason ||
          tenantId ||
          "unknown"
      );


    return {
      recorded:
        true,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // ERROR
  // ==========================================================================

  recordError(
    tenantId,
    errorType,
    component
  ) {
    metricsService
      .recordError(
        tenantId,
        component,
        errorType
      );


    return {
      recorded:
        true,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // QUEUE
  // ==========================================================================

  updateQueueDepth(
    tenantId,
    queueType,
    depth
  ) {
    metricsService
      .updateQueueDepth(
        tenantId,
        queueType,
        depth
      );


    return {
      recorded:
        true,

      executionAuthorized:
        false,
    };
  }


  recordQueueLatency(
    tenantId,
    queueType,
    durationMs
  ) {
    /*
     * Queue latency reaching this method means the queue event
     * was observed as successfully delivered/processed.
     */
    sloService
      .recordQueueDelivery(
        true,
        durationMs
      );


    return {
      tenantId,

      queueType,

      durationMs,

      objective:
        "queueDelivery",

      executionAuthorized:
        false,
    };
  }


  recordQueueDelivery(
    success,
    durationMs =
      0
  ) {
    return sloService
      .recordQueueDelivery(
        success,
        durationMs
      );
  }


  updateDLQSize(
    tenantId,
    size
  ) {
    metricsService
      .updateDLQSize(
        tenantId,
        size
      );


    return {
      recorded:
        true,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // DATABASE
  // ==========================================================================

  recordDBQuery(
    tenantId,
    operation,
    collection,
    durationMs
  ) {
    if (
      Number(
        durationMs
      ) >
      500
    ) {
      metricsService
        .recordSelfError(
          "database",
          `slow_${operation || "query"}`
        );
    }


    return {
      tenantId,

      operation,

      collection,

      durationMs,

      executionAuthorized:
        false,
    };
  }


  updateDBPoolUsage(
    tenantId,
    usageRatio
  ) {
    return {
      tenantId,

      usageRatio,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // KILL SWITCH
  // ==========================================================================

  updateKillSwitchStatus(
    switchName,
    enabled
  ) {
    return {
      switchName,

      enabled:
        Boolean(
          enabled
        ),

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // SECURITY
  // ==========================================================================

  recordXSSSanitization(
    endpoint,
    method
  ) {
    metricsService
      .recordSelfError(
        "sanitization",
        `${method || "unknown"}_${endpoint || "unknown"}`
      );


    return {
      recorded:
        true,

      executionAuthorized:
        false,
    };
  }


  recordSecurityEvent(
    tenantId,
    eventType
  ) {
    metricsService
      .recordIsolationViolation(
        eventType ||
        "security_event"
      );


    return {
      tenantId,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // PHASE 11.13 — DIRECT SLO OBSERVATIONS
  // ==========================================================================

  recordApiReliability(
    success,
    durationMs =
      0
  ) {
    return sloService
      .recordApi(
        success,
        durationMs
      );
  }


  recordDecisionReliability(
    success,
    durationMs =
      0
  ) {
    return sloService
      .recordDecision(
        success,
        durationMs
      );
  }


  recordExecutionReliability(
    success,
    durationMs =
      0
  ) {
    return sloService
      .recordExecution(
        success,
        durationMs
      );
  }


  recordVerificationReliability(
    success,
    durationMs =
      0
  ) {
    return sloService
      .recordVerification(
        success,
        durationMs
      );
  }


  recordQueueDeliveryReliability(
    success,
    durationMs =
      0
  ) {
    return sloService
      .recordQueueDelivery(
        success,
        durationMs
      );
  }


  // ==========================================================================
  // RELIABILITY STATUS
  // ==========================================================================

  getReliabilityStatus() {
    return sloService
      .getStatus();
  }


  evaluateReliability() {
    return sloService
      .evaluateAll();
  }


  getSloDefinitions() {
    return sloService
      .getObjectiveDefinitions();
  }


  // ==========================================================================
  // METRICS
  // ==========================================================================

  async getMetrics() {
    /*
     * Update canonical SLO gauges immediately before scraping.
     */
    const reliability =
      sloService
        .evaluateAll();


    if (
      typeof metricsService
        .updateSloReliability ===
      "function"
    ) {
      metricsService
        .updateSloReliability(
          reliability
        );
    }


    return metricsService
      .getMetrics();
  }


  getMetricsObject() {
    return {
      canonicalMetricsService:
        metricsService,

      reliability:
        sloService
          .getStatus(),

      executionAuthorized:
        false,
    };
  }


  resetMetrics() {
    metricsService
      .reset();
  }


  resetReliability() {
    return sloService
      .reset();
  }
}


let instance =
  null;


function getPrometheusMetricsService() {
  if (
    !instance
  ) {
    instance =
      new PrometheusMetricsService();
  }


  return instance;
}


module.exports = {
  PrometheusMetricsService,

  getPrometheusMetricsService,
};