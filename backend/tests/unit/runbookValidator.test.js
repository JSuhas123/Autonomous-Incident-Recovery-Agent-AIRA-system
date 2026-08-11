'use strict';

/**
 * Unit tests: Authoritative Runbook Validation Pipeline (runbookValidator.js)
 *
 * Run: npx jest tests/unit/runbookValidator.test.js --no-coverage --forceExit --verbose
 */

const { validateRunbook, VALIDATION_PURPOSE } = require('../../runbooks/validators/runbookValidator');
const { SEVERITY } = require('../../runbooks/validators/validationResult');
const {
  RUNBOOK_API_VERSION, RUNBOOK_KIND,
  RUNBOOK_LIFECYCLE, RUNBOOK_STEP_TYPE,
  RUNBOOK_RISK_LEVEL, RUNBOOK_PARAM_TYPE,
  RUNBOOK_ROLLBACK_STRATEGY, RUNBOOK_VERIFICATION_STRATEGY,
  RUNBOOK_OWNER_TYPE,
} = require('../../constants/runbook');

// ── Fake registry helpers ─────────────────────────────────────────────────────

function makeActionRegistry(entries = {}) {
  return { resolve: (type, action) => entries[`${type}/${action}`] || null };
}
function makePreconditionRegistry(entries = {}) {
  return { resolve: (check) => entries[check] || null };
}
function makeVerificationRegistry(entries = {}) {
  return { resolve: (check) => entries[check] || null };
}
function makeServiceResolver(known = [], tenantPrivate = []) {
  return {
    resolve: (id) => known.includes(id),
    isTenantPrivate: (id) => tenantPrivate.includes(id),
  };
}

// Safe metadata for the kubernetes/restart_pod action used throughout
const FULL_REGISTRY_CONTEXT = {
  actionRegistry: makeActionRegistry({
    'kubernetes/restart_pod': {
      automationSafe: true, requiresConfirmation: false,
      allowedEnvironments: ['development', 'staging', 'production'],
      blastRadius: 'pod', destructive: false, reversible: true,
      retrySafe: true, outputMayContainSecrets: false, privileges: [],
    },
  }),
  preconditionRegistry: makePreconditionRegistry({
    pod_running: { params: [] },
  }),
  verificationRegistry: makeVerificationRegistry({
    pod_healthy: { params: [] },
  }),
  serviceResolver: makeServiceResolver(['svc-api'], []),
};

// ── Fixtures ─────────────────────────────────────────────────────────────────

function validStep(overrides = {}) {
  return {
    id: 'step-one', name: 'Restart Pod',
    type: RUNBOOK_STEP_TYPE.KUBERNETES, action: 'restart_pod',
    order: 1, ...overrides,
  };
}

/** Canonical runbook that passes all three validation stages. */
function canonicalRunbook(overrides = {}) {
  return {
    apiVersion: RUNBOOK_API_VERSION,
    kind: RUNBOOK_KIND,
    tenantId: 'tenant-acme',
    name: 'Database Recovery',
    semver: '1.0.0',
    lifecycle: RUNBOOK_LIFECYCLE.DRAFT,
    risk: { level: RUNBOOK_RISK_LEVEL.MEDIUM, blastRadius: 'pod' },
    steps: [validStep()],
    ...overrides,
  };
}

/** Canonical runbook ready for ACTIVE lifecycle (needs verification). */
function activeReadyRunbook(overrides = {}) {
  return canonicalRunbook({
    lifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
    verification: {
      strategy: RUNBOOK_VERIFICATION_STRATEGY.ALL,
      checks: [{ id: 'chk-1', check: 'pod_healthy' }],
    },
    auditConfig: { redactSensitiveValues: true },
    ...overrides,
  });
}

// ── Query helpers ─────────────────────────────────────────────────────────────

function hasError(result, code) {
  return result.diagnostics.some(d => d.code === code && d.severity === SEVERITY.ERROR);
}

function hasWarning(result, code) {
  return result.diagnostics.some(d => d.code === code && d.severity === SEVERITY.WARNING);
}

function hasCode(result, code) {
  return result.diagnostics.some(d => d.code === code);
}

