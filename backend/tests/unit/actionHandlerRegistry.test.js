'use strict';

/**
 * ActionHandlerRegistry Tests — Phase E/F
 */

const {
  ActionHandlerRegistry,
  getActionHandlerRegistry,
  resetActionHandlerRegistry,
} = require('../../runbooks/actions/actionHandlerRegistry');

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeHandler(type, action, opts = {}) {
  return {
    type,
    action,
    metadata: {
      automationSafe:       opts.automationSafe !== false,
      idempotent:           opts.idempotent           !== false,
      retrySafe:            opts.retrySafe            !== false,
      destructive:          opts.destructive          || false,
      reversible:           opts.reversible           !== false,
      builtinRollback:      opts.builtinRollback      || false,
      requiresConfirmation: opts.requiresConfirmation || false,
      blastRadius:          opts.blastRadius          || 'none',
      outputMayContainSecrets: false,
      description:          opts.description || 'test handler',
    },
    validate:  jest.fn().mockReturnValue({ valid: true, errors: [] }),
    execute:   jest.fn().mockResolvedValue({ success: true }),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ActionHandlerRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new ActionHandlerRegistry();
  });

  describe('register()', () => {
    test('registers a valid handler', () => {
      const h = makeHandler('kubernetes', 'restart_pod');
      registry.register(h);
      expect(registry.has('kubernetes', 'restart_pod')).toBe(true);
    });

    test('throws on duplicate registration', () => {
      const h = makeHandler('kubernetes', 'restart_pod');
      registry.register(h);
      expect(() => registry.register(h)).toThrow('already registered');
    });

    test('throws if handler missing required fields', () => {
      expect(() => registry.register({})).toThrow();
      expect(() => registry.register({ type: 'kubernetes' })).toThrow();
      expect(() => registry.register({ type: 'kubernetes', action: 'foo' })).toThrow();
    });

    test('throws if execute is not a function', () => {
      expect(() => registry.register({
        type: 'kubernetes', action: 'foo', metadata: {}, execute: 'not-a-fn',
      })).toThrow();
    });
  });

  describe('has()', () => {
    test('returns true for registered handler', () => {
      registry.register(makeHandler('api', 'call'));
      expect(registry.has('api', 'call')).toBe(true);
    });

    test('returns false for unknown handler', () => {
      expect(registry.has('database', 'query')).toBe(false);
    });
  });

  describe('resolve()', () => {
    test('returns metadata for registered handler', () => {
      registry.register(makeHandler('kubernetes', 'list_pods'));
      const meta = registry.resolve('kubernetes', 'list_pods');
      expect(meta).toBeDefined();
      expect(meta.description).toBe('test handler');
    });

    test('returns null for unknown handler', () => {
      expect(registry.resolve('cache', 'flush')).toBeNull();
    });
  });

  describe('getHandler()', () => {
    test('returns full entry for registered handler', () => {
      const h = makeHandler('wait', 'poll_condition');
      registry.register(h);
      const entry = registry.getHandler('wait', 'poll_condition');
      expect(entry).toBeDefined();
      expect(typeof entry.execute).toBe('function');
    });

    test('throws for unknown handler', () => {
      expect(() => registry.getHandler('shell', 'exec')).toThrow();
    });
  });

  describe('resolveByAction()', () => {
    test('finds handler by action name alone', () => {
      registry.register(makeHandler('kubernetes', 'scale_deployment'));
      const found = registry.resolveByAction('scale_deployment');
      expect(found).toBeDefined();
      expect(found.type).toBe('kubernetes');
    });

    test('returns null for unregistered action', () => {
      expect(registry.resolveByAction('does_not_exist')).toBeNull();
    });
  });

  describe('report()', () => {
    test('returns array of capability entries', () => {
      registry.register(makeHandler('kubernetes', 'restart_pod'));
      registry.register(makeHandler('wait', 'fixed_delay'));
      const report = registry.report();
      expect(Array.isArray(report)).toBe(true);
      expect(report).toHaveLength(2);
      expect(report[0]).toHaveProperty('key');
      expect(report[0]).toHaveProperty('type');
      expect(report[0]).toHaveProperty('action');
      expect(report[0]).toHaveProperty('status');
    });
  });

  describe('keys()', () => {
    test('returns all registered keys', () => {
      registry.register(makeHandler('kubernetes', 'restart_pod'));
      registry.register(makeHandler('kubernetes', 'scale_deployment'));
      const keys = registry.keys();
      expect(keys).toContain('kubernetes/restart_pod');
      expect(keys).toContain('kubernetes/scale_deployment');
    });
  });
});

