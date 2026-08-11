'use strict';

/**
 * RunbookParameterResolver Tests — Phase D
 */

const {
  RunbookParameterResolver,
  PARAMETER_SOURCES,
  PARAM_TYPE,
} = require('../../runbooks/parameters/runbookParameterResolver');

let resolver;
beforeEach(() => { resolver = new RunbookParameterResolver(); });

// ── Basic resolution ───────────────────────────────────────────────────────

describe('resolve() — basic source precedence', () => {
  const defs = [
    { name: 'namespace', type: 'string', required: true },
    { name: 'pod',       type: 'string', required: true },
  ];

  test('resolves from explicitInputs (highest priority)', () => {
    const { resolved, errors } = resolver.resolve(defs, {
      explicitInputs: { namespace: 'production', pod: 'my-pod' },
    });
    expect(errors).toHaveLength(0);
    const ns = resolved.find(r => r.name === 'namespace');
    expect(ns.value).toBe('production');
    expect(ns.source).toBe(PARAMETER_SOURCES.EXPLICIT);
    expect(ns.confidence).toBe(1.0);
  });

  test('falls back to incidentEvidence', () => {
    const { resolved, errors } = resolver.resolve(defs, {
      incidentEvidence: { namespace: 'staging', pod: 'my-pod' },
    });
    expect(errors).toHaveLength(0);
    const ns = resolved.find(r => r.name === 'namespace');
    expect(ns.source).toBe(PARAMETER_SOURCES.INCIDENT);
  });

  test('falls back to defaults', () => {
    const defsWithDefault = [
      { name: 'namespace', type: 'string', required: false, default: 'default-ns' },
    ];
    const { resolved } = resolver.resolve(defsWithDefault, {});
    expect(resolved[0].value).toBe('default-ns');
    expect(resolved[0].source).toBe(PARAMETER_SOURCES.DEFAULT);
  });

  test('explicit overrides incident', () => {
    const { resolved } = resolver.resolve(defs, {
      explicitInputs:   { namespace: 'explicit-ns', pod: 'p' },
      incidentEvidence: { namespace: 'incident-ns', pod: 'p' },
    });
    const ns = resolved.find(r => r.name === 'namespace');
    expect(ns.source).toBe(PARAMETER_SOURCES.EXPLICIT);
    expect(ns.value).toBe('explicit-ns');
  });
});

// ── Required parameter missing ─────────────────────────────────────────────

describe('resolve() — missing required', () => {
  test('returns error for missing required parameter', () => {
    const { errors } = resolver.resolve(
      [{ name: 'pod', type: 'string', required: true }],
      {},
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/pod/);
    expect(errors[0]).toMatch(/could not be resolved/);
  });

  test('no error for missing optional parameter', () => {
    const { errors } = resolver.resolve(
      [{ name: 'label_selector', type: 'string', required: false }],
      {},
    );
    expect(errors).toHaveLength(0);
  });
});

// ── Type coercion ──────────────────────────────────────────────────────────

describe('resolve() — type coercion', () => {
  test('coerces number from string', () => {
    const { resolved } = resolver.resolve(
      [{ name: 'replicas', type: 'number', required: true, min: 0, max: 100 }],
      { explicitInputs: { replicas: '5' } },
    );
    expect(resolved[0].value).toBe(5);
  });

  test('coerces boolean from string "true"', () => {
    const { resolved } = resolver.resolve(
      [{ name: 'full_flush', type: 'boolean', required: true }],
      { explicitInputs: { full_flush: 'true' } },
    );
    expect(resolved[0].value).toBe(true);
  });

  test('validates enum values', () => {
    const { resolved } = resolver.resolve(
      [{ name: 'strategy', type: 'enum', allowedValues: ['fast', 'safe'], required: true }],
      { explicitInputs: { strategy: 'fast' } },
    );
    expect(resolved[0].value).toBe('fast');
  });

  test('enum rejects non-allowed value by trying next source', () => {
    // With only one source and invalid value, falls to unresolved
    const { resolved, errors } = resolver.resolve(
      [{ name: 'strategy', type: 'enum', allowedValues: ['fast', 'safe'], required: true }],
      { explicitInputs: { strategy: 'invalid' } },
    );
    // coercion fails → falls through to unresolved → required → error
    expect(errors).toHaveLength(1);
  });

  test('parses duration string "5m" to seconds', () => {
    const { resolved } = resolver.resolve(
      [{ name: 'timeout', type: 'duration', required: true }],
      { explicitInputs: { timeout: '5m' } },
    );
    expect(resolved[0].value).toBe(300);
  });

  test('number enforces min constraint', () => {
    const { resolved, errors } = resolver.resolve(
      [{ name: 'replicas', type: 'number', required: true, min: 1 }],
      { explicitInputs: { replicas: '0' } },
    );
    // 0 < min:1 → coercion fails → unresolved → required error
    expect(errors).toHaveLength(1);
  });
});