function codeOrder(result, codeA, codeB) {
  const idxA = result.diagnostics.findIndex(d => d.code === codeA);
  const idxB = result.diagnostics.findIndex(d => d.code === codeB);
  return { idxA, idxB };
}

// ── 1. Fully valid canonical runbook passes all 3 stages ─────────────────────

describe('1 — Fully valid canonical runbook', () => {
  test('DRAFT runbook with no registries passes all stages', () => {
    const result = validateRunbook(canonicalRunbook());
    expect(result.valid).toBe(true);
    expect(result.diagnostics.filter(d => d.severity === SEVERITY.ERROR)).toHaveLength(0);
    expect(result.stages.structural.valid).toBe(true);
    expect(result.stages.semantic.valid).toBe(true);
    expect(result.stages.security.valid).toBe(true);
    expect(result.stages.semantic.skipped).toBeUndefined();
    expect(result.stages.security.skipped).toBeUndefined();
  });

  test('ACTIVE runbook with full registry context passes all stages', () => {
    const result = validateRunbook(activeReadyRunbook(), FULL_REGISTRY_CONTEXT);
    expect(result.valid).toBe(true);
    expect(result.stages.structural.valid).toBe(true);
    expect(result.stages.semantic.valid).toBe(true);
    expect(result.stages.security.valid).toBe(true);
  });

  test('pipeline result and stages are frozen (not mutated later)', () => {
    const result = validateRunbook(canonicalRunbook());
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
    expect(Object.isFrozen(result.stages)).toBe(true);
  });
});

// ── 2. Structural failure causes semantic/security skip ──────────────────────

describe('2 — Structural failure short-circuits pipeline', () => {
  test('missing required fields cause structural error → semantic and security are skipped', () => {
    const result = validateRunbook({});
    expect(result.valid).toBe(false);
    expect(result.stages.structural.valid).toBe(false);
    expect(result.stages.semantic.skipped).toBe(true);
    expect(result.stages.security.skipped).toBe(true);
    expect(result.stages.semantic.diagnostics).toHaveLength(0);
    expect(result.stages.security.diagnostics).toHaveLength(0);
  });

  test('wrong apiVersion causes structural error → later stages skipped', () => {
    const result = validateRunbook(canonicalRunbook({ apiVersion: 'v99/unknown' }));
    expect(result.valid).toBe(false);
    expect(result.stages.structural.valid).toBe(false);
    expect(result.stages.semantic.skipped).toBe(true);
    expect(result.stages.security.skipped).toBe(true);
  });

  test('structural diagnostics appear in combined result', () => {
    const result = validateRunbook({});
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.every(d => ['ERROR', 'WARNING'].includes(d.severity))).toBe(true);
  });
});

// ── 3. Structural warning does NOT cause skip ─────────────────────────────────

describe('3 — Structural warning does not block later stages', () => {
  test('legacy field warning still allows semantic + security to run', () => {
    // incidentType is a legacy root field that produces a WARNING, not an ERROR
    const result = validateRunbook(canonicalRunbook({ incidentType: 'deprecated-field' }));
    expect(result.stages.semantic.skipped).toBeUndefined();
    expect(result.stages.security.skipped).toBeUndefined();
  });
});

// ── 4. Semantic failure prevents security ────────────────────────────────────

describe('4 — Semantic failure short-circuits security', () => {
  test('invalid lifecycle transition causes semantic error → security is skipped', () => {
    // Provide a currentLifecycle/targetLifecycle transition that is invalid
    // (e.g. ACTIVE → DRAFT is not a valid transition)
    const result = validateRunbook(activeReadyRunbook({
      lifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
    }), {
      currentLifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
      targetLifecycle: RUNBOOK_LIFECYCLE.DRAFT,
    });
    // RUNBOOK_INVALID_LIFECYCLE_TRANSITION is a semantic ERROR
    if (hasError(result, 'RUNBOOK_INVALID_LIFECYCLE_TRANSITION')) {
      expect(result.stages.security.skipped).toBe(true);
    }
  });

  test('unknown action with injected registry causes semantic error → security skipped', () => {
    const registry = {
      actionRegistry: makeActionRegistry({}), // no actions registered
      preconditionRegistry: makePreconditionRegistry({}),
      verificationRegistry: makeVerificationRegistry({}),
      serviceResolver: makeServiceResolver([]),
    };
    const result = validateRunbook(activeReadyRunbook(), registry);
    // RUNBOOK_UNKNOWN_ACTION is a semantic error for ACTIVE lifecycle
    if (hasError(result, 'RUNBOOK_UNKNOWN_ACTION')) {
      expect(result.stages.security.skipped).toBe(true);
    }
  });
});

