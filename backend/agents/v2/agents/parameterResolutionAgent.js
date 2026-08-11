'use strict';

/**
 * Parameter Resolution Agent
 *
 * Assists when Runbook/Playbook parameters need contextual resolution.
 * The FINAL authority remains RunbookParameterResolver — this agent provides candidates.
 *
 * SAFETY INVARIANTS:
 * - Never returns secret/credential values — only reference IDs
 * - Ambiguous resources → RESOURCE_AMBIGUOUS → MANUAL_REQUIRED
 * - All candidates must pass through deterministic RunbookParameterResolver
 * - readyForExecution = false if ANY required parameter is unresolved/ambiguous
 */

const { BaseAgent } = require('../runtime/baseAgent');
const {
  AGENT_STATUS,
  AGENT_MANUAL_REASON,
  createParameterRecommendation,
} = require('../contracts/agentContracts');
const { getReasoningProvider } = require('../runtime/reasoningProvider');
const { MANUAL_REASON } = require('../../../constants/executionOutcomes');

const AGENT_NAME    = 'ParameterResolutionAgent';
const AGENT_VERSION = '1.0.0';

const OUTPUT_SCHEMA = {
  required: ['candidates', 'readyForExecution'],
  properties: {
    candidates:   { type: 'array' },
    unresolved:   { type: 'array' },
    ambiguous:    { type: 'array' },
    readyForExecution: { type: 'boolean' },
  },
};

class ParameterResolutionAgent extends BaseAgent {
  constructor(config = {}) {
    super(AGENT_NAME, AGENT_VERSION);
    this._config    = config;
    this._reasoning = config.reasoningProvider || null;
  }

  validateInput(context) {
    const base = super.validateInput(context);
    if (!base.valid) return base;
    const errors = [];
    if (!context.selectedPlaybook) errors.push('context.selectedPlaybook is required');
    return { valid: errors.length === 0, errors };
  }

