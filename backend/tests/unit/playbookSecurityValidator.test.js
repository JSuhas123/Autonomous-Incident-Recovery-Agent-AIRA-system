'use strict';

const { validatePlaybookSecurity } = require('../../playbooks/validators/playbookSecurityValidator');

function minimalValid(overrides = {}) {
  return {
    apiVersion: 'aira.io/v1',
    kind:       'Playbook',
    playbookId: 'PB-K8S-TEST-001',
    semver:     '1.0.0',
    name:       'Test Playbook',
    lifecycle:  'DRAFT',
    owner:      { ownerType: 'system' },
    stages: [{
      id: 's1', order: 1, name: 'Investigation', type: 'INVESTIGATION',
      runbooks: [{ runbookId: 'RB-K8S-001', parameterMappings: { pod: '${incident.resource.pod}' } }],
    }],
    ...overrides,
  };
}

describe('PlaybookSecurityValidator', () => {

  it('passes a valid playbook with safe mappings', () => {
    const { valid } = validatePlaybookSecurity(minimalValid());
    expect(valid).toBe(true);
  });

  describe('unsafe mappings', () => {
    const unsafeExprs = [
      ['eval()', 'eval(process.env.SECRET)'],
      ['Function()', '${Function("return process.env.SECRET")()}'],
      ['require()', '${require("child_process").exec("rm -rf /")}'],
      ['process access', '${process.env.SECRET_KEY}'],
      ['semicolon', '${incident.pod; process.env.X}'],
      ['backtick', '${`${incident.pod}`}'],
      ['prototype access', '${__proto__.polluted}'],
    ];

    for (const [name, expr] of unsafeExprs) {
      it(`blocks ${name} in parameterMappings`, () => {
        const pb = minimalValid({
          stages: [{
            id: 's1', order: 1, name: 'S', type: 'RECOVERY',
            runbooks: [{ runbookId: 'RB-K8S-001', parameterMappings: { pod: expr } }],
          }],
        });
        const { valid, diagnostics } = validatePlaybookSecurity(pb);
        expect(valid).toBe(false);
        expect(diagnostics.some(d => d.code === 'PLAYBOOK_UNSAFE_MAPPING' || d.code === 'PLAYBOOK_UNKNOWN_MAPPING_ROOT')).toBe(true);
      });
    }

    it('blocks unknown mapping root', () => {
      const pb = minimalValid({
        stages: [{
          id: 's1', order: 1, name: 'S', type: 'RECOVERY',
          runbooks: [{ runbookId: 'RB-K8S-001', parameterMappings: { x: '${global.process.env.SECRET}' } }],
        }],
      });
      const { valid, diagnostics } = validatePlaybookSecurity(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_UNKNOWN_MAPPING_ROOT')).toBe(true);
    });

    it('allows all known mapping roots', () => {
      const validMappings = {
        p1: '${incident.resource.pod}',
        p2: '${signal.labels.namespace}',
        p3: '${context.cluster}',
        p4: '${evidence.logs}',
        p5: '${service.name}',
        p6: '${constants.default_timeout}',
        p7: '${stage_output.result}',
      };
      const pb = minimalValid({
        stages: [{
          id: 's1', order: 1, name: 'S', type: 'RECOVERY',
          runbooks: [{ runbookId: 'RB-K8S-001', parameterMappings: validMappings }],
        }],
      });
      const { valid } = validatePlaybookSecurity(pb);
      expect(valid).toBe(true);
    });
  });

  describe('raw secret detection', () => {
    it('blocks AWS access key in description', () => {
      const pb = { ...minimalValid(), description: 'use key AKIAIOSFODNN7EXAMPLE for this' };
      const { valid, diagnostics } = validatePlaybookSecurity(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_RAW_SECRET')).toBe(true);
    });

    it('does not flag short strings as secrets', () => {
      const pb = { ...minimalValid(), description: 'short' };
      const { valid } = validatePlaybookSecurity(pb);
      expect(valid).toBe(true);
    });
  });

  describe('risk vs blast radius', () => {
    it('errors on LOW risk with global blast radius', () => {
      const pb = { ...minimalValid(), risk: { level: 'LOW', blastRadius: 'global' } };
      const { valid, diagnostics } = validatePlaybookSecurity(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_BLAST_RADIUS_UNDERSTATED')).toBe(true);
    });

    it('warns on LOW risk with cluster blast radius', () => {
      const pb = { ...minimalValid(), risk: { level: 'LOW', blastRadius: 'cluster' } };
      const { diagnostics } = validatePlaybookSecurity(pb);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_BLAST_RADIUS_UNDERSTATED' && d.severity === 'WARNING')).toBe(true);
    });

    it('accepts HIGH risk with pod blast radius', () => {
      const pb = {
        ...minimalValid(),
        risk: { level: 'HIGH', blastRadius: 'pod' },
        policy:   { required: true },
        approval: { mode: 'MANUAL' },
      };
      const { valid } = validatePlaybookSecurity(pb);
      expect(valid).toBe(true);
    });
  });

  describe('policy/approval requirements', () => {
    it('errors for HIGH risk without policy.required', () => {
      const pb = {
        ...minimalValid(),
        risk:     { level: 'HIGH', blastRadius: 'cluster' },
        policy:   { required: false },
        approval: { mode: 'MANUAL' },
      };
      const { valid, diagnostics } = validatePlaybookSecurity(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_MISSING_POLICY')).toBe(true);
    });

    it('errors for CRITICAL risk with DISABLED approval', () => {
      const pb = {
        ...minimalValid(),
        risk:     { level: 'CRITICAL', blastRadius: 'database' },
        policy:   { required: true },
        approval: { mode: 'DISABLED' },
      };
      const { valid, diagnostics } = validatePlaybookSecurity(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_MISSING_APPROVAL')).toBe(true);
    });

    it('passes CRITICAL risk with policy+approval configured', () => {
      const pb = {
        ...minimalValid(),
        risk:     { level: 'CRITICAL', blastRadius: 'database' },
        policy:   { required: true },
        approval: { mode: 'MANUAL' },
      };
      const { valid } = validatePlaybookSecurity(pb);
      expect(valid).toBe(true);
    });
  });

  describe('cross-tenant checks', () => {
    it('errors when playbook tenantId does not match request tenantId', () => {
      const pb = { ...minimalValid(), tenantId: 'tenant-a' };
      const { valid, diagnostics } = validatePlaybookSecurity(pb, {
        tenantContext: { tenantId: 'tenant-b' },
      });
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_CROSS_TENANT_REF')).toBe(true);
    });

    it('passes when tenantIds match', () => {
      const pb = { ...minimalValid(), tenantId: 'tenant-a' };
      const { valid } = validatePlaybookSecurity(pb, {
        tenantContext: { tenantId: 'tenant-a' },
      });
      expect(valid).toBe(true);
    });
  });

  describe('direct execution prohibition', () => {
    it('blocks "action" field in nested stage object', () => {
      const pb = {
        ...minimalValid(),
        stages: [{
          id: 's1', order: 1, name: 'S', type: 'RECOVERY',
          action: 'kubectl delete pod my-pod',
          runbooks: [],
        }],
      };
      const { valid, diagnostics } = validatePlaybookSecurity(pb);
      expect(valid).toBe(false);
      expect(diagnostics.some(d => d.code === 'PLAYBOOK_DIRECT_EXECUTION')).toBe(true);
    });
  });
});
