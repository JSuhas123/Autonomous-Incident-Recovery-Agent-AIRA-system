'use strict';

/**
 * AIRA 8-Agent Intelligence Platform — Canonical Domain Contracts
 *
 * All agent inputs/outputs must conform to these structures.
 * Plain JS objects — no ORM dependency.
 *
 * SAFETY INVARIANT: These contracts never carry secrets, credentials,
 * raw shell commands, or anything that could be directly executed.
 */

// ── Evidence Types ────────────────────────────────────────────────────────────

const EVIDENCE_TYPE = Object.freeze({
  METRIC:              'METRIC',
  LOG:                 'LOG',
  TRACE:               'TRACE',
  KUBERNETES_EVENT:    'KUBERNETES_EVENT',
  ALERT:               'ALERT',
  DEPLOYMENT_CHANGE:   'DEPLOYMENT_CHANGE',
  SERVICE_STATE:       'SERVICE_STATE',
  DEPENDENCY_STATE:    'DEPENDENCY_STATE',
  HISTORICAL_INCIDENT: 'HISTORICAL_INCIDENT',
  POLICY_RESULT:       'POLICY_RESULT',
  EXECUTION_RESULT:    'EXECUTION_RESULT',
  VERIFICATION_RESULT: 'VERIFICATION_RESULT',
});

const EVIDENCE_SOURCE_TYPE = Object.freeze({
  KUBERNETES_API:  'KUBERNETES_API',
  PROMETHEUS:      'PROMETHEUS',
  LOG_AGGREGATOR:  'LOG_AGGREGATOR',
  ALERT_MANAGER:   'ALERT_MANAGER',
  DEPLOYMENT_API:  'DEPLOYMENT_API',
  SERVICE_REGISTRY:'SERVICE_REGISTRY',
  INCIDENT_MEMORY: 'INCIDENT_MEMORY',
  DECISION_TRACE:  'DECISION_TRACE',
  MANUAL:          'MANUAL',
});

// ── Agent Status ──────────────────────────────────────────────────────────────

const AGENT_STATUS = Object.freeze({
  SUCCESS:           'SUCCESS',
  PARTIAL:           'PARTIAL',
  FAILED:            'FAILED',
  MANUAL_REQUIRED:   'MANUAL_REQUIRED',
  SKIPPED:           'SKIPPED',
});

// ── Orchestration States ──────────────────────────────────────────────────────

const ORCHESTRATION_STATE = Object.freeze({
  RECEIVED:             'RECEIVED',
  CORRELATING:          'CORRELATING',
  INVESTIGATING:        'INVESTIGATING',
  DIAGNOSING:           'DIAGNOSING',
  SELECTING_PLAYBOOK:   'SELECTING_PLAYBOOK',
  RESOLVING_PARAMETERS: 'RESOLVING_PARAMETERS',
  READY_FOR_EXECUTION:  'READY_FOR_EXECUTION',
  EXECUTING:            'EXECUTING',
  MONITORING_RECOVERY:  'MONITORING_RECOVERY',
  EXPLAINING:           'EXPLAINING',
  LEARNING:             'LEARNING',
  COMPLETED:            'COMPLETED',
  MANUAL_REQUIRED:      'MANUAL_REQUIRED',
  FAILED:               'FAILED',
});

// ── Recovery States ───────────────────────────────────────────────────────────

const RECOVERY_STATE = Object.freeze({
  IMPROVING:           'IMPROVING',
  STABLE:              'STABLE',
  RECOVERED:           'RECOVERED',
  DEGRADED:            'DEGRADED',
  WORSENING:           'WORSENING',
  STALLED:             'STALLED',
  ROLLBACK_IN_PROGRESS:'ROLLBACK_IN_PROGRESS',
  MANUAL_REQUIRED:     'MANUAL_REQUIRED',
});

// ── Playbook Selection Recommendations ───────────────────────────────────────

const PLAYBOOK_RECOMMENDATION = Object.freeze({
  EXECUTE_CANDIDATE:       'EXECUTE_CANDIDATE',
  COLLECT_MORE_EVIDENCE:   'COLLECT_MORE_EVIDENCE',
  MANUAL_REQUIRED:         'MANUAL_REQUIRED',
});

// ── Recovery Monitoring Recommendations ──────────────────────────────────────