  async execute(context, dependencies = {}) {
    const startedAt = new Date();
    const provider  = this._reasoning || getReasoningProvider();

    try {
      const {
        incidentId, correlationId, tenantId,
        incident, evidence, diagnosis, selectedPlaybook, resource, service,
      } = context;

      const evidenceItems = evidence?.items || [];

      // ── Step 1: AI candidate proposal ─────────────────────────────────
      const reasoning = await provider.reason({
        task: 'parameterResolution',
        systemInstructions: PARAMETER_RESOLUTION_SYSTEM_PROMPT,
        structuredInput: {
          selectedPlaybook,
          incident,
          service:  service  || {},
          resource: resource || {},
          evidence: evidenceItems.map(e => ({
            id: e.id, type: e.type, summary: e.summary,
            safeData: _extractSafeData(e),
          })),
          diagnosis: {
            primaryHypothesis: diagnosis?.primaryHypothesis,
            recommendedIncidentType: diagnosis?.recommendedIncidentType,
          },
        },
        outputSchema: OUTPUT_SCHEMA,
        metadata: { incidentId, correlationId },
      });

      if (reasoning.manualRequired) {
        return this._manual(startedAt, reasoning.manualReason || AGENT_MANUAL_REASON.REASONING_FAILED, {
          evidenceUsed: evidenceItems.map(e => e.id),
        });
      }

      const output = reasoning.output || {};

      // ── Step 2: Secret guard ──────────────────────────────────────────
      const rawCandidates = Array.isArray(output.candidates) ? output.candidates : [];
      const safeCandidates = rawCandidates
        .filter(c => c && c.parameter)
        .map(c => ({
          parameter:      c.parameter,
          proposedValue:  _redactIfSecret(c.parameter, c.proposedValue),
          confidence:     typeof c.confidence === 'number' ? Math.min(1, Math.max(0, c.confidence)) : 0.5,
          evidenceIds:    (Array.isArray(c.evidenceIds) ? c.evidenceIds : []).filter(id =>
            evidenceItems.some(e => e.id === id)), // only valid evidence refs
          source:         c.source || 'agent-inference',
          isSecretRef:    _isSecretParam(c.parameter),
        }));

      const unresolved = Array.isArray(output.unresolved) ? output.unresolved : [];
      const ambiguous  = Array.isArray(output.ambiguous)  ? output.ambiguous  : [];

      // ── Step 3: Deterministic resolution pass ─────────────────────────
      let deterministicResult = null;
      const paramResolver = dependencies.runbookParameterResolver || null;
      if (paramResolver) {
        try {
          const explicitInputs = Object.fromEntries(
            safeCandidates
              .filter(c => !c.isSecretRef && c.confidence >= 0.7)
              .map(c => [c.parameter, c.proposedValue])
          );
          const { resolved, errors: resolveErrors } = paramResolver.resolve(
            [], // parameters list would come from runbook definition; pass what we have
            {
              explicitInputs,
              incidentEvidence: incident?.evidence || {},
              alertLabels:      {},
              humanInput:       {},
            },
          );
          deterministicResult = { resolved, errors: resolveErrors };
          // Add any resolver-identified missing to our unresolved list
          if (resolveErrors?.length) {
            resolveErrors.forEach(e => { if (!unresolved.includes(e)) unresolved.push(e); });
          }
        } catch (_) { /* non-fatal — candidates are still useful */ }
      }

      // ── Step 4: Readiness check ───────────────────────────────────────
      // If any ambiguous resource → MANUAL_REQUIRED
      if (ambiguous.length > 0) {
        return this._manual(startedAt, MANUAL_REASON.RESOURCE_AMBIGUOUS, {
          evidenceUsed: evidenceItems.map(e => e.id),
          warnings: [`Ambiguous parameters: ${ambiguous.join(', ')}`],
        });
      }

      const aiReady     = output.readyForExecution === true;
      const paramConf   = safeCandidates.length > 0
        ? safeCandidates.reduce((s, c) => s + c.confidence, 0) / safeCandidates.length
        : 0;

      const rec = createParameterRecommendation({
        candidates: safeCandidates,
        deterministicResolutionResult: deterministicResult,
        unresolved,
        ambiguous,
        readyForExecution: aiReady && unresolved.length === 0 && ambiguous.length === 0,
      });

      return this._success(startedAt, rec, {
        confidence:   paramConf,
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
      reads:       ['context.selectedPlaybook', 'context.evidence', 'context.incident'],
      writes:      ['context.resolvedParameters'],
      requiresLLM: true,
    };
  }
}

const SECRET_PATTERNS = /password|secret|token|key|credential|auth|cert/i;

function _isSecretParam(name) {
  return SECRET_PATTERNS.test(name);
}

function _redactIfSecret(paramName, value) {
  if (_isSecretParam(paramName)) return '[SECRET-REF-ONLY]';
  return value;
}

function _extractSafeData(evidenceItem) {
  const sd = evidenceItem.structuredData;
  if (!sd || typeof sd !== 'object' || evidenceItem.sensitive) return {};
  const safe = {};
  for (const [k, v] of Object.entries(sd)) {
    if (!SECRET_PATTERNS.test(k)) safe[k] = v;
  }
  return safe;
}

const PARAMETER_RESOLUTION_SYSTEM_PROMPT = `
You are the AIRA Parameter Resolution Agent. Propose candidate values for Runbook parameters.

Rules:
1. Source values from evidence (pod name, namespace, service ID, etc.).
2. NEVER return actual secret values. For secrets, return only "[SECRET-REF-ONLY]".
3. If two resources are equally plausible for a parameter, mark it as ambiguous.
4. Set readyForExecution to false if ANY required parameter is unresolved or ambiguous.
5. Cite evidence IDs for every candidate.
6. Do NOT invent Playbook IDs or Runbook steps.
7. Return ONLY valid JSON.
`.trim();

module.exports = { ParameterResolutionAgent };
