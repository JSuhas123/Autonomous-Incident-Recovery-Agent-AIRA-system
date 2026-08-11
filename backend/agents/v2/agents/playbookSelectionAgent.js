'use strict';

/**
 * Playbook Selection Agent
 *
 * Reasons over deterministic PlaybookMatcher output to rank candidates.
 *
 * SAFETY INVARIANTS:
 * - MUST call deterministic PlaybookMatcher first
 * - CANNOT invent Playbook IDs
 * - CANNOT select DRAFT/non-ACTIVE Playbooks as executable
 * - CANNOT override Registry disqualifications
 * - CANNOT override Policy
 * - If deterministic matcher says NO_SAFE_PLAYBOOK: agent may explain/escalate ONLY
 */

const { BaseAgent } = require('../runtime/baseAgent');
const {
  AGENT_STATUS,
  AGENT_MANUAL_REASON,
  PLAYBOOK_RECOMMENDATION,
  createPlaybookRecommendation,
} = require('../contracts/agentContracts');
const { getReasoningProvider } = require('../runtime/reasoningProvider');
const { EXECUTION_OUTCOME, MANUAL_REASON } = require('../../../constants/executionOutcomes');

const AGENT_NAME    = 'PlaybookSelectionAgent';
const AGENT_VERSION = '1.0.0';

const OUTPUT_SCHEMA = {
  required: ['recommendedPlaybookId', 'recommendation', 'reasoningConfidence'],
  properties: {
    recommendedPlaybookId: { type: 'string' },
    version:               { type: 'string' },
    candidateRankings:     { type: 'array' },
    reasoningConfidence:   { type: 'number' },
    evidenceIds:           { type: 'array' },
    reasons:               { type: 'array' },
    disqualifications:     { type: 'array' },
    requiredAdditionalEvidence: { type: 'array' },
    recommendation:        { type: 'string' },
  },
};

class PlaybookSelectionAgent extends BaseAgent {
  constructor(config = {}) {
    super(AGENT_NAME, AGENT_VERSION);
    this._config    = config;
    this._reasoning = config.reasoningProvider || null;
  }

  validateInput(context) {
    const base = super.validateInput(context);
    if (!base.valid) return base;
    const errors = [];
    if (!context.diagnosis) errors.push('context.diagnosis is required for playbook selection');
    return { valid: errors.length === 0, errors };
  }

