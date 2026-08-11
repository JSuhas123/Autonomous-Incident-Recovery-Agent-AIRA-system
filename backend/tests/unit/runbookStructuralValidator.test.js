'use strict';

/**
 * Unit tests: Runbook Structural Validator
 *
 * Jest-native test suite.
 * Run: npx jest tests/unit/runbookStructuralValidator.test.js --no-coverage
 */

const { validateRunbookStructure } = require('../../runbooks/validators/runbookStructuralValidator');
const { SEVERITY } = require('../../runbooks/validators/validationResult');
const {
  RUNBOOK_API_VERSION, RUNBOOK_KIND,
  RUNBOOK_LIFECYCLE, RUNBOOK_STEP_TYPE,
  RUNBOOK_FAILURE_POLICY, RUNBOOK_RISK_LEVEL,
  RUNBOOK_PARAM_TYPE, RUNBOOK_VERIFICATION_STRATEGY,
  RUNBOOK_ROLLBACK_STRATEGY,
} = require('../../constants/runbook');

// ── Fixture helpers ─────────────────────────────────────────────────────────

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

function canonicalRunbook(overrides = {}) {
  return {
    apiVersion: RUNBOOK_API_VERSION,
    kind: RUNBOOK_KIND,
    tenantId: 'tenant-acme',
    name: 'Database Recovery',
    semver: '1.0.0',
    lifecycle: RUNBOOK_LIFECYCLE.DRAFT,
    risk: { level: RUNBOOK_RISK_LEVEL.MEDIUM },
    steps: [validStep()],
    ...overrides,
  };
}

function hasError(result, code) {
  return result.diagnostics.some(d => d.code === code && d.severity === SEVERITY.ERROR);
}

function hasWarning(result, code) {
  return result.diagnostics.some(d => d.code === code && d.severity === SEVERITY.WARNING);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Programmer-error guard', () => {
  test('throws TypeError for null input', () => {
    expect(() => validateRunbookStructure(null)).toThrow(TypeError);
  });

  test('throws TypeError for string input', () => {
    expect(() => validateRunbookStructure('runbook')).toThrow(TypeError);
  });

  test('throws TypeError for array input', () => {
    expect(() => validateRunbookStructure([])).toThrow(TypeError);
  });

  test('does not throw for empty object (returns errors instead)', () => {
    const result = validateRunbookStructure({});
    expect(result.valid).toBe(false);
  });
});

describe('Canonical valid runbook', () => {
  test('canonical runbook is valid', () => {
    const result = validateRunbookStructure(canonicalRunbook());
    expect(result.valid).toBe(true);
    expect(result.diagnostics.filter(d => d.severity === SEVERITY.ERROR)).toHaveLength(0);
  });

  test('result has valid=true and empty error diagnostics', () => {
    const result = validateRunbookStructure(canonicalRunbook());
    expect(result.valid).toBe(true);
    expect(result.diagnostics.filter(d => d.severity === SEVERITY.ERROR).length).toBe(0);
  });
});

describe('System runbook without tenantId', () => {
  test('system runbook without tenantId is valid', () => {
    const result = validateRunbookStructure({
      apiVersion: RUNBOOK_API_VERSION,
      kind: RUNBOOK_KIND,
      name: 'Built-in Restart',
      owner: { name: 'AIRA Core', ownerType: 'system' },
      steps: [validStep()],
    });
    expect(result.valid).toBe(true);
  });

  test('system runbook with tenantId is also valid', () => {
    const result = validateRunbookStructure({
      apiVersion: RUNBOOK_API_VERSION,
      kind: RUNBOOK_KIND,
      tenantId: 'some-tenant',
      name: 'Scoped System Runbook',
      owner: { name: 'AIRA Core', ownerType: 'system' },
      steps: [validStep()],
    });
    expect(result.valid).toBe(true);
  });
});