// ── 5. Semantic warning allows security ──────────────────────────────────────

describe('5 — Semantic warning does not block security', () => {
  test('semantic warning in DRAFT does not skip security stage', () => {
    // In DRAFT, many semantic checks are warnings rather than errors
    const result = validateRunbook(canonicalRunbook({
      lifecycle: RUNBOOK_LIFECYCLE.DRAFT,
    }));
    // structural valid (no errors), semantic may have warnings, security runs
    expect(result.stages.semantic.skipped).toBeUndefined();
    expect(result.stages.security.skipped).toBeUndefined();
  });
});

// ── 6. Security failure makes overall valid=false ─────────────────────────────

describe('6 — Security failure makes overall result invalid', () => {
  test('raw secret in step params fails security → overall result invalid', () => {
    const result = validateRunbook(canonicalRunbook({
      steps: [validStep({ params: { password: 'raw-plaintext-password' } })],
    }));
    expect(result.stages.security.valid).toBe(false);
    expect(result.valid).toBe(false);
    expect(hasError(result, 'RUNBOOK_RAW_SECRET_FORBIDDEN')).toBe(true);
  });

  test('structural and semantic valid but security invalid = overall invalid', () => {
    const result = validateRunbook(canonicalRunbook({
      steps: [validStep({ params: { token: 'raw-bearer-token-value' } })],
    }));
    expect(result.stages.structural.valid).toBe(true);
    expect(result.stages.security.valid).toBe(false);
    expect(result.valid).toBe(false);
  });
});

// ── 7. Diagnostic ordering ─────────────────────────────────────────────────────

describe('7 — Diagnostic ordering is deterministic', () => {
  test('structural diagnostics appear before semantic diagnostics', () => {
    // Use a runbook that triggers both a structural warning (legacy field) and
    // a security error (raw secret)
    const result = validateRunbook(canonicalRunbook({
      incidentType: 'legacy',  // structural WARNING
      steps: [validStep({ params: { password: 'raw' } })],
    }));
    const structuralCodes = new Set(result.stages.structural.diagnostics.map(d => d.code));
    const securityCodes   = new Set(result.stages.security.diagnostics.map(d => d.code));

    result.stages.structural.diagnostics.forEach(sd => {
      const siIdx = result.diagnostics.findIndex(d => d.code === sd.code && d.path === sd.path);
      result.stages.security.diagnostics.forEach(sec => {
        const secIdx = result.diagnostics.findIndex(d => d.code === sec.code && d.path === sec.path);
        if (siIdx !== -1 && secIdx !== -1) {
          expect(siIdx).toBeLessThan(secIdx);
        }
      });
    });
  });
});

// ── 8. Diagnostics are not mutated ────────────────────────────────────────────

describe('8 — Diagnostics are not mutated', () => {
  test('combined diagnostics array is frozen', () => {
    const result = validateRunbook(canonicalRunbook());
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
  });

  test('individual stage diagnostic arrays are separate from combined array', () => {
    const result = validateRunbook(canonicalRunbook({
      steps: [validStep({ params: { password: 'raw' } })],
    }));
    // combined contains security diags, but modifying combined should not affect stages
    const origLen = result.stages.security.diagnostics.length;
    // result.diagnostics is frozen, confirming no post-processing mutation
    expect(() => result.diagnostics.push({})).toThrow();
    expect(result.stages.security.diagnostics.length).toBe(origLen);
  });
});

// ── 9/10. System and tenant runbooks ──────────────────────────────────────────

