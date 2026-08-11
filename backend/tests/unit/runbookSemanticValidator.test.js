'use strict';

/**
 * Unit tests: Runbook Semantic Validator
 *
 * Run: npx jest tests/unit/runbookSemanticValidator.test.js --no-coverage
 */

const { validateRunbookSemantics } = require('../../runbooks/validators/runbookSemanticValidator');
const { SEVERITY } = require('../../runbooks/validators/validationResult');
const {
  RUNBOOK_API_VERSION, RUNBOOK_KIND,
  RUNBOOK_LIFECYCLE, RUNBOOK_STEP_TYPE,
  RUNBOOK_PARAM_TYPE, RUNBOOK_RISK_LEVEL,
  RUNBOOK_ROLLBACK_STRATEGY, RUNBOOK_VERIFICATION_STRATEGY,
  RUNBOOK_OWNER_TYPE,
} = require('../../constants/runbook');

// ── In-memory fake registries ────────────────────────────────────────────────

/**
 * Build an actionRegistry stub. The registry map is:
 *   `${type}/${action}` → metadata
 *
 * metadata shape: { idempotent, retryable, builtinRollback, type }
 */
function makeActionRegistry(entries = {}) {
  return {
    resolve(type, action) {
      return entries[`${type}/${action}`] || null;
    },
  };
}

function makePreconditionRegistry(entries = {}) {
  return {
    // entries: { [check]: { params: string[] } }
    resolve(check) { return entries[check] || null; },
  };
}

function makeVerificationRegistry(entries = {}) {
  return {
    resolve(check) { return entries[check] || null; },
  };
}

function makeServiceResolver(known = new Set(), tenantPrivate = new Set()) {
  return {
    resolve(svcId) { return known.has(svcId); },
    isTenantPrivate(svcId) { return tenantPrivate.has(svcId); },
  };
}

// Well-known registered actions used throughout tests
const SAFE_REGISTRY = makeActionRegistry({
  'kubernetes/restart_pod':  { idempotent: true,  retryable: true,  builtinRollback: false },
  'api/call_endpoint':       { idempotent: true,  retryable: true,  builtinRollback: false },
  'notification/send_alert': { idempotent: true,  retryable: true,  builtinRollback: false },
  'wait/sleep':              { idempotent: true,  retryable: true,  builtinRollback: false },
  'kubernetes/drain_node':   { idempotent: false, retryable: false, builtinRollback: false },
  'kubernetes/delete_pod':   { idempotent: false, retryable: true,  builtinRollback: false },
});

// ── Fixture helpers ──────────────────────────────────────────────────────────

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

function validVerification() {
  return {
    strategy: RUNBOOK_VERIFICATION_STRATEGY.ALL,
    checks: [{ id: 'chk-1', check: 'service_healthy' }],
  };
}

function draftRunbook(overrides = {}) {
  return {
    apiVersion: RUNBOOK_API_VERSION,
    kind: RUNBOOK_KIND,
    tenantId: 'tenant-acme',
    name: 'Database Recovery',
    lifecycle: RUNBOOK_LIFECYCLE.DRAFT,
    risk: { level: RUNBOOK_RISK_LEVEL.MEDIUM },
    steps: [validStep()],
    ...overrides,
  };
}

function activeReadyRunbook(overrides = {}) {
  return {
    apiVersion: RUNBOOK_API_VERSION,
    kind: RUNBOOK_KIND,
    tenantId: 'tenant-acme',
    name: 'Database Recovery',
    lifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
    risk: { level: RUNBOOK_RISK_LEVEL.MEDIUM },
    steps: [validStep()],
    verification: validVerification(),
    ...overrides,
  };
}

function hasCode(result, code) {
  return result.diagnostics.some(d => d.code === code);
}

function hasError(result, code) {
  return result.diagnostics.some(d => d.code === code && d.severity === SEVERITY.ERROR);
}

function hasWarning(result, code) {
  return result.diagnostics.some(d => d.code === code && d.severity === SEVERITY.WARNING);
}

// ── Programmer-error guard ───────────────────────────────────────────────────

describe('Programmer-error guard', () => {
  test('throws TypeError for null', () => {
    expect(() => validateRunbookSemantics(null)).toThrow(TypeError);
  });

  test('throws TypeError for array', () => {
    expect(() => validateRunbookSemantics([])).toThrow(TypeError);
  });

  test('throws TypeError for string', () => {
    expect(() => validateRunbookSemantics('x')).toThrow(TypeError);
  });

  test('does not throw for plain object', () => {
    expect(() => validateRunbookSemantics({})).not.toThrow();
  });
});

// ── Valid DRAFT runbook ──────────────────────────────────────────────────────

describe('Valid DRAFT runbook', () => {
  test('minimal DRAFT runbook is valid with no context', () => {
    const result = validateRunbookSemantics(draftRunbook());
    expect(result.valid).toBe(true);
  });

  test('DRAFT runbook with actionRegistry passes when action is registered', () => {
    const result = validateRunbookSemantics(draftRunbook(), { actionRegistry: SAFE_REGISTRY });
    expect(result.valid).toBe(true);
  });

  test('result has valid and diagnostics', () => {
    const result = validateRunbookSemantics(draftRunbook());
    expect('valid' in result).toBe(true);
    expect(Array.isArray(result.diagnostics)).toBe(true);
  });

  test('result is frozen', () => {
    const result = validateRunbookSemantics(draftRunbook());
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
  });
});

// ── Valid ACTIVE-ready runbook ───────────────────────────────────────────────

describe('Valid ACTIVE-ready runbook', () => {
  test('active-ready runbook passes with full registry context', () => {
    const result = validateRunbookSemantics(activeReadyRunbook(), {
      actionRegistry: SAFE_REGISTRY,
      verificationRegistry: makeVerificationRegistry({
        service_healthy: { params: [] },
      }),
      targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
    });
    expect(result.valid).toBe(true);
  });
});

// ── Action semantics ─────────────────────────────────────────────────────────