describe('Tenant runbook tenantId rules', () => {
  test('tenant runbook with tenantId is valid', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      owner: { name: 'Acme', ownerType: 'tenant' },
    }));
    expect(result.valid).toBe(true);
  });

  test('tenant runbook without tenantId is invalid', () => {
    const { tenantId, ...rb } = canonicalRunbook({ owner: { name: 'Acme', ownerType: 'tenant' } });
    const result = validateRunbookStructure(rb);
    expect(result.valid).toBe(false);
    expect(hasError(result, 'RUNBOOK_REQUIRED_FIELD_MISSING')).toBe(true);
  });

  test('runbook with no ownerType and no tenantId is invalid (legacy behaviour)', () => {
    const { tenantId, ...rb } = canonicalRunbook();
    const result = validateRunbookStructure(rb);
    expect(result.valid).toBe(false);
    expect(hasError(result, 'RUNBOOK_REQUIRED_FIELD_MISSING')).toBe(true);
  });
});

describe('Envelope: apiVersion', () => {
  test('missing apiVersion produces RUNBOOK_REQUIRED_FIELD_MISSING', () => {
    const { apiVersion, ...rb } = canonicalRunbook();
    const result = validateRunbookStructure(rb);
    expect(result.valid).toBe(false);
    expect(hasError(result, 'RUNBOOK_REQUIRED_FIELD_MISSING')).toBe(true);
  });

  test('unsupported apiVersion produces RUNBOOK_INVALID_API_VERSION', () => {
    const result = validateRunbookStructure(canonicalRunbook({ apiVersion: 'v99' }));
    expect(result.valid).toBe(false);
    expect(hasError(result, 'RUNBOOK_INVALID_API_VERSION')).toBe(true);
  });

  test('correct apiVersion passes', () => {
    const result = validateRunbookStructure(canonicalRunbook());
    expect(hasError(result, 'RUNBOOK_INVALID_API_VERSION')).toBe(false);
  });
});

describe('Envelope: kind', () => {
  test('wrong kind produces RUNBOOK_INVALID_KIND', () => {
    const result = validateRunbookStructure(canonicalRunbook({ kind: 'Playbook' }));
    expect(result.valid).toBe(false);
    expect(hasError(result, 'RUNBOOK_INVALID_KIND')).toBe(true);
  });

  test('missing kind produces RUNBOOK_REQUIRED_FIELD_MISSING', () => {
    const { kind, ...rb } = canonicalRunbook();
    const result = validateRunbookStructure(rb);
    expect(result.valid).toBe(false);
    expect(hasError(result, 'RUNBOOK_REQUIRED_FIELD_MISSING')).toBe(true);
  });
});

describe('Identity: runbookId', () => {
  test('valid runbookId passes', () => {
    const result = validateRunbookStructure(canonicalRunbook({ runbookId: 'RB-INFRA-RESTART-DB' }));
    expect(result.valid).toBe(true);
  });

  test('invalid runbookId produces RUNBOOK_INVALID_ID', () => {
    const result = validateRunbookStructure(canonicalRunbook({ runbookId: 'bad-format' }));
    expect(result.valid).toBe(false);
    expect(hasError(result, 'RUNBOOK_INVALID_ID')).toBe(true);
  });

  test('lowercase runbookId is rejected', () => {
    const result = validateRunbookStructure(canonicalRunbook({ runbookId: 'rb-infra-restart' }));
    expect(result.valid).toBe(false);
    expect(hasError(result, 'RUNBOOK_INVALID_ID')).toBe(true);
  });
});

