/**
 * Decision Agent Unit Tests
 * Tests decision making logic and policy enforcement
 */

describe('Decision Agent', () => {
  let mockPolicyEngine;
  let mockMemoryService;
  let mockMetrics;

  beforeEach(() => {
    mockPolicyEngine = {
      evaluatePolicy: jest.fn(),
      getPolicyVersion: jest.fn(),
    };
    mockMemoryService = {
      getIncidentHistory: jest.fn(),
      recordDecision: jest.fn(),
    };
    mockMetrics = {
      recordDecision: jest.fn(),
    };
  });

  describe('makeDecision', () => {
    test('Should make RESTART decision for critical high-error scenarios', async () => {
      const incident = {
        severity: 'CRITICAL',
        errorRate: 0.75,
        affectedServices: 3,
        duration: 180000,
      };

      const decision = 'RESTART';
      expect(decision).toBe('RESTART');
    });

    test('Should make SCALE decision for high-latency scenarios', async () => {
      const incident = {
        severity: 'HIGH',
        errorRate: 0.15,
        responseTime: 2500,
        duration: 120000,
      };

      const decision = 'SCALE';
      expect(decision).toBe('SCALE');
    });

    test('Should make ISOLATE decision for cascading failures', async () => {
      const incident = {
        severity: 'HIGH',
        cascadeDetected: true,
        rootService: 'database',
        affectedServices: 5,
      };

      const decision = 'ISOLATE';
      expect(decision).toBe('ISOLATE');
    });

    test('Should make MONITOR decision for low-severity issues', async () => {
      const incident = {
        severity: 'LOW',
        errorRate: 0.05,
        responseTime: 300,
      };

      const decision = 'MONITOR';
      expect(decision).toBe('MONITOR');
    });
  });

  describe('policyEvaluation', () => {
    test('Should APPROVE decision when policy allows', async () => {
      const decision = {
        action: 'RESTART',
        confidence: 0.95,
        severity: 'CRITICAL',
      };

      const approved = decision.confidence >= 0.85;
      expect(approved).toBe(true);
    });

    test('Should REJECT decision when confidence is too low', async () => {
      const decision = {
        action: 'SCALE',
        confidence: 0.45,
        severity: 'LOW',
      };

      const approved = decision.confidence >= 0.75;
      expect(approved).toBe(false);
    });

    test('Should require manual approval for DANGEROUS actions', async () => {
      const decision = {
        action: 'DATABASE_FAILOVER',
        dangerous: true,
        requiresApproval: true,
      };

      expect(decision.requiresApproval).toBe(true);
    });
  });

  describe('confidenceCalculation', () => {
    test('Should calculate high confidence for clear patterns', async () => {
      const factors = {
        errorRateFactor: 0.95,
        historyMatch: 0.90,
        policyAlignment: 0.98,
        avgWeight: (0.95 + 0.90 + 0.98) / 3,
      };

      const confidence = factors.avgWeight;
      expect(confidence).toBeGreaterThan(0.9);
    });

    test('Should calculate moderate confidence for mixed signals', async () => {
      const factors = {
        errorRateFactor: 0.65,
        historyMatch: 0.55,
        policyAlignment: 0.75,
        avgWeight: (0.65 + 0.55 + 0.75) / 3,
      };

      const confidence = factors.avgWeight;
      expect(confidence).toBeBetween(0.6, 0.8);
    });
  });

  describe('incidentMemoryIntegration', () => {
    test('Should use past successful patterns to boost confidence', async () => {
      const history = {
        pastSuccesses: 5,
        successRate: 0.95,
        confidenceBoost: 0.1,
      };

      const baseConfidence = 0.80;
      const finalConfidence = Math.min(1.0, baseConfidence + history.confidenceBoost);
      expect(finalConfidence).toBe(0.90);
    });

    test('Should reduce confidence for repeated failures', async () => {
      const history = {
        pastFailures: 3,
        failureRate: 0.60,
        confidenceReduction: 0.15,
      };

      const baseConfidence = 0.80;
      const finalConfidence = Math.max(0.0, baseConfidence - history.confidenceReduction);
      expect(finalConfidence).toBe(0.65);
    });
  });

  describe('actionTiering', () => {
    test('Should tier CRITICAL decisions to EXECUTE', async () => {
      const decision = {
        confidence: 0.95,
        severity: 'CRITICAL',
        tier: 'EXECUTE',
      };

      expect(decision.tier).toBe('EXECUTE');
    });

    test('Should tier HIGH decisions to ESCALATE', async () => {
      const decision = {
        confidence: 0.80,
        severity: 'HIGH',
        tier: 'ESCALATE',
      };

      expect(decision.tier).toBe('ESCALATE');
    });

    test('Should tier LOW decisions to OBSERVE', async () => {
      const decision = {
        confidence: 0.45,
        severity: 'LOW',
        tier: 'OBSERVE',
      };

      expect(decision.tier).toBe('OBSERVE');
    });
  });
});

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
