'use strict';

/**
 * Unit tests: Canonical Runbook Schema v1
 *
 * These tests exercise Mongoose schema validation directly (no DB required).
 * They use validateSync() for synchronous validation and validate() for async
 * validators (e.g. custom validators on sub-document fields).
 */

const mongoose = require('mongoose');
const Runbook = require('../../models/Runbook');
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
} = require('../../constants/runbook');

// ── Helpers ────────────────────────────────────────────────────────────────

function validRunbookData(overrides = {}) {
  return {
    tenantId: 'tenant-test',
    name: 'Pod Restart',
    incidentType: 'pod-crash',
    lifecycle: RUNBOOK_LIFECYCLE.DRAFT,
    semver: '1.0.0',
    runbookId: 'RB-K8S-POD-RESTART',
    risk: {
      level: RUNBOOK_RISK_LEVEL.HIGH,
      reversible: true,
    },
    steps: [
      {
        id: 'check-pod',
        order: 1,
        name: 'Check pod status',
        type: RUNBOOK_STEP_TYPE.KUBERNETES,
        action: 'check_pod_health',
        timeoutSeconds: 30,
        failurePolicy: RUNBOOK_FAILURE_POLICY.STOP,
      },
      {
        id: 'restart-pod',
        order: 2,
        name: 'Restart pod',
        type: RUNBOOK_STEP_TYPE.KUBERNETES,
        action: 'restart_pod',
        timeoutSeconds: 60,
        failurePolicy: RUNBOOK_FAILURE_POLICY.ROLLBACK,
      },
    ],
    ...overrides,
  };
}

// ── Constants ──────────────────────────────────────────────────────────────

describe('Runbook constants', () => {
  test('RUNBOOK_API_VERSION is aira.io/v1', () => {
    expect(RUNBOOK_API_VERSION).toBe('aira.io/v1');
  });

  test('RUNBOOK_KIND is Runbook', () => {
    expect(RUNBOOK_KIND).toBe('Runbook');
  });

  test('LIFECYCLE_VALUES covers all six states', () => {
    const values = Object.values(RUNBOOK_LIFECYCLE);

    expect(values).toEqual(
      expect.arrayContaining([
        'DRAFT',
        'VALIDATED',
        'APPROVED',
        'ACTIVE',
        'DEPRECATED',
        'DISABLED',
      ])
    );

    expect(values).toHaveLength(6);
  });

  test('SEMVER_REGEX accepts valid versions', () => {
    expect(SEMVER_REGEX.test('1.0.0')).toBe(true);
    expect(SEMVER_REGEX.test('2.3.14')).toBe(true);
    expect(SEMVER_REGEX.test('1.0.0-alpha.1')).toBe(true);
    expect(SEMVER_REGEX.test('1.0.0+build.42')).toBe(true);
  });

  test('SEMVER_REGEX rejects non-semver strings', () => {
    expect(SEMVER_REGEX.test('1')).toBe(false);
    expect(SEMVER_REGEX.test('1.0')).toBe(false);
    expect(SEMVER_REGEX.test('v1.0.0')).toBe(false);
    expect(SEMVER_REGEX.test('1.0.0.0')).toBe(false);
    expect(SEMVER_REGEX.test('')).toBe(false);
  });

  test('RUNBOOK_ID_REGEX accepts valid stable IDs', () => {
    expect(RUNBOOK_ID_REGEX.test('RB-K8S-POD-RESTART')).toBe(true);
    expect(RUNBOOK_ID_REGEX.test('RB-DB-FAILOVER')).toBe(true);
    expect(RUNBOOK_ID_REGEX.test('RB-CACHE-INVALIDATION')).toBe(true);
  });

  test('RUNBOOK_ID_REGEX rejects invalid IDs', () => {
    expect(RUNBOOK_ID_REGEX.test('rb-k8s-pod')).toBe(false);
    expect(RUNBOOK_ID_REGEX.test('RB_K8S_POD')).toBe(false);
    expect(RUNBOOK_ID_REGEX.test('K8S-POD')).toBe(false);
    expect(RUNBOOK_ID_REGEX.test('RB-K8S')).toBe(false);
  });

  test('STEP_ID_REGEX accepts valid step IDs', () => {
    expect(STEP_ID_REGEX.test('check-pod')).toBe(true);
    expect(STEP_ID_REGEX.test('restart-pod')).toBe(true);
    expect(STEP_ID_REGEX.test('step1')).toBe(true);
  });

  test('STEP_ID_REGEX rejects invalid step IDs', () => {
    expect(STEP_ID_REGEX.test('Check-Pod')).toBe(false);
    expect(STEP_ID_REGEX.test('-bad-start')).toBe(false);
    expect(STEP_ID_REGEX.test('has space')).toBe(false);
  });
});