const MONITORING_RECOMMENDATION = Object.freeze({
  CONTINUE:  'CONTINUE',
  WAIT:      'WAIT',
  ESCALATE:  'ESCALATE',
});

// ── AI-specific Manual Reasons ────────────────────────────────────────────────

const AGENT_MANUAL_REASON = Object.freeze({
  AGENT_UNAVAILABLE:        'AGENT_UNAVAILABLE',
  AGENT_OUTPUT_INVALID:     'AGENT_OUTPUT_INVALID',
  AGENT_CONFIDENCE_TOO_LOW: 'AGENT_CONFIDENCE_TOO_LOW',
  AGENT_TIMEOUT:            'AGENT_TIMEOUT',
  REASONING_FAILED:         'REASONING_FAILED',
});

// ── Factory Functions ─────────────────────────────────────────────────────────

/**
 * Create a canonical EvidenceItem.
 */
function createEvidenceItem({
  id,
  type,
  source,
  sourceType,
  timestamp,
  resource,
  service,
  summary,
  structuredData,
  confidence = null,
  freshness = null,
  correlationId = null,
  sensitive = false,
  redacted = false,
}) {
  if (!id)        throw new TypeError('EvidenceItem.id is required');
  if (!type)      throw new TypeError('EvidenceItem.type is required');
  if (!EVIDENCE_TYPE[type]) throw new TypeError(`Unknown evidence type: ${type}`);

  return Object.freeze({
    id,
    type,
    source:         source      || 'unknown',
    sourceType:     sourceType  || EVIDENCE_SOURCE_TYPE.MANUAL,
    timestamp:      timestamp   || new Date().toISOString(),
    resource:       resource    || {},
    service:        service     || null,
    summary:        summary     || '',
    structuredData: redacted ? '[REDACTED]' : (structuredData || {}),
    confidence,
    freshness,
    correlationId,
    sensitive,
    redacted,
  });
}

/**
 * Create an EvidencePackage.
 */
function createEvidencePackage({
  incidentId,
  correlationId,
  items = [],
  completeness = 0,
  missingEvidence = [],
  staleEvidence = [],
  conflicts = [],
  recommendedNextEvidence = [],
  collectedAt = null,
} = {}) {
  return {
    incidentId,
    correlationId,
    items,
    completeness,
    missingEvidence,
    staleEvidence,
    conflicts,
    recommendedNextEvidence,
    collectedAt: collectedAt || new Date().toISOString(),
  };
}

/**
 * Create a DiagnosisHypothesis.
 */
function createHypothesis({
  id,
  rootCause,
  confidence,
  evidenceSupporting = [],
  evidenceAgainst = [],
  affectedResources = [],
  explanation = '',
}) {
  return { id, rootCause, confidence, evidenceSupporting, evidenceAgainst, affectedResources, explanation };
}

/**
 * Create a DiagnosisResult.
 */
function createDiagnosisResult({
  hypotheses = [],
  primaryHypothesis = null,
  diagnosisConfidence = 0,
  evidenceCompleteness = 0,
  unresolvedQuestions = [],
  recommendedIncidentType = null,
} = {}) {
  return {
    hypotheses,
    primaryHypothesis,
    diagnosisConfidence,
    evidenceCompleteness,
    unresolvedQuestions,
    recommendedIncidentType,
  };
}

/**
 * Create a PlaybookRecommendation.
 */
function createPlaybookRecommendation({
  recommendedPlaybookId = null,
  version = null,
  candidateRankings = [],
  matcherScore = 0,
  reasoningConfidence = 0,
  evidenceIds = [],
  reasons = [],
  disqualifications = [],
  requiredAdditionalEvidence = [],
  recommendation = PLAYBOOK_RECOMMENDATION.MANUAL_REQUIRED,
} = {}) {
  return {
    recommendedPlaybookId,
    version,
    candidateRankings,
    matcherScore,
    reasoningConfidence,
    evidenceIds,
    reasons,
    disqualifications,
    requiredAdditionalEvidence,
    recommendation,
  };
}

/**
 * Create a ParameterRecommendation.
 */
function createParameterRecommendation({
  candidates = [],
  deterministicResolutionResult = null,
  unresolved = [],
  ambiguous = [],
  readyForExecution = false,
} = {}) {
  return { candidates, deterministicResolutionResult, unresolved, ambiguous, readyForExecution };
}