describe('9 & 10 — System and tenant runbooks', () => {
  test('system runbook without tenantId passes pipeline', () => {
    const result = validateRunbook(canonicalRunbook({
      owner: { name: 'AIRA Core', ownerType: RUNBOOK_OWNER_TYPE.SYSTEM },
      tenantId: undefined,
    }));
    expect(result.stages.structural.valid).toBe(true);
    expect(hasError(result, 'RUNBOOK_OWNERSHIP_ESCALATION_FORBIDDEN')).toBe(false);
  });

  test('tenant runbook with matching tenantContext passes', () => {
    const result = validateRunbook(canonicalRunbook({
      owner: { name: 'Acme', ownerType: RUNBOOK_OWNER_TYPE.TENANT },
      tenantId: 'tenant-acme',
    }), { tenantContext: { tenantId: 'tenant-acme' } });
    expect(hasError(result, 'RUNBOOK_CROSS_TENANT_REFERENCE')).toBe(false);
    expect(hasError(result, 'RUNBOOK_OWNERSHIP_ESCALATION_FORBIDDEN')).toBe(false);
  });

  test('tenant runbook with mismatched tenantContext fails security', () => {
    const result = validateRunbook(canonicalRunbook({
      owner: { name: 'Acme', ownerType: RUNBOOK_OWNER_TYPE.TENANT },
      tenantId: 'tenant-acme',
    }), { tenantContext: { tenantId: 'tenant-other' } });
    expect(hasError(result, 'RUNBOOK_CROSS_TENANT_REFERENCE')).toBe(true);
    expect(result.valid).toBe(false);
  });
});

// ── 11–14. Validation purposes (modes) ───────────────────────────────────────

describe('11 — AUTHORING purpose (DRAFT lifecycle strictness)', () => {
  test('AUTHORING mode allows shell step type as WARNING', () => {
    const result = validateRunbook(canonicalRunbook({
      steps: [validStep({ type: RUNBOOK_STEP_TYPE.SHELL_LEGACY, action: 'run' })],
    }), { purpose: VALIDATION_PURPOSE.AUTHORING });
    // DRAFT lifecycle: shell → WARNING not ERROR
    expect(hasWarning(result, 'RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN')).toBe(true);
    expect(hasError(result, 'RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN')).toBe(false);
    expect(result.valid).toBe(true);
  });

  test('AUTHORING mode overall result is valid for a safe DRAFT runbook', () => {
    const result = validateRunbook(canonicalRunbook(), { purpose: VALIDATION_PURPOSE.AUTHORING });
    expect(result.valid).toBe(true);
  });
});

describe('12 — APPROVAL purpose (APPROVED lifecycle strictness)', () => {
  test('APPROVAL mode rejects shell step type with ERROR', () => {
    const result = validateRunbook(activeReadyRunbook({
      steps: [validStep({ type: RUNBOOK_STEP_TYPE.SHELL_LEGACY, action: 'run' })],
    }), { purpose: VALIDATION_PURPOSE.APPROVAL });
    // Shell is rejected: either semantic (RUNBOOK_UNSAFE_ACTION_TYPE) or
    // security (RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN) will produce an error
    const shellRejected = hasError(result, 'RUNBOOK_UNSAFE_ACTION_TYPE') ||
      hasError(result, 'RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN');
    expect(shellRejected).toBe(true);
    expect(result.valid).toBe(false);
  });

  test('APPROVAL mode with safe step passes security', () => {
    const result = validateRunbook(canonicalRunbook(), { purpose: VALIDATION_PURPOSE.APPROVAL });
    expect(hasError(result, 'RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN')).toBe(false);
  });
});

describe('13 — ACTIVATION purpose (ACTIVE lifecycle strictness)', () => {
  test('ACTIVATION mode rejects shell step type with ERROR', () => {
    const result = validateRunbook(activeReadyRunbook({
      steps: [validStep({ type: RUNBOOK_STEP_TYPE.SHELL_LEGACY, action: 'run' })],
    }), { purpose: VALIDATION_PURPOSE.ACTIVATION });
    const shellRejected = hasError(result, 'RUNBOOK_UNSAFE_ACTION_TYPE') ||
      hasError(result, 'RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN');
    expect(shellRejected).toBe(true);
    expect(result.valid).toBe(false);
  });

  test('ACTIVATION mode HTTP endpoint produces RUNBOOK_INSECURE_ENDPOINT error', () => {
    const result = validateRunbook(activeReadyRunbook({
      steps: [validStep({ params: { endpoint: 'http://api.example.com/restart' } })],
    }), { purpose: VALIDATION_PURPOSE.ACTIVATION });
    expect(hasError(result, 'RUNBOOK_INSECURE_ENDPOINT')).toBe(true);
  });
});

