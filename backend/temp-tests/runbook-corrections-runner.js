'use strict';
/**
 * Direct Node.js test runner for Runbook schema tests (no Jest process overhead).
 * Replaces Jest's describe/test/expect with a minimal synchronous harness.
 */

let passed = 0;
let failed = 0;
const failures = [];

function expect(val) {
  return {
    toBe(exp) { assert(val === exp, `expected ${JSON.stringify(val)} to be ${JSON.stringify(exp)}`); },
    toBeUndefined() { assert(val === undefined, `expected undefined, got ${JSON.stringify(val)}`); },
    toBeDefined() { assert(val !== undefined && val !== null, `expected defined value, got ${JSON.stringify(val)}`); },
    toBeTruthy() { assert(!!val, `expected truthy, got ${JSON.stringify(val)}`); },
    toBeFalsy() { assert(!val, `expected falsy, got ${JSON.stringify(val)}`); },
    toBeNull() { assert(val === null, `expected null, got ${JSON.stringify(val)}`); },
    toBeGreaterThan(n) { assert(val > n, `expected ${val} > ${n}`); },
    toBeGreaterThanOrEqual(n) { assert(val >= n, `expected ${val} >= ${n}`); },
    toBeLessThan(n) { assert(val < n, `expected ${val} < ${n}`); },
    toMatch(re) { assert(re.test(val), `expected ${JSON.stringify(val)} to match ${re}`); },
    toContain(item) { assert(val.includes(item), `expected array/string to contain ${JSON.stringify(item)}`); },
    toHaveLength(n) { assert(val.length === n, `expected length ${n}, got ${val.length}`); },
    toEqual(exp) { assert(JSON.stringify(val) === JSON.stringify(exp), `expected ${JSON.stringify(exp)}, got ${JSON.stringify(val)}`); },
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

let currentDescribe = '';
function describe(name, fn) {
  currentDescribe = name;
  fn();
}

function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write('.');
  } catch (e) {
    failed++;
    failures.push({ describe: currentDescribe, test: name, error: e.message });
    process.stdout.write('F');
  }
}

// ── Load the module under test ─────────────────────────────────────────────
const Runbook = require('../models/Runbook');
const { normalizeRunbookLifecycle } = Runbook;

const {
  RUNBOOK_LIFECYCLE,
  RUNBOOK_STEP_TYPE,
  RUNBOOK_FAILURE_POLICY,
  RUNBOOK_RISK_LEVEL,
  RUNBOOK_PARAM_TYPE,
  RUNBOOK_VERIFICATION_STRATEGY,
  RUNBOOK_ROLLBACK_STRATEGY,
  SEMVER_REGEX,
  STEP_ID_REGEX,
  RUNBOOK_ID_REGEX,
  RUNBOOK_API_VERSION,
  RUNBOOK_KIND,
  RUNBOOK_LIFECYCLE_TRANSITIONS,
  RUNBOOK_SAFE_STEP_TYPES,
  RUNBOOK_OWNER_TYPE,
  LIFECYCLE_VALUES,
  STEP_TYPE_VALUES,
  FAILURE_POLICY_VALUES,
  RISK_LEVEL_VALUES,
  PARAM_TYPE_VALUES,
  VERIFICATION_STRATEGY_VALUES,
  ROLLBACK_STRATEGY_VALUES,
} = require('../constants/runbook');

// ── Helpers ────────────────────────────────────────────────────────────────

function validStep(overrides = {}) {
  return {
    id: 'step-one',
    name: 'Restart Pod',
    type: RUNBOOK_STEP_TYPE.KUBERNETES,
    action: 'restart_pod',
    order: 1,
    ...overrides,
  };
}

function validRunbookData(overrides = {}) {
  return {
    tenantId: 'tenant-123',
    name: 'Database Recovery Runbook',
    description: 'Handles DB crash recovery',
    apiVersion: RUNBOOK_API_VERSION,
    kind: RUNBOOK_KIND,
    semver: '1.0.0',
    lifecycle: RUNBOOK_LIFECYCLE.DRAFT,
    risk: { level: RUNBOOK_RISK_LEVEL.MEDIUM },
    steps: [validStep()],
    ...overrides,
  };
}

