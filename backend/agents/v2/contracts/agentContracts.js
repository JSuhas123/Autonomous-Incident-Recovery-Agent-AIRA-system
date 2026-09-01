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
const crypto =
  require(
    "node:crypto"
  );

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
// PHASE 12.4 — CANONICAL EVIDENCE CONTRACT
// ============================================================================

const EVIDENCE_SCHEMA_VERSION =
  "12.4-v1";

/**
 * Trust describes how AIRA obtained the evidence.
 *
 * It does NOT mean the evidence proves a hypothesis.
 */
const EVIDENCE_TRUST_LEVEL =
  Object.freeze({
    /**
     * Produced from AIRA-owned canonical state such as persisted incident
     * lifecycle or topology calculations.
     */
    CANONICAL:
      "CANONICAL",

    /**
     * Reported by an authenticated/integrated external telemetry source and
     * canonicalized by AIRA.
     */
    SOURCE_REPORTED:
      "SOURCE_REPORTED",

    /**
     * Origin could not be independently established.
     */
    UNVERIFIED:
      "UNVERIFIED",
  });

const EVIDENCE_INTEGRITY_STATUS =
  Object.freeze({
    VERIFIED:
      "VERIFIED",

    UNVERIFIED:
      "UNVERIFIED",

    INVALID:
      "INVALID",
  });

const EVIDENCE_FRESHNESS_STATE =
  Object.freeze({
    FRESH:
      "FRESH",

    AGING:
      "AGING",

    STALE:
      "STALE",

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

    /*
     * Distinct from FAILED.
     *
     * The agent operated correctly but the available evidence was not
     * sufficient to produce a safe conclusion.
     */
    INSUFFICIENT_EVIDENCE:
      "INSUFFICIENT_EVIDENCE",

    MANUAL_REQUIRED:
      "MANUAL_REQUIRED",

    FAILED:
      "FAILED",

    /*
     * Preserved for compatibility when an agent is intentionally not required
     * for a particular incident/workflow.
     */
    SKIPPED:
      "SKIPPED",
  });


  // ============================================================================
// PHASE 12.3 — CANONICAL AGENT RESULT
// ============================================================================

const AGENT_RESULT_SCHEMA_VERSION =
  "12.3-v1";

const VALID_AGENT_RESULT_STATUSES =
  new Set(
    Object.values(
      AGENT_STATUS
    )
  );
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

    REQUIRE_APPROVAL:
      "REQUIRE_APPROVAL",

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
// PHASE 12.5 — ROOT-CAUSE HYPOTHESIS CONTRACT
// ============================================================================

const HYPOTHESIS_SCHEMA_VERSION =
  "12.5-v1";

/**
 * Describes how a hypothesis entered the reasoning graph.
 *
 * This is provenance of the hypothesis itself, not proof of correctness.
 */
const HYPOTHESIS_ORIGIN =
  Object.freeze({
    DETERMINISTIC:
      "DETERMINISTIC",

    AI:
      "AI",

    HYBRID:
      "HYBRID",

    UNKNOWN:
      "UNKNOWN",
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
// PHASE 12.2 — CANONICAL AGENT CONTEXT
// ============================================================================

/**
 * Version of the canonical context contract shared by the Phase-12
 * intelligence pipeline.
 *
 * Increment deliberately when making backwards-incompatible structural
 * changes.
 */
const AGENT_CONTEXT_SCHEMA_VERSION =
  "12.2-v1";

/**
 * Credential-like keys that must never cross into agent reasoning context.
 *
 * IMPORTANT:
 *
 * Do not use a generic /token/ match here because legitimate metadata such as
 * tokenEstimate, inputTokens and outputTokens is not a credential.
 */
const AGENT_CONTEXT_SECRET_KEYS =
  new Set([
    "password",
    "passwd",
    "secret",
    "clientsecret",
    "apikey",
    "accesstoken",
    "refreshtoken",
    "sessiontoken",
    "authorization",
    "authheader",
    "privatekey",
    "credential",
    "credentials",
    "bearertoken",
    "cookie",
    "setcookie",
    "xapikey",
  ]);

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

/**
 * Return true only for ordinary JSON-style objects.
 *
 * We intentionally avoid recursively walking Date, ObjectId, Buffer and other
 * class instances because context sanitization should not mutate their
 * semantics.
 */
function isPlainAgentContextObject(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    return false;
  }

  const prototype =
    Object.getPrototypeOf(
      value
    );

  return (
    prototype ===
      Object.prototype ||
    prototype ===
      null
  );
}

/**
 * Normalize a field name for secret-key comparison.
 */
function normalizeAgentContextKey(
  key
) {
  return String(
    key ||
    ""
  )
    .replace(
      /[^a-zA-Z0-9]/g,
      ""
    )
    .toLowerCase();
}

/**
 * Returns true when a context object key represents credential material.
 */
function isAgentContextSecretKey(
  key
) {
  return AGENT_CONTEXT_SECRET_KEYS
    .has(
      normalizeAgentContextKey(
        key
      )
    );
}

/**
 * Recursively sanitize untrusted/contextual data before exposing it to agents.
 *
 * Credential values are replaced rather than copied.
 *
 * This function does NOT attempt to sanitize prose content. Prompt-injection
 * handling belongs to Phase 12.13. This boundary specifically prevents raw
 * secrets and credential structures from entering AgentContext.
 */
function sanitizeAgentContextValue(
  value,
  seen =
    new WeakSet()
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return value;
  }

  if (
    Array.isArray(
      value
    )
  ) {
    return value
      .map(
        (
          item
        ) =>
          sanitizeAgentContextValue(
            item,
            seen
          )
      );
  }

  if (
    !isPlainAgentContextObject(
      value
    )
  ) {
    return value;
  }

  if (
    seen.has(
      value
    )
  ) {
    return "[CIRCULAR]";
  }

  seen.add(
    value
  );

  const sanitized =
    {};

  for (
    const [
      key,
      rawValue,
    ] of Object.entries(
      value
    )
  ) {
    if (
      isAgentContextSecretKey(
        key
      )
    ) {
      sanitized[
        key
      ] =
        "[REDACTED]";

      continue;
    }

    sanitized[
      key
    ] =
      sanitizeAgentContextValue(
        rawValue,
        seen
      );
  }

  seen.delete(
    value
  );

  return sanitized;
}

/**
 * Normalize an optional finite non-negative budget value.
 *
 * Phase 12.2 defines the contract.
 * Phase 12.12 will enforce these budgets operationally.
 */
function normalizeAgentBudgetValue(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return null;
  }

  const numeric =
    Number(
      value
    );

  if (
    !Number.isFinite(
      numeric
    ) ||
    numeric <
      0
  ) {
    return null;
  }

  return numeric;
}

/**
 * Canonical budget envelope.
 *
 * No hidden defaults are invented here because runtime limits currently come
 * from agentBudgets.js. Phase 12.12 will make their enforcement authoritative.
 */
function createAgentBudgetContext(
  budgets = {}
) {
  const safeBudgets =
    sanitizeAgentContextValue(
      budgets ||
      {}
    );

  return {
    maxSteps:
      normalizeAgentBudgetValue(
        safeBudgets
          .maxSteps
      ),

    maxToolCalls:
      normalizeAgentBudgetValue(
        safeBudgets
          .maxToolCalls
      ),

    maxModelCalls:
      normalizeAgentBudgetValue(
        safeBudgets
          .maxModelCalls
      ),

    maxRetries:
      normalizeAgentBudgetValue(
        safeBudgets
          .maxRetries
      ),

    maxInputTokens:
      normalizeAgentBudgetValue(
        safeBudgets
          .maxInputTokens
      ),

    maxOutputTokens:
      normalizeAgentBudgetValue(
        safeBudgets
          .maxOutputTokens
      ),

    timeoutMs:
      normalizeAgentBudgetValue(
        safeBudgets
          .timeoutMs
      ),

    maxEstimatedCost:
      normalizeAgentBudgetValue(
        safeBudgets
          .maxEstimatedCost
      ),
  };
}

// ============================================================================
// PHASE 12.4 — EVIDENCE HELPERS
// ============================================================================