// ── Valid runbook ──────────────────────────────────────────────────────────

describe('Valid runbook', () => {
  test('accepts a minimal valid runbook', () => {
    const doc = new Runbook(validRunbookData());
    const err = doc.validateSync();

    expect(err).toBeUndefined();
  });

  test('defaults apiVersion to aira.io/v1', () => {
    const doc = new Runbook(validRunbookData());

    expect(doc.apiVersion).toBe(RUNBOOK_API_VERSION);
  });

  test('defaults kind to Runbook', () => {
    const doc = new Runbook(validRunbookData());

    expect(doc.kind).toBe(RUNBOOK_KIND);
  });

  test('defaults lifecycle to DRAFT', () => {
    const doc = new Runbook({
      tenantId: 't1',
      name: 'X',
      steps: [
        {
          name: 'S',
          type: 'kubernetes',
          action: 'do',
        },
      ],
    });

    expect(doc.lifecycle).toBe(RUNBOOK_LIFECYCLE.DRAFT);
  });

  test('accepts all valid lifecycle values', () => {
    for (const lifecycle of Object.values(RUNBOOK_LIFECYCLE)) {
      const doc = new Runbook(
        validRunbookData({
          lifecycle,
        })
      );

      const err = doc.validateSync();

      expect(err).toBeUndefined();
    }
  });

  test('accepts all valid risk levels', () => {
    for (const level of Object.values(RUNBOOK_RISK_LEVEL)) {
      const doc = new Runbook(
        validRunbookData({
          risk: {
            level,
          },
        })
      );

      const err = doc.validateSync();

      expect(err).toBeUndefined();
    }
  });

  test('accepts valid semver strings', () => {
    for (const semver of [
      '1.0.0',
      '2.3.14',
      '1.0.0-alpha.1',
      '10.0.0+build.1',
    ]) {
      const doc = new Runbook(
        validRunbookData({
          semver,
        })
      );

      const err = doc.validateSync();

      expect(err).toBeUndefined();
    }
  });

  test('accepts all valid step types', () => {
    const safeTypes = [
      RUNBOOK_STEP_TYPE.KUBERNETES,
      RUNBOOK_STEP_TYPE.API,
      RUNBOOK_STEP_TYPE.NOTIFICATION,
      RUNBOOK_STEP_TYPE.WAIT,
      RUNBOOK_STEP_TYPE.SCRIPT,
    ];

    for (const type of safeTypes) {
      const doc = new Runbook(
        validRunbookData({
          steps: [
            {
              id: 'step-a',
              order: 1,
              name: 'S',
              type,
              action: 'act',
            },
          ],
        })
      );

      const err = doc.validateSync();

      expect(err).toBeUndefined();
    }
  });

  test('accepts all valid failure policies on steps', () => {
    for (const failurePolicy of Object.values(RUNBOOK_FAILURE_POLICY)) {
      const doc = new Runbook(
        validRunbookData({
          steps: [
            {
              id: 's1',
              order: 1,
              name: 'S',
              type: 'kubernetes',
              action: 'act',
              failurePolicy,
            },
          ],
        })
      );

      const err = doc.validateSync();

      expect(err).toBeUndefined();
    }
  });

  test('accepts parameters with all valid types', () => {
    for (const type of Object.values(RUNBOOK_PARAM_TYPE)) {
      const param =
        type === RUNBOOK_PARAM_TYPE.SECRET_REFERENCE
          ? {
              name: 'secret-param',
              type,
            }
          : {
              name: `param-${type}`,
              type,
              default: null,
            };

      const doc = new Runbook(
        validRunbookData({
          parameters: [param],
        })
      );

      const err = doc.validateSync();

      expect(err).toBeUndefined();
    }
  });
});

// ── Required fields ────────────────────────────────────────────────────────

