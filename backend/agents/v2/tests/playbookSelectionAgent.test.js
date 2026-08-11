'use strict';

const { PlaybookSelectionAgent } = require('../agents/playbookSelectionAgent');
const { MockReasoningProvider } = require('../runtime/reasoningProvider');
const { AGENT_STATUS, PLAYBOOK_RECOMMENDATION } = require('../contracts/agentContracts');
const { EXECUTION_OUTCOME, MANUAL_REASON } = require('../../../constants/executionOutcomes');

function makeContext(overrides = {}) {
  return {
    incidentId:    'INC-004',
    correlationId: 'CORR-004',
    tenantId:      'tenant-a',
    incident:      { type: 'kubernetes.pod.crash', severity: 'HIGH', evidence: {} },
    diagnosis: {
      primaryHypothesis: 'hyp-0',
      diagnosisConfidence: 0.80,
      recommendedIncidentType: 'kubernetes.pod.crash',
      hypotheses: [],
    },
    evidence: { items: [], completeness: 0.7 },
    ...overrides,
  };
}

const eligibleCandidate = {
  playbookId:   'PB-K8S-CRASHLOOP-001',
  semver:       '1.0.0',
  name:         'CrashLoop Recovery',
  score:        0.9,
  approvalMode: 'AUTOMATIC',
  riskLevel:    'MEDIUM',
  matchReasons: ['type match'],
};

describe('PlaybookSelectionAgent', () => {
  let agent;

  beforeEach(() => {
    const provider = new MockReasoningProvider({
      responses: {
        playbookSelection: {
          recommendedPlaybookId: 'PB-K8S-CRASHLOOP-001',
          version:               '1.0.0',
          candidateRankings:     [{ playbookId: 'PB-K8S-CRASHLOOP-001' }],
          reasoningConfidence:   0.85,
          evidenceIds:           [],
          reasons:               ['best match for CrashLoop'],
          recommendation:        'EXECUTE_CANDIDATE',
        },
      },
    });
    agent = new PlaybookSelectionAgent({ reasoningProvider: provider });
  });

  test('requires diagnosis in context', () => {
    const ctx = makeContext({ diagnosis: null });
    const v = agent.validateInput(ctx);
    expect(v.valid).toBe(false);
  });

  test('happy path with eligible candidate', async () => {
    const mockService = {
      analyseIncident: async () => ({
        outcome: EXECUTION_OUTCOME.AUTO_RESOLVED,
        eligible: [eligibleCandidate],
        candidates: [eligibleCandidate],
        disqualifications: [],
        missingEvidence: [],
      }),
    };
    const record = await agent.execute(makeContext(), { incidentPlaybookService: mockService });
    expect(record.status).toBe(AGENT_STATUS.SUCCESS);
    expect(record.result.recommendedPlaybookId).toBe('PB-K8S-CRASHLOOP-001');
    expect(record.result.recommendation).toBe(PLAYBOOK_RECOMMENDATION.EXECUTE_CANDIDATE);
  });

  test('NO_SAFE_PLAYBOOK returns MANUAL_REQUIRED recommendation', async () => {
    const mockService = {
      analyseIncident: async () => ({
        outcome: EXECUTION_OUTCOME.MANUAL_REQUIRED,
        eligible: [],
        candidates: [],
        disqualifications: [],
        missingEvidence: [],
        outcomeReason: MANUAL_REASON.NO_SAFE_PLAYBOOK,
      }),
    };
    const record = await agent.execute(makeContext(), { incidentPlaybookService: mockService });
    expect(record.status).toBe(AGENT_STATUS.SUCCESS);
    expect(record.result.recommendation).toBe(PLAYBOOK_RECOMMENDATION.MANUAL_REQUIRED);
  });

  test('hallucinated playbook ID is rejected', async () => {
    // AI returns a playbookId NOT in eligible set
    const provider = new MockReasoningProvider({
      responses: {
        playbookSelection: {
          recommendedPlaybookId: 'PB-INVENTED-999',
          recommendation: 'EXECUTE_CANDIDATE',
          reasoningConfidence: 0.9,
        },
      },
    });
    const mockService = {
      analyseIncident: async () => ({
        outcome: EXECUTION_OUTCOME.AUTO_RESOLVED,
        eligible: [eligibleCandidate],
        candidates: [eligibleCandidate],
        disqualifications: [],
      }),
    };
    const a2 = new PlaybookSelectionAgent({ reasoningProvider: provider });
    const record = await a2.execute(makeContext(), { incidentPlaybookService: mockService });
    expect(record.status).toBe(AGENT_STATUS.MANUAL_REQUIRED);
  });

  test('no incidentPlaybookService still works with empty candidates', async () => {
    const record = await agent.execute(makeContext(), {});
    // No matcher — falls back gracefully
    expect(record.status).toMatch(/SUCCESS|MANUAL_REQUIRED/);
  });
});