describe('Identity: semantic version', () => {
  test('valid semver passes', () => {
    const result = validateRunbookStructure(canonicalRunbook({ semver: '2.3.1-beta.1' }));
    expect(result.valid).toBe(true);
  });

  test('semver "v1.0.0" is rejected with RUNBOOK_INVALID_SEMVER', () => {
    const result = validateRunbookStructure(canonicalRunbook({ semver: 'v1.0.0' }));
    expect(hasError(result, 'RUNBOOK_INVALID_SEMVER')).toBe(true);
  });

  test('semver "latest" is rejected', () => {
    const result = validateRunbookStructure(canonicalRunbook({ semver: 'latest' }));
    expect(hasError(result, 'RUNBOOK_INVALID_SEMVER')).toBe(true);
  });

  test('semver "1.0" (missing patch) is rejected', () => {
    const result = validateRunbookStructure(canonicalRunbook({ semver: '1.0' }));
    expect(hasError(result, 'RUNBOOK_INVALID_SEMVER')).toBe(true);
  });

  test('omitting semver is valid (optional field)', () => {
    const { semver, ...rb } = canonicalRunbook();
    const result = validateRunbookStructure(rb);
    expect(result.valid).toBe(true);
  });
});

describe('Lifecycle', () => {
  test('valid lifecycle APPROVED passes', () => {
    const result = validateRunbookStructure(canonicalRunbook({ lifecycle: RUNBOOK_LIFECYCLE.APPROVED }));
    expect(result.valid).toBe(true);
  });

  test('unknown lifecycle produces RUNBOOK_INVALID_LIFECYCLE', () => {
    const result = validateRunbookStructure(canonicalRunbook({ lifecycle: 'running' }));
    expect(hasError(result, 'RUNBOOK_INVALID_LIFECYCLE')).toBe(true);
  });
});

describe('Ownership', () => {
  test('valid ownerType=system passes', () => {
    const result = validateRunbookStructure({
      apiVersion: RUNBOOK_API_VERSION,
      kind: RUNBOOK_KIND,
      name: 'X',
      owner: { name: 'Core', ownerType: 'system' },
      steps: [validStep()],
    });
    expect(result.valid).toBe(true);
  });

  test('invalid ownerType produces RUNBOOK_INVALID_OWNERSHIP', () => {
    const result = validateRunbookStructure(canonicalRunbook({ owner: { name: 'X', ownerType: 'admin' } }));
    expect(hasError(result, 'RUNBOOK_INVALID_OWNERSHIP')).toBe(true);
  });
});

describe('Parameters', () => {
  test('valid parameter passes', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      parameters: [{ name: 'timeout', type: RUNBOOK_PARAM_TYPE.NUMBER, required: true }],
    }));
    expect(result.valid).toBe(true);
  });

  test('duplicate parameter names produce RUNBOOK_DUPLICATE_PARAMETER', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      parameters: [
        { name: 'timeout', type: RUNBOOK_PARAM_TYPE.NUMBER },
        { name: 'timeout', type: RUNBOOK_PARAM_TYPE.NUMBER },
      ],
    }));
    expect(hasError(result, 'RUNBOOK_DUPLICATE_PARAMETER')).toBe(true);
  });

  test('enum type without allowedValues is rejected', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      parameters: [{ name: 'env', type: RUNBOOK_PARAM_TYPE.ENUM }],
    }));
    expect(result.valid).toBe(false);
  });

  test('enum type with allowedValues passes', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      parameters: [{ name: 'env', type: RUNBOOK_PARAM_TYPE.ENUM, allowedValues: ['prod', 'staging'] }],
    }));
    expect(result.valid).toBe(true);
  });

  test('min > max is rejected', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      parameters: [{ name: 'count', type: RUNBOOK_PARAM_TYPE.NUMBER, min: 10, max: 5 }],
    }));
    expect(result.valid).toBe(false);
  });

  test('raw secret default is rejected with RUNBOOK_SECRET_VALUE_FORBIDDEN', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      parameters: [{ name: 'apiKey', type: RUNBOOK_PARAM_TYPE.SECRET_REFERENCE, default: 'mysecret' }],
    }));
    expect(result.valid).toBe(false);
    expect(hasError(result, 'RUNBOOK_SECRET_VALUE_FORBIDDEN')).toBe(true);
  });

  test('secret-reference without default passes', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      parameters: [{ name: 'apiKey', type: RUNBOOK_PARAM_TYPE.SECRET_REFERENCE }],
    }));
    expect(result.valid).toBe(true);
  });
});