describe('Required fields', () => {
  test('rejects runbook without tenantId', () => {
    const doc = new Runbook({
      name: 'No Tenant',
      steps: [
        {
          name: 'S',
          type: 'kubernetes',
          action: 'a',
        },
      ],
    });

    const err = doc.validateSync();

    expect(err).toBeDefined();
    expect(err.errors['tenantId']).toBeDefined();
  });

  test('rejects runbook without name', () => {
    const doc = new Runbook({
      tenantId: 't1',
      steps: [
        {
          name: 'S',
          type: 'kubernetes',
          action: 'a',
        },
      ],
    });

    const err = doc.validateSync();

    expect(err).toBeDefined();
    expect(err.errors['name']).toBeDefined();
  });

  test('rejects step without name', () => {
    const doc = new Runbook(
      validRunbookData({
        steps: [
          {
            id: 's1',
            order: 1,
            type: 'kubernetes',
            action: 'act',
          },
        ],
      })
    );

    const err = doc.validateSync();

    expect(err).toBeDefined();
    expect(
      Object.keys(err.errors).some((key) => key.includes('name'))
    ).toBe(true);
  });

  test('rejects step without type', () => {
    const doc = new Runbook(
      validRunbookData({
        steps: [
          {
            id: 's1',
            order: 1,
            name: 'Step',
            action: 'act',
          },
        ],
      })
    );

    const err = doc.validateSync();

    expect(err).toBeDefined();
  });

  test('rejects step without action', () => {
    const doc = new Runbook(
      validRunbookData({
        steps: [
          {
            id: 's1',
            order: 1,
            name: 'Step',
            type: 'kubernetes',
          },
        ],
      })
    );

    const err = doc.validateSync();

    expect(err).toBeDefined();
  });
});

// ── Invalid lifecycle ──────────────────────────────────────────────────────

describe('Invalid lifecycle', () => {
  test('rejects unknown lifecycle value', () => {
    const doc = new Runbook(
      validRunbookData({
        lifecycle: 'RUNNING',
      })
    );

    const err = doc.validateSync();

    expect(err).toBeDefined();
    expect(err.errors['lifecycle']).toBeDefined();
  });

  test('rejects lowercase lifecycle value', () => {
    const doc = new Runbook(
      validRunbookData({
        lifecycle: 'active',
      })
    );

    const err = doc.validateSync();

    expect(err).toBeDefined();
  });
});

// ── Invalid semantic version ───────────────────────────────────────────────

describe('Invalid semantic version', () => {
  test('rejects non-semver version strings', () => {
    const invalid = [
      '1',
      '1.0',
      'v1.0.0',
      '1.0.0.0',
      'latest',
    ];

    for (const semver of invalid) {
      const doc = new Runbook(
        validRunbookData({
          semver,
        })
      );

      const err = doc.validateSync();

      expect(err).toBeDefined();
      expect(err.errors['semver']).toBeDefined();
    }
  });

  test('accepts undefined semver (optional field)', () => {
    const data = validRunbookData();

    delete data.semver;

    const doc = new Runbook(data);

    const err = doc.validateSync();

    expect(err).toBeUndefined();
  });
});

// ── Invalid risk ───────────────────────────────────────────────────────────

describe('Invalid risk', () => {
  test('rejects unknown risk level', () => {
    const doc = new Runbook(
      validRunbookData({
        risk: {
          level: 'EXTREME',
        },
      })
    );

    const err = doc.validateSync();

    expect(err).toBeDefined();
    expect(err.errors['risk.level']).toBeDefined();
  });

  test('rejects lowercase risk level', () => {
    const doc = new Runbook(
      validRunbookData({
        risk: {
          level: 'high',
        },
      })
    );

    const err = doc.validateSync();

    expect(err).toBeDefined();
  });
});

// ── Unsupported parameter type ─────────────────────────────────────────────

describe('Unsupported parameter type', () => {
  test('rejects unknown parameter type', () => {
    const doc = new Runbook(
      validRunbookData({
        parameters: [
          {
            name: 'x',
            type: 'file',
          },
        ],
      })
    );

    const err = doc.validateSync();

    expect(err).toBeDefined();
    expect(
      Object.keys(err.errors).some((key) => key.includes('type'))
    ).toBe(true);
  });
});

// ── Invalid failure policy ─────────────────────────────────────────────────

