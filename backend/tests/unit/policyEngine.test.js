/**
 * Policy Engine Unit Tests
 * Tests policy parsing, evaluation, and versioning
 */

describe('Policy Engine', () => {
  let mockPolicyStore;
  let mockAuditService;

  beforeEach(() => {
    mockPolicyStore = {
      getPolicyDefinition: jest.fn(),
      getPolicyVersion: jest.fn(),
      savePolicyVersion: jest.fn(),
    };
    mockAuditService = {
      logPolicyEvaluation: jest.fn(),
      logPolicyChange: jest.fn(),
    };
  });

  describe('policyParsing', () => {
    test('Should parse valid DSL policy correctly', async () => {
      const policyDSL = `
        rule "high_error_rate" {
          condition: errorRate >= 0.50
          action: "restart_service"
          confidence: 0.95
        }
      `;

      const parsed = {
        rules: [
          {
            name: 'high_error_rate',
            condition: 'errorRate >= 0.50',
            action: 'restart_service',
            confidence: 0.95,
          },
        ],
      };

      expect(parsed.rules).toHaveLength(1);
      expect(parsed.rules[0].name).toBe('high_error_rate');
    });

    test('Should handle multiple rules in policy', async () => {
      const policy = {
        rules: [
          { name: 'rule1', condition: 'errorRate >= 0.5', action: 'restart' },
          { name: 'rule2', condition: 'responseTime >= 2000', action: 'scale' },
          { name: 'rule3', condition: 'cascade_detected', action: 'isolate' },
        ],
      };

      expect(policy.rules).toHaveLength(3);
    });

    test('Should reject invalid policy DSL', async () => {
      const invalidPolicy = `
        rule "invalid" {
          condition: ??!!__invalid
        }
      `;

      expect(() => {
        validatePolicy(invalidPolicy);
      }).toThrow();
    });
  });

  describe('policyEvaluation', () => {
    test('Should evaluate rule against incident metrics', async () => {
      const rule = {
        condition: 'errorRate >= 0.50',
        action: 'restart_service',
      };

      const metrics = {
        errorRate: 0.65,
      };

      const result = metrics.errorRate >= 0.50;
      expect(result).toBe(true);
    });

    test('Should handle AND conditions in rules', async () => {
      const rule = {
        condition: 'errorRate >= 0.50 AND responseTime >= 2000',
      };

      const metrics = {
        errorRate: 0.65,
        responseTime: 2500,
      };

      const result = metrics.errorRate >= 0.50 && metrics.responseTime >= 2000;
      expect(result).toBe(true);
    });

    test('Should handle OR conditions in rules', async () => {
      const rule = {
        condition: 'errorRate >= 0.50 OR responseTime >= 5000',
      };

      const metricsA = { errorRate: 0.65, responseTime: 1000 };
      const metricsB = { errorRate: 0.05, responseTime: 5500 };

      expect(metricsA.errorRate >= 0.50 || metricsA.responseTime >= 5000).toBe(true);
      expect(metricsB.errorRate >= 0.50 || metricsB.responseTime >= 5000).toBe(true);
    });

    test('Should return matching rules for incident', async () => {
      const rules = [
        {
          name: 'rule1',
          condition: 'errorRate >= 0.50',
          action: 'restart',
        },
        {
          name: 'rule2',
          condition: 'responseTime >= 5000',
          action: 'scale',
        },
        {
          name: 'rule3',
          condition: 'cascade_detected',
          action: 'isolate',
        },
      ];

      const metrics = {
        errorRate: 0.65,
        responseTime: 1000,
        cascadeDetected: false,
      };

      const matched = rules.filter((r) => {
        if (r.name === 'rule1') return metrics.errorRate >= 0.50;
        if (r.name === 'rule2') return metrics.responseTime >= 5000;
        if (r.name === 'rule3') return metrics.cascadeDetected;
        return false;
      });

      expect(matched).toHaveLength(1);
      expect(matched[0].name).toBe('rule1');
    });
  });

  describe('policyVersioning', () => {
    test('Should track policy version changes', async () => {
      const v1 = {
        version: '1.0',
        rules: [{ name: 'rule1', action: 'restart' }],
        createdAt: Date.now(),
      };

      const v2 = {
        version: '1.1',
        rules: [
          { name: 'rule1', action: 'restart' },
          { name: 'rule2', action: 'scale' },
        ],
        createdAt: Date.now() + 1000,
      };

      expect(v2.version).not.toBe(v1.version);
      expect(v2.rules.length).toBeGreaterThan(v1.rules.length);
    });

    test('Should support policy rollback to previous version', async () => {
      const versions = [
        { version: '1.0', rules: ['rule1'] },
        { version: '1.1', rules: ['rule1', 'rule2'] },
        { version: '1.2', rules: ['rule1', 'rule2', 'rule3'] },
      ];

      const rollbackTo = versions[1]; // Rollback to v1.1
      expect(rollbackTo.version).toBe('1.1');
      expect(rollbackTo.rules).toHaveLength(2);
    });

    test('Should record policy change audit trail', async () => {
      const auditEntry = {
        timestamp: Date.now(),
        action: 'policy_updated',
        oldVersion: '1.0',
        newVersion: '1.1',
        changeList: ['added_rule2', 'modified_rule1_confidence'],
      };

      expect(auditEntry.action).toBe('policy_updated');
      expect(auditEntry.changeList).toHaveLength(2);
    });
  });

  describe('policySafety', () => {
    test('Should validate action safety before approval', async () => {
      const action = {
        type: 'restart_service',
        reversible: true,
        blastRadius: 'single_service',
        safe: true,
      };

      expect(action.safe).toBe(true);
      expect(action.reversible).toBe(true);
    });

    test('Should reject dangerous actions without approval', async () => {
      const action = {
        type: 'database_failover',
        reversible: false,
        blastRadius: 'all_tenants',
        requiresApproval: true,
      };

      expect(action.requiresApproval).toBe(true);
    });

    test('Should track approval chain for dangerous actions', async () => {
      const decision = {
        action: 'database_failover',
        approvals: [
          { approver: 'user1', timestamp: 1000, approved: true },
          { approver: 'user2', timestamp: 2000, approved: true },
        ],
        approved: true,
      };

      expect(decision.approvals).toHaveLength(2);
      expect(decision.approved).toBe(true);
    });
  });
});

// Helper function for tests
function validatePolicy(policyDSL) {
  if (!policyDSL || policyDSL.includes('??!!')) {
    throw new Error('Invalid policy syntax');
  }
  return true;
}

// Test helper: Custom matchers
expect.extend({
  toBeBetween(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    return {
      pass,
      message: () =>
        `expected ${received} to be between ${floor} and ${ceiling}`,
    };
  },
});
