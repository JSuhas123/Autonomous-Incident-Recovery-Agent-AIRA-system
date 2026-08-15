"use strict";

/**
 * AIRA Agent Intelligence — Canonical Domain Contracts
 *
 * Phase 6 owns diagnosis/intelligence only.
 *
 * IMPORTANT SAFETY BOUNDARY:
 *
 * These contracts may describe:
 * - observations
 * - evidence
 * - symptoms
 * - hypotheses
 * - contradictions
 * - risk
 * - recommendations
 *
 * They must NOT contain:
 * - plaintext credentials
 * - secrets
 * - raw shell commands intended for direct execution
 * - infrastructure mutation authority
 *
 * Playbook execution / policy / approval / mutation belong to later phases.
 */

// ============================================================================
// EVIDENCE TYPES
// ============================================================================

const EVIDENCE_TYPE =
  Object.freeze({
    METRIC:
      "METRIC",

    LOG:
      "LOG",

    TRACE:
      "TRACE",

    ALERT:
      "ALERT",

    SIGNAL:
      "SIGNAL",

    INCIDENT_EVENT:
      "INCIDENT_EVENT",

    KUBERNETES_EVENT:
      "KUBERNETES_EVENT",

    DEPLOYMENT_CHANGE:
      "DEPLOYMENT_CHANGE",

    CONFIGURATION_CHANGE:
      "CONFIGURATION_CHANGE",

    SERVICE_STATE:
      "SERVICE_STATE",

    RESOURCE_STATE:
      "RESOURCE_STATE",

    DEPENDENCY_STATE:
      "DEPENDENCY_STATE",

    TOPOLOGY:
      "TOPOLOGY",

    BLAST_RADIUS:
      "BLAST_RADIUS",

    HISTORICAL_INCIDENT:
      "HISTORICAL_INCIDENT",

    OPERATOR_NOTE:
      "OPERATOR_NOTE",

    POLICY_RESULT:
      "POLICY_RESULT",

    EXECUTION_RESULT:
      "EXECUTION_RESULT",

    VERIFICATION_RESULT:
      "VERIFICATION_RESULT",

    UNKNOWN:
      "UNKNOWN",
  });

// ============================================================================
// EVIDENCE SOURCE TYPES
// ============================================================================

const EVIDENCE_SOURCE_TYPE =
  Object.freeze({
    AIRA_SIGNAL_STORE:
      "AIRA_SIGNAL_STORE",

    AIRA_INCIDENT_STORE:
      "AIRA_INCIDENT_STORE",

    AIRA_TOPOLOGY:
      "AIRA_TOPOLOGY",

    KUBERNETES_API:
      "KUBERNETES_API",

    PROMETHEUS:
      "PROMETHEUS",

    OPENTELEMETRY:
      "OPENTELEMETRY",

    DATADOG:
      "DATADOG",

    AWS_CLOUDWATCH:
      "AWS_CLOUDWATCH",

    AZURE_MONITOR:
      "AZURE_MONITOR",

    GCP_MONITORING:
      "GCP_MONITORING",

    LOG_AGGREGATOR:
      "LOG_AGGREGATOR",

    ALERT_MANAGER:
      "ALERT_MANAGER",

    DEPLOYMENT_API:
      "DEPLOYMENT_API",

    SERVICE_REGISTRY:
      "SERVICE_REGISTRY",

    INCIDENT_MEMORY:
      "INCIDENT_MEMORY",

    DECISION_TRACE:
      "DECISION_TRACE",

    OPERATOR:
      "OPERATOR",

    MANUAL:
      "MANUAL",

    UNKNOWN:
      "UNKNOWN",
  });

// ============================================================================
// AGENT STATUS
// ============================================================================

const AGENT_STATUS =
  Object.freeze({
    SUCCESS:
      "SUCCESS",

    PARTIAL:
      "PARTIAL",

    FAILED:
      "FAILED",

    MANUAL_REQUIRED:
      "MANUAL_REQUIRED",

    SKIPPED:
      "SKIPPED",
  });

// ============================================================================
// PHASE 6 DIAGNOSIS STATES
// ============================================================================