describe('Invalid failure policy', () => {
  test('rejects unknown failurePolicy on step', () => {
    const doc = new Runbook(
      validRunbookData({
        steps: [
          {
            id: 's1',
            order: 1,
            name: 'S',
            type: 'kubernetes',
            action: 'act',
            failurePolicy: 'RETRY_FOREVER',
          },
        ],
      })
    );

    const err = doc.validateSync();

    expect(err).toBeDefined();
    expect(
      Object.keys(err.errors).some((key) =>
        key.includes('failurePolicy')
      )
    ).toBe(true);
  });
});

// ── Malformed retry policy ─────────────────────────────────────────────────

describe('Malformed retry policy', () => {
  test('rejects maxAttempts below minimum (< 1)', () => {
    const doc = new Runbook(
      validRunbookData({
        steps: [
          {
            id: 's1',
            order: 1,
            name: 'S',
            type: 'kubernetes',
            action: 'act',
            retry: {
              maxAttempts: 0,
            },
          },
        ],
      })
    );

    const err = doc.validateSync();

    expect(err).toBeDefined();
    expect(
      Object.keys(err.errors).some((key) =>
        key.includes('maxAttempts')
      )
    ).toBe(true);
  });

  test('rejects maxAttempts above maximum (> 10)', () => {
    const doc = new Runbook(
      validRunbookData({
        steps: [
          {
            id: 's1',
            order: 1,
            name: 'S',
            type: 'kubernetes',
            action: 'act',
            retry: {
              maxAttempts: 11,
            },
          },
        ],
      })
    );

    const err = doc.validateSync();

    expect(err).toBeDefined();
    expect(
      Object.keys(err.errors).some((key) =>
        key.includes('maxAttempts')
      )
    ).toBe(true);
  });

  test('accepts valid retry configuration', () => {
    const doc = new Runbook(
      validRunbookData({
        steps: [
          {
            id: 's1',
            order: 1,
            name: 'S',
            type: 'kubernetes',
            action: 'act',
            retry: {
              maxAttempts: 3,
              delaySeconds: 2,
              backoffMultiplier: 2,
              maxDelaySeconds: 60,
            },
          },
        ],
      })
    );

    const err = doc.validateSync();

    expect(err).toBeUndefined();
  });
});

// ── Duplicate step IDs ─────────────────────────────────────────────────────

describe('Duplicate step identifiers', () => {
  test('validateStepIds returns null for unique IDs', () => {
    const steps = [
      {
        id: 'step-a',
        name: 'A',
      },
      {
        id: 'step-b',
        name: 'B',
      },
    ];

    expect(
      Runbook.validateStepIds(steps)
    ).toBeNull();
  });

  test('validateStepIds returns error for duplicate IDs', () => {
    const steps = [
      {
        id: 'step-a',
        name: 'A',
      },
      {
        id: 'step-a',
        name: 'B',
      },
    ];

    const err =
      Runbook.validateStepIds(steps);

    expect(err).toBeInstanceOf(
      mongoose.Error.ValidationError
    );
  });

  test('validateStepIds ignores steps without an id (id is optional)', () => {
    const steps = [
      {
        name: 'A',
      },
      {
        name: 'B',
      },
    ];

    expect(
      Runbook.validateStepIds(steps)
    ).toBeNull();
  });

  test('validateStepIds returns null for empty array', () => {
    expect(
      Runbook.validateStepIds([])
    ).toBeNull();
  });
});

// ── Raw secret misuse ──────────────────────────────────────────────────────

describe('Raw secret misuse', () => {
  test('rejects secret-reference parameter with a default value', async () => {
    const doc = new Runbook(
      validRunbookData({
        parameters: [
          {
            name: 'db-password',
            type: RUNBOOK_PARAM_TYPE.SECRET_REFERENCE,
            default: 'my-hardcoded-secret',
          },
        ],
      })
    );

    await expect(
      doc.validate()
    ).rejects.toThrow();
  });

  test('accepts secret-reference parameter without a default', async () => {
    const doc = new Runbook(
      validRunbookData({
        parameters: [
          {
            name: 'db-password',
            type: RUNBOOK_PARAM_TYPE.SECRET_REFERENCE,
            sensitive: true,
          },
        ],
      })
    );

    await expect(
      doc.validate()
    ).resolves.toBeUndefined();
  });

  test('accepts non-secret parameter with a default value', async () => {
    const doc = new Runbook(
      validRunbookData({
        parameters: [
          {
            name: 'namespace',
            type: RUNBOOK_PARAM_TYPE.STRING,
            default: 'production',
          },
        ],
      })
    );

    await expect(
      doc.validate()
    ).resolves.toBeUndefined();
  });
});

