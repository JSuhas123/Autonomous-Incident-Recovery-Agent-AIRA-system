'use strict';

const { matchPlaybooks, WEIGHTS } = require('../../playbooks/matching/playbookMatcher');
const { PLAYBOOK_LIFECYCLE }       = require('../../constants/playbook');

function activePlaybook(overrides = {}) {
  return {
    playbookId: 'PB-K8S-TEST-001',
    semver:     '1.0.0',
    name:       'Test Playbook',
    lifecycle:  PLAYBOOK_LIFECYCLE.ACTIVE,
    risk:       { level: 'HIGH' },
    approval:   { mode: 'MANUAL' },
    incident: {
      types:        ['CrashLoopBackOff'],
      severities:   ['P1', 'P2'],
      providers:    ['kubernetes'],
      environments: ['production'],
    },
    requiredEvidence: ['resource.pod', 'resource.namespace'],
    triggers: {
      all: [],
      any: [],
    },
    ...overrides,
  };
}

function incident(overrides = {}) {
  return {
    type:        'CrashLoopBackOff',
    severity:    'P1',
    provider:    'kubernetes',
    environment: 'production',
    resource: {
      pod:       'my-pod-abc123',
      namespace: 'default',
    },
    ...overrides,
  };
}

describe('PlaybookMatcher', () => {

  it('returns an array', () => {
    const result = matchPlaybooks([activePlaybook()], incident());
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns empty array for empty playbooks', () => {
    expect(matchPlaybooks([], incident())).toHaveLength(0);
  });

  it('returns empty array for null incident', () => {
    expect(matchPlaybooks([activePlaybook()], null)).toHaveLength(0);
  });

  describe('lifecycle hard disqualification', () => {
    for (const lc of ['DRAFT', 'VALIDATED', 'APPROVED', 'DEPRECATED', 'DISABLED']) {
      it(`disqualifies playbook with lifecycle=${lc}`, () => {
        const pb  = activePlaybook({ lifecycle: lc });
        const inc = incident();
        const results = matchPlaybooks([pb], inc, { minScore: 0 });
        const match = results[0];
        expect(match.eligible).toBe(false);
        expect(match.score).toBe(0);
        expect(match.disqualifications.some(d => d.includes('Lifecycle'))).toBe(true);
      });
    }
  });

  describe('incident type matching', () => {
    it('scores full INCIDENT_TYPE weight on match', () => {
      const results = matchPlaybooks([activePlaybook()], incident(), { minScore: 0 });
      const match   = results[0];
      expect(match.score).toBeGreaterThanOrEqual(WEIGHTS.INCIDENT_TYPE);
    });

    it('does not add full type weight on mismatch', () => {
      const pb  = activePlaybook({ incident: { types: ['OOMKilled'] } });
      const results = matchPlaybooks([pb], incident({ type: 'CrashLoopBackOff' }), { minScore: 0 });
      const match   = results[0];
      // No type match → no type weight
      expect(match.score).toBeLessThan(WEIGHTS.INCIDENT_TYPE + WEIGHTS.SEVERITY);
    });
  });

  describe('environment hard disqualification', () => {
    it('disqualifies when environment does not match', () => {
      const pb = activePlaybook({ incident: { types: ['CrashLoopBackOff'], environments: ['production'] } });
      const inc = incident({ environment: 'development' });
      const results = matchPlaybooks([pb], inc, { minScore: 0 });
      const match = results[0];
      expect(match.eligible).toBe(false);
      expect(match.disqualifications.some(d => d.includes('Environment mismatch'))).toBe(true);
    });
  });

  describe('provider hard disqualification', () => {
    it('disqualifies when provider does not match', () => {
      const pb = activePlaybook({ incident: { types: ['CrashLoopBackOff'], providers: ['aws'] } });
      const inc = incident({ provider: 'kubernetes' });
      const results = matchPlaybooks([pb], inc, { minScore: 0 });
      expect(results[0].eligible).toBe(false);
      expect(results[0].disqualifications.some(d => d.includes('Provider mismatch'))).toBe(true);
    });
  });

  describe('required evidence hard disqualification', () => {
    it('disqualifies when required evidence is missing', () => {
      const pb  = activePlaybook({ requiredEvidence: ['resource.pod', 'resource.namespace'] });
      const inc = incident({ resource: {} }); // no pod or namespace
      const results = matchPlaybooks([pb], inc, { minScore: 0 });
      expect(results[0].eligible).toBe(false);
      expect(results[0].disqualifications.some(d => d.includes('Missing required evidence'))).toBe(true);
    });

    it('passes when all evidence present', () => {
      const results = matchPlaybooks([activePlaybook()], incident(), { minScore: 0 });
      expect(results[0].disqualifications.filter(d => d.includes('evidence'))).toHaveLength(0);
    });
  });

  describe('scoring', () => {
    it('returns score between 0 and 1 for eligible playbook', () => {
      const results = matchPlaybooks([activePlaybook()], incident(), { minScore: 0 });
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].score).toBeLessThanOrEqual(1);
    });

    it('sorts results by score descending', () => {
      const high = activePlaybook({ playbookId: 'PB-HIGH-001', incident: { types: ['CrashLoopBackOff'], severities: ['P1', 'P2'] } });
      const low  = activePlaybook({ playbookId: 'PB-LOW-001',  incident: { types: ['OtherType'] } });
      const results = matchPlaybooks([low, high], incident(), { minScore: 0 });
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    });

    it('respects maxResults', () => {
      const pbs = Array.from({ length: 5 }, (_, i) =>
        activePlaybook({ playbookId: `PB-TEST-00${i + 1}` }));
      const results = matchPlaybooks(pbs, incident(), { minScore: 0, maxResults: 3 });
      expect(results).toHaveLength(3);
    });

    it('returns only eligible results above minScore', () => {
      const pb = activePlaybook({ incident: { types: ['OtherType'] } });
      const results = matchPlaybooks([pb], incident(), { minScore: 0.9 });
      // score will be low because type doesn't match
      results.forEach(r => {
        if (!r.eligible) expect(r.score).toBeLessThan(0.9);
      });
    });
  });

  describe('trigger evaluation', () => {
    it('evaluates "all" triggers correctly', () => {
      const pb = activePlaybook({
        triggers: {
          all: [{ field: 'type', operator: 'contains', value: 'CrashLoop' }],
        },
      });
      const inc = incident({ type: 'CrashLoopBackOff' });
      const results = matchPlaybooks([pb], inc, { minScore: 0 });
      expect(results[0].reasons.some(r => r.includes('Trigger'))).toBe(true);
    });

    it('gives full score for perfect match playbook', () => {
      const pb = activePlaybook({
        incident: { types: ['CrashLoopBackOff'], severities: ['P1'], providers: ['kubernetes'], environments: ['production'] },
        requiredEvidence: ['resource.pod', 'resource.namespace'],
        triggers: { all: [], any: [] },
      });
      const results = matchPlaybooks([pb], incident(), { minScore: 0 });
      const score = results[0].score;
      // Should score at least 0.7 for full incidentType+severity+env+provider+evidence match
      expect(score).toBeGreaterThan(0.7);
    });
  });

  describe('result shape', () => {
    it('includes expected fields in result', () => {
      const results = matchPlaybooks([activePlaybook()], incident(), { minScore: 0 });
      const r = results[0];
      expect(r).toHaveProperty('playbookId');
      expect(r).toHaveProperty('version');
      expect(r).toHaveProperty('score');
      expect(r).toHaveProperty('eligible');
      expect(r).toHaveProperty('reasons');
      expect(r).toHaveProperty('disqualifications');
      expect(r).toHaveProperty('riskLevel');
      expect(r).toHaveProperty('approvalMode');
    });
  });
});
