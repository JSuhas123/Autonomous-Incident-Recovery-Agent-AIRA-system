'use strict';

/**
 * Unit tests: Runbook Security Validator
 *
 * Run: npx jest tests/unit/runbookSecurityValidator.test.js --no-coverage
 */

const {
  validateRunbookSecurity,
  DEFAULT_LIMITS,
  DEFAULT_SECRET_REF_SCHEMES,
  BLAST_RADIUS_RANK,
} = require('../../runbooks/validators/runbookSecurityValidator');
const { SEVERITY } = require('../../runbooks/validators/validationResult');
const {
  RUNBOOK_API_VERSION, RUNBOOK_KIND,
  RUNBOOK_LIFECYCLE, RUNBOOK_STEP_TYPE,
  RUNBOOK_PARAM_TYPE, RUNBOOK_RISK_LEVEL,
  RUNBOOK_ROLLBACK_STRATEGY, RUNBOOK_VERIFICATION_STRATEGY,
  RUNBOOK_OWNER_TYPE,
} = require('../../constants/runbook');

// ── Fake registry helpers ─────────────────────────────────────────────────────

function makeActionRegistry(entries = {}) {
  return {
    resolve(type, action) { return entries[`${type}/${action}`] || null; },
  };
}

// Well-known safe action metadata used throughout tests
const SAFE_REGISTRY = makeActionRegistry({
  'kubernetes/restart_pod': {
    automationSafe: true, requiresConfirmation: false,
    allowedEnvironments: ['development', 'staging', 'production'],
    blastRadius: 'pod', destructive: false, reversible: true,
    retrySafe: true, outputMayContainSecrets: false,
    privileges: [],
  },
  'api/call_endpoint': {
    automationSafe: true, requiresConfirmation: false,
    allowedEnvironments: ['development', 'staging', 'production'],
    blastRadius: 'service', destructive: false, reversible: true,
    retrySafe: true, outputMayContainSecrets: false,
    privileges: [],
  },
  'kubernetes/delete_namespace': {
    automationSafe: true, requiresConfirmation: true,
    allowedEnvironments: ['development', 'staging'],
    blastRadius: 'namespace', destructive: true, reversible: false,
    retrySafe: false, outputMayContainSecrets: false,
    privileges: ['cluster-admin'],
  },
  'kubernetes/drain_node': {
    automationSafe: false, requiresConfirmation: true,
    allowedEnvironments: ['development'],
    blastRadius: 'node', destructive: true, reversible: true,
    retrySafe: false, outputMayContainSecrets: false,
    privileges: [],
  },
  'api/get_secrets': {
    automationSafe: true, requiresConfirmation: false,
    allowedEnvironments: ['production'],
    blastRadius: 'resource', destructive: false, reversible: true,
    retrySafe: true, outputMayContainSecrets: true,
    privileges: [],
  },
  'kubernetes/scale_cluster': {
    automationSafe: true, requiresConfirmation: false,
    allowedEnvironments: ['production'],
    blastRadius: 'cluster', destructive: false, reversible: true,
    retrySafe: true, outputMayContainSecrets: false,
    privileges: [],
  },
});

// ── Fixture helpers ──────────────────────────────────────────────────────────

function validStep(overrides = {}) {
  return {
    id: 'step-one', name: 'Restart Pod',
    type: RUNBOOK_STEP_TYPE.KUBERNETES, action: 'restart_pod',
    order: 1,
    ...overrides,
  };
}

function safeRunbook(overrides = {}) {
  return {
    apiVersion: RUNBOOK_API_VERSION,
    kind: RUNBOOK_KIND,
    tenantId: 'tenant-acme',
    name: 'Pod Recovery',
    lifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
    risk: { level: RUNBOOK_RISK_LEVEL.MEDIUM, blastRadius: 'pod' },
    steps: [validStep()],
    verification: {
      strategy: RUNBOOK_VERIFICATION_STRATEGY.ALL,
      checks: [{ id: 'chk-1', check: 'pod_healthy' }],
    },
    auditConfig: { redactSensitiveValues: true, recordInputs: true, recordOutputs: true },
    ...overrides,
  };
}

function hasError(result, code) {
  return result.diagnostics.some(d => d.code === code && d.severity === SEVERITY.ERROR);
}

function hasWarning(result, code) {
  return result.diagnostics.some(d => d.code === code && d.severity === SEVERITY.WARNING);
}

function hasCode(result, code) {
  return result.diagnostics.some(d => d.code === code);
}

// ── Programmer-error guard ───────────────────────────────────────────────────

describe('Programmer-error guard', () => {
  test('throws TypeError for null', () => {
    expect(() => validateRunbookSecurity(null)).toThrow(TypeError);
  });

  test('throws TypeError for array', () => {
    expect(() => validateRunbookSecurity([])).toThrow(TypeError);
  });

  test('does not throw for plain object', () => {
    expect(() => validateRunbookSecurity({})).not.toThrow();
  });

  test('result is frozen', () => {
    const result = validateRunbookSecurity(safeRunbook(), { actionRegistry: SAFE_REGISTRY });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
  });
});

// ── Safe canonical Kubernetes Runbook ────────────────────────────────────────

describe('Safe canonical Kubernetes Runbook', () => {
  test('safe runbook passes with no context', () => {
    const result = validateRunbookSecurity(safeRunbook());
    expect(result.valid).toBe(true);
    expect(result.diagnostics.filter(d => d.severity === SEVERITY.ERROR)).toHaveLength(0);
  });

  test('safe runbook passes with full safe registry', () => {
    const result = validateRunbookSecurity(safeRunbook(), { actionRegistry: SAFE_REGISTRY });
    expect(result.valid).toBe(true);
  });
});

// ── Arbitrary execution ──────────────────────────────────────────────────────

