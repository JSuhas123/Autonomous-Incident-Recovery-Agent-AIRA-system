const { decisionTraceService } = require("../services/core");
const { actionLogService, actionRiskService, circuitBreakerService } = require("../services/execution");
const { queueService, idempotencyService, metricsService, distributedLockService, systemHealthService } = require("../services/infrastructure"); // METRICS WIRING + LOCKING + HEALTH
const { memoryService } = require("../services/learning");
const { auditService, getActionAuditService, getStructuredLoggingService, getPrometheusMetricsService } = require("../services/observability");
const { getQueueService } = queueService;
const IdempotencyService = idempotencyService.IdempotencyService;
const AuditService = auditService;
const ActionLog = require("../models/ActionLog");

let isConsumingActions = false;

async function processActionEvent(message) {
  try {
    const { eventId, correlationId, tenantId, decisionId, action, severity, confidence } = message;

    console.log(`[action-agent] Processing approved action: ${action} | decision: ${decisionId}`);

    // CRITICAL FIX #3: Check if system is in SAFE_MODE (Redis down in multi-instance)
    // If so, block action execution to prevent undefined behavior
    if (!systemHealthService.canExecuteActions()) {
      console.error(
        `[action-agent] CRITICAL: System in SAFE_MODE (${systemHealthService.isSafeMode ? 'Redis unavailable' : 'degraded'}) - action execution BLOCKED`
      );
      await decisionTraceService.updateActionResult(tenantId, decisionId, {
        status: 'BLOCKED',
        reason: 'System in SAFE_MODE - action execution disabled. Restore Redis connectivity and redeploy.',
      });
      message.ack(); // Don't requeue - this is a system-level issue
      return;
    }

    // CRITICAL FIX: Idempotency check must be protected by distributed lock
    // to prevent duplicate execution in multi-instance deployments
    const idempotencyKey = IdempotencyService.generateKey(
      tenantId,
      action,
      correlationId
    );

    // Acquire lock for idempotency check (5 second TTL - quick operation)
    const lockKey = `idempotency-check:${idempotencyKey}`;
    let lock = null;
    
    try {
      lock = await distributedLockService.acquire(lockKey, 5000, 3000);
    } catch (lockError) {
      // Lock acquisition failed - fail safe and let manual review handle
      console.error(`[action-agent] CRITICAL: Failed to acquire idempotency lock: ${lockError.message}`);
      await decisionTraceService.updateActionResult(tenantId, decisionId, {
        status: 'BLOCKED',
        reason: 'Failed to acquire distributed lock - cannot guarantee idempotency'
      });
      message.ack(); // Don't requeue - manual intervention needed
      return;
    }

    try {
      // NOW protected by lock: Check idempotency
      const idempotencyResult = await IdempotencyService.checkIdempotency(idempotencyKey);
      if (idempotencyResult.isDuplicate) {
        console.log(`[action-agent] ✓ Action already executed (duplicate suppressed)`);
        message.ack();
        return;
      }
    } finally {
      // Release lock immediately after check (quick operation)
      if (lock) {
        await lock.release();
      }
    }

    // PHASE 1 SAFETY: KILL SWITCH ENFORCEMENT
    // =========================================
    
    // STEP 1: Check if actions are globally enabled
    const killSwitchManager = require('../config/killSwitches').getKillSwitchManager();
    const confidenceEnforcer = require('../config/confidenceThresholds').getConfidenceEnforcer();
    
    if (!killSwitchManager.areActionsEnabled()) {
      console.log(`[action-agent] ✗ GLOBAL KILL SWITCH ACTIVE - all actions disabled`);
      await decisionTraceService.updateActionResult(tenantId, decisionId, {
        status: 'BLOCKED',
        reason: 'Global kill switch ACTIVE - action execution disabled for safety',
        killSwitchStatus: 'GLOBAL_DISABLED'
      });

      // Log security event
      try {
        const loggingService = getStructuredLoggingService();
        loggingService.logSecurityEvent(tenantId, 'ACTION_BLOCKED_KILL_SWITCH', 
          `Action blocked by global kill switch: ${action}`, 
          { action, decisionId, correlationId });
      } catch (logError) {
        console.warn('[action-agent] Failed to log security event:', logError.message);
      }

      message.ack();
      return;
    }

    // STEP 2: Check if actions are enabled for this tenant
    if (!killSwitchManager.isTenantActionsEnabled(tenantId)) {
      console.log(`[action-agent] ✗ TENANT KILL SWITCH ACTIVE for ${tenantId} - actions disabled`);
      await decisionTraceService.updateActionResult(tenantId, decisionId, {
        status: 'BLOCKED',
        reason: `Tenant kill switch ACTIVE for ${tenantId} - action execution disabled`,
        killSwitchStatus: 'TENANT_DISABLED'
      });

      // Log security event
      try {
        const loggingService = getStructuredLoggingService();
        loggingService.logSecurityEvent(tenantId, 'ACTION_BLOCKED_TENANT_SWITCH', 
          `Action blocked by tenant kill switch: ${action}`, 
          { action, decisionId, correlationId });
      } catch (logError) {
        console.warn('[action-agent] Failed to log security event:', logError.message);
      }

      message.ack();
      return;
    }

    // STEP 3: Check if this specific action type is allowed
    if (!killSwitchManager.isActionAllowed(action)) {
      console.log(`[action-agent] ✗ ACTION TYPE BLOCKED: ${action} - not in allowlist`);
      await decisionTraceService.updateActionResult(tenantId, decisionId, {
        status: 'BLOCKED',
        reason: `Action type '${action}' is blocked and not allowed for execution`,
        killSwitchStatus: 'ACTION_TYPE_BLOCKED'
      });

      // Log security event
      try {
        const loggingService = getStructuredLoggingService();
        loggingService.logSecurityEvent(tenantId, 'ACTION_TYPE_BLOCKED', 
          `Action type '${action}' is blocked`, 
          { action, decisionId, correlationId });
      } catch (logError) {
        console.warn('[action-agent] Failed to log security event:', logError.message);
      }

      message.ack();
      return;
    }

    // STEP 4: Check emergency mode
    if (killSwitchManager.isEmergencyModeActive()) {
      console.log(`[action-agent] ⚠️  EMERGENCY MODE - all decisions require manual review`);
      await decisionTraceService.updateActionResult(tenantId, decisionId, {
        status: 'ESCALATED_TO_HUMAN',
        reason: 'Emergency mode ACTIVE - all actions escalated for manual supervisor review',
        escalationReason: 'emergency_mode'
      });

      // Log security event
      try {
        const loggingService = getStructuredLoggingService();
        loggingService.logSecurityEvent(tenantId, 'EMERGENCY_MODE_ACTIVE', 
          `Action escalated to human due to emergency mode: ${action}`, 
          { action, decisionId, escalationReason: 'emergency_mode' });
      } catch (logError) {
        console.warn('[action-agent] Failed to log security event:', logError.message);
      }

      message.ack();
      return;
    }

    // STEP 5: Enforce confidence thresholds
    const confidenceResult = confidenceEnforcer.evaluateConfidence(confidence || 0.5);
    console.log(`[action-agent] Confidence: ${((confidence || 0.5) * 100).toFixed(1)}% → Tier: ${confidenceResult.tier}`);

    // If confidence is too low, escalate to human review
    if (!confidenceResult.canAutoExecute) {
      console.log(`[action-agent] ⚠️  CONFIDENCE BELOW THRESHOLD - escalating to human review (tier: ${confidenceResult.tier})`);
      await decisionTraceService.updateActionResult(tenantId, decisionId, {
        status: 'ESCALATED_TO_HUMAN',
        reason: `Confidence ${((confidence || 0.5) * 100).toFixed(1)}% below AUTO_EXECUTE threshold (0.85) - escalated for human review`,
        tier: confidenceResult.tier,
        explanation: confidenceResult.explanation
      });

      // Log security event
      try {
        const loggingService = getStructuredLoggingService();
        loggingService.log('warn', 'action_escalated_low_confidence', {
          tenantId,
          actionId: `exec_${Date.now()}`,
          decisionId,
          action,
          confidence: (confidence || 0.5) * 100,
          tier: confidenceResult.tier,
          correlationId
        });
      } catch (logError) {
        console.warn('[action-agent] Failed to log escalation:', logError.message);
      }

      message.ack();
      return;
    }

    // All safety gates passed - proceed to execution
    console.log(`[action-agent] ✓ All safety gates passed - proceeding to execution`);
    
    // STEP 6: Check circuit breaker
    const canExecute = await circuitBreakerService.canExecute(tenantId, action);
    if (!canExecute) {
      // Circuit is OPEN - too many failures
      console.log(`[action-agent] ✗ Circuit breaker OPEN for ${action} - action prevented`);
      await decisionTraceService.updateActionResult(tenantId, decisionId, {
        status: 'SKIPPED',
        reason: 'Circuit breaker OPEN - action prevents cascading failure',
        circuitBreakerStatus: 'OPEN'
      });
      message.ack();
      return;
    }

    // STEP 7: Assess action risk
    const riskAssessment = await actionRiskService.scoreActionRisk({
      action,
      services: message.affectedServices || [],
      severity
    });

    // STEP 8: Update decision trace with risk assessment
    await decisionTraceService.updateActionResult(tenantId, decisionId, {
      actionRisk: riskAssessment
    });

    // STEP 9: Dry-run if required
    if (riskAssessment.dryRunRequired) {
      console.log(`[action-agent] Performing dry-run for ${action} due to high risk`);
      const dryRunResult = await performDryRun(action, message);
      if (!dryRunResult.success) {
        // Dry-run failed - don't execute actual action
        await decisionTraceService.updateActionResult(tenantId, decisionId, {
          status: 'BLOCKED',
          reason: 'Dry-run simulation failed - action not executed'
        });
        await circuitBreakerService.recordFailure(tenantId, action);
        message.ack();
        return;
      }
    }

    // STEP 10: Execute action
    const executionId = `exec_${Date.now()}`;
    console.log(`[action-agent] Executing action: ${action} (${executionId})`);

    const startTime = Date.now();
    let actionOutcome;

    try {
      actionOutcome = await performAction(action, message);
      const duration = Date.now() - startTime;

      // STEP 11: Record success and metrics
      await circuitBreakerService.recordSuccess(tenantId, action);
      
      // Record Prometheus metrics
      try {
        const prometheusMetrics = getPrometheusMetricsService();
        prometheusMetrics.recordActionExecution(
          action,
          duration,
          'success',
          { tenantId, decisionId, confidence, severity }
        );
      } catch (metricsError) {
        console.warn('[action-agent] Prometheus metrics recording failed:', metricsError.message);
      }

      // Record structured log
      try {
        const loggingService = getStructuredLoggingService();
        loggingService.logActionExecution(
          tenantId,
          executionId,
          decisionId,
          action,
          'success',
          { outcome: actionOutcome, durationMs: duration, severity }
        );
      } catch (logError) {
        console.warn('[action-agent] Structured logging failed:', logError.message);
      }

      // Record immutable audit trail
      try {
        const auditService = getActionAuditService();
        await auditService.recordActionExecution(tenantId, {
          actionId: executionId,
          decisionId,
          action,
          parameters: message,
          durationMs: duration,
          result: 'SUCCESS',
          output: actionOutcome
        });
      } catch (auditError) {
        console.warn('[action-agent] Audit trail recording failed:', auditError.message);
      }

      // STEP 7: Update memory with success
      await memoryService.recordSuccess({
        tenantId,
        patternType: message.patternType || 'unknown',
        action,
        recoveryTime: duration,
        outcome: actionOutcome
      });

      // STEP 12: Update decision trace with result
      await decisionTraceService.updateActionResult(tenantId, decisionId, {
        status: 'SUCCESS',
        durationMs: duration,
        outcome: actionOutcome
      });

      // STEP 13: Update memory with learning
      await decisionTraceService.updateMemoryUpdate(tenantId, decisionId, {
        pattern: message.patternType || 'unknown',
        actionTaken: action,
        success: true,
        recoveryTime: duration
      });

      // Record action log
      const actionLog = new ActionLog({
        tenantId,
        actionId: executionId,
        correlationId,
        action,
        executionStatus: 'executed',
        outcome: actionOutcome,
        executedAt: new Date(),
        severity,
        durationMs: duration
      });
      await actionLog.save();

      // Record idempotency
      await IdempotencyService.recordIdempotency(idempotencyKey, {
        action,
        executedAt: new Date(),
        result: { status: 'SUCCESS', outcome: actionOutcome }
      });

      // Audit success (legacy)
      await AuditService.recordEvent(
        tenantId,
        'action.executed',
        {
          eventId,
          correlationId,
          decisionId,
          action,
          outcome: actionOutcome,
          durationMs: duration
        },
        { correlationId }
      );

      // Publish success event
      const queue = await getQueueService();
      await queue.publishEvent(
        queue.topics.ACTION_EXECUTED,
        {
          eventId: `executed-${eventId}`,
          correlationId,
          tenantId,
          decisionId,
          action,
          status: 'SUCCESS',
          outcome: actionOutcome,
          durationMs: duration,
          executedAt: new Date().toISOString()
        },
        { tenantId, correlationId }
      );

      console.log(`[action-agent] ✓ Action ${action} executed successfully (${duration}ms)`);

    } catch (actionError) {
      const duration = Date.now() - startTime;

      // STEP 14: Record failure and metrics
      await circuitBreakerService.recordFailure(tenantId, action);
      
      // Record Prometheus metrics
      try {
        const prometheusMetrics = getPrometheusMetricsService();
        prometheusMetrics.recordActionExecution(
          action,
          duration,
          'failure',
          { tenantId, decisionId, confidence, severity, errorType: actionError.name }
        );
      } catch (metricsError) {
        console.warn('[action-agent] Prometheus metrics recording failed:', metricsError.message);
      }

      // Record structured log
      try {
        const loggingService = getStructuredLoggingService();
        loggingService.logError(
          `Action execution failed: ${action}`,
          actionError,
          { actionId: executionId, decisionId, tenantId, severity }
        );
      } catch (logError) {
        console.warn('[action-agent] Structured logging failed:', logError.message);
      }

      // Record immutable audit trail
      try {
        const auditService = getActionAuditService();
        await auditService.recordActionExecution(tenantId, {
          actionId: executionId,
          decisionId,
          action,
          parameters: message,
          durationMs: duration,
          result: 'FAILURE',
          errorMessage: actionError.message
        });
      } catch (auditError) {
        console.warn('[action-agent] Audit trail recording failed:', auditError.message);
      }

      // STEP 15: Update memory with failure
      await memoryService.recordFailure({
        tenantId,
        patternType: message.patternType || 'unknown',
        action,
        error: actionError.message
      });

      // STEP 16: Update decision trace with failure
      await decisionTraceService.updateActionResult(tenantId, decisionId, {
        status: 'FAILED',
        durationMs: duration,
        error: actionError.message
      });

      // Record failed action log
      const failedLog = new ActionLog({
        tenantId,
        actionId: executionId,
        correlationId,
        action,
        executionStatus: 'failed',
        outcome: actionError.message,
        executedAt: new Date(),
        severity,
        durationMs: duration,
        error: actionError.message
      });
      await failedLog.save();

      // Audit failure (legacy)
      await AuditService.recordEvent(
        tenantId,
        'action.failed',
        {
          eventId,
          correlationId,
          decisionId,
          action,
          error: actionError.message,
          durationMs: duration
        },
        { correlationId }
      );

      throw actionError;
    }

    message.ack();
  } catch (error) {
    console.error("[action-agent] Error processing action event:", error.message);
    message.nack(true); // Requeue on error
  }
}

