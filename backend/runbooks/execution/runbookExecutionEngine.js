'use strict';

/**
 * Runbook Execution Engine — Phase G/H
 *
 * Orchestrates a complete runbook execution lifecycle:
 *   CREATED → VALIDATING → (WAITING_FOR_APPROVAL) → RUNNING → VERIFYING
 *     → SUCCEEDED | FAILED → ROLLBACK_PENDING → ROLLING_BACK → ROLLED_BACK | ROLLBACK_FAILED
 *     | ESCALATED | CANCELLED
 *
 * Design constraints (enforced):
 * - ONLY action handlers registered in ActionHandlerRegistry may execute
 * - NO shell fallback
 * - Retry/idempotency enforced per handler metadata
 * - Pre-state captured before each step (for rollback)
 * - Deterministic: same inputs always produce same execution plan
 * - Policy checked before execution begins
 * - Approval gate enforced when handler.metadata.requiresConfirmation = true
 */

const { v4: uuidv4 } = require('uuid');

const { getActionHandlerRegistry }          = require('../actions/actionHandlerRegistry');
const { getRunbookParameterResolver }        = require('../parameters/runbookParameterResolver');
const { getRunbookVerificationService }      = require('../verification/runbookVerificationService');
const { getRunbookRollbackEngine }           = require('../rollback/runbookRollbackEngine');
const { computeChecksum, versionRef }        = require('../versioning/runbookVersioning');
const RunbookExecution                       = require('../../models/RunbookExecution');
const {
  EXECUTION_STATUS: STATUS,
} = require('../../models/RunbookExecution');
const {
  RUNBOOK_FAILURE_POLICY,
  RUNBOOK_ROLLBACK_STRATEGY,
} = require('../../constants/runbook');

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_STEP_TIMEOUT_MS = 60_000;
const MAX_RETRY_ATTEMPTS      = 3;

// ── Engine ─────────────────────────────────────────────────────────────────

class RunbookExecutionEngine {
  constructor(options = {}) {
    this._registry     = options.actionRegistry     || null;
    this._paramResolver = options.paramResolver     || null;
    this._verifier      = options.verificationService || null;
    this._rollbackEngine = options.rollbackEngine   || null;
    this._policyEngine  = options.policyEngine      || null;  // injected if available
  }

  _reg()      { return this._registry      || getActionHandlerRegistry(); }
  _resolver() { return this._paramResolver || getRunbookParameterResolver(); }
  _verifier_() { return this._verifier     || getRunbookVerificationService(); }
  _rollback() { return this._rollbackEngine || getRunbookRollbackEngine(); }

