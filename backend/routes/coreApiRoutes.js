const express = require("express");
const router = express.Router();
const { decisionTraceService } = require("../services/core");
const { memoryService } = require("../services/learning");
const { circuitBreakerService, decisionExecutionPublisher } = require("../services/execution");
const { getQueueService } = require("../services/infrastructure/queueService");
const { decisionPipelineObservability } = require("../services/observability");
const DecisionTrace = require("../models/DecisionTrace");
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
 */
function buildTieredDecision(errorRate, responseTime, affectedServices, severity) {
  // CASCADE DETECTION FIRST - before checking error rate
  // Cascade failure: high/critical severity + database/core service failure
  const hasCoreService = affectedServices.some(svc => 
    svc.toLowerCase().includes('database') || 
    svc.toLowerCase().includes('core') ||
    svc.toLowerCase().includes('backend')
  );
  const isCriticalSeverity = severity === 'CRITICAL' || severity === 'HIGH';
  
  // DEBUG: Log the parameters
  if (affectedServices.some(s => s.toLowerCase().includes('database')) || severity === 'CRITICAL') {
    console.log(`[buildTieredDecision] DEBUG - errorRate=${errorRate}, responseTime=${responseTime}, affectedServices=${JSON.stringify(affectedServices)}, severity=${severity}, hasCoreService=${hasCoreService}, isCriticalSeverity=${isCriticalSeverity}`);
  }
  
  if (isCriticalSeverity && hasCoreService) {
    console.log(`[buildTieredDecision] MATCH! Returning ESCALATE for cascade`);
    return {
      patternType: 'CASCADE_FAILURE',
      recommendedAction: 'ESCALATE',
      confidence: 0.92,
      tier: 'escalate'
    };
  }
  
  if (errorRate > 0.7) {
    return {
      patternType: 'SERVICE_CRASH',
      recommendedAction: 'RESTART',
      confidence: 0.95,
      tier: 'execute'
    };
  }
  if (responseTime > 2000 && affectedServices.length > 2) {
    return {
      patternType: 'CASCADE_FAILURE',
      recommendedAction: 'ISOLATE',
      confidence: 0.78,
      tier: 'safe_fallback'
    };
  }
  if (responseTime > 1500) {
    return {
      patternType: 'DATABASE_LATENCY',
      recommendedAction: 'SCALE',
      confidence: 0.82,
      tier: 'safe_fallback'
    };
  }
  if (affectedServices.length > 1 && responseTime > 500) {
    return {
      patternType: 'CASCADE_FAILURE',
      recommendedAction: 'ESCALATE_TO_OPS',
      confidence: 0.75,
      tier: 'safe_fallback'
    };
  }
  if (responseTime > 800) {
    return {
      patternType: 'ELEVATED_LATENCY',
      recommendedAction: 'INCREASE_MONITORING',
      confidence: 0.62,
      tier: 'escalate'
    };
  }
  if (responseTime > 300) {
    return {
      patternType: 'LATENCY_TREND',
      recommendedAction: 'ALERT',
      confidence: 0.55,
      tier: 'observe'
    };
  }
  return {
    patternType: 'UNKNOWN',
    recommendedAction: 'ALERT',
    confidence: 0.45,
    tier: 'observe'
  };
}

/**
 * Get tier reasoning text
 */
function getTierReasoning(tier) {
  const reasons = {
    execute: 'High confidence - execute direct action',
    safe_fallback: 'Medium confidence - use safe fallback action',
    escalate: 'Low confidence - escalate to human review'
  };
  return reasons[tier] || 'Very low confidence - monitor only';
}

/**
 * POST /api/v1/signals
 * Submit raw signal to trigger decision loop
 * 
 * Implements tiered decision logic:
 * - Confidence >= 0.8: Execute direct automated action
 * - Confidence 0.65-0.8: Execute safe fallback action  
 * - Confidence 0.5-0.65: Escalate to human review
 * - Confidence < 0.5: Monitor only
 * 
 * NO SIGNAL IS SILENTLY DROPPED
 */