describe('Arbitrary execution: shell type', () => {
  test('DRAFT with shell step type produces WARNING', () => {
    const result = validateRunbookSecurity(safeRunbook({
      lifecycle: RUNBOOK_LIFECYCLE.DRAFT,
      steps: [validStep({ type: RUNBOOK_STEP_TYPE.SHELL_LEGACY, action: 'run' })],
    }));
    expect(hasWarning(result, 'RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN')).toBe(true);
    expect(result.valid).toBe(true);
  });

  test('ACTIVE with shell step type produces ERROR', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ type: RUNBOOK_STEP_TYPE.SHELL_LEGACY, action: 'run' })],
    }), { targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    expect(hasError(result, 'RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN')).toBe(true);
  });
});

describe('Arbitrary execution: unsafe script content', () => {
  test('ACTIVE step with bash -c in command field is rejected', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({
        type: RUNBOOK_STEP_TYPE.SCRIPT,
        action: 'run_script',
        command: 'bash -c "rm -rf /tmp/data"',
      })],
    }), { targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    expect(hasError(result, 'RUNBOOK_UNSAFE_SCRIPT_CONTENT')).toBe(true);
  });

  test('DRAFT step with dangerous script content produces WARNING', () => {
    const result = validateRunbookSecurity(safeRunbook({
      lifecycle: RUNBOOK_LIFECYCLE.DRAFT,
      steps: [validStep({
        type: RUNBOOK_STEP_TYPE.SCRIPT,
        action: 'run_script',
        command: 'python -c "import os; os.system(\"ls\")"',
      })],
    }));
    expect(hasWarning(result, 'RUNBOOK_UNSAFE_SCRIPT_CONTENT')).toBe(true);
    expect(result.valid).toBe(true);
  });

  test('eval() pattern in script body is rejected for ACTIVE', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ type: RUNBOOK_STEP_TYPE.SCRIPT, action: 'r', code: 'eval(userInput)' })],
    }), { targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    expect(hasError(result, 'RUNBOOK_UNSAFE_SCRIPT_CONTENT')).toBe(true);
  });
});

// ── Action allowlist boundary ────────────────────────────────────────────────

describe('Action allowlist boundary', () => {
  test('automation-safe action passes', () => {
    const result = validateRunbookSecurity(safeRunbook(), { actionRegistry: SAFE_REGISTRY });
    expect(hasCode(result, 'RUNBOOK_ACTION_NOT_AUTOMATION_SAFE')).toBe(false);
  });

  test('automation-unsafe action produces WARNING for DRAFT', () => {
    const result = validateRunbookSecurity(safeRunbook({
      lifecycle: RUNBOOK_LIFECYCLE.DRAFT,
      risk: { level: RUNBOOK_RISK_LEVEL.MEDIUM, blastRadius: 'node' },
      steps: [validStep({ type: 'kubernetes', action: 'drain_node' })],
    }), { actionRegistry: SAFE_REGISTRY });
    expect(hasWarning(result, 'RUNBOOK_ACTION_NOT_AUTOMATION_SAFE')).toBe(true);
    expect(result.valid).toBe(true);
  });

  test('automation-unsafe action produces ERROR for ACTIVE', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ type: 'kubernetes', action: 'drain_node' })],
    }), { actionRegistry: SAFE_REGISTRY, targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    expect(hasError(result, 'RUNBOOK_ACTION_NOT_AUTOMATION_SAFE')).toBe(true);
  });

  test('action environment restriction produces ERROR when scope includes forbidden env', () => {
    const result = validateRunbookSecurity(safeRunbook({
      scope: { environments: ['production'] },
      steps: [validStep({ type: 'kubernetes', action: 'drain_node' })],
    }), { actionRegistry: SAFE_REGISTRY });
    expect(hasError(result, 'RUNBOOK_ACTION_ENVIRONMENT_FORBIDDEN')).toBe(true);
  });

  test('action requiring confirmation in ACTIVE produces ERROR', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ type: 'kubernetes', action: 'delete_namespace' })],
    }), { actionRegistry: SAFE_REGISTRY, targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    expect(hasError(result, 'RUNBOOK_ACTION_CONFIRMATION_REQUIRED')).toBe(true);
  });
});

// ── Raw secret safety ────────────────────────────────────────────────────────

describe('Raw secret safety', () => {
  test('raw password in step params is rejected', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { password: 'my-raw-password-123' } })],
    }));
    expect(hasError(result, 'RUNBOOK_RAW_SECRET_FORBIDDEN')).toBe(true);
  });

  test('bearer token in step params is rejected', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { token: 'Bearer eyJhbGciOiJSUzI1NiJ9.payload.signature' } })],
    }));
    expect(hasError(result, 'RUNBOOK_RAW_SECRET_FORBIDDEN')).toBe(true);
  });

  test('diagnostic for bearer token does NOT contain the actual token value', () => {
    const fakeToken = 'Bearer secret-token-abc123xyz';
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { token: fakeToken } })],
    }));
    const d = result.diagnostics.find(d => d.code === 'RUNBOOK_RAW_SECRET_FORBIDDEN');
    expect(d).toBeDefined();
    expect(d.message).not.toContain('secret-token-abc123xyz');
    expect(d.message).toContain('[REDACTED]');
  });

  test('valid vault:// secret-reference is accepted', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { password: 'vault://secret/app/db-password' } })],
    }));
    expect(hasCode(result, 'RUNBOOK_RAW_SECRET_FORBIDDEN')).toBe(false);
  });

  test('valid env:// secret-reference is accepted', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { apiKey: 'env://API_KEY' } })],
    }));
    expect(hasCode(result, 'RUNBOOK_RAW_SECRET_FORBIDDEN')).toBe(false);
  });

  test('invalid secret-reference format is rejected with RUNBOOK_INVALID_SECRET_REFERENCE', () => {
    const result = validateRunbookSecurity(safeRunbook({
      parameters: [{
        name: 'dbPassword', type: RUNBOOK_PARAM_TYPE.SECRET_REFERENCE,
        default: 'not-a-valid-scheme://path',
      }],
    }));
    expect(hasError(result, 'RUNBOOK_INVALID_SECRET_REFERENCE')).toBe(true);
  });

  test('secret-reference with unknown scheme uses injected schemes', () => {
    const result = validateRunbookSecurity(safeRunbook({
      parameters: [{
        name: 'dbPassword', type: RUNBOOK_PARAM_TYPE.SECRET_REFERENCE,
        default: 'custom://my/secret',
      }],
    }), { secretReferenceSchemes: ['custom://'] });
    expect(hasCode(result, 'RUNBOOK_INVALID_SECRET_REFERENCE')).toBe(false);
  });

  test('api_key field with raw value is rejected', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { api_key: 'raw-api-key-value-here' } })],
    }));
    expect(hasError(result, 'RUNBOOK_RAW_SECRET_FORBIDDEN')).toBe(true);
  });
});

