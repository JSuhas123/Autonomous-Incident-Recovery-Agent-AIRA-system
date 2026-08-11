'use strict';

/**
 * Runbook Versioning Tests — Phase C
 */

const {
  parseSemver,
  compareVersions,
  isNewerVersion,
  getLatestVersion,
  validateNewVersion,
  canonicalSerialize,
  computeChecksum,
  versionRef,
} = require('../../runbooks/versioning/runbookVersioning');

// ── parseSemver ────────────────────────────────────────────────────────────

describe('parseSemver()', () => {
  test.each([
    ['1.0.0',        { major: 1, minor: 0, patch: 0, preRelease: null, buildMeta: null }],
    ['2.3.4',        { major: 2, minor: 3, patch: 4, preRelease: null, buildMeta: null }],
    ['1.0.0-alpha',  { major: 1, minor: 0, patch: 0, preRelease: 'alpha', buildMeta: null }],
    ['1.0.0+build',  { major: 1, minor: 0, patch: 0, preRelease: null, buildMeta: 'build' }],
  ])('parses %s correctly', (input, expected) => {
    expect(parseSemver(input)).toEqual(expected);
  });

  test.each(['bad', '1.2', 'v1.0.0', '', null, 123])('throws for invalid: %s', (bad) => {
    expect(() => parseSemver(bad)).toThrow();
  });
});

// ── compareVersions ────────────────────────────────────────────────────────

describe('compareVersions()', () => {
  test.each([
    ['1.0.0', '1.0.0',  0],
    ['1.0.1', '1.0.0',  1],
    ['1.0.0', '1.0.1', -1],
    ['2.0.0', '1.9.9',  1],
    ['1.9.9', '2.0.0', -1],
    ['1.1.0', '1.0.9',  1],
    // pre-release < release
    ['1.0.0-alpha', '1.0.0', -1],
    ['1.0.0', '1.0.0-alpha', 1],
  ])('compareVersions(%s, %s) === %d', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });
});

// ── isNewerVersion ─────────────────────────────────────────────────────────

describe('isNewerVersion()', () => {
  test('1.0.1 > 1.0.0', () => expect(isNewerVersion('1.0.1', '1.0.0')).toBe(true));
  test('1.0.0 NOT > 1.0.0', () => expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false));
  test('0.9.0 NOT > 1.0.0', () => expect(isNewerVersion('0.9.0', '1.0.0')).toBe(false));
});

// ── getLatestVersion ───────────────────────────────────────────────────────

describe('getLatestVersion()', () => {
  test('returns highest version from array', () => {
    expect(getLatestVersion(['1.0.0', '2.0.0', '1.5.0'])).toBe('2.0.0');
  });

  test('works with single version', () => {
    expect(getLatestVersion(['3.1.4'])).toBe('3.1.4');
  });

  test('throws on empty array', () => {
    expect(() => getLatestVersion([])).toThrow();
  });
});

// ── validateNewVersion ─────────────────────────────────────────────────────

describe('validateNewVersion()', () => {
  test('valid when no existing versions', () => {
    expect(validateNewVersion('1.0.0', [])).toEqual({ valid: true });
  });

  test('valid when strictly higher than all existing', () => {
    expect(validateNewVersion('2.0.0', ['1.0.0', '1.5.0'])).toEqual({ valid: true });
  });

  test('invalid when equal to existing', () => {
    const result = validateNewVersion('1.0.0', ['1.0.0']);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/strictly greater/);
  });

  test('invalid when lower than existing', () => {
    const result = validateNewVersion('0.9.0', ['1.0.0']);
    expect(result.valid).toBe(false);
  });

  test('invalid for malformed semver', () => {
    const result = validateNewVersion('bad', []);
    expect(result.valid).toBe(false);
  });
});

// ── canonicalSerialize ─────────────────────────────────────────────────────

describe('canonicalSerialize()', () => {
  const rb = {
    apiVersion:  'runbook/v1',
    kind:        'Runbook',
    runbookId:   'RB-TEST',
    semver:      '1.0.0',
    name:        'Test',
    description: 'A test runbook',
    lifecycle:   'DRAFT',
    steps:       { 'step-01': { type: 'wait', action: 'poll_condition' } },
    _id:         'should-not-appear',
    createdAt:   new Date().toISOString(),
  };

  test('produces deterministic string for same input', () => {
    const s1 = canonicalSerialize(rb);
    const s2 = canonicalSerialize(rb);
    expect(s1).toBe(s2);
  });

  test('excludes _id and createdAt from output', () => {
    const s = canonicalSerialize(rb);
    expect(s).not.toContain('should-not-appear');
    // createdAt is not in CANONICAL_FIELDS
  });

  test('includes runbookId and semver', () => {
    const s = canonicalSerialize(rb);
    expect(s).toContain('RB-TEST');
    expect(s).toContain('1.0.0');
  });

  test('same object with different key order produces same output', () => {
    const rb2 = { lifecycle: rb.lifecycle, semver: rb.semver, runbookId: rb.runbookId, apiVersion: rb.apiVersion, kind: rb.kind, name: rb.name, description: rb.description, steps: rb.steps };
    expect(canonicalSerialize(rb)).toBe(canonicalSerialize(rb2));
  });
});

// ── computeChecksum ────────────────────────────────────────────────────────

describe('computeChecksum()', () => {
  const rb = {
    apiVersion: 'runbook/v1',
    kind:       'Runbook',
    runbookId:  'RB-TEST',
    semver:     '1.0.0',
    name:       'Test',
    steps:      {},
  };

  test('returns a 64-char hex string (SHA-256)', () => {
    const cs = computeChecksum(rb);
    expect(cs).toMatch(/^[a-f0-9]{64}$/);
  });

  test('same runbook produces same checksum', () => {
    expect(computeChecksum(rb)).toBe(computeChecksum({ ...rb }));
  });

  test('different runbook produces different checksum', () => {
    expect(computeChecksum(rb)).not.toBe(computeChecksum({ ...rb, name: 'Changed' }));
  });
});

// ── versionRef ────────────────────────────────────────────────────────────

describe('versionRef()', () => {
  test('formats correctly', () => {
    expect(versionRef('RB-K8S-POD-RESTART', '1.0.0')).toBe('RB-K8S-POD-RESTART@1.0.0');
  });
});
