/**
 * Unit Tests: Idempotency Service
 * Tests duplicate request detection and idempotent execution
 */

const { idempotencyService: IdempotencyService } = require('../../services/infrastructure');

describe('IdempotencyService', () => {
  let service;
  const TEST_TENANT = 'test-tenant-idempotent';

  beforeEach(() => {
    service = new IdempotencyService();
  });

  describe('recordRequest', () => {
    test('should record new idempotency key', async () => {
      const idempotencyKey = 'req-123-unique';
      const result = await service.recordRequest(TEST_TENANT, idempotencyKey, 'INCIDENT_CREATED');

      expect(result).toBe(true);
    });

    test('should detect duplicate requests', async () => {
      const idempotencyKey = 'req-456-duplicate';
      
      // First request succeeds
      const first = await service.recordRequest(TEST_TENANT, idempotencyKey, 'ACTION_TRIGGERED');
      expect(first).toBe(true);

      // Second request with same key should be rejected
      const second = await service.recordRequest(TEST_TENANT, idempotencyKey, 'ACTION_TRIGGERED');
      expect(second).toBe(false);
    });

    test('should allow same operation key for different tenants', async () => {
      const idempotencyKey = 'req-789-shared-key';
      
      const tenant1 = await service.recordRequest('tenant-1', idempotencyKey, 'OPERATION');
      const tenant2 = await service.recordRequest('tenant-2', idempotencyKey, 'OPERATION');

      expect(tenant1).toBe(true);
      expect(tenant2).toBe(true);
    });

    test('should allow same key for different operations within same tenant', async () => {
      const idempotencyKey = 'req-999-multi-op';
      const tenant = 'tenant-multi-op';

      const op1 = await service.recordRequest(tenant, idempotencyKey, 'OPERATION_A');
      const op2 = await service.recordRequest(tenant, idempotencyKey, 'OPERATION_B');

      // Different operation types should both succeed
      expect(op1).toBe(true);
      expect(op2).toBe(true);
    });
  });

  describe('getCachedResult', () => {
    test('should retrieve cached result for duplicate request', async () => {
      const idempotencyKey = 'req-cache-001';
      const result = { status: 'success', id: 'action-001' };

      // Record request
      await service.recordRequest(TEST_TENANT, idempotencyKey, 'ACTION', result);

      // Retrieve cached result
      const cached = await service.getCachedResult(TEST_TENANT, idempotencyKey, 'ACTION');
      expect(cached).toEqual(result);
    });

    test('should return null for non-existent idempotency key', async () => {
      const cached = await service.getCachedResult(TEST_TENANT, 'non-existent-key', 'ACTION');
      expect(cached).toBeNull();
    });

    test('should expire cached results after TTL', async () => {
      const idempotencyKey = 'req-expire-001';
      const result = { status: 'success', id: 'action-002' };

      // Record request with short TTL
      const ttl = 1; // 1 second
      await service.recordRequest(TEST_TENANT, idempotencyKey, 'ACTION', result, ttl);

      // Retrieve immediately
      let cached = await service.getCachedResult(TEST_TENANT, idempotencyKey, 'ACTION');
      expect(cached).toEqual(result);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should be expired
      cached = await service.getCachedResult(TEST_TENANT, idempotencyKey, 'ACTION');
      expect(cached).toBeNull();
    });
  });

  describe('cleanupExpiredKeys', () => {
    test('should remove expired idempotency keys', async () => {
      const keys = ['req-cleanup-1', 'req-cleanup-2', 'req-cleanup-3'];
      const ttl = 2; // 2 seconds

      // Record multiple keys with short TTL
      for (const key of keys) {
        await service.recordRequest(TEST_TENANT, key, 'OPERATION', {}, ttl);
      }

      // Keys should exist
      let count = await service.getActiveKeyCount(TEST_TENANT);
      expect(count).toBeGreaterThanOrEqual(3);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 2100));

      // Cleanup
      await service.cleanupExpiredKeys();

      // Keys should be removed
      count = await service.getActiveKeyCount(TEST_TENANT);
      expect(count).toBeLessThan(3);
    });
  });

  describe('isIdempotentKey', () => {
    test('should validate idempotency key format', () => {
      const validKeys = [
        'req-123-abc',
        'action-001-create',
        'correlation-id-12345',
      ];

      validKeys.forEach((key) => {
        expect(service.isIdempotentKey(key)).toBe(true);
      });
    });

    test('should reject invalid idempotency keys', () => {
      const invalidKeys = [
        '',
        '123', // too short
        'a', // single char
      ];

      invalidKeys.forEach((key) => {
        expect(service.isIdempotentKey(key)).toBe(false);
      });
    });
  });
});
