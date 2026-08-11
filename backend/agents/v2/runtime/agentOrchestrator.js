'use strict';

/**
 * Agent Orchestrator — Incident Intelligence Orchestrator
 *
 * Single authoritative controller for the 8-agent pipeline.
 *
 * SAFETY INVARIANTS:
 * - Agents do NOT call each other; orchestrator controls all flow
 * - Execution handoff to V1 happens ONLY through PlaybookExecutionService
 * - Tenant boundaries enforced at every step
 * - Max orchestration steps enforced (no infinite loops)
 * - Each agent runs with a timeout
 * - Agent failures produce MANUAL_REQUIRED, not silent errors
 * - No raw agent outputs reach ActionHandlerRegistry
 */

const { v4: uuidv4 } = require('uuid');
const {
  ORCHESTRATION_STATE,
  AGENT_STATUS,
  AGENT_MANUAL_REASON,
  PLAYBOOK_RECOMMENDATION,
  createAgentContext,
} = require('../contracts/agentContracts');
const { getConfidenceModel, CONFIDENCE_DIMENSION } = require('../contracts/confidenceModel');
const { EXECUTION_OUTCOME, MANUAL_REASON }         = require('../../../constants/executionOutcomes');

const MAX_STEPS     = 50;
const AGENT_TIMEOUT = 60_000; // ms per agent

class AgentOrchestrator {
  /**
   * @param {object} agents - { correlationAgent, investigationAgent, diagnosisAgent,
   *   playbookSelectionAgent, parameterResolutionAgent, recoveryMonitoringAgent,
   *   explanationAgent, learningAgent }
   * @param {object} services - V1 frozen services
   * @param {object} config
   */
  constructor(agents = {}, services = {}, config = {}) {
    this._agents   = agents;
    this._services = services;
    this._config   = config;
    this._confidence = getConfidenceModel(config.confidenceOverrides);
    this._stepLimit = config.maxSteps || MAX_STEPS;
    this._agentTimeout = config.agentTimeoutMs || AGENT_TIMEOUT;
  }