// ── Secret interpolation into unsafe destinations ────────────────────────────

describe('Secret interpolation safety', () => {
  test('secret-reference param interpolated into notification is rejected', () => {
    const result = validateRunbookSecurity(safeRunbook({
      parameters: [{ name: 'apiKey', type: RUNBOOK_PARAM_TYPE.SECRET_REFERENCE }],
      steps: [validStep({
        type: RUNBOOK_STEP_TYPE.NOTIFICATION,
        action: 'send_alert',
        params: { message: 'Auth key is ${apiKey}' },
      })],
    }));
    expect(hasError(result, 'RUNBOOK_SECRET_DESTINATION_FORBIDDEN')).toBe(true);
  });

  test('secret-reference param interpolated into endpoint URL is rejected', () => {
    const result = validateRunbookSecurity(safeRunbook({
      parameters: [{ name: 'token', type: RUNBOOK_PARAM_TYPE.SECRET_REFERENCE }],
      steps: [validStep({
        type: RUNBOOK_STEP_TYPE.API,
        action: 'call_endpoint',
        params: { endpoint: 'https://api.example.com/data?auth=${token}' },
      })],
    }));
    expect(hasError(result, 'RUNBOOK_SECRET_DESTINATION_FORBIDDEN')).toBe(true);
  });

  test('non-secret param interpolated into notification is not flagged', () => {
    const result = validateRunbookSecurity(safeRunbook({
      parameters: [{ name: 'podName', type: RUNBOOK_PARAM_TYPE.STRING }],
      steps: [validStep({
        type: RUNBOOK_STEP_TYPE.NOTIFICATION,
        action: 'send_alert',
        params: { message: 'Restarted pod ${podName}' },
      })],
    }));
    expect(hasCode(result, 'RUNBOOK_SECRET_DESTINATION_FORBIDDEN')).toBe(false);
  });
});

// ── Network / HTTP safety ────────────────────────────────────────────────────

describe('Network / HTTP safety', () => {
  test('HTTPS endpoint passes', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { endpoint: 'https://api.example.com/restart' } })],
    }), { targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    expect(hasCode(result, 'RUNBOOK_INSECURE_ENDPOINT')).toBe(false);
  });

  test('HTTP endpoint in ACTIVE Runbook produces RUNBOOK_INSECURE_ENDPOINT', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { endpoint: 'http://api.example.com/restart' } })],
    }), { targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    expect(hasError(result, 'RUNBOOK_INSECURE_ENDPOINT')).toBe(true);
  });

  test('credential-bearing URL produces RUNBOOK_CREDENTIAL_IN_URL', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { endpoint: 'https://user:pass@api.example.com/data' } })],
    }));
    expect(hasError(result, 'RUNBOOK_CREDENTIAL_IN_URL')).toBe(true);
  });

  test('credential in URL diagnostic does not echo the password', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { endpoint: 'https://admin:super-secret@api.example.com' } })],
    }));
    const d = result.diagnostics.find(d => d.code === 'RUNBOOK_CREDENTIAL_IN_URL');
    expect(d).toBeDefined();
    expect(d.message).toContain('[REDACTED]');
    expect(d.message).not.toContain('super-secret');
  });

  test('localhost endpoint produces RUNBOOK_FORBIDDEN_ENDPOINT', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { endpoint: 'https://localhost:8080/api' } })],
    }));
    expect(hasError(result, 'RUNBOOK_FORBIDDEN_ENDPOINT')).toBe(true);
  });

  test('127.0.0.1 endpoint produces RUNBOOK_FORBIDDEN_ENDPOINT', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { endpoint: 'https://127.0.0.1:8080/api' } })],
    }));
    expect(hasError(result, 'RUNBOOK_FORBIDDEN_ENDPOINT')).toBe(true);
  });

  test('cloud metadata endpoint (169.254.x.x) produces RUNBOOK_FORBIDDEN_ENDPOINT', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { endpoint: 'http://169.254.169.254/latest/meta-data' } })],
    }));
    expect(hasError(result, 'RUNBOOK_FORBIDDEN_ENDPOINT')).toBe(true);
  });

  test('unsupported URI scheme (file://) produces RUNBOOK_UNSUPPORTED_URI_SCHEME', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { endpoint: 'file:///etc/passwd' } })],
    }));
    expect(hasError(result, 'RUNBOOK_UNSUPPORTED_URI_SCHEME')).toBe(true);
  });

  test('unsupported URI scheme (gopher://) produces RUNBOOK_UNSUPPORTED_URI_SCHEME', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { endpoint: 'gopher://evil.example.com:70/1data' } })],
    }));
    expect(hasError(result, 'RUNBOOK_UNSUPPORTED_URI_SCHEME')).toBe(true);
  });

  test('explicitly allowlisted hostname bypasses forbidden check', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { endpoint: 'https://127.0.0.1:9200/health' } })],
    }), { endpointAllowlist: new Set(['127.0.0.1']) });
    expect(hasCode(result, 'RUNBOOK_FORBIDDEN_ENDPOINT')).toBe(false);
  });

  test('URL containing ${ref} is not flagged (unresolved reference)', () => {
    const result = validateRunbookSecurity(safeRunbook({
      parameters: [{ name: 'host', type: RUNBOOK_PARAM_TYPE.STRING }],
      steps: [validStep({ params: { endpoint: 'https://${host}/api' } })],
    }));
    expect(hasCode(result, 'RUNBOOK_INSECURE_ENDPOINT')).toBe(false);
    expect(hasCode(result, 'RUNBOOK_FORBIDDEN_ENDPOINT')).toBe(false);
  });
});