const DIAGNOSIS_STATE =
  Object.freeze({
    PENDING:
      "PENDING",

    BUILDING_CONTEXT:
      "BUILDING_CONTEXT",

    COLLECTING_EVIDENCE:
      "COLLECTING_EVIDENCE",

    ANALYZING_SYMPTOMS:
      "ANALYZING_SYMPTOMS",

    ANALYZING_TOPOLOGY:
      "ANALYZING_TOPOLOGY",

    ANALYZING_CHANGES:
      "ANALYZING_CHANGES",

    ANALYZING_HISTORY:
      "ANALYZING_HISTORY",

    GENERATING_HYPOTHESES:
      "GENERATING_HYPOTHESES",

    VERIFYING_HYPOTHESES:
      "VERIFYING_HYPOTHESES",

    ASSESSING_RISK:
      "ASSESSING_RISK",

    AGGREGATING_CONFIDENCE:
      "AGGREGATING_CONFIDENCE",

    COMPLETED:
      "COMPLETED",

    INSUFFICIENT_EVIDENCE:
      "INSUFFICIENT_EVIDENCE",

    MANUAL_REQUIRED:
      "MANUAL_REQUIRED",

    FAILED:
      "FAILED",
  });

// ============================================================================
// LEGACY ORCHESTRATION STATES
// ============================================================================

/**
 * Backwards compatibility for the existing V2 runtime.
 *
 * Phase 6 will eventually stop at DIAGNOSING / COMPLETED.
 * Later orchestration stages belong to Phases 7–10.
 */
const ORCHESTRATION_STATE =
  Object.freeze({
    RECEIVED:
      "RECEIVED",

    CORRELATING:
      "CORRELATING",

    INVESTIGATING:
      "INVESTIGATING",

    DIAGNOSING:
      "DIAGNOSING",

    SELECTING_PLAYBOOK:
      "SELECTING_PLAYBOOK",

    RESOLVING_PARAMETERS:
      "RESOLVING_PARAMETERS",

    READY_FOR_EXECUTION:
      "READY_FOR_EXECUTION",

    EXECUTING:
      "EXECUTING",

    MONITORING_RECOVERY:
      "MONITORING_RECOVERY",

    EXPLAINING:
      "EXPLAINING",

    LEARNING:
      "LEARNING",

    COMPLETED:
      "COMPLETED",

    MANUAL_REQUIRED:
      "MANUAL_REQUIRED",

    FAILED:
      "FAILED",
  });

// ============================================================================
// RECOVERY STATES
// ============================================================================

const RECOVERY_STATE =
  Object.freeze({
    IMPROVING:
      "IMPROVING",

    STABLE:
      "STABLE",

    RECOVERED:
      "RECOVERED",

    DEGRADED:
      "DEGRADED",

    WORSENING:
      "WORSENING",

    STALLED:
      "STALLED",

    ROLLBACK_IN_PROGRESS:
      "ROLLBACK_IN_PROGRESS",

    MANUAL_REQUIRED:
      "MANUAL_REQUIRED",
  });

// ============================================================================
// PLAYBOOK RECOMMENDATIONS
// ============================================================================

const PLAYBOOK_RECOMMENDATION =
  Object.freeze({
    EXECUTE_CANDIDATE:
      "EXECUTE_CANDIDATE",

    COLLECT_MORE_EVIDENCE:
      "COLLECT_MORE_EVIDENCE",

    MANUAL_REQUIRED:
      "MANUAL_REQUIRED",
  });

// ============================================================================
// MONITORING RECOMMENDATIONS
// ============================================================================

const MONITORING_RECOMMENDATION =
  Object.freeze({
    CONTINUE:
      "CONTINUE",

    WAIT:
      "WAIT",

    ESCALATE:
      "ESCALATE",
  });

// ============================================================================
// DIAGNOSIS OUTCOME
// ============================================================================

