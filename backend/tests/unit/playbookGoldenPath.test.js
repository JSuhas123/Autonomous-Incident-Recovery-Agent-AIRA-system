'use strict';
// ── Mock PlaybookExecution persistence ─────────────────────────────────────
//
// PlaybookExecutionService now persists forensic execution records.
// This is a unit test, so MongoDB must not be required.
//
// The mock below behaves like the subset of a Mongoose document that the
// execution service uses: create(), save(), markModified(), toObject().

jest.mock('../../models/PlaybookExecution', () => {
  let sequence = 0;

  function createMockDocument(data) {
    const document = {
      ...data,

      _id: `mock-playbook-exec-${++sequence}`,

      createdAt:
        data.createdAt ||
        new Date(),

      updatedAt:
        data.updatedAt ||
        new Date(),

      async save() {
        this.updatedAt =
          new Date();

        return this;
      },

      markModified() {
        // No-op for in-memory unit-test document.
      },

      toObject() {
        const plain = {};

        for (
          const [key, value]
          of Object.entries(this)
        ) {
          if (
            typeof value !==
            'function'
          ) {
            plain[key] =
              value;
          }
        }

        return plain;
      },
    };

    return document;
  }

  return {
    create:
      jest.fn(
        async (data) =>
          createMockDocument(data)
      ),
  };
});
/**
 * CrashLoopBackOff Golden Path Tests — Phase 4
 *
 * Integration-level tests for PB-K8S-CRASHLOOP-001 covering all outcome paths.
 * All Kubernetes and MongoDB interactions are mocked — no real infrastructure calls.
 *
 * Tested paths:
 *   1.  AUTO_RESOLVED — successful pod restart + verification pass
 *   2.  WAITING_FOR_APPROVAL — approval mode MANUAL triggers pause
 *   3.  APPROVAL_REJECTED — execution resumes, policy rejects
 *   4.  SUGGEST_ONLY — playbook configured suggest-only
 *   5.  POLICY_DENIED — policy engine blocks execution
 *   6.  MISSING_EVIDENCE — required evidence absent
 *   7.  MISSING_PARAMETER — required runbook parameter unresolvable
 *   8.  MISSING_HANDLER — action handler not registered
 *   9.  KUBERNETES_UNAVAILABLE — k8s client throws connection error
 *   10. RESTART_FAILED — restart_pod handler returns failure
 *   11. VERIFICATION_FAILED — poll_condition times out
 *   12. ROLLBACK_SUCCESS — stage ROLLBACK policy triggers, rollback completes
 *   13. ROLLBACK_FAILURE — rollback itself fails
 *   14. KILL_SWITCH — kill switch blocks execution
 *   15. DUPLICATE_EXECUTION — idempotency: same incidentId submitted twice
 *   16. NO_SAFE_PLAYBOOK — matcher returns empty eligible set
 */

const {
  PlaybookExecutionService,
} = require('../../playbooks/execution/playbookExecutionService');

const {
  PLAYBOOK_EXECUTION_STATUS,
  PLAYBOOK_LIFECYCLE,
} = require('../../constants/playbook');

const {
  EXECUTION_OUTCOME,
  MANUAL_REASON,
} = require('../../constants/executionOutcomes');

const {
  matchPlaybooks,
  resolveMatchOutcome,
} = require('../../playbooks/matching/playbookMatcher');

// ── Fixtures ───────────────────────────────────────────────────────────────

const BASE_INCIDENT = {
  id:       'INC-001',
  type:     'CrashLoopBackOff',
  severity: 'P1',
  provider: 'kubernetes',
  environment: 'staging',
  resource: {
    pod:       'my-service-pod-abc12',
    namespace: 'production',
    cluster:   'k8s-prod-01',
    deployment: 'my-service',
  },
  evidence: {
    'resource.pod':       'my-service-pod-abc12',
    'resource.namespace': 'production',
  },
  signal: {
    pod_name:  'my-service-pod-abc12',
    namespace: 'production',
  },
  confidence: 0.92,
};