// ── Resource target safety ────────────────────────────────────────────────────

describe('Resource target safety', () => {
  test('wildcard namespace selector produces RUNBOOK_UNBOUNDED_RESOURCE_TARGET', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { namespace: '*' } })],
    }));
    expect(hasError(result, 'RUNBOOK_UNBOUNDED_RESOURCE_TARGET')).toBe(true);
  });

  test('"all" as namespace selector is also rejected', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { namespace: 'all' } })],
    }));
    expect(hasError(result, 'RUNBOOK_UNBOUNDED_RESOURCE_TARGET')).toBe(true);
  });

  test('specific namespace selector passes', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { namespace: 'production-ns' } })],
    }));
    expect(hasCode(result, 'RUNBOOK_UNBOUNDED_RESOURCE_TARGET')).toBe(false);
  });

  test('wildcard allowed when action metadata sets allowsBulkOperation=true', () => {
    const registry = makeActionRegistry({
      'kubernetes/restart_pod': { allowsBulkOperation: true, automationSafe: true },
    });
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { namespace: '*' } })],
    }), { actionRegistry: registry });
    expect(hasCode(result, 'RUNBOOK_UNBOUNDED_RESOURCE_TARGET')).toBe(false);
  });
});

// ── Blast-radius consistency ──────────────────────────────────────────────────

describe('Blast-radius consistency', () => {
  test('action blast radius matches declared blast radius → passes', () => {
    const result = validateRunbookSecurity(safeRunbook({
      risk: { level: RUNBOOK_RISK_LEVEL.MEDIUM, blastRadius: 'pod' },
    }), { actionRegistry: SAFE_REGISTRY });
    expect(hasCode(result, 'RUNBOOK_DECLARED_BLAST_RADIUS_TOO_LOW')).toBe(false);
  });

  test('action has broader blast radius than declared → RUNBOOK_DECLARED_BLAST_RADIUS_TOO_LOW', () => {
    const result = validateRunbookSecurity(safeRunbook({
      risk: { level: RUNBOOK_RISK_LEVEL.HIGH, blastRadius: 'pod' },
      steps: [validStep({ type: 'kubernetes', action: 'scale_cluster' })],
    }), { actionRegistry: SAFE_REGISTRY });
    expect(hasError(result, 'RUNBOOK_DECLARED_BLAST_RADIUS_TOO_LOW')).toBe(true);
  });

  test('blast-radius taxonomy is ordered correctly', () => {
    expect(BLAST_RADIUS_RANK.pod).toBeLessThan(BLAST_RADIUS_RANK.namespace);
    expect(BLAST_RADIUS_RANK.namespace).toBeLessThan(BLAST_RADIUS_RANK.cluster);
    expect(BLAST_RADIUS_RANK.cluster).toBeLessThan(BLAST_RADIUS_RANK.account);
  });
});

// ── Production environment safety ─────────────────────────────────────────────

describe('Production environment safety', () => {
  test('HIGH risk production Runbook without rollback produces RUNBOOK_PRODUCTION_SAFETY_REQUIREMENT_MISSING', () => {
    const result = validateRunbookSecurity(safeRunbook({
      risk: { level: RUNBOOK_RISK_LEVEL.HIGH, blastRadius: 'pod' },
      scope: { environments: ['production'] },
    }));
    expect(hasError(result, 'RUNBOOK_PRODUCTION_SAFETY_REQUIREMENT_MISSING')).toBe(true);
  });

  test('HIGH risk production Runbook with rollback and verification passes', () => {
    const result = validateRunbookSecurity(safeRunbook({
      risk: { level: RUNBOOK_RISK_LEVEL.HIGH, blastRadius: 'pod' },
      scope: { environments: ['production'] },
      rollbackConfig: {
        enabled: true,
        strategy: RUNBOOK_ROLLBACK_STRATEGY.EXPLICIT_STEPS,
        steps: [{ id: 'rb-1', order: 1, action: 'undo' }],
      },
    }));
    expect(hasCode(result, 'RUNBOOK_PRODUCTION_SAFETY_REQUIREMENT_MISSING')).toBe(false);
  });

  test('action requiring confirmation in production produces RUNBOOK_HIGH_RISK_CONFIRMATION_REQUIRED', () => {
    const result = validateRunbookSecurity(safeRunbook({
      scope: { environments: ['production'] },
      steps: [validStep({ type: 'kubernetes', action: 'delete_namespace' })],
    }), { actionRegistry: SAFE_REGISTRY });
    expect(hasError(result, 'RUNBOOK_HIGH_RISK_CONFIRMATION_REQUIRED')).toBe(true);
  });

  test('non-production Runbook is not subject to production safety requirements', () => {
    const result = validateRunbookSecurity(safeRunbook({
      risk: { level: RUNBOOK_RISK_LEVEL.HIGH },
      scope: { environments: ['staging'] },
    }));
    expect(hasCode(result, 'RUNBOOK_PRODUCTION_SAFETY_REQUIREMENT_MISSING')).toBe(false);
  });
});