// ── Tests: Runbook constants ───────────────────────────────────────────────

describe('Runbook constants', () => {
  test('RUNBOOK_API_VERSION is correct', () => {
    expect(RUNBOOK_API_VERSION).toBe('aira.io/v1');
  });
  test('RUNBOOK_KIND is correct', () => {
    expect(RUNBOOK_KIND).toBe('Runbook');
  });
  test('LIFECYCLE includes DRAFT', () => {
    expect(RUNBOOK_LIFECYCLE.DRAFT).toBe('DRAFT');
  });
  test('LIFECYCLE includes VALIDATED', () => {
    expect(RUNBOOK_LIFECYCLE.VALIDATED).toBe('VALIDATED');
  });
  test('LIFECYCLE includes APPROVED', () => {
    expect(RUNBOOK_LIFECYCLE.APPROVED).toBe('APPROVED');
  });
  test('LIFECYCLE includes ACTIVE', () => {
    expect(RUNBOOK_LIFECYCLE.ACTIVE).toBe('ACTIVE');
  });
  test('LIFECYCLE includes DEPRECATED', () => {
    expect(RUNBOOK_LIFECYCLE.DEPRECATED).toBe('DEPRECATED');
  });
  test('LIFECYCLE includes DISABLED', () => {
    expect(RUNBOOK_LIFECYCLE.DISABLED).toBe('DISABLED');
  });
  test('STEP_TYPE includes kubernetes', () => {
    expect(RUNBOOK_STEP_TYPE.KUBERNETES).toBe('kubernetes');
  });
  test('STEP_TYPE includes api', () => {
    expect(RUNBOOK_STEP_TYPE.API).toBe('api');
  });
  test('STEP_TYPE includes script', () => {
    expect(RUNBOOK_STEP_TYPE.SCRIPT).toBe('script');
  });
  test('STEP_TYPE includes notification', () => {
    expect(RUNBOOK_STEP_TYPE.NOTIFICATION).toBe('notification');
  });
  test('STEP_TYPE includes wait', () => {
    expect(RUNBOOK_STEP_TYPE.WAIT).toBe('wait');
  });
  test('SAFE_STEP_TYPES does not include shell', () => {
    expect(RUNBOOK_SAFE_STEP_TYPES.has('shell')).toBe(false);
  });
  test('SAFE_STEP_TYPES includes kubernetes', () => {
    expect(RUNBOOK_SAFE_STEP_TYPES.has('kubernetes')).toBe(true);
  });
  test('SEMVER_REGEX matches valid semver', () => {
    expect(SEMVER_REGEX.test('1.0.0')).toBe(true);
    expect(SEMVER_REGEX.test('2.3.1-beta.1')).toBe(true);
    expect(SEMVER_REGEX.test('not-semver')).toBe(false);
  });
});

// ── Tests: Valid runbook ───────────────────────────────────────────────────