const DIAGNOSIS_OUTCOME =
  Object.freeze({
    ROOT_CAUSE_IDENTIFIED:
      "ROOT_CAUSE_IDENTIFIED",

    PROBABLE_CAUSE_IDENTIFIED:
      "PROBABLE_CAUSE_IDENTIFIED",

    MULTIPLE_PLAUSIBLE_CAUSES:
      "MULTIPLE_PLAUSIBLE_CAUSES",

    INSUFFICIENT_EVIDENCE:
      "INSUFFICIENT_EVIDENCE",

    CONTRADICTORY_EVIDENCE:
      "CONTRADICTORY_EVIDENCE",

    FALSE_POSITIVE_SUSPECTED:
      "FALSE_POSITIVE_SUSPECTED",

    UNKNOWN:
      "UNKNOWN",
  });

// ============================================================================
// HYPOTHESIS STATUS
// ============================================================================

const HYPOTHESIS_STATUS =
  Object.freeze({
    PROPOSED:
      "PROPOSED",

    SUPPORTED:
      "SUPPORTED",

    WEAKLY_SUPPORTED:
      "WEAKLY_SUPPORTED",

    CONTRADICTED:
      "CONTRADICTED",

    REJECTED:
      "REJECTED",

    VERIFIED:
      "VERIFIED",

    UNRESOLVED:
      "UNRESOLVED",
  });

// ============================================================================
// CONTRADICTION TYPES
// ============================================================================

const CONTRADICTION_TYPE =
  Object.freeze({
    EVIDENCE_CONFLICT:
      "EVIDENCE_CONFLICT",

    TEMPORAL_CONFLICT:
      "TEMPORAL_CONFLICT",

    TOPOLOGY_CONFLICT:
      "TOPOLOGY_CONFLICT",

    METRIC_CONFLICT:
      "METRIC_CONFLICT",

    LOG_CONFLICT:
      "LOG_CONFLICT",

    TRACE_CONFLICT:
      "TRACE_CONFLICT",

    HISTORICAL_CONFLICT:
      "HISTORICAL_CONFLICT",

    CAUSALITY_CONFLICT:
      "CAUSALITY_CONFLICT",

    UNKNOWN:
      "UNKNOWN",
  });

// ============================================================================
// RISK LEVEL
// ============================================================================

const RISK_LEVEL =
  Object.freeze({
    LOW:
      "LOW",

    MEDIUM:
      "MEDIUM",

    HIGH:
      "HIGH",

    CRITICAL:
      "CRITICAL",
  });

// ============================================================================
// NEXT-STEP TYPES
// ============================================================================

const DIAGNOSIS_NEXT_STEP =
  Object.freeze({
    COLLECT_MORE_EVIDENCE:
      "COLLECT_MORE_EVIDENCE",

    EVALUATE_PLAYBOOK:
      "EVALUATE_PLAYBOOK",

    MANUAL_INVESTIGATION:
      "MANUAL_INVESTIGATION",

    MONITOR:
      "MONITOR",

    NO_ACTION:
      "NO_ACTION",
  });

// ============================================================================
// AGENT MANUAL REASONS
// ============================================================================

const AGENT_MANUAL_REASON =
  Object.freeze({
    AGENT_UNAVAILABLE:
      "AGENT_UNAVAILABLE",

    AGENT_OUTPUT_INVALID:
      "AGENT_OUTPUT_INVALID",

    AGENT_CONFIDENCE_TOO_LOW:
      "AGENT_CONFIDENCE_TOO_LOW",

    AGENT_TIMEOUT:
      "AGENT_TIMEOUT",

    REASONING_FAILED:
      "REASONING_FAILED",

    INSUFFICIENT_EVIDENCE:
      "INSUFFICIENT_EVIDENCE",

    CONTRADICTORY_EVIDENCE:
      "CONTRADICTORY_EVIDENCE",

    CONTEXT_INCOMPLETE:
      "CONTEXT_INCOMPLETE",

    UNSUPPORTED_INCIDENT_TYPE:
      "UNSUPPORTED_INCIDENT_TYPE",
  });

// ============================================================================
// HELPERS
// ============================================================================

function clampConfidence(
  value,
  fallback = null
) {
  if (
    value ===
    null ||
    value ===
    undefined ||
    value ===
    ""
  ) {
    return fallback;
  }

  const number =
    Number(
      value
    );

  if (
    !Number.isFinite(
      number
    )
  ) {
    return fallback;
  }

  return Math.max(
    0,
    Math.min(
      1,
      number
    )
  );
}

function safeArray(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : [];
}