// ── Privilege metadata ────────────────────────────────────────────────────────

describe('Privilege metadata', () => {
  test('cluster-admin action in ACTIVE Runbook produces RUNBOOK_PRIVILEGED_ACTION_REQUIRES_REVIEW', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ type: 'kubernetes', action: 'delete_namespace' })],
    }), { actionRegistry: SAFE_REGISTRY, targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    expect(hasError(result, 'RUNBOOK_PRIVILEGED_ACTION_REQUIRES_REVIEW')).toBe(true);
  });

  test('cluster-admin action in DRAFT Runbook produces WARNING', () => {
    const result = validateRunbookSecurity(safeRunbook({
      lifecycle: RUNBOOK_LIFECYCLE.DRAFT,
      risk: { level: RUNBOOK_RISK_LEVEL.MEDIUM, blastRadius: 'namespace' },
      steps: [validStep({ type: 'kubernetes', action: 'delete_namespace' })],
    }), { actionRegistry: SAFE_REGISTRY });
    expect(hasWarning(result, 'RUNBOOK_PRIVILEGED_ACTION_REQUIRES_REVIEW')).toBe(true);
    expect(result.valid).toBe(true);
  });

  test('kubeconfig param key triggers RUNBOOK_EXCESSIVE_PRIVILEGE', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { kubeconfig: 'apiVersion: v1...' } })],
    }));
    expect(hasError(result, 'RUNBOOK_EXCESSIVE_PRIVILEGE')).toBe(true);
  });
});

// ── Destructive action safety ─────────────────────────────────────────────────

describe('Destructive action safety', () => {
  test('destructive irreversible action in ACTIVE produces RUNBOOK_IRREVERSIBLE_DESTRUCTIVE_ACTION', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ type: 'kubernetes', action: 'delete_namespace' })],
    }), { actionRegistry: SAFE_REGISTRY, targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    expect(hasError(result, 'RUNBOOK_IRREVERSIBLE_DESTRUCTIVE_ACTION')).toBe(true);
  });

  test('destructive reversible action in ACTIVE without rollback produces RUNBOOK_DESTRUCTIVE_ACTION_UNSAFE', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ type: 'kubernetes', action: 'drain_node' })],
    }), { actionRegistry: SAFE_REGISTRY, targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    expect(hasError(result, 'RUNBOOK_DESTRUCTIVE_ACTION_UNSAFE')).toBe(true);
  });

  test('destructive action in ACTIVE with enabled rollback passes destructive check', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ type: 'kubernetes', action: 'drain_node' })],
      rollbackConfig: {
        enabled: true,
        strategy: RUNBOOK_ROLLBACK_STRATEGY.EXPLICIT_STEPS,
        steps: [{ id: 'rb-1', order: 1, action: 'restore_node' }],
      },
    }), { actionRegistry: SAFE_REGISTRY, targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    expect(hasCode(result, 'RUNBOOK_DESTRUCTIVE_ACTION_UNSAFE')).toBe(false);
  });
});

// ── Destructive retry ─────────────────────────────────────────────────────────

describe('Destructive retry', () => {
  test('destructive action with retry and retrySafe=false produces RUNBOOK_DESTRUCTIVE_RETRY_FORBIDDEN', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({
        type: 'kubernetes', action: 'delete_namespace',
        retry: { maxAttempts: 3, delaySeconds: 5 },
      })],
    }), { actionRegistry: SAFE_REGISTRY });
    expect(hasError(result, 'RUNBOOK_DESTRUCTIVE_RETRY_FORBIDDEN')).toBe(true);
  });

  test('non-destructive action with retry is not flagged', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ retry: { maxAttempts: 3, delaySeconds: 5 } })],
    }), { actionRegistry: SAFE_REGISTRY });
    expect(hasCode(result, 'RUNBOOK_DESTRUCTIVE_RETRY_FORBIDDEN')).toBe(false);
  });

  test('destructive action with retrySafe=true and maxAttempts>1 passes', () => {
    const registry = makeActionRegistry({
      'kubernetes/delete_namespace': {
        automationSafe: true, requiresConfirmation: false, allowedEnvironments: ['staging'],
        blastRadius: 'namespace', destructive: true, reversible: false,
        retrySafe: true, outputMayContainSecrets: false, privileges: [],
      },
    });
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({
        type: 'kubernetes', action: 'delete_namespace',
        retry: { maxAttempts: 2 },
      })],
    }), { actionRegistry: registry });
    expect(hasCode(result, 'RUNBOOK_DESTRUCTIVE_RETRY_FORBIDDEN')).toBe(false);
  });
});

// ── Output / audit data safety ────────────────────────────────────────────────

describe('Output / audit data safety', () => {
  test('step with captureOutput and outputMayContainSecrets and redact=true passes', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ type: 'api', action: 'get_secrets', captureOutput: true })],
      auditConfig: { redactSensitiveValues: true },
    }), { actionRegistry: SAFE_REGISTRY, targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    expect(hasCode(result, 'RUNBOOK_SENSITIVE_OUTPUT_NOT_REDACTED')).toBe(false);
  });

  test('step with captureOutput and outputMayContainSecrets and redact=false in ACTIVE produces error', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ type: 'api', action: 'get_secrets', captureOutput: true })],
      auditConfig: { redactSensitiveValues: false },
    }), { actionRegistry: SAFE_REGISTRY, targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    expect(hasError(result, 'RUNBOOK_SENSITIVE_OUTPUT_NOT_REDACTED')).toBe(true);
  });

  test('step with captureOutput but outputMayContainSecrets=false passes without redaction', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ captureOutput: true })],
      auditConfig: { redactSensitiveValues: false },
    }), { actionRegistry: SAFE_REGISTRY, targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    expect(hasCode(result, 'RUNBOOK_SENSITIVE_OUTPUT_NOT_REDACTED')).toBe(false);
  });
});