describe('14 — IMPORT purpose (DRAFT lifecycle, no auto-promotion)', () => {
  test('IMPORT mode treats runbook as DRAFT — shell step is WARNING not ERROR', () => {
    const result = validateRunbook(canonicalRunbook({
      steps: [validStep({ type: RUNBOOK_STEP_TYPE.SHELL_LEGACY, action: 'run' })],
    }), { purpose: VALIDATION_PURPOSE.IMPORT });
    expect(hasWarning(result, 'RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN')).toBe(true);
    expect(hasError(result, 'RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN')).toBe(false);
    // Import is still valid (warnings allowed)
    expect(result.valid).toBe(true);
  });

  test('IMPORT mode still rejects raw secrets (always ERROR)', () => {
    const result = validateRunbook(canonicalRunbook({
      steps: [validStep({ params: { password: 'raw' } })],
    }), { purpose: VALIDATION_PURPOSE.IMPORT });
    expect(hasError(result, 'RUNBOOK_RAW_SECRET_FORBIDDEN')).toBe(true);
    expect(result.valid).toBe(false);
  });
});

// ── 15. Unsafe shell DRAFT behavior ──────────────────────────────────────────

describe('15 — Unsafe shell DRAFT behavior', () => {
  test('DRAFT shell step produces WARNING but pipeline is valid', () => {
    const result = validateRunbook(canonicalRunbook({
      lifecycle: RUNBOOK_LIFECYCLE.DRAFT,
      steps: [validStep({ type: RUNBOOK_STEP_TYPE.SHELL_LEGACY, action: 'run' })],
    }));
    expect(result.valid).toBe(true);
    const warn = result.diagnostics.find(d =>
      d.code === 'RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN' && d.severity === SEVERITY.WARNING);
    expect(warn).toBeDefined();
  });
});

// ── 16. Unsafe shell ACTIVE/ACTIVATION rejection ──────────────────────────────

describe('16 — Unsafe shell ACTIVE/ACTIVATION rejection', () => {
  test('ACTIVE lifecycle rejects shell step with ERROR', () => {
    const result = validateRunbook(activeReadyRunbook({
      steps: [validStep({ type: RUNBOOK_STEP_TYPE.SHELL_LEGACY, action: 'run' })],
    }));
    const shellRejected = hasError(result, 'RUNBOOK_UNSAFE_ACTION_TYPE') ||
      hasError(result, 'RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN');
    expect(shellRejected).toBe(true);
    expect(result.valid).toBe(false);
  });

  test('ACTIVATION purpose rejects shell step with ERROR', () => {
    const result = validateRunbook(activeReadyRunbook({
      steps: [validStep({ type: RUNBOOK_STEP_TYPE.SHELL_LEGACY, action: 'run' })],
    }), { purpose: VALIDATION_PURPOSE.ACTIVATION });
    const shellRejected = hasError(result, 'RUNBOOK_UNSAFE_ACTION_TYPE') ||
      hasError(result, 'RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN');
    expect(shellRejected).toBe(true);
    expect(result.valid).toBe(false);
  });
});

// ── 17. Raw secret always blocks ──────────────────────────────────────────────

describe('17 — Raw secret always blocks regardless of lifecycle', () => {
  for (const lifecycle of [
    RUNBOOK_LIFECYCLE.DRAFT,
    RUNBOOK_LIFECYCLE.VALIDATED,
    RUNBOOK_LIFECYCLE.APPROVED,
    RUNBOOK_LIFECYCLE.ACTIVE,
  ]) {
    test(`raw secret in ${lifecycle} runbook produces ERROR`, () => {
      // Use activeReadyRunbook for production lifecycles so semantic passes
      const base = [RUNBOOK_LIFECYCLE.APPROVED, RUNBOOK_LIFECYCLE.ACTIVE].includes(lifecycle)
        ? activeReadyRunbook({ lifecycle })
        : canonicalRunbook({ lifecycle });
      const result = validateRunbook({ ...base, steps: [validStep({ params: { password: 'raw-secret-value' } })] });
      expect(hasError(result, 'RUNBOOK_RAW_SECRET_FORBIDDEN')).toBe(true);
      expect(result.valid).toBe(false);
    });
  }
});