// ============================================================================
// EVIDENCE ITEM
// ============================================================================

function createEvidenceItem({
  id,
  type,
  source,
  sourceType,
  timestamp,
  observedAt,
  resource,
  service,
  serviceId = null,
  provider = null,
  signalId = null,
  incidentEventId = null,
  summary,
  structuredData,
  confidence = null,
  freshness = null,
  correlationId = null,
  correlationGroupId = null,
  sensitive = false,
  redacted = false,
  tags = [],
} = {}) {
  if (
    !id
  ) {
    throw new TypeError(
      "EvidenceItem.id is required"
    );
  }

  if (
    !type
  ) {
    throw new TypeError(
      "EvidenceItem.type is required"
    );
  }

  if (
    !EVIDENCE_TYPE[
      type
    ]
  ) {
    throw new TypeError(
      `Unknown evidence type: ${type}`
    );
  }

  return Object.freeze({
    id:

      String(
        id
      ),

    type,

    source:
      source ||
      "unknown",

    sourceType:
      sourceType ||
      EVIDENCE_SOURCE_TYPE
        .MANUAL,

    timestamp:
      timestamp ||
      observedAt ||
      new Date()
        .toISOString(),

    observedAt:
      observedAt ||
      timestamp ||
      null,

    resource:
      resource ||
      {},

    service:
      service ||
      null,

    serviceId:
      serviceId
        ? String(
            serviceId
          )
        : null,

    provider:
      provider ||
      null,

    signalId:
      signalId ||
      null,

    incidentEventId:
      incidentEventId ||
      null,

    summary:
      summary ||
      "",

    structuredData:
      redacted
        ? "[REDACTED]"
        : (
            structuredData ||
            {}
          ),

    confidence:
      clampConfidence(
        confidence,
        null
      ),

    freshness:
      clampConfidence(
        freshness,
        null
      ),

    correlationId:
      correlationId ||
      null,

    correlationGroupId:
      correlationGroupId ||
      null,

    sensitive:
      Boolean(
        sensitive
      ),

    redacted:
      Boolean(
        redacted
      ),

    tags:
      safeArray(
        tags
      ),
  });
}

// ============================================================================
// EVIDENCE PACKAGE
// ============================================================================

function createEvidencePackage({
  incidentId,
  correlationId,
  correlationGroupId = null,
  items = [],
  completeness = 0,
  missingEvidence = [],
  staleEvidence = [],
  conflicts = [],
  recommendedNextEvidence = [],
  providerCoverage = [],
  signalCount = 0,
  collectedAt = null,
} = {}) {
  if (
    !incidentId
  ) {
    throw new TypeError(
      "EvidencePackage.incidentId is required"
    );
  }

  return {
    incidentId:
      String(
        incidentId
      ),

    correlationId:
      correlationId ||
      `incident:${incidentId}`,

    correlationGroupId,

    items:
      safeArray(
        items
      ),

    completeness:
      clampConfidence(
        completeness,
        0
      ),

    missingEvidence:
      safeArray(
        missingEvidence
      ),

    staleEvidence:
      safeArray(
        staleEvidence
      ),

    conflicts:
      safeArray(
        conflicts
      ),

    recommendedNextEvidence:
      safeArray(
        recommendedNextEvidence
      ),

    providerCoverage:
      safeArray(
        providerCoverage
      ),

    signalCount:
      Math.max(
        0,
        Number(
          signalCount
        ) ||
        0
      ),

    collectedAt:
      collectedAt ||
      new Date()
        .toISOString(),
  };
}

// ============================================================================
// SYMPTOM
// ============================================================================

function createSymptom({
  id,
  type,
  title,
  description = "",
  severity = "warning",
  firstObservedAt = null,
  lastObservedAt = null,
  affectedServices = [],
  affectedResources = [],
  evidenceIds = [],
  confidence = 0,
} = {}) {
  if (
    !id
  ) {
    throw new TypeError(
      "Symptom.id is required"
    );
  }

  return {
    id:
      String(
        id
      ),

    type:
      type ||
      "unknown",

    title:
      title ||
      "Observed symptom",

    description,

    severity,

    firstObservedAt,

    lastObservedAt,

    affectedServices:
      safeArray(
        affectedServices
      ),

    affectedResources:
      safeArray(
        affectedResources
      ),

    evidenceIds:
      safeArray(
        evidenceIds
      ),

    confidence:
      clampConfidence(
        confidence,
        0
      ),
  };
}