/**
 * Create a RecoveryObservation.
 */
function createRecoveryObservation({
  state = RECOVERY_STATE.STABLE,
  confidence = 0,
  evidenceIds = [],
  observations = [],
  concerns = [],
  recommendation = MONITORING_RECOMMENDATION.WAIT,
} = {}) {
  return { state, confidence, evidenceIds, observations, concerns, recommendation };
}

/**
 * Create an ExplanationResult.
 */
function createExplanationResult({
  title = '',
  summary = '',
  whatHappened = '',
  likelyCause = '',
  evidenceSummary = [],
  decisionSummary = '',
  actionSummary = [],
  policySummary = '',
  verificationSummary = '',
  rollbackSummary = '',
  finalOutcome = '',
  manualReason = null,
  timeline = [],
  confidenceNotes = [],
  operatorNextSteps = [],
} = {}) {
  return {
    title, summary, whatHappened, likelyCause,
    evidenceSummary, decisionSummary, actionSummary,
    policySummary, verificationSummary, rollbackSummary,
    finalOutcome, manualReason, timeline, confidenceNotes, operatorNextSteps,
  };
}

/**
 * Create a LearningRecommendation.
 */
function createLearningRecommendation({
  patterns = [],
  recommendations = [],
  playbookInsights = [],
  runbookInsights = [],
  policyInsights = [],
} = {}) {
  return { patterns, recommendations, playbookInsights, runbookInsights, policyInsights };
}

/**
 * Create an AgentExecutionRecord.
 */
function createAgentExecutionRecord({
  agent,
  version,
  status,
  startedAt,
  completedAt = null,
  confidence = null,
  evidenceUsed = [],
  result = null,
  warnings = [],
  error = null,
  model = null,
  provider = null,
  fallbackUsed = false,
  tokenEstimate = null,
} = {}) {
  return {
    agent, version, status, startedAt, completedAt,
    confidence, evidenceUsed, result, warnings, error,
    model, provider, fallbackUsed, tokenEstimate,
    durationMs: (startedAt && completedAt)
      ? new Date(completedAt) - new Date(startedAt)
      : null,
  };
}

/**
 * Create the canonical AgentContext.
 * Secrets/credentials must NEVER be placed here.
 */
function createAgentContext({
  incidentId,
  correlationId,
  tenantId,
  incident = {},
  signals = [],
  alerts = [],
  metrics = {},
  logs = [],
  traces = [],
  events = [],
  service = {},
  dependencies = [],
  environment = null,
  provider = null,
  resource = {},
  evidence = null,
  diagnosis = null,
  playbookCandidates = [],
  selectedPlaybook = null,
  resolvedParameters = null,
  policyDecision = null,
  approvalState = null,
  playbookExecutionId = null,
  runbookExecutionIds = [],
  verificationResults = [],
  rollbackResults = [],
  manualOutcome = null,
  timing = {},
  agentTrace = [],
} = {}) {
  if (!incidentId)   throw new TypeError('AgentContext.incidentId is required');
  if (!correlationId) throw new TypeError('AgentContext.correlationId is required');
  if (!tenantId)     throw new TypeError('AgentContext.tenantId is required');

  return {
    incidentId, correlationId, tenantId,
    incident, signals, alerts, metrics, logs, traces, events,
    service, dependencies, environment, provider, resource,
    evidence, diagnosis,
    playbookCandidates, selectedPlaybook, resolvedParameters,
    policyDecision, approvalState,
    playbookExecutionId, runbookExecutionIds,
    verificationResults, rollbackResults,
    manualOutcome, timing, agentTrace,
  };
}

module.exports = {
  EVIDENCE_TYPE,
  EVIDENCE_SOURCE_TYPE,
  AGENT_STATUS,
  ORCHESTRATION_STATE,
  RECOVERY_STATE,
  PLAYBOOK_RECOMMENDATION,
  MONITORING_RECOMMENDATION,
  AGENT_MANUAL_REASON,
  createEvidenceItem,
  createEvidencePackage,
  createHypothesis,
  createDiagnosisResult,
  createPlaybookRecommendation,
  createParameterRecommendation,
  createRecoveryObservation,
  createExplanationResult,
  createLearningRecommendation,
  createAgentExecutionRecord,
  createAgentContext,
};
