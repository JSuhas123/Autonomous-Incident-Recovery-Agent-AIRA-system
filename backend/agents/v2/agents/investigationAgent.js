'use strict';

/**
 * Investigation Agent
 *
 * Collects the evidence needed to diagnose the incident.
 * Uses READ-ONLY operations exclusively.
 *
 * SAFETY INVARIANTS:
 * - NO mutation / infrastructure modification
 * - Only reads from observability APIs, k8s read APIs, IncidentMemory, DecisionTrace
 * - Does not execute any Runbook with side effects
 */

const { BaseAgent } = require('../runtime/baseAgent');
const {
  AGENT_STATUS,
  EVIDENCE_TYPE,
  EVIDENCE_SOURCE_TYPE,
  AGENT_MANUAL_REASON,
  createEvidenceItem,
  createEvidencePackage,
} = require('../contracts/agentContracts');
const { getReasoningProvider } = require('../runtime/reasoningProvider');
const { v4: uuidv4 } = require('uuid');

const AGENT_NAME    = 'InvestigationAgent';
const AGENT_VERSION = '1.0.0';

class InvestigationAgent extends BaseAgent {
  constructor(config = {}) {
    super(AGENT_NAME, AGENT_VERSION);
    this._config   = config;
    this._reasoning = config.reasoningProvider || null;
  }

  async execute(context, dependencies = {}) {
    const startedAt = new Date();

    try {
      const { incidentId, correlationId, tenantId, incident, service, resource, environment } = context;
      const evidenceItems = [];
      const missing = [];

      // ── 1. Kubernetes evidence (read-only) ────────────────────────────
      const k8sEvidence = await _collectK8sEvidence(
        { incidentId, correlationId, tenantId, incident, resource, service },
        dependencies,
        evidenceItems,
        missing,
      );

      // ── 2. Monitoring / metrics evidence ──────────────────────────────
      await _collectMonitoringEvidence(
        { incidentId, correlationId, service, resource },
        dependencies,
        evidenceItems,
        missing,
      );

      // ── 3. Historical incidents from IncidentMemory ───────────────────
      await _collectHistoricalEvidence(
        { tenantId, incidentId, correlationId, incident },
        dependencies,
        evidenceItems,
        missing,
      );

      // ── 4. Deployment changes ─────────────────────────────────────────
      await _collectDeploymentEvidence(
        { service, resource, incidentId, correlationId },
        dependencies,
        evidenceItems,
        missing,
      );

      // ── 5. AI reasoning — what else is missing? ───────────────────────
      const provider = this._reasoning || getReasoningProvider();
      const reasoning = await provider.reason({
        task: 'investigation',
        systemInstructions: INVESTIGATION_SYSTEM_PROMPT,
        structuredInput: {
          incident,
          service,
          resource,
          environment,
          collectedEvidenceTypes: evidenceItems.map(e => e.type),
          missingEvidence: missing,
          signalCount: (context.signals || []).length + (context.alerts || []).length,
        },
        outputSchema: {
          required: ['completeness', 'recommendedNextEvidence'],
          properties: {
            completeness:             { type: 'number' },
            missingEvidence:          { type: 'array' },
            staleEvidence:            { type: 'array' },
            conflicts:                { type: 'array' },
            recommendedNextEvidence:  { type: 'array' },
          },
        },
        metadata: { incidentId, correlationId },
      });

      const aiOutput = reasoning.output || {};
      const completeness = typeof aiOutput.completeness === 'number' ? aiOutput.completeness
        : _estimateCompleteness(evidenceItems, missing);

      const evidencePackage = createEvidencePackage({
        incidentId,
        correlationId,
        items:                  evidenceItems,
        completeness,
        missingEvidence:        aiOutput.missingEvidence        || missing,
        staleEvidence:          aiOutput.staleEvidence          || [],
        conflicts:              aiOutput.conflicts               || [],
        recommendedNextEvidence:aiOutput.recommendedNextEvidence || [],
      });

      return this._success(startedAt, { evidencePackage }, {
        confidence:   completeness,
        evidenceUsed: evidenceItems.map(e => e.id),
        model:        reasoning.modelMetadata?.model,
        provider:     reasoning.modelMetadata?.provider,
        fallbackUsed: reasoning.fallbackUsed,
        warnings:     reasoning.warnings || [],
      });

    } catch (err) {
      return this._fail(startedAt, err);
    }
  }