function normalizeEvidenceTimestamp(
  value,
  fallback = null
) {
  const candidate =
    value ??
    fallback;

  if (
    candidate ===
      null ||
    candidate ===
      undefined ||
    candidate ===
      ""
  ) {
    return null;
  }

  const date =
    new Date(
      candidate
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date
    .toISOString();
}

function normalizeEvidenceTrustLevel(
  value
) {
  if (
    Object.values(
      EVIDENCE_TRUST_LEVEL
    )
      .includes(
        value
      )
  ) {
    return value;
  }

  return EVIDENCE_TRUST_LEVEL
    .UNVERIFIED;
}

function evidenceFreshnessState(
  freshness
) {
  const normalized =
    clampConfidence(
      freshness,
      null
    );

  if (
    normalized ===
    null
  ) {
    return EVIDENCE_FRESHNESS_STATE
      .UNKNOWN;
  }

  if (
    normalized >=
    0.75
  ) {
    return EVIDENCE_FRESHNESS_STATE
      .FRESH;
  }

  if (
    normalized >=
    0.4
  ) {
    return EVIDENCE_FRESHNESS_STATE
      .AGING;
  }

  return EVIDENCE_FRESHNESS_STATE
    .STALE;
}

/**
 * Stable JSON-compatible representation used only for evidence fingerprinting.
 *
 * This is NOT a digital signature and does not authenticate the external
 * telemetry provider. It detects mutation of evidence after canonicalization.
 */
function stableEvidenceValue(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return value;
  }

  if (
    value instanceof
    Date
  ) {
    return value
      .toISOString();
  }

  if (
    Array.isArray(
      value
    )
  ) {
    return value
      .map(
        (
          entry
        ) =>
          stableEvidenceValue(
            entry
          )
      );
  }

  if (
    typeof value ===
      "object"
  ) {
    if (
      typeof value.toJSON ===
      "function"
    ) {
      try {
        return stableEvidenceValue(
          value.toJSON()
        );
      } catch {
        // Fall through to normal object handling.
      }
    }

    const result =
      {};

    for (
      const key of
      Object.keys(
        value
      )
        .sort()
    ) {
      result[
        key
      ] =
        stableEvidenceValue(
          value[
            key
          ]
        );
    }

    return result;
  }

  return value;
}

function evidenceHashPayload(
  evidence
) {
  return {
    id:
      evidence
        ?.id ||
      null,

    type:
      evidence
        ?.type ||
      null,

    source:
      evidence
        ?.source ||
      null,

    sourceType:
      evidence
        ?.sourceType ||
      null,

    provider:
      evidence
        ?.provider ||
      null,

    observedAt:
      evidence
        ?.observedAt ||
      null,

    serviceId:
      evidence
        ?.serviceId ||
      null,

    resource:
      evidence
        ?.resource ||
      {},

    summary:
      evidence
        ?.summary ||
      "",

    structuredData:
      evidence
        ?.structuredData ??
      null,

    correlationId:
      evidence
        ?.correlationId ||
      null,

    correlationGroupId:
      evidence
        ?.correlationGroupId ||
      null,

    signalId:
      evidence
        ?.signalId ||
      null,

    incidentEventId:
      evidence
        ?.incidentEventId ||
      null,
  };
}

function computeEvidenceContentHash(
  evidence
) {
  const serialized =
    JSON.stringify(
      stableEvidenceValue(
        evidenceHashPayload(
          evidence
        )
      )
    );

  return crypto
    .createHash(
      "sha256"
    )
    .update(
      serialized
    )
    .digest(
      "hex"
    );
}

/**
 * Verify the canonical content fingerprint.
 *
 * Legacy evidence without an integrity fingerprint remains readable but is
 * classified UNVERIFIED rather than INVALID.
 */
function verifyEvidenceIntegrity(
  evidence
) {
  const expected =
    evidence
      ?.integrity
      ?.contentHash;

  if (
    !expected
  ) {
    return {
      valid:
        null,

      status:
        EVIDENCE_INTEGRITY_STATUS
          .UNVERIFIED,

      expected:
        null,

      actual:
        null,
    };
  }

  const actual =
    computeEvidenceContentHash(
      evidence
    );

  const valid =
    expected ===
    actual;

  return {
    valid,

    status:
      valid
        ? EVIDENCE_INTEGRITY_STATUS
            .VERIFIED
        : EVIDENCE_INTEGRITY_STATUS
            .INVALID,

    expected,

    actual,
  };
}

function deriveEvidenceResourceIdentity(
  resource
) {
  if (
    !resource ||
    typeof resource !==
      "object"
  ) {
    return null;
  }

  const type =
    resource.type ||
    resource.kind ||
    resource.resourceType ||
    null;

  const name =
    resource.name ||
    resource.resourceName ||
    resource.pod ||
    resource.deployment ||
    resource.instance ||
    null;

  const namespace =
    resource.namespace ||
    null;

  const cluster =
    resource.cluster ||
    resource.clusterName ||
    null;

  if (
    !type &&
    !name &&
    !namespace &&
    !cluster
  ) {
    return null;
  }

  return {
    type:
      type
        ? String(
            type
          )
        : null,

    name:
      name
        ? String(
            name
          )
        : null,

    namespace:
      namespace
        ? String(
            namespace
          )
        : null,

    cluster:
      cluster
        ? String(
            cluster
          )
        : null,
  };
}
// ============================================================================
// EVIDENCE ITEM
// ============================================================================