// ============================================================================
// CONTRADICTION
// ============================================================================

function createContradiction({
  id,
  type =
    CONTRADICTION_TYPE
      .UNKNOWN,
  hypothesisId = null,
  summary,
  evidenceIds = [],
  severity = "warning",
  confidence = 0,
  resolved = false,
} = {}) {
  if (
    !id
  ) {
    throw new TypeError(
      "Contradiction.id is required"
    );
  }

  return {
    id:
      String(
        id
      ),

    type,

    hypothesisId,

    summary:
      summary ||
      "",

    evidenceIds:
      safeArray(
        evidenceIds
      ),

    severity,

    confidence:
      clampConfidence(
        confidence,
        0
      ),

    resolved:
      Boolean(
        resolved
      ),
  };
}

// ============================================================================
// DIAGNOSIS HYPOTHESIS
// ============================================================================

function createHypothesis({
  id,
  rootCause,
  title = null,
  category = null,
  confidence,
  status =
    HYPOTHESIS_STATUS
      .PROPOSED,
  evidenceSupporting = [],
  evidenceAgainst = [],
  contradictions = [],
  affectedResources = [],
  affectedServices = [],
  explanation = "",
  causalChain = [],
  assumptions = [],
  unknowns = [],
  rank = null,
} = {}) {
  if (
    !id
  ) {
    throw new TypeError(
      "DiagnosisHypothesis.id is required"
    );
  }

  if (
    !rootCause
  ) {
    throw new TypeError(
      "DiagnosisHypothesis.rootCause is required"
    );
  }

  return {
    id:
      String(
        id
      ),

    rootCause,

    title:
      title ||
      rootCause,

    category,

    confidence:
      clampConfidence(
        confidence,
        0
      ),

    status,

    evidenceSupporting:
      safeArray(
        evidenceSupporting
      ),

    evidenceAgainst:
      safeArray(
        evidenceAgainst
      ),

    contradictions:
      safeArray(
        contradictions
      ),

    affectedResources:
      safeArray(
        affectedResources
      ),

    affectedServices:
      safeArray(
        affectedServices
      ),

    explanation,

    causalChain:
      safeArray(
        causalChain
      ),

    assumptions:
      safeArray(
        assumptions
      ),

    unknowns:
      safeArray(
        unknowns
      ),

    rank:
      rank ===
        null
        ? null
        : Number(
            rank
          ),
  };
}

// ============================================================================
// RISK ASSESSMENT
// ============================================================================

function createRiskAssessment({
  level =
    RISK_LEVEL
      .MEDIUM,
  score = 0,
  userFacing = false,
  blastRadiusServiceCount = 0,
  blastRadiusResourceCount = 0,
  criticality = 0,
  dataRisk = false,
  availabilityRisk = false,
  securityRisk = false,
  financialRisk = false,
  reasons = [],
} = {}) {
  return {
    level,

    score:
      clampConfidence(
        score,
        0
      ),

    userFacing:
      Boolean(
        userFacing
      ),

    blastRadiusServiceCount:
      Math.max(
        0,
        Number(
          blastRadiusServiceCount
        ) ||
        0
      ),

    blastRadiusResourceCount:
      Math.max(
        0,
        Number(
          blastRadiusResourceCount
        ) ||
        0
      ),

    criticality:
      Math.max(
        0,
        Number(
          criticality
        ) ||
        0
      ),

    dataRisk:
      Boolean(
        dataRisk
      ),

    availabilityRisk:
      Boolean(
        availabilityRisk
      ),

    securityRisk:
      Boolean(
        securityRisk
      ),

    financialRisk:
      Boolean(
        financialRisk
      ),

    reasons:
      safeArray(
        reasons
      ),
  };
}

// ============================================================================
// NEXT STEP
// ============================================================================

