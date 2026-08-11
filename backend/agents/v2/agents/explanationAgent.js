'use strict';

/**
 * Explanation Agent
 *
 * Produces operator-facing structured explanation of the full incident lifecycle.
 *
 * SAFETY INVARIANTS:
 * - Does NOT expose secrets, credentials, or internal IDs
 * - Does NOT claim recovery if verification failed
 * - Does NOT hide rollback or errors
 * - Clearly distinguishes FACT / INFERENCE / ACTION / RESULT
 */

const { BaseAgent } = require('../runtime/baseAgent');
const {
  AGENT_STATUS,
  AGENT_MANUAL_REASON,
  createExplanationResult,
} = require('../contracts/agentContracts');
const { getReasoningProvider } = require('../runtime/reasoningProvider');

const AGENT_NAME    = 'ExplanationAgent';
const AGENT_VERSION = '1.0.0';

const OUTPUT_SCHEMA = {
  required: ['title', 'summary', 'whatHappened', 'finalOutcome'],
  properties: {
    title:               { type: 'string' },
    summary:             { type: 'string' },
    whatHappened:        { type: 'string' },
    likelyCause:         { type: 'string' },
    evidenceSummary:     { type: 'array' },
    decisionSummary:     { type: 'string' },
    actionSummary:       { type: 'array' },
    policySummary:       { type: 'string' },
    verificationSummary: { type: 'string' },
    rollbackSummary:     { type: 'string' },
    finalOutcome:        { type: 'string' },
    manualReason:        { type: 'string' },
    timeline:            { type: 'array' },
    confidenceNotes:     { type: 'array' },
    operatorNextSteps:   { type: 'array' },
  },
};

class ExplanationAgent extends BaseAgent {
  constructor(config = {}) {
    super(AGENT_NAME, AGENT_VERSION);
    this._config    = config;
    this._reasoning = config.reasoningProvider || null;
  }

  async execute(context, dependencies = {}) {
    const startedAt = new Date();
    const provider  = this._reasoning || getReasoningProvider();

    try {
      const {
        incidentId, correlationId, tenantId,
        incident, evidence, diagnosis,
        selectedPlaybook, resolvedParameters,
        policyDecision, approvalState,
        playbookExecutionId, verificationResults, rollbackResults,
        manualOutcome, timing, agentTrace,
      } = context;

      const evidenceItems = evidence?.items || [];

      // Build safe timeline from agent trace
      const timeline = _buildTimeline(agentTrace || []);

      const reasoning = await provider.reason({
        task: 'explanation',
        systemInstructions: EXPLANATION_SYSTEM_PROMPT,
        structuredInput: {
          incident: { id: incidentId, type: incident?.type, severity: incident?.severity, title: incident?.title },
          evidenceSummary: evidenceItems.map(e => ({ id: e.id, type: e.type, summary: e.summary })),
          diagnosis: {
            primaryHypothesis:      diagnosis?.primaryHypothesis,
            diagnosisConfidence:    diagnosis?.diagnosisConfidence,
            recommendedIncidentType:diagnosis?.recommendedIncidentType,
          },
          selectedPlaybook,
          parameterCount: (resolvedParameters?.resolved || []).length,
          policyDecision: policyDecision ? { verdict: policyDecision.verdict, reason: policyDecision.reason } : null,
          approvalState,
          executionId:    playbookExecutionId,
          verificationResults: (verificationResults || []).map(v => ({ status: v.status, summary: v.summary })),
          rollbackResults:     (rollbackResults     || []).map(r => ({ status: r.status, summary: r.summary })),
          manualOutcome,
          timeline,
          timing,
        },
        outputSchema: OUTPUT_SCHEMA,
        metadata: { incidentId, correlationId },
      });

      const output = reasoning.output || {};

      const explanation = createExplanationResult({
        title:               output.title               || `Incident ${incidentId}`,
        summary:             output.summary             || '',
        whatHappened:        output.whatHappened        || '',
        likelyCause:         output.likelyCause         || '',
        evidenceSummary:     Array.isArray(output.evidenceSummary)   ? output.evidenceSummary   : [],
        decisionSummary:     output.decisionSummary     || '',
        actionSummary:       Array.isArray(output.actionSummary)     ? output.actionSummary     : [],
        policySummary:       output.policySummary       || '',
        verificationSummary: output.verificationSummary || '',
        rollbackSummary:     output.rollbackSummary     || '',
        finalOutcome:        output.finalOutcome        || 'UNKNOWN',
        manualReason:        output.manualReason        || null,
        timeline,
        confidenceNotes:     Array.isArray(output.confidenceNotes)   ? output.confidenceNotes   : [],
        operatorNextSteps:   Array.isArray(output.operatorNextSteps) ? output.operatorNextSteps : [],
      });

      return this._success(startedAt, { explanation }, {
        confidence:   1.0, // explanation quality isn't confidence-gated
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
      reads:       ['context.*'],
      writes:      [],
      requiresLLM: true,
    };
  }
}

function _buildTimeline(agentTrace) {
  return agentTrace.map(record => ({
    agent:       record.agent,
    status:      record.status,
    startedAt:   record.startedAt,
    completedAt: record.completedAt,
    durationMs:  record.durationMs,
    confidence:  record.confidence,
    warnings:    record.warnings || [],
  }));
}

const EXPLANATION_SYSTEM_PROMPT = `
You are the AIRA Explanation Agent. Produce an operator-facing explanation of an incident.

Rules:
1. Clearly label each statement as FACT, INFERENCE, ACTION, or RESULT.
2. Do NOT claim recovery if verification failed or rollback occurred.
3. Do NOT hide errors, rollbacks, or policy denials.
4. Do NOT expose secrets, credentials, or raw connection strings.
5. Do NOT expose raw chain-of-thought.
6. Keep it concise and actionable for an operator.
7. operatorNextSteps should be concrete and safe.
8. Return ONLY valid JSON.
`.trim();

module.exports = { ExplanationAgent };
