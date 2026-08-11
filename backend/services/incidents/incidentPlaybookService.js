'use strict';

/**
 * Incident Playbook Integration Service
 *
 * Connects the incident lifecycle to the Playbook Matcher and Execution Service.
 * This is the single bridge between incidents and the Playbook Platform V1.
 *
 * Architecture invariant: This service calls matchPlaybooks and the
 * PlaybookExecutionService. It never calls ActionHandlerRegistry directly.
 */

const { matchPlaybooks, resolveMatchOutcome } = require('../../playbooks/matching/playbookMatcher');
const { getPlaybookRegistry }                 = require('../../playbooks/registry/playbookRegistry');
const { getPlaybookExecutionService }         = require('../../playbooks/execution/playbookExecutionService');
const { PLAYBOOK_LIFECYCLE }                  = require('../../constants/playbook');
const { EXECUTION_OUTCOME }                   = require('../../constants/executionOutcomes');

class IncidentPlaybookService {

  /**
   * Find candidate playbooks for an incident.
   * Does NOT execute. Returns match analysis only.
   *
   * @param {object} incident - Incident document (or plain object from API)
   * @param {object} options  - { tenantId, maxResults, minScore }
   * @returns {Promise<MatchAnalysis>}
   */
  async analyseIncident(incident, options = {}) {
    const tenantId = options.tenantId || incident.tenantId;
    const reg = getPlaybookRegistry();

    const activePlaybooks = await reg.list({ tenantId, lifecycle: PLAYBOOK_LIFECYCLE.ACTIVE });

    const incidentCtx = _normaliseIncident(incident);
    const matchResults = matchPlaybooks(activePlaybooks, incidentCtx, {
      minScore:   options.minScore,
      maxResults: options.maxResults,
    });

    const outcome = resolveMatchOutcome(matchResults, incidentCtx);

    const eligible = matchResults.filter(r => r.eligible);

    return {
      incidentId:     incident.id || incident._id,
      candidateCount: matchResults.length,
      eligibleCount:  eligible.length,
      outcome:        outcome.outcome,
      outcomeReason:  outcome.reason || null,
      candidates:     matchResults.map(_serialiseMatch),
      eligible:       eligible.map(_serialiseMatch),
      best:           outcome.best ? _serialiseMatch(outcome.best) : null,
      disqualifications: outcome.disqualifications || [],
      missingEvidence:   outcome.missingEvidence   || [],
      escalationRecommendation: outcome.escalationRecommendation || null,
      analysedAt:     new Date().toISOString(),
    };
  }

  /**
   * Execute the best matching playbook for an incident.
   *
   * @param {object} incident
   * @param {object} options - { tenantId, correlationId, initiatedBy, dryRun, policyDecision }
   * @returns {Promise<ExecutionResult>}
   */
  async executeForIncident(incident, options = {}) {
    const analysis = await this.analyseIncident(incident, options);

    if (analysis.outcome !== EXECUTION_OUTCOME.AUTO_RESOLVED || !analysis.best) {
      return {
        executed:   false,
        outcome:    analysis.outcome,
        reason:     analysis.outcomeReason,
        analysis,
        execution:  null,
      };
    }

    const { playbookId, semver } = analysis.best;
    const svc = getPlaybookExecutionService();

    const execution = await svc.execute(playbookId, semver, _normaliseIncident(incident), {
      tenantId:       options.tenantId || incident.tenantId,
      incidentId:     incident.id || incident._id,
      correlationId:  options.correlationId,
      initiatedBy:    options.initiatedBy,
      dryRun:         !!options.dryRun,
      policyDecision: options.policyDecision,
    });

    return {
      executed:   true,
      outcome:    analysis.outcome,
      playbookId,
      semver,
      analysis,
      execution:  _serialiseExecution(execution),
    };
  }
}

// ── Normalisers ────────────────────────────────────────────────────────────

function _normaliseIncident(incident) {
  // Map Mongoose Incident doc or plain API object to the format
  // the Playbook Matcher and Parameter Mapper expect.
  return {
    id:          incident.id || (incident._id ? incident._id.toString() : undefined),
    type:        incident.incidentType || incident.type || 'unknown',
    severity:    incident.severity,
    provider:    incident.provider || _inferProvider(incident),
    environment: incident.environment || incident.scope?.environment,
    resource:    incident.resource || _extractResource(incident),
    evidence:    incident.evidence || {},
    signal:      incident.signal   || {},
    confidence:  incident.confidence || incident.confidenceScore || 0,
    tags:        incident.tags || [],
    createdAt:   incident.createdAt,
    title:       incident.title || '',
    description: incident.description || '',
  };
}

function _inferProvider(incident) {
  if (!incident.tags) return undefined;
  if (incident.tags.some(t => /^kubernetes|k8s/i.test(t))) return 'kubernetes';
  if (incident.tags.some(t => /^database|db/i.test(t))) return 'database';
  return undefined;
}

function _extractResource(incident) {
  // Try to build resource from evidence or signal fields
  return {
    pod:        incident.evidence?.pod        || incident.signal?.pod_name,
    namespace:  incident.evidence?.namespace  || incident.signal?.namespace,
    deployment: incident.evidence?.deployment || incident.signal?.deployment,
    cluster:    incident.evidence?.cluster    || incident.signal?.cluster,
    service:    incident.serviceId            || incident.evidence?.service,
  };
}

// ── Serialisers ─────────────────────────────────────────────────────────────

function _serialiseMatch(match) {
  return {
    playbookId:        match.playbookId,
    semver:            match.semver,
    name:              match.name,
    score:             match.score,
    eligible:          match.eligible,
    approvalMode:      match.approvalMode,
    riskLevel:         match.riskLevel,
    matchReasons:      match.matchReasons      || [],
    disqualifications: match.disqualifications || [],
  };
}

function _serialiseExecution(exec) {
  if (!exec) return null;
  return {
    executionId:    exec.executionId,
    playbookId:     exec.playbookId,
    semver:         exec.semver,
    status:         exec.status,
    startedAt:      exec.startedAt,
    completedAt:    exec.completedAt,
    durationMs:     exec.durationMs,
    errorCode:      exec.errorCode    || null,
    errorMessage:   exec.errorMessage || null,
    stageExecutions: (exec.stageExecutions || []).map(s => ({
      stageId:   s.stageId,
      stageName: s.stageName,
      stageType: s.stageType,
      status:    s.status,
      durationMs: s.durationMs,
      runbookExecutions: (s.runbookExecutions || []).map(r => ({
        runbookId:   r.runbookId,
        executionId: r.executionId,
        status:      r.status,
        durationMs:  r.durationMs,
        error:       r.error || null,
      })),
    })),
    outcome: exec.outcome || null,
  };
}

// ── Singleton ─────────────────────────────────────────────────────────────

let _instance = null;
function getIncidentPlaybookService() {
  if (!_instance) _instance = new IncidentPlaybookService();
  return _instance;
}

module.exports = { IncidentPlaybookService, getIncidentPlaybookService };