// ── Tenant security boundary ──────────────────────────────────────────────────

describe('Tenant security boundary', () => {
  test('cross-tenant tenantId mismatch produces RUNBOOK_CROSS_TENANT_REFERENCE', () => {
    const result = validateRunbookSecurity(safeRunbook({
      owner: { name: 'Acme', ownerType: RUNBOOK_OWNER_TYPE.TENANT },
      tenantId: 'tenant-acme',
    }), { tenantContext: { tenantId: 'tenant-other' } });
    expect(hasError(result, 'RUNBOOK_CROSS_TENANT_REFERENCE')).toBe(true);
  });

  test('tenant ownership escalation (system owner + tenantId in tenant context) produces RUNBOOK_OWNERSHIP_ESCALATION_FORBIDDEN', () => {
    const result = validateRunbookSecurity(safeRunbook({
      owner: { name: 'Acme', ownerType: RUNBOOK_OWNER_TYPE.SYSTEM },
      tenantId: 'tenant-acme',
    }), { tenantContext: { tenantId: 'tenant-acme' } });
    expect(hasError(result, 'RUNBOOK_OWNERSHIP_ESCALATION_FORBIDDEN')).toBe(true);
  });

  test('system Runbook with hard-coded tenantId in step params produces RUNBOOK_CROSS_TENANT_REFERENCE', () => {
    const result = validateRunbookSecurity(safeRunbook({
      owner: { name: 'AIRA Core', ownerType: RUNBOOK_OWNER_TYPE.SYSTEM },
      tenantId: undefined,
      steps: [validStep({ params: { tenantId: 'tenant-acme' } })],
    }));
    expect(hasError(result, 'RUNBOOK_CROSS_TENANT_REFERENCE')).toBe(true);
  });

  test('system Runbook with parameterized tenantId is acceptable', () => {
    const result = validateRunbookSecurity(safeRunbook({
      owner: { name: 'AIRA Core', ownerType: RUNBOOK_OWNER_TYPE.SYSTEM },
      tenantId: undefined,
      steps: [validStep({ params: { tenantId: '${tenantId}' } })],
    }));
    expect(hasCode(result, 'RUNBOOK_CROSS_TENANT_REFERENCE')).toBe(false);
  });

  test('tenant Runbook with matching context tenantId passes', () => {
    const result = validateRunbookSecurity(safeRunbook({
      owner: { name: 'Acme', ownerType: RUNBOOK_OWNER_TYPE.TENANT },
      tenantId: 'tenant-acme',
    }), { tenantContext: { tenantId: 'tenant-acme' } });
    expect(hasCode(result, 'RUNBOOK_CROSS_TENANT_REFERENCE')).toBe(false);
    expect(hasCode(result, 'RUNBOOK_OWNERSHIP_ESCALATION_FORBIDDEN')).toBe(false);
  });
});

// ── Dangerous object keys ─────────────────────────────────────────────────────

describe('Dangerous object keys', () => {
  test('__proto__ key in step params produces RUNBOOK_DANGEROUS_OBJECT_KEY', () => {
    const step = { id: 's1', name: 'S', type: RUNBOOK_STEP_TYPE.KUBERNETES, action: 'restart_pod', order: 1, params: {} };
    // Create the dangerous key safely without actually polluting the prototype
    Object.defineProperty(step.params, '__proto__', { value: {}, enumerable: true, configurable: true, writable: true });
    const result = validateRunbookSecurity(safeRunbook({ steps: [step] }));
    expect(hasError(result, 'RUNBOOK_DANGEROUS_OBJECT_KEY')).toBe(true);
  });

  test('constructor key in step params produces RUNBOOK_DANGEROUS_OBJECT_KEY', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { constructor: 'function(){}' } })],
    }));
    expect(hasError(result, 'RUNBOOK_DANGEROUS_OBJECT_KEY')).toBe(true);
  });

  test('prototype key in step params produces RUNBOOK_DANGEROUS_OBJECT_KEY', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { prototype: {} } })],
    }));
    expect(hasError(result, 'RUNBOOK_DANGEROUS_OBJECT_KEY')).toBe(true);
  });

  test('normal param keys do not trigger the dangerous key check', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { namespace: 'prod', podName: 'web-1' } })],
    }));
    expect(hasCode(result, 'RUNBOOK_DANGEROUS_OBJECT_KEY')).toBe(false);
  });
});

// ── Size / resource-exhaustion limits ─────────────────────────────────────────

