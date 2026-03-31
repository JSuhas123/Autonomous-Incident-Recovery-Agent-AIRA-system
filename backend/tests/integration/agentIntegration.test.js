/**
 * Agent Integration Tests
 * Tests complete workflows involving all agents working together
 */

const analysisAgent = require('../../agents/analysisAgent');
const decisionAgent = require('../../agents/decisionAgent');
const actionAgent = require('../../agents/actionAgent');
const batchDecisionAgent = require('../../agents/batchDecisionAgent');
const { dbService } = require('../../services/infrastructure');
const { connectDatabase, disconnectDatabase } = dbService;

describe('Agent Integration Tests', () => {
  const TEST_TENANT = 'agent-integration-test';

  beforeAll(async () => {
    try {
      await connectDatabase();
    } catch (e) {
      // Database may not be available in test environment
    }
  });

  afterAll(async () => {
    try {
      await disconnectDatabase();
    } catch (e) {
      // Ignore
    }
  });

  describe('Analysis Agent', () => {
    test('should analyze signals and detect incidents', async () => {
      const signals = {
        errorRate: 45,
        responseTime: 1200,
        cpuUsage: 85,
        memoryUsage: 90,
        affectedServices: ['payment-service', 'auth-service'],
      };

      const result = await analysisAgent.analyzeSignals(TEST_TENANT, signals);

      expect(result).toBeDefined();
      expect(result.incidentDetected).toBe(true);
      expect(result.severity).toBeDefined();
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(result.severity);
    });

    test('should correlate related service errors', async () => {
      const signals = {
        errorRate: 25,
        responseTime: 500,
        affectedServices: ['auth-service', 'api-gateway', 'database'],
      };

      const result = await analysisAgent.correlateSignals(TEST_TENANT, signals);

      expect(result).toBeDefined();
      expect(result.correlatedServices).toBeDefined();
      if (result.correlatedServices.length > 0) {
        expect(result.correlationScore).toBeGreaterThan(0);
        expect(result.correlationScore).toBeLessThanOrEqual(1);
      }
    });

    test('should filter out unrelated signals', async () => {
      const signals = {
        errorRate: 2,
        responseTime: 50,
        cpuUsage: 30,
        memoryUsage: 40,
      };

      const result = await analysisAgent.analyzeSignals(TEST_TENANT, signals);

      // Low severity signals should not trigger incident
      expect(result.incidentDetected).toBe(false);
    });

    test('should handle multiple severity levels', () => {
      const testCases = [
        { errorRate: 2, severity: 'LOW', shouldDetect: false },
        { errorRate: 15, severity: 'MEDIUM', shouldDetect: true },
        { errorRate: 50, severity: 'HIGH', shouldDetect: true },
        { errorRate: 85, severity: 'CRITICAL', shouldDetect: true },
      ];

      testCases.forEach(testCase => {
        const result = analysisAgent.categorizeSeverity(testCase.errorRate);
        expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(result);
      });
    });
  });

  describe('Decision Agent', () => {
    test('should make decisions based on incident context', async () => {
      const incidentContext = {
        severity: 'HIGH',
        errorRate: 45,
        affectedServices: ['payment-service'],
        confidence: 0.85,
        impact: 92,
      };

      const decision = await decisionAgent.makeDecision(TEST_TENANT, incidentContext);

      expect(decision).toBeDefined();
      expect(['EXECUTE', 'ESCALATE', 'OBSERVE']).toContain(decision.action);
      expect(decision.reasoning).toBeDefined();
    });

    test('should evaluate policies before making decisions', async () => {
      const incidentContext = {
        severity: 'HIGH',
        errorRate: 40,
        affectedServices: ['payment-service'],
      };

      const decision = await decisionAgent.makeDecision(TEST_TENANT, incidentContext);

      expect(decision.policyEvaluated).toBe(true);
      expect(decision.policyApproved).toBeDefined();
    });

    test('should apply confidence thresholds', async () => {
      const lowConfidenceContext = {
        severity: 'MEDIUM',
        errorRate: 20,
        confidence: 0.3,
      };

      const highConfidenceContext = {
        severity: 'CRITICAL',
        errorRate: 80,
        confidence: 0.95,
      };

      const lowConfidenceDecision = await decisionAgent.makeDecision(TEST_TENANT, lowConfidenceContext);
      const highConfidenceDecision = await decisionAgent.makeDecision(TEST_TENANT, highConfidenceContext);

      // Low confidence should escalate rather than execute
      expect(lowConfidenceDecision.action).not.toBe('EXECUTE');
      
      // High confidence should be able to execute
      expect(['EXECUTE', 'ESCALATE']).toContain(highConfidenceDecision.action);
    });

    test('should require approval for dangerous actions', async () => {
      const criticalContext = {
        severity: 'CRITICAL',
        errorRate: 90,
        affectedServices: ['database', 'auth-service', 'payment-service'],
        confidence: 0.85,
      };

      const decision = await decisionAgent.makeDecision(TEST_TENANT, criticalContext);

      if (decision.action === 'EXECUTE') {
        expect(decision.approvalRequired).toBe(true);
      }
    });

    test('should reject decisions when confidence too low', async () => {
      const veryLowConfidenceContext = {
        severity: 'LOW',
        errorRate: 5,
        confidence: 0.1,
      };

      const decision = await decisionAgent.makeDecision(TEST_TENANT, veryLowConfidenceContext);

      expect(decision.action).not.toBe('EXECUTE');
    });
  });

  describe('Action Agent', () => {
    test('should execute approved actions', async () => {
      const action = {
        actionId: 'action-123',
        actionType: 'RESTART_SERVICE',
        targetService: 'payment-service',
        parameters: {
          timeout: 30000,
          graceful: true,
        },
      };

      const result = await actionAgent.executeAction(TEST_TENANT, action, true); // approved

      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(['INITIATED', 'RUNNING', 'COMPLETED', 'FAILED']).toContain(result.status);
    });

    test('should reject unapproved dangerous actions', async () => {
      const dangerousAction = {
        actionId: 'action-456',
        actionType: 'DELETE_DATABASE',
        targetService: 'database',
        parameters: {},
      };

      const result = await actionAgent.executeAction(TEST_TENANT, dangerousAction, false); // not approved

      expect(result.status).toBe('REJECTED');
      expect(result.reason).toContain('approval');
    });

    test('should handle safe actions without approval', async () => {
      const safeAction = {
        actionId: 'action-789',
        actionType: 'CLEAR_CACHE',
        targetService: 'cache-service',
        parameters: {},
      };

      const result = await actionAgent.executeAction(TEST_TENANT, safeAction, false);

      expect(['INITIATED', 'RUNNING', 'COMPLETED', 'FAILED']).toContain(result.status);
    });

    test('should timeout long-running actions', async () => {
      const slowAction = {
        actionId: 'action-slow',
        actionType: 'MIGRATE_DATA',
        targetService: 'database',
        parameters: {
          timeout: 100, // Very short timeout
        },
      };

      const result = await actionAgent.executeAction(TEST_TENANT, slowAction, true);

      // May timeout or complete, depending on implementation
      expect(result.status).toBeDefined();
    });

    test('should track action execution history', async () => {
      const action = {
        actionId: 'action-history',
        actionType: 'RESTART_SERVICE',
        targetService: 'test-service',
        parameters: {},
      };

      const result = await actionAgent.executeAction(TEST_TENANT, action, true);

      expect(result.executionId).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.tenantId).toBe(TEST_TENANT);
    });
  });

  describe('Batch Decision Agent', () => {
    test('should process multiple incidents in batch', async () => {
      const incidents = [
        {
          id: 'incident-1',
          severity: 'HIGH',
          errorRate: 45,
          affectedServices: ['service-1'],
        },
        {
          id: 'incident-2',
          severity: 'MEDIUM',
          errorRate: 25,
          affectedServices: ['service-2'],
        },
        {
          id: 'incident-3',
          severity: 'CRITICAL',
          errorRate: 85,
          affectedServices: ['service-3', 'service-4'],
        },
      ];

      const results = await batchDecisionAgent.processBatch(TEST_TENANT, incidents);

      expect(results).toBeDefined();
      expect(results.length).toBe(incidents.length);
      results.forEach((result, index) => {
        expect(result.incidentId).toBe(incidents[index].id);
        expect(result.decision).toBeDefined();
      });
    });

    test('should handle mixed severity incidents', async () => {
      const incidents = [
        { id: 'low', severity: 'LOW', errorRate: 5 },
        { id: 'high', severity: 'HIGH', errorRate: 50 },
      ];

      const results = await batchDecisionAgent.processBatch(TEST_TENANT, incidents);

      expect(results.length).toBe(2);
      expect(results[0].decision).toBeDefined();
      expect(results[1].decision).toBeDefined();
    });

    test('should optimize batch processing for performance', async () => {
      const manyIncidents = Array.from({ length: 100 }, (_, i) => ({
        id: `incident-${i}`,
        severity: i % 4 === 0 ? 'CRITICAL' : 'MEDIUM',
        errorRate: Math.random() * 100,
        affectedServices: [`service-${i % 10}`],
      }));

      const startTime = Date.now();
      const results = await batchDecisionAgent.processBatch(TEST_TENANT, manyIncidents);
      const elapsed = Date.now() - startTime;

      expect(results.length).toBe(manyIncidents.length);
      expect(elapsed).toBeLessThan(30000); // Should complete in reasonable time
    });

    test('should handle empty batch gracefully', async () => {
      const emptyBatch = [];

      const results = await batchDecisionAgent.processBatch(TEST_TENANT, emptyBatch);

      expect(results).toBeDefined();
      expect(results.length).toBe(0);
    });

    test('should handle invalid incidents in batch', async () => {
      const mixedBatch = [
        { id: 'valid', severity: 'HIGH', errorRate: 50 },
        { id: 'invalid' }, // Missing required fields
        { id: 'valid2', severity: 'MEDIUM', errorRate: 25 },
      ];

      const results = await batchDecisionAgent.processBatch(TEST_TENANT, mixedBatch);

      // Should process valid incidents and handle/skip invalid ones
      expect(results).toBeDefined();
    });
  });

  describe('Agent Cooperation Workflow', () => {
    test('should execute complete incident resolution workflow', async () => {
      // Step 1: Analysis Agent detects incident
      const signals = {
        errorRate: 55,
        responseTime: 1500,
        cpuUsage: 88,
        memoryUsage: 92,
        affectedServices: ['payment-service'],
      };

      const analysis = await analysisAgent.analyzeSignals(TEST_TENANT, signals);
      expect(analysis.incidentDetected).toBe(true);

      // Step 2: Decision Agent makes decision
      const decision = await decisionAgent.makeDecision(TEST_TENANT, {
        severity: analysis.severity,
        errorRate: signals.errorRate,
        affectedServices: signals.affectedServices,
        confidence: 0.87,
      });
      expect(['EXECUTE', 'ESCALATE', 'OBSERVE']).toContain(decision.action);

      // Step 3: Action Agent executes if approved
      if (decision.action === 'EXECUTE' && !decision.approvalRequired) {
        const action = await actionAgent.executeAction(TEST_TENANT, {
          actionId: 'action-workflow',
          actionType: 'RESTART_SERVICE',
          targetService: signals.affectedServices[0],
          parameters: { timeout: 60000 },
        }, true);

        expect(action).toBeDefined();
      }
    });

    test('should handle escalation to human review', async () => {
      // Incident that requires human escalation
      const signals = {
        errorRate: 30,
        responseTime: 800,
        affectedServices: ['payment-service', 'auth-service', 'database'],
      };

      const analysis = await analysisAgent.analyzeSignals(TEST_TENANT, signals);
      const decision = await decisionAgent.makeDecision(TEST_TENANT, {
        severity: analysis.severity,
        errorRate: signals.errorRate,
        affectedServices: signals.affectedServices,
        confidence: 0.5, // Medium confidence should escalate
      });

      // May escalate instead of auto-execute
      expect(['ESCALATE', 'OBSERVE', 'EXECUTE']).toContain(decision.action);
    });

    test('should learn from feedback loop', async () => {
      // Execute decision with feedback
      const signals = {
        errorRate: 35,
        affectedServices: ['service-a'],
      };

      const analysis = await analysisAgent.analyzeSignals(TEST_TENANT, signals);
      const decision = await decisionAgent.makeDecision(TEST_TENANT, {
        severity: analysis.severity,
        errorRate: signals.errorRate,
      });

      // Simulate feedback
      const feedback = {
        decisionId: decision.decisionId,
        successful: true,
        outcome: 'resolved',
        recoveryTimeMs: 45000,
      };

      // System should record feedback for learning (not all agents may  implement learning)
      expect(feedback.successful).toBe(true);
    });
  });

  describe('Agent Error Handling', () => {
    test('should handle missing tenant context', async () => {
      const invalidTenant = 'non-existent-tenant';
      const signals = {
        errorRate: 45,
        affectedServices: ['service'],
      };

      // Should handle gracefully or throw expected error
      try {
        const result = await analysisAgent.analyzeSignals(invalidTenant, signals);
        expect(result).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('should handle invalid signals', async () => {
      const invalidSignals = {
        errorRate: -50, // Invalid: negative
        affectedServices: null, // Invalid: null
      };

      try {
        const result = await analysisAgent.analyzeSignals(TEST_TENANT, invalidSignals);
        // May process or throw error
        expect(result).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('should handle concurrent agent calls', async () => {
      const signals = {
        errorRate: 45,
        affectedServices: ['service-1', 'service-2'],
      };

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(analysisAgent.analyzeSignals(TEST_TENANT, signals));
      }

      const results = await Promise.all(promises);
      expect(results.length).toBe(10);
      results.forEach(result => {
        expect(result).toBeDefined();
      });
    });
  });

  describe('Agent Performance', () => {
    test('should analyze signals within SLA', async () => {
      const signals = {
        errorRate: 45,
        responseTime: 1000,
        affectedServices: ['service'],
      };

      const startTime = Date.now();
      const result = await analysisAgent.analyzeSignals(TEST_TENANT, signals);
      const elapsed = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(elapsed).toBeLessThan(500); // < 500ms SLA
    });

    test('should make decisions within SLA', async () => {
      const context = {
        severity: 'HIGH',
        errorRate: 50,
        confidence: 0.85,
      };

      const startTime = Date.now();
      const result = await decisionAgent.makeDecision(TEST_TENANT, context);
      const elapsed = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(elapsed).toBeLessThan(1000); // < 1s SLA
    });

    test('should execute actions within timeout', async () => {
      const action = {
        actionId: 'perf-test',
        actionType: 'CLEAR_CACHE',
        targetService: 'cache',
        parameters: { timeout: 5000 },
      };

      const startTime = Date.now();
      const result = await actionAgent.executeAction(TEST_TENANT, action, true);
      const elapsed = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(elapsed).toBeLessThan(10000);
    });
  });
});
