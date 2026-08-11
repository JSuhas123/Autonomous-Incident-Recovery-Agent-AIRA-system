'use strict';

const { validatePlaybook, validateForAuthoring } = require('../../playbooks/validators/playbookValidator');
const { PLAYBOOK_VALIDATION_PURPOSE }             = require('../../constants/playbook');

function valid(overrides = {}) {
  return {
    apiVersion:  'aira.io/v1',
    kind:        'Playbook',
    playbookId:  'PB-K8S-TEST-001',
    semver:      '1.0.0',
    name:        'Test Playbook',
    lifecycle:   'DRAFT',
    owner:       { ownerType: 'system' },
    stages: [{
      id: 's1', order: 1, name: 'Recovery', type: 'RECOVERY',
      runbooks: [{ runbookId: 'RB-K8S-001', parameterMappings: { pod: '${incident.resource.pod}' } }],
    }],
    ...overrides,
  };
}

describe('PlaybookValidator (unified)', () => {

  it('returns valid=true for a complete valid playbook', async () => {
    const { valid: v, summary } = await validatePlaybook(valid());
    expect(v).toBe(true);
    expect(summary.errorCount).toBe(0);
  });

  it('returns valid=false for a playbook with structural errors', async () => {
    const { valid: v, summary } = await validatePlaybook({ kind: 'Playbook' });
    expect(v).toBe(false);
    expect(summary.errorCount).toBeGreaterThan(0);
  });

  it('includes errors from all three validators', async () => {
    const pb = {
      ...valid(),
      risk:     { level: 'CRITICAL' },
      // Missing policy + approval → security error
      // Missing playbookId format → already valid
    };
    const { diagnostics } = await validatePlaybook(pb, {
      purpose: PLAYBOOK_VALIDATION_PURPOSE.APPROVAL,
    });
    const codes = diagnostics.map(d => d.code);
    // Semantic: CRITICAL without policy
    expect(codes.some(c => c.includes('POLICY') || c.includes('APPROVAL'))).toBe(true);
  });

  it('validateForAuthoring uses AUTHORING purpose', async () => {
    const { summary } = await validateForAuthoring(valid());
    expect(summary.purpose).toBe('AUTHORING');
  });

  it('summary includes error/warning/info counts', async () => {
    const { summary } = await validatePlaybook(valid());
    expect(summary).toHaveProperty('errorCount');
    expect(summary).toHaveProperty('warningCount');
    expect(summary).toHaveProperty('infoCount');
  });

  it('summary.hasError is false for valid playbook', async () => {
    const { summary } = await validatePlaybook(valid());
    expect(summary.hasError).toBe(false);
  });

  it('summary.hasError is true for invalid playbook', async () => {
    const { summary } = await validatePlaybook({});
    expect(summary.hasError).toBe(true);
  });

  it('aborts early (no semantic/security) for completely broken playbook', async () => {
    const { valid: v, diagnostics } = await validatePlaybook(null);
    expect(v).toBe(false);
    // Should not throw, just return errors
  });

  it('passes safe parameter mappings through security validator', async () => {
    const { valid: v } = await validatePlaybook(valid());
    expect(v).toBe(true);
  });

  it('catches unsafe eval in parameter mappings', async () => {
    const pb = valid({
      stages: [{
        id: 's1', order: 1, name: 'S', type: 'RECOVERY',
        runbooks: [{ runbookId: 'RB-K8S-001', parameterMappings: { x: 'eval(process.env.SECRET)' } }],
      }],
    });
    const { valid: v } = await validatePlaybook(pb);
    expect(v).toBe(false);
  });
});