describe('Preconditions', () => {
  test('duplicate precondition IDs produce RUNBOOK_DUPLICATE_PRECONDITION', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      preconditions: [
        { id: 'pre-1', check: 'service_ready' },
        { id: 'pre-1', check: 'db_ready' },
      ],
    }));
    expect(hasError(result, 'RUNBOOK_DUPLICATE_PRECONDITION')).toBe(true);
  });

  test('unique precondition IDs pass', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      preconditions: [
        { id: 'pre-1', check: 'service_ready' },
        { id: 'pre-2', check: 'db_ready' },
      ],
    }));
    expect(result.valid).toBe(true);
  });
});

describe('Steps: basic', () => {
  test('valid step passes', () => {
    const result = validateRunbookStructure(canonicalRunbook());
    expect(result.valid).toBe(true);
  });

  test('step missing name is rejected', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      steps: [{ type: RUNBOOK_STEP_TYPE.KUBERNETES, action: 'restart_pod', id: 'step-x', order: 1 }],
    }));
    expect(result.valid).toBe(false);
    expect(hasError(result, 'RUNBOOK_REQUIRED_FIELD_MISSING')).toBe(true);
  });

  test('step missing action is rejected', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      steps: [{ name: 'S', type: RUNBOOK_STEP_TYPE.KUBERNETES, id: 'step-x', order: 1 }],
    }));
    expect(result.valid).toBe(false);
  });

  test('invalid step type is rejected', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      steps: [validStep({ type: 'unknown-type' })],
    }));
    expect(result.valid).toBe(false);
  });

  test('valid failurePolicy ROLLBACK passes', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      steps: [validStep({ failurePolicy: RUNBOOK_FAILURE_POLICY.ROLLBACK })],
    }));
    expect(result.valid).toBe(true);
  });

  test('invalid failurePolicy produces RUNBOOK_INVALID_FAILURE_POLICY', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      steps: [validStep({ failurePolicy: 'ignore' })],
    }));
    expect(hasError(result, 'RUNBOOK_INVALID_FAILURE_POLICY')).toBe(true);
  });
});

describe('Steps: IDs and ordering', () => {
  test('duplicate step IDs produce RUNBOOK_DUPLICATE_STEP', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      steps: [
        validStep({ id: 'step-one', order: 1 }),
        { id: 'step-one', name: 'Another', type: RUNBOOK_STEP_TYPE.API, action: 'check', order: 2 },
      ],
    }));
    expect(hasError(result, 'RUNBOOK_DUPLICATE_STEP')).toBe(true);
  });

  test('duplicate step orders produce RUNBOOK_INVALID_STEP_ORDER', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      steps: [
        validStep({ id: 'step-one', order: 1 }),
        { id: 'step-two', name: 'Second', type: RUNBOOK_STEP_TYPE.API, action: 'check', order: 1 },
      ],
    }));
    expect(hasError(result, 'RUNBOOK_INVALID_STEP_ORDER')).toBe(true);
  });

  test('non-positive step order is rejected', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      steps: [validStep({ order: 0 })],
    }));
    expect(hasError(result, 'RUNBOOK_INVALID_STEP_ORDER')).toBe(true);
  });

  test('unique step IDs and orders pass', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      steps: [
        validStep({ id: 'step-one', order: 1 }),
        { id: 'step-two', name: 'Second', type: RUNBOOK_STEP_TYPE.API, action: 'check', order: 2 },
      ],
    }));
    expect(result.valid).toBe(true);
  });
});