  validateOutput(record) {
    const base = super.validateOutput(record);
    if (!base.valid) return base;
    return { valid: true, errors: [] };
  }

  getCapabilities() {
    return {
      ...super.getCapabilities(),
      reads:  ['k8s.pods', 'k8s.events', 'monitoring.metrics', 'incidentMemory', 'decisionTrace'],
      writes: ['context.evidence'],
      requiresLLM: true,
    };
  }
}

// ── Evidence Collectors ───────────────────────────────────────────────────────

async function _collectK8sEvidence({ incidentId, correlationId, tenantId, incident, resource, service }, deps, items, missing) {
  const k8sService = deps.k8sService || null;
  if (!k8sService) {
    missing.push('kubernetes_pod_status');
    missing.push('kubernetes_events');
    return;
  }

  try {
    const namespace = resource?.namespace || incident?.evidence?.namespace;
    const podName   = resource?.pod       || incident?.evidence?.pod;

    if (namespace && podName) {
      const podData = await k8sService.getPodStatus(namespace, podName, tenantId).catch(() => null);
      if (podData) {
        items.push(createEvidenceItem({
          id: `ev-k8s-pod-${incidentId}`,
          type: EVIDENCE_TYPE.KUBERNETES_EVENT,
          source: 'kubernetes-api',
          sourceType: EVIDENCE_SOURCE_TYPE.KUBERNETES_API,
          resource: { namespace, pod: podName },
          service: service?.id,
          summary: `Pod ${podName} status: ${podData.phase}`,
          structuredData: { phase: podData.phase, restartCount: podData.restartCount, conditions: podData.conditions },
          confidence: 0.95,
          correlationId,
        }));
      } else {
        missing.push('kubernetes_pod_status');
      }
    } else {
      missing.push('kubernetes_namespace_or_pod_name');
    }
  } catch (_) {
    missing.push('kubernetes_pod_status');
  }
}

async function _collectMonitoringEvidence({ incidentId, correlationId, service, resource }, deps, items, missing) {
  const monService = deps.monitoringService || null;
  if (!monService) {
    missing.push('metrics_error_rate');
    return;
  }
  try {
    const metrics = await monService.getServiceMetrics(service?.id, { window: '5m' }).catch(() => null);
    if (metrics) {
      items.push(createEvidenceItem({
        id: `ev-metrics-${incidentId}`,
        type: EVIDENCE_TYPE.METRIC,
        source: 'prometheus',
        sourceType: EVIDENCE_SOURCE_TYPE.PROMETHEUS,
        resource: resource || {},
        service: service?.id,
        summary: `Error rate: ${metrics.errorRate}, p99 latency: ${metrics.p99Latency}ms`,
        structuredData: metrics,
        confidence: 0.90,
        correlationId,
      }));
    } else {
      missing.push('service_metrics');
    }
  } catch (_) {
    missing.push('service_metrics');
  }
}

async function _collectHistoricalEvidence({ tenantId, incidentId, correlationId, incident }, deps, items, missing) {
  const memService = deps.memoryService || null;
  if (!memService) return;
  try {
    const patternType = incident?.type || incident?.patternType;
    if (!patternType) return;
    const memory = await memService.find(tenantId, `pattern-${patternType}`).catch(() => null);
    if (memory && memory.stats?.totalOccurrences > 0) {
      items.push(createEvidenceItem({
        id: `ev-history-${incidentId}`,
        type: EVIDENCE_TYPE.HISTORICAL_INCIDENT,
        source: 'incident-memory',
        sourceType: EVIDENCE_SOURCE_TYPE.INCIDENT_MEMORY,
        resource: {},
        service: null,
        summary: `${memory.stats.totalOccurrences} previous occurrences of ${patternType}`,
        structuredData: {
          totalOccurrences: memory.stats.totalOccurrences,
          recommendedAction: memory.recommendedAction?.action,
          successRate: memory.recommendedAction?.successRate,
        },
        confidence: 0.85,
        correlationId,
      }));
    }
  } catch (_) { /* non-fatal */ }
}

