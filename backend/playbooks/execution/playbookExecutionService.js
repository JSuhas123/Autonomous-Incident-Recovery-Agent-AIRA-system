'use strict';

/**
 * Playbook Execution Service
 *
 * Orchestrates playbook execution by chaining runbook executions through
 * the RunbookExecutionEngine.
 *
 * Architecture invariant:
 *   PlaybookExecutionService → PlaybookRegistry → PlaybookParameterMapper
 *                           → RunbookRegistry → RunbookExecutionEngine
 *                                            → ActionHandlerRegistry
 *
 * This service NEVER calls infrastructure directly.
 * It NEVER calls the ActionHandlerRegistry directly.
 * All infrastructure execution flows through RunbookExecutionEngine.
 */

const { v4: uuidv4 } = require('uuid');
const {
  PLAYBOOK_EXECUTION_STATUS,
  STAGE_EXECUTION_STATUS,
  PLAYBOOK_LIFECYCLE,
  PLAYBOOK_STAGE_TYPE,
  PLAYBOOK_FAILURE_POLICY,
  PLAYBOOK_ROLLBACK_STRATEGY,
} = require('../../constants/playbook');

const { getPlaybookRegistry }         = require('../registry/playbookRegistry');
const { mapParameters }               = require('../parameters/playbookParameterMapper');
const { computePlaybookChecksum, playbookVersionRef } = require('../versioning/playbookVersioning');
const { getRunbookRegistry }          = require('../../runbooks/registry/runbookRegistry');
const { getRunbookExecutionEngine }   = require('../../runbooks/execution/runbookExecutionEngine');

// ── Execution service ──────────────────────────────────────────────────────

class PlaybookExecutionService {
  constructor(options = {}) {
    this._playbookRegistry = options.playbookRegistry || getPlaybookRegistry();
    this._runbookRegistry  = options.runbookRegistry  || getRunbookRegistry();
    this._executionEngine  = options.executionEngine  || getRunbookExecutionEngine();
  }

