/**
 * Unit Tests: Audit Service
 * Tests HMAC signing, audit trail logging, and data integrity
 */

const crypto = require('crypto');
const { auditService: AuditService } = require('../../services/observability');

describe('AuditService', () => {
  const SECRET_KEY = 'test-secret-key-phase1';
  const TEST_TENANT = 'test-tenant-audit';

  // AUDIT_SECRET must be present because _computeSignature now throws without it.
  // Use a fixed test value that meets the 32-char minimum.
  beforeAll(() => {
    process.env.AUDIT_SECRET = 'test-audit-secret-key-32-chars!!';
  });

  afterAll(() => {
    delete process.env.AUDIT_SECRET;
  });

  describe('signMessage', () => {
    test('should generate valid HMAC signature', () => {
      const data = { action: 'CREATE_POLICY', resourceId: 'policy-123' };
      const signature = AuditService.signMessage(data, SECRET_KEY);

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);
    });

    test('should produce consistent signatures for same data', () => {
      const data = { action: 'DELETE_POLICY', resourceId: 'policy-456' };
      const sig1 = AuditService.signMessage(data, SECRET_KEY);
      const sig2 = AuditService.signMessage(data, SECRET_KEY);

      expect(sig1).toBe(sig2);
    });

    test('should produce different signatures for different data', () => {
      const data1 = { action: 'CREATE', resourceId: 'id1' };
      const data2 = { action: 'CREATE', resourceId: 'id2' };

      const sig1 = AuditService.signMessage(data1, SECRET_KEY);
      const sig2 = AuditService.signMessage(data2, SECRET_KEY);

      expect(sig1).not.toBe(sig2);
    });

    test('should produce different signatures with different secrets', () => {
      const data = { action: 'UPDATE', resourceId: 'id123' };
      const sig1 = AuditService.signMessage(data, 'secret-1');
      const sig2 = AuditService.signMessage(data, 'secret-2');

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('verifySignature', () => {
    test('should verify valid signatures', () => {
      const data = { action: 'CREATE_INCIDENT', resourceId: 'incident-001' };
      const signature = AuditService.signMessage(data, SECRET_KEY);

      const isValid = AuditService.verifySignature(data, signature, SECRET_KEY);
      expect(isValid).toBe(true);
    });

    test('should reject invalid signatures', () => {
      const data = { action: 'CREATE_INCIDENT', resourceId: 'incident-001' };
      const invalidSignature = 'invalid-signature-here';

      const isValid = AuditService.verifySignature(data, invalidSignature, SECRET_KEY);
      expect(isValid).toBe(false);
    });

    test('should reject signatures with wrong secret', () => {
      const data = { action: 'CREATE_INCIDENT', resourceId: 'incident-001' };
      const signature = AuditService.signMessage(data, SECRET_KEY);

      const isValid = AuditService.verifySignature(data, signature, 'different-secret');
      expect(isValid).toBe(false);
    });

    test('should reject signatures for modified data', () => {
      const originalData = { action: 'CREATE', resourceId: 'id123' };
      const signature = AuditService.signMessage(originalData, SECRET_KEY);

      const modifiedData = { action: 'CREATE', resourceId: 'id456' };
      const isValid = AuditService.verifySignature(modifiedData, signature, SECRET_KEY);

      expect(isValid).toBe(false);
    });
  });

  describe('createAuditEntry', () => {
    test('should create audit entry with required fields', () => {
      const entry = AuditService.createAuditEntry(
        TEST_TENANT,
        'user-001',
        'CREATE_POLICY',
        'policy-001',
        { name: 'HighSeverity' },
        SECRET_KEY
      );

      expect(entry).toBeDefined();
      expect(entry.tenantId).toBe(TEST_TENANT);
      expect(entry.userId).toBe('user-001');
      expect(entry.action).toBe('CREATE_POLICY');
      expect(entry.resourceId).toBe('policy-001');
      expect(entry.timestamp).toBeDefined();
      expect(entry.signature).toBeDefined();
    });

    test('should include change data in audit entry', () => {
      const changes = { enabled: true, threshold: 5 };
      const entry = AuditService.createAuditEntry(
        TEST_TENANT,
        'user-002',
        'UPDATE_POLICY',
        'policy-002',
        changes,
        SECRET_KEY
      );

      expect(entry.changes).toEqual(changes);
    });
  });

  describe('verifyAuditTrail', () => {
    test('should verify authentic audit trail', () => {
      const entries = [
        AuditService.createAuditEntry(TEST_TENANT, 'user1', 'CREATE', 'res1', {}, SECRET_KEY),
        AuditService.createAuditEntry(TEST_TENANT, 'user2', 'UPDATE', 'res1', {}, SECRET_KEY),
        AuditService.createAuditEntry(TEST_TENANT, 'user1', 'DELETE', 'res1', {}, SECRET_KEY),
      ];

      const isValid = entries.every((entry) =>
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
          SECRET_KEY
        )
      );

      expect(isValid).toBe(true);
    });

    test('should detect tampered audit entries', () => {
      const entry = AuditService.createAuditEntry(
        TEST_TENANT,
        'user1',
        'DELETE',
        'res1',
        {},
        SECRET_KEY
      );

      // Simulate tampering
      entry.action = 'UPDATE';

      const isValid = AuditService.verifySignature(
        {
          tenantId: entry.tenantId,
          userId: entry.userId,
          action: entry.action,
          resourceId: entry.resourceId,
          changes: entry.changes,
          timestamp: entry.timestamp,
        },
        entry.signature,
        SECRET_KEY
      );

      expect(isValid).toBe(false);
    });
  });
});