function createRecommendedNextStep({
  type =
    DIAGNOSIS_NEXT_STEP
      .MANUAL_INVESTIGATION,
  target = null,
  reason = "",
  evidenceRequired = [],
  executionAuthorized = false,
} = {}) {
  /*
   * Phase 6 may never authorize execution.
   */
  return {
    type,

    target,

    reason,

    evidenceRequired:
      safeArray(
        evidenceRequired
      ),

    executionAuthorized:
      false,
  };
}

// ============================================================================
// DIAGNOSIS RESULT
// ============================================================================

function createDiagnosisResult({
  hypotheses = [],
  primaryHypothesis = null,
  diagnosisConfidence = 0,
  evidenceCompleteness = 0,
  unresolvedQuestions = [],
  recommendedIncidentType = null,

  symptoms = [],
  contradictions = [],
  risk = null,
  outcome =
    DIAGNOSIS_OUTCOME
      .UNKNOWN,
  summary = "",
  unknowns = [],
  recommendedNextStep = null,
  falsePositiveSuspected = false,
  analyzedAt = null,
} = {}) {
  return {
    hypotheses:
      safeArray(
        hypotheses
      ),

    primaryHypothesis,

    diagnosisConfidence:
      clampConfidence(
        diagnosisConfidence,
        0
      ),

    evidenceCompleteness:
      clampConfidence(
        evidenceCompleteness,
        0
      ),

    unresolvedQuestions:
      safeArray(
        unresolvedQuestions
      ),

    recommendedIncidentType,

    symptoms:
      safeArray(
        symptoms
      ),

    contradictions:
      safeArray(
        contradictions
      ),

    risk,

    outcome,

    summary,

    unknowns:
      safeArray(
        unknowns
      ),

    recommendedNextStep:
      recommendedNextStep ||
      createRecommendedNextStep(),

    falsePositiveSuspected:
      Boolean(
        falsePositiveSuspected
      ),

    analyzedAt:
      analyzedAt ||
      new Date()
        .toISOString(),

    /*
     * Hard safety invariant.
     */
    executionAuthorized:
      false,
  };
}

// ============================================================================
// AGENT FINDING
// ============================================================================

function createAgentFinding({
  id,
  agent,
  findingType,
  title,
  summary = "",
  confidence = 0,
  evidenceIds = [],
  contradictions = [],
  affectedServices = [],
  affectedResources = [],
  metadata = {},
  createdAt = null,
} = {}) {
  if (
    !id
  ) {
    throw new TypeError(
      "AgentFinding.id is required"
    );
  }

  if (
    !agent
  ) {
    throw new TypeError(
      "AgentFinding.agent is required"
    );
  }

  return {
    id:
      String(
        id
      ),

    agent,

    findingType:
      findingType ||
      "observation",

    title:
      title ||
      "Agent finding",

    summary,

    confidence:
      clampConfidence(
        confidence,
        0
      ),

    evidenceIds:
      safeArray(
        evidenceIds
      ),

    contradictions:
      safeArray(
        contradictions
      ),

    affectedServices:
      safeArray(
        affectedServices
      ),

    affectedResources:
      safeArray(
        affectedResources
      ),

    metadata:
      metadata ||
      {},

    createdAt:
      createdAt ||
      new Date()
        .toISOString(),
  };
}

// ============================================================================
// AGENT EXECUTION RECORD
// ============================================================================

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
    agent,

    version,

    status,

    startedAt,

    completedAt,

    confidence:
      clampConfidence(
        confidence,
        null
      ),

    evidenceUsed:
      safeArray(
        evidenceUsed
      ),

    result,

    warnings:
      safeArray(
        warnings
      ),

    error,

    model,

    provider,

    fallbackUsed:
      Boolean(
        fallbackUsed
      ),

    tokenEstimate,

    durationMs:
      (
        startedAt &&
        completedAt
      )
        ? (
            new Date(
              completedAt
            ) -
            new Date(
              startedAt
            )
          )
        : null,
  };
}

// ============================================================================
// INVESTIGATION CONTEXT
// ============================================================================