// ── Invalid rollback structure ─────────────────────────────────────────────

describe('Invalid rollback structure', () => {
  test('rejects unknown rollback strategy', () => {
    const doc = new Runbook(
      validRunbookData({
        rollbackConfig: {
          enabled: true,
          strategy: 'MAGIC_UNDO',
        },
      })
    );

    const err = doc.validateSync();

    expect(err).toBeDefined();

    expect(
      Object.keys(err.errors).some((key) =>
        key.includes('strategy')
      )
    ).toBe(true);
  });

  test('accepts valid rollback configuration', () => {
    const doc = new Runbook(
      validRunbookData({
        rollbackConfig: {
          enabled: true,
          strategy:
            RUNBOOK_ROLLBACK_STRATEGY.EXPLICIT_STEPS,

          steps: [
            {
              id: 'rb-step-1',
              name: 'Restore previous state',
              order: 1,
              type: RUNBOOK_STEP_TYPE.KUBERNETES,
              action: 'restore_pod',
              timeoutSeconds: 60,
            },
          ],
        },
      })
    );

    const err = doc.validateSync();

    expect(err).toBeUndefined();
  });

  test('rejects rollback step with unknown type', () => {
    const doc = new Runbook(
      validRunbookData({
        rollbackConfig: {
          enabled: true,
          strategy:
            RUNBOOK_ROLLBACK_STRATEGY.EXPLICIT_STEPS,

          steps: [
            {
              name: 'Bad step',
              type: 'shell_script_unsafe',
              action: 'rm -rf /',
            },
          ],
        },
      })
    );

    const err = doc.validateSync();

    expect(err).toBeDefined();
  });
});

// ── Verification structure ─────────────────────────────────────────────────

describe('Verification structure', () => {
  test('accepts valid verification config', () => {
    const doc = new Runbook(
      validRunbookData({
        verification: {
          strategy:
            RUNBOOK_VERIFICATION_STRATEGY.ALL,

          timeoutSeconds: 120,
          intervalSeconds: 10,

          checks: [
            {
              id: 'health-check',
              type: 'service_healthy',
              params: {
                service: 'api',
              },
            },
          ],
        },
      })
    );

    const err = doc.validateSync();

    expect(err).toBeUndefined();
  });

  test('rejects unknown verification strategy', () => {
    const doc = new Runbook(
      validRunbookData({
        verification: {
          strategy: 'MAJORITY',
        },
      })
    );

    const err = doc.validateSync();

    expect(err).toBeDefined();

    expect(
      Object.keys(err.errors).some((key) =>
        key.includes('strategy')
      )
    ).toBe(true);
  });
});

// ── System vs Tenant ownership ─────────────────────────────────────────────

describe('System vs Tenant ownership', () => {
  test('system runbook without tenantId is valid', () => {
    const doc = new Runbook({
      name: 'Built-in Pod Restart',

      owner: {
        name: 'AIRA Core',
        ownerType: 'system',
      },

      steps: [
        {
          name: 'S',
          type: 'kubernetes',
          action: 'restart_pod',
        },
      ],
    });

    expect(
      doc.validateSync()
    ).toBeUndefined();
  });

  test('system runbook with tenantId is also valid (opt-in scoping)', () => {
    const doc = new Runbook({
      tenantId: 'some-tenant',

      name: 'Scoped Built-in',

      owner: {
        name: 'AIRA Core',
        ownerType: 'system',
      },

      steps: [
        {
          name: 'S',
          type: 'kubernetes',
          action: 'restart_pod',
        },
      ],
    });

    expect(
      doc.validateSync()
    ).toBeUndefined();
  });

  test('tenant runbook with tenantId is valid', () => {
    const doc = new Runbook({
      tenantId: 'tenant-1',

      organizationId:
        '64b000000000000000000001',

      environmentId:
        '64b000000000000000000002',

      name: 'Tenant Runbook',

      owner: {
        name: 'Platform Team',
        ownerType: 'tenant',
      },

      steps: [
        {
          name: 'S',
          type: 'api',
          action: 'health_check',
        },
      ],
    });

    expect(
      doc.validateSync()
    ).toBeUndefined();
  });

  test('tenant runbook without tenantId is invalid', () => {
    const doc = new Runbook({
      organizationId:
        '64b000000000000000000001',

      environmentId:
        '64b000000000000000000002',

      name: 'Orphaned Runbook',

      owner: {
        name: 'Platform Team',
        ownerType: 'tenant',
      },

      steps: [
        {
          name: 'S',
          type: 'api',
          action: 'health_check',
        },
      ],
    });

    const err = doc.validateSync();

    expect(err).toBeDefined();
    expect(
      err.errors['tenantId']
    ).toBeDefined();
  });

  test('legacy runbook with no ownerType but with tenantId is valid', () => {
    const doc = new Runbook({
      tenantId: 'legacy-tenant',

      name: 'Old Format',

      steps: [
        {
          name: 'S',
          type: 'kubernetes',
          action: 'a',
        },
      ],
    });

    expect(
      doc.validateSync()
    ).toBeUndefined();
  });

  test('legacy runbook with no ownerType and no tenantId is invalid', () => {
    const doc = new Runbook({
      name: 'No Tenant Legacy',

      steps: [
        {
          name: 'S',
          type: 'kubernetes',
          action: 'a',
        },
      ],
    });

    const err = doc.validateSync();

    expect(err).toBeDefined();

    expect(
      err.errors['tenantId']
    ).toBeDefined();
  });
});