// ── Singleton tests ────────────────────────────────────────────────────────

describe('getActionHandlerRegistry() singleton', () => {
  beforeEach(() => resetActionHandlerRegistry());
  afterEach(() => resetActionHandlerRegistry());

  test('returns same instance on repeated calls', () => {
    const a = getActionHandlerRegistry();
    const b = getActionHandlerRegistry();
    expect(a).toBe(b);
  });

  test('singleton contains built-in kubernetes handlers', () => {
    const reg = getActionHandlerRegistry();
    // Built-in kubernetes handlers registered automatically
    expect(reg.has('kubernetes', 'restart_pod')).toBe(true);
    expect(reg.has('kubernetes', 'scale_deployment')).toBe(true);
    expect(reg.has('kubernetes', 'list_pods')).toBe(true);
    expect(reg.has('kubernetes', 'get_logs')).toBe(true);
    expect(reg.has('kubernetes', 'check_pod_health')).toBe(true);
    expect(reg.has('kubernetes', 'get_deployment_status')).toBe(true);
  });

  test('singleton contains built-in wait handlers', () => {
    const reg = getActionHandlerRegistry();
    expect(reg.has('wait', 'poll_condition')).toBe(true);
  });

  test('all built-in handlers have required metadata fields', () => {
    const reg = getActionHandlerRegistry();
    for (const entry of reg.report()) {
      expect(typeof entry.type).toBe('string');
      expect(typeof entry.action).toBe('string');
      expect(typeof entry.status).toBe('string');
    }
  });

  test('resetActionHandlerRegistry clears singleton', () => {
    const a = getActionHandlerRegistry();
    resetActionHandlerRegistry();
    const b = getActionHandlerRegistry();
    expect(a).not.toBe(b);
  });
});

// ── Metadata enforcement ───────────────────────────────────────────────────

describe('Built-in handler metadata', () => {
  let reg;
  beforeAll(() => {
    resetActionHandlerRegistry();
    reg = getActionHandlerRegistry();
  });
  afterAll(() => resetActionHandlerRegistry());

  const REQUIRED_META = [
    'automationSafe', 'idempotent', 'retrySafe', 'destructive',
    'reversible', 'requiresConfirmation', 'blastRadius', 'outputMayContainSecrets', 'description',
  ];

  test.each([
    ['kubernetes', 'restart_pod'],
    ['kubernetes', 'restart_deployment'],
    ['kubernetes', 'scale_deployment'],
    ['kubernetes', 'list_pods'],
    ['kubernetes', 'get_logs'],
    ['kubernetes', 'check_pod_health'],
    ['kubernetes', 'get_deployment_status'],
    ['wait', 'poll_condition'],
  ])('%s/%s has all required metadata fields', (type, action) => {
    const entry = reg.getHandler(type, action);
    for (const field of REQUIRED_META) {
      expect(entry.metadata).toHaveProperty(field);
    }
  });

  test('restart_pod requiresConfirmation = true (destructive)', () => {
    const entry = reg.getHandler('kubernetes', 'restart_pod');
    expect(entry.metadata.requiresConfirmation).toBe(true);
  });

  test('list_pods requiresConfirmation = false (read-only)', () => {
    const entry = reg.getHandler('kubernetes', 'list_pods');
    expect(entry.metadata.requiresConfirmation).toBe(false);
  });

  test('get_logs outputMayContainSecrets = true', () => {
    const entry = reg.getHandler('kubernetes', 'get_logs');
    expect(entry.metadata.outputMayContainSecrets).toBe(true);
  });
});
