'use strict';

/**
 * AgentOrchestrator Integration Tests
 *
 * Golden CrashLoop AI flow using mock provider.
 * No external LLM calls required.
 */

const { AgentOrchestrator } = require('../runtime/agentOrchestrator');
const { MockReasoningProvider, configureReasoningProvider } = require('../runtime/reasoningProvider');
const { buildAgentOrchestrator } = require('..');
const { ORCHESTRATION_STATE, AGENT_STATUS, PLAYBOOK_RECOMMENDATION } = require('../contracts/agentContracts');
const { EXECUTION_OUTCOME, MANUAL_REASON } = require('../../../constants/executionOutcomes');

function buildMockProvider() {
  return new MockReasoningProvider({
    responses: {
      correlation: {
        incidentGroup: 'group-INC-009', affectedServices: ['api'],
        affectedResources: ['pod-abc'], correlatedSignalIds: ['sig-0'],
        confidence: 0.85, reasons: [], evidenceIds: [],
      },
      investigation: {
        completeness: 0.75, missingEvidence: [], staleEvidence: [], conflicts: [],
        recommendedNextEvidence: [],
      },
      diagnosis: {
        hypotheses: [{
          rootCause: 'OOM', confidence: 0.80,
          evidenceSupporting: [], evidenceAgainst: [], affectedResources: [],
          explanation: '[FACT] High restart count',
        }],
        primaryHypothesis: 'hyp-0', diagnosisConfidence: 0.80,
        evidenceCompleteness: 0.75, unresolvedQuestions: [],
        recommendedIncidentType: 'kubernetes.oom',
      },
      playbookSelection: {
        recommendedPlaybookId: 'PB-K8S-CRASHLOOP-001', version: '1.0.0',
        candidateRankings: [{ playbookId: 'PB-K8S-CRASHLOOP-001' }],
        reasoningConfidence: 0.85, evidenceIds: [], reasons: [],
        recommendation: 'EXECUTE_CANDIDATE',
      },
      parameterResolution: {
        candidates: [
          { parameter: 'namespace', proposedValue: 'prod', confidence: 0.95, evidenceIds: [], source: 'incident' },
          { parameter: 'pod',       proposedValue: 'api-pod', confidence: 0.90, evidenceIds: [], source: 'incident' },
        ],
        unresolved: [], ambiguous: [], readyForExecution: true,
      },
      recoveryMonitoring: {
        state: 'RECOVERED', confidence: 0.90,
        observations: ['Pod healthy'], concerns: [], recommendation: 'CONTINUE',
      },
      explanation: {
        title: 'OOM Kill in Production', summary: 'Pod killed due to OOM',
        whatHappened: '[FACT] api-pod reached memory limit',
        likelyCause: '[INFERENCE] Memory leak', evidenceSummary: [],
        decisionSummary: 'CrashLoop playbook selected',
        actionSummary: ['Pod restarted'], policySummary: 'Auto-approved',
        verificationSummary: 'Pod healthy', rollbackSummary: '',
        finalOutcome: 'AUTO_RESOLVED', manualReason: null,
        timeline: [], confidenceNotes: [], operatorNextSteps: ['Monitor memory'],
      },
      learning: {
        patterns: [{ pattern: 'oom-crashloop', frequency: 1 }],
        recommendations: [{
          type: 'IMPROVE_MEMORY_REQUEST', description: 'Increase memory limit',
          evidence: [], confidence: 0.7, proposedChange: 'memory: 512Mi',
        }],
        playbookInsights: [], runbookInsights: [], policyInsights: [],
      },
    },
  });
}