  /**
   * Start a runbook execution.
   *
   * @param {object} runbookDef     - Immutable execution definition from RunbookRegistry.getExecutionDefinition()
   * @param {object} executionInput - { explicitInputs, incidentEvidence, alertLabels,
   *                                    humanInput, initiatedBy, correlationId, tenantId,
   *                                    incidentId, approvalId }
   * @returns {Promise<RunbookExecution doc>}
   */
  async execute(runbookDef, executionInput = {}) {
    const executionId   = uuidv4();
    const correlationId = executionInput.correlationId || uuidv4();
    const tenantId      = executionInput.tenantId      || runbookDef.tenantId;
    const checksum      = computeChecksum(runbookDef);
    const ref           = versionRef(runbookDef.runbookId, runbookDef.semver);

    // ── 1. Create execution record ─────────────────────────────────────
    let execution = await RunbookExecution.create({
      executionId,
      correlationId,
      tenantId,
      orgId:           executionInput.orgId,
      incidentId:      executionInput.incidentId,
      runbookId:       runbookDef.runbookId,
      runbookVersion:  runbookDef.semver,
      runbookSnapshot: _sanitizeSnapshot(runbookDef),
      runbookChecksum: checksum,
      versionRef:      ref,
      initiatedBy:     executionInput.initiatedBy || 'api',
      initiatorType:   executionInput.initiatorType || 'api',
      status:          'CREATED',
    });

    try {
      // ── 2. Resolve parameters ──────────────────────────────────────
      execution = await this._setStatus(execution, 'VALIDATING');

      const { resolved, errors: paramErrors } = this._resolver().resolve(
        runbookDef.parameters || [],
        {
          explicitInputs:   executionInput.explicitInputs   || {},
          incidentEvidence: executionInput.incidentEvidence || {},
          alertLabels:      executionInput.alertLabels      || {},
          humanInput:       executionInput.humanInput       || {},
        },
      );

      if (paramErrors.length > 0) {
        return this._fail(execution, 'PARAM_RESOLUTION_FAILED', paramErrors.join('; '));
      }

      // Redact sensitive values before storing
      const storedParams = resolved.map(r => ({
        ...r,
        value:    r.sensitive ? '[REDACTED]' : r.value,
        redacted: r.sensitive,
      }));

      execution = await RunbookExecution.findOneAndUpdate(
        { executionId },
        { $set: { resolvedParameters: storedParams } },
        { new: true },
      ).lean();

      // Build runtime param map (unredacted, for step execution in-memory only)
      const runtimeParams = Object.fromEntries(resolved.map(r => [r.name, r.value]));

      // ── 3. Policy check ─────────────────────────────────────────────
      if (this._policyEngine) {
        const policyDecision = await this._policyEngine.evaluate({
          action:       'runbook:execute',
          runbookId:    runbookDef.runbookId,
          tenantId,
          correlationId,
          risk:         runbookDef.risk,
          lifecycle:    runbookDef.lifecycle,
        });

        await RunbookExecution.updateOne({ executionId }, { $set: { policyDecision } });

        if (!policyDecision.allowed) {
          return this._fail(execution, 'POLICY_DENIED', policyDecision.reason || 'Policy denied execution');
        }
      }

      // ── 4. Approval gate ────────────────────────────────────────────
      const needsApproval = this._executionNeedsApproval(runbookDef, executionInput);
      if (needsApproval && !executionInput.approvalId) {
        execution = await this._setStatus(execution, 'WAITING_FOR_APPROVAL');
        await RunbookExecution.updateOne(
          { executionId },
          { $set: { statusReason: 'Awaiting human approval for high-risk/confirmation-required step' } },
        );
        // Return here — caller must re-submit with approvalId to continue
        return RunbookExecution.findOne({ executionId }).lean();
      }

      if (executionInput.approvalId) {
        await RunbookExecution.updateOne({ executionId }, {
          $set: {
            approvalId:  executionInput.approvalId,
            approver:    executionInput.approver,
            approvedAt:  new Date(),
          },
        });
      }

      // ── 5. Execute steps ────────────────────────────────────────────
      execution = await this._setStatus(execution, 'RUNNING', { startedAt: new Date() });

      const steps         = _orderedSteps(runbookDef);
      const completedSteps = [];
      const preStates      = {};
      let   failedStep     = null;

      for (const step of steps) {
        const result = await this._executeStep(step, runtimeParams, {
          executionId,
          correlationId,
          tenantId,
          stepConfig: step,
        });

        if (result.preState !== undefined) {
          preStates[step.stepId] = result.preState;
        }

        const attempt = {
          stepId:      step.stepId,
          type:        step.type,
          action:      step.action,
          status:      result.status,
          startedAt:   result.startedAt,
          completedAt: result.completedAt,
          durationMs:  result.durationMs,
          output:      result.output,
          preState:    result.preState,
          error:       result.error || null,
          timedOut:    result.timedOut || false,
        };

        await RunbookExecution.updateOne(
          { executionId },
          { $push: { stepAttempts: attempt } },
        );

        if (result.status === 'SUCCEEDED') {
          completedSteps.push({ stepId: step.stepId, type: step.type, action: step.action });
        } else {
          failedStep = step;
          break;
        }
      }

      // ── 6. Handle failure ────────────────────────────────────────────
      if (failedStep) {
        const failurePolicy = runbookDef.failurePolicy || RUNBOOK_FAILURE_POLICY.STOP;
        return this._handleFailure(
          execution, executionId, failedStep, failurePolicy,
          runbookDef.rollbackConfig, completedSteps, preStates, runtimeParams,
          { correlationId, tenantId },
        );
      }

      // ── 7. Verification ──────────────────────────────────────────────
      execution = await this._setStatus(execution, 'VERIFYING');

      const verificationResult = await this._verifier_().verify(
        runbookDef.verification,
        runtimeParams,
        { executionId, correlationId, tenantId },
      );

      await RunbookExecution.updateOne(
        { executionId },
        { $set: { verificationResult } },
      );

      if (!verificationResult.passed && !verificationResult.skipped) {
        return this._handleFailure(
          execution, executionId, null, RUNBOOK_FAILURE_POLICY.STOP,
          runbookDef.rollbackConfig, completedSteps, preStates, runtimeParams,
          { correlationId, tenantId },
          'VERIFICATION_FAILED',
        );
      }

      // ── 8. Success ───────────────────────────────────────────────────
      const completedAt = new Date();
      await RunbookExecution.updateOne({ executionId }, {
        $set: {
          status:      'SUCCEEDED',
          completedAt,
          durationMs:  completedAt - (execution.startedAt || execution.createdAt || completedAt),
        },
      });
      return RunbookExecution.findOne({ executionId }).lean();

    } catch (err) {
      return this._fail(execution, 'UNEXPECTED_ERROR', err.message);
    }
  }