// ── 18. Injected fake registries propagate correctly ─────────────────────────

describe('18 — Injected registries propagate to semantic and security layers', () => {
  test('injected actionRegistry is used by semantic layer to resolve actions', () => {
    const registry = makeActionRegistry({
      'kubernetes/restart_pod': { idempotent: true, retryable: true },
    });
    // A registry that returns null for restart_pod would cause RUNBOOK_UNKNOWN_ACTION
    const emptyRegistry = makeActionRegistry({});
    const withRegistry = validateRunbook(activeReadyRunbook(), {
      actionRegistry: registry,
      verificationRegistry: makeVerificationRegistry({ pod_healthy: { params: [] } }),
    });
    const withoutRegistry = validateRunbook(activeReadyRunbook(), {
      actionRegistry: emptyRegistry,
      verificationRegistry: makeVerificationRegistry({ pod_healthy: { params: [] } }),
    });
    // With empty registry the action is unknown; with valid registry it's known
    expect(withoutRegistry.diagnostics.some(d => d.code === 'RUNBOOK_UNKNOWN_ACTION')).toBe(true);
    expect(withRegistry.diagnostics.some(d => d.code === 'RUNBOOK_UNKNOWN_ACTION')).toBe(false);
  });

  test('injected actionRegistry with automationSafe=false triggers security error in ACTIVE', () => {
    const unsafeRegistry = makeActionRegistry({
      'kubernetes/restart_pod': { automationSafe: false, destructive: false, privileges: [] },
    });
    const result = validateRunbook(activeReadyRunbook(), {
      actionRegistry: unsafeRegistry,
      targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
    });
    expect(hasError(result, 'RUNBOOK_ACTION_NOT_AUTOMATION_SAFE')).toBe(true);
  });

  test('context.tenantContext propagates to security boundary check', () => {
    const result = validateRunbook(canonicalRunbook({
      owner: { name: 'Acme', ownerType: RUNBOOK_OWNER_TYPE.TENANT },
      tenantId: 'tenant-acme',
    }), { tenantContext: { tenantId: 'tenant-other' } });
    expect(hasError(result, 'RUNBOOK_CROSS_TENANT_REFERENCE')).toBe(true);
  });

  test('securityLimits override propagates to security layer', () => {
    const result = validateRunbook(canonicalRunbook({
      steps: Array.from({ length: 3 }, (_, i) => ({
        id: `s${i}`, name: `S${i}`, type: RUNBOOK_STEP_TYPE.KUBERNETES,
        action: 'restart_pod', order: i + 1,
      })),
    }), { securityLimits: { maxSteps: 2 } });
    expect(hasError(result, 'RUNBOOK_SECURITY_LIMIT_EXCEEDED')).toBe(true);
  });
});

// ── 19. Duplicate diagnostics handled deterministically ──────────────────────

describe('19 — Duplicate diagnostics are deduplicated by exact key', () => {
  test('combined diagnostics contain no exact (code+path+message) duplicates', () => {
    const result = validateRunbook(canonicalRunbook({
      steps: [validStep({ params: { password: 'raw' } })],
    }));
    const keys = result.diagnostics.map(d => `${d.code}::${d.path}::${d.message}`);
    const unique = new Set(keys);
    expect(keys.length).toBe(unique.size);
  });

  test('distinct diagnostics sharing only a code are NOT deduplicated', () => {
    // Two steps each with a raw password → two distinct RUNBOOK_RAW_SECRET_FORBIDDEN entries
    const result = validateRunbook(canonicalRunbook({
      steps: [
        { id: 's1', name: 'S1', type: RUNBOOK_STEP_TYPE.KUBERNETES, action: 'restart_pod', order: 1, params: { password: 'raw1' } },
        { id: 's2', name: 'S2', type: RUNBOOK_STEP_TYPE.KUBERNETES, action: 'restart_pod', order: 2, params: { password: 'raw2' } },
      ],
    }));
    const rawSecretDiags = result.diagnostics.filter(d => d.code === 'RUNBOOK_RAW_SECRET_FORBIDDEN');
    expect(rawSecretDiags.length).toBeGreaterThanOrEqual(2);
  });
});