  /**
   * Execute a playbook for a given incident context.
   *
   * @param {string} playbookId
   * @param {string} semver
   * @param {object} incidentContext - evidence, signal data, etc.
   * @param {object} options         - { tenantId, orgId, incidentId, correlationId, initiatedBy, dryRun }
   * @returns {object} Execution record
   */
  async execute(playbookId, semver, incidentContext = {}, options = {}) {
    const executionId   = uuidv4();
    const correlationId = options.correlationId || uuidv4();
    const startedAt     = Date.now();

    const record = _createRecord(executionId, correlationId, playbookId, semver, options);

    try {
      // ── Load playbook definition (must be ACTIVE) ──────────────────────────
      record.status = PLAYBOOK_EXECUTION_STATUS.EVALUATING;

      const playbookDef = await this._playbookRegistry.getExecutionDefinition(
        playbookId,
        semver,
        options.tenantId,
      );

      record.playbookSnapshot = playbookDef;
      record.playbookChecksum = playbookDef.checksum || computePlaybookChecksum(playbookDef);
      record.versionRef       = playbookVersionRef(playbookId, semver);

      // ── Policy check ───────────────────────────────────────────────────────
      const policyDecision = _evaluatePolicy(playbookDef, incidentContext, options);
      record.policyDecision = policyDecision;

      if (policyDecision.denied) {
        record.status      = PLAYBOOK_EXECUTION_STATUS.FAILED;
        record.errorCode   = 'POLICY_DENIED';
        record.errorMessage = policyDecision.reason;
        _setOutcome(record, false, Date.now() - startedAt, policyDecision.reason);
        return record;
      }

      // ── Approval gate ──────────────────────────────────────────────────────
      if (_requiresApproval(playbookDef, policyDecision)) {
        record.status = PLAYBOOK_EXECUTION_STATUS.WAITING_FOR_APPROVAL;
        return record;
      }

      // ── Execute stages ─────────────────────────────────────────────────────
      record.status    = PLAYBOOK_EXECUTION_STATUS.RUNNING;
      record.startedAt = new Date();

      const sortedStages = [...playbookDef.stages].sort((a, b) => a.order - b.order);
      let lastFailedStage = null;

      for (const stage of sortedStages) {
        // Skip rollback/escalation stages during normal execution
        if (stage.type === PLAYBOOK_STAGE_TYPE.ROLLBACK && !record._inRollback) continue;
        if (stage.type === PLAYBOOK_STAGE_TYPE.ESCALATION && !record._inEscalation) continue;

        const stageRecord = _createStageRecord(stage);
        record.stageExecutions.push(stageRecord);

        await this._executeStage(stageRecord, stage, incidentContext, playbookDef, options);

        if (stageRecord.status === STAGE_EXECUTION_STATUS.FAILED) {
          lastFailedStage = stage;

          // Apply failure policy
          const policy = stage.failurePolicy || PLAYBOOK_FAILURE_POLICY.STOP;

          if (policy === PLAYBOOK_FAILURE_POLICY.STOP) {
            record.status        = PLAYBOOK_EXECUTION_STATUS.FAILED;
            record.failedStageId = stage.id;
            record.errorMessage  = stageRecord.error;
            break;
          }

          if (policy === PLAYBOOK_FAILURE_POLICY.ROLLBACK) {
            record.status = PLAYBOOK_EXECUTION_STATUS.ROLLBACK_PENDING;
            break;
          }

          if (policy === PLAYBOOK_FAILURE_POLICY.ESCALATE) {
            record.status = PLAYBOOK_EXECUTION_STATUS.ESCALATED;
            await this._triggerEscalation(record, playbookDef, stage, options);
            break;
          }

          if (policy === PLAYBOOK_FAILURE_POLICY.SKIP) {
            stageRecord.status      = STAGE_EXECUTION_STATUS.SKIPPED;
            stageRecord.skipped     = true;
            stageRecord.skippedReason = `Skipped after failure (policy: SKIP)`;
            continue;
          }

          if (policy === PLAYBOOK_FAILURE_POLICY.CONTINUE) {
            continue;
          }
        }
      }

      // ── Rollback if needed ─────────────────────────────────────────────────
      if (record.status === PLAYBOOK_EXECUTION_STATUS.ROLLBACK_PENDING) {
        await this._executeRollback(record, playbookDef, incidentContext, options, startedAt);
      } else if (record.status === PLAYBOOK_EXECUTION_STATUS.RUNNING) {
        // ── Verification pass ────────────────────────────────────────────────
        record.status = PLAYBOOK_EXECUTION_STATUS.VERIFYING;

        const verifyStages = sortedStages.filter(s => s.type === PLAYBOOK_STAGE_TYPE.VERIFICATION);
        for (const vs of verifyStages) {
          const vr = _createStageRecord(vs);
          record.stageExecutions.push(vr);
          await this._executeStage(vr, vs, incidentContext, playbookDef, options);
        }

        record.status = PLAYBOOK_EXECUTION_STATUS.SUCCEEDED;
        _setOutcome(record, true, Date.now() - startedAt, null);
      }

    } catch (err) {
      record.status       = PLAYBOOK_EXECUTION_STATUS.FAILED;
      record.errorMessage = err.message;
      record.errorCode    = err.code || 'EXECUTION_ERROR';
      _setOutcome(record, false, Date.now() - startedAt, err.message);
    }

    record.completedAt = new Date();
    record.durationMs  = Date.now() - startedAt;

    return record;
  }

  // ── Stage execution ─────────────────────────────────────────────────────

