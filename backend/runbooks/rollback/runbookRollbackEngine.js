'use strict';

/**
 * Runbook Rollback Engine — Phase J
 *
 * Executes rollback for a failed runbook execution.
 *
 * Strategies:
 *   REVERSE_STEPS   — execute built-in rollback handlers for completed steps
 *                     in reverse order
 *   EXPLICIT_STEPS  — run designated rollbackConfig.steps[] definitions
 *   NONE            — no rollback (caller acknowledges non-reversibility)
 *
 * Pre-state capture is delegated to action handler capturePreState() hooks
 * (called before each step during normal execution).  The rollback engine
 * receives that pre-state as { stepId → preState } from the execution record.
 */

const { getActionHandlerRegistry } = require('../actions/actionHandlerRegistry');
const {
  RUNBOOK_ROLLBACK_STRATEGY,
  RUNBOOK_FAILURE_POLICY,
} = require('../../constants/runbook');

// ── Types ──────────────────────────────────────────────────────────────────

const ROLLBACK_STEP_STATUS = Object.freeze({
  SUCCEEDED:  'SUCCEEDED',
  FAILED:     'FAILED',
  SKIPPED:    'SKIPPED',
  NO_HANDLER: 'NO_HANDLER',
});

// ── Engine ─────────────────────────────────────────────────────────────────

class RunbookRollbackEngine {
  constructor(options = {}) {
    this._registry = options.actionRegistry || null;
  }

  _getRegistry() {
    return this._registry || getActionHandlerRegistry();
  }

  /**
   * Execute rollback for a failed execution.
   *
   * @param {object} rollbackConfig     - Runbook.rollbackConfig
   * @param {object[]} completedSteps   - Steps that ran BEFORE failure (in execution order)
   * @param {{ [stepId]: preState }} preStates - Captured pre-state map
   * @param {object} resolvedParams     - Resolved parameter map (name → value)
   * @param {object} context            - { executionId, correlationId, tenantId }
   * @returns {Promise<RollbackResult>}
   */
  async rollback(rollbackConfig, completedSteps, preStates = {}, resolvedParams = {}, context = {}) {
    if (!rollbackConfig) {
      return this._skipped('No rollbackConfig present');
    }

    const strategy = rollbackConfig.strategy || RUNBOOK_ROLLBACK_STRATEGY.NONE;

    if (strategy === RUNBOOK_ROLLBACK_STRATEGY.NONE) {
      return this._skipped('Rollback strategy is NONE — non-reversibility acknowledged');
    }

    if (strategy === RUNBOOK_ROLLBACK_STRATEGY.REVERSE_STEPS) {
      return this._reverseSteps(completedSteps, preStates, resolvedParams, rollbackConfig, context);
    }

    if (strategy === RUNBOOK_ROLLBACK_STRATEGY.EXPLICIT_STEPS) {
      return this._explicitSteps(rollbackConfig.steps || [], resolvedParams, context);
    }

    return this._skipped(`Unknown rollback strategy: "${strategy}"`);
  }

  // ── REVERSE_STEPS ─────────────────────────────────────────────────────

  async _reverseSteps(completedSteps, preStates, resolvedParams, rollbackConfig, context) {
    const registry   = this._getRegistry();
    const reversed   = [...completedSteps].reverse();
    const results    = [];
    let   anyFailed  = false;

    for (const step of reversed) {
      const preState = preStates[step.stepId] || null;
      const result   = await this._rollbackStep(step, preState, resolvedParams, registry, context);
      results.push(result);
      if (result.status === ROLLBACK_STEP_STATUS.FAILED) anyFailed = true;
    }

    return {
      strategy:    RUNBOOK_ROLLBACK_STRATEGY.REVERSE_STEPS,
      success:     !anyFailed,
      stepResults: results,
      completedAt: new Date().toISOString(),
    };
  }