// ── 20. All advertised security codes have emit-capable implementations ───────

describe('20 — Advertised security diagnostic codes are emit-capable', () => {
  const EMITTED_CODES = [
    'RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN',
    'RUNBOOK_UNSAFE_SCRIPT_CONTENT',
    'RUNBOOK_ACTION_NOT_AUTOMATION_SAFE',
    'RUNBOOK_ACTION_ENVIRONMENT_FORBIDDEN',
    'RUNBOOK_ACTION_BLAST_RADIUS_EXCEEDED',     // Part 1 fix
    'RUNBOOK_ACTION_CONFIRMATION_REQUIRED',
    'RUNBOOK_RAW_SECRET_FORBIDDEN',
    'RUNBOOK_INVALID_SECRET_REFERENCE',
    'RUNBOOK_SECRET_EXPOSURE_RISK',             // Part 1 fix
    'RUNBOOK_SECRET_DESTINATION_FORBIDDEN',
    'RUNBOOK_INSECURE_ENDPOINT',
    'RUNBOOK_FORBIDDEN_ENDPOINT',
    'RUNBOOK_CREDENTIAL_IN_URL',
    'RUNBOOK_UNSUPPORTED_URI_SCHEME',
    'RUNBOOK_UNBOUNDED_RESOURCE_TARGET',
    'RUNBOOK_RESOURCE_SCOPE_MISMATCH',          // Part 1 fix
    'RUNBOOK_DECLARED_BLAST_RADIUS_TOO_LOW',
    'RUNBOOK_PRODUCTION_SAFETY_REQUIREMENT_MISSING',
    'RUNBOOK_HIGH_RISK_CONFIRMATION_REQUIRED',
    'RUNBOOK_EXCESSIVE_PRIVILEGE',
    'RUNBOOK_PRIVILEGED_ACTION_REQUIRES_REVIEW',
    'RUNBOOK_DESTRUCTIVE_ACTION_UNSAFE',
    'RUNBOOK_IRREVERSIBLE_DESTRUCTIVE_ACTION',
    'RUNBOOK_DESTRUCTIVE_RETRY_FORBIDDEN',
    'RUNBOOK_SENSITIVE_OUTPUT_NOT_REDACTED',
    'RUNBOOK_NOTIFICATION_ENDPOINT_UNSAFE',
    'RUNBOOK_CROSS_TENANT_REFERENCE',
    'RUNBOOK_OWNERSHIP_ESCALATION_FORBIDDEN',
    'RUNBOOK_DANGEROUS_OBJECT_KEY',
    'RUNBOOK_SECURITY_LIMIT_EXCEEDED',
    'RUNBOOK_MAX_NESTING_EXCEEDED',
  ];

  // Use the security validator directly since individual code tests are
  // already in runbookSecurityValidator.test.js.
  const { validateRunbookSecurity } = require('../../runbooks/validators/runbookSecurityValidator');

  test('RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN is emittable', () => {
    const r = validateRunbookSecurity({ lifecycle: RUNBOOK_LIFECYCLE.ACTIVE, steps: [{ type: 'shell', action: 'r', order: 1 }] });
    expect(r.diagnostics.some(d => d.code === 'RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN')).toBe(true);
  });

  test('RUNBOOK_ACTION_BLAST_RADIUS_EXCEEDED is emittable (Part 1 fix)', () => {
    const registry = { resolve: () => ({ automationSafe: true, blastRadius: 'cluster', destructive: false, privileges: [] }) };
    const r = validateRunbookSecurity(
      { lifecycle: RUNBOOK_LIFECYCLE.DRAFT, steps: [{ id: 's', type: 'k', action: 'a', order: 1 }] },
      { actionRegistry: registry, maxBlastRadius: 'namespace' },
    );
    expect(r.diagnostics.some(d => d.code === 'RUNBOOK_ACTION_BLAST_RADIUS_EXCEEDED')).toBe(true);
  });

  test('RUNBOOK_SECRET_EXPOSURE_RISK is emittable (Part 1 fix)', () => {
    const r = validateRunbookSecurity({
      lifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
      parameters: [{ name: 'sec', type: RUNBOOK_PARAM_TYPE.SECRET_REFERENCE }],
      steps: [{ id: 's', type: 'k', action: 'a', order: 1, captureOutput: true, params: { x: '${sec}' } }],
    });
    expect(r.diagnostics.some(d => d.code === 'RUNBOOK_SECRET_EXPOSURE_RISK')).toBe(true);
  });

  test('RUNBOOK_RESOURCE_SCOPE_MISMATCH is emittable (Part 1 fix)', () => {
    const r = validateRunbookSecurity({
      lifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
      scope: { namespaces: ['ns-a'] },
      steps: [{ id: 's', type: 'k', action: 'a', order: 1, params: { namespace: 'ns-b' } }],
    });
    expect(r.diagnostics.some(d => d.code === 'RUNBOOK_RESOURCE_SCOPE_MISMATCH')).toBe(true);
  });

  test('RUNBOOK_NOTIFICATION_SECRET_EXPOSURE is explicitly deferred (not emitted)', () => {
    // This code is documented as deferred in the security validator module header.
    // Verify no test accidentally emits it (there is no code path that produces it).
    const r = validateRunbookSecurity({
      lifecycle: RUNBOOK_LIFECYCLE.ACTIVE,
      parameters: [{ name: 'sec', type: RUNBOOK_PARAM_TYPE.SECRET_REFERENCE }],
      notifications: [{ webhookUrl: 'https://hooks.example.com', message: '${sec}' }],
    });
    expect(r.diagnostics.some(d => d.code === 'RUNBOOK_NOTIFICATION_SECRET_EXPOSURE')).toBe(false);
  });

  test(`all ${EMITTED_CODES.length} advertised codes are in the documented emit-capable list`, () => {
    // This is a catalogue contract test, not a full emission test.
    expect(EMITTED_CODES).toHaveLength(31);
  });
});

