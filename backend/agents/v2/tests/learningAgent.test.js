'use strict';

const { LearningAgent } = require('../agents/learningAgent');
const { MockReasoningProvider } = require('../runtime/reasoningProvider');
const { AGENT_STATUS } = require('../contracts/agentContracts');

function makeContext(overrides = {}) {
  return {
    incidentId:         'INC-008',
    correlationId:      'CORR-008',
    tenantId:           'tenant-a',
    incident:           { type: 'kubernetes.pod.crash', severity: 'HIGH' },
    evidence:           { items: [] },
    diagnosis:          { diagnosisConfidence: 0.80 },
    selectedPlaybook:   { playbookId: 'PB-001' },
    playbookExecutionId:'exec-001',
    verificationResults:[{ status: 'PASSED' }],
    rollbackResults:    [],
    manualOutcome:      null,
    agentTrace:         [],
    ...overrides,
  };
}

describe('LearningAgent', () => {
  test('happy path returns recommendations with requiresHumanApproval=true', async () => {
    const provider = new MockReasoningProvider({
      responses: {
        learning: {
          patterns: [{ pattern: 'repeated-oom', frequency: 3 }],
          recommendations: [
            { type: 'IMPROVE_MEMORY_REQUEST', description: 'Increase memory limit', evidence: [], confidence: 0.7, proposedChange: 'memory: 512Mi' },
          ],
          playbookInsights: [],
          runbookInsights:  [],
          policyInsights:   [],
        },
      },
    });
    const agent  = new LearningAgent({ reasoningProvider: provider });
    const record = await agent.execute(makeContext(), {});
    expect(record.status).toBe(AGENT_STATUS.SUCCESS);
    const recs = record.result.recommendations.recommendations;
    expect(recs.length).toBe(1);
    expect(recs[0].requiresHumanApproval).toBe(true);
    expect(recs[0].isDraft).toBe(true);
  });

  test('dangerous proposed change is redacted', async () => {
    const provider = new MockReasoningProvider({
      responses: {
        learning: {
          patterns: [],
          recommendations: [
            { type: 'PROPOSE_DRAFT_RUNBOOK', description: 'Fix', evidence: [],
              confidence: 0.5, proposedChange: 'kubectl exec -it pod -- bash -c "rm -rf /"' },
          ],
        },
      },
    });
    const agent  = new LearningAgent({ reasoningProvider: provider });
    const record = await agent.execute(makeContext(), {});
    const rec = record.result.recommendations.recommendations[0];
    expect(rec.proposedChange).toContain('REDACTED');
  });

  test('validateOutput fails if requiresHumanApproval is missing', () => {
    const agent = new LearningAgent({ reasoningProvider: new MockReasoningProvider() });
    const badRecord = {
      status: AGENT_STATUS.SUCCESS,
      result: {
        recommendations: {
          recommendations: [{ requiresHumanApproval: false, type: 'x' }],
        },
      },
    };
    const v = agent.validateOutput(badRecord);
    expect(v.valid).toBe(false);
  });

  test('cannot mutate active assets (invariant check)', async () => {
    // Learning agent should never produce recommendations that claim to modify ACTIVE Runbooks
    const provider = new MockReasoningProvider({
      responses: {
        learning: {
          patterns: [],
          recommendations: [
            { type: 'PROPOSE_DRAFT_RUNBOOK', description: 'Create new draft runbook', evidence: [], confidence: 0.6 },
          ],
        },
      },
    });
    const agent  = new LearningAgent({ reasoningProvider: provider });
    const record = await agent.execute(makeContext(), {});
    const recs = record.result.recommendations.recommendations;
    recs.forEach(r => {
      expect(r.requiresHumanApproval).toBe(true);
      expect(r.isDraft).toBe(true);
    });
  });

  test('uses memory service for historical context', async () => {
    let memCalled = false;
    const mockMem = { find: async () => { memCalled = true; return null; } };
    const provider = new MockReasoningProvider({ responses: { learning: { patterns: [], recommendations: [] } } });
    const agent  = new LearningAgent({ reasoningProvider: provider });
    await agent.execute(makeContext(), { memoryService: mockMem });
    expect(memCalled).toBe(true);
  });
});