describe('Size / resource-exhaustion limits', () => {
  test('Runbook with steps count exceeding limit produces RUNBOOK_SECURITY_LIMIT_EXCEEDED', () => {
    const tooManySteps = Array.from({ length: 51 }, (_, i) => ({
      id: `step-${i}`, name: `Step ${i}`,
      type: RUNBOOK_STEP_TYPE.KUBERNETES, action: 'restart_pod', order: i + 1,
    }));
    const result = validateRunbookSecurity(safeRunbook({ steps: tooManySteps }));
    expect(hasError(result, 'RUNBOOK_SECURITY_LIMIT_EXCEEDED')).toBe(true);
  });

  test('Runbook within step count limit passes', () => {
    const result = validateRunbookSecurity(safeRunbook());
    expect(hasCode(result, 'RUNBOOK_SECURITY_LIMIT_EXCEEDED')).toBe(false);
  });

  test('excessive nesting depth in step params produces RUNBOOK_MAX_NESTING_EXCEEDED', () => {
    // Build a deeply nested object (11 levels)
    let deepObj = { leaf: 'value' };
    for (let i = 0; i < 12; i++) deepObj = { level: deepObj };

    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { nested: deepObj } })],
    }));
    expect(hasError(result, 'RUNBOOK_MAX_NESTING_EXCEEDED')).toBe(true);
  });

  test('custom limits override defaults', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: Array.from({ length: 3 }, (_, i) => ({
        id: `step-${i}`, name: `Step ${i}`,
        type: RUNBOOK_STEP_TYPE.KUBERNETES, action: 'restart_pod', order: i + 1,
      })),
    }), { securityLimits: { maxSteps: 2 } });
    expect(hasError(result, 'RUNBOOK_SECURITY_LIMIT_EXCEEDED')).toBe(true);
  });
});

// ── Diagnostic secret redaction ────────────────────────────────────────────────

describe('Diagnostic secret redaction', () => {
  const SUPER_SECRET = 'p@ssw0rd-super-secret-do-not-expose';

  test('raw password value never appears in any diagnostic message', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { password: SUPER_SECRET } })],
    }));
    const allMessages = result.diagnostics.map(d => d.message).join('\n');
    expect(allMessages).not.toContain(SUPER_SECRET);
  });

  test('all diagnostics for raw secrets contain [REDACTED]', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { password: SUPER_SECRET } })],
    }));
    const secretDiags = result.diagnostics.filter(d => d.code === 'RUNBOOK_RAW_SECRET_FORBIDDEN');
    expect(secretDiags.length).toBeGreaterThan(0);
    secretDiags.forEach(d => {
      expect(d.message).toContain('[REDACTED]');
    });
  });

  test('credential-in-URL diagnostic never echoes the actual password', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { endpoint: `https://admin:${SUPER_SECRET}@example.com` } })],
    }));
    const urlDiags = result.diagnostics.filter(d => d.code === 'RUNBOOK_CREDENTIAL_IN_URL');
    expect(urlDiags.length).toBeGreaterThan(0);
    urlDiags.forEach(d => {
      expect(d.message).not.toContain(SUPER_SECRET);
    });
  });
});

// ── DRAFT vs ACTIVE severity behaviour ───────────────────────────────────────

describe('DRAFT vs ACTIVE severity behaviour', () => {
  test('shell type in DRAFT produces WARNING (not error) so DRAFT is still saveable', () => {
    const result = validateRunbookSecurity(safeRunbook({
      lifecycle: RUNBOOK_LIFECYCLE.DRAFT,
      steps: [validStep({ type: RUNBOOK_STEP_TYPE.SHELL_LEGACY, action: 'run' })],
    }));
    const errors = result.diagnostics.filter(d => d.severity === SEVERITY.ERROR);
    const warnings = result.diagnostics.filter(d => d.severity === SEVERITY.WARNING && d.code === 'RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN');
    expect(errors.filter(e => e.code === 'RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN')).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(result.valid).toBe(true);
  });

  test('shell type in ACTIVE produces ERROR so promotion is blocked', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ type: RUNBOOK_STEP_TYPE.SHELL_LEGACY, action: 'run' })],
    }), { targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    expect(hasError(result, 'RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN')).toBe(true);
    expect(result.valid).toBe(false);
  });

  test('raw secret is always a blocking ERROR regardless of lifecycle', () => {
    const draftResult = validateRunbookSecurity(safeRunbook({
      lifecycle: RUNBOOK_LIFECYCLE.DRAFT,
      steps: [validStep({ params: { password: 'raw-pass' } })],
    }));
    expect(hasError(draftResult, 'RUNBOOK_RAW_SECRET_FORBIDDEN')).toBe(true);
    expect(draftResult.valid).toBe(false);
  });
});

// ── Injected registries integration ──────────────────────────────────────────

describe('Injected action registry integration', () => {
  test('custom registry metadata is respected for automation-safe flag', () => {
    const registry = makeActionRegistry({
      'kubernetes/restart_pod': {
        automationSafe: false, requiresConfirmation: false,
        allowedEnvironments: ['production'], blastRadius: 'pod',
        destructive: false, reversible: true, retrySafe: true,
        outputMayContainSecrets: false, privileges: [],
      },
    });
    const result = validateRunbookSecurity(safeRunbook(), {
      actionRegistry: registry,
      targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
    });
    expect(hasError(result, 'RUNBOOK_ACTION_NOT_AUTOMATION_SAFE')).toBe(true);
  });

  test('no actionRegistry means registry-dependent checks are skipped', () => {
    const result = validateRunbookSecurity(safeRunbook());
    expect(hasCode(result, 'RUNBOOK_ACTION_NOT_AUTOMATION_SAFE')).toBe(false);
    expect(hasCode(result, 'RUNBOOK_DECLARED_BLAST_RADIUS_TOO_LOW')).toBe(false);
    expect(hasCode(result, 'RUNBOOK_DESTRUCTIVE_ACTION_UNSAFE')).toBe(false);
  });

  test('all registry checks fire correctly with a full context', () => {
    const result = validateRunbookSecurity(safeRunbook({
      risk: { level: RUNBOOK_RISK_LEVEL.MEDIUM, blastRadius: 'pod' },
      steps: [validStep({ type: 'api', action: 'get_secrets', captureOutput: true })],
      auditConfig: { redactSensitiveValues: true },
    }), {
      actionRegistry: SAFE_REGISTRY,
      targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
    });
    const errors = result.diagnostics.filter(d => d.severity === SEVERITY.ERROR);
    expect(errors).toHaveLength(0);
  });
});

