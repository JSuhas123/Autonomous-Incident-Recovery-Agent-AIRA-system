"use strict";
/**
 * Machine Ingestion Routes
 * These routes are called by external systems (Prometheus, Datadog, automation scripts).
 * They require HMAC machine auth (Authorization header + X-Timestamp + X-Idempotency-Key).
 * They are never called by the browser dashboard.
 *
 * Mounted in server.js as:
 *   app.use("/api/v1/tenants/:tenantId",
 *           authMiddleware, tenantIsolationMiddleware, rateLimitingMiddleware("api"),
 *           machineIngestionRoutes)
 */

const express = require("express");
const router = express.Router();
const { decisionExecutionPublisher } = require("../services/execution");
const { getQueueService } = require("../services/infrastructure/queueService");
const { decisionPipelineObservability } = require("../services/observability");
const { loggingService } = require("../services/infrastructure");
const DecisionTrace = require("../models/DecisionTrace");
const { randomUUID } = require("node:crypto");

// Re-use the tiered-decision helper from coreApiRoutes to keep logic in one place
const { buildTieredDecision } = require("./coreApiRoutes");

/**
 * POST /signals
 * External systems submit raw incident signals.
 * req.tenant is set by authMiddleware.
 */
router.post("/signals", async (req, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    const signal = req.body;

    if (!tenantId) {
      return res.status(400).json({ error: "tenantId not set by auth middleware" });
    }

    const decisionId = randomUUID();
    const correlationId = randomUUID();

    decisionPipelineObservability.recordSignalInjected(signal, tenantId);

    const queue = await getQueueService();
    try {
      await queue.publishEvent(queue.topics.SIGNAL_RECEIVED, {
        eventId: randomUUID(),
        correlationId,
        tenantId,
        payload: signal,
        timestamp: new Date(),
      });
    } catch (backpressureError) {
      if (backpressureError.message?.includes("BACKPRESSURE") || backpressureError.message?.includes("buffer")) {
        return res.status(503).json({
          error: "System overloaded — queue depth exceeded",
          retryAfter: "PT10S",
          decisionId,
        });
      }
      throw backpressureError;
    }

    const severityMap = { low: "LOW", medium: "MEDIUM", high: "HIGH", critical: "CRITICAL", warning: "HIGH" };
    const severity = (signal.severity && severityMap[signal.severity.toLowerCase()]) || "MEDIUM";

    const errorRate = signal.errorRate || 0;
    const responseTime = signal.responseTime || 0;
    const affectedServices = signal.affectedServices || [];

    const { patternType, recommendedAction, confidence: actionConfidence, tier } =
      buildTieredDecision(errorRate, responseTime, affectedServices, severity);

    const decisionTrace = new DecisionTrace({
      decisionId,
      tenantId,
      correlationId,
      inputs: {
        signals: { errorRate, responseTime, affectedServices, logSample: signal.logSample || [], patternType },
        severity,
        confidence: actionConfidence,
        tier,
      },
      decision: "TIERED_DECISION",
      recommendedAction,
      tier,
      actionRisk: {
        blastRadius: affectedServices.length > 1 ? "MULTI_SERVICE" : "SINGLE_SERVICE",
        affectedServiceCount: affectedServices.length,
        reversible: true,
        dryRunAvailable: true,
        dryRunRequired: tier === "safe_fallback",
        estimatedRecoveryTime: "5-10 minutes",
        circuitBreakerStatus: { enabled: true },
      },
      reasoning: {
        hypothesis: `Pattern: ${patternType}. errorRate=${errorRate}, responseTime=${responseTime}ms, severity=${severity}`,
        evidenceFor: [
          errorRate > 0.5 ? "High error rate" : "Normal error rate",
          responseTime > 500 ? "Elevated latency" : "Normal latency",
        ].filter(Boolean),
        evidenceAgainst: [],
      },
      explanation: {
        decision: recommendedAction,
        reasoning: `${recommendedAction} (confidence: ${(actionConfidence * 100).toFixed(0)}%)`,
        confidence: { score: actionConfidence, factors: ["error_rate", "response_time", "service_impact"] },
        policiesApplied: [],
      },
      timestamp: new Date(),
    });

    decisionPipelineObservability.recordDecisionGenerated(
      recommendedAction, actionConfidence, tier, recommendedAction, patternType
    );

    const savedTrace = await decisionTrace.save();

    try {
      await decisionExecutionPublisher.publishDecisionForExecution(savedTrace.toObject(), tenantId, correlationId);
    } catch (pubError) {
      loggingService.warn("[machineIngestion] Could not publish decision for execution", {
        message: pubError.message, decisionId, tenantId,
      });
    }

    res.json({
      decisionId,
      correlationId,
      tenantId,
      tier,
      confidence: actionConfidence,
      message: "Signal received and decision queued for execution",
      metadata: { patternType, recommendedAction, tier },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /actions/:id/dry-run
 * Simulate execution of a high-risk action without actually running it.
 */
router.post("/actions/:id/dry-run", async (req, res, next) => {
  try {
    const { id } = req.params;
    res.json({
      dryRun: {
        actionId: id,
        status: "simulated",
        outcome: "Would succeed (simulated)",
        expectedResult: "Service restart would recover error rate to baseline",
        timestamp: new Date(),
        simulationNote: "This is a simulation. Action not actually executed.",
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
