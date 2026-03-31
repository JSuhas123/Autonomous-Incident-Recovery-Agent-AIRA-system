/**
 * CONSOLIDATED INTEGRATION TESTS
 * Merges Phase 1, Phase 2, and Phase 4 into a single comprehensive test suite
 * 
 * Coverage:
 * - Phase 1: Detection → Analysis → Decision → Action (Audit, Multi-tenant, Idempotency)
 * - Phase 2: Message Ordering, DLQ, Runbook Execution
 * - Phase 4: Advanced Decision Engine (Confidence, Correlation, Policy DSL, Risk Simulation)
 */

const mongoose = require('mongoose');
const { dbService: { connectDatabase, disconnectDatabase } } = require('../../services/infrastructure');
const TenantConfig = require('../../models/TenantConfig');
const PolicyDefinition = require('../../models/PolicyDefinition');
const { policyEngine: PolicyEngine } = require('../../services/core');
const { auditService: AuditService } = require('../../services/observability');
const { idempotencyService: IdempotencyService } = require('../../services/infrastructure');

const dlqService = require('../../services/infrastructure/dlqService');
const messageOrderingService = require('../../services/infrastructure/messageOrderingService');
const { runbookExecutionService } = require('../../services/execution');

const { confidenceWeightOptimizer: ConfidenceWeightOptimizer } = require('../../services/learning');
const { correlationEngine: IncidentCorrelationEngine } = require('../../services/infrastructure');
const { policyDSLParser: PolicyDSLParser } = require('../../services/core');
const { riskImpactSimulator: RiskImpactSimulator } = require('../../services/learning');

