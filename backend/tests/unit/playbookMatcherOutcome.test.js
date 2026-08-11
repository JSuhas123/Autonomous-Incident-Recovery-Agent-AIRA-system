'use strict';

/**
 * PlaybookMatcher — resolveMatchOutcome (no-safe-playbook path) tests
 */

const { matchPlaybooks, resolveMatchOutcome, WEIGHTS } = require('../../playbooks/matching/playbookMatcher');
const { EXECUTION_OUTCOME, MANUAL_REASON } = require('../../constants/executionOutcomes');
const { PLAYBOOK_LIFECYCLE } = require('../../constants/playbook');

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeActivePlaybook(overrides = {}) {
  return {
    playbookId: 'PB-TEST-MATCH-001',
    semver: '1.0.0',
    name: 'Test Matcher Playbook',
    lifecycle: PLAYBOOK_LIFECYCLE.ACTIVE,
    risk: { level: 'MEDIUM' },
    approval: { mode: 'AUTOMATIC' },
    requiredEvidence: [],
    triggers: {},
    incident: {},
    ...overrides,
  };
}

function makeIncident(overrides = {}) {
  return {
    type: 'kubernetes.pod.crash',
    severity: 'high',
    environment: 'production',
    ...overrides,
  };
}

// ── resolveMatchOutcome tests ─────────────────────────────────────────────────

describe('resolveMatchOutcome — AUTO_RESOLVED path', () => {
  test('returns AUTO_RESOLVED when eligible playbooks exist with AUTOMATIC approval', () => {
    const playbooks = [makeActivePlaybook()];
    const incident  = makeIncident();
    const results   = matchPlaybooks(playbooks, incident);
    const outcome   = resolveMatchOutcome(results, incident);

    expect(outcome.outcome).toBe(EXECUTION_OUTCOME.AUTO_RESOLVED);
    expect(outcome.eligibleCount).toBeGreaterThan(0);
    expect(outcome.best).toBeDefined();
    expect(outcome.best.playbookId).toBe('PB-TEST-MATCH-001');
  });

  test('best is the highest-scored eligible playbook', () => {
    const playbooks = [
      makeActivePlaybook({ playbookId: 'PB-A', incident: { types: ['kubernetes.pod.crash'] } }),
      makeActivePlaybook({ playbookId: 'PB-B', incident: {} }),
    ];
    const incident = makeIncident();
    const results  = matchPlaybooks(playbooks, incident);
    const outcome  = resolveMatchOutcome(results, incident);

    expect(outcome.outcome).toBe(EXECUTION_OUTCOME.AUTO_RESOLVED);
    expect(outcome.best.playbookId).toBe('PB-A');
  });
});

describe('resolveMatchOutcome — WAITING_FOR_APPROVAL path', () => {
  test('returns WAITING_FOR_APPROVAL when eligible playbook has MANUAL approval', () => {
    const playbooks = [makeActivePlaybook({ approval: { mode: 'MANUAL' } })];
    const incident  = makeIncident();
    const results   = matchPlaybooks(playbooks, incident);
    const outcome   = resolveMatchOutcome(results, incident);

    expect(outcome.outcome).toBe(EXECUTION_OUTCOME.WAITING_FOR_APPROVAL);
    expect(outcome.reason).toBe(MANUAL_REASON.APPROVAL_REQUIRED);
    expect(outcome.eligible.length).toBeGreaterThan(0);
  });

  test('returns WAITING_FOR_APPROVAL when eligible playbook has CONDITIONAL approval', () => {
    const playbooks = [makeActivePlaybook({ approval: { mode: 'CONDITIONAL' } })];
    const incident  = makeIncident();
    const results   = matchPlaybooks(playbooks, incident);
    const outcome   = resolveMatchOutcome(results, incident);

    expect(outcome.outcome).toBe(EXECUTION_OUTCOME.WAITING_FOR_APPROVAL);
  });
});