  async _executeStage(stageRecord, stage, incidentContext, playbookDef, options) {
    stageRecord.status    = STAGE_EXECUTION_STATUS.RUNNING;
    stageRecord.startedAt = new Date();

    const stageStart = Date.now();

    try {
      const runbooks = stage.runbooks || [];

      for (let i = 0; i < runbooks.length; i++) {
        const ref  = runbooks[i];
        const rbId = ref.runbookId;

        // Resolve runbook version
        const rbVersion = await this._resolveRunbookVersion(rbId, ref.versionConstraint, options.tenantId);

        // Map parameters for this runbook
        const rbDef = await this._runbookRegistry.getVersion(rbId, rbVersion, options.tenantId);
        const { mapped, missing } = mapParameters(
          ref.parameterMappings || {},
          {
            incident:     incidentContext,
            signal:       incidentContext.signal,
            context:      options.context || {},
            evidence:     incidentContext.evidence || {},
            service:      incidentContext.service || {},
            constants:    options.constants || {},
            stage_output: _collectStageOutputs(stageRecord),
          },
          rbDef.parameters || [],
        );

        if (missing.length > 0) {
          // Check if any missing params are required
          const required = rbDef.parameters?.filter(p => p.required && missing.includes(p.name)) || [];
          if (required.length > 0) {
            stageRecord.status = STAGE_EXECUTION_STATUS.FAILED;
            stageRecord.error  = `Missing required parameters for runbook ${rbId}: ${required.map(p => p.name).join(', ')}`;
            return;
          }
        }

        // Execute via RunbookExecutionEngine (NEVER call ActionHandlerRegistry directly)
        const rbExecResult = await this._executionEngine.execute(
          rbId,
          rbVersion,
          mapped,
          {
            tenantId:      options.tenantId,
            correlationId: options.correlationId,
            initiatedBy:   options.initiatedBy,
            incidentId:    options.incidentId,
            dryRun:        options.dryRun,
          },
        );

        const rbRef = {
          runbookId:      rbId,
          runbookVersion: rbVersion,
          executionId:    rbExecResult.executionId,
          status:         rbExecResult.status,
          startedAt:      rbExecResult.startedAt,
          completedAt:    rbExecResult.completedAt,
          durationMs:     rbExecResult.durationMs,
          mappedParams:   _redactMappedParams(mapped, rbDef.parameters || []),
          output:         rbExecResult.output || null,
          error:          rbExecResult.errorMessage || null,
        };

        stageRecord.runbookExecutions.push(rbRef);

        // Check runbook execution status
        if (['FAILED', 'ROLLBACK_FAILED', 'ESCALATED'].includes(rbExecResult.status)) {
          const rbRequired = ref.required !== false;
          if (rbRequired) {
            stageRecord.status = STAGE_EXECUTION_STATUS.FAILED;
            stageRecord.error  = `Runbook ${rbId} failed: ${rbExecResult.errorMessage || rbExecResult.status}`;
            return;
          }
          // optional runbook — log but continue
        }
      }

      stageRecord.status      = STAGE_EXECUTION_STATUS.SUCCEEDED;
      stageRecord.completedAt = new Date();
      stageRecord.durationMs  = Date.now() - stageStart;

    } catch (err) {
      stageRecord.status      = STAGE_EXECUTION_STATUS.FAILED;
      stageRecord.error       = err.message;
      stageRecord.completedAt = new Date();
      stageRecord.durationMs  = Date.now() - stageStart;
    }
  }

  // ── Rollback ────────────────────────────────────────────────────────────

  async _executeRollback(record, playbookDef, incidentContext, options, startedAt) {
    const strategy = playbookDef.rollback?.strategy || PLAYBOOK_ROLLBACK_STRATEGY.NONE;

    if (strategy === PLAYBOOK_ROLLBACK_STRATEGY.NONE) {
      record.status = PLAYBOOK_EXECUTION_STATUS.FAILED;
      _setOutcome(record, false, Date.now() - startedAt, 'Stage failed, no rollback configured');
      return;
    }

    record.status = PLAYBOOK_EXECUTION_STATUS.ROLLING_BACK;
    record._inRollback = true;

    const rollbackRecord = {
      strategy,
      triggeredAt: new Date(),
      success: false,
      reason: null,
      stageResults: [],
    };

    try {
      if (strategy === PLAYBOOK_ROLLBACK_STRATEGY.STAGE_ROLLBACK) {
        const rollbackStageIds = playbookDef.rollback?.stages || [];
        const sortedStages     = [...(playbookDef.stages || [])].sort((a, b) => b.order - a.order);
        const rollbackStages   = rollbackStageIds.length > 0
          ? rollbackStageIds.map(id => playbookDef.stages.find(s => s.id === id)).filter(Boolean)
          : sortedStages.filter(s => s.type === PLAYBOOK_STAGE_TYPE.ROLLBACK);

        for (const stage of rollbackStages) {
          const sr = _createStageRecord(stage);
          record.stageExecutions.push(sr);
          await this._executeStage(sr, stage, incidentContext, playbookDef, options);
          rollbackRecord.stageResults.push({ stageId: stage.id, status: sr.status });
        }
      }

      rollbackRecord.completedAt = new Date();
      rollbackRecord.success     = true;
      record.rollback            = rollbackRecord;
      record.status              = PLAYBOOK_EXECUTION_STATUS.ROLLED_BACK;
      _setOutcome(record, false, Date.now() - startedAt, 'Execution rolled back');

    } catch (err) {
      rollbackRecord.completedAt = new Date();
      rollbackRecord.success     = false;
      rollbackRecord.reason      = err.message;
      record.rollback            = rollbackRecord;
      record.status              = PLAYBOOK_EXECUTION_STATUS.ROLLBACK_FAILED;
      _setOutcome(record, false, Date.now() - startedAt, `Rollback failed: ${err.message}`);
    }
  }

  // ── Escalation ──────────────────────────────────────────────────────────