  async _rollbackStep(step, preState, resolvedParams, registry, context) {
    const { stepId, type, action } = step;

    const handler = registry.has(type, action) ? registry.getHandler(type, action) : null;

    if (!handler) {
      return {
        stepId,
        status:  ROLLBACK_STEP_STATUS.NO_HANDLER,
        message: `No rollback handler for ${type}/${action}`,
      };
    }

    if (!handler.rollback && !handler.metadata?.reversible) {
      return {
        stepId,
        status:  ROLLBACK_STEP_STATUS.SKIPPED,
        message: `Step ${type}/${action} has no rollback handler and is not marked reversible`,
      };
    }

    if (handler.metadata?.builtinRollback === false && !handler.rollback) {
      return {
        stepId,
        status:  ROLLBACK_STEP_STATUS.SKIPPED,
        message: `No built-in rollback for ${type}/${action} — manual recovery required`,
      };
    }

    // Execute rollback via custom handler.rollback() or by re-applying pre-state
    try {
      const params = _mergeStepParams(step, resolvedParams);

      let rollbackResult;
      if (typeof handler.rollback === 'function') {
        rollbackResult = await handler.rollback(params, preState, context);
      } else {
        // No rollback fn — record skipped
        return {
          stepId,
          status:  ROLLBACK_STEP_STATUS.SKIPPED,
          message: `No rollback function for ${type}/${action}`,
        };
      }

      return {
        stepId,
        status: rollbackResult?.success ? ROLLBACK_STEP_STATUS.SUCCEEDED : ROLLBACK_STEP_STATUS.FAILED,
        result: rollbackResult,
      };
    } catch (err) {
      return {
        stepId,
        status: ROLLBACK_STEP_STATUS.FAILED,
        error:  err.message,
      };
    }
  }

  // ── EXPLICIT_STEPS ────────────────────────────────────────────────────

  async _explicitSteps(steps, resolvedParams, context) {
    const registry  = this._getRegistry();
    const results   = [];
    let   anyFailed = false;

    for (const step of steps) {
      const { stepId, type, action } = step;

      if (!registry.has(type, action)) {
        results.push({
          stepId,
          status:  ROLLBACK_STEP_STATUS.NO_HANDLER,
          message: `No handler for explicit rollback step ${type}/${action}`,
        });
        anyFailed = true;
        continue;
      }

      const handler = registry.getHandler(type, action);
      const params  = _mergeStepParams(step, resolvedParams);

      try {
        const result = await handler.execute(params, context);
        results.push({
          stepId,
          status: result?.success ? ROLLBACK_STEP_STATUS.SUCCEEDED : ROLLBACK_STEP_STATUS.FAILED,
          result,
        });
        if (!result?.success) anyFailed = true;
      } catch (err) {
        results.push({ stepId, status: ROLLBACK_STEP_STATUS.FAILED, error: err.message });
        anyFailed = true;
      }
    }

    return {
      strategy:    RUNBOOK_ROLLBACK_STRATEGY.EXPLICIT_STEPS,
      success:     !anyFailed,
      stepResults: results,
      completedAt: new Date().toISOString(),
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  _skipped(reason) {
    return {
      strategy:    RUNBOOK_ROLLBACK_STRATEGY.NONE,
      success:     true,   // skipped is not a failure
      skipped:     true,
      reason,
      stepResults: [],
      completedAt: new Date().toISOString(),
    };
  }
}

function _mergeStepParams(step, resolvedParams) {
  return { ...resolvedParams, ...(step.params || {}) };
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _engine = null;

function getRunbookRollbackEngine(options) {
  if (!_engine || options) {
    _engine = new RunbookRollbackEngine(options || {});
  }
  return _engine;
}

function resetRunbookRollbackEngine() {
  _engine = null;
}

module.exports = {
  RunbookRollbackEngine,
  getRunbookRollbackEngine,
  resetRunbookRollbackEngine,
  ROLLBACK_STEP_STATUS,
};
