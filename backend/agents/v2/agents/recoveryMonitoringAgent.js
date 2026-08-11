'use strict';

/**
 * Recovery Monitoring Agent
 *
 * Observes deterministic execution progress and determines recovery trajectory.
 *
 * SAFETY INVARIANTS:
 * - Does NOT replace RunbookVerificationService
 * - Cannot declare AUTO_RESOLVED by itself
 * - Cannot mutate infrastructure
 * - If it believes things are worsening: recommends ESCALATE through safe path only
 */

const { BaseAgent } = require('../runtime/baseAgent');
const {
  AGENT_STATUS,
  EVIDENCE_TYPE,
  EVIDENCE_SOURCE_TYPE,
  AGENT_MANUAL_REASON,
  RECOVERY_STATE,
  MONITORING_RECOMMENDATION,
  createEvidenceItem,
  createRecoveryObservation,
} = require('../contracts/agentContracts');
const { getReasoningProvider } = require('../runtime/reasoningProvider');

const AGENT_NAME    = 'RecoveryMonitoringAgent';
const AGENT_VERSION = '1.0.0';

const OUTPUT_SCHEMA = {
  required: ['state', 'confidence', 'recommendation'],
  properties: {
    state:          { type: 'string' },
    confidence:     { type: 'number' },
    evidenceIds:    { type: 'array' },
    observations:   { type: 'array' },
    concerns:       { type: 'array' },
    recommendation: { type: 'string' },
  },
};

class RecoveryMonitoringAgent extends BaseAgent {
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
        playbookExecutionId, verificationResults, rollbackResults,
        service, resource, incident,
      } = context;

      const evidenceItems = [];

      // ── Collect execution evidence ────────────────────────────────────
      if (verificationResults?.length > 0) {
        evidenceItems.push(createEvidenceItem({
          id:            `ev-verify-${incidentId}`,
          type:          EVIDENCE_TYPE.VERIFICATION_RESULT,
          source:        'runbook-verification-service',
          sourceType:    EVIDENCE_SOURCE_TYPE.KUBERNETES_API,
          resource:      resource || {},
          service:       service?.id,
          summary:       `${verificationResults.length} verification result(s)`,
          structuredData:{ results: verificationResults },
          correlationId,
        }));
      }

      if (rollbackResults?.length > 0) {
        evidenceItems.push(createEvidenceItem({
          id:            `ev-rollback-${incidentId}`,
          type:          EVIDENCE_TYPE.EXECUTION_RESULT,
          source:        'runbook-rollback-engine',
          sourceType:    EVIDENCE_SOURCE_TYPE.KUBERNETES_API,
          resource:      resource || {},
          service:       service?.id,
          summary:       `${rollbackResults.length} rollback result(s)`,
          structuredData:{ results: rollbackResults },
          correlationId,
        }));
      }

      // ── AI observation ────────────────────────────────────────────────
      const reasoning = await provider.reason({
        task: 'recoveryMonitoring',
        systemInstructions: MONITORING_SYSTEM_PROMPT,
        structuredInput: {
          incidentId,
          playbookExecutionId,
          verificationResults: verificationResults || [],
          rollbackResults:     rollbackResults     || [],
          service,
          resource,
          incident,
        },
        outputSchema: OUTPUT_SCHEMA,
        metadata: { incidentId, correlationId },
      });

      const output = reasoning.output || {};

      const rawState = String(output.state || RECOVERY_STATE.STABLE).toUpperCase().replace(/\s+/g, '_');
      const state    = RECOVERY_STATE[rawState] || RECOVERY_STATE.STABLE;

      const rawRec   = String(output.recommendation || MONITORING_RECOMMENDATION.WAIT).toUpperCase().replace(/\s+/g, '_');
      const rec      = MONITORING_RECOMMENDATION[rawRec] || MONITORING_RECOMMENDATION.WAIT;

      const observation = createRecoveryObservation({
        state,
        confidence:   typeof output.confidence === 'number' ? Math.min(1, Math.max(0, output.confidence)) : 0.5,
        evidenceIds:  evidenceItems.map(e => e.id),
        observations: Array.isArray(output.observations) ? output.observations : [],
        concerns:     Array.isArray(output.concerns)     ? output.concerns     : [],
        recommendation: rec,
      });

      // Safety: MANUAL_REQUIRED if worsening
      if (state === RECOVERY_STATE.WORSENING || state === RECOVERY_STATE.MANUAL_REQUIRED) {
        observation.recommendation = MONITORING_RECOMMENDATION.ESCALATE;
      }

      return this._success(startedAt, { observation }, {
        confidence:   observation.confidence,
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
      reads:       ['context.verificationResults', 'context.rollbackResults', 'context.playbookExecutionId'],
      writes:      [],
      requiresLLM: true,
    };
  }
}

const MONITORING_SYSTEM_PROMPT = `
You are the AIRA Recovery Monitoring Agent. Observe deterministic execution results.

Rules:
1. You CANNOT declare final AUTO_RESOLVED — that is determined by RunbookVerificationService.
2. Report the recovery trajectory: IMPROVING, STABLE, RECOVERED, DEGRADED, WORSENING, STALLED, ROLLBACK_IN_PROGRESS, MANUAL_REQUIRED.
3. If worsening, set recommendation to ESCALATE.
4. Do NOT cancel executions directly — only recommend via the safe control path.
5. Do NOT mutate infrastructure.
6. Return ONLY valid JSON.
`.trim();

module.exports = { RecoveryMonitoringAgent };