  async _triggerEscalation(record, playbookDef, failedStage, options) {
    record.escalation = {
      triggered:   true,
      triggeredAt: new Date(),
      reason:      `Stage "${failedStage.id}" failed with ESCALATE policy`,
      escalatedTo: playbookDef.escalation?.escalateTo || null,
      notified:    false,
      channels:    playbookDef.escalation?.notifyChannels || [],
    };
  }

  // ── Runbook version resolution ──────────────────────────────────────────

  async _resolveRunbookVersion(runbookId, constraint, tenantId) {
    if (constraint && constraint !== '') {
      return constraint.replace(/^[>=~]/, '');
    }
    // Latest
    const latest = await this._runbookRegistry.getLatestVersion(runbookId, tenantId);
    if (!latest) throw new Error(`Runbook "${runbookId}" not found`);
    return latest.semver;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function _createRecord(executionId, correlationId, playbookId, semver, options) {
  return {
    executionId,
    correlationId,
    playbookId,
    playbookVersion:  semver,
    playbookSnapshot: null,
    playbookChecksum: null,
    versionRef:       null,
    incidentContext:  options.incidentContext || null,
    tenantId:         options.tenantId        || null,
    orgId:            options.orgId           || null,
    incidentId:       options.incidentId      || null,
    initiatedBy:      options.initiatedBy     || null,
    initiatorType:    options.initiatorType   || 'api',
    status:           PLAYBOOK_EXECUTION_STATUS.CREATED,
    statusReason:     null,
    startedAt:        null,
    completedAt:      null,
    durationMs:       null,
    policyDecision:   null,
    approval:         null,
    stageExecutions:  [],
    rollback:         null,
    escalation:       null,
    outcome:          null,
    failedStageId:    null,
    errorMessage:     null,
    errorCode:        null,
    auditEventIds:    [],
    resolvedMappings: [],
    _inRollback:      false,
    _inEscalation:    false,
  };
}

function _createStageRecord(stage) {
  return {
    stageId:           stage.id,
    stageName:         stage.name,
    stageType:         stage.type,
    status:            STAGE_EXECUTION_STATUS.PENDING,
    startedAt:         null,
    completedAt:       null,
    durationMs:        null,
    runbookExecutions: [],
    output:            null,
    error:             null,
    skipped:           false,
    skippedReason:     null,
  };
}

function _setOutcome(record, successful, durationMs, failureReason) {
  record.outcome = {
    successful,
    recoveryTimeMs: durationMs,
    failureReason:  failureReason || null,
    learningCaptured: false,
    incidentMemoryUpdated: false,
    humanInvolved: record.approval != null,
    summary: successful ? 'Playbook completed successfully' : (failureReason || 'Execution failed'),
  };
}

function _evaluatePolicy(playbookDef, incidentContext, options) {
  if (!playbookDef.policy?.required) {
    return { denied: false, reason: null };
  }

  // Basic policy evaluation (in production this would call a policy engine)
  if (!options.policyDecision) {
    return { denied: false, reason: null }; // no policy engine attached → allow
  }

  return options.policyDecision;
}

function _requiresApproval(playbookDef, policyDecision) {
  const mode = playbookDef.approval?.mode;
  if (!mode || mode === 'DISABLED' || mode === 'AUTOMATIC') return false;
  if (mode === 'MANUAL') return true;
  if (mode === 'CONDITIONAL') return policyDecision?.requiresApproval === true;
  return false;
}

function _collectStageOutputs(stageRecord) {
  const output = {};
  if (!stageRecord?.runbookExecutions) return output;
  for (const rbExec of stageRecord.runbookExecutions) {
    if (rbExec.output) {
      Object.assign(output, rbExec.output);
    }
  }
  return output;
}

function _redactMappedParams(mapped, paramDefs) {
  const sensitive = new Set(
    paramDefs.filter(p => p.sensitive || p.type === 'secret-reference').map(p => p.name)
  );
  const result = {};
  for (const [k, v] of Object.entries(mapped)) {
    result[k] = sensitive.has(k) ? '[REDACTED]' : v;
  }
  return result;
}

// ── Singleton ─────────────────────────────────────────────────────────────

let _instance = null;

function getPlaybookExecutionService(options = {}) {
  if (!_instance) _instance = new PlaybookExecutionService(options);
  return _instance;
}

function resetPlaybookExecutionService() {
  _instance = null;
}

module.exports = {
  PlaybookExecutionService,
  getPlaybookExecutionService,
  resetPlaybookExecutionService,
};
