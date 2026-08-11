'use strict';

/**
 * PlaybookRegistry unit tests
 *
 * Tests cover: register, getById, getVersion, list, approve, activate,
 * disable, deprecate, createVersion, getExecutionDefinition, isExecutable,
 * PlaybookRegistryError, singleton helpers.
 */

const {
  PlaybookRegistry,
  PlaybookRegistryError,
  REGISTRY_ERROR_CODES,
  getPlaybookRegistry,
  resetPlaybookRegistry,
} = require('../../playbooks/registry/playbookRegistry');

const { PLAYBOOK_LIFECYCLE } = require('../../constants/playbook');

// ── Fixtures ────────────────────────────────────────────────────────────────

function makePlaybook(overrides = {}) {
  return {
    apiVersion: 'aira.io/v1',
    kind: 'Playbook',
    playbookId: 'PB-TEST-REGISTRY-001',
    semver: '1.0.0',
    name: 'Test Registry Playbook',
    lifecycle: PLAYBOOK_LIFECYCLE.DRAFT,
    owner: { ownerType: 'system', name: 'AIRA System' },
    stages: [
      {
        stageId: 'stage-investigation',
        name: 'Investigate',
        type: 'INVESTIGATION',
        order: 1,
        runbooks: [{ runbookId: 'RB-K8S-POD-RESTART', semver: '>=1.0.0' }],
        failurePolicy: 'STOP',
      },
      {
        stageId: 'stage-recovery',
        name: 'Recover',
        type: 'RECOVERY',
        order: 2,
        runbooks: [{ runbookId: 'RB-K8S-POD-RESTART', semver: '>=1.0.0' }],
        failurePolicy: 'STOP',
      },
    ],
    risk: { level: 'LOW' },
    approval: { mode: 'AUTOMATIC' },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PlaybookRegistry — register', () => {
  let registry;
  beforeEach(() => { registry = new PlaybookRegistry(); });

  test('registers a valid playbook without validation', async () => {
    const pb = makePlaybook();
    await registry.register(pb, { validate: false });
    const entry = await registry.getVersion('PB-TEST-REGISTRY-001', '1.0.0');
    expect(entry).toBeDefined();
    expect(entry.playbookId).toBe('PB-TEST-REGISTRY-001');
  });

  test('throws DUPLICATE_VERSION on second registration of same id+semver', async () => {
    const pb = makePlaybook();
    await registry.register(pb, { validate: false });
    await expect(registry.register(pb, { validate: false }))
      .rejects.toMatchObject({ code: REGISTRY_ERROR_CODES.DUPLICATE_VERSION });
  });

  test('allows different semver for same playbookId', async () => {
    await registry.register(makePlaybook({ semver: '1.0.0' }), { validate: false });
    await registry.register(makePlaybook({ semver: '1.1.0' }), { validate: false });
    const latest = await registry.getLatestVersion('PB-TEST-REGISTRY-001');
    expect(latest.semver).toBe('1.1.0');
  });

  test('throws when playbookId is missing', async () => {
    const pb = makePlaybook();
    delete pb.playbookId;
    await expect(registry.register(pb, { validate: false }))
      .rejects.toThrow();
  });
});

describe('PlaybookRegistry — getById / getVersion / getLatestVersion', () => {
  let registry;
  beforeEach(async () => {
    registry = new PlaybookRegistry();
    await registry.register(makePlaybook({ semver: '1.0.0' }), { validate: false });
    await registry.register(makePlaybook({ semver: '2.0.0' }), { validate: false });
  });

  test('getById returns all versions', async () => {
    const versions = await registry.getById('PB-TEST-REGISTRY-001');
    expect(versions.length).toBe(2);
  });

  test('getVersion returns exact match', async () => {
    const entry = await registry.getVersion('PB-TEST-REGISTRY-001', '1.0.0');
    expect(entry.semver).toBe('1.0.0');
  });

  test('getLatestVersion returns highest semver', async () => {
    const entry = await registry.getLatestVersion('PB-TEST-REGISTRY-001');
    expect(entry.semver).toBe('2.0.0');
  });

  test('getVersion throws NOT_FOUND for unknown id', async () => {
    await expect(registry.getVersion('PB-NONEXISTENT', '1.0.0'))
      .rejects.toThrow(PlaybookRegistryError);
  });

  test('getVersion throws NOT_FOUND for unknown semver', async () => {
    await expect(registry.getVersion('PB-TEST-REGISTRY-001', '9.9.9'))
      .rejects.toThrow(PlaybookRegistryError);
  });
});

