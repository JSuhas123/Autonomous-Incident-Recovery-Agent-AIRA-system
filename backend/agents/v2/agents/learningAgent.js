'use strict';

/**
 * Learning Agent
 *
 * Analyzes RESOLVED/CLOSED incidents and recommends improvements.
 *
 * SAFETY INVARIANTS (CRITICAL):
 * - MUST NEVER modify ACTIVE Runbooks, Playbooks, Policy, or handlers
 * - MUST NEVER modify production infrastructure
 * - All recommendations are PROPOSALS only, requiring human review
 * - Can generate DRAFT change proposals ONLY
 * - requiresHumanApproval: true on ALL recommendation objects
 */

const { BaseAgent } = require('../runtime/baseAgent');
const {
  AGENT_STATUS,
  AGENT_MANUAL_REASON,
  createLearningRecommendation,
} = require('../contracts/agentContracts');
const { getReasoningProvider } = require('../runtime/reasoningProvider');

const AGENT_NAME    = 'LearningAgent';
const AGENT_VERSION = '1.0.0';

const RECOMMENDATION_TYPE = Object.freeze({
  IMPROVE_MEMORY_REQUEST:       'IMPROVE_MEMORY_REQUEST',
  ADD_EVIDENCE_CHECK:           'ADD_EVIDENCE_CHECK',
  ADJUST_PLAYBOOK_RANKING:      'ADJUST_PLAYBOOK_RANKING',
  INVESTIGATE_REPEATED_CAUSE:   'INVESTIGATE_REPEATED_CAUSE',
  PROPOSE_DRAFT_RUNBOOK:        'PROPOSE_DRAFT_RUNBOOK',
  PROPOSE_DRAFT_PLAYBOOK:       'PROPOSE_DRAFT_PLAYBOOK',
  POLICY_REVIEW:                'POLICY_REVIEW',
  PARAMETER_THRESHOLD_REVIEW:   'PARAMETER_THRESHOLD_REVIEW',
});

const OUTPUT_SCHEMA = {
  required: ['patterns', 'recommendations'],
  properties: {
    patterns:         { type: 'array' },
    recommendations:  { type: 'array' },
    playbookInsights: { type: 'array' },
    runbookInsights:  { type: 'array' },
    policyInsights:   { type: 'array' },
  },
};

class LearningAgent extends BaseAgent {
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
        selectedPlaybook, playbookExecutionId,
        verificationResults, rollbackResults,
        manualOutcome, agentTrace,
      } = context;

      const memService = dependencies.memoryService || null;

      // ── Historical patterns ───────────────────────────────────────────
      let historicalStats = null;
      if (memService && incident?.type) {
        try {
          historicalStats = await memService.find(tenantId, `pattern-${incident.type}`).catch(() => null);
        } catch (_) {}
      }

      // ── AI reasoning ──────────────────────────────────────────────────
      const reasoning = await provider.reason({
        task: 'learning',
        systemInstructions: LEARNING_SYSTEM_PROMPT,
        structuredInput: {
          incidentId,
          incident: { type: incident?.type, severity: incident?.severity },
          selectedPlaybookId: selectedPlaybook?.playbookId || null,
          executionSucceeded: !!(playbookExecutionId && !rollbackResults?.length),
          verificationPassed: verificationResults?.every(v => v.status === 'PASSED') || false,
          rollbackOccurred:   (rollbackResults || []).length > 0,
          manualOutcome:      manualOutcome || null,
          diagnosisConfidence: diagnosis?.diagnosisConfidence || 0,
          historicalOccurrences: historicalStats?.stats?.totalOccurrences || 0,
          playbookSuccessRate: historicalStats?.recommendedAction?.successRate || null,
          agentWarnings: (agentTrace || []).flatMap(r => r.warnings || []),
        },
        outputSchema: OUTPUT_SCHEMA,
        metadata: { incidentId, correlationId },
      });

      const output = reasoning.output || {};

      // ── Enforce safety: all recommendations must require human approval ─
      const rawRecs = Array.isArray(output.recommendations) ? output.recommendations : [];
      const safeRecs = rawRecs.map(r => ({
        type:                _normaliseRecommendationType(r.type),
        description:         r.description || '',
        evidence:            Array.isArray(r.evidence) ? r.evidence : [],
        confidence:          typeof r.confidence === 'number' ? Math.min(1, r.confidence) : 0.5,
        proposedChange:      _sanitizeProposedChange(r.proposedChange),
        requiresHumanApproval: true, // ALWAYS true — cannot be overridden
        isDraft:             true,   // proposals are always DRAFT
      }));

      const recommendations = createLearningRecommendation({
        patterns:         Array.isArray(output.patterns)         ? output.patterns         : [],
        recommendations:  safeRecs,
        playbookInsights: Array.isArray(output.playbookInsights) ? output.playbookInsights : [],
        runbookInsights:  Array.isArray(output.runbookInsights)  ? output.runbookInsights  : [],
        policyInsights:   Array.isArray(output.policyInsights)   ? output.policyInsights   : [],
      });

      return this._success(startedAt, { recommendations }, {
        confidence:   0.8, // learning always has medium confidence
        evidenceUsed: (evidence?.items || []).map(e => e.id),
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
      const recs = record.result?.recommendations?.recommendations || [];
      // Verify safety invariant: all recommendations have requiresHumanApproval: true
      const unsafe = recs.filter(r => r.requiresHumanApproval !== true);
      if (unsafe.length > 0) {
        return { valid: false, errors: ['SAFETY VIOLATION: recommendations missing requiresHumanApproval=true'] };
      }
    }
    return { valid: true, errors: [] };
  }

  getCapabilities() {
    return {
      ...super.getCapabilities(),
      reads:       ['incidentMemory', 'context.agentTrace', 'context.verificationResults'],
      writes:      ['draft-proposals-only'],
      requiresLLM: true,
    };
  }
}

function _normaliseRecommendationType(value) {
  if (!value) return RECOMMENDATION_TYPE.INVESTIGATE_REPEATED_CAUSE;
  const upper = String(value).toUpperCase().replace(/\s+/g, '_');
  return RECOMMENDATION_TYPE[upper] || RECOMMENDATION_TYPE.INVESTIGATE_REPEATED_CAUSE;
}

function _sanitizeProposedChange(proposedChange) {
  if (!proposedChange) return null;
  // Ensure no executable commands in proposed changes
  if (typeof proposedChange === 'string') {
    const dangerous = /kubectl|exec|bash|sh\s|rm\s|DROP\s|DELETE\s|UPDATE\s/i;
    if (dangerous.test(proposedChange)) {
      return '[PROPOSED CHANGE REDACTED — contained potentially dangerous content]';
    }
  }
  return proposedChange;
}

const LEARNING_SYSTEM_PROMPT = `
You are the AIRA Learning Agent. Analyze a completed incident and recommend improvements.

Rules:
1. You MUST NEVER recommend direct modification of ACTIVE Runbooks, Playbooks, or Policy.
2. All recommendations are DRAFT proposals requiring human review.
3. Do NOT generate executable commands.
4. Do NOT suggest changes to production infrastructure.
5. Focus on: memory improvement, evidence collection, playbook ranking, repeated root causes.
6. Recommendations should be specific, actionable, and cite incident data.
7. Return ONLY valid JSON.
`.trim();

module.exports = { LearningAgent, RECOMMENDATION_TYPE };
