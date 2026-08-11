'use strict';

const { DiagnosisAgent } = require('../agents/diagnosisAgent');
const { MockReasoningProvider } = require('../runtime/reasoningProvider');
const { AGENT_STATUS, EVIDENCE_TYPE, createEvidenceItem } = require('../contracts/agentContracts');

function makeContext(evidenceItems = [], overrides = {}) {
  return {
    incidentId:    'INC-003',
    correlationId: 'CORR-003',
    tenantId:      'tenant-a',
    incident:      { type: 'kubernetes.pod.crash', severity: 'HIGH' },
    service:       { id: 'api' },
    resource:      { namespace: 'prod', pod: 'api-pod' },
    evidence:      {
      incidentId:    'INC-003',
      correlationId: 'CORR-003',
      items:         evidenceItems,
      completeness:  evidenceItems.length > 0 ? 0.7 : 0,
    },
    ...overrides,
  };
}

function makeEvidence(id, type = EVIDENCE_TYPE.KUBERNETES_EVENT) {
  return createEvidenceItem({
    id, type, source: 'k8s', summary: 'pod crashed', structuredData: { restartCount: 5 },
  });
}

describe('DiagnosisAgent', () => {
  let agent;

  beforeEach(() => {
    const provider = new MockReasoningProvider({
      responses: {
        diagnosis: {
          hypotheses: [
            {
              rootCause:          'OOM',
              confidence:         0.80,
              evidenceSupporting: ['ev-001'],
              evidenceAgainst:    [],
              affectedResources:  ['api-pod'],
              explanation:        '[FACT] Pod restart count is 5, indicating OOM kill.',
            },
          ],
          primaryHypothesis:      'hyp-INC-003-0',
          diagnosisConfidence:    0.80,
          evidenceCompleteness:   0.70,
          unresolvedQuestions:    [],
          recommendedIncidentType:'kubernetes.oom',
        },
      },
    });
    agent = new DiagnosisAgent({ reasoningProvider: provider });
  });

  test('requires evidence in context', () => {
    const ctx = makeContext([]);
    ctx.evidence = null;
    const v = agent.validateInput(ctx);
    expect(v.valid).toBe(false);
  });

  test('happy path returns diagnosis result', async () => {
    const evs = [makeEvidence('ev-001')];
    const record = await agent.execute(makeContext(evs), {});
    expect(record.status).toBe(AGENT_STATUS.SUCCESS);
    expect(record.result.diagnosisResult.hypotheses.length).toBe(1);
    expect(record.result.diagnosisResult.diagnosisConfidence).toBe(0.80);
  });

  test('hallucinated evidence IDs are stripped from hypothesis', async () => {
    const provider = new MockReasoningProvider({
      responses: {
        diagnosis: {
          hypotheses: [{
            rootCause: 'OOM', confidence: 0.7,
            evidenceSupporting: ['FAKE-ID-9999'], // not in our evidence
            evidenceAgainst: [],
          }],
          diagnosisConfidence: 0.7,
          recommendedIncidentType: 'unknown',
        },
      },
    });
    const a2 = new DiagnosisAgent({ reasoningProvider: provider });
    const record = await a2.execute(makeContext([makeEvidence('ev-real')]), {});
    const hyps = record.result.diagnosisResult.hypotheses;
    expect(hyps[0].evidenceSupporting).toHaveLength(0); // FAKE-ID stripped
  });

  test('sanitizes unknown root cause to UNKNOWN', async () => {
    const provider = new MockReasoningProvider({
      responses: {
        diagnosis: {
          hypotheses: [{ rootCause: 'INVENTED_CAUSE', confidence: 0.5, evidenceSupporting: [], evidenceAgainst: [] }],
          diagnosisConfidence: 0.5,
          recommendedIncidentType: 'unknown',
        },
      },
    });
    const a2 = new DiagnosisAgent({ reasoningProvider: provider });
    const record = await a2.execute(makeContext([makeEvidence('ev-001')]), {});
    expect(record.result.diagnosisResult.hypotheses[0].rootCause).toBe('UNKNOWN');
  });

  test('hypotheses sorted by confidence descending', async () => {
    const provider = new MockReasoningProvider({
      responses: {
        diagnosis: {
          hypotheses: [
            { rootCause: 'OOM', confidence: 0.5, evidenceSupporting: [], evidenceAgainst: [] },
            { rootCause: 'BAD_CONFIGURATION', confidence: 0.85, evidenceSupporting: [], evidenceAgainst: [] },
          ],
          diagnosisConfidence: 0.85,
          recommendedIncidentType: 'unknown',
        },
      },
    });
    const a2 = new DiagnosisAgent({ reasoningProvider: provider });
    const record = await a2.execute(makeContext([makeEvidence('ev-x')]), {});
    const hyps = record.result.diagnosisResult.hypotheses;
    expect(hyps[0].confidence).toBeGreaterThanOrEqual(hyps[1].confidence);
  });

  test('reasoning failure returns MANUAL_REQUIRED', async () => {
    const broken = { reason: async () => ({ output: null, manualRequired: true, manualReason: 'REASONING_FAILED', fallbackUsed: true, warnings: [] }) };
    const a2 = new DiagnosisAgent({ reasoningProvider: broken });
    const record = await a2.execute(makeContext([makeEvidence('ev-001')]), {});
    expect(record.status).toBe(AGENT_STATUS.MANUAL_REQUIRED);
  });
});
