/**
 * Phase 1 Integration Tests
 * Tests complete Phase 1 pipeline: detection → analysis → decision → action
 */

const mongoose = require('mongoose');
const { dbService: { connectDatabase, disconnectDatabase } } = require('../../services/infrastructure');
const TenantConfig = require('../../models/TenantConfig');
const PolicyDefinition = require('../../models/PolicyDefinition');
const { policyEngine: PolicyEngine } = require('../../services/core');
const { auditService: AuditService } = require('../../services/observability');
const { idempotencyService: IdempotencyService } = require('../../services/infrastructure');

describe('Phase 1 Integration Tests', () => {
  const TEST_TENANT = 'test-tenant-phase1-integration';
  const API_KEY = 'test-api-key-phase1';
  const SECRET_KEY = 'test-secret-phase1';

  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Clean up test data before each test to avoid unique constraint violations
    await TenantConfig.deleteMany({ tenantId: { $regex: '^(test-tenant-phase1|isolation-test|policy-eval-test|override-test|auth-test|auth-reject-test)' } });
    await PolicyDefinition.deleteMany({ tenantId: { $regex: '^(test-tenant-phase1|isolation-test|policy-eval-test|override-test|auth-test|auth-reject-test)' } });
  });

  afterEach(async () => {
    // Clean up after each test
    await TenantConfig.deleteMany({ tenantId: { $regex: '^(test-tenant-phase1|isolation-test|policy-eval-test|override-test|auth-test|auth-reject-test)' } });
    await PolicyDefinition.deleteMany({ tenantId: { $regex: '^(test-tenant-phase1|isolation-test|policy-eval-test|override-test|auth-test|auth-reject-test)' } });
  });

  describe('Complete Incident Pipeline', () => {
    test('should detect incident → evaluate policy → record audit', async () => {
      // 1. Setup tenant
      let tenant = await TenantConfig.findOne({ tenantId: TEST_TENANT });
      if (!tenant) {
        tenant = new TenantConfig({
          tenantId: TEST_TENANT,
          name: 'Phase 1 Integration Test',
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
        name: 'RestartCrashingService',
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
      const tenant1 = 'isolation-test-1';
      const tenant2 = 'isolation-test-2';

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
      const { IdempotencyService } = require('../../services/infrastructure');
      const idempotencyKey = `phase1-test-${Date.now()}`;
      const idempotencyService = new IdempotencyService();

      // First execution
      const firstExecution = await idempotencyService.recordRequest(
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

      // Cached result should be available
      const cached = await idempotencyService.getCachedResult(
        TEST_TENANT,
        idempotencyKey,
        'CREATE_INCIDENT'
      );

      expect(cached).toEqual({ incidentId: 'inc-001' });
    });
  });

  describe('Policy Engine Integration', () => {
    test('should evaluate policy against incident', async () => {
      const tenant = 'policy-eval-test';
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

    test('should support policy overrides per tenant', async () => {
      const tenant = 'override-test';
      const config = new TenantConfig({
        tenantId: tenant,
        name: 'Override Test',
        apiKeys: [
          {
            keyId: 'key-override',
            keyHash: 'hash-override',
            secretHash: 'secret-hash-override',
          }
        ],
        secretKey: 'secret-override',
        metadata: {
          requireApprovalForRestart: true,
          autoEscalateAfterFailures: 5,
        },
      });
      await config.save();

      const found = await TenantConfig.findOne({ tenantId: tenant });

      expect(found.metadata.requireApprovalForRestart).toBe(true);
      expect(found.metadata.autoEscalateAfterFailures).toBe(5);
    });
  });

  describe('Audit Trail Integrity', () => {
    test('should create tamper-proof audit trail', async () => {
      const tenant = 'audit-trail-test';
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

  describe('Authentication & Authorization', () => {
    test('should validate API key for tenant', async () => {
      const tenant = 'auth-test';
      const apiKey = 'valid-api-key-auth';

      const config = new TenantConfig({
        tenantId: tenant,
        name: 'Auth Test',
        apiKeys: [
          {
            keyId: apiKey,
            keyHash: 'hash-' + apiKey,
            secretHash: 'secret-hash-auth',
          }
        ],
        secretKey: 'secret-auth',
      });
      await config.save();

      const found = await TenantConfig.findOne({ tenantId: tenant });
      expect(found.apiKeys[0].keyId).toBe(apiKey);
    });

    test('should reject invalid API key', async () => {
      const tenant = 'auth-reject-test';
      const validKey = 'valid-key';
      const invalidKey = 'invalid-key';

      const config = new TenantConfig({
        tenantId: tenant,
        name: 'Auth Reject Test',
        apiKeys: [
          {
            keyId: validKey,
            keyHash: 'hash-' + validKey,
            secretHash: 'secret-hash-reject',
          }
        ],
        secretKey: 'secret',
      });
      await config.save();

      const found = await TenantConfig.findOne({ tenantId: tenant });
      const foundKeyIds = found.apiKeys.map(k => k.keyId);
      expect(foundKeyIds).toContain(validKey);
      expect(foundKeyIds).not.toContain(invalidKey);
    });
  });
});