function createInvestigationContext({
  incidentId,
  organizationId,
  environmentId,
  tenantId,
  correlationId = null,
  correlationGroupId = null,

  incident = {},
  service = {},
  signals = [],
  incidentEvents = [],
  correlationGroup = null,

  topology = {},
  blastRadius = {},
  dependencies = [],
  resources = [],

  metrics = [],
  logs = [],
  traces = [],
  alerts = [],
  kubernetes = {},
  changes = [],
  historicalIncidents = [],

  evidence = null,
  symptoms = [],
  findings = [],
  contradictions = [],

  timing = {},
  metadata = {},
  builtAt = null,
} = {}) {
  if (
    !incidentId
  ) {
    throw new TypeError(
      "InvestigationContext.incidentId is required"
    );
  }

  if (
    !organizationId
  ) {
    throw new TypeError(
      "InvestigationContext.organizationId is required"
    );
  }

  if (
    !environmentId
  ) {
    throw new TypeError(
      "InvestigationContext.environmentId is required"
    );
  }

  if (
    !tenantId
  ) {
    throw new TypeError(
      "InvestigationContext.tenantId is required"
    );
  }

  return {
    incidentId:
      String(
        incidentId
      ),

    organizationId:
      String(
        organizationId
      ),

    environmentId:
      String(
        environmentId
      ),

    tenantId:
      String(
        tenantId
      ),

    correlationId:
      correlationId ||
      correlationGroupId ||
      `incident:${incidentId}`,

    correlationGroupId:
      correlationGroupId ||
      null,

    incident:
      incident ||
      {},

    service:
      service ||
      {},

    signals:
      safeArray(
        signals
      ),

    incidentEvents:
      safeArray(
        incidentEvents
      ),

    correlationGroup,

    topology:
      topology ||
      {},

    blastRadius:
      blastRadius ||
      {},

    dependencies:
      safeArray(
        dependencies
      ),

    resources:
      safeArray(
        resources
      ),

    metrics:
      safeArray(
        metrics
      ),

    logs:
      safeArray(
        logs
      ),

    traces:
      safeArray(
        traces
      ),

    alerts:
      safeArray(
        alerts
      ),

    kubernetes:
      kubernetes ||
      {},

    changes:
      safeArray(
        changes
      ),

    historicalIncidents:
      safeArray(
        historicalIncidents
      ),

    evidence,

    symptoms:
      safeArray(
        symptoms
      ),

    findings:
      safeArray(
        findings
      ),

    contradictions:
      safeArray(
        contradictions
      ),

    timing:
      timing ||
      {},

    metadata:
      metadata ||
      {},

    builtAt:
      builtAt ||
      new Date()
        .toISOString(),

    /*
     * Phase 6 is READ ONLY.
     */
    executionAuthorized:
      false,
  };
}

// ============================================================================
// LEGACY AGENT CONTEXT
// ============================================================================

/**
 * Existing V2 runtime compatibility.
 *
 * New Phase 6 code should prefer createInvestigationContext().
 */
function createAgentContext({
  incidentId,
  correlationId,
  tenantId,

  organizationId = null,
  environmentId = null,

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
  if (
    !incidentId
  ) {
    throw new TypeError(
      "AgentContext.incidentId is required"
    );
  }

  if (
    !correlationId
  ) {
    throw new TypeError(
      "AgentContext.correlationId is required"
    );
  }

  if (
    !tenantId
  ) {
    throw new TypeError(
      "AgentContext.tenantId is required"
    );
  }

  return {
    incidentId,

    correlationId,

    tenantId,

    organizationId,

    environmentId,

    incident,

    signals,

    alerts,

    metrics,

    logs,

    traces,

    events,

    service,

    dependencies,

    environment,

    provider,

    resource,

    evidence,

    diagnosis,

    playbookCandidates,

    selectedPlaybook,

    resolvedParameters,

    policyDecision,

    approvalState,

    playbookExecutionId,

    runbookExecutionIds,

    verificationResults,

    rollbackResults,

    manualOutcome,

    timing,

    agentTrace,

    executionAuthorized:
      false,
  };
}

// ============================================================================
// LEGACY LATER-PHASE CONTRACTS
// ============================================================================

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
  recommendation =
    PLAYBOOK_RECOMMENDATION
      .MANUAL_REQUIRED,
} = {}) {
  return {
    recommendedPlaybookId,

    version,

    candidateRankings:
      safeArray(
        candidateRankings
      ),

    matcherScore:
      clampConfidence(
        matcherScore,
        0
      ),

    reasoningConfidence:
      clampConfidence(
        reasoningConfidence,
        0
      ),

    evidenceIds:
      safeArray(
        evidenceIds
      ),

    reasons:
      safeArray(
        reasons
      ),

    disqualifications:
      safeArray(
        disqualifications
      ),

    requiredAdditionalEvidence:
      safeArray(
        requiredAdditionalEvidence
      ),

    recommendation,
  };
}