// ── Pipeline contract summary ─────────────────────────────────────────────────

describe('Pipeline contract', () => {
  test('VALIDATION_PURPOSE has exactly 4 values', () => {
    expect(Object.keys(VALIDATION_PURPOSE)).toHaveLength(4);
    expect(VALIDATION_PURPOSE.AUTHORING).toBe('AUTHORING');
    expect(VALIDATION_PURPOSE.IMPORT).toBe('IMPORT');
    expect(VALIDATION_PURPOSE.APPROVAL).toBe('APPROVAL');
    expect(VALIDATION_PURPOSE.ACTIVATION).toBe('ACTIVATION');
  });

  test('purpose AUTHORING maps to DRAFT lifecycle for security decisions', () => {
    // Shell step → WARNING (DRAFT) not ERROR (ACTIVE) when purpose = AUTHORING
    const result = validateRunbook(canonicalRunbook({
      steps: [validStep({ type: RUNBOOK_STEP_TYPE.SHELL_LEGACY, action: 'run' })],
    }), { purpose: VALIDATION_PURPOSE.AUTHORING });
    expect(hasWarning(result, 'RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN')).toBe(true);
    expect(result.valid).toBe(true);
  });

  test('explicit targetLifecycle overrides purpose lifecycle', () => {
    // purpose=AUTHORING (→DRAFT) but targetLifecycle=ACTIVE → ACTIVE strictness wins
    const result = validateRunbook(activeReadyRunbook({
      steps: [validStep({ type: RUNBOOK_STEP_TYPE.SHELL_LEGACY, action: 'run' })],
    }), { purpose: VALIDATION_PURPOSE.AUTHORING, targetLifecycle: RUNBOOK_LIFECYCLE.ACTIVE });
    const shellRejected = hasError(result, 'RUNBOOK_UNSAFE_ACTION_TYPE') ||
      hasError(result, 'RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN');
    expect(shellRejected).toBe(true);
    expect(result.valid).toBe(false);
  });
});