describe('AgentOrchestrator — Golden CrashLoop Flow', () => {
  let mockProvider;

  beforeEach(() => {
    mockProvider = buildMockProvider();
    configureReasoningProvider(mockProvider);
  });

  test('full pipeline completes for crashloop incident', async () => {
    const mockPlaybookService = {
      analyseIncident: async () => ({
        outcome: EXECUTION_OUTCOME.AUTO_RESOLVED,
        eligible: [{ playbookId: 'PB-K8S-CRASHLOOP-001', semver: '1.0.0', name: 'CrashLoop Recovery',
          score: 0.9, approvalMode: 'AUTOMATIC', riskLevel: 'MEDIUM', matchReasons: [] }],
        candidates: [{ playbookId: 'PB-K8S-CRASHLOOP-001' }],
        disqualifications: [], missingEvidence: [],
      }),
      executeForIncident: async () => ({
        executed: true, outcome: EXECUTION_OUTCOME.AUTO_RESOLVED,
        playbookId: 'PB-K8S-CRASHLOOP-001',
        execution: { executionId: 'exec-001', status: 'SUCCEEDED', verificationResults: [], rollbackResults: [] },
      }),
    };

    const orchestrator = buildAgentOrchestrator(
      { incidentPlaybookService: mockPlaybookService },
      { dryRun: false, agentTimeoutMs: 5000 },
    );

    const { runRecord } = await orchestrator.run({
      incidentId:    'INC-009',
      correlationId: 'CORR-009',
      tenantId:      'tenant-a',
      incident:      { type: 'kubernetes.pod.crash', severity: 'HIGH', evidence: { namespace: 'prod', pod: 'api-pod' } },
      signals:       [{ type: 'crash-loop', severity: 'HIGH', serviceId: 'api' }],
      alerts:        [],
      service:       { id: 'api' },
      resource:      { namespace: 'prod', pod: 'api-pod' },
    });

    expect(runRecord.state).toBe(ORCHESTRATION_STATE.COMPLETED);
    expect(runRecord.manualRequired).toBe(false);
    expect(runRecord.agentTrace.length).toBeGreaterThanOrEqual(8);
    expect(runRecord.explanationResult).toBeDefined();
    expect(runRecord.explanationResult.title).toContain('OOM');
  });

  test('low correlation confidence triggers MANUAL_REQUIRED', async () => {
    const lowConfidenceProvider = new MockReasoningProvider({
      responses: {
        correlation: { incidentGroup: 'g1', correlatedSignalIds: [], confidence: 0.1, reasons: [], evidenceIds: [] },
      },
    });
    configureReasoningProvider(lowConfidenceProvider);

    const orchestrator = buildAgentOrchestrator({}, { agentTimeoutMs: 5000 });

    const { runRecord } = await orchestrator.run({
      incidentId: 'INC-010', correlationId: 'CORR-010', tenantId: 'tenant-a',
      incident: {}, signals: [{ type: 'x', severity: 'LOW' }], alerts: [],
    });

    expect(runRecord.manualRequired).toBe(true);
  });

  test('NO_SAFE_PLAYBOOK escalates to MANUAL_REQUIRED', async () => {
    const mockPlaybookService = {
      analyseIncident: async () => ({
        outcome: EXECUTION_OUTCOME.MANUAL_REQUIRED, eligible: [], candidates: [],
        disqualifications: [], missingEvidence: [], outcomeReason: MANUAL_REASON.NO_SAFE_PLAYBOOK,
      }),
    };

    const orchestrator = buildAgentOrchestrator(
      { incidentPlaybookService: mockPlaybookService },
      { agentTimeoutMs: 5000 },
    );

    const { runRecord } = await orchestrator.run({
      incidentId: 'INC-011', correlationId: 'CORR-011', tenantId: 'tenant-a',
      incident: { type: 'unknown.custom' }, signals: [{ type: 'x', severity: 'HIGH' }], alerts: [],
    });

    expect(runRecord.manualRequired).toBe(true);
    expect(runRecord.manualReason).toBe(MANUAL_REASON.NO_SAFE_PLAYBOOK);
  });

  test('WAITING_FOR_APPROVAL pauses orchestration', async () => {
    const mockPlaybookService = {
      analyseIncident: async () => ({
        outcome: EXECUTION_OUTCOME.AUTO_RESOLVED,
        eligible: [{ playbookId: 'PB-K8S-CRASHLOOP-001', semver: '1.0.0', name: 'x',
          score: 0.9, approvalMode: 'MANUAL', riskLevel: 'HIGH', matchReasons: [] }],
        candidates: [], disqualifications: [],
      }),
      executeForIncident: async () => ({
        executed: false, outcome: EXECUTION_OUTCOME.WAITING_FOR_APPROVAL,
        reason: MANUAL_REASON.APPROVAL_REQUIRED,
      }),
    };

    const orchestrator = buildAgentOrchestrator(
      { incidentPlaybookService: mockPlaybookService },
      { agentTimeoutMs: 5000 },
    );

    const { runRecord } = await orchestrator.run({
      incidentId: 'INC-012', correlationId: 'CORR-012', tenantId: 'tenant-a',
      incident: { type: 'kubernetes.pod.crash', severity: 'HIGH', evidence: {} },
      signals: [{ type: 'crash', severity: 'HIGH' }], alerts: [],
    });

    expect(runRecord.manualRequired).toBe(true);
    expect(runRecord.manualReason).toBe(MANUAL_REASON.APPROVAL_REQUIRED);
  });

  test('tenant mismatch in context throws or returns manual', async () => {
    const orchestrator = buildAgentOrchestrator({}, { agentTimeoutMs: 5000 });
    await expect(
      orchestrator.run({ incidentId: 'INC-013', correlationId: 'CORR-013', tenantId: null, incident: {}, signals: [] })
    ).rejects.toThrow();
  });

  test('agent timeout produces MANUAL_REQUIRED', async () => {
    const slowProvider = {
      reason: () => new Promise(resolve => setTimeout(() => resolve({ output: {}, fallbackUsed: false, warnings: [] }), 10_000)),
      name: 'slow', version: '1', _timeoutMs: 50,
    };
    configureReasoningProvider(slowProvider);

    const orchestrator = buildAgentOrchestrator({}, { agentTimeoutMs: 100 });
    const { runRecord } = await orchestrator.run({
      incidentId: 'INC-014', correlationId: 'CORR-014', tenantId: 'tenant-a',
      incident: {}, signals: [{ type: 'x', severity: 'HIGH' }], alerts: [],
    });
    expect(runRecord.manualRequired).toBe(true);
  });
});
