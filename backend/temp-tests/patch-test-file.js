'use strict';
const fs = require('fs');
const path = 'c:/Users/J SUHAS/OneDrive/Desktop/AIRA/backend/tests/unit/runbookSchema.test.js';
const src = fs.readFileSync(path, 'utf8');
const lines = src.split('\n');

// Lines 540-566 (1-based) → indices 539-565 (0-based)
// Replace with Correction 1 + 2 + 3 test blocks

const replacement = `// ── Correction 1: System vs Tenant ownership ─────────────────────────────

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

// ── Correction 2: Semantic version authority ───────────────────────────────

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
// No Mongoose hook internals (schema.s.hooks) accessed anywhere below.

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
});`.split('\n');

// splice: remove lines 539-565 (0-based), insert replacement
const before = lines.slice(0, 539);
const after = lines.slice(566);
const newLines = [...before, ...replacement, ...after];

fs.writeFileSync(path, newLines.join('\n'), 'utf8');
console.log('Done. Total lines:', newLines.length);