describe('Consolidated Integration Tests - All Phases', () => {
  const TEST_TENANT = 'test-tenant-consolidated';
  const API_KEY = 'test-api-key-consolidated';
  const SECRET_KEY = 'test-secret-consolidated';

  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Clean up test data before each describe block
    await TenantConfig.deleteMany({ tenantId: TEST_TENANT });
    await PolicyDefinition.deleteMany({ tenantId: TEST_TENANT });
  });

  afterEach(async () => {
    // Clean up after each describe block
    await TenantConfig.deleteMany({ tenantId: TEST_TENANT });
    await PolicyDefinition.deleteMany({ tenantId: TEST_TENANT });
  });

  describe('PHASE 1: Complete Incident Pipeline', () => {
    test('should detect incident → evaluate policy → record audit', async () => {
      // 1. Setup tenant
      let tenant = await TenantConfig.findOne({ tenantId: TEST_TENANT });
      if (!tenant) {
        tenant = new TenantConfig({
          tenantId: TEST_TENANT,
          name: 'Consolidated Integration Test',
          apiKeys: [
            {
              keyId: API_KEY,
              keyHash: 'hash-' + API_KEY,
              secretHash: 'secret-' + SECRET_KEY,
            }
          ],
          secretKey: SECRET_KEY,
        });
        await tenant.save();
      }

      // 2. Create policy
      const policy = new PolicyDefinition({
        tenantId: TEST_TENANT,
        version: 1,
        policyYaml: `rules:
  - name: high-error-rate-restart
    condition: error_rate > 5
    action: RESTART_SERVICE
    cooldown: 300`,
        policyJson: {
          rules: [
            {
              name: 'high-error-rate-restart',
              condition: 'error_rate > 5',
              action: 'RESTART_SERVICE',
              cooldown: 300
            }
          ]
        },
        status: 'active',
        enabled: true,
      });
      await policy.save();

      // 3. Create audit entry
      const auditEntry = AuditService.createAuditEntry(
        TEST_TENANT,
        'system',
        'INCIDENT_DETECTED',
        `incident-${Date.now()}`,
        { metric: 'error_rate', value: 8 },
        SECRET_KEY
      );

      expect(auditEntry).toBeDefined();
      expect(auditEntry.signature).toBeDefined();

      // 4. Verify signature
      const verified = AuditService.verifySignature(
        {
          tenantId: auditEntry.tenantId,
          userId: auditEntry.userId,
          action: auditEntry.action,
          resourceId: auditEntry.resourceId,
          changes: auditEntry.changes,
          timestamp: auditEntry.timestamp,
        },
        auditEntry.signature,
        SECRET_KEY
      );

      expect(verified).toBe(true);
    });

    test('should enforce multi-tenant isolation', async () => {
      const tenant1 = `isolation-test-1-${Date.now()}`;
      const tenant2 = `isolation-test-2-${Date.now()}`;

      // Create separate tenants
      const config1 = new TenantConfig({
        tenantId: tenant1,
        name: 'Tenant 1',
        apiKeys: [
          {
            keyId: 'key1',
            keyHash: 'hash-key1',
            secretHash: 'secret-hash-1',
          }
        ],
        secretKey: 'secret1',
      });
      const config2 = new TenantConfig({
        tenantId: tenant2,
        name: 'Tenant 2',
        apiKeys: [
          {
            keyId: 'key2',
            keyHash: 'hash-key2',
            secretHash: 'secret-hash-2',
          }
        ],
        secretKey: 'secret2',
      });

      await config1.save();
      await config2.save();

      // Verify they're isolated
      const found1 = await TenantConfig.findOne({ tenantId: tenant1 });
      const found2 = await TenantConfig.findOne({ tenantId: tenant2 });

      expect(found1._id).not.toEqual(found2._id);
      expect(found1.secretKey).not.toEqual(found2.secretKey);
    });

    test.skip('should enforce idempotent execution', async () => {
      const idempotencyKey = `phase1-test-${Date.now()}`;

      // First execution
      const firstExecution = await IdempotencyService.recordRequest(
        TEST_TENANT,
        idempotencyKey,
        'CREATE_INCIDENT',
        { incidentId: 'inc-001' }
      );

      expect(firstExecution).toBe(true);

      // Duplicate request
      const secondExecution = await idempotencyService.recordRequest(
        TEST_TENANT,
        idempotencyKey,
        'CREATE_INCIDENT',
        { incidentId: 'inc-001' }
      );

      expect(secondExecution).toBe(false);
    });

    test('should evaluate policy against incident', async () => {
      const tenant = `policy-eval-test-${Date.now()}`;
      const config = new TenantConfig({
        tenantId: tenant,
        name: 'Policy Eval Test',
        apiKeys: [
          {
            keyId: 'key-policy-test',
            keyHash: 'hash-policy-test',
            secretHash: 'secret-hash-policy',
          }
        ],
        secretKey: 'secret-policy',
      });
      await config.save();

      const policy = new PolicyDefinition({
        tenantId: tenant,
        version: 1,
        policyYaml: 'actions:\n  - name: ESCALATE',
        policyJson: {
          condition: {
            metric: 'error_rate',
            operator: '>',
            threshold: 10,
          },
          action: 'ESCALATE',
        },
        status: 'active',
      });
      await policy.save();

      // Evaluate with incident exceeding threshold
      const matches = PolicyEngine.evaluatePolicy(policy, {
        metric: 'error_rate',
        value: 15,
      });

      expect(matches).toBeTruthy();
    });

    test('should create tamper-proof audit trail', async () => {
      const tenant = `audit-trail-test-${Date.now()}`;
      const secret = 'audit-secret-key';

      const entries = [];
      for (let i = 0; i < 5; i++) {
        const entry = AuditService.createAuditEntry(
          tenant,
          `user-${i}`,
          'ACTION_EXECUTED',
          `resource-${i}`,
          { index: i },
          secret
        );
        entries.push(entry);
      }

      // Verify all entries
      const allValid = entries.every((entry) =>
        AuditService.verifySignature(
          {
            tenantId: entry.tenantId,
            userId: entry.userId,
            action: entry.action,
            resourceId: entry.resourceId,
            changes: entry.changes,
            timestamp: entry.timestamp,
          },
          entry.signature,
          secret
        )
      );

      expect(allValid).toBe(true);

      // Tampering should be detected
      entries[2].action = 'MODIFIED_ACTION';
      const tampered = AuditService.verifySignature(
        {
          tenantId: entries[2].tenantId,
          userId: entries[2].userId,
          action: entries[2].action,
          resourceId: entries[2].resourceId,
          changes: entries[2].changes,
          timestamp: entries[2].timestamp,
        },
        entries[2].signature,
        secret
      );

      expect(tampered).toBe(false);
    });
  });

  describe('PHASE 2: Message Ordering & Runbook Execution', () => {
    test('should guarantee message order within correlation ID', async () => {
      const correlationId = `order-test-${Date.now()}`;

      // Simulate incident lifecycle
      const messages = [
        { type: 'INCIDENT_DETECTED', priority: 1 },
        { type: 'POLICY_EVALUATED', priority: 2 },
        { type: 'DECISION_MADE', priority: 3 },
        { type: 'ACTION_APPROVED', priority: 4 },
      ];

      // Enqueue messages
      for (const msg of messages) {
        await messageOrderingService.enqueueMessage(TEST_TENANT, correlationId, msg);
      }

      // Verify order
      for (const expected of messages) {
        const msg = await messageOrderingService.dequeueMessage(TEST_TENANT, correlationId);
        expect(msg.type).toBe(expected.type);
      }
    });

    test('should prevent out-of-order delivery', async () => {
      const correlationId = `ooo-test-${Date.now()}`;

      // Enqueue 3 messages
      await messageOrderingService.enqueueMessage(TEST_TENANT, correlationId, {
        type: 'FIRST',
      });
      await messageOrderingService.enqueueMessage(TEST_TENANT, correlationId, {
        type: 'SECOND',
      });
      await messageOrderingService.enqueueMessage(TEST_TENANT, correlationId, {
        type: 'THIRD',
      });

      // Dequeue should maintain order
      const msg1 = await messageOrderingService.dequeueMessage(TEST_TENANT, correlationId);
      const msg2 = await messageOrderingService.dequeueMessage(TEST_TENANT, correlationId);
      const msg3 = await messageOrderingService.dequeueMessage(TEST_TENANT, correlationId);

      expect(msg1.type).toBe('FIRST');
      expect(msg2.type).toBe('SECOND');
      expect(msg3.type).toBe('THIRD');
    });

    test('should capture failed messages in DLQ', async () => {
      const failedMessage = {
        correlationId: `dlq-test-${Date.now()}`,
        eventId: `event-${Date.now()}`,
        action: 'RESTART_SERVICE',
        serviceName: 'api-server',
      };
      const error = new Error('Service restart timed out');

      const entry = await dlqService.addToQueue(TEST_TENANT, failedMessage, error, 1);

      expect(entry).toBeDefined();
      expect(entry.status).toBe('retriable');
      expect(entry.failureCount).toBe(1);
      expect(entry.originalMessage.action).toBe('RESTART_SERVICE');
    });

    test('should implement exponential backoff strategy', async () => {
      const backoffs = [];
      for (let attempt = 1; attempt <= 4; attempt++) {
        const delay = dlqService.getBackoffDelay(attempt);
        backoffs.push(delay);
      }

      // Each backoff should be longer than previous
      expect(backoffs[0]).toBeLessThan(backoffs[1]);
      expect(backoffs[1]).toBeLessThan(backoffs[2]);
      expect(backoffs[2]).toBeLessThan(backoffs[3]);
    });

    test('should execute runbook with steps', async () => {
      const runbook = {
        name: 'RestartService',
        steps: [
          {
            name: 'stop-service',
            action: 'STOP_SERVICE',
            params: { serviceName: 'api' },
            timeout: 30,
          },
          {
            name: 'start-service',
            action: 'START_SERVICE',
            params: { serviceName: 'api' },
            timeout: 30,
          },
        ],
      };

      const execution = await runbookExecutionService.executeRunbook(
        TEST_TENANT,
        `corr-runbook-${Date.now()}`,
        runbook
      );

      expect(execution).toBeDefined();
      expect(execution.executionId).toBeDefined();
      expect(execution.steps.length).toBe(2);
    });
  });

  describe('PHASE 4: Advanced Decision Engine Features', () => {
    test('should flow from decision to feedback adjustment', async () => {
      const optimizer = new ConfidenceWeightOptimizer();

      // 1. Simulate a decision with confidence factors
      const decisionFactors = {
        pattern_match: { value: 0.85 },
        historical_success: { value: 0.8 },
        signal_strength: { value: 0.9 },
        recency: { value: 0.7 },
        policy_alignment: { value: 0.8 },
      };

      // 2. Record outcome
      optimizer.recordOutcome({ factors: decisionFactors }, { success: true });

      // 3. Check metrics
      const metrics = optimizer.getMetrics();
      expect(metrics.totalOutcomesRecorded).toBeGreaterThan(0);
    });

    test('should detect patterns across incidents', () => {
      const correlationEngine = new IncidentCorrelationEngine();

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
        `tenant-${Date.now()}`,
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
      const policyParser = new PolicyDSLParser();
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
      const correlationEngine = new IncidentCorrelationEngine();
      const mockMemoryService = {
        getIncidentHistory: jest.fn().mockResolvedValue([
          { success: true, recoveryTimeMs: 2000 },
          { success: true, recoveryTimeMs: 2500 },
          { success: false, recoveryTimeMs: 5000 },
        ]),
      };
      const simulator = new RiskImpactSimulator(mockMemoryService, correlationEngine);

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

    test('should improve weight accuracy over time', () => {
      const optimizer = new ConfidenceWeightOptimizer();

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
    });

    test('should maintain separate correlations per tenant', () => {
      const correlationEngine = new IncidentCorrelationEngine();

      // Tenant 1 pattern
      correlationEngine.recordMultiSignalIncident(
        `tenant-1-${Date.now()}`,
        [
          { type: 'error-a', severity: 'HIGH', serviceId: 'service-1' },
          { type: 'error-b', severity: 'HIGH', serviceId: 'service-1' },
        ],
        ['service-1']
      );

      // Tenant 2 pattern
      correlationEngine.recordMultiSignalIncident(
        `tenant-2-${Date.now()}`,
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

  describe('Cross-Phase: End-to-End Integration', () => {
    test('should execute complete incident lifecycle', async () => {
      const testTenant = `e2e-test-${Date.now()}`;
      const correlationId = `e2e-corr-${Date.now()}`;

      // 1. PHASE 1: Detect and audit incident
      const auditEntry = AuditService.createAuditEntry(
        testTenant,
        'monitoring-system',
        'INCIDENT_DETECTED',
        correlationId,
        { severity: 'HIGH', metric: 'error_rate', value: 25 },
        'test-secret'
      );
      expect(auditEntry).toBeDefined();

      // 2. PHASE 2: Order message processing
      await messageOrderingService.enqueueMessage(testTenant, correlationId, {
        type: 'INCIDENT_DETECTED',
        timestamp: new Date(),
      });

      const detectedMsg = await messageOrderingService.dequeueMessage(testTenant, correlationId);
      expect(detectedMsg.type).toBe('INCIDENT_DETECTED');

      // 3. PHASE 4: Evaluate confidence
      const optimizer = new ConfidenceWeightOptimizer();
      optimizer.recordOutcome(
        {
          factors: {
            pattern_match: { value: 0.9 },
            historical_success: { value: 0.85 },
            signal_strength: { value: 0.95 },
            recency: { value: 0.8 },
            policy_alignment: { value: 0.9 },
          },
        },
        { success: true }
      );

      const metrics = optimizer.getMetrics();
      expect(metrics.totalOutcomesRecorded).toBeGreaterThan(0);
    });

    test('should handle failures with DLQ fallback', async () => {
      const failureCorrelationId = `failure-${Date.now()}`;

      // Simulate action failure
      const failedAction = {
        correlationId: failureCorrelationId,
        eventId: `event-${Date.now()}`,
        action: 'RESTART_SERVICE',
        serviceName: 'critical-api',
      };

      const error = new Error('Service restart failed - timeout');
      const dlqEntry = await dlqService.addToQueue(
        TEST_TENANT,
        failedAction,
        error,
        1
      );

      expect(dlqEntry).toBeDefined();
      expect(dlqEntry.status).toBe('retriable');
      expect(dlqEntry.failureCount).toBe(1);

      // Backoff should be reasonable
      const nextBackoff = dlqService.getBackoffDelay(1);
      expect(nextBackoff).toBeGreaterThan(0);
      expect(nextBackoff).toBeLessThanOrEqual(3600000);
    });
  });
});