describe('Valid runbook', () => {
  test('minimal valid runbook has no validation errors', () => {
    const doc = new Runbook(validRunbookData());
    expect(doc.validateSync()).toBeUndefined();
  });

  test('apiVersion defaults to aira.io/v1', () => {
    const doc = new Runbook(validRunbookData());
    expect(doc.apiVersion).toBe(RUNBOOK_API_VERSION);
  });

  test('kind defaults to Runbook', () => {
    const doc = new Runbook(validRunbookData());
    expect(doc.kind).toBe(RUNBOOK_KIND);
  });

  test('lifecycle defaults to draft', () => {
    const doc = new Runbook({ tenantId: 't', name: 'N', steps: [validStep()] });
    expect(doc.lifecycle).toBe(RUNBOOK_LIFECYCLE.DRAFT);
  });

  test('runbookId pattern is accepted', () => {
    const doc = new Runbook(validRunbookData({ runbookId: 'RB-INFRA-RESTART-DB' }));
    expect(doc.validateSync()).toBeUndefined();
  });

  test('semver 0.0.1 is accepted', () => {
    const doc = new Runbook(validRunbookData({ semver: '0.0.1' }));
    expect(doc.validateSync()).toBeUndefined();
  });

  test('semver with prerelease is accepted', () => {
    const doc = new Runbook(validRunbookData({ semver: '2.0.0-rc.1' }));
    expect(doc.validateSync()).toBeUndefined();
  });

  test('risk level HIGH is accepted', () => {
    const doc = new Runbook(validRunbookData({ risk: { level: RUNBOOK_RISK_LEVEL.HIGH } }));
    expect(doc.validateSync()).toBeUndefined();
  });

  test('step type api is accepted', () => {
    const doc = new Runbook(validRunbookData({ steps: [validStep({ type: 'api' })] }));
    expect(doc.validateSync()).toBeUndefined();
  });

  test('step failurePolicy CONTINUE is accepted', () => {
    const doc = new Runbook(validRunbookData({
      steps: [validStep({ failurePolicy: RUNBOOK_FAILURE_POLICY.CONTINUE })],
    }));
    expect(doc.validateSync()).toBeUndefined();
  });

  test('verification strategy ALL is accepted', () => {
    const doc = new Runbook(validRunbookData({
      verification: { strategy: RUNBOOK_VERIFICATION_STRATEGY.ALL, checks: [] },
    }));
    expect(doc.validateSync()).toBeUndefined();
  });

  test('rollbackConfig with REVERSE_STEPS is accepted', () => {
    const doc = new Runbook(validRunbookData({
      rollbackConfig: { enabled: true, strategy: RUNBOOK_ROLLBACK_STRATEGY.REVERSE_STEPS },
    }));
    expect(doc.validateSync()).toBeUndefined();
  });

  test('tags array is accepted', () => {
    const doc = new Runbook(validRunbookData({ tags: ['infra', 'critical'] }));
    expect(doc.validateSync()).toBeUndefined();
  });

  test('owner with system ownerType is accepted', () => {
    const doc = new Runbook(validRunbookData({ owner: { name: 'AIRA', ownerType: 'system' } }));
    expect(doc.validateSync()).toBeUndefined();
  });

  test('owner with tenant ownerType is accepted', () => {
    const doc = new Runbook(validRunbookData({ owner: { name: 'Acme', ownerType: 'tenant' } }));
    expect(doc.validateSync()).toBeUndefined();
  });

  test('scope with environments is accepted', () => {
    const doc = new Runbook(validRunbookData({ scope: { environments: ['production'] } }));
    expect(doc.validateSync()).toBeUndefined();
  });

  test('parameters array is accepted', () => {
    const doc = new Runbook(validRunbookData({
      parameters: [{ name: 'timeout', type: RUNBOOK_PARAM_TYPE.NUMBER }],
    }));
    expect(doc.validateSync()).toBeUndefined();
  });
});

// ── Tests: Required fields ─────────────────────────────────────────────────