describe('PlaybookRegistry — list', () => {
  let registry;
  beforeEach(async () => {
    registry = new PlaybookRegistry();
    await registry.register(makePlaybook({ semver: '1.0.0', playbookId: 'PB-ALPHA-001' }), { validate: false });
    await registry.register(makePlaybook({ semver: '1.0.0', playbookId: 'PB-BETA-001' }), { validate: false });
    await registry.register(makePlaybook({ semver: '2.0.0', playbookId: 'PB-BETA-001' }), { validate: false });
  });

  test('list returns one entry per id+version combination', async () => {
    const all = await registry.list();
    expect(all.length).toBe(3);
  });
});

describe('PlaybookRegistry — lifecycle transitions', () => {
  let registry;
  beforeEach(async () => {
    registry = new PlaybookRegistry();
    // Register already-VALIDATED to enable approve()
    await registry.register(makePlaybook({ semver: '1.0.0', lifecycle: PLAYBOOK_LIFECYCLE.VALIDATED }), { validate: false });
  });

  test('approve transitions VALIDATED → APPROVED', async () => {
    await registry.approve('PB-TEST-REGISTRY-001', '1.0.0');
    const entry = await registry.getVersion('PB-TEST-REGISTRY-001', '1.0.0');
    expect(entry.lifecycle).toBe(PLAYBOOK_LIFECYCLE.APPROVED);
  });

  test('activate transitions APPROVED → ACTIVE when runbooks are supplied', async () => {
    // Mock runbook registry with active runbook (getById is used by semantic validator)
    const mockRunbookRegistry = {
      getById: () => [{ lifecycle: 'ACTIVE', semver: '1.0.0' }],
      getLatestVersion: () => ({ lifecycle: 'ACTIVE' }),
      getVersion: () => ({ lifecycle: 'ACTIVE' }),
    };
    await registry.approve('PB-TEST-REGISTRY-001', '1.0.0');
    await registry.activate('PB-TEST-REGISTRY-001', '1.0.0', { runbookRegistry: mockRunbookRegistry });
    const entry = await registry.getVersion('PB-TEST-REGISTRY-001', '1.0.0');
    expect(entry.lifecycle).toBe(PLAYBOOK_LIFECYCLE.ACTIVE);
  });

  test('disable transitions ACTIVE → DISABLED', async () => {
    const mockRbRegistry = {
      getById: () => [{ lifecycle: 'ACTIVE', semver: '1.0.0' }],
      getLatestVersion: () => ({ lifecycle: 'ACTIVE' }),
      getVersion: () => ({ lifecycle: 'ACTIVE' }),
    };
    await registry.approve('PB-TEST-REGISTRY-001', '1.0.0');
    await registry.activate('PB-TEST-REGISTRY-001', '1.0.0', { runbookRegistry: mockRbRegistry });
    await registry.disable('PB-TEST-REGISTRY-001', '1.0.0');
    const entry = await registry.getVersion('PB-TEST-REGISTRY-001', '1.0.0');
    expect(entry.lifecycle).toBe(PLAYBOOK_LIFECYCLE.DISABLED);
  });

  test('deprecate transitions ACTIVE → DEPRECATED', async () => {
    const mockRbRegistry = {
      getById: () => [{ lifecycle: 'ACTIVE', semver: '1.0.0' }],
      getLatestVersion: () => ({ lifecycle: 'ACTIVE' }),
      getVersion: () => ({ lifecycle: 'ACTIVE' }),
    };
    await registry.approve('PB-TEST-REGISTRY-001', '1.0.0');
    await registry.activate('PB-TEST-REGISTRY-001', '1.0.0', { runbookRegistry: mockRbRegistry });
    await registry.deprecate('PB-TEST-REGISTRY-001', '1.0.0');
    const entry = await registry.getVersion('PB-TEST-REGISTRY-001', '1.0.0');
    expect(entry.lifecycle).toBe(PLAYBOOK_LIFECYCLE.DEPRECATED);
  });

  test('throws INVALID_TRANSITION for illegal path (DRAFT → ACTIVE)', async () => {
    // Need a separate DRAFT registry entry
    const draftRegistry = new PlaybookRegistry();
    await draftRegistry.register(makePlaybook({ semver: '1.0.0' }), { validate: false });
    const mockRbRegistry = {
      getById: () => [{ lifecycle: 'ACTIVE', semver: '1.0.0' }],
      getLatestVersion: () => ({ lifecycle: 'ACTIVE' }),
      getVersion: () => ({ lifecycle: 'ACTIVE' }),
    };
    await expect(
      draftRegistry.activate('PB-TEST-REGISTRY-001', '1.0.0', { runbookRegistry: mockRbRegistry })
    ).rejects.toMatchObject({ code: REGISTRY_ERROR_CODES.INVALID_TRANSITION });
  });
});