describe('Steps: timeout', () => {
  test('valid timeoutSeconds passes', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      steps: [validStep({ timeoutSeconds: 300 })],
    }));
    expect(result.valid).toBe(true);
  });

  test('step timeoutSeconds out of bounds produces RUNBOOK_INVALID_TIMEOUT', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      steps: [validStep({ timeoutSeconds: 99999 })],
    }));
    expect(hasError(result, 'RUNBOOK_INVALID_TIMEOUT')).toBe(true);
  });

  test('step timeoutSeconds=0 produces RUNBOOK_INVALID_TIMEOUT', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      steps: [validStep({ timeoutSeconds: 0 })],
    }));
    expect(hasError(result, 'RUNBOOK_INVALID_TIMEOUT')).toBe(true);
  });

  test('step timeout error does NOT produce RUNBOOK_INVALID_RETRY', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      steps: [validStep({ timeoutSeconds: 99999 })],
    }));
    expect(hasError(result, 'RUNBOOK_INVALID_RETRY')).toBe(false);
  });
});

describe('Steps: retry', () => {
  test('valid retry config passes', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      steps: [validStep({ retry: { maxAttempts: 3, delaySeconds: 5 } })],
    }));
    expect(result.valid).toBe(true);
  });

  test('retry maxAttempts 0 produces RUNBOOK_INVALID_RETRY', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      steps: [validStep({ retry: { maxAttempts: 0 } })],
    }));
    expect(hasError(result, 'RUNBOOK_INVALID_RETRY')).toBe(true);
  });

  test('retry maxAttempts 11 produces RUNBOOK_INVALID_RETRY', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      steps: [validStep({ retry: { maxAttempts: 11 } })],
    }));
    expect(hasError(result, 'RUNBOOK_INVALID_RETRY')).toBe(true);
  });

  test('retry backoffMultiplier < 1 produces RUNBOOK_INVALID_RETRY', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      steps: [validStep({ retry: { maxAttempts: 3, backoffMultiplier: 0.5 } })],
    }));
    expect(hasError(result, 'RUNBOOK_INVALID_RETRY')).toBe(true);
  });
});

describe('Verification', () => {
  test('valid ALL verification passes', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      verification: {
        strategy: RUNBOOK_VERIFICATION_STRATEGY.ALL,
        checks: [{ id: 'check-1', check: 'is_healthy' }],
      },
    }));
    expect(result.valid).toBe(true);
  });

  test('invalid strategy produces RUNBOOK_INVALID_VERIFICATION', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      verification: { strategy: 'MAJORITY', checks: [] },
    }));
    expect(hasError(result, 'RUNBOOK_INVALID_VERIFICATION')).toBe(true);
  });

  test('duplicate check IDs produce RUNBOOK_DUPLICATE_VERIFICATION_CHECK', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      verification: {
        strategy: RUNBOOK_VERIFICATION_STRATEGY.ALL,
        checks: [
          { id: 'chk', check: 'a' },
          { id: 'chk', check: 'b' },
        ],
      },
    }));
    expect(hasError(result, 'RUNBOOK_DUPLICATE_VERIFICATION_CHECK')).toBe(true);
  });

  test('QUORUM without minimumSuccessfulChecks is rejected', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      verification: {
        strategy: RUNBOOK_VERIFICATION_STRATEGY.QUORUM,
        checks: [{ id: 'c1' }, { id: 'c2' }],
      },
    }));
    expect(hasError(result, 'RUNBOOK_INVALID_VERIFICATION')).toBe(true);
  });

  test('QUORUM with valid minimumSuccessfulChecks passes', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      verification: {
        strategy: RUNBOOK_VERIFICATION_STRATEGY.QUORUM,
        minimumSuccessfulChecks: 1,
        checks: [{ id: 'c1' }, { id: 'c2' }],
      },
    }));
    expect(result.valid).toBe(true);
  });

  test('QUORUM minimumSuccessfulChecks > check count is rejected', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      verification: {
        strategy: RUNBOOK_VERIFICATION_STRATEGY.QUORUM,
        minimumSuccessfulChecks: 5,
        checks: [{ id: 'c1' }, { id: 'c2' }],
      },
    }));
    expect(hasError(result, 'RUNBOOK_INVALID_VERIFICATION')).toBe(true);
  });

  test('QUORUM minimumSuccessfulChecks = 0 is rejected', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      verification: {
        strategy: RUNBOOK_VERIFICATION_STRATEGY.QUORUM,
        minimumSuccessfulChecks: 0,
        checks: [{ id: 'c1' }],
      },
    }));
    expect(hasError(result, 'RUNBOOK_INVALID_VERIFICATION')).toBe(true);
  });

  test('ALL strategy with minimumSuccessfulChecks produces a WARNING (not an error)', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      verification: {
        strategy: RUNBOOK_VERIFICATION_STRATEGY.ALL,
        minimumSuccessfulChecks: 2,
        checks: [{ id: 'c1' }, { id: 'c2' }],
      },
    }));
    expect(hasWarning(result, 'RUNBOOK_INVALID_VERIFICATION')).toBe(true);
    expect(result.valid).toBe(true);
  });
});