async function _collectDeploymentEvidence({ service, resource, incidentId, correlationId }, deps, items, missing) {
  const deployService = deps.deploymentService || null;
  if (!deployService) return;
  try {
    const recent = await deployService.getRecentDeployments(service?.id, { hours: 4 }).catch(() => null);
    if (recent && recent.length > 0) {
      items.push(createEvidenceItem({
        id: `ev-deploy-${incidentId}`,
        type: EVIDENCE_TYPE.DEPLOYMENT_CHANGE,
        source: 'deployment-api',
        sourceType: EVIDENCE_SOURCE_TYPE.DEPLOYMENT_API,
        resource: resource || {},
        service: service?.id,
        summary: `${recent.length} deployments in last 4h`,
        structuredData: { deployments: recent.map(d => ({ id: d.id, at: d.deployedAt, image: d.image })) },
        confidence: 0.80,
        correlationId,
      }));
    }
  } catch (_) { /* non-fatal */ }
}

function _estimateCompleteness(items, missing) {
  const total = items.length + missing.length;
  if (total === 0) return 0;
  return items.length / total;
}

const INVESTIGATION_SYSTEM_PROMPT = `
You are the AIRA Investigation Agent. You assess evidence completeness for an incident.

Rules:
1. Identify what evidence is missing to diagnose the incident.
2. Flag stale evidence (>30 min old for fast-changing metrics).
3. Identify conflicts between evidence items.
4. Suggest next evidence to collect (READ-ONLY sources only).
5. Estimate evidence completeness as a float 0.0–1.0.
6. Return ONLY valid JSON.
7. Do NOT suggest mutations, restarts, deployments, or any infrastructure changes.
`.trim();

// ── Evidence Reduction ────────────────────────────────────────────────────────
// Ensures no full log streams are sent to the model.

function _truncateLine(line, maxChars) {
  if (typeof line !== 'string') return String(line ?? '');
  return line.length > maxChars ? line.slice(0, maxChars) + '…' : line;
}

/**
 * Reduces an evidence item's structuredData to stay within model budget.
 * Preserves IDs and references for auditability.
 */
function reduceEvidenceItem(item, budgets) {
  const maxBytes = budgets?.maxEvidenceItemBytes || 4096;
  const maxLines = budgets?.maxLogLines          || 100;
  const maxChars = budgets?.maxLogLineChars       || 512;

  if (!item.structuredData) return item;

  const data = { ...item.structuredData };

  // Truncate log arrays
  if (Array.isArray(data.logs)) {
    data.logs = data.logs
      .slice(-maxLines)                               // most recent N lines
      .map(l => _truncateLine(typeof l === 'string' ? l : l?.message || JSON.stringify(l), maxChars));
    data._logsReduced = true;
  }

  // Truncate raw events/traces
  for (const key of ['events', 'traces', 'spans', 'messages']) {
    if (Array.isArray(data[key])) {
      data[key] = data[key].slice(-maxLines);
      data[`_${key}Reduced`] = true;
    }
  }

  // Enforce byte budget on the whole item (JSON representation)
  const serialized = JSON.stringify(data);
  if (serialized.length > maxBytes) {
    return {
      ...item,
      structuredData: {
        _truncated: true,
        _originalBytes: serialized.length,
        summary: item.summary,
        // Keep only top-level scalar fields, drop large nested arrays
        ...Object.fromEntries(
          Object.entries(data).filter(([, v]) => typeof v !== 'object' || v === null)
        ),
      },
    };
  }

  return { ...item, structuredData: data };
}

/**
 * Applies reduction to all evidence items.
 * Preserves item IDs so downstream agents can still reference them.
 */
function reduceEvidencePackage(items, budgets) {
  const maxItems = budgets?.maxEvidenceItems || 50;
  const reduced  = items.slice(0, maxItems).map(i => reduceEvidenceItem(i, budgets));
  if (items.length > maxItems) {
    reduced._truncatedCount = items.length - maxItems;
  }
  return reduced;
}

module.exports = { InvestigationAgent, reduceEvidenceItem, reduceEvidencePackage };