// ── Sensitive parameters ───────────────────────────────────────────────────

describe('resolve() — sensitive parameters', () => {
  test('secret-reference marked sensitive', () => {
    const { resolved } = resolver.resolve(
      [{ name: 'password', type: 'secret-reference', required: true }],
      { explicitInputs: { password: 'vault://secret/db-password' } },
    );
    expect(resolved[0].sensitive).toBe(true);
    expect(resolved[0].value).toBe('vault://secret/db-password');
  });

  test('non-secret not marked sensitive', () => {
    const { resolved } = resolver.resolve(
      [{ name: 'namespace', type: 'string', required: true }],
      { explicitInputs: { namespace: 'production' } },
    );
    expect(resolved[0].sensitive).toBe(false);
  });
});

// ── Resource references ────────────────────────────────────────────────────

describe('resolve() — resource-reference', () => {
  test('accepts valid resource name', () => {
    const { resolved } = resolver.resolve(
      [{ name: 'pod', type: 'resource-reference', required: true }],
      { explicitInputs: { pod: 'my-app-pod-1' } },
    );
    expect(resolved[0].value).toBe('my-app-pod-1');
  });

  test('rejects wildcard resource reference', () => {
    const { resolved, errors } = resolver.resolve(
      [{ name: 'pod', type: 'resource-reference', required: true }],
      { explicitInputs: { pod: 'my-app-*' } },
    );
    expect(errors).toHaveLength(1);
  });
});

// ── validateResolvedParameters ─────────────────────────────────────────────

describe('validateResolvedParameters()', () => {
  test('valid resolved params pass', () => {
    const defs     = [{ name: 'replicas', type: 'number', required: true, min: 0 }];
    const resolved = [{ name: 'replicas', value: 3, source: PARAMETER_SOURCES.EXPLICIT, confidence: 1, resolvedAt: '', sensitive: false }];
    const result   = resolver.validateResolvedParameters(defs, resolved);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('detects missing required resolved param', () => {
    const defs     = [{ name: 'pod', type: 'string', required: true }];
    const resolved = [];
    const result   = resolver.validateResolvedParameters(defs, resolved);
    expect(result.valid).toBe(false);
  });
});

// ── getMissingRequiredParameters ───────────────────────────────────────────

describe('getMissingRequiredParameters()', () => {
  test('returns names of unresolved required params', () => {
    const defs     = [
      { name: 'pod',       required: true },
      { name: 'namespace', required: true },
      { name: 'label',     required: false },
    ];
    const resolved = [
      { name: 'pod', value: 'my-pod', source: PARAMETER_SOURCES.EXPLICIT },
    ];
    const missing = resolver.getMissingRequiredParameters(defs, resolved);
    expect(missing).toContain('namespace');
    expect(missing).not.toContain('pod');
    expect(missing).not.toContain('label');
  });
});

// ── Empty defs ─────────────────────────────────────────────────────────────

describe('resolve() — edge cases', () => {
  test('handles null defs gracefully', () => {
    const { resolved, errors } = resolver.resolve(null, {});
    expect(resolved).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  test('handles empty defs array', () => {
    const { resolved, errors } = resolver.resolve([], {});
    expect(resolved).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  test('resolved entry always has resolvedAt timestamp', () => {
    const { resolved } = resolver.resolve(
      [{ name: 'ns', type: 'string', required: false, default: 'default' }],
      {},
    );
    expect(resolved[0].resolvedAt).toBeTruthy();
  });
});