  // ── Step execution ─────────────────────────────────────────────────────

  async _executeStep(step, runtimeParams, context) {
    const registry = this._reg();
    const { type, action } = step;

    if (!registry.has(type, action)) {
      return {
        status:      'FAILED',
        error:       `No registered handler for ${type}/${action}`,
        startedAt:   new Date(),
        completedAt: new Date(),
        durationMs:  0,
      };
    }

    const entry  = registry.getHandler(type, action);
    const params = _mergeStepParams(step, runtimeParams);

    // Validate params
    if (typeof entry.validate === 'function') {
      const validation = entry.validate(params);
      if (!validation.valid) {
        return {
          status:      'FAILED',
          error:       `Parameter validation: ${validation.errors.join('; ')}`,
          startedAt:   new Date(),
          completedAt: new Date(),
          durationMs:  0,
        };
      }
    }

    // Capture pre-state
    let preState = null;
    if (typeof entry.capturePreState === 'function') {
      try {
        preState = await entry.capturePreState(params, context);
      } catch {
        preState = null;
      }
    }

    const timeoutMs  = (step.timeoutSeconds || DEFAULT_STEP_TIMEOUT_MS / 1000) * 1000;
    const maxAttempts = entry.metadata?.retrySafe ? (step.retryPolicy?.maxAttempts || 1) : 1;

    let lastError = null;
    let output    = null;
    let timedOut  = false;

    const startedAt = new Date();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        output = await _withTimeout(
          () => entry.execute(params, { ...context, stepConfig: step }),
          timeoutMs,
          `Step ${step.stepId} timed out after ${timeoutMs}ms`,
        );
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (err.message.includes('timed out')) { timedOut = true; break; }
        if (attempt < maxAttempts) {
          const backoffMs = Math.min(1000 * attempt, 5000);
          await new Promise(r => setTimeout(r, backoffMs));
        }
      }
    }

    const completedAt = new Date();
    const durationMs  = completedAt - startedAt;

    if (lastError) {
      return { status: 'FAILED', error: lastError.message, timedOut, preState, startedAt, completedAt, durationMs };
    }

    const succeeded = output?.success !== false;
    return { status: succeeded ? 'SUCCEEDED' : 'FAILED', output, preState, startedAt, completedAt, durationMs };
  }

  // ── Failure handling ───────────────────────────────────────────────────

  async _handleFailure(
    execution, executionId, failedStep, failurePolicy,
    rollbackConfig, completedSteps, preStates, runtimeParams,
    context, errorCode = 'STEP_FAILED',
  ) {
    await RunbookExecution.updateOne({ executionId }, {
      $set: {
        failedStepId: failedStep?.stepId || null,
        errorCode,
      },
    });

    if (failurePolicy === RUNBOOK_FAILURE_POLICY.ROLLBACK) {
      await this._setStatus(execution, 'ROLLBACK_PENDING');
      await this._setStatus(execution, 'ROLLING_BACK', { rollbackState: { triggeredAt: new Date() } });

      const rollbackResult = await this._rollback().rollback(
        rollbackConfig, completedSteps, preStates, runtimeParams, context,
      );

      const finalStatus = rollbackResult.success ? 'ROLLED_BACK' : 'ROLLBACK_FAILED';
      const completedAt = new Date();
      await RunbookExecution.updateOne({ executionId }, {
        $set: {
          status:       finalStatus,
          completedAt,
          rollbackState: rollbackResult,
        },
      });
    } else if (failurePolicy === RUNBOOK_FAILURE_POLICY.ESCALATE) {
      const completedAt = new Date();
      await RunbookExecution.updateOne({ executionId }, {
        $set: {
          status:           'ESCALATED',
          completedAt,
          escalated:        true,
          escalatedAt:      completedAt,
          escalationReason: 'Failure policy = ESCALATE',
        },
      });
    } else {
      // STOP or CONTINUE
      const completedAt = new Date();
      await RunbookExecution.updateOne({ executionId }, {
        $set: { status: 'FAILED', completedAt },
      });
    }

    return RunbookExecution.findOne({ executionId }).lean();
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  async _setStatus(execution, status, extra = {}) {
    const update = { status, ...extra };
    await RunbookExecution.updateOne({ executionId: execution.executionId }, { $set: update });
    return { ...execution, ...update };
  }

  async _fail(execution, errorCode, errorMessage) {
    const completedAt = new Date();
    await RunbookExecution.updateOne({ executionId: execution.executionId }, {
      $set: { status: 'FAILED', completedAt, errorCode, errorMessage },
    });
    return RunbookExecution.findOne({ executionId: execution.executionId }).lean();
  }

  _executionNeedsApproval(runbookDef, executionInput) {
    if (executionInput.approvalId) return false;  // already approved
    const steps = _orderedSteps(runbookDef);
    const registry = this._reg();
    return steps.some(step => {
      if (step.requiresConfirmation) return true;
      if (!registry.has(step.type, step.action)) return false;
      const handler = registry.getHandler(step.type, step.action);
      return handler.metadata?.requiresConfirmation === true;
    });
  }
}

// ── Utility ────────────────────────────────────────────────────────────────

function _orderedSteps(runbookDef) {
  const steps = runbookDef.steps;
  if (!steps || typeof steps !== 'object') return [];
  if (Array.isArray(steps)) return steps;

  // Object keyed by stepId — sort by key
  return Object.entries(steps)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([stepId, s]) => ({ stepId, ...s }));
}

function _mergeStepParams(step, runtimeParams) {
  return { ...runtimeParams, ...(step.params || {}) };
}

function _sanitizeSnapshot(runbookDef) {
  // Store definition without runtime-volatile fields
  const snap = { ...runbookDef };
  delete snap._id;
  delete snap.__v;
  delete snap.createdAt;
  delete snap.updatedAt;
  return snap;
}

function _withTimeout(fn, ms, msg) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(msg)), ms);
    fn().then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _engine = null;

function getRunbookExecutionEngine(options) {
  if (!_engine || options) {
    _engine = new RunbookExecutionEngine(options || {});
  }
  return _engine;
}

function resetRunbookExecutionEngine() {
  _engine = null;
}

module.exports = {
  RunbookExecutionEngine,
  getRunbookExecutionEngine,
  resetRunbookExecutionEngine,
};