// ── Semantic version authority ─────────────────────────────────────────────

describe('Semantic version authority', () => {
  function makeDoc(overrides = {}) {
    return new Runbook({
      tenantId: 't1',

      name: 'Version Test',

      steps: [
        {
          name: 'S',
          type: 'kubernetes',
          action: 'a',
        },
      ],

      ...overrides,
    });
  }

  test('getVersion() returns the canonical semantic version', () => {
    expect(
      makeDoc({
        semver: '2.1.0',
      }).getVersion()
    ).toBe('2.1.0');
  });

  test('getVersion() returns null when semver is not set', () => {
    expect(
      makeDoc().getVersion()
    ).toBeNull();
  });

  test('metadataVersion virtual returns the canonical semantic version', () => {
    expect(
      makeDoc({
        semver: '3.0.0-beta.1',
      }).metadataVersion
    ).toBe('3.0.0-beta.1');
  });

  test('metadataVersion virtual returns null when semver is not set', () => {
    expect(
      makeDoc().metadataVersion
    ).toBeNull();
  });

  test('Runbook.getCanonicalVersion() returns semver from a document', () => {
    expect(
      Runbook.getCanonicalVersion(
        makeDoc({
          semver: '1.5.2',
        })
      )
    ).toBe('1.5.2');
  });

  test('Runbook.getCanonicalVersion() returns semver from a plain object', () => {
    expect(
      Runbook.getCanonicalVersion({
        semver: '4.0.0',
      })
    ).toBe('4.0.0');
  });

  test('Runbook.getCanonicalVersion() returns null for object without semver', () => {
    expect(
      Runbook.getCanonicalVersion({})
    ).toBeNull();

    expect(
      Runbook.getCanonicalVersion(null)
    ).toBeNull();
  });

  test('numeric version and semver coexist; only semver is canonical', () => {
    const doc = makeDoc({
      version: 7,
      semver: '2.0.0',
    });

    expect(
      doc.validateSync()
    ).toBeUndefined();

    expect(doc.version).toBe(7);
    expect(doc.getVersion()).toBe('2.0.0');
  });

  test('numeric version alone does not provide a canonical version', () => {
    expect(
      makeDoc({
        version: 3,
      }).getVersion()
    ).toBeNull();
  });
});

// ── normalizeRunbookLifecycle helper ───────────────────────────────────────

