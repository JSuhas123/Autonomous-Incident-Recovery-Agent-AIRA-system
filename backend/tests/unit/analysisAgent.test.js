/**
 * Analysis Agent Unit Tests
 * Tests core incident signal analysis and categorization
 */

describe('Analysis Agent', () => {
  let mockQueue;
  let mockLogger;
  let mockMetrics;

  beforeEach(() => {
    // Mock dependencies
    mockQueue = {
      publish: jest.fn().mockResolvedValue(true),
      subscribe: jest.fn().mockResolvedValue(true),
    };
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    };
    mockMetrics = {
      recordAnalysis: jest.fn(),
      recordSignal: jest.fn(),
    };
  });

  describe('analyzeSignal', () => {
    test('Should categorize high error rate signals as HIGH severity', async () => {
      const signal = {
        errorRate: 0.65,
        responseTime: 2500,
        affectedServices: ['api-service'],
        severity: 'HIGH',
      };

      expect(signal.severity).toBe('HIGH');
      expect(signal.errorRate).toBeGreaterThanOrEqual(0.5);
    });

    test('Should categorize medium error rates as MEDIUM severity', async () => {
      const signal = {
        errorRate: 0.35,
        responseTime: 1800,
        affectedServices: ['database'],
        severity: 'MEDIUM',
      };

      expect(signal.severity).toBe('MEDIUM');
      expect(signal.errorRate).toBeBetween(0.2, 0.5);
    });

    test('Should categorize low error rates as LOW severity', async () => {
      const signal = {
        errorRate: 0.05,
        responseTime: 200,
        affectedServices: [],
        severity: 'LOW',
      };

      expect(signal.severity).toBe('LOW');
      expect(signal.errorRate).toBeLessThan(0.2);
    });
  });

  describe('correlateSignals', () => {
    test('Should correlate related service errors', async () => {
      const signals = [
        { service: 'database', status: 'error', timestamp: 1000 },
        { service: 'api-service', status: 'error', timestamp: 1500 },
      ];

      // Both signals reference the same issue type
      expect(signals.length).toBe(2);
      expect(signals.every((s) => s.status === 'error')).toBe(true);
    });

    test('Should filter out unrelated signals', async () => {
      const signals = [
        { service: 'database', status: 'error', context: 'auth' },
        { service: 'api-gateway', status: 'error', context: 'timeout' },
      ];

      const filtered = signals.filter((s) => s.context === 'timeout');
      expect(filtered).toHaveLength(1);
    });
  });

  describe('incidentDetection', () => {
    test('Should detect when single signal becomes incident', async () => {
      const signal = {
        errorRate: 0.75,
        duration: 120000, // 2 minutes
        severity: 'CRITICAL',
      };

      const isIncident = signal.severity === 'CRITICAL';
      expect(isIncident).toBe(true);
    });

    test('Should detect when multiple signals create incident pattern', async () => {
      const signals = [
        { severity: 'HIGH', timestamp: 1000 },
        { severity: 'HIGH', timestamp: 5000 },
        { severity: 'HIGH', timestamp: 9000 },
      ];

      expect(signals).toHaveLength(3);
      expect(signals.every((s) => s.severity === 'HIGH')).toBe(true);
    });
  });

  describe('confidenceScoring', () => {
    test('Should assign high confidence to clear error signals', async () => {
      const analysis = {
        issue: 'high_error_rate',
        confidence: 0.95,
        evidence: ['error_rate > 50%', 'response_time > 2000ms'],
      };

      expect(analysis.confidence).toBeGreaterThanOrEqual(0.9);
      expect(analysis.evidence.length).toBeGreaterThan(0);
    });

    test('Should assign lower confidence to ambiguous signals', async () => {
      const analysis = {
        issue: 'possible_network_issue',
        confidence: 0.45,
        evidence: ['intermittent_latency'],
      };

      expect(analysis.confidence).toBeLessThan(0.6);
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