// ── Notification safety ───────────────────────────────────────────────────────

describe('Notification safety', () => {
  test('notification endpoint with embedded credentials produces RUNBOOK_NOTIFICATION_ENDPOINT_UNSAFE', () => {
    const result = validateRunbookSecurity(safeRunbook({
      notifications: [{ webhookUrl: 'https://user:pass@hooks.example.com/notify' }],
    }));
    expect(hasError(result, 'RUNBOOK_NOTIFICATION_ENDPOINT_UNSAFE')).toBe(true);
  });

  test('notification endpoint without credentials passes', () => {
    const result = validateRunbookSecurity(safeRunbook({
      notifications: [{ webhookUrl: 'https://hooks.example.com/notify' }],
    }));
    expect(hasCode(result, 'RUNBOOK_NOTIFICATION_ENDPOINT_UNSAFE')).toBe(false);
  });
});

// ── RUNBOOK_ACTION_BLAST_RADIUS_EXCEEDED ─────────────────────────────────────

describe('Blast-radius threshold (RUNBOOK_ACTION_BLAST_RADIUS_EXCEEDED)', () => {
  test('action blast radius below threshold passes', () => {
    const result = validateRunbookSecurity(safeRunbook(), {
      actionRegistry: SAFE_REGISTRY,
      maxBlastRadius: 'cluster',
    });
    expect(hasCode(result, 'RUNBOOK_ACTION_BLAST_RADIUS_EXCEEDED')).toBe(false);
  });

  test('action blast radius exceeding threshold produces error', () => {
    // scale_cluster has blastRadius 'cluster' (rank 6); maxBlastRadius 'namespace' (rank 4)
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ type: 'kubernetes', action: 'scale_cluster' })],
    }), {
      actionRegistry: SAFE_REGISTRY,
      maxBlastRadius: 'namespace',
    });
    expect(hasError(result, 'RUNBOOK_ACTION_BLAST_RADIUS_EXCEEDED')).toBe(true);
  });

  test('no maxBlastRadius in context means threshold check is skipped', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ type: 'kubernetes', action: 'scale_cluster' })],
    }), { actionRegistry: SAFE_REGISTRY });
    expect(hasCode(result, 'RUNBOOK_ACTION_BLAST_RADIUS_EXCEEDED')).toBe(false);
  });
});

// ── RUNBOOK_SECRET_EXPOSURE_RISK ──────────────────────────────────────────────

describe('Secret capture exposure risk (RUNBOOK_SECRET_EXPOSURE_RISK)', () => {
  test('captureOutput with secret-ref param interpolation produces error', () => {
    const result = validateRunbookSecurity(safeRunbook({
      parameters: [{ name: 'dbPass', type: RUNBOOK_PARAM_TYPE.SECRET_REFERENCE }],
      steps: [validStep({
        captureOutput: true,
        params: { password: '${dbPass}' },
      })],
    }));
    expect(hasError(result, 'RUNBOOK_SECRET_EXPOSURE_RISK')).toBe(true);
  });

  test('captureOutput without secret-ref params does not produce error', () => {
    const result = validateRunbookSecurity(safeRunbook({
      parameters: [{ name: 'podName', type: RUNBOOK_PARAM_TYPE.STRING }],
      steps: [validStep({
        captureOutput: true,
        params: { name: '${podName}' },
      })],
    }));
    expect(hasCode(result, 'RUNBOOK_SECRET_EXPOSURE_RISK')).toBe(false);
  });

  test('no captureOutput means secret-ref param usage is not flagged by this check', () => {
    const result = validateRunbookSecurity(safeRunbook({
      parameters: [{ name: 'dbPass', type: RUNBOOK_PARAM_TYPE.SECRET_REFERENCE }],
      steps: [validStep({ params: { password: 'vault://secret/db' } })],
    }));
    expect(hasCode(result, 'RUNBOOK_SECRET_EXPOSURE_RISK')).toBe(false);
  });
});

// ── RUNBOOK_RESOURCE_SCOPE_MISMATCH ──────────────────────────────────────────

describe('Resource scope mismatch (RUNBOOK_RESOURCE_SCOPE_MISMATCH)', () => {
  test('step namespace inside declared scope.namespaces passes', () => {
    const result = validateRunbookSecurity(safeRunbook({
      scope: { namespaces: ['production-ns', 'monitoring-ns'] },
      steps: [validStep({ params: { namespace: 'production-ns' } })],
    }));
    expect(hasCode(result, 'RUNBOOK_RESOURCE_SCOPE_MISMATCH')).toBe(false);
  });

  test('step namespace outside declared scope.namespaces produces error', () => {
    const result = validateRunbookSecurity(safeRunbook({
      scope: { namespaces: ['production-ns'] },
      steps: [validStep({ params: { namespace: 'staging-ns' } })],
    }));
    expect(hasError(result, 'RUNBOOK_RESOURCE_SCOPE_MISMATCH')).toBe(true);
  });

  test('runbook with no scope.namespaces declared does not trigger mismatch', () => {
    const result = validateRunbookSecurity(safeRunbook({
      steps: [validStep({ params: { namespace: 'any-namespace' } })],
    }));
    expect(hasCode(result, 'RUNBOOK_RESOURCE_SCOPE_MISMATCH')).toBe(false);
  });

  test('parameterized namespace value (${ref}) is not flagged for mismatch', () => {
    const result = validateRunbookSecurity(safeRunbook({
      scope: { namespaces: ['production-ns'] },
      steps: [validStep({ params: { namespace: '${targetNamespace}' } })],
    }));
    expect(hasCode(result, 'RUNBOOK_RESOURCE_SCOPE_MISMATCH')).toBe(false);
  });
});