describe('Action semantics: unsafe step types', () => {
  test('DRAFT with shell step type produces WARNING (not error)', () => {
    const result = validateRunbookSemantics(draftRunbook({
      steps: [validStep({ type: RUNBOOK_STEP_TYPE.SHELL_LEGACY, action: 'run' })],
    }));
    expect(result.valid).toBe(true);
    expect(hasWarning(result, 'RUNBOOK_UNSAFE_ACTION_TYPE')).toBe(true);
  });

  test('ACTIVE with shell step type produces ERROR', () => {
    const result = validateRunbookSemantics(activeReadyRunbook({
      steps: [validStep({ type: RUNBOOK_STEP_TYPE.SHELL_LEGACY, action: 'run' })],
    }), { targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    expect(result.valid).toBe(false);
    expect(hasError(result, 'RUNBOOK_UNSAFE_ACTION_TYPE')).toBe(true);
  });

  test('DRAFT with script step type produces WARNING', () => {
    const result = validateRunbookSemantics(draftRunbook({
      steps: [validStep({ type: RUNBOOK_STEP_TYPE.SCRIPT, action: 'run_script' })],
    }));
    expect(hasWarning(result, 'RUNBOOK_UNSAFE_ACTION_TYPE')).toBe(true);
    expect(result.valid).toBe(true);
  });

  test('APPROVED with script step type produces ERROR', () => {
    const result = validateRunbookSemantics(activeReadyRunbook({
      steps: [validStep({ type: RUNBOOK_STEP_TYPE.SCRIPT, action: 'run_script' })],
    }), { targetLifecycle: RUNBOOK_LIFECYCLE.APPROVED });
    expect(hasError(result, 'RUNBOOK_UNSAFE_ACTION_TYPE')).toBe(true);
  });
});

describe('Action semantics: registry resolution', () => {
  test('DRAFT with unresolved action produces WARNING (not error)', () => {
    const result = validateRunbookSemantics(draftRunbook({
      steps: [validStep({ action: 'unknown_action' })],
    }), { actionRegistry: SAFE_REGISTRY });
    expect(result.valid).toBe(true);
    expect(hasWarning(result, 'RUNBOOK_UNKNOWN_ACTION')).toBe(true);
  });

  test('ACTIVE with unresolved action produces ERROR', () => {
    const result = validateRunbookSemantics(activeReadyRunbook({
      steps: [validStep({ action: 'unknown_action' })],
    }), {
      actionRegistry: SAFE_REGISTRY,
      targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
    });
    expect(result.valid).toBe(false);
    expect(hasError(result, 'RUNBOOK_UNKNOWN_ACTION')).toBe(true);
  });

  test('registered action passes cleanly', () => {
    const result = validateRunbookSemantics(draftRunbook(), { actionRegistry: SAFE_REGISTRY });
    expect(hasCode(result, 'RUNBOOK_UNKNOWN_ACTION')).toBe(false);
  });

  test('action registered under different type produces RUNBOOK_ACTION_TYPE_MISMATCH', () => {
    const registry = makeActionRegistry({
      'api/restart_pod': { type: 'api', idempotent: true, retryable: true },
    });
    // Augment registry with resolveByAction so the cross-type check can work
    registry.resolveByAction = (action) => {
      if (action === 'restart_pod') return { type: 'api' };
      return null;
    };
    const result = validateRunbookSemantics(draftRunbook({
      steps: [validStep({ type: 'kubernetes', action: 'restart_pod' })],
    }), { actionRegistry: registry });
    expect(hasError(result, 'RUNBOOK_ACTION_TYPE_MISMATCH')).toBe(true);
  });

  test('no actionRegistry for ACTIVE target emits warning about skipped check', () => {
    const result = validateRunbookSemantics(activeReadyRunbook(), {
      targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
    });
    expect(hasWarning(result, 'RUNBOOK_UNKNOWN_ACTION')).toBe(true);
  });
});

// ── Precondition semantics ───────────────────────────────────────────────────

describe('Precondition semantics', () => {
  test('unknown precondition in DRAFT produces WARNING', () => {
    const result = validateRunbookSemantics(draftRunbook({
      preconditions: [{ id: 'pre-1', check: 'service_ready' }],
    }), { preconditionRegistry: makePreconditionRegistry({}) });
    expect(hasWarning(result, 'RUNBOOK_UNKNOWN_PRECONDITION')).toBe(true);
    expect(result.valid).toBe(true);
  });

  test('unknown precondition in ACTIVE produces ERROR', () => {
    const result = validateRunbookSemantics(activeReadyRunbook({
      preconditions: [{ id: 'pre-1', check: 'service_ready' }],
    }), {
      preconditionRegistry: makePreconditionRegistry({}),
      targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
    });
    expect(hasError(result, 'RUNBOOK_UNKNOWN_PRECONDITION')).toBe(true);
  });

  test('known precondition with all required params passes', () => {
    const result = validateRunbookSemantics(draftRunbook({
      preconditions: [{ id: 'pre-1', check: 'service_ready', params: { serviceName: 'api' } }],
    }), {
      preconditionRegistry: makePreconditionRegistry({ service_ready: { params: ['serviceName'] } }),
    });
    expect(hasCode(result, 'RUNBOOK_UNKNOWN_PRECONDITION')).toBe(false);
    expect(hasCode(result, 'RUNBOOK_PRECONDITION_PARAMETER_MISSING')).toBe(false);
  });

  test('known precondition missing required param produces ERROR', () => {
    const result = validateRunbookSemantics(draftRunbook({
      preconditions: [{ id: 'pre-1', check: 'service_ready', params: {} }],
    }), {
      preconditionRegistry: makePreconditionRegistry({ service_ready: { params: ['serviceName'] } }),
    });
    expect(hasError(result, 'RUNBOOK_PRECONDITION_PARAMETER_MISSING')).toBe(true);
  });
});

// ── Parameter reference semantics ────────────────────────────────────────────

describe('Parameter reference semantics', () => {
  test('valid parameter reference in step params passes', () => {
    const result = validateRunbookSemantics(draftRunbook({
      parameters: [{ name: 'podName', type: RUNBOOK_PARAM_TYPE.STRING }],
      steps: [validStep({ params: { target: '${podName}' } })],
    }));
    expect(hasCode(result, 'RUNBOOK_UNKNOWN_PARAMETER_REFERENCE')).toBe(false);
  });

  test('undefined parameter reference produces RUNBOOK_UNKNOWN_PARAMETER_REFERENCE', () => {
    const result = validateRunbookSemantics(draftRunbook({
      parameters: [],
      steps: [validStep({ params: { target: '${podName}' } })],
    }));
    expect(hasError(result, 'RUNBOOK_UNKNOWN_PARAMETER_REFERENCE')).toBe(true);
  });

  test('no references in step params is valid', () => {
    const result = validateRunbookSemantics(draftRunbook({
      parameters: [],
      steps: [validStep({ params: { target: 'literal-value' } })],
    }));
    expect(hasCode(result, 'RUNBOOK_UNKNOWN_PARAMETER_REFERENCE')).toBe(false);
  });

  test('secret-reference parameter in notification params produces RUNBOOK_SECRET_REFERENCE_EXPOSURE', () => {
    const result = validateRunbookSemantics(draftRunbook({
      parameters: [{ name: 'apiKey', type: RUNBOOK_PARAM_TYPE.SECRET_REFERENCE }],
      steps: [validStep({
        type: RUNBOOK_STEP_TYPE.NOTIFICATION,
        action: 'send_alert',
        params: { message: 'Key is ${apiKey}' },
      })],
    }));
    expect(hasError(result, 'RUNBOOK_SECRET_REFERENCE_EXPOSURE')).toBe(true);
  });

  test('secret-reference in non-notification step does not produce exposure error', () => {
    const result = validateRunbookSemantics(draftRunbook({
      parameters: [{ name: 'apiKey', type: RUNBOOK_PARAM_TYPE.SECRET_REFERENCE }],
      steps: [validStep({ params: { key: '${apiKey}' } })],
    }));
    expect(hasCode(result, 'RUNBOOK_SECRET_REFERENCE_EXPOSURE')).toBe(false);
    expect(hasCode(result, 'RUNBOOK_UNKNOWN_PARAMETER_REFERENCE')).toBe(false);
  });

  test('invalid reference syntax (not matching pattern) is not extracted', () => {
    // $podName without braces — not a reference, just a string
    const result = validateRunbookSemantics(draftRunbook({
      parameters: [],
      steps: [validStep({ params: { target: '$podName' } })],
    }));
    expect(hasCode(result, 'RUNBOOK_UNKNOWN_PARAMETER_REFERENCE')).toBe(false);
  });
});

// ── Parameter semantic consistency ───────────────────────────────────────────

describe('Parameter semantic consistency', () => {
  test('enum default in allowedValues is valid', () => {
    const result = validateRunbookSemantics(draftRunbook({
      parameters: [{ name: 'env', type: RUNBOOK_PARAM_TYPE.ENUM, allowedValues: ['prod', 'staging'], default: 'prod' }],
    }));
    expect(hasCode(result, 'RUNBOOK_INVALID_PARAMETER_DEFAULT')).toBe(false);
  });

  test('enum default outside allowedValues produces RUNBOOK_INVALID_PARAMETER_DEFAULT', () => {
    const result = validateRunbookSemantics(draftRunbook({
      parameters: [{ name: 'env', type: RUNBOOK_PARAM_TYPE.ENUM, allowedValues: ['prod', 'staging'], default: 'dev' }],
    }));
    expect(hasError(result, 'RUNBOOK_INVALID_PARAMETER_DEFAULT')).toBe(true);
  });

  test('number default within range is valid', () => {
    const result = validateRunbookSemantics(draftRunbook({
      parameters: [{ name: 'count', type: RUNBOOK_PARAM_TYPE.NUMBER, min: 1, max: 10, default: 5 }],
    }));
    expect(hasCode(result, 'RUNBOOK_INVALID_PARAMETER_DEFAULT')).toBe(false);
  });

  test('number default below min produces RUNBOOK_INVALID_PARAMETER_DEFAULT', () => {
    const result = validateRunbookSemantics(draftRunbook({
      parameters: [{ name: 'count', type: RUNBOOK_PARAM_TYPE.NUMBER, min: 5, default: 2 }],
    }));
    expect(hasError(result, 'RUNBOOK_INVALID_PARAMETER_DEFAULT')).toBe(true);
  });

  test('number default above max produces RUNBOOK_INVALID_PARAMETER_DEFAULT', () => {
    const result = validateRunbookSemantics(draftRunbook({
      parameters: [{ name: 'count', type: RUNBOOK_PARAM_TYPE.NUMBER, max: 10, default: 20 }],
    }));
    expect(hasError(result, 'RUNBOOK_INVALID_PARAMETER_DEFAULT')).toBe(true);
  });

  test('invalid min/max relationship produces RUNBOOK_INVALID_PARAMETER_RANGE', () => {
    const result = validateRunbookSemantics(draftRunbook({
      parameters: [{ name: 'count', type: RUNBOOK_PARAM_TYPE.NUMBER, min: 10, max: 5 }],
    }));
    expect(hasError(result, 'RUNBOOK_INVALID_PARAMETER_RANGE')).toBe(true);
  });

  test('unknown sourceHint produces RUNBOOK_UNKNOWN_PARAMETER_SOURCE warning', () => {
    const result = validateRunbookSemantics(draftRunbook({
      parameters: [{ name: 'x', type: RUNBOOK_PARAM_TYPE.STRING, sourceHints: ['magic-db'] }],
    }));
    expect(hasWarning(result, 'RUNBOOK_UNKNOWN_PARAMETER_SOURCE')).toBe(true);
    expect(result.valid).toBe(true);
  });

  test('known sourceHint does not produce warning', () => {
    const result = validateRunbookSemantics(draftRunbook({
      parameters: [{ name: 'x', type: RUNBOOK_PARAM_TYPE.STRING, sourceHints: ['user-input'] }],
    }));
    expect(hasCode(result, 'RUNBOOK_UNKNOWN_PARAMETER_SOURCE')).toBe(false);
  });
});

// ── Step semantics ───────────────────────────────────────────────────────────

describe('Step semantics: reversibility', () => {
  test('reversible step with explicit rollback passes in ACTIVE', () => {
    const result = validateRunbookSemantics(activeReadyRunbook({
      steps: [validStep({ reversible: true, rollback: { action: 'undo_restart' } })],
    }), {
      actionRegistry: SAFE_REGISTRY,
      targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
    });
    expect(hasCode(result, 'RUNBOOK_ROLLBACK_MISSING')).toBe(false);
  });

  test('reversible step without rollback in ACTIVE produces RUNBOOK_ROLLBACK_MISSING', () => {
    const result = validateRunbookSemantics(activeReadyRunbook({
      steps: [validStep({ reversible: true })],
    }), {
      actionRegistry: SAFE_REGISTRY,
      targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
    });
    expect(hasError(result, 'RUNBOOK_ROLLBACK_MISSING')).toBe(true);
  });

  test('non-reversible step with rollback defined produces RUNBOOK_REVERSIBILITY_INCONSISTENT', () => {
    const result = validateRunbookSemantics(draftRunbook({
      steps: [validStep({ reversible: false, rollback: { action: 'undo' } })],
    }));
    expect(hasError(result, 'RUNBOOK_REVERSIBILITY_INCONSISTENT')).toBe(true);
  });

  test('reversible step with builtinRollback handler passes ACTIVE with no explicit rollback', () => {
    const registry = makeActionRegistry({
      'kubernetes/restart_pod': { idempotent: true, retryable: true, builtinRollback: true },
    });
    const result = validateRunbookSemantics(activeReadyRunbook({
      steps: [validStep({ reversible: true })],
    }), { actionRegistry: registry, targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    expect(hasCode(result, 'RUNBOOK_ROLLBACK_MISSING')).toBe(false);
  });
});

describe('Step semantics: WAIT step', () => {
  test('WAIT step timeout greater than duration passes', () => {
    const result = validateRunbookSemantics(draftRunbook({
      steps: [{ id: 's', name: 'Wait', type: RUNBOOK_STEP_TYPE.WAIT, action: 'sleep', order: 1, waitSeconds: 30, timeoutSeconds: 60 }],
    }));
    expect(hasCode(result, 'RUNBOOK_STEP_CONFIGURATION_INVALID')).toBe(false);
  });

  test('WAIT step timeout <= duration produces RUNBOOK_STEP_CONFIGURATION_INVALID', () => {
    const result = validateRunbookSemantics(draftRunbook({
      steps: [{ id: 's', name: 'Wait', type: RUNBOOK_STEP_TYPE.WAIT, action: 'sleep', order: 1, waitSeconds: 60, timeoutSeconds: 30 }],
    }));
    expect(hasError(result, 'RUNBOOK_STEP_CONFIGURATION_INVALID')).toBe(true);
  });
});

// ── Retry semantics ──────────────────────────────────────────────────────────

describe('Retry semantics', () => {
  test('retry on idempotent action passes', () => {
    const result = validateRunbookSemantics(draftRunbook({
      steps: [validStep({ retry: { maxAttempts: 3, delaySeconds: 5 } })],
    }), { actionRegistry: SAFE_REGISTRY });
    expect(hasCode(result, 'RUNBOOK_RETRY_NOT_ALLOWED')).toBe(false);
    expect(hasCode(result, 'RUNBOOK_NON_IDEMPOTENT_RETRY')).toBe(false);
  });

  test('retry on non-retryable action produces RUNBOOK_RETRY_NOT_ALLOWED', () => {
    const result = validateRunbookSemantics(draftRunbook({
      steps: [validStep({ type: 'kubernetes', action: 'drain_node', retry: { maxAttempts: 2 } })],
    }), { actionRegistry: SAFE_REGISTRY });
    expect(hasError(result, 'RUNBOOK_RETRY_NOT_ALLOWED')).toBe(true);
  });

  test('retry on non-idempotent action produces RUNBOOK_NON_IDEMPOTENT_RETRY', () => {
    // delete_pod: retryable=true but idempotent=false
    const result = validateRunbookSemantics(draftRunbook({
      steps: [validStep({ type: 'kubernetes', action: 'delete_pod', retry: { maxAttempts: 2 } })],
    }), { actionRegistry: SAFE_REGISTRY });
    expect(hasError(result, 'RUNBOOK_NON_IDEMPOTENT_RETRY')).toBe(true);
  });

  test('retry-safe handler (retryable + idempotent) passes cleanly', () => {
    const result = validateRunbookSemantics(draftRunbook({
      steps: [validStep({ retry: { maxAttempts: 5, delaySeconds: 2 } })],
    }), { actionRegistry: SAFE_REGISTRY });
    expect(result.valid).toBe(true);
    expect(hasCode(result, 'RUNBOOK_RETRY_NOT_ALLOWED')).toBe(false);
    expect(hasCode(result, 'RUNBOOK_NON_IDEMPOTENT_RETRY')).toBe(false);
  });

  test('retry schedule exceeding timeout produces RUNBOOK_RETRY_EXCEEDS_TIMEOUT', () => {
    // maxAttempts=3, delaySeconds=30, backoffMultiplier=1 → 30+30 = 60s delays, timeout=50s
    const result = validateRunbookSemantics(draftRunbook({
      steps: [validStep({ timeoutSeconds: 50, retry: { maxAttempts: 3, delaySeconds: 30 } })],
    }));
    expect(hasError(result, 'RUNBOOK_RETRY_EXCEEDS_TIMEOUT')).toBe(true);
  });

  test('retry schedule within timeout passes', () => {
    // maxAttempts=3, delaySeconds=5, no backoff → 5+5 = 10s delays, timeout=120s
    const result = validateRunbookSemantics(draftRunbook({
      steps: [validStep({ timeoutSeconds: 120, retry: { maxAttempts: 3, delaySeconds: 5 } })],
    }));
    expect(hasCode(result, 'RUNBOOK_RETRY_EXCEEDS_TIMEOUT')).toBe(false);
  });
});

// ── Rollback semantics ───────────────────────────────────────────────────────

describe('Rollback semantics', () => {
  test('EXPLICIT_STEPS with steps defined passes', () => {
    const result = validateRunbookSemantics(activeReadyRunbook({
      rollbackConfig: {
        enabled: true,
        strategy: RUNBOOK_ROLLBACK_STRATEGY.EXPLICIT_STEPS,
        steps: [{ id: 'rb-1', order: 1, action: 'undo_restart' }],
      },
    }), { actionRegistry: SAFE_REGISTRY, targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    expect(hasCode(result, 'RUNBOOK_ROLLBACK_CONFIGURATION_INVALID')).toBe(false);
  });

  test('EXPLICIT_STEPS with no steps produces RUNBOOK_ROLLBACK_CONFIGURATION_INVALID', () => {
    const result = validateRunbookSemantics(draftRunbook({
      rollbackConfig: {
        enabled: true,
        strategy: RUNBOOK_ROLLBACK_STRATEGY.EXPLICIT_STEPS,
        steps: [],
      },
    }));
    expect(hasError(result, 'RUNBOOK_ROLLBACK_CONFIGURATION_INVALID')).toBe(true);
  });

  test('NONE strategy with steps defined produces RUNBOOK_ROLLBACK_CONFIGURATION_INVALID', () => {
    const result = validateRunbookSemantics(draftRunbook({
      rollbackConfig: {
        strategy: RUNBOOK_ROLLBACK_STRATEGY.NONE,
        steps: [{ id: 'rb-1', order: 1, action: 'undo' }],
      },
    }));
    expect(hasError(result, 'RUNBOOK_ROLLBACK_CONFIGURATION_INVALID')).toBe(true);
  });

  test('unknown rollback action in ACTIVE produces RUNBOOK_UNKNOWN_ROLLBACK_ACTION', () => {
    const result = validateRunbookSemantics(activeReadyRunbook({
      rollbackConfig: {
        enabled: true,
        strategy: RUNBOOK_ROLLBACK_STRATEGY.EXPLICIT_STEPS,
        steps: [{ id: 'rb-1', order: 1, type: 'kubernetes', action: 'unknown_undo', params: {} }],
      },
    }), {
      actionRegistry: SAFE_REGISTRY,
      targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
    });
    expect(hasError(result, 'RUNBOOK_UNKNOWN_ROLLBACK_ACTION')).toBe(true);
  });

  test('HIGH risk ACTIVE runbook with NONE rollback produces RUNBOOK_HIGH_RISK_NONREVERSIBLE', () => {
    const result = validateRunbookSemantics(activeReadyRunbook({
      risk: { level: RUNBOOK_RISK_LEVEL.HIGH },
      rollbackConfig: { enabled: false, strategy: RUNBOOK_ROLLBACK_STRATEGY.NONE },
    }), { targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    expect(hasError(result, 'RUNBOOK_HIGH_RISK_NONREVERSIBLE')).toBe(true);
  });

  test('CRITICAL risk ACTIVE runbook with NONE rollback produces RUNBOOK_HIGH_RISK_NONREVERSIBLE', () => {
    const result = validateRunbookSemantics(activeReadyRunbook({
      risk: { level: RUNBOOK_RISK_LEVEL.CRITICAL },
      rollbackConfig: { strategy: RUNBOOK_ROLLBACK_STRATEGY.NONE },
    }), { targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    expect(hasError(result, 'RUNBOOK_HIGH_RISK_NONREVERSIBLE')).toBe(true);
  });

  test('MEDIUM risk ACTIVE runbook with NONE rollback does not produce RUNBOOK_HIGH_RISK_NONREVERSIBLE', () => {
    const result = validateRunbookSemantics(activeReadyRunbook({
      risk: { level: RUNBOOK_RISK_LEVEL.MEDIUM },
      rollbackConfig: { strategy: RUNBOOK_ROLLBACK_STRATEGY.NONE },
    }), { targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    expect(hasCode(result, 'RUNBOOK_HIGH_RISK_NONREVERSIBLE')).toBe(false);
  });
});

// ── Verification semantics ───────────────────────────────────────────────────

describe('Verification semantics', () => {
  test('ACTIVE runbook with no verification produces RUNBOOK_VERIFICATION_REQUIRED', () => {
    const result = validateRunbookSemantics(activeReadyRunbook({ verification: undefined }), {
      targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
    });
    expect(hasError(result, 'RUNBOOK_VERIFICATION_REQUIRED')).toBe(true);
  });

  test('DRAFT runbook with no verification is valid', () => {
    const result = validateRunbookSemantics(draftRunbook({ verification: undefined }));
    expect(hasCode(result, 'RUNBOOK_VERIFICATION_REQUIRED')).toBe(false);
    expect(result.valid).toBe(true);
  });

  test('ACTIVE runbook with verification passes requirement check', () => {
    const result = validateRunbookSemantics(activeReadyRunbook(), {
      actionRegistry: SAFE_REGISTRY,
      targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
    });
    expect(hasCode(result, 'RUNBOOK_VERIFICATION_REQUIRED')).toBe(false);
  });

  test('unknown verification check in ACTIVE produces RUNBOOK_UNKNOWN_VERIFICATION_CHECK', () => {
    const result = validateRunbookSemantics(activeReadyRunbook(), {
      verificationRegistry: makeVerificationRegistry({}),
      targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
    });
    expect(hasError(result, 'RUNBOOK_UNKNOWN_VERIFICATION_CHECK')).toBe(true);
  });

  test('unknown verification check in DRAFT produces WARNING', () => {
    const result = validateRunbookSemantics(draftRunbook({
      verification: validVerification(),
    }), { verificationRegistry: makeVerificationRegistry({}) });
    expect(hasWarning(result, 'RUNBOOK_UNKNOWN_VERIFICATION_CHECK')).toBe(true);
    expect(result.valid).toBe(true);
  });

  test('verification check with all params supplied passes', () => {
    const result = validateRunbookSemantics(draftRunbook({
      verification: {
        strategy: RUNBOOK_VERIFICATION_STRATEGY.ALL,
        checks: [{ id: 'c1', check: 'svc_healthy', params: { endpoint: '/health' } }],
      },
    }), {
      verificationRegistry: makeVerificationRegistry({ svc_healthy: { params: ['endpoint'] } }),
    });
    expect(hasCode(result, 'RUNBOOK_VERIFICATION_PARAMETER_MISSING')).toBe(false);
  });

  test('verification check missing required param produces RUNBOOK_VERIFICATION_PARAMETER_MISSING', () => {
    const result = validateRunbookSemantics(draftRunbook({
      verification: {
        strategy: RUNBOOK_VERIFICATION_STRATEGY.ALL,
        checks: [{ id: 'c1', check: 'svc_healthy', params: {} }],
      },
    }), {
      verificationRegistry: makeVerificationRegistry({ svc_healthy: { params: ['endpoint'] } }),
    });
    expect(hasError(result, 'RUNBOOK_VERIFICATION_PARAMETER_MISSING')).toBe(true);
  });
});

// ── Lifecycle transition semantics ───────────────────────────────────────────

describe('Lifecycle transition semantics', () => {
  const transitions = [
    ['DRAFT',      'VALIDATED',  true],
    ['VALIDATED',  'APPROVED',   true],
    ['APPROVED',   'ACTIVE',     true],
    ['ACTIVE',     'DEPRECATED', true],
    ['ACTIVE',     'DISABLED',   true],
    ['APPROVED',   'DISABLED',   true],
    ['VALIDATED',  'DISABLED',   true],
    ['DEPRECATED', 'DISABLED',   true],
    ['DRAFT',      'ACTIVE',     false],  // not allowed
    ['DRAFT',      'APPROVED',   false],  // not allowed
    ['DEPRECATED', 'ACTIVE',     false],  // not allowed
    ['DISABLED',   'ACTIVE',     false],  // not allowed — must go through APPROVED
  ];

  transitions.forEach(([from, to, allowed]) => {
    test(`${from} → ${to} is ${allowed ? 'allowed' : 'NOT allowed'}`, () => {
      const result = validateRunbookSemantics(draftRunbook(), {
        currentLifecycle: from,
        targetLifecycle: to,
      });
      const hasTransitionError = hasError(result, 'RUNBOOK_INVALID_LIFECYCLE_TRANSITION');
      if (allowed) {
        expect(hasTransitionError).toBe(false);
      } else {
        expect(hasTransitionError).toBe(true);
      }
    });
  });

  test('same lifecycle (no transition) does not produce error', () => {
    const result = validateRunbookSemantics(draftRunbook(), {
      currentLifecycle: RUNBOOK_LIFECYCLE.DRAFT,
      targetLifecycle: RUNBOOK_LIFECYCLE.DRAFT,
    });
    expect(hasCode(result, 'RUNBOOK_INVALID_LIFECYCLE_TRANSITION')).toBe(false);
  });
});

// ── Scope referential integrity ──────────────────────────────────────────────

describe('Scope referential integrity', () => {
  test('scope service resolved successfully passes', () => {
    const resolver = makeServiceResolver(new Set(['api-gateway']));
    const result = validateRunbookSemantics(draftRunbook({
      scope: { services: ['api-gateway'] },
    }), { serviceResolver: resolver });
    expect(hasCode(result, 'RUNBOOK_UNKNOWN_SCOPE_REFERENCE')).toBe(false);
  });

  test('scope service not resolvable produces RUNBOOK_UNKNOWN_SCOPE_REFERENCE', () => {
    const resolver = makeServiceResolver(new Set());
    const result = validateRunbookSemantics(draftRunbook({
      scope: { services: ['unknown-svc'] },
    }), { serviceResolver: resolver });
    expect(hasError(result, 'RUNBOOK_UNKNOWN_SCOPE_REFERENCE')).toBe(true);
  });

  test('no serviceResolver skips scope check silently', () => {
    const result = validateRunbookSemantics(draftRunbook({
      scope: { services: ['any-svc'] },
    }));
    expect(hasCode(result, 'RUNBOOK_UNKNOWN_SCOPE_REFERENCE')).toBe(false);
  });
});

// ── System vs tenant semantics ───────────────────────────────────────────────

describe('System vs tenant semantics', () => {
  test('system runbook with scope services and no resolver produces WARNING', () => {
    const result = validateRunbookSemantics({
      apiVersion: RUNBOOK_API_VERSION,
      kind: RUNBOOK_KIND,
      name: 'Built-in Restart',
      owner: { name: 'AIRA Core', ownerType: RUNBOOK_OWNER_TYPE.SYSTEM },
      lifecycle: RUNBOOK_LIFECYCLE.DRAFT,
      steps: [validStep()],
      scope: { services: ['some-service'] },
    });
    expect(hasWarning(result, 'RUNBOOK_SYSTEM_TENANT_REFERENCE')).toBe(true);
    expect(result.valid).toBe(true);
  });

  test('system runbook referencing tenant-private service produces ERROR', () => {
    const resolver = makeServiceResolver(
      new Set(['pub-svc', 'tenant-private-svc']),
      new Set(['tenant-private-svc']),
    );
    const result = validateRunbookSemantics({
      apiVersion: RUNBOOK_API_VERSION,
      kind: RUNBOOK_KIND,
      name: 'Built-in Restart',
      owner: { name: 'AIRA Core', ownerType: RUNBOOK_OWNER_TYPE.SYSTEM },
      lifecycle: RUNBOOK_LIFECYCLE.DRAFT,
      steps: [validStep()],
      scope: { services: ['tenant-private-svc'] },
    }, { serviceResolver: resolver });
    expect(hasError(result, 'RUNBOOK_SYSTEM_TENANT_REFERENCE')).toBe(true);
  });

  test('tenant runbook tenantId matching context passes', () => {
    const result = validateRunbookSemantics(draftRunbook({
      owner: { name: 'Acme', ownerType: RUNBOOK_OWNER_TYPE.TENANT },
      tenantId: 'tenant-acme',
    }), { tenantId: 'tenant-acme' });
    expect(hasCode(result, 'RUNBOOK_TENANT_SCOPE_MISMATCH')).toBe(false);
  });

  test('tenant runbook tenantId mismatching context produces RUNBOOK_TENANT_SCOPE_MISMATCH', () => {
    const result = validateRunbookSemantics(draftRunbook({
      owner: { name: 'Acme', ownerType: RUNBOOK_OWNER_TYPE.TENANT },
      tenantId: 'tenant-acme',
    }), { tenantId: 'tenant-other' });
    expect(hasError(result, 'RUNBOOK_TENANT_SCOPE_MISMATCH')).toBe(true);
  });
});

// ── Injected registries work correctly ──────────────────────────────────────

describe('Injected registries integration', () => {
  test('full context with all registries supplied resolves cleanly', () => {
    const runbook = activeReadyRunbook({
      parameters: [{ name: 'svcName', type: RUNBOOK_PARAM_TYPE.STRING }],
      preconditions: [{ id: 'pre-1', check: 'svc_ready', params: { serviceName: '${svcName}' } }],
      steps: [validStep()],
      verification: {
        strategy: RUNBOOK_VERIFICATION_STRATEGY.ALL,
        checks: [{ id: 'chk-1', check: 'svc_healthy', params: { endpoint: '/health' } }],
      },
      rollbackConfig: {
        enabled: true,
        strategy: RUNBOOK_ROLLBACK_STRATEGY.EXPLICIT_STEPS,
        steps: [{ id: 'rb-1', order: 1, type: 'kubernetes', action: 'restart_pod', params: {} }],
      },
    });

    const result = validateRunbookSemantics(runbook, {
      actionRegistry: SAFE_REGISTRY,
      preconditionRegistry: makePreconditionRegistry({ svc_ready: { params: ['serviceName'] } }),
      verificationRegistry: makeVerificationRegistry({ svc_healthy: { params: ['endpoint'] } }),
      serviceResolver: makeServiceResolver(new Set(['api-gateway'])),
      targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
    });

    // Should have no errors
    const errors = result.diagnostics.filter(d => d.severity === SEVERITY.ERROR);
    expect(errors).toHaveLength(0);
  });

  test('registries that return null for unknown items trigger appropriate diagnostics', () => {
    const result = validateRunbookSemantics(activeReadyRunbook({
      preconditions: [{ id: 'pre-1', check: 'ghost_check' }],
    }), {
      actionRegistry: SAFE_REGISTRY,
      preconditionRegistry: makePreconditionRegistry({}),
      targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
    });
    expect(hasError(result, 'RUNBOOK_UNKNOWN_PRECONDITION')).toBe(true);
  });
});

// ── Diagnostic contract ──────────────────────────────────────────────────────

describe('Diagnostic contract', () => {
  test('each diagnostic has code, path, message, severity', () => {
    const result = validateRunbookSemantics(draftRunbook({
      parameters: [{ name: 'env', type: RUNBOOK_PARAM_TYPE.ENUM, allowedValues: ['a'], default: 'b' }],
    }));
    const d = result.diagnostics[0];
    expect(typeof d.code).toBe('string');
    expect(typeof d.path).toBe('string');
    expect(typeof d.message).toBe('string');
    expect(['ERROR', 'WARNING'].includes(d.severity)).toBe(true);
  });

  test('valid=false when any ERROR present', () => {
    const result = validateRunbookSemantics(activeReadyRunbook({ verification: undefined }), {
      targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
    });
    expect(result.valid).toBe(false);
  });

  test('valid=true with only WARNINGs', () => {
    const result = validateRunbookSemantics(draftRunbook({
      steps: [validStep({ type: RUNBOOK_STEP_TYPE.SHELL_LEGACY, action: 'run' })],
    }));
    expect(result.valid).toBe(true);
    expect(hasWarning(result, 'RUNBOOK_UNSAFE_ACTION_TYPE')).toBe(true);
  });
});

// ── Stable diagnostic code inventory ────────────────────────────────────────

const SEMANTIC_DIAGNOSTIC_CODES = new Set([
  'RUNBOOK_UNKNOWN_ACTION',
  'RUNBOOK_UNSAFE_ACTION_TYPE',
  'RUNBOOK_ACTION_TYPE_MISMATCH',
  'RUNBOOK_UNKNOWN_PRECONDITION',
  'RUNBOOK_PRECONDITION_PARAMETER_MISSING',
  'RUNBOOK_UNKNOWN_PARAMETER_REFERENCE',
  'RUNBOOK_INVALID_PARAMETER_REFERENCE',
  'RUNBOOK_SECRET_REFERENCE_EXPOSURE',
  'RUNBOOK_INVALID_PARAMETER_DEFAULT',
  'RUNBOOK_INVALID_PARAMETER_RANGE',
  'RUNBOOK_UNKNOWN_PARAMETER_SOURCE',
  'RUNBOOK_STEP_CONFIGURATION_INVALID',
  'RUNBOOK_REVERSIBILITY_INCONSISTENT',
  'RUNBOOK_ROLLBACK_MISSING',
  'RUNBOOK_RETRY_NOT_ALLOWED',
  'RUNBOOK_NON_IDEMPOTENT_RETRY',
  'RUNBOOK_RETRY_EXCEEDS_TIMEOUT',
  'RUNBOOK_ROLLBACK_CONFIGURATION_INVALID',
  'RUNBOOK_UNKNOWN_ROLLBACK_ACTION',
  'RUNBOOK_HIGH_RISK_NONREVERSIBLE',
  'RUNBOOK_VERIFICATION_REQUIRED',
  'RUNBOOK_UNKNOWN_VERIFICATION_CHECK',
  'RUNBOOK_VERIFICATION_PARAMETER_MISSING',
  'RUNBOOK_INVALID_LIFECYCLE_TRANSITION',
  'RUNBOOK_UNKNOWN_SCOPE_REFERENCE',
  'RUNBOOK_SYSTEM_TENANT_REFERENCE',
  'RUNBOOK_TENANT_SCOPE_MISMATCH',
]);

describe('Stable diagnostic code inventory', () => {
  test('all 27 semantic diagnostic codes are accounted for', () => {
    expect(SEMANTIC_DIAGNOSTIC_CODES.size).toBe(27);
  });

  test('validator only emits codes from the stable set', () => {
    // Exercise multiple code paths to collect a representative sample
    const runbooks = [
      draftRunbook({ parameters: [{ name: 'env', type: RUNBOOK_PARAM_TYPE.ENUM, allowedValues: ['a'], default: 'b' }] }),
      draftRunbook({ steps: [validStep({ type: RUNBOOK_STEP_TYPE.SHELL_LEGACY, action: 'run' })] }),
      activeReadyRunbook({ verification: undefined }),
    ];
    const contexts = [
      {},
      { targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE },
      { currentLifecycle: RUNBOOK_LIFECYCLE.DRAFT, targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE },
    ];
    runbooks.forEach((rb, i) => {
      const result = validateRunbookSemantics(rb, contexts[i] || {});
      result.diagnostics.forEach(d => {
        expect(SEMANTIC_DIAGNOSTIC_CODES.has(d.code)).toBe(true);
      });
    });
  });
});

// ── DISABLED lifecycle recovery ──────────────────────────────────────────────

describe('DISABLED lifecycle recovery transitions', () => {
  test('DISABLED → DRAFT is allowed', () => {
    const result = validateRunbookSemantics(draftRunbook(), {
      currentLifecycle: RUNBOOK_LIFECYCLE.DISABLED,
      targetLifecycle: RUNBOOK_LIFECYCLE.DRAFT,
    });
    expect(hasCode(result, 'RUNBOOK_INVALID_LIFECYCLE_TRANSITION')).toBe(false);
  });

  test('DISABLED → ACTIVE is NOT allowed', () => {
    const result = validateRunbookSemantics(draftRunbook(), {
      currentLifecycle: RUNBOOK_LIFECYCLE.DISABLED,
      targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
    });
    expect(hasError(result, 'RUNBOOK_INVALID_LIFECYCLE_TRANSITION')).toBe(true);
  });

  test('DISABLED → APPROVED is NOT allowed', () => {
    const result = validateRunbookSemantics(draftRunbook(), {
      currentLifecycle: RUNBOOK_LIFECYCLE.DISABLED,
      targetLifecycle: RUNBOOK_LIFECYCLE.APPROVED,
    });
    expect(hasError(result, 'RUNBOOK_INVALID_LIFECYCLE_TRANSITION')).toBe(true);
  });

  test('DISABLED → VALIDATED is NOT allowed (must go through DRAFT first)', () => {
    const result = validateRunbookSemantics(draftRunbook(), {
      currentLifecycle: RUNBOOK_LIFECYCLE.DISABLED,
      targetLifecycle: RUNBOOK_LIFECYCLE.VALIDATED,
    });
    expect(hasError(result, 'RUNBOOK_INVALID_LIFECYCLE_TRANSITION')).toBe(true);
  });

  test('full reactivation path: each individual hop is permitted', () => {
    // DISABLED→DRAFT, DRAFT→VALIDATED, VALIDATED→APPROVED, APPROVED→ACTIVE
    const hops = [
      [RUNBOOK_LIFECYCLE.DISABLED,   RUNBOOK_LIFECYCLE.DRAFT],
      [RUNBOOK_LIFECYCLE.DRAFT,      RUNBOOK_LIFECYCLE.VALIDATED],
      [RUNBOOK_LIFECYCLE.VALIDATED,  RUNBOOK_LIFECYCLE.APPROVED],
      [RUNBOOK_LIFECYCLE.APPROVED,   RUNBOOK_LIFECYCLE.ACTIVE],
    ];
    hops.forEach(([from, to]) => {
      const result = validateRunbookSemantics(draftRunbook(), {
        currentLifecycle: from,
        targetLifecycle: to,
      });
      expect(hasCode(result, 'RUNBOOK_INVALID_LIFECYCLE_TRANSITION')).toBe(false);
    });
  });
});

// ── Parameter reference syntax validation ────────────────────────────────────

describe('Parameter reference syntax', () => {
  function stepWithRef(refString) {
    return draftRunbook({
      parameters: [],
      steps: [validStep({ params: { target: refString } })],
    });
  }

  function stepWithDeclaredRef(paramName, refString) {
    return draftRunbook({
      parameters: [{ name: paramName, type: RUNBOOK_PARAM_TYPE.STRING }],
      steps: [validStep({ params: { target: refString } })],
    });
  }

  test('${namespace} is syntactically valid', () => {
    const result = validateRunbookSemantics(stepWithDeclaredRef('namespace', '${namespace}'));
    expect(hasCode(result, 'RUNBOOK_INVALID_PARAMETER_REFERENCE')).toBe(false);
  });

  test('${pod_name} is syntactically valid (underscores allowed)', () => {
    const result = validateRunbookSemantics(stepWithDeclaredRef('pod_name', '${pod_name}'));
    expect(hasCode(result, 'RUNBOOK_INVALID_PARAMETER_REFERENCE')).toBe(false);
  });

  test('${_private} is syntactically valid (leading underscore allowed)', () => {
    const result = validateRunbookSemantics(stepWithDeclaredRef('_private', '${_private}'));
    expect(hasCode(result, 'RUNBOOK_INVALID_PARAMETER_REFERENCE')).toBe(false);
  });

  test('${} is invalid — produces RUNBOOK_INVALID_PARAMETER_REFERENCE', () => {
    const result = validateRunbookSemantics(stepWithRef('${}'));
    expect(hasError(result, 'RUNBOOK_INVALID_PARAMETER_REFERENCE')).toBe(true);
  });

  test('${foo (unclosed) is invalid — produces RUNBOOK_INVALID_PARAMETER_REFERENCE', () => {
    const result = validateRunbookSemantics(stepWithRef('${foo'));
    expect(hasError(result, 'RUNBOOK_INVALID_PARAMETER_REFERENCE')).toBe(true);
  });

  test('${foo.bar} is invalid — dot notation not part of v1 grammar', () => {
    const result = validateRunbookSemantics(stepWithRef('${foo.bar}'));
    expect(hasError(result, 'RUNBOOK_INVALID_PARAMETER_REFERENCE')).toBe(true);
  });

  test('${foo + bar} is invalid — expressions not permitted', () => {
    const result = validateRunbookSemantics(stepWithRef('${foo + bar}'));
    expect(hasError(result, 'RUNBOOK_INVALID_PARAMETER_REFERENCE')).toBe(true);
  });

  test('${process.env.X} is invalid — property access not permitted', () => {
    const result = validateRunbookSemantics(stepWithRef('${process.env.X}'));
    expect(hasError(result, 'RUNBOOK_INVALID_PARAMETER_REFERENCE')).toBe(true);
  });

  test('${foo} valid syntax but undeclared → RUNBOOK_UNKNOWN_PARAMETER_REFERENCE, not INVALID', () => {
    const result = validateRunbookSemantics(stepWithRef('${foo}'));
    expect(hasError(result, 'RUNBOOK_UNKNOWN_PARAMETER_REFERENCE')).toBe(true);
    expect(hasError(result, 'RUNBOOK_INVALID_PARAMETER_REFERENCE')).toBe(false);
  });

  test('plain string without ${ is not flagged', () => {
    const result = validateRunbookSemantics(stepWithRef('literal-pod-name'));
    expect(hasCode(result, 'RUNBOOK_INVALID_PARAMETER_REFERENCE')).toBe(false);
    expect(hasCode(result, 'RUNBOOK_UNKNOWN_PARAMETER_REFERENCE')).toBe(false);
  });

  test('$podName (no braces) is not a canonical reference and is not flagged', () => {
    const result = validateRunbookSemantics(stepWithRef('$podName'));
    expect(hasCode(result, 'RUNBOOK_INVALID_PARAMETER_REFERENCE')).toBe(false);
    expect(hasCode(result, 'RUNBOOK_UNKNOWN_PARAMETER_REFERENCE')).toBe(false);
  });

  test('malformed ref does not suppress a subsequent valid-but-undeclared ref in the same field', () => {
    // Both ${ and ${missing} in same string
    const result = validateRunbookSemantics(stepWithRef('${} and ${missing}'));
    expect(hasError(result, 'RUNBOOK_INVALID_PARAMETER_REFERENCE')).toBe(true);
    expect(hasError(result, 'RUNBOOK_UNKNOWN_PARAMETER_REFERENCE')).toBe(true);
  });
});

