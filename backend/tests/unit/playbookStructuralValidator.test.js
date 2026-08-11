'use strict';

const { validatePlaybookStructure } = require('../../playbooks/validators/playbookStructuralValidator');

function minimalValid() {
  return {
    apiVersion:  'aira.io/v1',
    kind:        'Playbook',
    playbookId:  'PB-K8S-TEST-001',
    semver:      '1.0.0',
    name:        'Test Playbook',
    lifecycle:   'DRAFT',
    owner:       { ownerType: 'system', name: 'AIRA' },
    stages: [
      { id: 'stage-1', order: 1, name: 'Investigation', type: 'INVESTIGATION', runbooks: [] },
    ],
  };
}

describe('PlaybookStructuralValidator', () => {

  describe('valid playbook', () => {
    it('passes a minimal valid playbook', () => {
      const { valid, diagnostics } = validatePlaybookStructure(minimalValid());
      expect(valid).toBe(true);
      expect(diagnostics.filter(d => d.severity === 'ERROR')).toHaveLength(0);
    });
  });

  describe('apiVersion', () => {
    it('errors on missing apiVersion', () => {
      const pb = minimalValid(); delete pb.apiVersion;
      const { valid, diagnostics } = validatePlaybookStructure(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_MISSING_API_VERSION')).toBe(true);
    });

    it('errors on wrong apiVersion', () => {
      const pb = { ...minimalValid(), apiVersion: 'wrong/v1' };
      const { valid, diagnostics } = validatePlaybookStructure(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_INVALID_API_VERSION')).toBe(true);
    });
  });

  describe('kind', () => {
    it('errors on missing kind', () => {
      const pb = minimalValid(); delete pb.kind;
      const { valid } = validatePlaybookStructure(pb);
      expect(valid).toBe(false);
    });

    it('errors on wrong kind', () => {
      const pb = { ...minimalValid(), kind: 'Runbook' };
      const { valid, diagnostics } = validatePlaybookStructure(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_INVALID_KIND')).toBe(true);
    });
  });

  describe('playbookId', () => {
    it('errors on missing playbookId', () => {
      const pb = minimalValid(); delete pb.playbookId;
      const { valid, diagnostics } = validatePlaybookStructure(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_MISSING_ID')).toBe(true);
    });

    it('errors on invalid playbookId format', () => {
      const pb = { ...minimalValid(), playbookId: 'INVALID' };
      const { valid, diagnostics } = validatePlaybookStructure(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_INVALID_ID')).toBe(true);
    });

    it('accepts PB-K8S-CRASHLOOP-001', () => {
      const { valid } = validatePlaybookStructure({ ...minimalValid(), playbookId: 'PB-K8S-CRASHLOOP-001' });
      expect(valid).toBe(true);
    });

    it('accepts PB-DB-FAILOVER-PROD-002', () => {
      const { valid } = validatePlaybookStructure({ ...minimalValid(), playbookId: 'PB-DB-FAILOVER-PROD-002' });
      expect(valid).toBe(true);
    });

    it('rejects PB-x (lowercase)', () => {
      const { valid } = validatePlaybookStructure({ ...minimalValid(), playbookId: 'PB-x-001' });
      expect(valid).toBe(false);
    });
  });

  describe('semver', () => {
    it('errors on missing semver', () => {
      const pb = minimalValid(); delete pb.semver;
      const { valid, diagnostics } = validatePlaybookStructure(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_MISSING_SEMVER')).toBe(true);
    });

    it('errors on invalid semver', () => {
      const pb = { ...minimalValid(), semver: 'v1.0' };
      const { valid, diagnostics } = validatePlaybookStructure(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_INVALID_SEMVER')).toBe(true);
    });

    it('accepts 2.3.4-alpha.1', () => {
      const { valid } = validatePlaybookStructure({ ...minimalValid(), semver: '2.3.4-alpha.1' });
      expect(valid).toBe(true);
    });
  });

  describe('lifecycle', () => {
    it('errors on invalid lifecycle', () => {
      const pb = { ...minimalValid(), lifecycle: 'UNKNOWN' };
      const { valid, diagnostics } = validatePlaybookStructure(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_INVALID_LIFECYCLE')).toBe(true);
    });

    it('accepts all valid lifecycle values', () => {
      for (const lc of ['DRAFT', 'VALIDATED', 'APPROVED', 'ACTIVE', 'DEPRECATED', 'DISABLED']) {
        const { valid } = validatePlaybookStructure({ ...minimalValid(), lifecycle: lc });
        expect(valid).toBe(true);
      }
    });
  });

  describe('owner', () => {
    it('errors on missing owner', () => {
      const pb = minimalValid(); delete pb.owner;
      const { valid, diagnostics } = validatePlaybookStructure(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_MISSING_OWNER')).toBe(true);
    });

    it('errors on invalid ownerType', () => {
      const pb = { ...minimalValid(), owner: { ownerType: 'invalid' } };
      const { valid, diagnostics } = validatePlaybookStructure(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_INVALID_OWNER_TYPE')).toBe(true);
    });
  });

  describe('stages', () => {
    it('errors on missing stages', () => {
      const pb = minimalValid(); delete pb.stages;
      const { valid, diagnostics } = validatePlaybookStructure(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_MISSING_STAGES')).toBe(true);
    });

    it('errors on empty stages', () => {
      const pb = { ...minimalValid(), stages: [] };
      const { valid, diagnostics } = validatePlaybookStructure(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_EMPTY_STAGES')).toBe(true);
    });

    it('errors on duplicate stage id', () => {
      const pb = {
        ...minimalValid(),
        stages: [
          { id: 'same', order: 1, name: 'A', type: 'INVESTIGATION', runbooks: [] },
          { id: 'same', order: 2, name: 'B', type: 'RECOVERY',      runbooks: [] },
        ],
      };
      const { valid, diagnostics } = validatePlaybookStructure(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_DUPLICATE_STAGE_ID')).toBe(true);
    });

    it('errors on duplicate stage order', () => {
      const pb = {
        ...minimalValid(),
        stages: [
          { id: 'a', order: 1, name: 'A', type: 'INVESTIGATION', runbooks: [] },
          { id: 'b', order: 1, name: 'B', type: 'RECOVERY',      runbooks: [] },
        ],
      };
      const { valid, diagnostics } = validatePlaybookStructure(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_DUPLICATE_STAGE_ORDER')).toBe(true);
    });

    it('errors on invalid stage type', () => {
      const pb = {
        ...minimalValid(),
        stages: [{ id: 'x', order: 1, name: 'X', type: 'INVALID_TYPE', runbooks: [] }],
      };
      const { valid, diagnostics } = validatePlaybookStructure(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_INVALID_STAGE_TYPE')).toBe(true);
    });

    it('errors on invalid failurePolicy', () => {
      const pb = {
        ...minimalValid(),
        stages: [{ id: 'x', order: 1, name: 'X', type: 'INVESTIGATION', failurePolicy: 'BOOM', runbooks: [] }],
      };
      const { valid, diagnostics } = validatePlaybookStructure(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_INVALID_FAILURE_POLICY')).toBe(true);
    });

    it('errors on runbook ref without runbookId', () => {
      const pb = {
        ...minimalValid(),
        stages: [{ id: 'x', order: 1, name: 'X', type: 'RECOVERY', runbooks: [{ parameterMappings: {} }] }],
      };
      const { valid, diagnostics } = validatePlaybookStructure(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_INVALID_RUNBOOK_REF')).toBe(true);
    });
  });

  describe('risk', () => {
    it('errors on invalid risk level', () => {
      const pb = { ...minimalValid(), risk: { level: 'EXTREME' } };
      const { valid, diagnostics } = validatePlaybookStructure(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_INVALID_RISK_LEVEL')).toBe(true);
    });

    it('accepts valid risk levels', () => {
      for (const level of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) {
        const { valid } = validatePlaybookStructure({ ...minimalValid(), risk: { level } });
        expect(valid).toBe(true);
      }
    });
  });

  describe('null/undefined input', () => {
    it('returns error for null input', () => {
      const { valid } = validatePlaybookStructure(null);
      expect(valid).toBe(false);
    });

    it('returns error for undefined input', () => {
      const { valid } = validatePlaybookStructure(undefined);
      expect(valid).toBe(false);
    });
  });
});
