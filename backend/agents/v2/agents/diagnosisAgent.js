'use strict';

/**
 * Diagnosis Agent
 *
 * Ranks probable root causes from collected evidence.
 * Produces structured hypotheses with mandatory evidence citations.
 *
 * SAFETY INVARIANTS:
 * - Every hypothesis MUST cite evidence IDs
 * - Never proposes raw shell commands
 * - Never executes anything
 * - Never creates Playbooks
 * - Never modifies IncidentMemory directly
 * - Distinguishes FACT vs INFERENCE clearly
 */

const { BaseAgent } = require('../runtime/baseAgent');
const {
  AGENT_STATUS,
  AGENT_MANUAL_REASON,
  createHypothesis,
  createDiagnosisResult,
} = require('../contracts/agentContracts');
const { getReasoningProvider } = require('../runtime/reasoningProvider');
const { v4: uuidv4 } = require('uuid');

const AGENT_NAME    = 'DiagnosisAgent';
const AGENT_VERSION = '1.0.0';

// Well-known root cause codes
const ROOT_CAUSE = Object.freeze({
  APPLICATION_STARTUP_FAILURE: 'APPLICATION_STARTUP_FAILURE',
  MISSING_SECRET:              'MISSING_SECRET',
  BAD_CONFIGURATION:           'BAD_CONFIGURATION',
  DEPENDENCY_UNAVAILABLE:      'DEPENDENCY_UNAVAILABLE',
  OOM:                         'OOM',
  FAILED_DEPLOYMENT:           'FAILED_DEPLOYMENT',
  HIGH_ERROR_RATE:             'HIGH_ERROR_RATE',
  RESOURCE_EXHAUSTION:         'RESOURCE_EXHAUSTION',
  CASCADING_FAILURE:           'CASCADING_FAILURE',
  NETWORK_PARTITION:           'NETWORK_PARTITION',
  DATABASE_OVERLOAD:           'DATABASE_OVERLOAD',
  UNKNOWN:                     'UNKNOWN',
});

const OUTPUT_SCHEMA = {
  required: ['hypotheses', 'diagnosisConfidence', 'recommendedIncidentType'],
  properties: {
    hypotheses:             { type: 'array' },
    primaryHypothesis:      { type: 'string' },
    diagnosisConfidence:    { type: 'number' },
    evidenceCompleteness:   { type: 'number' },
    unresolvedQuestions:    { type: 'array' },
    recommendedIncidentType:{ type: 'string' },
  },
};

class DiagnosisAgent extends BaseAgent {
  constructor(config = {}) {
    super(AGENT_NAME, AGENT_VERSION);
    this._config    = config;
    this._reasoning = config.reasoningProvider || null;
  }

  validateInput(context) {
    const base = super.validateInput(context);
    if (!base.valid) return base;
    const errors = [];
    if (!context.evidence) errors.push('context.evidence is required for diagnosis');
    return { valid: errors.length === 0, errors };
  }

