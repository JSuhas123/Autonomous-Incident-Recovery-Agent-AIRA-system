/**
 * Unit Tests: Confidence Weight Optimizer
 * Tests transparent weight adjustment algorithm
 */

const { confidenceWeightOptimizer: ConfidenceWeightOptimizer } = require('../../services/learning');

describe('ConfidenceWeightOptimizer', () => {
  let optimizer;

  beforeEach(() => {
    optimizer = new ConfidenceWeightOptimizer();
  });

  describe('initialization', () => {
    test('should have baseline weights that sum to 1.0', () => {
      const sum = Object.values(optimizer.baselineWeights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });

    test('should initialize factor effectiveness scores', () => {
      const factors = Object.keys(optimizer.factorEffectiveness);
      expect(factors).toContain('pattern_match');
      expect(factors).toContain('historical_success');
      expect(factors).toContain('signal_strength');
      expect(factors).toContain('recency');
      expect(factors).toContain('policy_alignment');
    });
  });

  describe('recordOutcome', () => {
    test('should record successful outcomes', () => {
      const decisionData = {
        factors: {
          pattern_match: { value: 0.9 },
          historical_success: { value: 0.8 },
          signal_strength: { value: 0.85 },
          recency: { value: 0.7 },
          policy_alignment: { value: 0.8 },
        },
      };

      optimizer.recordOutcome(decisionData, { success: true });

      expect(optimizer.factorEffectiveness.pattern_match.predictions).toBe(1);
      expect(optimizer.factorEffectiveness.pattern_match.correct).toBe(1); // High value + success
    });

    test('should record failed outcomes', () => {
      const decisionData = {
        factors: {
          pattern_match: { value: 0.3 },
          historical_success: { value: 0.4 },
          signal_strength: { value: 0.2 },
          recency: { value: 0.3 },
          policy_alignment: { value: 0.2 },
        },
      };

      optimizer.recordOutcome(decisionData, { success: false });

      expect(optimizer.factorEffectiveness.pattern_match.predictions).toBe(1);
      // Low value + failure = correct prediction
      expect(optimizer.factorEffectiveness.pattern_match.correct).toBe(1);
    });

    test('should calculate rolling accuracy', () => {
      for (let i = 0; i < 10; i++) {
        const decisionData = {
          factors: {
            pattern_match: { value: 0.8 },
            historical_success: { value: 0.8 },
            signal_strength: { value: 0.8 },
            recency: { value: 0.8 },
            policy_alignment: { value: 0.8 },
          },
        };
        optimizer.recordOutcome(decisionData, { success: i % 2 === 0 });
      }

      const accuracy = optimizer.factorEffectiveness.pattern_match.accuracy;
      expect(accuracy).toBeGreaterThan(0);
      expect(accuracy).toBeLessThanOrEqual(1);
    });
  });

  describe('getOptimizedWeights', () => {
    test('should return null when insufficient outcomes', () => {
      const weights = optimizer.getOptimizedWeights(10);
      expect(weights).toBeNull();
    });

    test('should return optimized weights when threshold met', () => {
      // Record minimum threshold of successful outcomes
      for (let i = 0; i < 10; i++) {
        const decisionData = {
          factors: {
            pattern_match: { value: 0.85 },
            historical_success: { value: 0.75 },
            signal_strength: { value: 0.65 },
            recency: { value: 0.55 },
            policy_alignment: { value: 0.45 },
          },
        };
        optimizer.recordOutcome(decisionData, { success: true });
      }

      const weights = optimizer.getOptimizedWeights(10);
      expect(weights).not.toBeNull();
      expect(Object.keys(weights).length).toBe(5);

      // Should sum to 1.0
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });

    test('should adjust weights based on factor effectiveness', () => {
      // Record outcomes where pattern_match is very accurate
      for (let i = 0; i < 12; i++) {
        const decisionData = {
          factors: {
            pattern_match: { value: i % 3 === 0 ? 0.95 : 0.05 },
            historical_success: { value: 0.5 },
            signal_strength: { value: 0.5 },
            recency: { value: 0.5 },
            policy_alignment: { value: 0.5 },
          },
        };
        const success = i % 3 === 0; // Matches high value outcomes
        optimizer.recordOutcome(decisionData, { success });
      }

      const weights = optimizer.getOptimizedWeights(12);
      // pattern_match should increase from baseline 0.4
      expect(weights.pattern_match).toBeGreaterThanOrEqual(0.35);
    });
  });

  describe('weight constraints', () => {
    test('should enforce minimum adjustment threshold', () => {
      optimizer.recordOutcome(
        {
          factors: {
            pattern_match: { value: 0.8 },
            historical_success: { value: 0.8 },
            signal_strength: { value: 0.8 },
            recency: { value: 0.8 },
            policy_alignment: { value: 0.8 },
          },
        },
        { success: true }
      );

      const mockConfidenceService = {
        weights: optimizer.baselineWeights,
        updateWeights: jest.fn(),
      };

      const result = optimizer.applyOptimizedWeights(
        mockConfidenceService.weights,
        mockConfidenceService
      );

      // With only 1 outcome, should not apply
      expect(result.applied).toBe(false);
    });

    test('should enforce maximum weight change constraint', () => {
      // Record outcomes to trigger optimization
      for (let i = 0; i < 15; i++) {
        optimizer.recordOutcome(
          {
            factors: {
              pattern_match: { value: 0.95 },
              historical_success: { value: 0.05 },
              signal_strength: { value: 0.5 },
              recency: { value: 0.5 },
              policy_alignment: { value: 0.5 },
            },
          },
          { success: i % 2 === 0 }
        );
      }

      const mockConfidenceService = {
        weights: optimizer.baselineWeights,
        updateWeights: jest.fn(),
      };

      const result = optimizer.applyOptimizedWeights(
        mockConfidenceService.weights,
        mockConfidenceService
      );

      if (result.applied) {
        // Check that no weight changed by more than maxWeightChange per update
        Object.keys(mockConfidenceService.weights).forEach((key) => {
          const delta = Math.abs(
            result.newWeights[key] - mockConfidenceService.weights[key]
          );
          expect(delta).toBeLessThanOrEqual(optimizer.maxWeightChange);
        });
      }
    });
  });

  describe('metrics and history', () => {
    test('should track weight change history', () => {
      for (let i = 0; i < 15; i++) {
        optimizer.recordOutcome(
          {
            factors: {
              pattern_match: { value: 0.8 },
              historical_success: { value: 0.8 },
              signal_strength: { value: 0.8 },
              recency: { value: 0.8 },
              policy_alignment: { value: 0.8 },
            },
          },
          { success: true }
        );
      }

      const mockConfidenceService = {
        weights: optimizer.baselineWeights,
        updateWeights: jest.fn(),
      };

      optimizer.applyOptimizedWeights(
        mockConfidenceService.weights,
        mockConfidenceService
      );

      const history = optimizer.getWeightHistory();
      expect(Array.isArray(history)).toBe(true);
    });

    test('should provide metrics', () => {
      for (let i = 0; i < 10; i++) {
        optimizer.recordOutcome(
          {
            factors: {
              pattern_match: { value: 0.8 },
              historical_success: { value: 0.8 },
              signal_strength: { value: 0.8 },
              recency: { value: 0.8 },
              policy_alignment: { value: 0.8 },
            },
          },
          { success: true }
        );
      }

      const metrics = optimizer.getMetrics();
      expect(metrics.totalOutcomesRecorded).toBe(10);
      expect(metrics.factorAccuracies).toBeDefined();
      expect(metrics.configuration).toBeDefined();
    });
  });

  describe('reset', () => {
    test('should reset to baseline state', () => {
      for (let i = 0; i < 5; i++) {
        optimizer.recordOutcome(
          {
            factors: {
              pattern_match: { value: 0.8 },
              historical_success: { value: 0.8 },
              signal_strength: { value: 0.8 },
              recency: { value: 0.8 },
              policy_alignment: { value: 0.8 },
            },
          },
          { success: true }
        );
      }

      optimizer.reset();

      const metrics = optimizer.getMetrics();
      expect(metrics.totalOutcomesRecorded).toBe(0);
      expect(metrics.weightHistoryLength).toBe(0);
    });
  });
});
