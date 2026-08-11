'use strict';

const { validatePlaybookSemantics } = require('../../playbooks/validators/playbookSemanticValidator');
const { PLAYBOOK_VALIDATION_PURPOSE } = require('../../constants/playbook');

function minimalValid(overrides = {}) {
  return {
    apiVersion:  'aira.io/v1',
    kind:        'Playbook',
    playbookId:  'PB-K8S-TEST-001',
    semver:      '1.0.0',
    name:        'Test Playbook',
    lifecycle:   'DRAFT',
    owner:       { ownerType: 'system' },
    stages: [
      { id: 'inv', order: 1, name: 'Investigation', type: 'INVESTIGATION', runbooks: [] },
      { id: 'rec', order: 2, name: 'Recovery',      type: 'RECOVERY',      runbooks: [] },
    ],
    ...overrides,
  };
}

describe('PlaybookSemanticValidator', () => {

  it('passes a valid two-stage playbook', async () => {
    const { valid } = await validatePlaybookSemantics(minimalValid());
    expect(valid).toBe(true);
  });

  it('returns empty diagnostics for minimal valid', async () => {
    const { diagnostics } = await validatePlaybookSemantics(minimalValid());
    expect(diagnostics.filter(d => d.severity === 'ERROR')).toHaveLength(0);
  });

  describe('stage ordering', () => {
    it('warns when stage ordering does not start at 1', async () => {
      const pb = minimalValid({
        stages: [
          { id: 'a', order: 2, name: 'A', type: 'INVESTIGATION', runbooks: [] },
          { id: 'b', order: 3, name: 'B', type: 'RECOVERY',      runbooks: [] },
        ],
      });
      const { diagnostics } = await validatePlaybookSemantics(pb);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_STAGE_ORDER_GAP' && d.severity === 'WARNING')).toBe(true);
    });

    it('warns when RECOVERY appears before INVESTIGATION', async () => {
      const pb = minimalValid({
        stages: [
          { id: 'rec', order: 1, name: 'Recovery',     type: 'RECOVERY',      runbooks: [] },
          { id: 'inv', order: 2, name: 'Investigation', type: 'INVESTIGATION', runbooks: [] },
        ],
      });
      const { diagnostics } = await validatePlaybookSemantics(pb);
      expect(diagnostics.some(d =>
        d.severity === 'WARNING' && d.message && d.message.includes('RECOVERY stage appears before INVESTIGATION')
      )).toBe(true);
    });
  });

  describe('version constraints', () => {
    it('errors on invalid version constraint', async () => {
      const pb = minimalValid({
        stages: [{
          id: 's1', order: 1, name: 'S', type: 'RECOVERY',
          runbooks: [{ runbookId: 'RB-TEST-001', versionConstraint: 'not-valid' }],
        }],
      });
      const { valid, diagnostics } = await validatePlaybookSemantics(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_UNRESOLVABLE_VERSION')).toBe(true);
    });

    it('accepts >=1.0.0 constraint', async () => {
      const pb = minimalValid({
        stages: [{
          id: 's1', order: 1, name: 'S', type: 'RECOVERY',
          runbooks: [{ runbookId: 'RB-TEST-001', versionConstraint: '>=1.0.0' }],
        }],
      });
      const { diagnostics } = await validatePlaybookSemantics(pb);
      expect(diagnostics.filter(d => d.code === 'PLAYBOOK_UNRESOLVABLE_VERSION')).toHaveLength(0);
    });

    it('accepts ~1.2.0 constraint', async () => {
      const pb = minimalValid({
        stages: [{
          id: 's1', order: 1, name: 'S', type: 'RECOVERY',
          runbooks: [{ runbookId: 'RB-TEST-001', versionConstraint: '~1.2.0' }],
        }],
      });
      const { diagnostics } = await validatePlaybookSemantics(pb);
      expect(diagnostics.filter(d => d.code === 'PLAYBOOK_UNRESOLVABLE_VERSION')).toHaveLength(0);
    });
  });

  describe('rollback stage references', () => {
    it('errors when rollback references a non-existent stage', async () => {
      const pb = minimalValid({
        rollback: { strategy: 'STAGE_ROLLBACK', stages: ['nonexistent-stage-id'] },
      });
      const { valid, diagnostics } = await validatePlaybookSemantics(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_ROLLBACK_STAGE_NOT_FOUND')).toBe(true);
    });

    it('passes when rollback references a valid stage id', async () => {
      const pb = minimalValid({
        stages: [
          { id: 'inv', order: 1, name: 'Investigation', type: 'INVESTIGATION', runbooks: [] },
          { id: 'rb',  order: 2, name: 'Rollback',      type: 'ROLLBACK',      runbooks: [] },
        ],
        rollback: { strategy: 'STAGE_ROLLBACK', stages: ['rb'] },
      });
      const { valid, diagnostics } = await validatePlaybookSemantics(pb);
      expect(diagnostics.filter(d => d.code === 'PLAYBOOK_ROLLBACK_STAGE_NOT_FOUND')).toHaveLength(0);
    });
  });

  describe('escalation', () => {
    it('errors on invalid maxRecoveryAttempts', async () => {
      const pb = minimalValid({ escalation: { maxRecoveryAttempts: -1 } });
      const { valid, diagnostics } = await validatePlaybookSemantics(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_ESCALATION_INVALID')).toBe(true);
    });

    it('accepts valid maxRecoveryAttempts', async () => {
      const pb = minimalValid({ escalation: { maxRecoveryAttempts: 3 } });
      const { diagnostics } = await validatePlaybookSemantics(pb);
      expect(diagnostics.filter(d => d.code === 'PLAYBOOK_ESCALATION_INVALID')).toHaveLength(0);
    });
  });

  describe('policy/approval for HIGH/CRITICAL risk', () => {
    it('errors for HIGH risk without policy.required in APPROVAL purpose', async () => {
      const pb = minimalValid({
        risk:     { level: 'HIGH' },
        policy:   { required: false },
        approval: { mode: 'AUTOMATIC' },
      });
      const { valid, diagnostics } = await validatePlaybookSemantics(pb, {
        purpose: PLAYBOOK_VALIDATION_PURPOSE.APPROVAL,
      });
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_MISSING_POLICY')).toBe(true);
    });

    it('errors for CRITICAL risk without approval in APPROVAL purpose', async () => {
      const pb = minimalValid({
        risk:     { level: 'CRITICAL' },
        policy:   { required: true },
        approval: { mode: 'DISABLED' },
      });
      const { valid, diagnostics } = await validatePlaybookSemantics(pb, {
        purpose: PLAYBOOK_VALIDATION_PURPOSE.APPROVAL,
      });
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_MISSING_APPROVAL')).toBe(true);
    });

    it('does NOT require policy for LOW risk in AUTHORING', async () => {
      const pb = minimalValid({ risk: { level: 'LOW' } });
      const { diagnostics } = await validatePlaybookSemantics(pb, {
        purpose: PLAYBOOK_VALIDATION_PURPOSE.AUTHORING,
      });
      expect(diagnostics.filter(d => d.code === 'PLAYBOOK_MISSING_POLICY')).toHaveLength(0);
    });
  });

  describe('registry-backed checks', () => {
    it('reports RUNBOOK_NOT_FOUND when registry cannot find runbook', async () => {
      const mockRegistry = {
        getById: jest.fn().mockRejectedValue({ code: 'NOT_FOUND', message: 'Not found' }),
      };
      const pb = minimalValid({
        stages: [{
          id: 's1', order: 1, name: 'S', type: 'RECOVERY',
          runbooks: [{ runbookId: 'RB-MISSING-001' }],
        }],
      });
      const { diagnostics } = await validatePlaybookSemantics(pb, {
        purpose: PLAYBOOK_VALIDATION_PURPOSE.ACTIVATION,
        runbookRegistry: mockRegistry,
      });
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_RUNBOOK_NOT_FOUND')).toBe(true);
    });

    it('reports RUNBOOK_NOT_ACTIVE when required runbook is DRAFT at ACTIVATION', async () => {
      const mockRegistry = {
        getById: jest.fn().mockResolvedValue([
          { runbookId: 'RB-TEST-001', semver: '1.0.0', lifecycle: 'DRAFT' },
        ]),
      };
      const pb = minimalValid({
        stages: [{
          id: 's1', order: 1, name: 'S', type: 'RECOVERY',
          runbooks: [{ runbookId: 'RB-TEST-001', required: true }],
        }],
      });
      const { valid, diagnostics } = await validatePlaybookSemantics(pb, {
        purpose: PLAYBOOK_VALIDATION_PURPOSE.ACTIVATION,
        runbookRegistry: mockRegistry,
      });
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_RUNBOOK_NOT_ACTIVE')).toBe(true);
    });

    it('passes when required runbook is ACTIVE at ACTIVATION', async () => {
      const mockRegistry = {
        getById: jest.fn().mockResolvedValue([
          { runbookId: 'RB-TEST-001', semver: '1.0.0', lifecycle: 'ACTIVE' },
        ]),
      };
      const pb = minimalValid({
        stages: [{
          id: 's1', order: 1, name: 'S', type: 'RECOVERY',
          runbooks: [{ runbookId: 'RB-TEST-001', required: true }],
        }],
      });
      const { valid, diagnostics } = await validatePlaybookSemantics(pb, {
        purpose: PLAYBOOK_VALIDATION_PURPOSE.ACTIVATION,
        runbookRegistry: mockRegistry,
      });
      expect(diagnostics.filter(d => d.code === 'PLAYBOOK_RUNBOOK_NOT_ACTIVE')).toHaveLength(0);
    });
  });

  describe('_resolveVersionConstraint', () => {
    const { _resolveVersionConstraint } = require('../../playbooks/validators/playbookSemanticValidator');

    it('returns latest when no constraint', () => {
      expect(_resolveVersionConstraint(null, ['1.0.0', '2.0.0', '1.5.0'])).toBe('2.0.0');
    });

    it('resolves exact version', () => {
      expect(_resolveVersionConstraint('1.5.0', ['1.0.0', '2.0.0', '1.5.0'])).toBe('1.5.0');
    });

    it('resolves >= constraint to highest matching', () => {
      expect(_resolveVersionConstraint('>=1.0.0', ['1.0.0', '2.0.0', '1.5.0'])).toBe('2.0.0');
    });

    it('resolves ~ to patch-compatible highest', () => {
      expect(_resolveVersionConstraint('~1.2.0', ['1.2.0', '1.2.5', '1.3.0', '2.0.0'])).toBe('1.2.5');
    });

    it('returns null for no matching versions', () => {
      expect(_resolveVersionConstraint('3.0.0', ['1.0.0', '2.0.0'])).toBeNull();
    });

    it('returns null for empty versions array', () => {
      expect(_resolveVersionConstraint('1.0.0', [])).toBeNull();
    });
  });
});