  async execute(context, dependencies = {}) {
    const startedAt = new Date();
    const provider  = this._reasoning || getReasoningProvider();

    try {
      const { incidentId, correlationId, tenantId, incident, evidence, service, resource } = context;

      const evidenceItems = evidence?.items || [];
      const evidenceIds   = evidenceItems.map(e => e.id);

      // ── AI Diagnosis ──────────────────────────────────────────────────
      const reasoning = await provider.reason({
        task: 'diagnosis',
        systemInstructions: DIAGNOSIS_SYSTEM_PROMPT,
        structuredInput: {
          incident,
          service:  service  || {},
          resource: resource || {},
          evidence: evidenceItems.map(e => ({
            id:         e.id,
            type:       e.type,
            summary:    e.summary,
            confidence: e.confidence,
            // Do NOT pass structuredData that might contain secrets
            safeData: _extractSafeData(e),
          })),
          correlationId,
        },
        outputSchema: OUTPUT_SCHEMA,
        metadata: { incidentId, correlationId },
      });

      if (reasoning.manualRequired) {
        return this._manual(startedAt, reasoning.manualReason || AGENT_MANUAL_REASON.REASONING_FAILED, {
          evidenceUsed: evidenceIds,
        });
      }

      const output = reasoning.output || {};

      // ── Validate hypotheses ────────────────────────────────────────────
      const rawHyps = Array.isArray(output.hypotheses) ? output.hypotheses : [];
      const hypotheses = rawHyps.map((h, i) => {
        // Enforce evidence citation
        const supporting = Array.isArray(h.evidenceSupporting) ? h.evidenceSupporting : [];
        const against    = Array.isArray(h.evidenceAgainst)    ? h.evidenceAgainst    : [];

        // Filter out evidence IDs not present in our package (hallucination guard)
        const validSupporting = supporting.filter(id => evidenceIds.includes(id));
        const validAgainst    = against.filter(id => evidenceIds.includes(id));

        return createHypothesis({
          id:                `hyp-${incidentId}-${i}`,
          rootCause:         _sanitizeRootCause(h.rootCause),
          confidence:        typeof h.confidence === 'number' ? Math.min(1, Math.max(0, h.confidence)) : 0,
          evidenceSupporting: validSupporting,
          evidenceAgainst:    validAgainst,
          affectedResources:  Array.isArray(h.affectedResources) ? h.affectedResources : [],
          explanation:        typeof h.explanation === 'string' ? h.explanation : '',
        });
      });

      // Sort by confidence
      hypotheses.sort((a, b) => b.confidence - a.confidence);

      const primaryHypothesis = hypotheses.length > 0 ? hypotheses[0].id : null;
      const diagnosisConfidence = typeof output.diagnosisConfidence === 'number'
        ? Math.min(1, Math.max(0, output.diagnosisConfidence))
        : (hypotheses.length > 0 ? hypotheses[0].confidence * 0.8 : 0);

      const diagnosisResult = createDiagnosisResult({
        hypotheses,
        primaryHypothesis,
        diagnosisConfidence,
        evidenceCompleteness: typeof output.evidenceCompleteness === 'number' ? output.evidenceCompleteness
          : (evidence?.completeness || 0),
        unresolvedQuestions:  Array.isArray(output.unresolvedQuestions) ? output.unresolvedQuestions : [],
        recommendedIncidentType: output.recommendedIncidentType || incident?.type || 'unknown',
      });

      return this._success(startedAt, { diagnosisResult }, {
        confidence:   diagnosisConfidence,
        evidenceUsed: evidenceIds,
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
    if (record.status === AGENT_STATUS.SUCCESS) {
      if (!record.result?.diagnosisResult) {
        return { valid: false, errors: ['diagnosisResult missing from output'] };
      }
    }
    return { valid: true, errors: [] };
  }

  getCapabilities() {
    return {
      ...super.getCapabilities(),
      reads:       ['context.evidence'],
      writes:      ['context.diagnosis'],
      requiresLLM: true,
    };
  }
}

function _sanitizeRootCause(value) {
  if (!value) return ROOT_CAUSE.UNKNOWN;
  const upper = String(value).toUpperCase().replace(/\s+/g, '_');
  return ROOT_CAUSE[upper] || ROOT_CAUSE.UNKNOWN;
}

function _extractSafeData(evidenceItem) {
  const sd = evidenceItem.structuredData;
  if (!sd || typeof sd !== 'object' || evidenceItem.sensitive) return {};
  // Strip any field that looks like a secret
  const safe = {};
  const secretPatterns = /password|secret|token|key|credential|auth/i;
  for (const [k, v] of Object.entries(sd)) {
    if (!secretPatterns.test(k)) safe[k] = v;
  }
  return safe;
}

const DIAGNOSIS_SYSTEM_PROMPT = `
You are the AIRA Diagnosis Agent. Rank probable root causes from evidence.

Rules:
1. Produce MULTIPLE hypotheses where ambiguity exists.
2. Every hypothesis MUST cite evidence IDs in evidenceSupporting or evidenceAgainst.
3. Distinguish FACT (from evidence) from INFERENCE (your reasoning).
4. Never claim certainty without evidence.
5. Never propose shell commands, kubectl, SQL, or any executable.
6. Never execute anything.
7. Never create Playbooks.
8. Use only the following rootCause values: APPLICATION_STARTUP_FAILURE, MISSING_SECRET, BAD_CONFIGURATION, DEPENDENCY_UNAVAILABLE, OOM, FAILED_DEPLOYMENT, HIGH_ERROR_RATE, RESOURCE_EXHAUSTION, CASCADING_FAILURE, NETWORK_PARTITION, DATABASE_OVERLOAD, UNKNOWN.
9. diagnosisConfidence is diagnostic confidence only — NOT Playbook confidence.
10. Return ONLY valid JSON.
`.trim();

module.exports = { DiagnosisAgent, ROOT_CAUSE };
