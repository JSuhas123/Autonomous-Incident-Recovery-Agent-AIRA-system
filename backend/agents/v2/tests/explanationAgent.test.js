'use strict';

const { ExplanationAgent } = require('../agents/explanationAgent');
const { MockReasoningProvider } = require('../runtime/reasoningProvider');
const { AGENT_STATUS } = require('../contracts/agentContracts');

function makeContext(overrides = {}) {
  return {
    incidentId:          'INC-007',
    correlationId:       'CORR-007',
    tenantId:            'tenant-a',
    incident:            { type: 'kubernetes.pod.crash', severity: 'HIGH', title: 'Pod crash' },
    evidence:            { items: [] },
    diagnosis:           { primaryHypothesis: 'hyp-0', diagnosisConfidence: 0.80, recommendedIncidentType: 'oom' },
    selectedPlaybook:    { playbookId: 'PB-001', semver: '1.0.0' },
    resolvedParameters:  { resolved: [] },
    policyDecision:      { verdict: 'APPROVED', reason: null },
    playbookExecutionId: 'exec-001',
    verificationResults: [{ status: 'PASSED', summary: 'Healthy' }],
    rollbackResults:     [],
    manualOutcome:       null,
    timing:              { startedAt: new Date().toISOString() },
    agentTrace:          [],
    ...overrides,
  };
}

describe('ExplanationAgent', () => {
  test('happy path returns explanation', async () => {
    const provider = new MockReasoningProvider({
      responses: {
        explanation: {
          title: 'OOM kill in prod', summary: 'Pod killed due to memory limit',
          whatHappened: '[FACT] Pod was OOM killed', likelyCause: '[INFERENCE] Memory leak',
          evidenceSummary: [], decisionSummary: 'AIRA selected CrashLoop playbook',
          actionSummary: ['Restarted pod'], policySummary: 'Auto-approved',
          verificationSummary: 'Pod healthy post-restart', rollbackSummary: '',
          finalOutcome: 'AUTO_RESOLVED', manualReason: null,
          timeline: [], confidenceNotes: [], operatorNextSteps: ['Monitor memory usage'],
        },
      },
    });
    const agent  = new ExplanationAgent({ reasoningProvider: provider });
    const record = await agent.execute(makeContext(), {});
    expect(record.status).toBe(AGENT_STATUS.SUCCESS);
    expect(record.result.explanation.title).toBe('OOM kill in prod');
    expect(record.result.explanation.finalOutcome).toBe('AUTO_RESOLVED');
  });

  test('rollback failure is included in explanation', async () => {
    const provider = new MockReasoningProvider({
      responses: {
        explanation: {
          title: 'Rollback occurred', summary: 'Rollback',
          whatHappened: 'Execution failed, rollback triggered',
          finalOutcome: 'ROLLBACK', rollbackSummary: 'Pod reverted to previous version',
        },
      },
    });
    const ctx = makeContext({ rollbackResults: [{ status: 'ROLLED_BACK' }] });
    const agent  = new ExplanationAgent({ reasoningProvider: provider });
    const record = await agent.execute(ctx, {});
    expect(record.result.explanation.rollbackSummary).toContain('reverted');
  });

  test('generates timeline from agentTrace', async () => {
    const provider = new MockReasoningProvider({ responses: { explanation: { title: 'x', summary: 'y', whatHappened: 'z', finalOutcome: 'ok' } } });
    const ctx = makeContext({
      agentTrace: [
        { agent: 'CorrelationAgent', status: 'SUCCESS', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 100, confidence: 0.8, warnings: [] },
      ],
    });
    const agent  = new ExplanationAgent({ reasoningProvider: provider });
    const record = await agent.execute(ctx, {});
    // Timeline built from agentTrace
    expect(Array.isArray(record.result.explanation.timeline)).toBe(true);
    expect(record.result.explanation.timeline.length).toBe(1);
  });
});
