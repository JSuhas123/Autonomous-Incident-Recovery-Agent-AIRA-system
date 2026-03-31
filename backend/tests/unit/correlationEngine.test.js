/**
 * Unit Tests: Incident Correlation Engine
 * Tests graph-based multi-signal pattern detection
 */

const { correlationEngine: IncidentCorrelationEngine } = require('../../services/infrastructure');

describe('IncidentCorrelationEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new IncidentCorrelationEngine();
  });

  describe('service graph management', () => {
    test('should add services to graph', () => {
      engine.addService('api-service', 'API Service', 'critical');
      expect(engine.serviceGraph.has('api-service')).toBe(true);

      const service = engine.serviceGraph.get('api-service');
      expect(service.name).toBe('API Service');
      expect(service.criticality).toBe('critical');
    });

    test('should add dependencies between services', () => {
      engine.addDependency('api-service', 'database-service', 'sync', 100);
      engine.addDependency('api-service', 'cache-service', 'async', 50);

      const apiService = engine.serviceGraph.get('api-service');
      expect(apiService.dependencies.length).toBe(2);
      expect(apiService.dependencies[0].targetId).toBe('database-service');
    });

    test('should not add duplicate dependencies', () => {
      engine.addDependency('api-service', 'database-service', 'sync', 100);
      engine.addDependency('api-service', 'database-service', 'sync', 100);

      const apiService = engine.serviceGraph.get('api-service');
      expect(apiService.dependencies.length).toBe(1);
    });
  });

  describe('signal recording', () => {
    test('should record signals for services', () => {
      engine.recordSignal(
        'tenant-1',
        { type: 'high-latency', severity: 'HIGH' },
        'api-service'
      );

      const service = engine.serviceGraph.get('api-service');
      expect(service.signals.length).toBe(1);
      expect(service.signals[0].type).toBe('high-latency');
      expect(service.signals[0].frequency).toBe(1);
    });

    test('should aggregate repeated signals', () => {
      engine.recordSignal(
        'tenant-1',
        { type: 'high-error-rate', severity: 'HIGH' },
        'api-service'
      );
      engine.recordSignal(
        'tenant-1',
        { type: 'high-error-rate', severity: 'HIGH' },
        'api-service'
      );

      const service = engine.serviceGraph.get('api-service');
      expect(service.signals.length).toBe(1);
      expect(service.signals[0].frequency).toBe(2);
    });

    test('should track failure history', () => {
      engine.recordSignal(
        'tenant-1',
        { type: 'timeout', severity: 'MEDIUM' },
        'database-service',
        { details: 'connection timeout' }
      );

      const service = engine.serviceGraph.get('database-service');
      expect(service.failureHistory.length).toBe(1);
      expect(service.failureHistory[0].signal).toBe('timeout');
    });
  });

  describe('multi-signal incidents', () => {
    test('should record multi-signal incident', () => {
      const signals = [
        { type: 'high-latency', severity: 'HIGH', serviceId: 'api-service' },
        { type: 'high-error-rate', severity: 'HIGH', serviceId: 'api-service' },
        { type: 'cpu-spike', severity: 'MEDIUM', serviceId: 'database-service' },
      ];

      engine.recordMultiSignalIncident('tenant-1', signals, [
        'api-service',
        'database-service',
      ]);

      expect(engine.serviceGraph.size).toBe(2);
      expect(engine.discoveredPatterns.length).toBeGreaterThan(0);
    });

    test('should detect repeating patterns', () => {
      // Record same pattern 3 times
      for (let i = 0; i < 3; i++) {
        const signals = [
          { type: 'high-latency', severity: 'HIGH', serviceId: 'api-service' },
          { type: 'error-rate', severity: 'HIGH', serviceId: 'api-service' },
        ];

        engine.recordMultiSignalIncident('tenant-1', signals, ['api-service']);
      }

      const patterns = engine.getDiscoveredPatterns(2);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].frequency).toBeGreaterThanOrEqual(2);
    });
  });

  describe('signal correlation', () => {
    test('should calculate signal correlations', () => {
      const signals = [
        { type: 'latency', severity: 'HIGH' },
        { type: 'error-rate', severity: 'HIGH' },
      ];

      for (let i = 0; i < 5; i++) {
        engine.recordMultiSignalIncident('tenant-1', signals, ['service-1']);
      }

      const correlations = engine.getSignalCorrelations(0.5);
      expect(correlations.length).toBeGreaterThan(0);
      expect(parseFloat(correlations[0].coOccurrenceRate)).toBeGreaterThanOrEqual(0.5);
    });

    test('should filter correlations by threshold', () => {
      // Record highly correlated signals
      for (let i = 0; i < 10; i++) {
        const signals = [
          { type: 'signal-a', severity: 'HIGH' },
          { type: 'signal-b', severity: 'HIGH' },
        ];
        engine.recordMultiSignalIncident('tenant-1', signals, ['service-1']);
      }

      // Record weakly correlated signals
      for (let i = 0; i < 2; i++) {
        const signals = [
          { type: 'signal-a', severity: 'HIGH' },
          { type: 'signal-c', severity: 'LOW' },
        ];
        engine.recordMultiSignalIncident('tenant-1', signals, ['service-1']);
      }

      const highCorrelations = engine.getSignalCorrelations(0.8);
      const allCorrelations = engine.getSignalCorrelations(0.1);

      expect(highCorrelations.length).toBeLessThanOrEqual(allCorrelations.length);
    });
  });

  describe('root cause analysis', () => {
    test('should identify root cause candidates', () => {
      // Setup: api-service depends on database-service
      engine.addDependency('api-service', 'database-service');

      // Database fails, causing failures in both
      engine.recordSignal(
        'tenant-1',
        { type: 'database-timeout', severity: 'CRITICAL' },
        'database-service'
      );
      engine.recordSignal(
        'tenant-1',
        { type: 'connection-error', severity: 'HIGH' },
        'api-service'
      );

      const candidates = engine.findRootCauseCandidates([
        'api-service',
        'database-service',
      ]);

      expect(candidates.length).toBeGreaterThan(0);
      // Database service should be higher-ranked as root cause
      const databaseCandidate = candidates.find((c) => c.serviceId === 'database-service');
      expect(databaseCandidate).toBeDefined();
    });

    test('should score root cause candidates', () => {
      engine.addDependency('api-service', 'cache-service');

      // Introduce failure patterns
      for (let i = 0; i < 5; i++) {
        engine.recordSignal(
          'tenant-1',
          { type: 'cache-miss', severity: 'HIGH' },
          'cache-service'
        );
      }

      const candidates = engine.findRootCauseCandidates(['api-service', 'cache-service']);

      expect(candidates[0].score).toBeDefined();
      expect(parseFloat(candidates[0].score)).toBeGreaterThan(0);
    });
  });

  describe('cascade prediction', () => {
    test('should predict cascade impact', () => {
      // Setup dependency chain
      engine.addDependency('api-gateway', 'api-service');
      engine.addDependency('api-service', 'database-service');
      engine.addDependency('api-service', 'cache-service');

      const cascade = engine.predictCascadeImpact('api-service');

      expect(cascade.rootService).toBe('api-service');
      expect(cascade.affectedServices.length).toBeGreaterThanOrEqual(1);
      expect(cascade.cascadeDepth).toBeGreaterThanOrEqual(0);
    });

    test('should prevent infinite cascade loops', () => {
      // Create circular dependency
      engine.addDependency('service-a', 'service-b');
      engine.addDependency('service-b', 'service-c');
      engine.addDependency('service-c', 'service-a');

      const cascade = engine.predictCascadeImpact('service-a');

      // Should not hang, should return result
      expect(cascade).toBeDefined();
      expect(cascade.cascadeDepth).toBeLessThan(10);
    });
  });

  describe('graph export', () => {
    test('should export service graph', () => {
      engine.addService('api', 'API Service', 'critical');
      engine.addService('db', 'Database', 'high');
      engine.addDependency('api', 'db');

      const graph = engine.getServiceGraph();

      expect(graph.nodes.length).toBe(2);
      expect(graph.edges.length).toBe(1);
      expect(graph.serviceCount).toBe(2);
      expect(graph.dependencyCount).toBe(1);
    });
  });

  describe('metrics', () => {
    test('should provide engine metrics', () => {
      engine.addService('service-1', 'Service 1', 'medium');
      engine.addService('service-2', 'Service 2', 'medium');

      for (let i = 0; i < 3; i++) {
        engine.recordMultiSignalIncident(
          'tenant-1',
          [
            { type: 'signal-a', severity: 'HIGH' },
            { type: 'signal-b', severity: 'HIGH' },
          ],
          ['service-1', 'service-2']
        );
      }

      const metrics = engine.getMetrics();

      expect(metrics.servicesTracked).toBeGreaterThanOrEqual(2);
      expect(metrics.patternsDiscovered).toBeGreaterThanOrEqual(0);
      expect(metrics.signalCorrelationPairs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('reset', () => {
    test('should reset engine state', () => {
      engine.addService('service-1', 'Service 1');
      engine.recordSignal(
        'tenant-1',
        { type: 'error', severity: 'HIGH' },
        'service-1'
      );

      engine.reset();

      expect(engine.serviceGraph.size).toBe(0);
      expect(engine.discoveredPatterns.length).toBe(0);
      expect(engine.signalCorrelation.size).toBe(0);
    });
  });
});
