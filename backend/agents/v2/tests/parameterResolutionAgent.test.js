'use strict';

const { ParameterResolutionAgent } = require('../agents/parameterResolutionAgent');
const { MockReasoningProvider } = require('../runtime/reasoningProvider');
const { AGENT_STATUS } = require('../contracts/agentContracts');
const { MANUAL_REASON } = require('../../../constants/executionOutcomes');

function makeContext(overrides = {}) {
  return {
    incidentId:    'INC-005',
    correlationId: 'CORR-005',
    tenantId:      'tenant-a',
    incident:      { type: 'kubernetes.pod.crash', evidence: { namespace: 'prod', pod: 'api-pod' } },
    selectedPlaybook: { playbookId: 'PB-K8S-001', semver: '1.0.0' },
    evidence: {
      items: [],
      completeness: 0.7,
    },
    service:  { id: 'api' },
    resource: { namespace: 'prod', pod: 'api-pod' },
    diagnosis: { primaryHypothesis: 'hyp-0', recommendedIncidentType: 'kubernetes.pod.crash' },
    ...overrides,
  };
}

describe('ParameterResolutionAgent', () => {
  let agent;

  beforeEach(() => {
    const provider = new MockReasoningProvider({
      responses: {
        parameterResolution: {
          candidates: [
            { parameter: 'namespace', proposedValue: 'prod',    confidence: 0.95, evidenceIds: [], source: 'incident.evidence' },
            { parameter: 'pod',       proposedValue: 'api-pod', confidence: 0.90, evidenceIds: [], source: 'incident.evidence' },
          ],
          unresolved:        [],
          ambiguous:         [],
          readyForExecution: true,
        },
      },
    });
    agent = new ParameterResolutionAgent({ reasoningProvider: provider });
  });

  test('requires selectedPlaybook', () => {
    const ctx = makeContext({ selectedPlaybook: null });
    expect(agent.validateInput(ctx).valid).toBe(false);
  });

  test('happy path returns readyForExecution=true with candidates', async () => {
    const record = await agent.execute(makeContext(), {});
    expect(record.status).toBe(AGENT_STATUS.SUCCESS);
    expect(record.result.readyForExecution).toBe(true);
    expect(record.result.candidates.length).toBe(2);
  });

  test('secret parameters are redacted', async () => {
    const provider = new MockReasoningProvider({
      responses: {
        parameterResolution: {
          candidates: [
            { parameter: 'secretKey', proposedValue: 'my-actual-secret', confidence: 0.9, evidenceIds: [] },
          ],
          readyForExecution: true,
        },
      },
    });
    const a2 = new ParameterResolutionAgent({ reasoningProvider: provider });
    const record = await a2.execute(makeContext(), {});
    const secretCandidate = record.result.candidates.find(c => c.parameter === 'secretKey');
    expect(secretCandidate.proposedValue).toBe('[SECRET-REF-ONLY]');
  });

  test('ambiguous parameters trigger MANUAL_REQUIRED', async () => {
    const provider = new MockReasoningProvider({
      responses: {
        parameterResolution: {
          candidates:        [],
          unresolved:        [],
          ambiguous:         ['pod'],
          readyForExecution: false,
        },
      },
    });
    const a2 = new ParameterResolutionAgent({ reasoningProvider: provider });
    const record = await a2.execute(makeContext(), {});
    expect(record.status).toBe(AGENT_STATUS.MANUAL_REQUIRED);
    expect(record.result.manualReason).toBe(MANUAL_REASON.RESOURCE_AMBIGUOUS);
  });

  test('unresolved parameters set readyForExecution=false', async () => {
    const provider = new MockReasoningProvider({
      responses: {
        parameterResolution: {
          candidates:        [],
          unresolved:        ['namespace'],
          ambiguous:         [],
          readyForExecution: false,
        },
      },
    });
    const a2 = new ParameterResolutionAgent({ reasoningProvider: provider });
    const record = await a2.execute(makeContext(), {});
    expect(record.status).toBe(AGENT_STATUS.SUCCESS);
    expect(record.result.readyForExecution).toBe(false);
  });

  test('hallucinated evidence IDs are stripped from candidates', async () => {
    const provider = new MockReasoningProvider({
      responses: {
        parameterResolution: {
          candidates: [
            { parameter: 'namespace', proposedValue: 'prod', confidence: 0.9, evidenceIds: ['FAKE-999'] },
          ],
          readyForExecution: true,
        },
      },
    });
    const a2 = new ParameterResolutionAgent({ reasoningProvider: provider });
    const record = await a2.execute(makeContext(), {});
    // FAKE-999 not in evidence items — stripped
    expect(record.result.candidates[0].evidenceIds).toHaveLength(0);
  });
});