async function performAction(action, context) {
  // DEPRECATED: All execution must flow through frozen V1 PlaybookExecutionService.
  // This stub records the request and returns MANUAL_REQUIRED for any action
  // that arrives via the legacy queue path.
  const { MANUAL_REASON } = require('../constants/executionOutcomes');
  console.warn(
    `[action-agent] DEPRECATED performAction called for '${action}'. ` +
    'Legacy action path is blocked — route through v2 AgentOrchestrator and frozen V1 instead.'
  );
  return {
    outcome: 'BLOCKED_LEGACY_PATH',
    reason: MANUAL_REASON.LEGACY_PATH_BLOCKED,
    action,
    blockedAt: new Date().toISOString(),
  };
}

async function performDryRun(action, context) {
  // Simulate action without executing
  console.log(`[action-agent] DRY-RUN: Would ${action}`);
  return { success: true, simulation: true };
}

// DEPRECATED: actionAgent queue consumer not started. All execution routes through v2 AgentOrchestrator.
async function startActionAgent() {
  console.warn('[action-agent] DEPRECATED: legacy queue consumer not started. All execution routes through v2 AgentOrchestrator + frozen V1 PlaybookExecutionService.');
}

async function stopActionAgent() {
  isConsumingActions = false;
}

module.exports = {
  processActionEvent,
  startActionAgent,
  stopActionAgent,
};