  async execute(context, dependencies = {}) {
    const startedAt = new Date();
    const provider  = this._reasoning || getReasoningProvider();

    try {
      const { incidentId, correlationId, tenantId, incident, diagnosis, evidence } = context;
      const incidentPlaybookService = dependencies.incidentPlaybookService || null;

      // ── Step 1: Deterministic PlaybookMatcher ─────────────────────────
      let matcherAnalysis = null;
      if (incidentPlaybookService) {
        try {
          matcherAnalysis = await incidentPlaybookService.analyseIncident(incident, { tenantId });
        } catch (e) {
          // Non-fatal — we can still return MANUAL_REQUIRED
        }
      }

      // If deterministic matcher found nothing eligible
      if (matcherAnalysis && matcherAnalysis.outcome === EXECUTION_OUTCOME.MANUAL_REQUIRED) {
        return this._success(startedAt, createPlaybookRecommendation({
          recommendedPlaybookId:      null,
          candidateRankings:          matcherAnalysis.candidates || [],
          matcherScore:               0,
          reasoningConfidence:        0,
          evidenceIds:                (evidence?.items || []).map(e => e.id),
          reasons:                    [matcherAnalysis.outcomeReason || MANUAL_REASON.NO_SAFE_PLAYBOOK],
          disqualifications:          matcherAnalysis.disqualifications || [],
          requiredAdditionalEvidence: matcherAnalysis.missingEvidence || [],
          recommendation:             PLAYBOOK_RECOMMENDATION.MANUAL_REQUIRED,
        }), {
          confidence: 0,
          evidenceUsed: (evidence?.items || []).map(e => e.id),
          warnings: ['Deterministic matcher found no safe playbook — cannot proceed autonomously'],
        });
      }

      // Build allowed candidate set (from deterministic matcher ONLY)
      const allowedCandidates = matcherAnalysis?.eligible || matcherAnalysis?.candidates || [];
      const eligibleIds = new Set(allowedCandidates.map(c => c.playbookId));

      // ── Step 2: AI reasoning over eligible candidates ─────────────────
      const reasoning = await provider.reason({
        task: 'playbookSelection',
        systemInstructions: PLAYBOOK_SELECTION_SYSTEM_PROMPT,
        structuredInput: {
          incident,
          diagnosis,
          eligibleCandidates: allowedCandidates.map(c => ({
            playbookId:   c.playbookId,
            semver:       c.semver,
            name:         c.name,
            score:        c.score,
            approvalMode: c.approvalMode,
            riskLevel:    c.riskLevel,
            matchReasons: c.matchReasons,
          })),
          evidenceSummary: (evidence?.items || []).map(e => ({
            id: e.id, type: e.type, summary: e.summary, confidence: e.confidence,
          })),
        },
        outputSchema: OUTPUT_SCHEMA,
        metadata: { incidentId, correlationId },
      });

      if (reasoning.manualRequired) {
        return this._manual(startedAt, reasoning.manualReason || AGENT_MANUAL_REASON.REASONING_FAILED, {
          evidenceUsed: (evidence?.items || []).map(e => e.id),
        });
      }

      const output = reasoning.output || {};

      // ── Step 3: Hallucination guard ───────────────────────────────────
      const proposedId = output.recommendedPlaybookId;
      if (proposedId && !eligibleIds.has(proposedId)) {
        // AI invented a Playbook ID not in deterministic eligible set
        return this._manual(startedAt, AGENT_MANUAL_REASON.AGENT_OUTPUT_INVALID, {
          warnings: [`Agent proposed non-eligible playbookId "${proposedId}" — rejected`],
          evidenceUsed: (evidence?.items || []).map(e => e.id),
        });
      }

      // Build candidate rankings (only from allowed set)
      const candidateRankings = (Array.isArray(output.candidateRankings)
        ? output.candidateRankings
        : allowedCandidates
      ).filter(c => eligibleIds.has(c.playbookId));

      const bestCandidate = allowedCandidates.find(c => c.playbookId === proposedId)
        || (allowedCandidates.length > 0 ? allowedCandidates[0] : null);

      const rec = createPlaybookRecommendation({
        recommendedPlaybookId: bestCandidate?.playbookId || null,
        version:               bestCandidate?.semver     || null,
        candidateRankings,
        matcherScore:          bestCandidate?.score      || 0,
        reasoningConfidence:   typeof output.reasoningConfidence === 'number' ? output.reasoningConfidence : 0.5,
        evidenceIds:           (evidence?.items || []).map(e => e.id),
        reasons:               Array.isArray(output.reasons) ? output.reasons : [],
        disqualifications:     matcherAnalysis?.disqualifications || [],
        requiredAdditionalEvidence: Array.isArray(output.requiredAdditionalEvidence)
          ? output.requiredAdditionalEvidence : [],
        recommendation:        _normaliseRecommendation(output.recommendation, bestCandidate),
      });

      return this._success(startedAt, rec, {
        confidence:   rec.reasoningConfidence,
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
      if (!record.result?.recommendation) {
        return { valid: false, errors: ['recommendation missing from output'] };
      }
    }
    return { valid: true, errors: [] };
  }

  getCapabilities() {
    return {
      ...super.getCapabilities(),
      reads:       ['context.diagnosis', 'context.evidence', 'playbookMatcher'],
      writes:      ['context.selectedPlaybook', 'context.playbookCandidates'],
      requiresLLM: true,
    };
  }
}

function _normaliseRecommendation(value, bestCandidate) {
  if (!value) return bestCandidate ? PLAYBOOK_RECOMMENDATION.EXECUTE_CANDIDATE : PLAYBOOK_RECOMMENDATION.MANUAL_REQUIRED;
  const upper = String(value).toUpperCase().replace(/\s+/g, '_');
  return PLAYBOOK_RECOMMENDATION[upper] || PLAYBOOK_RECOMMENDATION.MANUAL_REQUIRED;
}

const PLAYBOOK_SELECTION_SYSTEM_PROMPT = `
You are the AIRA Playbook Selection Agent. Reason over deterministic matcher candidates.

Rules:
1. You may ONLY recommend playbook IDs from the eligibleCandidates list provided.
2. Do NOT invent new Playbook IDs.
3. Do NOT create Runbooks or actions.
4. Do NOT override deterministic disqualifications.
5. Rank candidates using diagnosis + evidence + historical context.
6. If no eligible candidates exist, set recommendation to MANUAL_REQUIRED.
7. If more evidence is needed, set recommendation to COLLECT_MORE_EVIDENCE.
8. Return ONLY valid JSON.
`.trim();

module.exports = { PlaybookSelectionAgent };