  /**
   * Run the full intelligence pipeline for an incident.
   *
   * @param {object} input - { incidentId, correlationId, tenantId, incident, signals, alerts, ... }
   * @returns {Promise<OrchestratorResult>}
   */
  async run(input) {
    const runId = uuidv4();
    const startedAt = new Date();
    let steps = 0;

    const ctx = createAgentContext({
      incidentId:    input.incidentId   || uuidv4(),
      correlationId: input.correlationId || uuidv4(),
      tenantId:      input.tenantId,
      incident:      input.incident     || {},
      signals:       input.signals      || [],
      alerts:        input.alerts       || [],
      metrics:       input.metrics      || {},
      logs:          input.logs         || [],
      traces:        input.traces       || [],
      events:        input.events       || [],
      service:       input.service      || {},
      dependencies:  input.dependencies || [],
      environment:   input.environment  || null,
      provider:      input.provider     || null,
      resource:      input.resource     || {},
      timing:        { startedAt: startedAt.toISOString() },
    });

    const runRecord = {
      runId,
      incidentId: ctx.incidentId,
      correlationId: ctx.correlationId,
      tenantId: ctx.tenantId,
      state: ORCHESTRATION_STATE.RECEIVED,
      startedAt: startedAt.toISOString(),
      completedAt: null,
      agentTrace: [],
      manualRequired: false,
      manualReason: null,
      executionResult: null,
      explanationResult: null,
      learningResult: null,
      error: null,
    };

    const advance = (state) => {
      runRecord.state = state;
      if (++steps > this._stepLimit) throw new Error('MAX_ORCHESTRATION_STEPS exceeded');
    };

    try {
      // ── Phase 1: Correlation ──────────────────────────────────────────
      advance(ORCHESTRATION_STATE.CORRELATING);
      const corrRecord = await this._runAgent('correlationAgent', ctx, {});
      runRecord.agentTrace.push(corrRecord);

      if (corrRecord.status === AGENT_STATUS.MANUAL_REQUIRED) {
        return this._manualResult(runRecord, ctx, corrRecord.result?.manualReason || AGENT_MANUAL_REASON.AGENT_UNAVAILABLE);
      }
      if (corrRecord.status === AGENT_STATUS.FAILED) {
        return this._manualResult(runRecord, ctx, AGENT_MANUAL_REASON.AGENT_UNAVAILABLE);
      }

      _mergeCorrelation(ctx, corrRecord.result);

      const corrConf = this._confidence.evaluate(CONFIDENCE_DIMENSION.CORRELATION, corrRecord.confidence || 0);
      if (corrConf.belowMin) {
        return this._manualResult(runRecord, ctx, AGENT_MANUAL_REASON.AGENT_CONFIDENCE_TOO_LOW);
      }

      // ── Phase 2: Investigation ────────────────────────────────────────
      advance(ORCHESTRATION_STATE.INVESTIGATING);
      const invRecord = await this._runAgent('investigationAgent', ctx, {});
      runRecord.agentTrace.push(invRecord);

      if (_agentBlocksFlow(invRecord)) {
        return this._manualResult(runRecord, ctx, _agentReason(invRecord));
      }
      ctx.evidence = invRecord.result?.evidencePackage || null;

      const evComp = invRecord.result?.evidencePackage?.completeness || 0;
      const evConf = this._confidence.evaluate(CONFIDENCE_DIMENSION.EVIDENCE_COMPLETENESS, evComp);
      if (evConf.belowMin) {
        return this._manualResult(runRecord, ctx, AGENT_MANUAL_REASON.AGENT_CONFIDENCE_TOO_LOW);
      }

      // ── Phase 3: Diagnosis ────────────────────────────────────────────
      advance(ORCHESTRATION_STATE.DIAGNOSING);
      const diagRecord = await this._runAgent('diagnosisAgent', ctx, {});
      runRecord.agentTrace.push(diagRecord);

      if (_agentBlocksFlow(diagRecord)) {
        return this._manualResult(runRecord, ctx, _agentReason(diagRecord));
      }
      ctx.diagnosis = diagRecord.result?.diagnosisResult || null;

      const diagConf = this._confidence.evaluate(
        CONFIDENCE_DIMENSION.DIAGNOSIS, ctx.diagnosis?.diagnosisConfidence || 0,
      );
      if (diagConf.belowMin) {
        return this._manualResult(runRecord, ctx, AGENT_MANUAL_REASON.AGENT_CONFIDENCE_TOO_LOW);
      }

      // ── Phase 4: Playbook Selection ───────────────────────────────────
      advance(ORCHESTRATION_STATE.SELECTING_PLAYBOOK);
      const pbRecord = await this._runAgent('playbookSelectionAgent', ctx, {
        incidentPlaybookService: this._services.incidentPlaybookService,
      });
      runRecord.agentTrace.push(pbRecord);

      if (_agentBlocksFlow(pbRecord)) {
        return this._manualResult(runRecord, ctx, _agentReason(pbRecord));
      }

      const pbRec = pbRecord.result?.recommendation;
      ctx.playbookCandidates = pbRecord.result?.candidateRankings || [];
      ctx.selectedPlaybook   = pbRecord.result?.recommendedPlaybookId
        ? { playbookId: pbRecord.result.recommendedPlaybookId, semver: pbRecord.result.version }
        : null;

      if (pbRec === PLAYBOOK_RECOMMENDATION.MANUAL_REQUIRED || !ctx.selectedPlaybook) {
        return this._manualResult(runRecord, ctx, MANUAL_REASON.NO_SAFE_PLAYBOOK);
      }
      if (pbRec === PLAYBOOK_RECOMMENDATION.COLLECT_MORE_EVIDENCE) {
        return this._manualResult(runRecord, ctx, MANUAL_REASON.MISSING_EVIDENCE);
      }

      const pbConf = this._confidence.evaluate(
        CONFIDENCE_DIMENSION.PLAYBOOK_SELECTION, pbRecord.confidence || 0,
      );
      if (pbConf.belowMin) {
        return this._manualResult(runRecord, ctx, AGENT_MANUAL_REASON.AGENT_CONFIDENCE_TOO_LOW);
      }

      // ── Phase 5: Parameter Resolution ────────────────────────────────
      advance(ORCHESTRATION_STATE.RESOLVING_PARAMETERS);
      const paramRecord = await this._runAgent('parameterResolutionAgent', ctx, {});
      runRecord.agentTrace.push(paramRecord);

      if (_agentBlocksFlow(paramRecord)) {
        return this._manualResult(runRecord, ctx, _agentReason(paramRecord));
      }

      ctx.resolvedParameters = paramRecord.result?.deterministicResolutionResult || null;

      if (!paramRecord.result?.readyForExecution) {
        const unresolved = paramRecord.result?.unresolved || [];
        const ambiguous  = paramRecord.result?.ambiguous  || [];
        if (ambiguous.length > 0)  return this._manualResult(runRecord, ctx, MANUAL_REASON.RESOURCE_AMBIGUOUS);
        if (unresolved.length > 0) return this._manualResult(runRecord, ctx, MANUAL_REASON.PARAMETER_UNRESOLVED);
        return this._manualResult(runRecord, ctx, MANUAL_REASON.PARAMETER_UNRESOLVED);
      }

      const paramConf = this._confidence.evaluate(
        CONFIDENCE_DIMENSION.PARAMETER, paramRecord.confidence || 0,
      );
      if (paramConf.belowMin) {
        return this._manualResult(runRecord, ctx, AGENT_MANUAL_REASON.AGENT_CONFIDENCE_TOO_LOW);
      }

      // ── Phase 6: Execution Handoff → Frozen V1 ───────────────────────
      advance(ORCHESTRATION_STATE.READY_FOR_EXECUTION);
      advance(ORCHESTRATION_STATE.EXECUTING);

      let executionResult = null;
      if (this._services.incidentPlaybookService) {
        try {
          executionResult = await this._services.incidentPlaybookService.executeForIncident(
            ctx.incident,
            {
              tenantId:      ctx.tenantId,
              correlationId: ctx.correlationId,
              initiatedBy:   'agent-orchestrator',
              dryRun:        this._config.dryRun || false,
              policyDecision: ctx.policyDecision,
            },
          );
          ctx.playbookExecutionId = executionResult?.execution?.executionId || null;
          ctx.policyDecision      = executionResult?.execution?.policyDecision || null;
        } catch (execErr) {
          return this._manualResult(runRecord, ctx, MANUAL_REASON.EXECUTION_FAILED, execErr);
        }
      }

      runRecord.executionResult = executionResult;
      ctx.verificationResults   = executionResult?.execution?.verificationResults || [];
      ctx.rollbackResults       = executionResult?.execution?.rollbackResults     || [];

      if (executionResult?.outcome === EXECUTION_OUTCOME.WAITING_FOR_APPROVAL) {
        runRecord.state         = ORCHESTRATION_STATE.MANUAL_REQUIRED;
        runRecord.manualRequired = true;
        runRecord.manualReason   = MANUAL_REASON.APPROVAL_REQUIRED;
        // Do NOT busy-loop — return and wait for approval webhook
        return this._finalize(runRecord, ctx);
      }
      if (executionResult?.outcome === EXECUTION_OUTCOME.MANUAL_REQUIRED) {
        return this._manualResult(runRecord, ctx, executionResult.reason || MANUAL_REASON.NO_SAFE_PLAYBOOK);
      }

      // ── Phase 7: Recovery Monitoring ──────────────────────────────────
      advance(ORCHESTRATION_STATE.MONITORING_RECOVERY);
      const monRecord = await this._runAgent('recoveryMonitoringAgent', ctx, {});
      runRecord.agentTrace.push(monRecord);
      // Monitoring failures don't block — we just record

      // ── Phase 8: Explanation ──────────────────────────────────────────
      advance(ORCHESTRATION_STATE.EXPLAINING);
      const explRecord = await this._runAgent('explanationAgent', ctx, {});
      runRecord.agentTrace.push(explRecord);
      runRecord.explanationResult = explRecord.result?.explanation || null;

      // ── Phase 9: Learning ─────────────────────────────────────────────
      advance(ORCHESTRATION_STATE.LEARNING);
      const learnRecord = await this._runAgent('learningAgent', ctx, {
        memoryService: this._services.memoryService,
      });
      runRecord.agentTrace.push(learnRecord);
      runRecord.learningResult = learnRecord.result?.recommendations || null;

      // ── Done ──────────────────────────────────────────────────────────
      runRecord.state = ORCHESTRATION_STATE.COMPLETED;
      return this._finalize(runRecord, ctx);

    } catch (err) {
      runRecord.state = ORCHESTRATION_STATE.FAILED;
      runRecord.error = err.message;
      return this._finalize(runRecord, ctx);
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  async _runAgent(agentKey, ctx, deps) {
    const agent = this._agents[agentKey];
    if (!agent) {
      return {
        agent: agentKey, version: 'N/A',
        status: AGENT_STATUS.MANUAL_REQUIRED,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        confidence: 0, evidenceUsed: [], result: { manualReason: AGENT_MANUAL_REASON.AGENT_UNAVAILABLE },
        warnings: [`Agent "${agentKey}" not registered`], error: null,
      };
    }

    // Validate input
    const inputValidation = agent.validateInput(ctx);
    if (!inputValidation.valid) {
      return {
        agent: agent.name, version: agent.version,
        status: AGENT_STATUS.FAILED,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        confidence: 0, evidenceUsed: [], result: null,
        warnings: [], error: `Input validation failed: ${inputValidation.errors.join('; ')}`,
      };
    }

    try {
      const record = await _withTimeout(
        agent.execute(ctx, deps),
        this._agentTimeout,
        `Agent "${agent.name}" timed out`,
      );

      // Validate output
      const outputValidation = agent.validateOutput(record);
      if (!outputValidation.valid) {
        return { ...record, status: AGENT_STATUS.MANUAL_REQUIRED,
          result: { manualReason: AGENT_MANUAL_REASON.AGENT_OUTPUT_INVALID },
          warnings: [...(record.warnings || []), ...outputValidation.errors] };
      }

      return record;
    } catch (err) {
      const isTimeout = err.message?.includes('timed out');
      return {
        agent: agent.name, version: agent.version,
        status: AGENT_STATUS.MANUAL_REQUIRED,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        confidence: 0, evidenceUsed: [], result: {
          manualReason: isTimeout ? AGENT_MANUAL_REASON.AGENT_TIMEOUT : AGENT_MANUAL_REASON.AGENT_UNAVAILABLE,
        },
        warnings: [], error: err.message,
      };
    }
  }

  _manualResult(runRecord, ctx, reason, err = null) {
    runRecord.state         = ORCHESTRATION_STATE.MANUAL_REQUIRED;
    runRecord.manualRequired = true;
    runRecord.manualReason   = reason;
    if (err) runRecord.error = err.message;
    return this._finalize(runRecord, ctx);
  }

  _finalize(runRecord, ctx) {
    runRecord.completedAt = new Date().toISOString();
    runRecord.timing      = {
      startedAt:   ctx.timing?.startedAt,
      completedAt: runRecord.completedAt,
      durationMs:  new Date(runRecord.completedAt) - new Date(ctx.timing?.startedAt || runRecord.completedAt),
    };
    return { runRecord, context: ctx };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _mergeCorrelation(ctx, corrResult) {
  if (!corrResult) return;
  if (corrResult.affectedServices) ctx.service.affectedServices = corrResult.affectedServices;
  if (corrResult.affectedResources) ctx.resource.affected = corrResult.affectedResources;
  if (corrResult.incidentGroup) ctx.incident._correlationGroup = corrResult.incidentGroup;
}

function _agentBlocksFlow(record) {
  return record.status === AGENT_STATUS.FAILED
      || record.status === AGENT_STATUS.MANUAL_REQUIRED;
}

function _agentReason(record) {
  return record.result?.manualReason
    || (record.status === AGENT_STATUS.FAILED
        ? AGENT_MANUAL_REASON.AGENT_UNAVAILABLE
        : AGENT_MANUAL_REASON.AGENT_CONFIDENCE_TOO_LOW);
}

function _withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    promise.then(v => { clearTimeout(t); resolve(v); },
                 e => { clearTimeout(t); reject(e);  });
  });
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _instance = null;

function getAgentOrchestrator(agents, services, config) {
  if (!_instance || agents) {
    _instance = new AgentOrchestrator(agents || {}, services || {}, config || {});
  }
  return _instance;
}

function resetAgentOrchestrator() { _instance = null; }

module.exports = { AgentOrchestrator, getAgentOrchestrator, resetAgentOrchestrator };