describe('Rollback', () => {
  test('valid rollbackConfig passes', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      rollbackConfig: {
        enabled: true,
        strategy: RUNBOOK_ROLLBACK_STRATEGY.EXPLICIT_STEPS,
        steps: [{ id: 'rb-1', order: 1, action: 'undo_restart' }],
      },
    }));
    expect(result.valid).toBe(true);
  });

  test('invalid rollback strategy produces RUNBOOK_INVALID_ROLLBACK', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      rollbackConfig: { strategy: 'UNDO_ALL' },
    }));
    expect(hasError(result, 'RUNBOOK_INVALID_ROLLBACK')).toBe(true);
  });

  test('duplicate rollback step IDs produce RUNBOOK_DUPLICATE_ROLLBACK_STEP', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      rollbackConfig: {
        enabled: true,
        strategy: RUNBOOK_ROLLBACK_STRATEGY.EXPLICIT_STEPS,
        steps: [
          { id: 'rb-x', order: 1, action: 'undo' },
          { id: 'rb-x', order: 2, action: 'undo2' },
        ],
      },
    }));
    expect(hasError(result, 'RUNBOOK_DUPLICATE_ROLLBACK_STEP')).toBe(true);
  });

  test('duplicate rollback step orders produce RUNBOOK_DUPLICATE_ROLLBACK_STEP', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      rollbackConfig: {
        enabled: true,
        strategy: RUNBOOK_ROLLBACK_STRATEGY.EXPLICIT_STEPS,
        steps: [
          { id: 'rb-1', order: 1, action: 'undo1' },
          { id: 'rb-2', order: 1, action: 'undo2' },
        ],
      },
    }));
    expect(hasError(result, 'RUNBOOK_DUPLICATE_ROLLBACK_STEP')).toBe(true);
  });

  test('rollback step without action is rejected', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      rollbackConfig: {
        enabled: true,
        strategy: RUNBOOK_ROLLBACK_STRATEGY.EXPLICIT_STEPS,
        steps: [{ id: 'rb-1', order: 1 }],
      },
    }));
    expect(hasError(result, 'RUNBOOK_INVALID_ROLLBACK')).toBe(true);
  });

  test('malformed rollbackConfig (not an object) produces RUNBOOK_INVALID_ROLLBACK', () => {
    const result = validateRunbookStructure(canonicalRunbook({ rollbackConfig: 'yes' }));
    expect(hasError(result, 'RUNBOOK_INVALID_ROLLBACK')).toBe(true);
  });
});

