const express = require("express");
const router = express.Router();
const { decisionTraceService } = require("../services/core");
const { memoryService } = require("../services/learning");
const { circuitBreakerService } = require("../services/execution");
const { getQueueService } = require("../services/infrastructure/queueService");
const { decisionPipelineObservability } = require("../services/observability");
const { loggingService } = require("../services/infrastructure");
const { randomUUID } = require("node:crypto");

/**
 * Core Decision Loop API Routes
 *
 * Routes focus on the core decision-making loop:
 * - POST /signals - submit raw signals
 * - GET /decisions/:id - inspect decision trace
 * - GET /incidents/:id - inspect incident
 * - GET /actions/:id - inspect action result
 * - POST /actions/:id/dry-run - simulate high-risk action
 * - GET /patterns - view recurring patterns
 * - GET /audit/:id - view audit trail
 * - GET /metrics - system metrics
 */

/**
 * Build tiered decision based on signal characteristics
 * Retrieve full decision trace (primary endpoint for explainability)
 */
router.get("/decisions/:id", async (req, res, next) => {
  try {
    const tenantId = req.tenant?.id; // Use auth middleware's tenant context (same as POST endpoint)
    const { id } = req.params;

    const trace = await decisionTraceService.getTrace(id, tenantId);

    if (!trace) {
      return res.status(404).json({ error: "Decision trace not found" });
    }

    res.json({
      decision: trace,
      explanation: {
        confidence: {
          score: trace.inputs.confidence,
          level:
            trace.inputs.confidence >= 0.8
              ? "HIGH"
              : trace.inputs.confidence >= 0.6
                ? "MEDIUM"
                : "LOW",
          factors: trace.reasoning.confidenceFactors,
        },
        rulesThatFired: trace.rulesTriggered,
        actionChosen: {
          action: trace.recommendedAction,
          reason: trace.reasoning.hypothesis,
          riskAssessment: trace.actionRisk,
        },
        policiesApplied: trace.policyCheck?.checks || [],
        actionResult: trace.actionResult,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/decisions
 * List recent decisions for tenant
 */
router.get("/decisions", async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { limit = 50, action, status } = req.query;

    const filter = {};
    if (action) filter.recommendedAction = action;
    if (status) filter["actionResult.status"] = status;

    const traces = await decisionTraceService.getRecentTraces(
      tenantId,
      Number.parseInt(limit, 10),
      filter
    );

    const summary = await decisionTraceService.getDecisionSummary(tenantId);

    res.json({
      recentDecisions: traces.map((t) => ({
        decisionId: t.decisionId,
        timestamp: t.createdAt,
        action: t.recommendedAction,
        confidence: t.inputs.confidence,
        policyVerdict: t.policyCheck?.verdict,
        actionStatus: t.actionResult?.status,
      })),
      summary,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/incidents/:id
 * Get incident details
 */
router.get("/incidents/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenant?.id;

    // In Phase 1, this would query IncidentEvent model
    // For now, fetch related decision traces
    const traces = await decisionTraceService.searchTraces(tenantId, {
      limit: 10,
    });

    const incident = traces[0]; // Placeholder

    res.json({
      incident: {
        incidentId: id,
        severity: incident?.inputs.severity,
        status: "active",
        affectedServices: incident?.inputs.signals.affectedServices || [],
        detectionTime: incident?.createdAt,
        lastUpdateTime: incident?.updatedAt,
        relatedDecisions: traces.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/actions/:id
 * Get action execution result
 */
router.get("/actions/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenant?.id;

    // Find decision trace with this action
    const traces = await decisionTraceService.searchTraces(tenantId, {
      limit: 1,
    });

    if (!traces.length || !traces[0].actionResult) {
      return res.status(404).json({ error: "Action not found" });
    }

    const actionResult = traces[0].actionResult;

    res.json({
      action: {
        actionId: actionResult.actionId,
        action: actionResult.action,
        status: actionResult.status,
        durationMs: actionResult.durationMs,
        outcome: actionResult.outcome,
        dryRunPerformed: actionResult.dryRunPerformed,
        timestamp: actionResult.timestamp,
        error: actionResult.error,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/patterns
 * View recurring incident patterns and memory
 */
router.get("/patterns", async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    const summary = await memoryService.getSummary(tenantId);

    res.json({
      patterns: summary.patterns.map((p) => {
        const bestAction = Object.entries(p.actionStats || {}).reduce(
          (best, [action, stats]) => {
            if (!best || stats.successRate > best.successRate) {
              return { action, ...stats };
            }
            return best;
          },
          null
        );

        return {
          patternId: p.patternId,
          occurrences: p.totalOccurrences,
          lastSeen: p.lastOccurrence,
          bestResolution: bestAction?.action,
          successRate: bestAction?.successRate,
          avgRecoveryTimeMs: bestAction?.avgRecoveryTimeMs,
          actions: p.actionStats,
        };
      }),
      totalPatterns: summary.totalPatterns,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/audit/:id
 * Retrieve full audit trail for decision
 */
router.get("/audit/:id", async (req, res, next) => {
  try {
    const { tenantId, id } = req.params;

    const trace = await decisionTraceService.getTrace(id, tenantId);

    if (!trace) {
      return res.status(404).json({ error: "Trace not found" });
    }

    res.json({
      auditTrail: {
        decisionId: trace.decisionId,
        correlationId: trace.correlationId,
        events: trace.auditTrail.map((e) => ({
          stage: e.stage,
          timestamp: e.timestamp,
          status: e.status,
        })),
        timeline: [
          {
            event: "decision_made",
            timestamp: trace.createdAt,
            decision: trace.decision,
            reasoning: trace.reasoning.hypothesis,
          },
          ...(trace.policyCheck
            ? [
              {
                event: "policy_checked",
                timestamp: trace.policyCheck.timestamp,
                verdict: trace.policyCheck.verdict,
                rules: trace.policyCheck.checks.length,
              },
            ]
            : []),
          ...(trace.actionResult
            ? [
              {
                event: "action_executed",
                timestamp: trace.actionResult.timestamp,
                status: trace.actionResult.status,
                outcome: trace.actionResult.outcome,
              },
            ]
            : []),
          ...(trace.memoryUpdate
            ? [
              {
                event: "memory_updated",
                timestamp: trace.memoryUpdate.timestamp,
                pattern: trace.memoryUpdate.pattern,
                success: trace.memoryUpdate.successRecorded,
              },
            ]
            : []),
        ],
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/metrics
 * System-level decision metrics
 */
router.get("/metrics", async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    const summary = await decisionTraceService.getDecisionSummary(tenantId);

    res.json({
      metrics: {
        totalDecisions: summary.totalDecisions,
        decisionTypes: summary.byDecisionType,
        actionType: summary.byActionType,
        avgConfidence: (summary.avgConfidence * 100).toFixed(1) + "%",
        policyApprovalRate: (summary.policyApprovalRate * 100).toFixed(1) + "%",
        actionSuccessRate: (summary.successRate * 100).toFixed(1) + "%",
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/circuit-breakers
 * View circuit breaker status
 */
router.get("/circuit-breakers", async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    const statuses = await circuitBreakerService.getStatusAll(tenantId);

    res.json({
      circuitBreakers: statuses,
      totalOpen: statuses.filter((s) => s.status === "OPEN").length,
      totalHalfOpen: statuses.filter((s) => s.status === "HALF_OPEN").length,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