function createParameterRecommendation({
  candidates = [],
  deterministicResolutionResult = null,
  unresolved = [],
  ambiguous = [],
  readyForExecution = false,
} = {}) {
  return {
    candidates:
      safeArray(
        candidates
      ),

    deterministicResolutionResult,

    unresolved:
      safeArray(
        unresolved
      ),

    ambiguous:
      safeArray(
        ambiguous
      ),

    readyForExecution:
      Boolean(
        readyForExecution
      ),
  };
}

function createRecoveryObservation({
  state =
    RECOVERY_STATE
      .STABLE,
  confidence = 0,
  evidenceIds = [],
  observations = [],
  concerns = [],
  recommendation =
    MONITORING_RECOMMENDATION
      .WAIT,
} = {}) {
  return {
    state,

    confidence:
      clampConfidence(
        confidence,
        0
      ),

    evidenceIds:
      safeArray(
        evidenceIds
      ),

    observations:
      safeArray(
        observations
      ),

    concerns:
      safeArray(
        concerns
      ),

    recommendation,
  };
}

function createExplanationResult({
  title = "",
  summary = "",
  whatHappened = "",
  likelyCause = "",
  evidenceSummary = [],
  decisionSummary = "",
  actionSummary = [],
  policySummary = "",
  verificationSummary = "",
  rollbackSummary = "",
  finalOutcome = "",
  manualReason = null,
  timeline = [],
  confidenceNotes = [],
  operatorNextSteps = [],
} = {}) {
  return {
    title,

    summary,

    whatHappened,

    likelyCause,

    evidenceSummary:
      safeArray(
        evidenceSummary
      ),

    decisionSummary,

    actionSummary:
      safeArray(
        actionSummary
      ),

    policySummary,

    verificationSummary,

    rollbackSummary,

    finalOutcome,

    manualReason,

    timeline:
      safeArray(
        timeline
      ),

    confidenceNotes:
      safeArray(
        confidenceNotes
      ),

    operatorNextSteps:
      safeArray(
        operatorNextSteps
      ),
  };
}

function createLearningRecommendation({
  patterns = [],
  recommendations = [],
  playbookInsights = [],
  runbookInsights = [],
  policyInsights = [],
} = {}) {
  return {
    patterns:
      safeArray(
        patterns
      ),

    recommendations:
      safeArray(
        recommendations
      ),

    playbookInsights:
      safeArray(
        playbookInsights
      ),

    runbookInsights:
      safeArray(
        runbookInsights
      ),

    policyInsights:
      safeArray(
        policyInsights
      ),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Constants
  EVIDENCE_TYPE,

  EVIDENCE_SOURCE_TYPE,

  AGENT_STATUS,

  DIAGNOSIS_STATE,

  ORCHESTRATION_STATE,

  RECOVERY_STATE,

  PLAYBOOK_RECOMMENDATION,

  MONITORING_RECOMMENDATION,

  DIAGNOSIS_OUTCOME,

  HYPOTHESIS_STATUS,

  CONTRADICTION_TYPE,

  RISK_LEVEL,

  DIAGNOSIS_NEXT_STEP,

  AGENT_MANUAL_REASON,

  // Phase 6 factories
  createEvidenceItem,

  createEvidencePackage,

  createSymptom,

  createContradiction,

  createHypothesis,

  createRiskAssessment,

  createRecommendedNextStep,

  createDiagnosisResult,

  createAgentFinding,

  createAgentExecutionRecord,

  createInvestigationContext,

  // Backward-compatible runtime contracts
  createAgentContext,

  createPlaybookRecommendation,

  createParameterRecommendation,

  createRecoveryObservation,

  createExplanationResult,

  createLearningRecommendation,

  // Helpers
  clampConfidence,
};