describe('normalizeRunbookLifecycle helper', () => {
  function makeDoc(overrides = {}) {
    return new Runbook({
      tenantId: 't1',

      name: 'X',

      steps: [
        {
          name: 'S',
          type: 'kubernetes',
          action: 'a',
        },
      ],

      ...overrides,
    });
  }

  test('DISABLED sets enabled=false and active=false', () => {
    const doc = makeDoc({
      lifecycle:
        RUNBOOK_LIFECYCLE.DISABLED,

      enabled: true,
      active: true,
    });

    normalizeRunbookLifecycle(doc);

    expect(doc.enabled).toBe(false);
    expect(doc.active).toBe(false);
  });

  test('ACTIVE sets enabled=true and active=true', () => {
    const doc = makeDoc({
      lifecycle:
        RUNBOOK_LIFECYCLE.ACTIVE,

      enabled: false,
      active: false,
    });

    normalizeRunbookLifecycle(doc);

    expect(doc.enabled).toBe(true);
    expect(doc.active).toBe(true);
  });

  test('DRAFT does not change enabled or active', () => {
    const doc = makeDoc({
      lifecycle:
        RUNBOOK_LIFECYCLE.DRAFT,

      enabled: true,
      active: true,
    });

    normalizeRunbookLifecycle(doc);

    expect(doc.enabled).toBe(true);
    expect(doc.active).toBe(true);
  });

  test('VALIDATED does not change enabled or active', () => {
    const doc = makeDoc({
      lifecycle:
        RUNBOOK_LIFECYCLE.VALIDATED,

      enabled: false,
      active: false,
    });

    normalizeRunbookLifecycle(doc);

    expect(doc.enabled).toBe(false);
    expect(doc.active).toBe(false);
  });

  test('DEPRECATED does not change enabled or active', () => {
    const doc = makeDoc({
      lifecycle:
        RUNBOOK_LIFECYCLE.DEPRECATED,

      enabled: true,
      active: true,
    });

    normalizeRunbookLifecycle(doc);

    expect(doc.enabled).toBe(true);
    expect(doc.active).toBe(true);
  });

  test('is idempotent — calling twice produces the same result', () => {
    const doc = makeDoc({
      lifecycle:
        RUNBOOK_LIFECYCLE.DISABLED,

      enabled: true,
      active: true,
    });

    normalizeRunbookLifecycle(doc);
    normalizeRunbookLifecycle(doc);

    expect(doc.enabled).toBe(false);
    expect(doc.active).toBe(false);
  });
});

// ── Legacy field backward compatibility ────────────────────────────────────

describe('Legacy field backward compatibility', () => {
  test('accepts runbook with only legacy fields (no canonical fields)', () => {
    const doc = new Runbook({
      tenantId:
        'legacy-tenant',

      name:
        'Legacy Runbook',

      incidentType:
        'high-error-rate',

      enabled:
        true,

      steps: [
        {
          stepNumber:
            1,

          name:
            'Restart service',

          type:
            'kubernetes',

          action:
            'restart_pods',

          timeout:
            60000,

          retryPolicy: {
            maxRetries:
              3,

            backoffMs:
              1000,
          },
        },
      ],
    });

    const err = doc.validateSync();

    expect(err).toBeUndefined();
  });

  test('legacy shell step type is accepted by schema (migration deferred)', () => {
    const doc = new Runbook(
      validRunbookData({
        steps: [
          {
            id: 's1',
            order: 1,
            name: 'Legacy shell',
            type: 'shell',
            action: 'some-action',
          },
        ],
      })
    );

    const err = doc.validateSync();

    expect(err).toBeUndefined();
  });

  test('numeric version field is preserved alongside semver', () => {
    const doc = new Runbook(
      validRunbookData({
        version: 5,
        semver: '1.2.3',
      })
    );

    expect(doc.version).toBe(5);
    expect(doc.semver).toBe('1.2.3');
  });
});

// ── Owner type ─────────────────────────────────────────────────────────────

describe('Owner type', () => {
  test('accepts system owner type', () => {
    const doc = new Runbook({
      name:
        'System Runbook',

      owner: {
        name:
          'AIRA Core',

        ownerType:
          'system',
      },

      steps: [
        {
          name:
            'S',

          type:
            'api',

          action:
            'health_check',
        },
      ],
    });

    const err =
      doc.validateSync();

    expect(err).toBeUndefined();
  });

  test('accepts tenant owner type', () => {
    const doc = new Runbook({
      tenantId:
        'tenant-1',

      organizationId:
        '64b000000000000000000001',

      environmentId:
        '64b000000000000000000002',

      name:
        'Tenant Owner Runbook',

      owner: {
        name:
          'Platform Team',

        ownerType:
          'tenant',
      },

      steps: [
        {
          name:
            'S',

          type:
            'api',

          action:
            'health_check',
        },
      ],
    });

    const err =
      doc.validateSync();

    expect(err).toBeUndefined();
  });

  test('rejects unknown owner type', () => {
    const doc = new Runbook(
      validRunbookData({
        owner: {
          name: 'X',
          ownerType: 'external',
        },
      })
    );

    const err =
      doc.validateSync();

    expect(err).toBeDefined();

    expect(
      err.errors[
        'owner.ownerType'
      ]
    ).toBeDefined();
  });
});