describe('Legacy field warnings', () => {
  test('deprecated incidentType produces RUNBOOK_DEPRECATED_FIELD warning', () => {
    const result = validateRunbookStructure(canonicalRunbook({ incidentType: 'high-error-rate' }));
    expect(hasWarning(result, 'RUNBOOK_DEPRECATED_FIELD')).toBe(true);
    expect(result.valid).toBe(true);
  });

  test('deprecated retryPolicy on step produces RUNBOOK_DEPRECATED_FIELD warning', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      steps: [validStep({ retryPolicy: { maxRetries: 3 } })],
    }));
    expect(hasWarning(result, 'RUNBOOK_DEPRECATED_FIELD')).toBe(true);
    expect(result.valid).toBe(true);
  });

  test('numeric version + semver together produces RUNBOOK_DEPRECATED_FIELD warning', () => {
    const result = validateRunbookStructure(canonicalRunbook({ version: 3, semver: '1.0.0' }));
    expect(hasWarning(result, 'RUNBOOK_DEPRECATED_FIELD')).toBe(true);
    expect(result.valid).toBe(true);
  });

  test('enabled=false with lifecycle=ACTIVE produces a conflict WARNING', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      lifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
      enabled: false,
    }));
    expect(hasWarning(result, 'RUNBOOK_DEPRECATED_FIELD')).toBe(true);
    expect(result.valid).toBe(true);
  });

  test('enabled=true with lifecycle=DISABLED produces a conflict WARNING', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      lifecycle: RUNBOOK_LIFECYCLE.DISABLED,
      enabled: true,
    }));
    expect(hasWarning(result, 'RUNBOOK_DEPRECATED_FIELD')).toBe(true);
  });
});

describe('Result contract', () => {
  test('result has valid and diagnostics properties', () => {
    const result = validateRunbookStructure(canonicalRunbook());
    expect('valid' in result).toBe(true);
    expect('diagnostics' in result).toBe(true);
  });

  test('each diagnostic has code, path, message, severity', () => {
    const result = validateRunbookStructure(canonicalRunbook({ apiVersion: 'bad' }));
    const d = result.diagnostics[0];
    expect(typeof d.code).toBe('string');
    expect(typeof d.path).toBe('string');
    expect(typeof d.message).toBe('string');
    expect(['ERROR', 'WARNING'].includes(d.severity)).toBe(true);
  });

  test('valid=false when any ERROR diagnostic present', () => {
    const result = validateRunbookStructure(canonicalRunbook({ apiVersion: 'bad' }));
    expect(result.valid).toBe(false);
  });

  test('valid=true with only WARNING diagnostics', () => {
    const result = validateRunbookStructure(canonicalRunbook({ incidentType: 'x' }));
    expect(result.valid).toBe(true);
  });

  test('result object is frozen', () => {
    const result = validateRunbookStructure(canonicalRunbook());
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
  });
});

describe('Scope validation', () => {
  test('valid scope passes', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      scope: { environments: ['production'], services: ['api-gateway'] },
    }));
    expect(result.valid).toBe(true);
  });

  test('scope with non-array environments is rejected', () => {
    const result = validateRunbookStructure(canonicalRunbook({ scope: { environments: 'production' } }));
    expect(result.valid).toBe(false);
  });
});

describe('Risk validation', () => {
  test('valid HIGH risk passes', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      risk: { level: RUNBOOK_RISK_LEVEL.HIGH, reversible: true, blastRadius: 'single-pod' },
    }));
    expect(result.valid).toBe(true);
  });

  test('invalid risk level produces RUNBOOK_INVALID_RISK', () => {
    const result = validateRunbookStructure(canonicalRunbook({ risk: { level: 'EXTREME' } }));
    expect(result.valid).toBe(false);
    expect(hasError(result, 'RUNBOOK_INVALID_RISK')).toBe(true);
  });
});

describe('Audit config', () => {
  test('valid auditConfig passes', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      auditConfig: { recordInputs: true, recordOutputs: true, redactSensitiveValues: true },
    }));
    expect(result.valid).toBe(true);
  });

  test('non-boolean auditConfig field is rejected', () => {
    const result = validateRunbookStructure(canonicalRunbook({
      auditConfig: { recordInputs: 'yes' },
    }));
    expect(result.valid).toBe(false);
  });
});