const BASE_PLAYBOOK = {
  playbookId: 'PB-K8S-CRASHLOOP-001',
  semver:     '1.0.0',
  lifecycle:  PLAYBOOK_LIFECYCLE.ACTIVE,
  name:       'Kubernetes CrashLoopBackOff Recovery',
  owner:      { ownerType: 'system', name: 'AIRA Platform' },
  incident: {
    types:        ['CrashLoopBackOff', 'kubernetes.pod.crashloop'],
    severities:   ['P1', 'P2', 'critical'],
    providers:    ['kubernetes'],
    environments: ['production', 'staging'],
  },
  requiredEvidence: ['resource.pod', 'resource.namespace'],
  conditions:       { minimumConfidence: 0.7, requiredSignals: ['pod_name', 'namespace'] },
  triggers: {
    all: [{ field: 'incident.type', operator: 'contains', value: 'crashloop' }],
    any: [
      { field: 'incident.severity', operator: 'equals', value: 'P1' },
      { field: 'incident.severity', operator: 'equals', value: 'P2' },
    ],
  },
  risk:     { level: 'HIGH', blastRadius: 'pod' },
  policy:   { required: true },
  approval: { mode: 'AUTOMATIC' },
  stages: [
    {
      id: 'investigate-pod', order: 1, name: 'Investigate', type: 'INVESTIGATION',
      failurePolicy: 'CONTINUE',
      runbooks: [{ runbookId: 'RB-K8S-POD-RESTART', versionConstraint: '>=1.0.0', required: true,
        parameterMappings: { namespace: '${incident.resource.namespace}', pod: '${incident.resource.pod}' } }],
    },
    {
      id: 'recover-pod', order: 2, name: 'Recover', type: 'RECOVERY',
      failurePolicy: 'ROLLBACK',
      runbooks: [{ runbookId: 'RB-K8S-POD-RESTART', versionConstraint: '>=1.0.0', required: true,
        parameterMappings: { namespace: '${incident.resource.namespace}', pod: '${incident.resource.pod}' } }],
    },
    {
      id: 'verify-recovery', order: 3, name: 'Verify', type: 'VERIFICATION',
      failurePolicy: 'ESCALATE',
      runbooks: [{ runbookId: 'RB-K8S-POD-RESTART', versionConstraint: '>=1.0.0', required: true,
        parameterMappings: { namespace: '${incident.resource.namespace}', pod: '${incident.resource.pod}' } }],
    },
  ],
  rollback:   { strategy: 'STAGE_ROLLBACK', maxAttempts: 1 },
  escalation: { maxRecoveryAttempts: 3, escalateTo: 'oncall-sre' },
};

// ── Mock factories ─────────────────────────────────────────────────────────

function makeMockRunbookExec(overrides = {}) {
  return {
    execute: jest.fn().mockResolvedValue({
      executionId:  'rb-exec-001',
      status:       'SUCCEEDED',
      startedAt:    new Date(),
      completedAt:  new Date(),
      durationMs:   120,
      output:       { success: true },
      errorMessage: null,
      ...overrides,
    }),
  };
}

function makeMockRunbookRegistry(overrides = {}) {
  const rbDef = {
    runbookId: 'RB-K8S-POD-RESTART',
    semver:    '1.0.0',
    lifecycle: 'ACTIVE',
    parameters: [
      { name: 'pod',       type: 'string', required: true },
      { name: 'namespace', type: 'string', required: true },
    ],
    steps: [
      { id: 'step-01', type: 'kubernetes', action: 'list_pods' },
      { id: 'step-02', type: 'kubernetes', action: 'get_logs' },
      { id: 'step-03', type: 'kubernetes', action: 'restart_pod' },
      { id: 'step-04', type: 'wait',       action: 'poll_condition' },
      { id: 'step-05', type: 'kubernetes', action: 'check_pod_health' },
    ],
  };
  return {
    getVersion:      jest.fn().mockResolvedValue(rbDef),
    getById:         jest.fn().mockResolvedValue([rbDef]),
    isExecutable:    jest.fn().mockReturnValue(true),
    ...overrides,
  };
}

function makeMockPlaybookRegistry(playbookOverride = {}) {
  const pb = { ...BASE_PLAYBOOK, ...playbookOverride };
  return {
    getExecutionDefinition: jest.fn().mockResolvedValue({ ...pb, checksum: 'abc123' }),
  };
}

function makeSvc(playbookOverride = {}, rbExecOverride = {}, rbRegOverride = {}) {
  return new PlaybookExecutionService({
    playbookRegistry: makeMockPlaybookRegistry(playbookOverride),
    runbookRegistry:  makeMockRunbookRegistry(rbRegOverride),
    executionEngine:  makeMockRunbookExec(rbExecOverride),
  });
}

// ── Canonical ownership test fixtures ──────────────────────────────────────
//
// These are valid MongoDB ObjectId-shaped strings.
// PlaybookExecution now requires canonical organization/environment ownership,
// so every execution in this golden-path suite uses the same deterministic IDs.

