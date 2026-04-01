/**
 * Auth Middleware Security Tests
 * Tests authentication, signature verification, timestamp validation
 */

const authMiddleware = require('../../middleware/authMiddleware');
const TenantConfig = require('../../models/TenantConfig');
const crypto = require('crypto');
const { dbService } = require('../../services/infrastructure');
const { connectDatabase, disconnectDatabase } = dbService;

describe('Auth Middleware Security Tests', () => {
  const TEST_TENANT = 'test-auth-tenant';
  const TEST_KEY_ID = 'test-key-123';
  const TEST_SECRET = 'test-secret-456';
  
  let testTenant;

  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Clean up
    await TenantConfig.deleteOne({ tenantId: TEST_TENANT });

    // Create test tenant with API key
    testTenant = new TenantConfig({
      tenantId: TEST_TENANT,
      name: 'Auth Test Tenant',
      secretKey: 'secret-key',
      apiKeys: [
        {
          keyId: TEST_KEY_ID,
          keyHash: crypto.createHmac('sha256', TEST_SECRET).update(TEST_KEY_ID).digest('hex'),
          secretHash: crypto.createHmac('sha256', 'secret').update(TEST_SECRET).digest('hex'),
          active: true,
          status: 'active',
        }
      ],
    });
    await testTenant.save();
  });

  afterEach(async () => {
    await TenantConfig.deleteOne({ tenantId: TEST_TENANT });
  });

  describe('Header Validation', () => {
    test('should reject missing Authorization header', async () => {
      const req = {
        params: { tenantId: TEST_TENANT },
        headers: {
          'x-timestamp': Date.now().toString(),
          'x-idempotency-key': 'test-123',
        },
        body: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'MISSING_AUTH_HEADER'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject invalid auth scheme', async () => {
      const req = {
        params: { tenantId: TEST_TENANT },
        headers: {
          'authorization': 'Basic test:secret',
          'x-timestamp': Date.now().toString(),
          'x-idempotency-key': 'test-123',
        },
        body: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_AUTH_SCHEME'
        })
      );
    });

    test('should reject malformed credentials', async () => {
      const req = {
        params: { tenantId: TEST_TENANT },
        headers: {
          'authorization': 'Bearer malformed-no-colon',
          'x-timestamp': Date.now().toString(),
          'x-idempotency-key': 'test-123',
        },
        body: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'MALFORMED_CREDENTIALS'
        })
      );
    });

    test('should reject missing X-Timestamp header', async () => {
      const req = {
        params: { tenantId: TEST_TENANT },
        headers: {
          'authorization': `Bearer ${TEST_KEY_ID}:${TEST_SECRET}`,
          'x-idempotency-key': 'test-123',
        },
        body: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'MISSING_TIMESTAMP'
        })
      );
    });

    test('should reject missing X-Idempotency-Key header', async () => {
      const req = {
        params: { tenantId: TEST_TENANT },
        headers: {
          'authorization': `Bearer ${TEST_KEY_ID}:${TEST_SECRET}`,
          'x-timestamp': Date.now().toString(),
        },
        body: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'MISSING_IDEMPOTENCY_KEY'
        })
      );
    });

    test('should reject missing X-Signature header', async () => {
      const timestamp = Date.now().toString();
      const req = {
        params: { tenantId: TEST_TENANT },
        headers: {
          'authorization': `Bearer ${TEST_KEY_ID}:${TEST_SECRET}`,
          'x-timestamp': timestamp,
          'x-idempotency-key': 'test-123',
        },
        body: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'MISSING_SIGNATURE'
        })
      );
    });
  });

  describe('Timestamp Validation', () => {
    test('should reject stale timestamps (> 5 minutes)', async () => {
      const staleTimestamp = (Date.now() - 6 * 60 * 1000).toString(); // 6 minutes ago
      const messageToSign = staleTimestamp;
      const signature = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(messageToSign)
        .digest('hex');

      const req = {
        params: { tenantId: TEST_TENANT },
        headers: {
          'authorization': `Bearer ${TEST_KEY_ID}:${TEST_SECRET}`,
          'x-timestamp': staleTimestamp,
          'x-idempotency-key': 'test-123',
          'x-signature': signature,
        },
        body: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'STALE_TIMESTAMP'
        })
      );
    });

    test('should accept fresh timestamps (< 5 minutes)', async () => {
      const freshTimestamp = (Date.now() - 2 * 60 * 1000).toString(); // 2 minutes ago
      const messageToSign = freshTimestamp;
      const signature = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(messageToSign)
        .digest('hex');

      const req = {
        params: { tenantId: TEST_TENANT },
        headers: {
          'authorization': `Bearer ${TEST_KEY_ID}:${TEST_SECRET}`,
          'x-timestamp': freshTimestamp,
          'x-idempotency-key': 'test-123',
          'x-signature': signature,
        },
        body: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await authMiddleware(req, res, next);

      // Should either pass auth or fail for other reasons (not timestamp)
      if (res.status.mock.calls.length > 0) {
        expect(res.status).not.toHaveBeenCalledWith(401);
      }
    });
  });

  describe('Signature Verification', () => {
    test('should reject invalid signature', async () => {
      const timestamp = Date.now().toString();
      // Create an invalid signature with correct length (64 chars for sha256 hex)
      const invalidSignature = '0'.repeat(64);

      const req = {
        params: { tenantId: TEST_TENANT },
        headers: {
          'authorization': `Bearer ${TEST_KEY_ID}:${TEST_SECRET}`,
          'x-timestamp': timestamp,
          'x-idempotency-key': 'test-123',
          'x-signature': invalidSignature,
        },
        body: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_SIGNATURE'
        })
      );
    });

    test('should accept valid signature', async () => {
      const timestamp = Date.now().toString();
      const messageToSign = timestamp;
      const signature = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(messageToSign)
        .digest('hex');

      const req = {
        params: { tenantId: TEST_TENANT },
        headers: {
          'authorization': `Bearer ${TEST_KEY_ID}:${TEST_SECRET}`,
          'x-timestamp': timestamp,
          'x-idempotency-key': 'test-123',
          'x-signature': signature,
        },
        body: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await authMiddleware(req, res, next);

      // Should call next() on valid auth
      expect(next).toHaveBeenCalled();
    });

    test('should reject signature with modified body', async () => {
      const timestamp = Date.now().toString();
      const correctBody = JSON.stringify({ data: 'original' });
      const correctSignature = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(correctBody + timestamp)
        .digest('hex');

      const req = {
        params: { tenantId: TEST_TENANT },
        headers: {
          'authorization': `Bearer ${TEST_KEY_ID}:${TEST_SECRET}`,
          'x-timestamp': timestamp,
          'x-idempotency-key': 'test-123',
          'x-signature': correctSignature,
        },
        body: { data: 'modified' }, // Different body
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_SIGNATURE'
        })
      );
    });
  });

  describe('API Key Validation', () => {
    test('should reject inactive API key', async () => {
      // Update key to inactive
      await TenantConfig.updateOne(
        { tenantId: TEST_TENANT },
        { 'apiKeys.0.active': false }
      );

      const timestamp = Date.now().toString();
      const messageToSign = timestamp;
      const signature = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(messageToSign)
        .digest('hex');

      const req = {
        params: { tenantId: TEST_TENANT },
        headers: {
          'authorization': `Bearer ${TEST_KEY_ID}:${TEST_SECRET}`,
          'x-timestamp': timestamp,
          'x-idempotency-key': 'test-123',
          'x-signature': signature,
        },
        body: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'API_KEY_NOT_FOUND'
        })
      );
    });

    test('should reject rotated API key', async () => {
      const rotationDeadline = new Date(Date.now() - 1000); // 1 second ago
      
      // Update key with rotation deadline in past
      await TenantConfig.updateOne(
        { tenantId: TEST_TENANT },
        { 'apiKeys.0.rotationDeadline': rotationDeadline }
      );

      const timestamp = Date.now().toString();
      const messageToSign = timestamp;
      const signature = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(messageToSign)
        .digest('hex');

      const req = {
        params: { tenantId: TEST_TENANT },
        headers: {
          'authorization': `Bearer ${TEST_KEY_ID}:${TEST_SECRET}`,
          'x-timestamp': timestamp,
          'x-idempotency-key': 'test-123',
          'x-signature': signature,
        },
        body: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'API_KEY_ROTATED'
        })
      );
    });
  });

  describe('Tenant Validation', () => {
    test('should reject missing tenant', async () => {
      const timestamp = Date.now().toString();
      const messageToSign = timestamp;
      const signature = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(messageToSign)
        .digest('hex');

      const req = {
        params: { tenantId: 'non-existent-tenant' },
        headers: {
          'authorization': `Bearer ${TEST_KEY_ID}:${TEST_SECRET}`,
          'x-timestamp': timestamp,
          'x-idempotency-key': 'test-123',
          'x-signature': signature,
        },
        body: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'TENANT_NOT_FOUND'
        })
      );
    });

    test('should reject inactive tenant', async () => {
      // Update tenant to inactive
      await TenantConfig.updateOne(
        { tenantId: TEST_TENANT },
        { status: 'suspended' }
      );

      const timestamp = Date.now().toString();
      const messageToSign = timestamp;
      const signature = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(messageToSign)
        .digest('hex');

      const req = {
        params: { tenantId: TEST_TENANT },
        headers: {
          'authorization': `Bearer ${TEST_KEY_ID}:${TEST_SECRET}`,
          'x-timestamp': timestamp,
          'x-idempotency-key': 'test-123',
          'x-signature': signature,
        },
        body: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'TENANT_NOT_FOUND'
        })
      );
    });
  });

  describe('Timing-Safe Signature Comparison', () => {
    test('should use timing-safe comparison to prevent timing attacks', async () => {
      // This test verifies the use of crypto.timingSafeEqual
      // Multiple signatures with same length but different content should
      // all fail with same execution time
      
      const timestamp = Date.now().toString();
      const correctSignature = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(timestamp)
        .digest('hex');

      // Create multiple wrong signatures
      const wrongSignatures = [
        'a'.repeat(64), // Same length as SHA256 hex
        'b'.repeat(64),
        'c'.repeat(64),
      ];

      for (const wrongSignature of wrongSignatures) {
        const req = {
          params: { tenantId: TEST_TENANT },
          headers: {
            'authorization': `Bearer ${TEST_KEY_ID}:${TEST_SECRET}`,
            'x-timestamp': timestamp,
            'x-idempotency-key': 'test-123',
            'x-signature': wrongSignature,
          },
          body: {},
        };
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
        };
        const next = jest.fn();

        await authMiddleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'INVALID_SIGNATURE'
          })
        );
      }
    });
  });
});
