const { decisionTraceService } = require("../services/core");
const { actionLogService, actionRiskService, circuitBreakerService } = require("../services/execution");
const { confidenceService, memoryService } = require("../services/learning");
const { metricsService } = require("../services/infrastructure"); // METRICS WIRING

const RESTART_COOLDOWN_MS = 90 * 1000;

function getDefaultDecision() {
  return {
    action: "log",
    reason: "Low-risk signal detected. Recording event for future trend analysis.",
    escalationLevel: "normal",
  };
}

function decideHighSeverityAction({ isLatencyIssue, persistentIncident, restartOnCooldown, repeatedIncident }) {
  if (isLatencyIssue && !persistentIncident) {
    return {
      action: "retry",
      reason: "High-latency event detected. Applying retry-first strategy before forcing a restart.",
      escalationLevel: "normal",
    };
  }

  if (restartOnCooldown) {
    return {
      action: "alert",
      reason:
        "High severity detected, but restart cooldown is active. Escalating alert to avoid restart thrashing.",
      escalationLevel: "escalated",
    };
  }

  return {
    action: "restart",
    reason: repeatedIncident
      ? "Repeated high-impact failure detected. Escalating to service restart and alerting operations."
      : "High-severity incident detected. Restarting service to recover stability.",
    escalationLevel: repeatedIncident ? "escalated" : "normal",
  };
}

function decideMediumSeverityAction({ isLatencyIssue, persistentIncident, restartOnCooldown, repeatedIncident }) {
  if (isLatencyIssue && persistentIncident && !restartOnCooldown) {
    return {
      action: "restart",
      reason:
        "Latency issue persisted across several cycles. Escalating from retry strategy to restart.",
      escalationLevel: "escalated",
    };
  }

  return {
    action: "retry",
    reason: repeatedIncident
      ? "Moderate incident has repeated multiple times. Retrying with elevated monitoring."
      : "Moderate anomaly detected. Retrying failed operations as first remediation step.",
    escalationLevel: repeatedIncident ? "escalated" : "normal",
  };
}

async function decideAction(analysisResult, context) {
  const restartCountInCooldown = await actionLogService.getRecentActionCount("restart", RESTART_COOLDOWN_MS);
  const restartOnCooldown = restartCountInCooldown > 0;
  const repeatedIncident = analysisResult.occurrenceCount >= 3;
  const persistentIncident = analysisResult.occurrenceCount >= 5;
  const isLatencyIssue = analysisResult.issueType === "latency";

  const decisionContext = {
    isLatencyIssue,
    persistentIncident,
    restartOnCooldown,
    repeatedIncident,
  };

  let decision = getDefaultDecision();
  if (analysisResult.severity === "high") {
    decision = decideHighSeverityAction(decisionContext);
  } else if (analysisResult.severity === "medium") {
    decision = decideMediumSeverityAction(decisionContext);
  }

  if (repeatedIncident && decision.escalationLevel !== "escalated") {
    decision.escalationLevel = "escalated";
  }

  // Phase 2: Calculate Confidence × Impact tier for enhanced decision-making
  let impactTier = null;
  let impactScore = null;
  let effectivenessData = null;
  let confidenceAdjustment = 0;

  try {
    // Calculate impact score based on service criticality and blast radius
    const tenantId = "default";
    const serviceId = analysisResult.serviceId || "system";
    impactScore = await impactScorerService.calculateImpactScore(
      tenantId,
      serviceId,
      {
        severity: analysisResult.severity,
        occurrenceCount: analysisResult.occurrenceCount,
        affectedServices: analysisResult.affectedServices || [],
        errorRate: analysisResult.errorRate || 0,
      }
    );

    // Get historical effectiveness for the proposed action
    if (analysisResult.serviceId) {
      effectivenessData = await actionEffectivenessService.getActionEffectiveness(
        decision.action,
        analysisResult.severity === "high" ? "critical_incident" : "degradation",
        analysisResult.serviceId
      );
      confidenceAdjustment = effectivenessData?.confidenceAdjustment || 0;
    }

    // Determine decision tier based on confidence and impact
    const adjustedConfidence = Math.min(100, Math.max(0, (analysisResult.confidenceScore || 70) + confidenceAdjustment));
    impactTier = await impactScorerService.calculateConfidenceImpactTier(adjustedConfidence, impactScore);
  } catch (error) {
    console.warn("[decision-agent] Error calculating impact tier, using legacy decision logic:", error.message);
  }

  return {
    ...decision,
    cooldown: {
      restartOnCooldown,
      restartCountInCooldown,
    },
    stateAtDecision: context.state,
    // Phase 2: Enhanced decision metadata
    impactTier,
    impactScore,
    effectivenessData,
    confidenceAdjustment,
    adjustedConfidence: (analysisResult.confidenceScore || 70) + confidenceAdjustment,
  };
}