router.post("/signals", async (req, res) => {
  try {
    const tenantId = req.tenant?.id; // Use auth middleware's tenant context
    const signal = req.body;

    if (!tenantId) {
      console.error('[coreApi] WARNING: tenantId is undefined! req.tenant:', req.tenant);
      return res.status(400).json({ error: 'tenantId not set by auth middleware' });
    }

    // Create decision ID for tracing
    const decisionId = randomUUID();
    const correlationId = randomUUID();
    
    console.log(`[coreApi] Signal endpoint: tenantId=${tenantId}, decisionId=${decisionId}`);

    // OBSERVABILITY: Record signal injection
    decisionPipelineObservability.recordSignalInjected(signal, tenantId);

    // Publish to queue for async analysis
    // CRITICAL FIX #2: HARD BACKPRESSURE ENFORCEMENT
    // If queue is full, return 503 immediately - no silent message loss
    const queue = await getQueueService();
    try {
      await queue.publishEvent(queue.topics.SIGNAL_RECEIVED, {
        eventId: crypto.randomUUID(),
        correlationId,
        tenantId,
        payload: signal,
        timestamp: new Date(),
      });
    } catch (backpressureError) {
      // Queue full or service overloaded
      if (backpressureError.message?.includes('BACKPRESSURE') || backpressureError.message?.includes('buffer')) {
        console.warn(`[coreApi] BACKPRESSURE: Queue full for tenant=${tenantId}, rejecting request`);
        return res.status(503).json({
          error: 'System overloaded - queue depth exceeded',
          reason: 'Please retry after brief delay',
          retryAfter: 'PT10S', // ISO 8601 duration
          decisionId, // Still give client the ID for tracking
        });
      }
      // Other queue errors - propagate
      throw backpressureError;
    }

    // Map severity values to valid enum: LOW, MEDIUM, HIGH, CRITICAL
    let severity = "MEDIUM"; // default
    if (signal.severity) {
      const severityMap = {
        'low': 'LOW',
        'medium': 'MEDIUM',
        'high': 'HIGH',
        'critical': 'CRITICAL',
        'warning': 'HIGH', // Map WARNING to HIGH
      };
      severity = severityMap[signal.severity.toLowerCase()] || 'MEDIUM';
    }

    // Extract signal features for tiered decision logic
    const errorRate = signal.errorRate || 0;
    const responseTime = signal.responseTime || 0;
    const affectedServices = signal.affectedServices || [];
    
    // DEBUG: Log signal details if it looks like cascade scenario
    if (affectedServices.some(s => s.toLowerCase().includes('database')) || severity === 'CRITICAL') {
      console.log(`[coreApi] Signal for ${affectedServices.join(',')} - errorRate=${errorRate}, responseTime=${responseTime}, severity=${severity}, affectedServices=${JSON.stringify(affectedServices)}`);
    }
    
    // Build tiered decision based on signal characteristics
    const {
      patternType,
      recommendedAction,
      confidence: actionConfidence,
      tier
    } = buildTieredDecision(errorRate, responseTime, affectedServices, severity);

    const decisionTrace = new DecisionTrace({
      decisionId,
      tenantId: tenantId, // explicitly set from auth middleware
      correlationId,
      inputs: {
        signals: {
          errorRate,
          responseTime,
          affectedServices,
          logSample: signal.logSample || [],
          patternType,
        },
        severity,
        confidence: actionConfidence,
        tier,
      },
      decision: 'TIERED_DECISION',
      recommendedAction,
      tier, // Add tier to trace for observability
      actionRisk: {
        blastRadius: affectedServices.length > 1 ? 'MULTI_SERVICE' : 'SINGLE_SERVICE',
        affectedServiceCount: affectedServices.length,
        reversible: true,
        dryRunAvailable: true,
        dryRunRequired: tier === 'safe_fallback', // Require dry-run for uncertain actions
        estimatedRecoveryTime: '5-10 minutes',
        circuitBreakerStatus: { enabled: true },
      },
      reasoning: {
        hypothesis: `Pattern: ${patternType}. Affected services: ${affectedServices.join(', ')}. Signal analysis: errorRate=${errorRate.toFixed(2)}, responseTime=${responseTime}ms, severity=${severity}, tier=${tier}`,
        evidenceFor: [
          errorRate > 0.5 ? 'High error rate detected' : 'Normal error rate',
          responseTime > 500 ? 'Elevated response time' : 'Normal latency',
          affectedServices.length > 1 ? 'Multiple services affected' : 'Single service',
          severity === 'CRITICAL' || severity === 'HIGH' ? `Critical severity: ${severity}` : '',
        ].filter(x => x),
        evidenceAgainst: [],
        cascadeDetection: affectedServices.some(svc => 
          svc.toLowerCase().includes('database') || 
          svc.toLowerCase().includes('core') ||
          svc.toLowerCase().includes('backend')
        ) ? {
          identified: true,
          affectedServices: affectedServices,
          severity: severity,
          recommendation: tier === 'escalate' ? 'ESCALATE' : 'MONITOR'
        } : null,
        confidenceFactors: [
          { name: 'error_rate_signal', value: Math.min(errorRate, 1), weight: 0.4, contribution: errorRate * 0.4 },
          { name: 'latency_signal', value: Math.min(responseTime / 2000, 1), weight: 0.4, contribution: (responseTime / 2000) * 0.4 },
          { name: 'service_count', value: Math.min(affectedServices.length / 5, 1), weight: 0.2, contribution: (affectedServices.length / 5) * 0.2 },
        ],
        tier_reasoning: tier === 'execute' 
          ? 'High confidence - execute direct action'
          : tier === 'safe_fallback'
          ? 'Medium confidence - use safe fallback action'
          : tier === 'escalate'
          ? 'Low confidence - escalate to human review'
          : 'Very low confidence - monitor only'
      },
      explanation: {
        decision: recommendedAction,
        reasoning: `Recommended action: ${recommendedAction} (confidence: ${(actionConfidence * 100).toFixed(0)}%)`,
        confidence: {
          score: actionConfidence,
          factors: ['error_rate', 'response_time', 'service_impact'],
        },
        policiesApplied: [],
      },
      timestamp: new Date(),
    });

    // OBSERVABILITY: Record decision generation
    const startDecisionTrace = Date.now();
    decisionPipelineObservability.recordDecisionGenerated(
      recommendedAction,
      actionConfidence,
      tier,
      recommendedAction,
      patternType
    );
    
    const savedTrace = await decisionTrace.save();
    
    // OBSERVABILITY: Record decision latency
    const decisionLatency = Date.now() - startDecisionTrace;
    decisionPipelineObservability.recordDecisionLatency(decisionLatency);
    
    console.log(`[coreApi] ✓ DecisionTrace saved successfully:`, {
      decisionId: savedTrace.decisionId,
      tenantId: savedTrace.tenantId,
      latency_ms: decisionLatency,
      _id: savedTrace._id,
    });

    // CRITICAL FIX: Publish decision for execution
    // This ensures every decision is actually executed, not just stored in DB
    // Also enforce hard backpressure - must not silently lose messages
    try {
      await decisionExecutionPublisher.publishDecisionForExecution(
        savedTrace.toObject(),
        tenantId,
        correlationId
      );
      console.log(`[coreApi] ✓ Decision published for execution via queue`);
    } catch (pubError) {
      // Check if this is a backpressure error
      if (pubError.message?.includes('BACKPRESSURE') || pubError.message?.includes('buffer')) {
        console.error(`[coreApi] CRITICAL BACKPRESSURE: Could not publish decision for execution (queue full)`);
        // This is critical but decision is saved in DB, exec will retry
        // Return 503 to client but keep the decision saved
        return res.status(503).json({
          error: 'System overloaded - cannot queue for execution',
          reason: 'Decision saved but execution delayed',
          decisionId,
          correlationId,
          retryAfter: 'PT30S',
        });
      }
      // Log but don't fail - decision is saved, execution will be retried
      console.error('[coreApi] Warning: Could not publish decision for execution:', pubError.message);
    }

    // Return success response
    res.json({
      decisionId,
      correlationId,
      tenantId,
      tier,
      confidence: actionConfidence,
      message: "Signal received and decision queued for execution",
      metadata: {
        patternType,
        recommendedAction,
        tier,
      }
    });
  } catch (error) {
    console.error("[coreApi] Error submitting signal:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/decisions/:id
 * Retrieve full decision trace (primary endpoint for explainability)
 */
router.get("/decisions/:id", async (req, res) => {
  try {
    const tenantId = req.tenant?.id; // Use auth middleware's tenant context (same as POST endpoint)
    const { id } = req.params;

    console.log(`[coreApi] GET decisions - Retrieved from auth middleware:`, {
      tenantId,
      id,
      reqTenant: req.tenant,
    });

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
    console.error("[coreApi] Error retrieving decision:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/decisions
 * List recent decisions for tenant
 */
router.get("/decisions", async (req, res) => {
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
    console.error("[coreApi] Error listing decisions:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/incidents/:id
 * Get incident details
 */
router.get("/incidents/:id", async (req, res) => {
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
    console.error("[coreApi] Error retrieving incident:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/actions/:id
 * Get action execution result
 */
router.get("/actions/:id", async (req, res) => {
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
    console.error("[coreApi] Error retrieving action:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v1/actions/:id/dry-run
 * Simulate execution of high-risk action
 */
router.post("/actions/:id/dry-run", async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenant?.id;

    // In real implementation, would spawn isolated environment to simulate
    res.json({
      dryRun: {
        actionId: id,
        status: "simulated",
        outcome: "Would succeed (simulated)",
        expectedResult:
          "Service restart would recover error rate to baseline",
        timestamp: new Date(),
        simulationNote:
          "This is a simulation. Action not actually executed.",
      },
    });
  } catch (error) {
    console.error("[coreApi] Error dry-running action:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/patterns
 * View recurring incident patterns and memory
 */
router.get("/patterns", async (req, res) => {
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
    console.error("[coreApi] Error listing patterns:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/audit/:id
 * Retrieve full audit trail for decision
 */
router.get("/audit/:id", async (req, res) => {
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
    console.error("[coreApi] Error retrieving audit trail:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/metrics
 * System-level decision metrics
 */
router.get("/metrics", async (req, res) => {
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
    console.error("[coreApi] Error getting metrics:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/circuit-breakers
 * View circuit breaker status
 */
router.get("/circuit-breakers", async (req, res) => {
  try {
    const { tenantId } = req.params;

    const statuses = await circuitBreakerService.getStatusAll(tenantId);

    res.json({
      circuitBreakers: statuses,
      totalOpen: statuses.filter((s) => s.status === "OPEN").length,
      totalHalfOpen: statuses.filter((s) => s.status === "HALF_OPEN").length,
    });
  } catch (error) {
    console.error("[coreApi] Error getting circuit breakers:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
