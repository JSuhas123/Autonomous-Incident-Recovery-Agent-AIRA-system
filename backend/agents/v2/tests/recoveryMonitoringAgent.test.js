'use strict';

const { RecoveryMonitoringAgent } = require('../agents/recoveryMonitoringAgent');
const { MockReasoningProvider } = require('../runtime/reasoningProvider');
const { AGENT_STATUS, RECOVERY_STATE, MONITORING_RECOMMENDATION } = require('../contracts/agentContracts');

function makeContext(overrides = {}) {
  return {
    incidentId:         'INC-006',
    correlationId:      'CORR-006',
    tenantId:           'tenant-a',
    playbookExecutionId:'exec-001',
    verificationResults:[{ status: 'PASSED', summary: 'Pod healthy' }],
    rollbackResults:    [],
    service:            { id: 'api' },
    resource:           { namespace: 'prod' },
    incident:           { type: 'kubernetes.pod.crash' },
    ...overrides,
  };
}

describe('RecoveryMonitoringAgent', () => {
  test('RECOVERED state with CONTINUE recommendation', async () => {
    const provider = new MockReasoningProvider({
      responses: {
        recoveryMonitoring: {
          state: RECOVERY_STATE.RECOVERED, confidence: 0.90,
          observations: ['Pod restarted successfully'], concerns: [],
          recommendation: MONITORING_RECOMMENDATION.CONTINUE,
        },
      },
    });
    const agent  = new RecoveryMonitoringAgent({ reasoningProvider: provider });
    const record = await agent.execute(makeContext(), {});
    expect(record.status).toBe(AGENT_STATUS.SUCCESS);
    expect(record.result.observation.state).toBe(RECOVERY_STATE.RECOVERED);
  });

  test('WORSENING forces ESCALATE recommendation', async () => {
    const provider = new MockReasoningProvider({
      responses: {
        recoveryMonitoring: {
          state: RECOVERY_STATE.WORSENING, confidence: 0.70,
          observations: ['Error rate increasing'], concerns: ['Cascade risk'],
          recommendation: MONITORING_RECOMMENDATION.CONTINUE, // agent tries to continue — safety overrides
        },
      },
    });
    const agent  = new RecoveryMonitoringAgent({ reasoningProvider: provider });
    const record = await agent.execute(makeContext(), {});
    expect(record.result.observation.recommendation).toBe(MONITORING_RECOMMENDATION.ESCALATE);
  });

  test('builds verification evidence items', async () => {
    const provider = new MockReasoningProvider({
      responses: {
        recoveryMonitoring: { state: RECOVERY_STATE.STABLE, confidence: 0.6, recommendation: 'WAIT' },
      },
    });
    const agent  = new RecoveryMonitoringAgent({ reasoningProvider: provider });
    const record = await agent.execute(makeContext(), {});
    expect(record.evidenceUsed.length).toBeGreaterThan(0);
  });

  test('rollback results are captured as evidence', async () => {
    const ctx = makeContext({ rollbackResults: [{ status: 'ROLLED_BACK', summary: 'reverted' }] });
    const provider = new MockReasoningProvider({
      responses: {
        recoveryMonitoring: { state: RECOVERY_STATE.ROLLBACK_IN_PROGRESS, confidence: 0.5, recommendation: 'WAIT' },
      },
    });
    const agent  = new RecoveryMonitoringAgent({ reasoningProvider: provider });
    const record = await agent.execute(ctx, {});
    expect(record.evidenceUsed.length).toBeGreaterThanOrEqual(2); // verify + rollback
  });
});
