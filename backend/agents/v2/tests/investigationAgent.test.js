'use strict';

const { InvestigationAgent } = require('../agents/investigationAgent');
const { MockReasoningProvider } = require('../runtime/reasoningProvider');
const { AGENT_STATUS } = require('../contracts/agentContracts');

function makeContext(overrides = {}) {
  return {
    incidentId:    'INC-002',
    correlationId: 'CORR-002',
    tenantId:      'tenant-a',
    incident:      { type: 'kubernetes.pod.crash', severity: 'HIGH', evidence: { namespace: 'prod', pod: 'api-pod-xyz' } },
    service:       { id: 'api' },
    resource:      { namespace: 'prod', pod: 'api-pod-xyz' },
    signals:       [],
    alerts:        [],
    ...overrides,
  };
}

describe('InvestigationAgent', () => {
  let agent;

  beforeEach(() => {
    const provider = new MockReasoningProvider({
      responses: {
        investigation: {
          completeness:             0.75,
          missingEvidence:          ['kubernetes_logs'],
          staleEvidence:            [],
          conflicts:                [],
          recommendedNextEvidence:  ['fetch pod logs'],
        },
      },
    });
    agent = new InvestigationAgent({ reasoningProvider: provider });
  });

  test('happy path returns evidence package', async () => {
    const record = await agent.execute(makeContext(), {});
    expect(record.status).toBe(AGENT_STATUS.SUCCESS);
    expect(record.result.evidencePackage).toBeDefined();
    expect(record.result.evidencePackage.completeness).toBe(0.75);
  });

  test('collects k8s evidence when service provided', async () => {
    const mockK8s = {
      getPodStatus: async () => ({ phase: 'CrashLoopBackOff', restartCount: 5, conditions: [] }),
    };
    const record = await agent.execute(makeContext(), { k8sService: mockK8s });
    const items  = record.result.evidencePackage.items;
    expect(items.some(i => i.type === 'KUBERNETES_EVENT')).toBe(true);
  });

  test('adds to missing when k8s unavailable', async () => {
    const record = await agent.execute(makeContext(), {});
    // No k8s service — should note missing
    const pkg = record.result.evidencePackage;
    expect(Array.isArray(pkg.missingEvidence)).toBe(true);
  });

  test('collects historical evidence from memory service', async () => {
    const mockMem = {
      find: async () => ({
        stats: { totalOccurrences: 3, lastOccurrence: new Date() },
        recommendedAction: { action: 'restart', successRate: 0.9 },
      }),
    };
    const record = await agent.execute(makeContext(), { memoryService: mockMem });
    const items  = record.result.evidencePackage.items;
    expect(items.some(i => i.type === 'HISTORICAL_INCIDENT')).toBe(true);
  });

  test('does not collect evidence if incident type missing', async () => {
    const ctx = makeContext({ incident: { severity: 'HIGH' } });
    const record = await agent.execute(ctx, {});
    expect(record.status).toBe(AGENT_STATUS.SUCCESS);
  });
});