function createEvidenceItem({
  schemaVersion =
    EVIDENCE_SCHEMA_VERSION,

  id,
  type,

  source,
  sourceType,

  timestamp,
  observedAt,
  collectedAt = null,

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

  trustLevel =
    EVIDENCE_TRUST_LEVEL
      .UNVERIFIED,

  provenance = {},

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

  const resolvedSourceType =
    sourceType ||
    EVIDENCE_SOURCE_TYPE
      .MANUAL;

  if (
    !Object.values(
      EVIDENCE_SOURCE_TYPE
    )
      .includes(
        resolvedSourceType
      )
  ) {
    throw new TypeError(
      `Unknown evidence source type: ${resolvedSourceType}`
    );
  }

  const resolvedCollectedAt =
    normalizeEvidenceTimestamp(
      collectedAt,
      new Date()
    );

  const resolvedObservedAt =
    normalizeEvidenceTimestamp(
      observedAt ||
      timestamp,
      resolvedCollectedAt
    );

  /*
   * timestamp remains a compatibility alias for observedAt.
   */
  const resolvedTimestamp =
    resolvedObservedAt ||
    resolvedCollectedAt;

  const effectiveRedacted =
    Boolean(
      redacted ||
      sensitive
    );

  const safeResource =
    sanitizeAgentContextValue(
      resource ||
      {}
    );

  const safeService =
    sanitizeAgentContextValue(
      service
    );

  const safeStructuredData =
    effectiveRedacted
      ? "[REDACTED]"
      : sanitizeAgentContextValue(
          structuredData ||
          {}
        );

  const normalizedFreshness =
    clampConfidence(
      freshness,
      null
    );

  let ageMs =
    null;

  if (
    resolvedObservedAt &&
    resolvedCollectedAt
  ) {
    ageMs =
      Math.max(
        0,
        new Date(
          resolvedCollectedAt
        )
          .getTime() -
        new Date(
          resolvedObservedAt
        )
          .getTime()
      );
  }

  const safeProvenance =
    sanitizeAgentContextValue(
      provenance ||
      {}
    );

  const canonical = {
    schemaVersion:
      String(
        schemaVersion ||
        EVIDENCE_SCHEMA_VERSION
      ),

    canonicalRef:
      `evidence:${String(
        id
      )}`,

    id:
      String(
        id
      ),

    type,

    source:
      source ||
      "unknown",

    sourceType:
      resolvedSourceType,

    provider:
      provider ||
      null,

    timestamp:
      resolvedTimestamp,

    observedAt:
      resolvedObservedAt,

    collectedAt:
      resolvedCollectedAt,

    ageMs,

    resource:
      safeResource,

    resourceIdentity:
      deriveEvidenceResourceIdentity(
        safeResource
      ),

    service:
      safeService ||
      null,

    serviceId:
      serviceId
        ? String(
            serviceId
          )
        : null,

    signalId:
      signalId
        ? String(
            signalId
          )
        : null,

    incidentEventId:
      incidentEventId
        ? String(
            incidentEventId
          )
        : null,

    summary:
      summary ||
      "",

    structuredData:
      safeStructuredData,

    confidence:
      clampConfidence(
        confidence,
        null
      ),

    freshness:
      normalizedFreshness,

    freshnessState:
      evidenceFreshnessState(
        normalizedFreshness
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
      effectiveRedacted,

    trust: {
      level:
        normalizeEvidenceTrustLevel(
          trustLevel
        ),

      reason:
        safeProvenance
          ?.trustReason ||
        null,
    },

    provenance: {
      collector:
        safeProvenance
          ?.collector ||
        null,

      retrievalMethod:
        safeProvenance
          ?.retrievalMethod ||
        null,

      sourceRef:
        safeProvenance
          ?.sourceRef ||
        null,

      canonicalStore:
        safeProvenance
          ?.canonicalStore ||
        null,

      source:
        source ||
        "unknown",

      sourceType:
        resolvedSourceType,

      provider:
        provider ||
        null,

      observedAt:
        resolvedObservedAt,

      collectedAt:
        resolvedCollectedAt,

      metadata:
        safeProvenance
          ?.metadata ||
        {},
    },

    tags:
      Array.from(
        new Set(
          safeArray(
            tags
          )
            .filter(
              Boolean
            )
            .map(
              (
                tag
              ) =>
                String(
                  tag
                )
            )
        )
      ),
  };

  const contentHash =
    computeEvidenceContentHash(
      canonical
    );

  return Object.freeze({
    ...canonical,

    integrity: Object.freeze({
      algorithm:
        "sha256",

      contentHash,

      status:
        EVIDENCE_INTEGRITY_STATUS
          .VERIFIED,
    }),
  });
}

// ============================================================================
// EVIDENCE PACKAGE
// ============================================================================

function createEvidencePackage({
  schemaVersion =
    EVIDENCE_SCHEMA_VERSION,

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

  metadata = {},
} = {}) {
  if (
    !incidentId
  ) {
    throw new TypeError(
      "EvidencePackage.incidentId is required"
    );
  }

  const evidenceItems =
    safeArray(
      items
    );

  const evidenceIds =
    evidenceItems
      .map(
        (
          item
        ) =>
          item
            ?.id
      )
      .filter(
        Boolean
      )
      .map(
        String
      );

  const idCounts =
    new Map();

  for (
    const id of
    evidenceIds
  ) {
    idCounts.set(
      id,
      (
        idCounts.get(
          id
        ) ||
        0
      ) +
      1
    );
  }

  const duplicateEvidenceIds =
    Array.from(
      idCounts.entries()
    )
      .filter(
        (
          [
            ,
            count,
          ]
        ) =>
          count >
          1
      )
      .map(
        (
          [
            id,
          ]
        ) =>
          id
      );

  const typeCoverage =
    Array.from(
      new Set(
        evidenceItems
          .map(
            (
              item
            ) =>
              item
                ?.type
          )
          .filter(
            Boolean
          )
      )
    );

  const sourceCoverage =
    Array.from(
      new Set(
        evidenceItems
          .map(
            (
              item
            ) =>
              item
                ?.sourceType
          )
          .filter(
            Boolean
          )
      )
    );

  const calculatedStaleEvidence =
    evidenceItems
      .filter(
        (
          item
        ) =>
          item
            ?.freshnessState ===
          EVIDENCE_FRESHNESS_STATE
            .STALE
      )
      .map(
        (
          item
        ) =>
          item.id
      );

  const integritySummary = {
    verified:
      0,

    unverified:
      0,

    invalid:
      0,
  };

  const trustSummary = {
    canonical:
      0,

    sourceReported:
      0,

    unverified:
      0,
  };

  for (
    const item of
    evidenceItems
  ) {
    const verification =
      verifyEvidenceIntegrity(
        item
      );

    if (
      verification.status ===
      EVIDENCE_INTEGRITY_STATUS
        .VERIFIED
    ) {
      integritySummary.verified +=
        1;
    } else if (
      verification.status ===
      EVIDENCE_INTEGRITY_STATUS
        .INVALID
    ) {
      integritySummary.invalid +=
        1;
    } else {
      integritySummary.unverified +=
        1;
    }

    switch (
      item
        ?.trust
        ?.level
    ) {
      case EVIDENCE_TRUST_LEVEL
        .CANONICAL:
        trustSummary.canonical +=
          1;
        break;

      case EVIDENCE_TRUST_LEVEL
        .SOURCE_REPORTED:
        trustSummary.sourceReported +=
          1;
        break;

      default:
        trustSummary.unverified +=
          1;
        break;
    }
  }

  return {
    schemaVersion:
      String(
        schemaVersion ||
        EVIDENCE_SCHEMA_VERSION
      ),

    incidentId:
      String(
        incidentId
      ),

    correlationId:
      correlationId ||
      `incident:${incidentId}`,

    correlationGroupId,

    items:
      evidenceItems,

    itemCount:
      evidenceItems
        .length,

    evidenceRefs:
      evidenceItems
        .map(
          (
            item
          ) =>
            item
              ?.canonicalRef ||
            (
              item
                ?.id
                ? `evidence:${item.id}`
                : null
            )
        )
        .filter(
          Boolean
        ),

    completeness:
      clampConfidence(
        completeness,
        0
      ),

    missingEvidence:
      Array.from(
        new Set(
          safeArray(
            missingEvidence
          )
            .map(
              String
            )
        )
      ),

    staleEvidence:
      Array.from(
        new Set([
          ...safeArray(
            staleEvidence
          )
            .map(
              String
            ),

          ...calculatedStaleEvidence
            .map(
              String
            ),
        ])
      ),

    conflicts:
      safeArray(
        conflicts
      ),

    recommendedNextEvidence:
      Array.from(
        new Set(
          safeArray(
            recommendedNextEvidence
          )
            .map(
              String
            )
        )
      ),

    providerCoverage:
      Array.from(
        new Set(
          safeArray(
            providerCoverage
          )
            .filter(
              Boolean
            )
            .map(
              String
            )
        )
      ),

    typeCoverage,

    sourceCoverage,

    duplicateEvidenceIds,

    integritySummary,

    trustSummary,

    signalCount:
      Math.max(
        0,
        Number(
          signalCount
        ) ||
        0
      ),

    collectedAt:
      normalizeEvidenceTimestamp(
        collectedAt,
        new Date()
      ),

    metadata:
      sanitizeAgentContextValue(
        metadata ||
        {}
      ),
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
  schemaVersion =
    HYPOTHESIS_SCHEMA_VERSION,

  id,
  rootCause,

  title = null,
  category = null,

  /*
   * Canonical machine-readable failure identity.
   *
   * This is diagnosis output, not authorization.
   */
  failureModeKey = null,

  confidence,

  status =
    HYPOTHESIS_STATUS
      .PROPOSED,

  origin =
    HYPOTHESIS_ORIGIN
      .UNKNOWN,

  evidenceSupporting = [],
  evidenceAgainst = [],

  contradictions = [],

  affectedResources = [],
  affectedServices = [],

  explanation = "",

  causalChain = [],

  assumptions = [],
  unknowns = [],

  competingHypothesisIds = [],
  ambiguityGroupId = null,

  scoreBreakdown = null,

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

  const validStatuses =
    Object.values(
      HYPOTHESIS_STATUS
    );

  const resolvedStatus =
    validStatuses.includes(
      status
    )
      ? status
      : HYPOTHESIS_STATUS
          .PROPOSED;

  const validOrigins =
    Object.values(
      HYPOTHESIS_ORIGIN
    );

  const resolvedOrigin =
    validOrigins.includes(
      origin
    )
      ? origin
      : HYPOTHESIS_ORIGIN
          .UNKNOWN;

  const supporting =
    Array.from(
      new Set(
        safeArray(
          evidenceSupporting
        )
          .filter(
            Boolean
          )
          .map(
            String
          )
      )
    );

  const against =
    Array.from(
      new Set(
        safeArray(
          evidenceAgainst
        )
          .filter(
            Boolean
          )
          .map(
            String
          )
      )
    );

  const normalizedAssumptions =
    Array.from(
      new Set(
        safeArray(
          assumptions
        )
          .filter(
            Boolean
          )
          .map(
            String
          )
      )
    );

  const normalizedUnknowns =
    Array.from(
      new Set(
        safeArray(
          unknowns
        )
          .filter(
            Boolean
          )
          .map(
            String
          )
      )
    );

  const normalizedFailureModeKey =
    typeof failureModeKey ===
      "string" &&
    failureModeKey.trim()
      ? failureModeKey
          .trim()
      : null;

  return {
    schemaVersion:
      String(
        schemaVersion ||
        HYPOTHESIS_SCHEMA_VERSION
      ),

    id:
      String(
        id
      ),

    rootCause:
      String(
        rootCause
      ),

    title:
      title ||
      rootCause,

    category:
      category ||
      null,

    failureModeKey:
      normalizedFailureModeKey,

    confidence:
      clampConfidence(
        confidence,
        0
      ),

    status:
      resolvedStatus,

    origin:
      resolvedOrigin,

    evidenceSupporting:
      supporting,

    evidenceAgainst:
      against,

    contradictions:
      safeArray(
        contradictions
      ),

    affectedResources:
      Array.from(
        new Set(
          safeArray(
            affectedResources
          )
            .filter(
              Boolean
            )
            .map(
              String
            )
        )
      ),

    affectedServices:
      Array.from(
        new Set(
          safeArray(
            affectedServices
          )
            .filter(
              Boolean
            )
            .map(
              String
            )
        )
      ),

    explanation:
      explanation ||
      "",

    causalChain:
      safeArray(
        causalChain
      ),

    assumptions:
      normalizedAssumptions,

    unknowns:
      normalizedUnknowns,

    competingHypothesisIds:
      Array.from(
        new Set(
          safeArray(
            competingHypothesisIds
          )
            .filter(
              Boolean
            )
            .map(
              String
            )
        )
      ),

    ambiguityGroupId:
      ambiguityGroupId
        ? String(
            ambiguityGroupId
          )
        : null,

    scoreBreakdown:
      scoreBreakdown &&
      typeof scoreBreakdown ===
        "object"
        ? scoreBreakdown
        : null,

    rank:
      rank ===
        null ||
      rank ===
        undefined
        ? null
        : Number(
            rank
          ),
  };
}
// ============================================================================
// PHASE 12.6 — CANONICAL DIAGNOSIS RESULT
// ============================================================================

const DIAGNOSIS_RESULT_SCHEMA_VERSION =
  "12.6-v1";

// ============================================================================
// PHASE 12.7 — CANONICAL RISK ASSESSMENT
// ============================================================================

const RISK_ASSESSMENT_SCHEMA_VERSION =
  "12.7-v1";
// ============================================================================
// RISK ASSESSMENT
// ============================================================================

function createRiskAssessment({
  schemaVersion =
    RISK_ASSESSMENT_SCHEMA_VERSION,

  level =
    RISK_LEVEL.MEDIUM,

  score = 0,

  confidence = 0,

  impactLevel = null,

  urgency = null,

  userFacing = false,

  blastRadiusServiceCount = 0,

  blastRadiusResourceCount = 0,

  affectedServices = [],

  affectedResources = [],

  criticality = 0,

  availabilityRisk = false,

  dataRisk = false,

  securityRisk = false,

  financialRisk = false,

  cascadingRisk = false,

  recurrenceRisk = false,

  reversibility =
    "UNKNOWN",

  approvalRequired = false,

  autonomousRecoveryEligible = false,

  reasons = [],

  riskFactors = [],

  unknowns = [],
} = {}) {
  const validLevels =
    Object.values(
      RISK_LEVEL
    );

  const normalizedLevel =
    validLevels.includes(
      level
    )
      ? level
      : RISK_LEVEL.MEDIUM;

  /*
   * HIGH / CRITICAL incident risk must never silently become
   * autonomously recoverable at the contract layer.
   */
  const highRisk =
    normalizedLevel ===
      RISK_LEVEL.HIGH ||
    normalizedLevel ===
      RISK_LEVEL.CRITICAL;

  const normalizedApprovalRequired =
    Boolean(
      approvalRequired ||
      highRisk
    );

  const normalizedAutonomousEligibility =
    Boolean(
      autonomousRecoveryEligible &&
      !highRisk &&
      !normalizedApprovalRequired
    );

  return {
    schemaVersion:
      String(
        schemaVersion ||
        RISK_ASSESSMENT_SCHEMA_VERSION
      ),

    level:
      normalizedLevel,

    score:
      clampConfidence(
        score,
        0
      ),

    confidence:
      clampConfidence(
        confidence,
        0
      ),

    impactLevel:
      impactLevel ||
      null,

    urgency:
      urgency ||
      null,

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

    affectedServices:
      Array.from(
        new Set(
          safeArray(
            affectedServices
          )
            .filter(
              Boolean
            )
            .map(
              String
            )
        )
      ),

    affectedResources:
      Array.from(
        new Set(
          safeArray(
            affectedResources
          )
            .filter(
              Boolean
            )
            .map(
              String
            )
        )
      ),

    criticality:
      clampConfidence(
        criticality,
        0
      ),

    availabilityRisk:
      Boolean(
        availabilityRisk
      ),

    dataRisk:
      Boolean(
        dataRisk
      ),

    securityRisk:
      Boolean(
        securityRisk
      ),

    financialRisk:
      Boolean(
        financialRisk
      ),

    cascadingRisk:
      Boolean(
        cascadingRisk
      ),

    recurrenceRisk:
      Boolean(
        recurrenceRisk
      ),

    reversibility:
      String(
        reversibility ||
        "UNKNOWN"
      )
        .trim()
        .toUpperCase(),

    approvalRequired:
      normalizedApprovalRequired,

    autonomousRecoveryEligible:
      normalizedAutonomousEligibility,

    reasons:
      Array.from(
        new Set(
          safeArray(
            reasons
          )
            .filter(
              Boolean
            )
            .map(
              String
            )
        )
      ),

    riskFactors:
      safeArray(
        riskFactors
      ),

    unknowns:
      Array.from(
        new Set(
          safeArray(
            unknowns
          )
            .filter(
              Boolean
            )
            .map(
              String
            )
        )
      ),

    /*
     * Risk assessment describes safety characteristics.
     * It NEVER authorizes execution.
     */
    executionAuthorized:
      false,
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
  schemaVersion =
    DIAGNOSIS_RESULT_SCHEMA_VERSION,

  hypotheses = [],

  primaryHypothesis = null,

  primaryHypothesisId = null,

  alternateHypothesisIds = [],

  plausibleHypothesisIds = [],

  ambiguity = null,

  diagnosisConfidence = 0,

  evidenceCompleteness = 0,

  supportingEvidenceIds = [],

  contradictingEvidenceIds = [],

  assumptions = [],

  unresolvedQuestions = [],

  recommendedIncidentType = null,

  symptoms = [],

  contradictions = [],

  risk = null,

  verificationStatus = null,

  acceptedHypothesisId = null,

  outcome =
    DIAGNOSIS_OUTCOME.UNKNOWN,

  summary = "",

  unknowns = [],

  recommendedNextStep = null,

  falsePositiveSuspected = false,

  analyzedAt = null,

  metadata = null,
} = {}) {
  const normalizedHypotheses =
    safeArray(
      hypotheses
    );

  const resolvedPrimaryId =
    primaryHypothesisId ||
    (
      typeof primaryHypothesis ===
        "string"
        ? primaryHypothesis
        : primaryHypothesis?.id
    ) ||
    null;

  const inferredAlternates =
    normalizedHypotheses
      .map(
        (hypothesis) =>
          hypothesis?.id
      )
      .filter(
        (id) =>
          Boolean(
            id
          ) &&
          String(
            id
          ) !==
            String(
              resolvedPrimaryId
            )
      );

  const normalizedAlternateIds =
    Array.from(
      new Set(
        [
          ...safeArray(
            alternateHypothesisIds
          ),

          ...inferredAlternates,
        ]
          .filter(
            Boolean
          )
          .map(
            String
          )
      )
    );

  const normalizedPlausibleIds =
    Array.from(
      new Set(
        safeArray(
          plausibleHypothesisIds
        )
          .filter(
            Boolean
          )
          .map(
            String
          )
      )
    );

  const normalizedSupportingEvidence =
    Array.from(
      new Set(
        safeArray(
          supportingEvidenceIds
        )
          .filter(
            Boolean
          )
          .map(
            String
          )
      )
    );

  const normalizedContradictingEvidence =
    Array.from(
      new Set(
        safeArray(
          contradictingEvidenceIds
        )
          .filter(
            Boolean
          )
          .map(
            String
          )
      )
    );

  const normalizedAssumptions =
    Array.from(
      new Set(
        safeArray(
          assumptions
        )
          .filter(
            Boolean
          )
          .map(
            String
          )
      )
    );

  const normalizedUnknowns =
    Array.from(
      new Set(
        [
          ...safeArray(
            unknowns
          ),

          ...safeArray(
            unresolvedQuestions
          ),
        ]
          .filter(
            Boolean
          )
          .map(
            String
          )
      )
    );

  const normalizedAmbiguity =
    ambiguity &&
    typeof ambiguity ===
      "object"
      ? {
          ambiguous:
            Boolean(
              ambiguity.ambiguous
            ),

          confidenceGap:
            ambiguity.confidenceGap ??
            null,

          plausibleHypothesisIds:
            Array.from(
              new Set(
                safeArray(
                  ambiguity
                    .plausibleHypothesisIds
                )
                  .filter(
                    Boolean
                  )
                  .map(
                    String
                  )
              )
            ),

          topHypothesisId:
            ambiguity.topHypothesisId ||
            resolvedPrimaryId ||
            null,

          secondHypothesisId:
            ambiguity.secondHypothesisId ||
            null,
        }
      : {
          ambiguous:
            normalizedPlausibleIds.length >
            1,

          confidenceGap:
            null,

          plausibleHypothesisIds:
            normalizedPlausibleIds,

          topHypothesisId:
            resolvedPrimaryId,

          secondHypothesisId:
            normalizedAlternateIds[0] ||
            null,
        };

  return {
    schemaVersion:
      String(
        schemaVersion ||
        DIAGNOSIS_RESULT_SCHEMA_VERSION
      ),

    hypotheses:
      normalizedHypotheses,

    /*
     * Backwards-compatible field.
     *
     * IMPORTANT:
     * Primary means highest-ranked/selected hypothesis.
     * It does NOT automatically mean verified root cause.
     */
    primaryHypothesis,

    primaryHypothesisId:
      resolvedPrimaryId,

    alternateHypothesisIds:
      normalizedAlternateIds,

    plausibleHypothesisIds:
      normalizedPlausibleIds.length >
        0
        ? normalizedPlausibleIds
        : normalizedAmbiguity
            .plausibleHypothesisIds,

    ambiguity:
      normalizedAmbiguity,

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

    supportingEvidenceIds:
      normalizedSupportingEvidence,

    contradictingEvidenceIds:
      normalizedContradictingEvidence,

    assumptions:
      normalizedAssumptions,

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

    verificationStatus:
      verificationStatus ||
      null,

    acceptedHypothesisId:
      acceptedHypothesisId ||
      null,

    outcome,

    summary,

    unknowns:
      normalizedUnknowns,

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

    metadata:
      metadata &&
      typeof metadata ===
        "object"
        ? metadata
        : {},

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


function normalizeNullableNonNegativeNumber(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return null;
  }

  const numeric =
    Number(
      value
    );

  if (
    !Number.isFinite(
      numeric
    ) ||
    numeric <
      0
  ) {
    return null;
  }

  return numeric;
}

function uniqueAgentResultStrings(
  values
) {
  return Array.from(
    new Set(
      safeArray(
        values
      )
        .filter(
          (
            value
          ) =>
            value !==
              null &&
            value !==
              undefined &&
            String(
              value
            )
              .trim()
              .length >
              0
        )
        .map(
          (
            value
          ) =>
            String(
              value
            )
              .trim()
        )
    )
  );
}
// ============================================================================
// AGENT EXECUTION RECORD
// ============================================================================

function createAgentExecutionRecord({
  schemaVersion =
    AGENT_RESULT_SCHEMA_VERSION,

  agent,
  version,
  status,

  startedAt,
  completedAt = null,

  confidence = null,

  result = null,

  evidenceUsed = [],
  evidenceMissing = [],
  assumptions = [],
  warnings = [],

  nextRecommendedStage = null,

  error = null,

  /*
   * Canonical model metadata.
   */
  modelMetadata = null,

  /*
   * Legacy aliases.
   *
   * Existing agents currently pass these separately, so preserve them while
   * building the new canonical modelMetadata object.
   */
  model = null,
  provider = null,
  tokenEstimate = null,

  inputTokens = null,
  outputTokens = null,
  totalTokens = null,
  latencyMs = null,
  estimatedCost = null,

  fallbackUsed = false,

  metadata = {},
} = {}) {
  if (
    !agent
  ) {
    throw new TypeError(
      "AgentResult.agent is required"
    );
  }

  if (
    !version
  ) {
    throw new TypeError(
      "AgentResult.version is required"
    );
  }

  if (
    !status
  ) {
    throw new TypeError(
      "AgentResult.status is required"
    );
  }

  if (
    !VALID_AGENT_RESULT_STATUSES
      .has(
        status
      )
  ) {
    throw new TypeError(
      `Unknown AgentResult status: ${status}`
    );
  }

  const normalizedStartedAt =
    startedAt
      ? new Date(
          startedAt
        )
          .toISOString()
      : new Date()
          .toISOString();

  const normalizedCompletedAt =
    completedAt
      ? new Date(
          completedAt
        )
          .toISOString()
      : null;

  const durationMs =
    normalizedCompletedAt
      ? Math.max(
          0,
          new Date(
            normalizedCompletedAt
          ) -
          new Date(
            normalizedStartedAt
          )
        )
      : null;

  const suppliedModelMetadata =
    (
      modelMetadata &&
      typeof modelMetadata ===
        "object" &&
      !Array.isArray(
        modelMetadata
      )
    )
      ? modelMetadata
      : {};

  const normalizedProvider =
    suppliedModelMetadata
      .provider ??
    provider ??
    null;

  const normalizedModel =
    suppliedModelMetadata
      .model ??
    model ??
    null;

  const normalizedInputTokens =
    normalizeNullableNonNegativeNumber(
      suppliedModelMetadata
        .inputTokens ??
      inputTokens
    );

  const normalizedOutputTokens =
    normalizeNullableNonNegativeNumber(
      suppliedModelMetadata
        .outputTokens ??
      outputTokens
    );

  let normalizedTotalTokens =
    normalizeNullableNonNegativeNumber(
      suppliedModelMetadata
        .totalTokens ??
      totalTokens
    );

  if (
    normalizedTotalTokens ===
      null &&
    normalizedInputTokens !==
      null &&
    normalizedOutputTokens !==
      null
  ) {
    normalizedTotalTokens =
      normalizedInputTokens +
      normalizedOutputTokens;
  }

  const normalizedLatencyMs =
    normalizeNullableNonNegativeNumber(
      suppliedModelMetadata
        .latencyMs ??
      latencyMs
    );

  const normalizedEstimatedCost =
    normalizeNullableNonNegativeNumber(
      suppliedModelMetadata
        .estimatedCost ??
      estimatedCost
    );

  const normalizedTokenEstimate =
    normalizeNullableNonNegativeNumber(
      tokenEstimate ??
      normalizedTotalTokens
    );

  return {
    schemaVersion:
      String(
        schemaVersion ||
        AGENT_RESULT_SCHEMA_VERSION
      ),

    agent:
      String(
        agent
      ),

    version:
      String(
        version
      ),

    status,

    startedAt:
      normalizedStartedAt,

    completedAt:
      normalizedCompletedAt,

    durationMs,

    confidence:
      clampConfidence(
        confidence,
        null
      ),

    /*
     * Agent-specific typed payload.
     */
    result:
      result ===
        undefined
        ? null
        : result,

    evidenceUsed:
      uniqueAgentResultStrings(
        evidenceUsed
      ),

    evidenceMissing:
      uniqueAgentResultStrings(
        evidenceMissing
      ),

    assumptions:
      uniqueAgentResultStrings(
        assumptions
      ),

    warnings:
      uniqueAgentResultStrings(
        warnings
      ),

    nextRecommendedStage:
      nextRecommendedStage
        ? String(
            nextRecommendedStage
          )
        : null,

    modelMetadata: {
      provider:
        normalizedProvider,

      model:
        normalizedModel,

      inputTokens:
        normalizedInputTokens,

      outputTokens:
        normalizedOutputTokens,

      totalTokens:
        normalizedTotalTokens,

      latencyMs:
        normalizedLatencyMs,

      estimatedCost:
        normalizedEstimatedCost,
    },

    /*
     * Compatibility aliases.
     *
     * Remove only after every persistence/query consumer has migrated to
     * modelMetadata.
     */
    model:
      normalizedModel,

    provider:
      normalizedProvider,

    tokenEstimate:
      normalizedTokenEstimate,

    fallbackUsed:
      Boolean(
        fallbackUsed
      ),

    error:
      error ??
      null,

    metadata:
      (
        metadata &&
        typeof metadata ===
          "object" &&
        !Array.isArray(
          metadata
        )
      )
        ? metadata
        : {},
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
  unknowns = [],

  policies = null,
  entitlements = null,
  budgets = {},

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

  /*
   * Phase 12.2:
   *
   * InvestigationContext is no longer a competing context shape.
   *
   * It is the diagnosis-focused construction path into the canonical
   * AgentContext contract.
   */
  const canonical =
    createAgentContext({
      schemaVersion:
        AGENT_CONTEXT_SCHEMA_VERSION,

      incidentId,

      organizationId,

      environmentId,

      tenantId,

      correlationId:
        correlationId ||
        correlationGroupId ||
        `incident:${incidentId}`,

      correlationGroupId,

      incident,

      service,

      signals,

      alerts,

      metrics,

      logs,

      traces,

      events:
        incidentEvents,

      incidentEvents,

      dependencies,

      resources,

      evidence,

      topology,

      blastRadius,

      kubernetes,

      changes,

      historicalContext:
        historicalIncidents,

      historicalIncidents,

      symptoms,

      findings,

      contradictions,

      unknowns,

      policies,

      entitlements,

      budgets,

      timing,

      metadata: {
        ...(
          metadata ||
          {}
        ),

        contextOrigin:
          "investigation_context_service",
      },

      builtAt,
    });

  /*
   * Preserve diagnosis-specific aliases consumed by existing Phase-6 agents.
   *
   * These remain aliases into the same canonical context, not an independent
   * second context contract.
   */
  canonical
    .correlationGroup =
    sanitizeAgentContextValue(
      correlationGroup
    );

  canonical
    .kubernetes =
    sanitizeAgentContextValue(
      kubernetes ||
      {}
    );

  canonical
    .builtAt =
    builtAt ||
    new Date()
      .toISOString();

  /*
   * Phase 6 and Phase 12 reasoning remain read-only.
   */
  canonical
    .executionAuthorized =
    false;

  return canonical;
}
// ============================================================================
// PHASE 12.2 — CANONICAL AGENT CONTEXT
// ============================================================================

/**
 * Existing V2 runtime compatibility.
 *
 * New Phase 6 code should prefer createInvestigationContext().
 */
/**
 * Canonical Phase-12 AgentContext.
 *
 * This is the single context contract shared across bounded intelligence
 * stages.
 *
 * Compatibility:
 *
 * Existing top-level fields such as tenantId, organizationId, environmentId,
 * incidentId and correlationId are deliberately preserved while canonical
 * nested envelopes are introduced.
 *
 * Safety:
 *
 * - no plaintext credentials
 * - no raw authorization headers
 * - no infrastructure mutation authority
 * - executionAuthorized always begins false
 */
function createAgentContext({
  schemaVersion =
    AGENT_CONTEXT_SCHEMA_VERSION,

  // --------------------------------------------------------------------------
  // OWNERSHIP / SCOPE
  // --------------------------------------------------------------------------

  tenant = null,
  tenantId,
  organizationId = null,

  environment = null,
  environmentId = null,
  environmentType = null,
  environmentName = null,

  // --------------------------------------------------------------------------
  // INCIDENT / CORRELATION
  // --------------------------------------------------------------------------

  incidentId,
  incident = {},

  correlation = null,
  correlationId = null,
  correlationGroupId = null,

  // --------------------------------------------------------------------------
  // OPERATIONAL CONTEXT
  // --------------------------------------------------------------------------

  service = {},

  resources = [],
  resource = {},

  signals = [],
  alerts = [],
  metrics = [],
  logs = [],
  traces = [],

  events = [],
  incidentEvents = [],

  dependencies = [],

  provider = null,

  topology = {},
  blastRadius = {},
  kubernetes = {},

  changes = [],

  historicalContext = [],
  historicalIncidents = [],

  // --------------------------------------------------------------------------
  // INTELLIGENCE
  // --------------------------------------------------------------------------

  evidence = null,

  symptoms = [],
  findings = [],
  contradictions = [],
  unknowns = [],

  diagnosis = null,
  riskAnalysis = null,
  safetyGate = null,

  // --------------------------------------------------------------------------
  // RECOVERY PLANNING
  // --------------------------------------------------------------------------

  playbookCandidates = [],
  selectedPlaybook = null,
  resolvedParameters = null,

  policies = null,
  entitlements = null,

  policyDecision = null,
  approvalState = null,

  // --------------------------------------------------------------------------
  // EXECUTION / ASSURANCE REFERENCES
  // --------------------------------------------------------------------------

  playbookExecutionId = null,
  runbookExecutionIds = [],

  verificationResults = [],
  rollbackResults = [],

  manualOutcome = null,

  // --------------------------------------------------------------------------
  // RESOURCE BUDGETS
  // --------------------------------------------------------------------------

  budgets = {},

  // --------------------------------------------------------------------------
  // TRACE / METADATA
  // --------------------------------------------------------------------------

  timing = {},
  metadata = {},
  agentTrace = [],
  builtAt = null,
} = {}) {
  if (
    !incidentId
  ) {
    throw new TypeError(
      "AgentContext.incidentId is required"
    );
  }

  if (
    !tenantId &&
    !tenant
      ?.tenantId
  ) {
    throw new TypeError(
      "AgentContext.tenantId is required"
    );
  }

  const resolvedTenantId =
    String(
      tenantId ||
      tenant
        .tenantId
    );

  /*
   * During the Phase 12.1 compatibility period tenantId and organizationId may
   * represent the same organization boundary.
   *
   * Canonical diagnosis paths always supply organizationId explicitly.
   */
  const resolvedOrganizationId =
    organizationId ||
    tenant
      ?.organizationId ||
    resolvedTenantId;

  const suppliedEnvironment =
    isPlainAgentContextObject(
      environment
    )
      ? sanitizeAgentContextValue(
          environment
        )
      : null;

  const resolvedEnvironmentId =
    environmentId ||
    suppliedEnvironment
      ?.environmentId ||
    suppliedEnvironment
      ?.id ||
    suppliedEnvironment
      ?._id ||
    null;

  const legacyEnvironmentValue =
    typeof environment ===
      "string"
      ? environment
      : null;

  const resolvedEnvironmentType =
    environmentType ||
    suppliedEnvironment
      ?.type ||
    suppliedEnvironment
      ?.environmentType ||
    legacyEnvironmentValue ||
    incident
      ?.environment ||
    service
      ?.environment ||
    null;

  const resolvedEnvironmentName =
    environmentName ||
    suppliedEnvironment
      ?.name ||
    resolvedEnvironmentType ||
    null;

  const resolvedCorrelationId =
    correlationId ||
    correlation
      ?.correlationId ||
    correlationGroupId ||
    `incident:${incidentId}`;

  const resolvedCorrelationGroupId =
    correlationGroupId ||
    correlation
      ?.correlationGroupId ||
    null;

  const safeIncident =
    sanitizeAgentContextValue(
      incident ||
      {}
    );

  const safeService =
    sanitizeAgentContextValue(
      service ||
      {}
    );

  const safeSignals =
    sanitizeAgentContextValue(
      safeArray(
        signals
      )
    );

  const safeAlerts =
    sanitizeAgentContextValue(
      safeArray(
        alerts
      )
    );

  /*
   * Metrics intentionally support either the existing object-style runtime
   * shape or the Phase-6 array-style evidence shape.
   */
  const safeMetrics =
    sanitizeAgentContextValue(
      metrics ??
      []
    );

  const safeLogs =
    sanitizeAgentContextValue(
      safeArray(
        logs
      )
    );

  const safeTraces =
    sanitizeAgentContextValue(
      safeArray(
        traces
      )
    );

  const mergedEvents =
    safeArray(
      incidentEvents
    ).length >
    0
      ? safeArray(
          incidentEvents
        )
      : safeArray(
          events
        );

  const safeEvents =
    sanitizeAgentContextValue(
      mergedEvents
    );

  const safeResources =
    sanitizeAgentContextValue(
      safeArray(
        resources
      )
    );

  const safeResource =
    sanitizeAgentContextValue(
      resource ||
      {}
    );

  const safeHistoricalContext =
    sanitizeAgentContextValue(
      safeArray(
        historicalContext
      ).length >
      0
        ? safeArray(
            historicalContext
          )
        : safeArray(
            historicalIncidents
          )
    );

  const safeTiming =
    sanitizeAgentContextValue(
      timing ||
      {}
    );

  const safeMetadata =
    sanitizeAgentContextValue(
      metadata ||
      {}
    );

  const canonicalContext = {
    // ------------------------------------------------------------------------
    // CONTRACT IDENTITY
    // ------------------------------------------------------------------------

    schemaVersion:
      String(
        schemaVersion ||
        AGENT_CONTEXT_SCHEMA_VERSION
      ),

    // ------------------------------------------------------------------------
    // CANONICAL TENANT ENVELOPE
    // ------------------------------------------------------------------------

    tenant: {
      tenantId:
        resolvedTenantId,

      organizationId:
        resolvedOrganizationId
          ? String(
              resolvedOrganizationId
            )
          : null,
    },

    /*
     * Compatibility aliases.
     */
    tenantId:
      resolvedTenantId,

    organizationId:
      resolvedOrganizationId
        ? String(
            resolvedOrganizationId
          )
        : null,

    // ------------------------------------------------------------------------
    // CANONICAL ENVIRONMENT ENVELOPE
    // ------------------------------------------------------------------------

    environment: {
      environmentId:
        resolvedEnvironmentId
          ? String(
              resolvedEnvironmentId
            )
          : null,

      type:
        resolvedEnvironmentType ||
        null,

      name:
        resolvedEnvironmentName ||
        null,
    },

    /*
     * Compatibility aliases used by existing Phase-6 services and agents.
     */
    environmentId:
      resolvedEnvironmentId
        ? String(
            resolvedEnvironmentId
          )
        : null,

    environmentType:
      resolvedEnvironmentType ||
      null,

    environmentName:
      resolvedEnvironmentName ||
      null,

    // ------------------------------------------------------------------------
    // INCIDENT
    // ------------------------------------------------------------------------

    incidentId:
      String(
        incidentId
      ),

    incident:
      safeIncident,

    // ------------------------------------------------------------------------
    // CORRELATION
    // ------------------------------------------------------------------------

    correlation: {
      correlationId:
        String(
          resolvedCorrelationId
        ),

      correlationGroupId:
        resolvedCorrelationGroupId
          ? String(
              resolvedCorrelationGroupId
            )
          : null,
    },

    correlationId:
      String(
        resolvedCorrelationId
      ),

    correlationGroupId:
      resolvedCorrelationGroupId
        ? String(
            resolvedCorrelationGroupId
          )
        : null,

    // ------------------------------------------------------------------------
    // OPERATIONAL CONTEXT
    // ------------------------------------------------------------------------

    service:
      safeService,

    resources:
      safeResources,

    /*
     * Compatibility singular resource alias.
     */
    resource:
      safeResource,

    signals:
      safeSignals,

    alerts:
      safeAlerts,

    metrics:
      safeMetrics,

    logs:
      safeLogs,

    traces:
      safeTraces,

    events:
      safeEvents,

    incidentEvents:
      safeEvents,

    dependencies:
      sanitizeAgentContextValue(
        safeArray(
          dependencies
        )
      ),

    provider:
      sanitizeAgentContextValue(
        provider
      ),

    topology:
      sanitizeAgentContextValue(
        topology ||
        {}
      ),

    blastRadius:
      sanitizeAgentContextValue(
        blastRadius ||
        {}
      ),

    kubernetes:
      sanitizeAgentContextValue(
        kubernetes ||
        {}
      ),

    changes:
      sanitizeAgentContextValue(
        safeArray(
          changes
        )
      ),

    historicalContext:
      safeHistoricalContext,

    /*
     * Compatibility alias used by existing Phase-6 agents.
     */
    historicalIncidents:
      safeHistoricalContext,

    // ------------------------------------------------------------------------
    // INTELLIGENCE
    // ------------------------------------------------------------------------

    evidence:
      sanitizeAgentContextValue(
        evidence
      ),

    symptoms:
      sanitizeAgentContextValue(
        safeArray(
          symptoms
        )
      ),

    findings:
      sanitizeAgentContextValue(
        safeArray(
          findings
        )
      ),

    contradictions:
      sanitizeAgentContextValue(
        safeArray(
          contradictions
        )
      ),

    unknowns:
      sanitizeAgentContextValue(
        safeArray(
          unknowns
        )
      ),

    diagnosis:
      sanitizeAgentContextValue(
        diagnosis
      ),

    riskAnalysis:
      sanitizeAgentContextValue(
        riskAnalysis
      ),

    safetyGate:
      sanitizeAgentContextValue(
        safetyGate
      ),

    // ------------------------------------------------------------------------
    // RECOVERY PLANNING
    // ------------------------------------------------------------------------

    playbookCandidates:
      sanitizeAgentContextValue(
        safeArray(
          playbookCandidates
        )
      ),

    selectedPlaybook:
      sanitizeAgentContextValue(
        selectedPlaybook
      ),

    resolvedParameters:
      sanitizeAgentContextValue(
        resolvedParameters
      ),

    policies:
      sanitizeAgentContextValue(
        policies
      ),

    entitlements:
      sanitizeAgentContextValue(
        entitlements
      ),

    policyDecision:
      sanitizeAgentContextValue(
        policyDecision
      ),

    approvalState:
      sanitizeAgentContextValue(
        approvalState
      ),

    // ------------------------------------------------------------------------
    // EXECUTION REFERENCES / ASSURANCE
    // ------------------------------------------------------------------------

    playbookExecutionId:
      playbookExecutionId ||
      null,

    runbookExecutionIds:
      sanitizeAgentContextValue(
        safeArray(
          runbookExecutionIds
        )
      ),

    verificationResults:
      sanitizeAgentContextValue(
        safeArray(
          verificationResults
        )
      ),

    rollbackResults:
      sanitizeAgentContextValue(
        safeArray(
          rollbackResults
        )
      ),

    manualOutcome:
      sanitizeAgentContextValue(
        manualOutcome
      ),

    // ------------------------------------------------------------------------
    // BUDGETS
    // ------------------------------------------------------------------------

    budgets:
      createAgentBudgetContext(
        budgets
      ),

    // ------------------------------------------------------------------------
    // TIMING / TRACE
    // ------------------------------------------------------------------------

    timing:
      safeTiming,

    metadata: {
      ...safeMetadata,

      contextSchemaVersion:
        String(
          schemaVersion ||
          AGENT_CONTEXT_SCHEMA_VERSION
        ),
    },

    agentTrace:
      sanitizeAgentContextValue(
        safeArray(
          agentTrace
        )
      ),

    builtAt:
      builtAt ||
      new Date()
        .toISOString(),

    /*
     * AgentContext can describe decisions and execution references but never
     * grants mutation authority.
     */
    executionAuthorized:
      false,
  };

  return canonicalContext;
}
// ============================================================================
// PHASE 12.8 — CANONICAL PLAYBOOK RECOMMENDATION
// ============================================================================

const PLAYBOOK_RECOMMENDATION_SCHEMA_VERSION =
  "12.8-v1";

const PLAYBOOK_SELECTION_SOURCE =
  Object.freeze({
    DETERMINISTIC_MATCHER:
      "DETERMINISTIC_MATCHER",

    DETERMINISTIC_MAPPING:
      "DETERMINISTIC_MAPPING",

    AI_RANKED:
      "AI_RANKED",

    HYBRID:
      "HYBRID",

    NONE:
      "NONE",
  });

// ============================================================================
// PHASE 12.9 — CANONICAL PARAMETER RESOLUTION
// ============================================================================

const PARAMETER_RESOLUTION_SCHEMA_VERSION =
  "12.9-v1";

const PARAMETER_RESOLUTION_STATUS =
  Object.freeze({
    READY:
      "READY",

    UNRESOLVED:
      "UNRESOLVED",

    AMBIGUOUS:
      "AMBIGUOUS",

    VALIDATION_FAILED:
      "VALIDATION_FAILED",

    MANUAL_REQUIRED:
      "MANUAL_REQUIRED",
  });

function createPlaybookRecommendation({
  schemaVersion =
    PLAYBOOK_RECOMMENDATION_SCHEMA_VERSION,

  recommendedPlaybookId = null,

  version = null,

  selectedCandidate = null,

  candidateRankings = [],

  eligiblePlaybookIds = [],

  matcherScore = 0,

  reasoningConfidence = 0,

  evidenceIds = [],

  reasons = [],

  disqualifications = [],

  requiredAdditionalEvidence = [],

  selectionSource =
    PLAYBOOK_SELECTION_SOURCE.NONE,

  matcherAuthoritative = true,

  approvalRequired = false,

  recommendation =
    PLAYBOOK_RECOMMENDATION
      .MANUAL_REQUIRED,
} = {}) {
  const validRecommendations =
    Object.values(
      PLAYBOOK_RECOMMENDATION
    );

  let normalizedRecommendation =
    validRecommendations.includes(
      recommendation
    )
      ? recommendation
      : PLAYBOOK_RECOMMENDATION
          .MANUAL_REQUIRED;

  const normalizedEligibleIds =
    Array.from(
      new Set(
        safeArray(
          eligiblePlaybookIds
        )
          .filter(
            Boolean
          )
          .map(
            String
          )
      )
    );

  const selectedId =
    recommendedPlaybookId
      ? String(
          recommendedPlaybookId
        )
      : null;

  /*
   * A selected playbook must belong to the deterministic eligible set whenever
   * that set is supplied.
   */
  if (
    selectedId &&
    normalizedEligibleIds.length >
      0 &&
    !normalizedEligibleIds.includes(
      selectedId
    )
  ) {
    throw new TypeError(
      `Recommended playbook "${selectedId}" is not in deterministic eligible set`
    );
  }

  if (
    !selectedId &&
    (
      normalizedRecommendation ===
        PLAYBOOK_RECOMMENDATION
          .EXECUTE_CANDIDATE ||
      normalizedRecommendation ===
        PLAYBOOK_RECOMMENDATION
          .REQUIRE_APPROVAL
    )
  ) {
    normalizedRecommendation =
      PLAYBOOK_RECOMMENDATION
        .MANUAL_REQUIRED;
  }

  const normalizedApprovalRequired =
    Boolean(
      approvalRequired ||
      normalizedRecommendation ===
        PLAYBOOK_RECOMMENDATION
          .REQUIRE_APPROVAL
    );

  if (
    normalizedApprovalRequired &&
    selectedId
  ) {
    normalizedRecommendation =
      PLAYBOOK_RECOMMENDATION
        .REQUIRE_APPROVAL;
  }

  return {
    schemaVersion:
      String(
        schemaVersion ||
        PLAYBOOK_RECOMMENDATION_SCHEMA_VERSION
      ),

    recommendedPlaybookId:
      selectedId,

    version:
      version ||
      null,

    selectedCandidate:
      selectedCandidate &&
      typeof selectedCandidate ===
        "object"
        ? sanitizeAgentContextValue(
            selectedCandidate
          )
        : null,

    candidateRankings:
      sanitizeAgentContextValue(
        safeArray(
          candidateRankings
        )
      ),

    eligiblePlaybookIds:
      normalizedEligibleIds,

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
      Array.from(
        new Set(
          safeArray(
            evidenceIds
          )
            .filter(
              Boolean
            )
            .map(
              String
            )
        )
      ),

    reasons:
      Array.from(
        new Set(
          safeArray(
            reasons
          )
            .filter(
              Boolean
            )
            .map(
              String
            )
        )
      ),

    disqualifications:
      sanitizeAgentContextValue(
        safeArray(
          disqualifications
        )
      ),

    requiredAdditionalEvidence:
      Array.from(
        new Set(
          safeArray(
            requiredAdditionalEvidence
          )
            .filter(
              Boolean
            )
            .map(
              String
            )
        )
      ),

    selectionSource:
      Object.values(
        PLAYBOOK_SELECTION_SOURCE
      )
        .includes(
          selectionSource
        )
        ? selectionSource
        : PLAYBOOK_SELECTION_SOURCE
            .NONE,

    matcherAuthoritative:
      matcherAuthoritative !==
      false,

    approvalRequired:
      normalizedApprovalRequired,

    recommendation:
      normalizedRecommendation,

    /*
     * Selecting a strategy is never execution authorization.
     */
    executionAuthorized:
      false,
  };
}

function createParameterRecommendation({
  schemaVersion =
    PARAMETER_RESOLUTION_SCHEMA_VERSION,

  candidates = [],

  parameterDefinitions = [],

  deterministicResolutionResult = null,

  resolvedParameters = null,

  unresolved = [],

  ambiguous = [],

  validationErrors = [],

  deterministicValidated = false,

  readyForExecution = false,
} = {}) {
  const normalizedUnresolved =
    Array.from(
      new Set(
        safeArray(
          unresolved
        )
          .filter(
            Boolean
          )
          .map(
            String
          )
      )
    );

  const normalizedAmbiguous =
    Array.from(
      new Set(
        safeArray(
          ambiguous
        )
          .filter(
            Boolean
          )
          .map(
            String
          )
      )
    );

  const normalizedValidationErrors =
    Array.from(
      new Set(
        safeArray(
          validationErrors
        )
          .filter(
            Boolean
          )
          .map(
            String
          )
      )
    );

  const validated =
    Boolean(
      deterministicValidated
    );

  /*
   * AI cannot make parameters execution-ready.
   *
   * The deterministic resolver must have successfully validated the actual
   * playbook/runbook parameter definitions.
   */
  const safeReady =
    Boolean(
      readyForExecution &&
      validated &&
      normalizedUnresolved.length ===
        0 &&
      normalizedAmbiguous.length ===
        0 &&
      normalizedValidationErrors.length ===
        0
    );

  let status;

  if (
    normalizedAmbiguous.length >
    0
  ) {
    status =
      PARAMETER_RESOLUTION_STATUS
        .AMBIGUOUS;
  } else if (
    normalizedUnresolved.length >
    0
  ) {
    status =
      PARAMETER_RESOLUTION_STATUS
        .UNRESOLVED;
  } else if (
    !validated ||
    normalizedValidationErrors.length >
      0
  ) {
    status =
      PARAMETER_RESOLUTION_STATUS
        .VALIDATION_FAILED;
  } else if (
    safeReady
  ) {
    status =
      PARAMETER_RESOLUTION_STATUS
        .READY;
  } else {
    status =
      PARAMETER_RESOLUTION_STATUS
        .MANUAL_REQUIRED;
  }

  return {
    schemaVersion:
      String(
        schemaVersion ||
        PARAMETER_RESOLUTION_SCHEMA_VERSION
      ),

    status,

    candidates:
      sanitizeAgentContextValue(
        safeArray(
          candidates
        )
      ),

    parameterDefinitions:
      sanitizeAgentContextValue(
        safeArray(
          parameterDefinitions
        )
      ),

    deterministicResolutionResult:
      sanitizeAgentContextValue(
        deterministicResolutionResult
      ),

    resolvedParameters:
      sanitizeAgentContextValue(
        resolvedParameters
      ),

    unresolved:
      normalizedUnresolved,

    ambiguous:
      normalizedAmbiguous,

    validationErrors:
      normalizedValidationErrors,

    deterministicValidated:
      validated,

    readyForExecution:
      safeReady,

    /*
     * Parameter resolution never grants authority.
     */
    executionAuthorized:
      false,
  };
}

// ============================================================================
// PHASE 12.10 — CANONICAL RECOVERY OBSERVATION
// ============================================================================

const RECOVERY_OBSERVATION_SCHEMA_VERSION =
  "12.10-v1";

const RECOVERY_VERIFICATION_STATE =
  Object.freeze({
    NOT_STARTED:
      "NOT_STARTED",

    PENDING:
      "PENDING",

    VERIFIED:
      "VERIFIED",

    FAILED:
      "FAILED",

    INCONCLUSIVE:
      "INCONCLUSIVE",
  });

function createRecoveryObservation({
  schemaVersion =
    RECOVERY_OBSERVATION_SCHEMA_VERSION,

  state =
    RECOVERY_STATE.STABLE,

  confidence = 0,

  evidenceIds = [],

  observations = [],

  concerns = [],

  recommendation =
    MONITORING_RECOMMENDATION.WAIT,

  playbookExecutionId = null,

  verificationState =
    RECOVERY_VERIFICATION_STATE.NOT_STARTED,

  deterministicVerificationIds = [],

  rollbackObserved = false,

  worsening = false,

  observedAt = null,
} = {}) {
  const validStates =
    Object.values(
      RECOVERY_STATE
    );

  const normalizedState =
    validStates.includes(
      state
    )
      ? state
      : RECOVERY_STATE.STABLE;

  const validRecommendations =
    Object.values(
      MONITORING_RECOMMENDATION
    );

  let normalizedRecommendation =
    validRecommendations.includes(
      recommendation
    )
      ? recommendation
      : MONITORING_RECOMMENDATION.WAIT;

  const actualWorsening =
    Boolean(
      worsening ||
      normalizedState ===
        RECOVERY_STATE.WORSENING ||
      normalizedState ===
        RECOVERY_STATE.MANUAL_REQUIRED
    );

  if (
    actualWorsening
  ) {
    normalizedRecommendation =
      MONITORING_RECOMMENDATION.ESCALATE;
  }

  const normalizedVerificationState =
    Object.values(
      RECOVERY_VERIFICATION_STATE
    )
      .includes(
        verificationState
      )
      ? verificationState
      : RECOVERY_VERIFICATION_STATE
          .NOT_STARTED;

  return {
    schemaVersion:
      String(
        schemaVersion ||
        RECOVERY_OBSERVATION_SCHEMA_VERSION
      ),

    state:
      normalizedState,

    confidence:
      clampConfidence(
        confidence,
        0
      ),

    evidenceIds:
      Array.from(
        new Set(
          safeArray(
            evidenceIds
          )
            .filter(
              Boolean
            )
            .map(
              String
            )
        )
      ),

    observations:
      safeArray(
        observations
      ),

    concerns:
      safeArray(
        concerns
      ),

    recommendation:
      normalizedRecommendation,

    playbookExecutionId:
      playbookExecutionId
        ? String(
            playbookExecutionId
          )
        : null,

    verificationState:
      normalizedVerificationState,

    deterministicVerificationIds:
      Array.from(
        new Set(
          safeArray(
            deterministicVerificationIds
          )
            .filter(
              Boolean
            )
            .map(
              String
            )
        )
      ),

    rollbackObserved:
      Boolean(
        rollbackObserved
      ),

    worsening:
      actualWorsening,

    observedAt:
      observedAt ||
      new Date()
        .toISOString(),

    /*
     * CRITICAL SAFETY DISTINCTION:
     *
     * RecoveryMonitoringAgent may observe a RECOVERED trajectory, but that
     * never constitutes final recovery verification.
     */
    finalRecoveryDeclared:
      false,

    requiresDeterministicVerification:
      true,

    /*
     * Observation never authorizes execution or closes the incident.
     */
    incidentResolutionAuthorized:
      false,

    executionAuthorized:
      false,
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

    EVIDENCE_SCHEMA_VERSION,

  EVIDENCE_TRUST_LEVEL,

  EVIDENCE_INTEGRITY_STATUS,

  EVIDENCE_FRESHNESS_STATE,

  AGENT_STATUS,

  DIAGNOSIS_STATE,

  ORCHESTRATION_STATE,

  RECOVERY_STATE,

  PLAYBOOK_RECOMMENDATION,

  MONITORING_RECOMMENDATION,

  DIAGNOSIS_OUTCOME,

  HYPOTHESIS_STATUS,
  
  HYPOTHESIS_SCHEMA_VERSION,

  HYPOTHESIS_ORIGIN,

  CONTRADICTION_TYPE,

  RISK_LEVEL,
  RECOVERY_OBSERVATION_SCHEMA_VERSION,

RECOVERY_VERIFICATION_STATE,

  DIAGNOSIS_NEXT_STEP,

  PLAYBOOK_RECOMMENDATION_SCHEMA_VERSION,

PLAYBOOK_SELECTION_SOURCE,

PARAMETER_RESOLUTION_SCHEMA_VERSION,

PARAMETER_RESOLUTION_STATUS,

  AGENT_MANUAL_REASON,

  AGENT_CONTEXT_SCHEMA_VERSION,

  AGENT_RESULT_SCHEMA_VERSION,

  DIAGNOSIS_RESULT_SCHEMA_VERSION,

  RISK_ASSESSMENT_SCHEMA_VERSION,

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
  
  computeEvidenceContentHash,

  verifyEvidenceIntegrity,

  // Phase 12 canonical context
  createAgentContext,

  createAgentBudgetContext,

  sanitizeAgentContextValue,

  // Later-phase compatibility contracts
  createPlaybookRecommendation,

  createParameterRecommendation,

  createRecoveryObservation,

  createExplanationResult,

  createLearningRecommendation,

  // Helpers
  clampConfidence,
};