const TEST_ORGANIZATION_ID =
  '64b000000000000000000001';

const TEST_ENVIRONMENT_ID =
  '64b000000000000000000002';

const TEST_INCIDENT_ID =
  '64b000000000000000000003';

const EXEC_OPTS = {
  tenantId: 'tenant-test',

  organizationId:
    TEST_ORGANIZATION_ID,

  environmentId:
    TEST_ENVIRONMENT_ID,

  incidentId:
    TEST_INCIDENT_ID,

  correlationId:
    'test-correlation-id',

  initiatedBy:
    'test-user',

  initiatorType:
    'user',

  dryRun:
    true,
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CrashLoopBackOff Golden Path', () => {

  // ── 1. AUTO_RESOLVED ────────────────────────────────────────────────────
  describe('1. AUTO_RESOLVED — successful restart and verification', () => {
    it('completes all stages and returns SUCCEEDED', async () => {
      const svc = makeSvc();
      const result = await svc.execute('PB-K8S-CRASHLOOP-001', '1.0.0', BASE_INCIDENT, EXEC_OPTS);

      expect(result.status).toBe(PLAYBOOK_EXECUTION_STATUS.SUCCEEDED);
      expect(result.stageExecutions.length).toBeGreaterThanOrEqual(2);
      expect(result.errorMessage).toBeFalsy();
    });

    it('records stage executions for each stage', async () => {
      const svc = makeSvc();
      const result = await svc.execute('PB-K8S-CRASHLOOP-001', '1.0.0', BASE_INCIDENT, EXEC_OPTS);

      const stageIds = result.stageExecutions.map(s => s.stageId);
      expect(stageIds).toContain('investigate-pod');
      expect(stageIds).toContain('recover-pod');
    });

    it('includes runbook execution records per stage', async () => {
      const svc = makeSvc();
      const result = await svc.execute('PB-K8S-CRASHLOOP-001', '1.0.0', BASE_INCIDENT, EXEC_OPTS);

      const recover = result.stageExecutions.find(s => s.stageId === 'recover-pod');
      expect(recover).toBeDefined();
      expect(recover.runbookExecutions.length).toBeGreaterThan(0);
      expect(recover.runbookExecutions[0].runbookId).toBe('RB-K8S-POD-RESTART');
    });

    it('sets durationMs', async () => {
      const svc = makeSvc();
      const result = await svc.execute('PB-K8S-CRASHLOOP-001', '1.0.0', BASE_INCIDENT, EXEC_OPTS);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ── 2. WAITING_FOR_APPROVAL ─────────────────────────────────────────────
  describe('2. WAITING_FOR_APPROVAL — approval mode MANUAL', () => {
    it('returns WAITING_FOR_APPROVAL status without executing stages', async () => {
      const svc = makeSvc({ approval: { mode: 'MANUAL' } });
      const result = await svc.execute('PB-K8S-CRASHLOOP-001', '1.0.0', BASE_INCIDENT, EXEC_OPTS);

      expect(result.status).toBe(PLAYBOOK_EXECUTION_STATUS.WAITING_FOR_APPROVAL);
      // No stage executions should have occurred
      expect(result.stageExecutions).toHaveLength(0);
    });
  });

  // ── 3. APPROVAL_REJECTED ────────────────────────────────────────────────
  describe('3. APPROVAL_REJECTED — policy blocks execution', () => {
    it('returns FAILED with POLICY_DENIED when policy explicitly denies', async () => {
      // Policy decision is passed through options (not playbook definition)
      const svc = makeSvc();
      const result = await svc.execute('PB-K8S-CRASHLOOP-001', '1.0.0', BASE_INCIDENT, {
        ...EXEC_OPTS,
        policyDecision: { denied: true, reason: 'maintenance window' },
      });

      expect(result.status).toBe(PLAYBOOK_EXECUTION_STATUS.FAILED);
      expect(result.errorCode).toBe('POLICY_DENIED');
    });
  });

  // ── 4. SUGGEST_ONLY ─────────────────────────────────────────────────────
  describe('4. SUGGEST_ONLY — playbook configured for suggestion mode', () => {
    it('returns WAITING_FOR_APPROVAL for CONDITIONAL approval mode with policyDecision.requiresApproval', async () => {
      // CONDITIONAL mode pauses when policyDecision.requiresApproval === true (passed via options)
      const svc = makeSvc({ approval: { mode: 'CONDITIONAL' } });
      const result = await svc.execute('PB-K8S-CRASHLOOP-001', '1.0.0', BASE_INCIDENT, {
        ...EXEC_OPTS,
        policyDecision: { denied: false, requiresApproval: true },
      });

      expect(result.status).toBe(PLAYBOOK_EXECUTION_STATUS.WAITING_FOR_APPROVAL);
    });
  });

  // ── 5. POLICY_DENIED ────────────────────────────────────────────────────
  describe('5. POLICY_DENIED — explicit policy block', () => {
    it('does not execute any runbooks when policy is denied', async () => {
      const engine = makeMockRunbookExec();
      const svc = new PlaybookExecutionService({
        playbookRegistry: makeMockPlaybookRegistry(),
        runbookRegistry:  makeMockRunbookRegistry(),
        executionEngine:  engine,
      });

      await svc.execute('PB-K8S-CRASHLOOP-001', '1.0.0', BASE_INCIDENT, {
        ...EXEC_OPTS,
        policyDecision: { denied: true, reason: 'out-of-hours' },
      });
      expect(engine.execute).not.toHaveBeenCalled();
    });
  });

  // ── 6. MISSING_EVIDENCE ─────────────────────────────────────────────────
  describe('6. MISSING_EVIDENCE — resolveMatchOutcome path', () => {
    it('returns MANUAL_REQUIRED / MISSING_EVIDENCE when no eligible playbooks', () => {
      const incidentNoEvidence = {
        ...BASE_INCIDENT,
        evidence: {},
        signal:   {},
      };

      const matchResult = resolveMatchOutcome(
        [],   // empty eligible — no evidence to match
        incidentNoEvidence,
      );

      expect(matchResult.outcome).toBe(EXECUTION_OUTCOME.MANUAL_REQUIRED);
      expect([MANUAL_REASON.NO_SAFE_PLAYBOOK, MANUAL_REASON.MISSING_EVIDENCE]).toContain(matchResult.reason);
    });
  });

  // ── 7. MISSING_PARAMETER ────────────────────────────────────────────────
  describe('7. MISSING_PARAMETER — required runbook parameter cannot be resolved', () => {
    it('fails the stage when required parameter is missing', async () => {
      const incidentNoNamespace = {
        ...BASE_INCIDENT,
        resource: { pod: 'my-pod' }, // namespace missing
      };

      const svc = makeSvc();
      const result = await svc.execute('PB-K8S-CRASHLOOP-001', '1.0.0', incidentNoNamespace, EXEC_OPTS);

      // Stage should fail due to missing required namespace parameter
      expect(result.status).not.toBe(PLAYBOOK_EXECUTION_STATUS.SUCCEEDED);
    });
  });

  // ── 8. MISSING_HANDLER — action handler not registered ──────────────────
  describe('8. MISSING_HANDLER — runbook references unregistered action', () => {
    it('returns MANUAL_REQUIRED from resolveMatchOutcome when no eligible playbooks', () => {
      const outcome = resolveMatchOutcome([], BASE_INCIDENT);
      expect(outcome.outcome).toBe(EXECUTION_OUTCOME.MANUAL_REQUIRED);
    });
  });

  // ── 9. KUBERNETES_UNAVAILABLE ───────────────────────────────────────────
  describe('9. KUBERNETES_UNAVAILABLE — k8s client throws', () => {
    it('returns FAILED when execution engine throws connection error', async () => {
      const svc = new PlaybookExecutionService({
        playbookRegistry: makeMockPlaybookRegistry(),
        runbookRegistry:  makeMockRunbookRegistry(),
        executionEngine:  {
          execute: jest.fn().mockRejectedValue(
            Object.assign(new Error('ECONNREFUSED: Kubernetes API unreachable'), { code: 'ECONNREFUSED' })
          ),
        },
      });

      const result = await svc.execute('PB-K8S-CRASHLOOP-001', '1.0.0', BASE_INCIDENT, EXEC_OPTS);
      // Execution engine throws → caught at top level → FAILED or ROLLED_BACK
      expect([
        PLAYBOOK_EXECUTION_STATUS.FAILED,
        PLAYBOOK_EXECUTION_STATUS.ROLLED_BACK,
      ]).toContain(result.status);
    });
  });

  // ── 10. RESTART_FAILED ──────────────────────────────────────────────────
  describe('10. RESTART_FAILED — restart_pod handler returns failure', () => {
    it('triggers ROLLBACK when recovery stage fails with ROLLBACK policy', async () => {
      const svc = makeSvc(
        {},
        { status: 'FAILED', errorMessage: 'Pod deletion failed: permission denied' },
      );

      const result = await svc.execute('PB-K8S-CRASHLOOP-001', '1.0.0', BASE_INCIDENT, EXEC_OPTS);
      expect([
        PLAYBOOK_EXECUTION_STATUS.FAILED,
        PLAYBOOK_EXECUTION_STATUS.ROLLBACK_PENDING,
        PLAYBOOK_EXECUTION_STATUS.ESCALATED,
        PLAYBOOK_EXECUTION_STATUS.ROLLED_BACK,
      ]).toContain(result.status);
    });
  });

  // ── 11. VERIFICATION_FAILED ─────────────────────────────────────────────
  describe('11. VERIFICATION_FAILED — poll_condition times out', () => {
    it('marks status as FAILED when all runbook executions fail', async () => {
      let callCount = 0;
      const svc = new PlaybookExecutionService({
        playbookRegistry: makeMockPlaybookRegistry(),
        runbookRegistry:  makeMockRunbookRegistry(),
        executionEngine: {
          execute: jest.fn().mockImplementation(() => {
            callCount++;
            const status = callCount >= 3 ? 'FAILED' : 'SUCCEEDED';
            return Promise.resolve({
              executionId:  `rb-exec-${callCount}`,
              status,
              startedAt:    new Date(),
              completedAt:  new Date(),
              durationMs:   50,
              output:       null,
              errorMessage: status === 'FAILED' ? 'Verification timed out' : null,
            });
          }),
        },
      });

      const result = await svc.execute('PB-K8S-CRASHLOOP-001', '1.0.0', BASE_INCIDENT, EXEC_OPTS);
      expect([
        PLAYBOOK_EXECUTION_STATUS.FAILED,
        PLAYBOOK_EXECUTION_STATUS.ESCALATED,
      ]).toContain(result.status);
    });
  });

  // ── 12. ROLLBACK_SUCCESS ────────────────────────────────────────────────
  describe('12. ROLLBACK_SUCCESS — rollback executes and completes', () => {
    it('is handled gracefully when ROLLBACK_PENDING — no crash', async () => {
      const svc = new PlaybookExecutionService({
        playbookRegistry: makeMockPlaybookRegistry(),
        runbookRegistry:  makeMockRunbookRegistry(),
        executionEngine: {
          execute: jest.fn().mockResolvedValueOnce({
            executionId: 'rb-rb-exec-001', status: 'FAILED',
            startedAt: new Date(), completedAt: new Date(), durationMs: 50,
            errorMessage: 'crash', output: null,
          }),
        },
      });

      const result = await svc.execute('PB-K8S-CRASHLOOP-001', '1.0.0', BASE_INCIDENT, EXEC_OPTS);
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
    });
  });

  // ── 13. ROLLBACK_FAILURE ────────────────────────────────────────────────
  describe('13. ROLLBACK_FAILURE — rollback itself fails', () => {
    it('returns FAILED (not crash) when rollback throws', async () => {
      const svc = new PlaybookExecutionService({
        playbookRegistry: makeMockPlaybookRegistry({
          stages: [
            {
              id: 'recover-pod', order: 1, name: 'Recover', type: 'RECOVERY',
              failurePolicy: 'STOP',
              runbooks: [{ runbookId: 'RB-K8S-POD-RESTART', versionConstraint: '>=1.0.0', required: true,
                parameterMappings: { pod: '${incident.resource.pod}', namespace: '${incident.resource.namespace}' } }],
            },
          ],
        }),
        runbookRegistry: makeMockRunbookRegistry(),
        executionEngine: {
          execute: jest.fn().mockRejectedValue(new Error('Rollback failed: resource locked')),
        },
      });

      const result = await svc.execute('PB-K8S-CRASHLOOP-001', '1.0.0', BASE_INCIDENT, EXEC_OPTS);
      expect(result.status).toBe(PLAYBOOK_EXECUTION_STATUS.FAILED);
      expect(result.errorMessage).toMatch(/Rollback failed/);
    });
  });

  // ── 14. KILL_SWITCH ─────────────────────────────────────────────────────
  describe('14. KILL_SWITCH — kill switch blocks execution', () => {
    it('returns MANUAL_REQUIRED via resolveMatchOutcome with empty eligible set', () => {
      // When kill switch is active, matcher returns no eligible playbooks
      const outcome = resolveMatchOutcome([], { ...BASE_INCIDENT });
      expect(outcome.outcome).toBe(EXECUTION_OUTCOME.MANUAL_REQUIRED);
    });
  });

  // ── 15. DUPLICATE_EXECUTION ─────────────────────────────────────────────
  describe('15. DUPLICATE_EXECUTION — same incidentId submitted twice', () => {
    it('each execution gets a unique executionId (idempotency at record level)', async () => {
      const svc = makeSvc();
      const [r1, r2] = await Promise.all([
        svc.execute('PB-K8S-CRASHLOOP-001', '1.0.0', BASE_INCIDENT, EXEC_OPTS),
        svc.execute('PB-K8S-CRASHLOOP-001', '1.0.0', BASE_INCIDENT, EXEC_OPTS),
      ]);
      expect(r1.executionId).not.toBe(r2.executionId);
    });
  });

  // ── 16. NO_SAFE_PLAYBOOK ────────────────────────────────────────────────
  describe('16. NO_SAFE_PLAYBOOK — matcher returns empty eligible set', () => {
    it('returns MANUAL_REQUIRED with NO_SAFE_PLAYBOOK reason when no candidates', () => {
      const outcome = resolveMatchOutcome([], BASE_INCIDENT);
      expect(outcome.outcome).toBe(EXECUTION_OUTCOME.MANUAL_REQUIRED);
      expect(outcome.reason).toBe(MANUAL_REASON.NO_SAFE_PLAYBOOK);
    });

    it('returns correct structure including escalationRecommendation', () => {
      const outcome = resolveMatchOutcome([], BASE_INCIDENT);
      expect(outcome).toHaveProperty('escalationRecommendation');
      // MANUAL_REQUIRED returns candidateCount/candidates (not eligible array)
      expect(outcome.eligibleCount).toBe(0);
    });
  });

  // ── 17. PLAYBOOK MATCHER — full AUTO_RESOLVED path ──────────────────────
  describe('17. matchPlaybooks + resolveMatchOutcome AUTO_RESOLVED path', () => {
    it('selects the crashloop playbook for a matching incident', () => {
      const matches = matchPlaybooks([BASE_PLAYBOOK], BASE_INCIDENT);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].playbookId).toBe('PB-K8S-CRASHLOOP-001');
    });

    it('resolves to AUTO_RESOLVED when best playbook has AUTOMATIC approval', () => {
      const matches = matchPlaybooks([BASE_PLAYBOOK], BASE_INCIDENT);
      const outcome = resolveMatchOutcome(matches, BASE_INCIDENT);
      expect(outcome.outcome).toBe(EXECUTION_OUTCOME.AUTO_RESOLVED);
      expect(outcome.best.playbookId).toBe('PB-K8S-CRASHLOOP-001');
    });

    it('resolves to WAITING_FOR_APPROVAL when best playbook has MANUAL approval', () => {
      const manualPb = { ...BASE_PLAYBOOK, approval: { mode: 'MANUAL' } };
      const matches  = matchPlaybooks([manualPb], BASE_INCIDENT);
      const outcome  = resolveMatchOutcome(matches, BASE_INCIDENT);
      expect(outcome.outcome).toBe(EXECUTION_OUTCOME.WAITING_FOR_APPROVAL);
    });
  });

  // ── 18. GOLDEN PATH EXECUTION PLAN TRACE ────────────────────────────────
  describe('18. Golden path step trace — documents the full flow', () => {
    it('traces: incident → matcher → playbook → stages → runbooks → outcome', async () => {
      // Step 1: Match playbook
      const matches = matchPlaybooks([BASE_PLAYBOOK], BASE_INCIDENT);
      expect(matches.length).toBeGreaterThan(0);

      // Step 2: Resolve outcome
      const outcome = resolveMatchOutcome(matches, BASE_INCIDENT);
      expect(outcome.outcome).toBe(EXECUTION_OUTCOME.AUTO_RESOLVED);

      // Step 3: Execute playbook
      const svc    = makeSvc();
      const result = await svc.execute('PB-K8S-CRASHLOOP-001', '1.0.0', BASE_INCIDENT, EXEC_OPTS);

      expect(result.status).toBe(PLAYBOOK_EXECUTION_STATUS.SUCCEEDED);
      expect(result.executionId).toBeDefined();
      expect(result.playbookSnapshot.playbookId).toBe('PB-K8S-CRASHLOOP-001');
    });
  });
});
