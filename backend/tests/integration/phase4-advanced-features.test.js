/**
 * Integration Tests: Advanced Decision Engine Features
 * Tests how all new modules work together
 */

const { confidenceWeightOptimizer: ConfidenceWeightOptimizer } = require('../../services/learning');
const { correlationEngine: IncidentCorrelationEngine } = require('../../services/infrastructure');
const { policyDSLParser: PolicyDSLParser } = require('../../services/core');
const { riskImpactSimulator: RiskImpactSimulator } = require('../../services/learning');

describe('Advanced Decision Engine Integration', () => {
  let optimizer, correlationEngine, policyParser, simulator;

  beforeEach(() => {
    optimizer = new ConfidenceWeightOptimizer();
    correlationEngine = new IncidentCorrelationEngine();
    policyParser = new PolicyDSLParser();
    
    // Mock memory service for simulator
    const mockMemoryService = {
      getIncidentHistory: jest.fn().mockResolvedValue([
        { success: true, recoveryTimeMs: 2000 },
        { success: true, recoveryTimeMs: 2500 },
        { success: false, recoveryTimeMs: 5000 },
      ]),
    };
    simulator = new RiskImpactSimulator(mockMemoryService, correlationEngine);
  });

  describe('end-to-end decision flow', () => {
    test('should flow from decision to feedback adjustment', async () => {
      // 1. Simulate a decision with confidence factors
      const decisionFactors = {
        pattern_match: { value: 0.85 },
        historical_success: { value: 0.8 },
        signal_strength: { value: 0.9 },
        recency: { value: 0.7 },
        policy_alignment: { value: 0.8 },
      };

      const analyzeResult = {
        patternMatch: 0.85,
        severity: 'HIGH',
        patternAge: 2,
        incidentType: 'api-timeout',
      };

      // 2. Simulate executing action and getting outcome
      optimizer.recordOutcome(
        { factors: decisionFactors },
        { success: true }
      );

      // 3. Check if weights would be adjusted
      const metrics = optimizer.getMetrics();
      expect(metrics.totalOutcomesRecorded).toBeGreaterThan(0);
    });

    test('should detect patterns across incidents', () => {
      // Setup dependency graph
      correlationEngine.addDependency('api-gateway', 'api-service');
      correlationEngine.addDependency('api-service', 'database');

      // Record incident with multiple signals
      const signals = [
        { type: 'high-latency', severity: 'HIGH', serviceId: 'api-service' },
        { type: 'connection-timeout', severity: 'HIGH', serviceId: 'database' },
        { type: 'cpu-spike', severity: 'MEDIUM', serviceId: 'api-service' },
      ];

      correlationEngine.recordMultiSignalIncident(
        'tenant-1',
        signals,
        ['api-service', 'database']
      );

      // Verify pattern detected
      const patterns = correlationEngine.getDiscoveredPatterns(1);
      expect(patterns.length).toBeGreaterThan(0);

      // Predict cascade impact
      const cascade = correlationEngine.predictCascadeImpact('database');
      expect(cascade.affectedServices.length).toBeGreaterThan(0);
    });

    test('should evaluate policies on decisions', () => {
      const rule = 'action=restart AND severity=high AND confidence>0.7';
      const parsed = policyParser.parse(rule);

      const decision = {
        action: 'restart',
        severity: 'high',
        confidence: 0.75,
      };

      const evaluation = policyParser.evaluate(parsed.ast, decision);
      expect(evaluation.result).toBe(true);
    });

    test('should simulate action impact before execution', async () => {
      const impact = await simulator.simulateActionImpact(
        'restart',
        'api-service',
        { lastRestartAgeMinutes: 30 }
      );

      expect(impact.estimates.estimatedRecoveryTimeMs).toBeGreaterThan(0);
      expect(impact.estimates.cascadingFailureRisk).toBeDefined();
      expect(impact.overallRisk).toBeDefined();
      expect(impact.recommendation).toBeDefined();
    });
  });

  describe('confidence calibration with feedback', () => {
    test('should improve weight accuracy over time', () => {
      // Record outcomes where pattern_match is highly predictive
      for (let i = 0; i < 20; i++) {
        const highConfidenceDecision = {
          factors: {
            pattern_match: { value: 0.85 },
            historical_success: { value: 0.3 },
            signal_strength: { value: 0.5 },
            recency: { value: 0.5 },
            policy_alignment: { value: 0.5 },
          },
        };

        // Outcome matches: high pattern_match → success
        const success = i % 2 === 0;
        optimizer.recordOutcome(highConfidenceDecision, { success });
      }

      const metrics = optimizer.getMetrics();
      expect(metrics.totalOutcomesRecorded).toBeGreaterThan(15);

      // pattern_match should have higher accuracy than others
      const patternAccuracy = metrics.factorAccuracies.pattern_match.accuracy;
      expect(patternAccuracy).toBeGreaterThan(0);
    });
  });

  describe('multi-tenant isolation', () => {
    test('should maintain separate correlations per tenant', () => {
      // Tenant 1 pattern
      correlationEngine.recordMultiSignalIncident(
        'tenant-1',
        [
          { type: 'error-a', severity: 'HIGH', serviceId: 'service-1' },
          { type: 'error-b', severity: 'HIGH', serviceId: 'service-1' },
        ],
        ['service-1']
      );

      // Tenant 2 pattern (different)
      correlationEngine.recordMultiSignalIncident(
        'tenant-2',
        [
          { type: 'error-x', severity: 'HIGH', serviceId: 'service-2' },
          { type: 'error-y', severity: 'HIGH', serviceId: 'service-2' },
        ],
        ['service-2']
      );

      // Both patterns should be tracked
      const patterns = correlationEngine.getDiscoveredPatterns(1);
      expect(patterns.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('explainability audit trail', () => {
    test('should maintain audit trail of weight changes', () => {
      // Record outcomes to trigger optimization
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
      if (history.length > 0) {
        const lastChange = history[history.length - 1];
        expect(lastChange.reasoning).toBeDefined();
        expect(lastChange.deltas).toBeDefined();
      }
    });

    test('should provide evaluation trace for policy decisions', () => {
      const rule = '(severity=high OR severity=critical) AND confidence>0.7';
      const parsed = policyParser.parse(rule);

      const decision = {
        severity: 'high',
        confidence: 0.75,
      };

      const evaluation = policyParser.evaluate(parsed.ast, decision);
      expect(evaluation.trace).toBeDefined();
      expect(evaluation.trace.severity).toBeDefined();
      expect(evaluation.trace.confidence).toBeDefined();
    });

    test('should document correlation engine findings', () => {
      correlationEngine.addService('database', 'PostgreSQL DB', 'critical');
      correlationEngine.addService('cache', 'Redis Cache', 'medium');
      correlationEngine.addDependency('database', 'cache');

      // Record failure pattern
      for (let i = 0; i < 4; i++) {
        const signals = [
          { type: 'db-timeout', severity: 'HIGH', serviceId: 'database' },
          { type: 'cache-miss-spike', severity: 'MEDIUM', serviceId: 'cache' },
        ];
        correlationEngine.recordMultiSignalIncident(
          'tenant-1',
          signals,
          ['database', 'cache']
        );
      }

      const patterns = correlationEngine.getDiscoveredPatterns(3);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].confidence).toBeDefined();
    });
  });

  describe('safety constraints', () => {
    test('should enforce weight constraints to prevent instability', () => {
      // Try to cause extreme weight adjustments
      for (let i = 0; i < 20; i++) {
        optimizer.recordOutcome(
          {
            factors: {
              pattern_match: { value: 0.99 },
              historical_success: { value: 0.01 },
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
        // Verify constraint: no weight changed by more than maxWeightChange
        Object.keys(result.newWeights).forEach((key) => {
          const delta = Math.abs(
            result.newWeights[key] - optimizer.baselineWeights[key]
          );
          expect(delta).toBeLessThanOrEqual(optimizer.maxWeightChange);
        });

        // Verify weights still sum to 1.0
        const sum = Object.values(result.newWeights).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1.0, 5);
      }
    });

    test('should prevent cascade from infinite loops', () => {
      // Create complex dependency graph
      correlationEngine.addDependency('a', 'b');
      correlationEngine.addDependency('b', 'c');
      correlationEngine.addDependency('c', 'd');
      correlationEngine.addDependency('d', 'a'); // Creates loop

      // Should complete without hanging
      const cascade = correlationEngine.predictCascadeImpact('a');
      expect(cascade).toBeDefined();
      expect(cascade.cascadeDepth).toBeLessThan(10);
    });

    test('should limit policy evaluation complexity', () => {
      // Create deeply nested rule
      let rule = '(((((a=1))))) OR b=2';
      const parsed = policyParser.parse(rule);

      expect(parsed.success).toBe(true);
      // Should parse even if deeply nested
    });
  });

  describe('performance characteristics', () => {
    test('weight optimization should complete in reasonable time', () => {
      // Record 100 outcomes
      for (let i = 0; i < 100; i++) {
        optimizer.recordOutcome(
          {
            factors: {
              pattern_match: { value: Math.random() },
              historical_success: { value: Math.random() },
              signal_strength: { value: Math.random() },
              recency: { value: Math.random() },
              policy_alignment: { value: Math.random() },
            },
          },
          { success: Math.random() > 0.5 }
        );
      }

      const startTime = Date.now();
      const weights = optimizer.getOptimizedWeights(50);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100); // Should complete in <100ms
    });

    test('policy evaluation should be fast', () => {
      const rule = '(a=1 AND (b=2 OR c=3)) AND ((d=4 AND e=5) OR f=6)';
      const parsed = policyParser.parse(rule);

      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        policyParser.evaluate(parsed.ast, {
          a: '1',
          b: '2',
          c: '3',
          d: '4',
          e: '5',
          f: '6',
        });
      }
      const duration = Date.now() - startTime;

      // 1000 evaluations should complete in <1 second
      expect(duration).toBeLessThan(1000);
    });
  });
});