describe('PlaybookRegistry — isExecutable / getExecutionDefinition', () => {
  let registry;
  beforeEach(async () => {
    registry = new PlaybookRegistry();
  });

  test('isExecutable returns false for DRAFT', async () => {
    await registry.register(makePlaybook({ semver: '1.0.0', lifecycle: PLAYBOOK_LIFECYCLE.DRAFT }), { validate: false });
    const entry = await registry.getVersion('PB-TEST-REGISTRY-001', '1.0.0');
    expect(registry.isExecutable(entry)).toBe(false);
  });

  test('isExecutable returns true only for ACTIVE', async () => {
    const mockRbRegistry = {
      getById: () => [{ lifecycle: 'ACTIVE', semver: '1.0.0' }],
      getLatestVersion: () => ({ lifecycle: 'ACTIVE' }),
      getVersion: () => ({ lifecycle: 'ACTIVE' }),
    };
    // Register as VALIDATED so we can approve() → activate()
    await registry.register(makePlaybook({ semver: '1.0.0', lifecycle: PLAYBOOK_LIFECYCLE.VALIDATED }), { validate: false });
    await registry.approve('PB-TEST-REGISTRY-001', '1.0.0');
    await registry.activate('PB-TEST-REGISTRY-001', '1.0.0', { runbookRegistry: mockRbRegistry });
    const entry = await registry.getVersion('PB-TEST-REGISTRY-001', '1.0.0');
    expect(registry.isExecutable(entry)).toBe(true);
  });

  test('getExecutionDefinition throws NOT_EXECUTABLE for non-ACTIVE', async () => {
    await registry.register(makePlaybook({ semver: '1.0.0' }), { validate: false });
    await expect(registry.getExecutionDefinition('PB-TEST-REGISTRY-001', '1.0.0'))
      .rejects.toThrow();
  });
});

describe('PlaybookRegistry — PlaybookRegistryError', () => {
  test('has correct name, code, and message', () => {
    const err = new PlaybookRegistryError('NOT_FOUND', 'not found', { id: 'x' });
    expect(err.name).toBe('PlaybookRegistryError');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('not found');
    expect(err.details.id).toBe('x');
    expect(err instanceof Error).toBe(true);
  });

  test('REGISTRY_ERROR_CODES exposes all expected codes', () => {
    const expected = [
      'NOT_FOUND', 'DUPLICATE_VERSION', 'IMPORT_VALIDATION_FAILED',
      'ACTIVATION_VALIDATION_FAILED', 'VALIDATION_FAILED', 'INVALID_TRANSITION',
      'TRANSITION_CONFLICT', 'POLICY_DENIED', 'NOT_EXECUTABLE',
      'TENANT_REQUIRED', 'INVALID_VERSION',
    ];
    for (const code of expected) {
      expect(REGISTRY_ERROR_CODES[code]).toBe(code);
    }
  });
});

describe('PlaybookRegistry — singleton', () => {
  afterEach(() => resetPlaybookRegistry());

  test('getPlaybookRegistry returns same instance on repeated calls', () => {
    const r1 = getPlaybookRegistry();
    const r2 = getPlaybookRegistry();
    expect(r1).toBe(r2);
  });

  test('resetPlaybookRegistry creates a fresh instance', () => {
    const r1 = getPlaybookRegistry();
    resetPlaybookRegistry();
    const r2 = getPlaybookRegistry();
    expect(r1).not.toBe(r2);
  });
});
