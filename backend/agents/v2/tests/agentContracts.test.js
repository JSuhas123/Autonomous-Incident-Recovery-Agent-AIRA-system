'use strict';

/**
 * Agent Contracts Unit Tests
 */

const {
  createEvidenceItem,
  createEvidencePackage,
  createAgentContext,
  createHypothesis,
  createDiagnosisResult,
  createPlaybookRecommendation,
  createParameterRecommendation,
  createRecoveryObservation,
  createExplanationResult,
  createLearningRecommendation,
  createAgentExecutionRecord,
  EVIDENCE_TYPE,
  AGENT_STATUS,
  ORCHESTRATION_STATE,
  RECOVERY_STATE,
  PLAYBOOK_RECOMMENDATION,
} = require('../contracts/agentContracts');

const { ConfidenceModel, CONFIDENCE_DIMENSION } = require('../contracts/confidenceModel');

// ── EvidenceItem ──────────────────────────────────────────────────────────────

describe('createEvidenceItem', () => {
  test('creates valid evidence item', () => {
    const ev = createEvidenceItem({
      id: 'ev-001', type: EVIDENCE_TYPE.METRIC,
      source: 'prometheus', summary: 'error rate',
    });
    expect(ev.id).toBe('ev-001');
    expect(ev.type).toBe('METRIC');
    expect(Object.isFrozen(ev)).toBe(true);
  });

  test('throws on missing id', () => {
    expect(() => createEvidenceItem({ type: EVIDENCE_TYPE.LOG, source: 'x', summary: 'y' }))
      .toThrow('id is required');
  });

  test('throws on unknown type', () => {
    expect(() => createEvidenceItem({ id: 'x', type: 'BANANA', source: 'x', summary: 'y' }))
      .toThrow('Unknown evidence type');
  });

  test('redacts structuredData when redacted=true', () => {
    const ev = createEvidenceItem({
      id: 'ev-002', type: EVIDENCE_TYPE.LOG, source: 'logs', summary: 's',
      structuredData: { secret: 'abc' }, redacted: true,
    });
    expect(ev.structuredData).toBe('[REDACTED]');
  });
});

// ── AgentContext ──────────────────────────────────────────────────────────────

describe('createAgentContext', () => {
  test('creates valid context', () => {
    const ctx = createAgentContext({
      incidentId: 'INC-001', correlationId: 'CORR-001', tenantId: 'tenant-a',
    });
    expect(ctx.incidentId).toBe('INC-001');
    expect(ctx.agentTrace).toEqual([]);
  });

  test('throws on missing tenantId', () => {
    expect(() => createAgentContext({ incidentId: 'x', correlationId: 'y' }))
      .toThrow('tenantId is required');
  });
});

// ── ConfidenceModel ───────────────────────────────────────────────────────────

describe('ConfidenceModel', () => {
  let model;
  beforeEach(() => { model = new ConfidenceModel(); });

  test('evaluates below min as MANUAL_REQUIRED', () => {
    const result = model.evaluate(CONFIDENCE_DIMENSION.PARAMETER, 0.2);
    expect(result.tier).toBe('MANUAL_REQUIRED');
    expect(result.belowMin).toBe(true);
  });

  test('evaluates above auto threshold as AUTO', () => {
    const result = model.evaluate(CONFIDENCE_DIMENSION.PARAMETER, 0.95);
    expect(result.tier).toBe('AUTO');
  });

  test('evaluates WARN tier correctly', () => {
    const result = model.evaluate(CONFIDENCE_DIMENSION.DIAGNOSIS, 0.55);
    expect(result.tier).toBe('WARN');
  });

  test('allClear returns blocking list', () => {
    const check = model.allClear({
      [CONFIDENCE_DIMENSION.PARAMETER]: 0.2,
      [CONFIDENCE_DIMENSION.DIAGNOSIS]: 0.9,
    });
    expect(check.canProceed).toBe(false);
    expect(check.blocking.length).toBe(1);
  });

  test('allClear passes when all above min', () => {
    const check = model.allClear({
      [CONFIDENCE_DIMENSION.PARAMETER]: 0.95,
      [CONFIDENCE_DIMENSION.DIAGNOSIS]: 0.80,
    });
    expect(check.canProceed).toBe(true);
  });
});