// Queue service integration
const { getQueueService } = require("../services/infrastructure/queueService");
const { policyEngine } = require("../services/core");
const { auditService, getActionAuditService, getStructuredLoggingService, getPrometheusMetricsService } = require("../services/observability");

// DEPRECATED — replaced by v2 DiagnosisAgent + PlaybookSelectionAgent + PolicyEngine
let isConsumingDecisions = false;

async function processDecisionEvent(message) {
  try {
    const { eventId, correlationId, tenantId, analysis } = message;

    console.log(`[decision-agent] Processing analysis for incident ${eventId}`);

    // STEP 1: Query memory for similar past incidents
    const memory = await memoryService.find({
      tenantId,
      patternType: analysis.patternType || analysis.issueType
    });

    // STEP 2: Compute confidence score with weighted factors
    const analysisResultForConfidence = {
      patternMatch: analysis.occurrenceCount ? Math.min(analysis.occurrenceCount / 5, 1) : 0.3,
      incidentType: analysis.patternType || analysis.issueType || 'unknown',
      severity: analysis.severity || 'MEDIUM',
      patternAge: memory?.stats?.ageHours || 24,
      errorRate: analysis.errorRate || 0,
      responseTime: analysis.responseTime || 0
    };
    
    const confidence = await confidenceService.calculateConfidence(
      analysisResultForConfidence,
      memoryService,
      true // policyMatch - will be updated by policy agent
    );

    // STEP 3: Detect cascade failures and assess action risk
    // Cascade detection: high severity + database/core service = potential cascade
    const isCascadeFailure = 
      (analysis.severity === 'high' || analysis.severity === 'critical') && 
      (analysis.affectedServices?.some(svc => 
        svc.toLowerCase().includes('database') || 
        svc.toLowerCase().includes('core') ||
        svc.toLowerCase().includes('backend')
      ) || false);
    
    if (isCascadeFailure) {
      console.log(`[decision-agent] Cascade detection triggered: severity=${analysis.severity}, services=${analysis.affectedServices?.join(', ')}`);
    }
    
    // Build possible actions based on context
    let possibleActions = ['restart', 'scale-replicas', 'cache-invalidation'];
    
    // Add ESCALATE as primary action for cascade failures
    if (isCascadeFailure) {
      possibleActions.unshift('escalate');
    }
    
    const alternatives = [];

    for (const action of possibleActions) {
      const risk = await actionRiskService.scoreActionRisk({
        action,
        services: analysis.affectedServices || [],
        severity: analysis.severity
      });

      // Lower risk score for escalate action (safe, manual intervention)
      const riskScore = action === 'escalate' ? 0.1 : risk.baseRisk;
      const expectedSuccess = action === 'escalate' ? 0.95 : (memory?.actions?.[action]?.successRate || 0.5);

      alternatives.push({
        action,
        riskScore: riskScore,
        expectedSuccess: expectedSuccess,
        blastRadius: action === 'escalate' ? 'none (manual)' : (risk.blastRadius?.description || 'unknown'),
        reversible: action === 'escalate' ? true : risk.isReversible,
        estimatedRecoveryTime: action === 'escalate' ? 300000 : risk.estimatedRecoveryTime
      });
    }

    // STEP 4: Choose best action based on memory + risk
    const chosenAction = alternatives.reduce((best, current) => {
      const score = (current.expectedSuccess * 0.7) - (current.riskScore * 0.3);
      const bestScore = (best.expectedSuccess * 0.7) - (best.riskScore * 0.3);
      return score > bestScore ? current : best;
    });

    // Log cascade detection and action choice
    if (isCascadeFailure) {
      console.log(`[decision-agent] CASCADE DETECTED: services=${analysis.affectedServices?.join(',')}, chosen_action=${chosenAction.action}, confidence=${confidence.score}`);
    }

    // STEP 5: Create decision trace (full reasoning captured)
    const decisionTrace = await decisionTraceService.createTrace({
      tenantId,
      correlationId,
      inputs: {
        signals: {
          errorRate: analysis.errorRate,
          responseTime: analysis.responseTime,
          affectedServices: analysis.affectedServices
        },
        severity: analysis.severity,
        confidence: confidence.score,
        cascadeDetected: isCascadeFailure,
        incidentMemory: {
          previousOccurrences: memory?.occurrences?.length || 0,
          lastResolution: memory?.recommendedAction,
          successRate: memory?.stats?.successRate,
          pattern: analysis.patternType || analysis.issueType
        }
      },
      reasoning: {
        hypothesis: `${analysis.issue || 'Service anomaly'} on ${analysis.affectedServices?.join(', ') || 'unknown'} - Severity: ${analysis.severity}${isCascadeFailure ? ' - CASCADE DETECTED' : ''}`,
        cascadeDetection: isCascadeFailure ? {
          identified: true,
          rootCause: analysis.affectedServices?.find(svc => 
            svc.toLowerCase().includes('database') || 
            svc.toLowerCase().includes('core')
          ) || 'unknown',
          affectedServices: analysis.affectedServices,
          recommendation: 'ESCALATE to human operators'
        } : null,
        evidenceFor: [
          `Error rate: ${(analysis.errorRate * 100).toFixed(1)}%`,
          `Response time: ${analysis.responseTime}ms`,
          `Occurrences: ${analysis.occurrenceCount || 1} times`,
          ...(isCascadeFailure ? [`Cascade failure detected in: ${analysis.affectedServices?.join(', ')}`] : [])
        ],
        confidenceFactors: confidence.factors
      },
      rulesTriggered: [
        {
          rule: 'severity_threshold',
          condition: `severity >= ${analysis.severity}`,
          result: analysis.severity === 'high' || analysis.severity === 'critical'
        },
        {
          rule: 'confidence_gate',
          condition: 'confidence > 0.65',
          result: confidence.score > 0.65
        },
        {
          rule: 'cascade_failure_detection',
          condition: 'critical severity + core service failure',
          result: isCascadeFailure,
          action: isCascadeFailure ? 'ESCALATE' : 'PROCEED_WITH_ACTION'
        }
      ],
      alternatives: alternatives.map(alt => ({
        ...alt,
        status: alt.action === chosenAction.action ? 'CHOSEN' : 'REJECTED',
        reason: alt.action === chosenAction.action
          ? `High success rate in memory (${(alt.expectedSuccess * 100).toFixed(0)}%)`
          : `Lower expected success rate (${(alt.expectedSuccess * 100).toFixed(0)}%)`
      })),
      decision: confidence.score > 0.65 ? 'EXECUTE_ACTION' : 'ALERT_HUMAN',
      recommendedAction: chosenAction.action
    });

    // STEP 6: Record decision metrics
    // Record Prometheus metrics
    const decisionStartTime = Date.now();
    try {
      const prometheusMetrics = getPrometheusMetricsService();
      prometheusMetrics.recordDecisionLatency(
        decisionStartTime,
        confidence.score,
        analysis.severity,
        { tenantId, patternType: analysis.patternType, issueType: analysis.issueType }
      );
    } catch (metricsError) {
      console.warn('[decision-agent] Prometheus metrics recording failed:', metricsError.message);
    }

    // Record structured log
    try {
      const loggingService = getStructuredLoggingService();
      loggingService.logDecision(
        tenantId,
        decisionTrace.decisionId,
        chosenAction.action,
        confidence.score,
        'MADE',
        {
          severity: analysis.severity,
          patternType: analysis.patternType,
          confidence: confidence.score,
          correlationId
        }
      );
    } catch (logError) {
      console.warn('[decision-agent] Structured logging failed:', logError.message);
    }

    // Record immutable audit trail for decision
    try {
      const auditService = getActionAuditService();
      await auditService.recordDecision(tenantId, {
        decisionId: decisionTrace.decisionId,
        correlationId,
        action: chosenAction.action,
        confidence: confidence.score,
        tier: confidence.score > 0.85 ? 'AUTO_EXECUTE' : (confidence.score > 0.60 ? 'ESCALATE' : 'OBSERVE'),
        policiesApplied: policyTrace.appliedRules || [],
        context: {
          severity: analysis.severity,
          patternType: analysis.patternType,
          errorRate: analysis.errorRate,
          responseTime: analysis.responseTime
        }
      });
    } catch (auditError) {
      console.warn('[decision-agent] Audit trail recording failed:', auditError.message);
    }

    // STEP 7: Evaluate decision against tenant policies - FIX #3: WIRE POLICY VERSIONING
    // CRITICAL FIX: Policy evaluation was defined but never called - now integrated
    // This ensures every decision is validated against the tenant's policies with proper versioning
    // FIX #5: POLICY EVALUATION TRY/CATCH - Wrap policy eval with error handling and fallback to DENIED
    let policyTrace = {
      verdict: 'APPROVED',
      reason: ['Policy evaluation skipped due to error'],
      appliedRules: [],
      policyVersionId: 'none',
      timestamp: new Date(),
    };

    try {
      // Evaluate policy with current tenant's policy version
      policyTrace = await policyEngine.evaluatePolicy(
        decisionTrace,
        { tenantId } // Pass tenantId to fetch and use correct policy version
      );

      // Validate policy trace has required fields
      if (!policyTrace || !policyTrace.verdict) {
        throw new Error('Policy evaluation returned invalid trace (missing verdict)');
      }

      // Track policy evaluation metrics using Prometheus
      try {
        const prometheusMetrics = getPrometheusMetricsService();
        prometheusMetrics.recordSecurityEvent(
          'DECISION_APPROVED',
          { tenantId, policyVersion: policyTrace.policyVersionId }
        );
      } catch (metricsError) {
        console.warn('[decision-agent] Failed to record policy approval metric:', metricsError.message);
      }

      console.log(
        `[decision-agent] ✓ Policy evaluation: ${policyTrace.verdict} (version=${policyTrace.policyVersionId}, rules=${policyTrace.appliedRules?.length || 0})`
      );
    } catch (policyError) {
      // FIX #5: On policy evaluation error, fallback to DENIED verdict to prevent dangerous actions
      console.error(
        `[decision-agent] CRITICAL: Policy evaluation failed for tenant=${tenantId}, falling back to DENIED verdict:`,
        policyError.message
      );

      // Set conservative fallback: DENIED verdict prevents execution
      policyTrace = {
        verdict: 'DENIED',
        reason: [`Policy evaluation failed: ${policyError.message}`, 'Falling back to DENIED for safety'],
        appliedRules: [],
        policyVersionId: 'error-fallback',
        timestamp: new Date(),
        errorDetails: {
          originalError: policyError.message,
          fallbackApplied: true,
          reason: 'Unsafe to execute action when policy cannot be evaluated',
        },
      };

      // Track the policy error in metrics and logging
      try {
        const prometheusMetrics = getPrometheusMetricsService();
        prometheusMetrics.recordSecurityEvent(
          'DECISION_DENIED',
          { tenantId, reason: 'policy_evaluation_failed' }
        );
        
        const loggingService = getStructuredLoggingService();
        loggingService.logSecurityEvent(
          tenantId,
          'POLICY_EVALUATION_FAILED',
          `Policy evaluation failed for decision: ${policyError.message}`,
          { correlationId, severity: 'high' }
        );
      } catch (metricsError) {
        console.warn('[decision-agent] Failed to record policy error metrics:', metricsError.message);
      }
    }

    // Attach policy trace to decision for auditability
    decisionTrace.policyEvaluation = policyTrace;

    // CRITICAL FIX: Persist policy check to database with proper versioning
    // Store policyVersionId and policySnapshot for reproducibility
    try {
      await decisionTraceService.updatePolicyCheck(
        decisionTrace.decisionId,
        {
          policyVersionId: policyTrace.policyVersionId,
          policyVersion: policyTrace.policyVersion,
          policySnapshot: policyTrace.policySnapshot, // Full immutable copy for replay
          verdict: policyTrace.verdict,
          checks: policyTrace.checks || [],
          reason: policyTrace.reason || [],
        }
      );
      console.log(`[decision-agent] ✓ Policy check persisted (version=${policyTrace.policyVersionId})`);
    } catch (updateError) {
      console.error(`[decision-agent] ⚠️  Failed to persist policy check: ${updateError.message}`);
      // Don't fail the entire decision flow if DB update fails
    }

    // STEP 8: Publish event for action agent
    const queue = await getQueueService();
    await queue.publishEvent(
      queue.topics.DECISION_PROPOSED,
      {
        decisionId: decisionTrace.decisionId,
        eventId: `decision-${eventId}`,
        correlationId,
        tenantId,
        decision: decisionTrace.decision,
        recommendedAction: chosenAction.action,
        confidence: confidence.score,
        severity: analysis.severity,
        policyVersionId: policyTrace.policyVersionId, // Pass version ID for audit trail
      },
      { tenantId, correlationId }
    );

    console.log(`[decision-agent] ✓ Decision made: ${decisionTrace.decisionId}, Action: ${chosenAction.action}, Confidence: ${(confidence.score * 100).toFixed(1)}%`);
    message.ack();
  } catch (error) {
    console.error("[decision-agent] Error processing decision event:", error.message);
    message.nack(true); // Requeue on error
  }
}

// DEPRECATED: legacy queue consumer not started. v2 PlaybookSelectionAgent handles this.
async function startDecisionAgent() {
  console.warn('[decision-agent] DEPRECATED: legacy queue consumer not started. Use v2 AgentOrchestrator.');
}

async function stopDecisionAgent() {
  isConsumingDecisions = false;
}

module.exports = {
  decideAction,
  startDecisionAgent,
  stopDecisionAgent,
};
