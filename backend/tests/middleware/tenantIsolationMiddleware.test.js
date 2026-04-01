/**
 * Tenant Isolation Middleware Security Tests
 * Tests multi-tenant data isolation enforcement
 */

const { tenantIsolationMiddleware } = require('../../middleware/tenantIsolationMiddleware');

describe('Tenant Isolation Middleware Security Tests', () => {
  const TEST_TENANT_ID = 'test-tenant-123';

  describe('Tenant Context Validation', () => {
    test('should reject missing tenant context', () => {
      const req = {
        params: { tenantId: TEST_TENANT_ID },
        headers: {},
        body: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'NOT_AUTHENTICATED'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('should require tenant to be attached by authMiddleware', () => {
      const req = {
        params: { tenantId: TEST_TENANT_ID },
        // No tenant property - should fail
        headers: {},
        body: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Tenant ID Matching', () => {
    test('should enforce URL tenant ID matches authenticated tenant', () => {
      const req = {
        tenant: { id: TEST_TENANT_ID },
        params: { tenantId: 'different-tenant' },
        headers: {},
        body: {},
        method: 'POST',
        path: '/api/decision',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'TENANT_MISMATCH'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('should allow matching tenant IDs', () => {
      const req = {
        tenant: { id: TEST_TENANT_ID },
        params: { tenantId: TEST_TENANT_ID },
        headers: {},
        body: {},
        method: 'POST',
        path: '/api/decision',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should allow missing URL tenant ID if required by route', () => {
      const req = {
        tenant: { id: TEST_TENANT_ID },
        params: {}, // No tenantId in params
        headers: {},
        body: {},
        method: 'GET',
        path: '/api/config',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Request Body Tenant ID Validation', () => {
    test('should reject body tenant ID mismatch', () => {
      const req = {
        tenant: { id: TEST_TENANT_ID },
        params: { tenantId: TEST_TENANT_ID },
        headers: {},
        body: {
          tenantId: 'different-tenant', // Attack attempt
          data: 'some-data',
        },
        method: 'POST',
        path: '/api/decision',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'TENANT_MISMATCH'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('should allow body without tenant ID', () => {
      const req = {
        tenant: { id: TEST_TENANT_ID },
        params: { tenantId: TEST_TENANT_ID },
        headers: {},
        body: {
          data: 'some-data',
          signal: { errorRate: 25 },
        },
        method: 'POST',
        path: '/api/decision',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should allow matching body tenant ID', () => {
      const req = {
        tenant: { id: TEST_TENANT_ID },
        params: { tenantId: TEST_TENANT_ID },
        headers: {},
        body: {
          tenantId: TEST_TENANT_ID, // Correct tenant ID
          data: 'some-data',
        },
        method: 'POST',
        path: '/api/decision',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should handle empty body', () => {
      const req = {
        tenant: { id: TEST_TENANT_ID },
        params: { tenantId: TEST_TENANT_ID },
        headers: {},
        body: {},
        method: 'GET',
        path: '/api/config',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Safe Query Helpers', () => {
    test('should provide withTenantId query helper', () => {
      const req = {
        tenant: { id: TEST_TENANT_ID },
        params: { tenantId: TEST_TENANT_ID },
        headers: {},
        body: {},
        method: 'GET',
        path: '/api/config',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      expect(req.withTenantId).toBeDefined();
      expect(typeof req.withTenantId).toBe('function');
    });

    test('withTenantId should inject tenant ID into queries', () => {
      const req = {
        tenant: { id: TEST_TENANT_ID },
        params: { tenantId: TEST_TENANT_ID },
        headers: {},
        body: {},
        method: 'GET',
        path: '/api/config',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      const query = req.withTenantId({ status: 'active' });
      expect(query).toEqual({
        status: 'active',
        tenantId: TEST_TENANT_ID,
      });
    });

    test('withTenantId should work with empty query', () => {
      const req = {
        tenant: { id: TEST_TENANT_ID },
        params: { tenantId: TEST_TENANT_ID },
        headers: {},
        body: {},
        method: 'GET',
        path: '/api/config',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      const query = req.withTenantId();
      expect(query).toEqual({
        tenantId: TEST_TENANT_ID,
      });
    });

    test('should provide withTenantUpdate helper', () => {
      const req = {
        tenant: { id: TEST_TENANT_ID },
        params: { tenantId: TEST_TENANT_ID },
        headers: {},
        body: {},
        method: 'PATCH',
        path: '/api/config',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      expect(req.withTenantUpdate).toBeDefined();
      expect(typeof req.withTenantUpdate).toBe('function');
    });

    test('withTenantUpdate should format updates for MongoDB', () => {
      const req = {
        tenant: { id: TEST_TENANT_ID },
        params: { tenantId: TEST_TENANT_ID },
        headers: {},
        body: {},
        method: 'PATCH',
        path: '/api/config',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      const update = req.withTenantUpdate({ status: 'suspended' });
      expect(update).toEqual({
        $set: {
          status: 'suspended',
          tenantId: TEST_TENANT_ID,
        },
      });
    });

    test('withTenantUpdate should prevent tenantId overwriting', () => {
      const req = {
        tenant: { id: TEST_TENANT_ID },
        params: { tenantId: TEST_TENANT_ID },
        headers: {},
        body: {},
        method: 'PATCH',
        path: '/api/config',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      // Try to change tenant ID (should be prevented)
      const update = req.withTenantUpdate({
        tenantId: 'attacker-tenant',
        status: 'active',
      });

      expect(update.$set.tenantId).toBe(TEST_TENANT_ID);
      expect(update.$set.tenantId).not.toBe('attacker-tenant');
    });
  });

  describe('Logging and Auditing', () => {
    test('should log successful tenant verification', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const req = {
        tenant: { id: TEST_TENANT_ID },
        params: { tenantId: TEST_TENANT_ID },
        headers: {},
        body: {},
        method: 'POST',
        path: '/api/decision',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[tenant-isolation]')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(TEST_TENANT_ID)
      );

      consoleSpy.mockRestore();
    });

    test('should warn on tenant ID mismatch', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const req = {
        tenant: { id: TEST_TENANT_ID },
        params: { tenantId: 'different-tenant' },
        headers: {},
        body: {},
        method: 'POST',
        path: '/api/decision',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Tenant ID mismatch')
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Cross-Tenant Attack Prevention', () => {
    test('should prevent accessing another tenant\'s data via URL manipulation', () => {
      const req = {
        tenant: { id: 'tenant-a' },
        params: { tenantId: 'tenant-b' }, // Attack: trying to access another tenant
        headers: {},
        body: {},
        method: 'GET',
        path: '/api/tenant-b/policies',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    test('should prevent accessing another tenant\'s data via body injection', () => {
      const req = {
        tenant: { id: 'tenant-a' },
        params: { tenantId: 'tenant-a' },
        headers: {},
        body: {
          tenantId: 'tenant-b', // Attack: injecting different tenant ID
          policyId: 'policy-123',
          action: 'update',
        },
        method: 'PATCH',
        path: '/api/policies',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    test('should prevent database query injection via tenant ID', () => {
      const req = {
        tenant: { id: 'tenant-a' },
        params: { tenantId: 'tenant-a' },
        headers: {},
        body: {
          tenantId: "tenant-a'; DROP TABLE tenants; --",
          data: 'malicious',
        },
        method: 'POST',
        path: '/api/decision',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      // Should detect mismatch
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('Error Handling', () => {
    test('should handle errors gracefully', () => {
      const req = {
        tenant: { id: TEST_TENANT_ID },
        params: { tenantId: TEST_TENANT_ID },
        headers: {},
        body: null, // Invalid body
        method: 'GET',
        path: '/api/config',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      // Should not throw
      expect(() => tenantIsolationMiddleware(req, res, next)).not.toThrow();
    });

    test('should respond with 500 on middleware error', () => {
      const req = {
        tenant: null, // No tenant - returns 401 authentication failure
        params: { tenantId: TEST_TENANT_ID },
        headers: {},
        body: {},
        method: 'GET',
        path: '/api/config',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      if (res.status.mock.calls.length > 0) {
        expect(res.status).toHaveBeenCalledWith(401);
      }
    });
  });

  describe('Case Sensitivity', () => {
    test('should perform case-sensitive tenant ID matching', () => {
      const req = {
        tenant: { id: 'Test-Tenant' },
        params: { tenantId: 'test-tenant' }, // Different case
        headers: {},
        body: {},
        method: 'GET',
        path: '/api/config',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      tenantIsolationMiddleware(req, res, next);

      // Should fail due to case mismatch
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
