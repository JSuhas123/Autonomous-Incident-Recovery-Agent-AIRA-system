'use strict';

const { CorrelationAgent } = require('../agents/correlationAgent');
const { MockReasoningProvider } = require('../runtime/reasoningProvider');
const { AGENT_STATUS } = require('../contracts/agentContracts');

function makeContext(overrides = {}) {
  return {
    incidentId:    'INC-001',
    correlationId: 'CORR-001',
    tenantId:      'tenant-a',
    signals: [
      { type: 'high-latency', severity: 'HIGH', service: 'api', timestamp: new Date().toISOString() },
    ],
    alerts:  [],
    service: { id: 'api' },
    resource:{ id: 'pod-123' },
    ...overrides,
  };
}

describe('CorrelationAgent', () => {
  let agent;

  beforeEach(() => {
    const provider = new MockReasoningProvider({
      responses: {
        correlation: {
          incidentGroup:        'group-INC-001',
          affectedServices:     ['api'],
          affectedResources:    ['pod-123'],
          correlatedSignalIds:  ['sig-0'],
          possibleDependencies: [],
          confidence:           0.85,
          reasons:              ['same service', 'same time window'],
          evidenceIds:          [],
        },
      },
    });
    agent = new CorrelationAgent({ reasoningProvider: provider });
  });

  test('validates input — requires signals', () => {
    const result = agent.validateInput({ incidentId: 'x', tenantId: 'y', correlationId: 'z' });
    expect(result.valid).toBe(false);
  });

  test('happy path returns SUCCESS with correlation data', async () => {
    const record = await agent.execute(makeContext(), {});
    expect(record.status).toBe(AGENT_STATUS.SUCCESS);
    expect(record.result.incidentGroup).toBe('group-INC-001');
    expect(record.confidence).toBe(0.85);
  });

  test('returns evidence IDs from signals', async () => {
    const record = await agent.execute(makeContext(), {});
    expect(record.evidenceUsed.length).toBeGreaterThan(0);
  });

  test('uses deterministic correlation engine when provided', async () => {
    let engineCalled = false;
    const mockEngine = {
      recordMultiSignalIncident: (tid, sigs, svcs) => {
        engineCalled = true;
        return { incidentId: 'corr-x', signals: sigs.length };
      },
      findRootCauseCandidates: () => [],
    };
    await agent.execute(makeContext(), { correlationEngine: mockEngine });
    expect(engineCalled).toBe(true);
  });

  test('reasoning failure returns MANUAL_REQUIRED', async () => {
    const brokenProvider = { reason: async () => ({ output: null, manualRequired: true, manualReason: 'REASONING_FAILED', fallbackUsed: true, warnings: [] }) };
    const a2 = new CorrelationAgent({ reasoningProvider: brokenProvider });
    const record = await a2.execute(makeContext(), {});
    expect(record.status).toBe(AGENT_STATUS.MANUAL_REQUIRED);
  });
});