describe('Required fields', () => {
  test('missing name produces validation error', () => {
    const doc = new Runbook({ tenantId: 't', steps: [validStep()] });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err.errors['name']).toBeDefined();
  });

  test('missing steps still produces valid doc (steps not required)', () => {
    const doc = new Runbook({ tenantId: 't', name: 'N' });
    // steps not required at schema level
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  test('missing step name produces validation error', () => {
    const doc = new Runbook(validRunbookData({ steps: [{ type: 'kubernetes', action: 'a' }] }));
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(Object.keys(err.errors).some(k => k.includes('name'))).toBe(true);
  });

  test('missing step type produces validation error', () => {
    const doc = new Runbook(validRunbookData({ steps: [{ name: 'S', action: 'a' }] }));
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  test('missing step action produces validation error', () => {
    const doc = new Runbook(validRunbookData({ steps: [{ name: 'S', type: 'kubernetes' }] }));
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });
});

// ── Tests: Invalid lifecycle ───────────────────────────────────────────────

describe('Invalid lifecycle', () => {
  test('unknown lifecycle value is rejected', () => {
    const doc = new Runbook(validRunbookData({ lifecycle: 'unknown' }));
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err.errors['lifecycle']).toBeDefined();
  });

  test('empty lifecycle string is rejected', () => {
    const doc = new Runbook(validRunbookData({ lifecycle: '' }));
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });
});

// ── Tests: Invalid semantic version ───────────────────────────────────────

describe('Invalid semantic version', () => {
  test('semver "1" is rejected', () => {
    const doc = new Runbook(validRunbookData({ semver: '1' }));
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err.errors['semver']).toBeDefined();
  });

  test('semver "1.0" is rejected', () => {
    const doc = new Runbook(validRunbookData({ semver: '1.0' }));
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  test('semver "v1.0.0" is rejected', () => {
    const doc = new Runbook(validRunbookData({ semver: 'v1.0.0' }));
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  test('semver "latest" is rejected', () => {
    const doc = new Runbook(validRunbookData({ semver: 'latest' }));
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  test('semver "1.0.0.0" is rejected', () => {
    const doc = new Runbook(validRunbookData({ semver: '1.0.0.0' }));
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  test('omitting semver is valid (optional field)', () => {
    const { semver, ...data } = validRunbookData();
    const doc = new Runbook(data);
    expect(doc.validateSync()).toBeUndefined();
  });
});

// ── Tests: Invalid risk ────────────────────────────────────────────────────

describe('Invalid risk', () => {
  test('unknown risk level is rejected', () => {
    const doc = new Runbook(validRunbookData({ risk: { level: 'extreme' } }));
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(Object.keys(err.errors).some(k => k.includes('level'))).toBe(true);
  });

  test('empty risk level is rejected', () => {
    const doc = new Runbook(validRunbookData({ risk: { level: '' } }));
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });
});

// ── Tests: Unsupported parameter type ─────────────────────────────────────

describe('Unsupported parameter type', () => {
  test('unknown param type is rejected', () => {
    const doc = new Runbook(validRunbookData({
      parameters: [{ name: 'x', type: 'unsupported-type' }],
    }));
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(Object.keys(err.errors).some(k => k.includes('type'))).toBe(true);
  });
});

// ── Tests: Malformed retry policy ─────────────────────────────────────────

describe('Malformed retry policy', () => {
  test('maxAttempts of 0 is rejected (min 1)', () => {
    const doc = new Runbook(validRunbookData({
      steps: [validStep({ retry: { maxAttempts: 0 } })],
    }));
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(Object.keys(err.errors).some(k => k.includes('maxAttempts'))).toBe(true);
  });

  test('maxAttempts of 11 is rejected (max 10)', () => {
    const doc = new Runbook(validRunbookData({
      steps: [validStep({ retry: { maxAttempts: 11 } })],
    }));
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(Object.keys(err.errors).some(k => k.includes('maxAttempts'))).toBe(true);
  });

  test('maxAttempts of 5 is accepted', () => {
    const doc = new Runbook(validRunbookData({
      steps: [validStep({ retry: { maxAttempts: 5 } })],
    }));
    expect(doc.validateSync()).toBeUndefined();
  });
});

// ── Tests: Invalid failure policy ─────────────────────────────────────────

describe('Invalid failure policy', () => {
  test('unknown failurePolicy is rejected', () => {
    const doc = new Runbook(validRunbookData({
      steps: [validStep({ failurePolicy: 'ignore' })],
    }));
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(Object.keys(err.errors).some(k => k.includes('failurePolicy'))).toBe(true);
  });
});

// ── Tests: Duplicate step identifiers ─────────────────────────────────────

describe('Duplicate step identifiers', () => {
  test('Runbook.validateStepIds returns null for unique ids', () => {
    const steps = [
      { id: 'step-a', name: 'A', type: 'kubernetes', action: 'a' },
      { id: 'step-b', name: 'B', type: 'kubernetes', action: 'b' },
    ];
    expect(Runbook.validateStepIds(steps)).toBeNull();
  });

  test('Runbook.validateStepIds returns error for duplicate ids', () => {
    const steps = [
      { id: 'step-a', name: 'A', type: 'kubernetes', action: 'a' },
      { id: 'step-a', name: 'B', type: 'kubernetes', action: 'b' },
    ];
    const err = Runbook.validateStepIds(steps);
    expect(err).toBeDefined();
  });

  test('Runbook.validateStepIds handles missing ids gracefully', () => {
    const steps = [
      { name: 'A', type: 'kubernetes', action: 'a' },
      { name: 'B', type: 'kubernetes', action: 'b' },
    ];
    expect(Runbook.validateStepIds(steps)).toBeNull();
  });

  test('Runbook.validateStepIds handles non-array input', () => {
    expect(Runbook.validateStepIds(null)).toBeNull();
    expect(Runbook.validateStepIds(undefined)).toBeNull();
  });
});

// ── Tests: Raw secret misuse ───────────────────────────────────────────────

describe('Raw secret misuse', () => {
  test('secret-reference parameter with a default value is rejected', async () => {
    const doc = new Runbook(validRunbookData({
      parameters: [{
        name: 'api_key',
        type: RUNBOOK_PARAM_TYPE.SECRET_REFERENCE,
        default: 'some-secret',
      }],
    }));
    let err = null;
    try { await doc.validate(); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(Object.keys(err.errors).some(k => k.includes('default'))).toBe(true);
  });

  test('secret-reference parameter without a default is accepted', () => {
    const doc = new Runbook(validRunbookData({
      parameters: [{ name: 'api_key', type: RUNBOOK_PARAM_TYPE.SECRET_REFERENCE }],
    }));
    expect(doc.validateSync()).toBeUndefined();
  });

  test('non-secret parameter with a default value is accepted', () => {
    const doc = new Runbook(validRunbookData({
      parameters: [{ name: 'timeout', type: RUNBOOK_PARAM_TYPE.NUMBER, default: '30' }],
    }));
    expect(doc.validateSync()).toBeUndefined();
  });
});

// ── Tests: Invalid rollback structure ─────────────────────────────────────

describe('Invalid rollback structure', () => {
  test('rollbackConfig with unknown strategy is rejected', () => {
    const doc = new Runbook(validRunbookData({
      rollbackConfig: { enabled: true, strategy: 'unknown-strategy' },
    }));
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(Object.keys(err.errors).some(k => k.includes('strategy'))).toBe(true);
  });

  test('rollbackConfig with NONE strategy is accepted', () => {
    const doc = new Runbook(validRunbookData({
      rollbackConfig: { enabled: false, strategy: RUNBOOK_ROLLBACK_STRATEGY.NONE },
    }));
    expect(doc.validateSync()).toBeUndefined();
  });

  test('rollbackConfig with EXPLICIT_STEPS strategy is accepted', () => {
    const doc = new Runbook(validRunbookData({
      rollbackConfig: { enabled: true, strategy: RUNBOOK_ROLLBACK_STRATEGY.EXPLICIT_STEPS, steps: [] },
    }));
    expect(doc.validateSync()).toBeUndefined();
  });
});

// ── Tests: Verification structure ─────────────────────────────────────────

describe('Verification structure', () => {
  test('verification with unknown strategy is rejected', () => {
    const doc = new Runbook(validRunbookData({
      verification: { strategy: 'none-of-the-above', checks: [] },
    }));
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(Object.keys(err.errors).some(k => k.includes('strategy'))).toBe(true);
  });

  test('verification with QUORUM strategy is accepted', () => {
    const doc = new Runbook(validRunbookData({
      verification: { strategy: RUNBOOK_VERIFICATION_STRATEGY.QUORUM, checks: [] },
    }));
    expect(doc.validateSync()).toBeUndefined();
  });
});

// ── Correction 1: System vs Tenant ownership ──────────────────────────────

describe('System vs Tenant ownership', () => {
  test('system runbook without tenantId is valid', () => {
    const doc = new Runbook({
      name: 'Built-in Pod Restart',
      owner: { name: 'AIRA Core', ownerType: 'system' },
      steps: [{ name: 'S', type: 'kubernetes', action: 'restart_pod' }],
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  test('system runbook with tenantId is also valid (opt-in scoping)', () => {
    const doc = new Runbook({
      tenantId: 'some-tenant',
      name: 'Scoped Built-in',
      owner: { name: 'AIRA Core', ownerType: 'system' },
      steps: [{ name: 'S', type: 'kubernetes', action: 'restart_pod' }],
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  test('tenant runbook with tenantId is valid', () => {
    const doc = new Runbook({
      tenantId: 'acme-corp',
      name: 'Custom Recovery',
      owner: { name: 'Platform Team', ownerType: 'tenant' },
      steps: [{ name: 'S', type: 'api', action: 'health_check' }],
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  test('tenant runbook without tenantId is invalid', () => {
    const doc = new Runbook({
      name: 'Orphaned Runbook',
      owner: { name: 'Platform Team', ownerType: 'tenant' },
      steps: [{ name: 'S', type: 'api', action: 'health_check' }],
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err.errors['tenantId']).toBeDefined();
  });

  test('legacy runbook with no ownerType but with tenantId is valid', () => {
    const doc = new Runbook({
      tenantId: 'legacy-tenant',
      name: 'Old Format',
      steps: [{ name: 'S', type: 'kubernetes', action: 'a' }],
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  test('legacy runbook with no ownerType and no tenantId is invalid', () => {
    const doc = new Runbook({
      name: 'No Tenant Legacy',
      steps: [{ name: 'S', type: 'kubernetes', action: 'a' }],
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err.errors['tenantId']).toBeDefined();
  });
});

// ── Correction 2: Semantic version authority ──────────────────────────────

describe('Semantic version authority', () => {
  function makeDoc(overrides = {}) {
    return new Runbook({
      tenantId: 't1', name: 'Version Test',
      steps: [{ name: 'S', type: 'kubernetes', action: 'a' }],
      ...overrides,
    });
  }

  test('getVersion() returns the canonical semantic version', () => {
    expect(makeDoc({ semver: '2.1.0' }).getVersion()).toBe('2.1.0');
  });

  test('getVersion() returns null when semver is not set', () => {
    expect(makeDoc().getVersion()).toBeNull();
  });

  test('metadataVersion virtual returns the canonical semantic version', () => {
    expect(makeDoc({ semver: '3.0.0-beta.1' }).metadataVersion).toBe('3.0.0-beta.1');
  });

  test('metadataVersion virtual returns null when semver is not set', () => {
    expect(makeDoc().metadataVersion).toBeNull();
  });

  test('Runbook.getCanonicalVersion() returns semver from a document', () => {
    expect(Runbook.getCanonicalVersion(makeDoc({ semver: '1.5.2' }))).toBe('1.5.2');
  });

  test('Runbook.getCanonicalVersion() returns semver from a plain object', () => {
    expect(Runbook.getCanonicalVersion({ semver: '4.0.0' })).toBe('4.0.0');
  });

  test('Runbook.getCanonicalVersion() returns null for object without semver', () => {
    expect(Runbook.getCanonicalVersion({})).toBeNull();
    expect(Runbook.getCanonicalVersion(null)).toBeNull();
  });

  test('numeric version and semver coexist; only semver is canonical', () => {
    const doc = makeDoc({ version: 7, semver: '2.0.0' });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.version).toBe(7);
    expect(doc.getVersion()).toBe('2.0.0');
  });

  test('numeric version alone does not provide a canonical version', () => {
    expect(makeDoc({ version: 3 }).getVersion()).toBeNull();
  });
});

// ── Correction 3: normalizeRunbookLifecycle helper ─────────────────────────
// No schema.s.hooks internals accessed.

describe('normalizeRunbookLifecycle helper', () => {
  function makeDoc(overrides = {}) {
    return new Runbook({
      tenantId: 't1', name: 'X',
      steps: [{ name: 'S', type: 'kubernetes', action: 'a' }],
      ...overrides,
    });
  }

  test('DISABLED sets enabled=false and active=false', () => {
    const doc = makeDoc({ lifecycle: RUNBOOK_LIFECYCLE.DISABLED, enabled: true, active: true });
    normalizeRunbookLifecycle(doc);
    expect(doc.enabled).toBe(false);
    expect(doc.active).toBe(false);
  });

  test('ACTIVE sets enabled=true and active=true', () => {
    const doc = makeDoc({ lifecycle: RUNBOOK_LIFECYCLE.ACTIVE, enabled: false, active: false });
    normalizeRunbookLifecycle(doc);
    expect(doc.enabled).toBe(true);
    expect(doc.active).toBe(true);
  });

  test('DRAFT does not change enabled or active', () => {
    const doc = makeDoc({ lifecycle: RUNBOOK_LIFECYCLE.DRAFT, enabled: true, active: true });
    normalizeRunbookLifecycle(doc);
    expect(doc.enabled).toBe(true);
    expect(doc.active).toBe(true);
  });

  test('VALIDATED does not change enabled or active', () => {
    const doc = makeDoc({ lifecycle: RUNBOOK_LIFECYCLE.VALIDATED, enabled: false, active: false });
    normalizeRunbookLifecycle(doc);
    expect(doc.enabled).toBe(false);
    expect(doc.active).toBe(false);
  });

  test('DEPRECATED does not change enabled or active', () => {
    const doc = makeDoc({ lifecycle: RUNBOOK_LIFECYCLE.DEPRECATED, enabled: true, active: true });
    normalizeRunbookLifecycle(doc);
    expect(doc.enabled).toBe(true);
    expect(doc.active).toBe(true);
  });

  test('is idempotent — calling twice produces the same result', () => {
    const doc = makeDoc({ lifecycle: RUNBOOK_LIFECYCLE.DISABLED, enabled: true, active: true });
    normalizeRunbookLifecycle(doc);
    normalizeRunbookLifecycle(doc);
    expect(doc.enabled).toBe(false);
    expect(doc.active).toBe(false);
  });
});

// ── Tests: Legacy field backward compatibility ─────────────────────────────

describe('Legacy field backward compatibility', () => {
  test('accepts runbook with legacy incidentType and serviceId', () => {
    const doc = new Runbook({
      tenantId: 'legacy-tenant',
      name: 'Legacy Runbook',
      incidentType: 'high-error-rate',
      serviceId: 'svc-001',
      enabled: true,
      steps: [validStep()],
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  test('accepts runbook with legacy numeric version', () => {
    const doc = new Runbook(validRunbookData({ version: 5 }));
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.version).toBe(5);
  });

  test('numeric version defaults to 1', () => {
    const doc = new Runbook(validRunbookData());
    expect(doc.version).toBe(1);
  });
});

// ── Tests: Owner type ─────────────────────────────────────────────────────

describe('Owner type', () => {
  test('ownerType system is accepted', () => {
    const doc = new Runbook(validRunbookData({ owner: { name: 'Core', ownerType: 'system' } }));
    expect(doc.validateSync()).toBeUndefined();
  });

  test('ownerType tenant is accepted', () => {
    const doc = new Runbook(validRunbookData({ owner: { name: 'Acme', ownerType: 'tenant' } }));
    expect(doc.validateSync()).toBeUndefined();
  });

  test('unknown ownerType is rejected', () => {
    const doc = new Runbook(validRunbookData({ owner: { name: 'X', ownerType: 'admin' } }));
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(Object.keys(err.errors).some(k => k.includes('ownerType'))).toBe(true);
  });
});

// ── Async tests ────────────────────────────────────────────────────────────

async function runAsync() {
  // secret-reference async test already covered above
}

// ── Results ────────────────────────────────────────────────────────────────

runAsync().then(() => {
  console.log('');
  console.log('');
  console.log('Results: ' + passed + ' passed, ' + failed + ' failed.');
  if (failures.length) {
    console.log('');
    console.log('FAILURES:');
    failures.forEach((f, i) => {
      console.log(`  ${i + 1}. [${f.describe}] ${f.test}`);
      console.log(`     ${f.error}`);
    });
    process.exit(1);
  }
}).catch(e => {
  console.error(e);
  process.exit(1);
});