describe('resolveMatchOutcome — MANUAL_REQUIRED / NO_SAFE_PLAYBOOK path', () => {
  test('returns MANUAL_REQUIRED with NO_SAFE_PLAYBOOK when no playbooks at all', () => {
    const outcome = resolveMatchOutcome([], makeIncident());
    expect(outcome.outcome).toBe(EXECUTION_OUTCOME.MANUAL_REQUIRED);
    expect(outcome.reason).toBe(MANUAL_REASON.NO_SAFE_PLAYBOOK);
    expect(outcome.eligibleCount).toBe(0);
    expect(outcome.escalationRecommendation).toBeDefined();
  });

  test('returns MANUAL_REQUIRED with NO_ACTIVE_PLAYBOOK when all playbooks are DRAFT', () => {
    const playbooks = [
      makeActivePlaybook({ lifecycle: PLAYBOOK_LIFECYCLE.DRAFT }),
    ];
    const incident = makeIncident();
    const results  = matchPlaybooks(playbooks, incident);
    const outcome  = resolveMatchOutcome(results, incident);

    expect(outcome.outcome).toBe(EXECUTION_OUTCOME.MANUAL_REQUIRED);
    expect(outcome.reason).toBe(MANUAL_REASON.NO_ACTIVE_PLAYBOOK);
    expect(outcome.candidateCount).toBeGreaterThan(0);
  });

  test('returns MANUAL_REQUIRED with MISSING_EVIDENCE when evidence is required but absent', () => {
    const playbooks = [
      makeActivePlaybook({ requiredEvidence: ['pod_name', 'namespace'] }),
    ];
    const incident = makeIncident(); // no pod_name or namespace
    const results  = matchPlaybooks(playbooks, incident);
    const outcome  = resolveMatchOutcome(results, incident);

    expect(outcome.outcome).toBe(EXECUTION_OUTCOME.MANUAL_REQUIRED);
    expect(outcome.reason).toBe(MANUAL_REASON.MISSING_EVIDENCE);
    expect(outcome.missingEvidence.length).toBeGreaterThan(0);
  });

  test('escalationRecommendation names the closest candidate when candidates exist', () => {
    const playbooks = [
      makeActivePlaybook({ lifecycle: PLAYBOOK_LIFECYCLE.DRAFT, name: 'My Draft Playbook' }),
    ];
    const incident = makeIncident();
    const results  = matchPlaybooks(playbooks, incident);
    const outcome  = resolveMatchOutcome(results, incident);

    expect(outcome.escalationRecommendation).toContain('My Draft Playbook');
  });

  test('escalationRecommendation mentions incident type when no candidates', () => {
    const outcome = resolveMatchOutcome([], makeIncident({ type: 'network.dns_failure' }));
    expect(outcome.escalationRecommendation).toContain('network.dns_failure');
  });

  test('disqualifications array is populated from all candidates', () => {
    const playbooks = [
      makeActivePlaybook({ lifecycle: PLAYBOOK_LIFECYCLE.DRAFT }),
      makeActivePlaybook({ lifecycle: PLAYBOOK_LIFECYCLE.DEPRECATED, playbookId: 'PB-X' }),
    ];
    const incident = makeIncident();
    const results  = matchPlaybooks(playbooks, incident);
    const outcome  = resolveMatchOutcome(results, incident);

    expect(outcome.disqualifications.length).toBeGreaterThan(0);
  });
});

describe('resolveMatchOutcome — output shape', () => {
  test('AUTO_RESOLVED shape has eligible array and best', () => {
    const results = matchPlaybooks([makeActivePlaybook()], makeIncident());
    const outcome = resolveMatchOutcome(results, makeIncident());

    expect(outcome).toMatchObject({
      outcome: EXECUTION_OUTCOME.AUTO_RESOLVED,
      eligibleCount: expect.any(Number),
      candidateCount: expect.any(Number),
      best: expect.objectContaining({ playbookId: expect.any(String) }),
      eligible: expect.any(Array),
    });
  });

  test('MANUAL_REQUIRED shape has escalationRecommendation string', () => {
    const outcome = resolveMatchOutcome([], makeIncident());
    expect(typeof outcome.escalationRecommendation).toBe('string');
    expect(outcome.escalationRecommendation.length).toBeGreaterThan(0);
  });
});
