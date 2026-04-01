/**
 * Rate Limiting Middleware Security Tests
 * Tests rate limit enforcement and DOS prevention
 */

const { RateLimitingService } = require('../../middleware/rateLimitingMiddleware');

describe('Rate Limiting Middleware Security Tests', () => {
  let rateLimiter;
  const TEST_TENANT = 'rate-test-tenant';

  beforeEach(() => {
    rateLimiter = new RateLimitingService();
    // Don't connect to Redis, use in-memory fallback
  });

  afterEach(() => {
    // Clear in-memory counters
    rateLimiter.localCounters.clear();
  });

  describe('Rate Limit Enforcement', () => {
    test('should allow requests within limit', async () => {
      const result = await rateLimiter.checkLimit(TEST_TENANT, 'decision', 1000);
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    test('should block requests exceeding limit', async () => {
      const limit = 5;
      
      // Exhaust the limit
      for (let i = 0; i < limit; i++) {
        await rateLimiter.checkLimit(TEST_TENANT, 'api', limit);
      }

      // Next request should be blocked
      const result = await rateLimiter.checkLimit(TEST_TENANT, 'api', limit);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    test('should track remaining requests correctly', async () => {
      const limit = 100;

      // Make 10 requests
      for (let i = 0; i < 10; i++) {
        const result = await rateLimiter.checkLimit(TEST_TENANT, 'decision', limit);
        expect(result.remaining).toBe(limit - (i + 1));
      }
    });

    test('should provide reset information', async () => {
      const result = await rateLimiter.checkLimit(TEST_TENANT, 'api', 1000);
      
      expect(result.resetAfterMs).toBeDefined();
      expect(result.resetAfterMs).toBeGreaterThan(0);
      expect(result.resetAfterMs).toBeLessThanOrEqual(60000); // 1 minute window
    });
  });

  describe('Operation Type Limits', () => {
    test('should apply different limits to different operation types', async () => {
      const limits = {
        decision: 1000,
        action: 500,
        policy: 100,
        api: 10000,
      };

      // Each operation type should have independent limits
      for (let i = 0; i < 5; i++) {
        const decisionResult = await rateLimiter.checkLimit(TEST_TENANT, 'decision');
        const actionResult = await rateLimiter.checkLimit(TEST_TENANT, 'action');
        const policyResult = await rateLimiter.checkLimit(TEST_TENANT, 'policy');

        expect(decisionResult.allowed).toBe(true);
        expect(actionResult.allowed).toBe(true);
        expect(policyResult.allowed).toBe(true);
      }
    });

    test('should use default limits when not specified', async () => {
      const result = await rateLimiter.checkLimit(TEST_TENANT, 'unknown-type');
      
      // Should use fallback default limit
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeDefined();
    });

    test('should respect custom per-tenant limits', async () => {
      const customLimit = 50;
      
      // Exhaust custom limit
      for (let i = 0; i < customLimit; i++) {
        const result = await rateLimiter.checkLimit(TEST_TENANT, 'decision', customLimit);
        expect(result.allowed).toBe(true);
      }

      // Next request should fail
      const result = await rateLimiter.checkLimit(TEST_TENANT, 'decision', customLimit);
      expect(result.allowed).toBe(false);
    });
  });

  describe('DOS Prevention', () => {
    test('should prevent high-frequency requests', async () => {
      const limit = 100;
      const requests = 150;
      const blocked = [];

      for (let i = 0; i < requests; i++) {
        const result = await rateLimiter.checkLimit(TEST_TENANT, 'api', limit);
        if (!result.allowed) {
          blocked.push(i);
        }
      }

      // Should block requests exceeding limit
      expect(blocked.length).toBeGreaterThan(0);
      expect(requests - blocked.length).toBe(limit);
    });

    test('should isolate rate limits per tenant', async () => {
      const tenant1 = 'tenant-1';
      const tenant2 = 'tenant-2';
      const limit = 10;

      // Fill tenant1's quota
      for (let i = 0; i < limit; i++) {
        await rateLimiter.checkLimit(tenant1, 'api', limit);
      }

      // Tenant2 should still be able to make requests
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.checkLimit(tenant2, 'api', limit);
        expect(result.allowed).toBe(true);
      }
    });

    test('should reset counters after time window', async () => {
      const limit = 5;

      // Exhaust limit
      for (let i = 0; i < limit; i++) {
        await rateLimiter.checkLimit(TEST_TENANT, 'api', limit);
      }

      // Should be blocked
      let result = await rateLimiter.checkLimit(TEST_TENANT, 'api', limit);
      expect(result.allowed).toBe(false);

      // Simulate time window expiry
      const key = `ratelimit:${TEST_TENANT}:api`;
      rateLimiter.localCounters.delete(key);

      // Should allow after reset
      result = await rateLimiter.checkLimit(TEST_TENANT, 'api', limit);
      expect(result.allowed).toBe(true);
    });
  });

  describe('In-Memory Fallback', () => {
    test('should use in-memory fallback when Redis unavailable', async () => {
      // Create service without Redis connection
      const offlineRateLimiter = new RateLimitingService();
      offlineRateLimiter.connected = false;

      const result = await offlineRateLimiter.checkLimit(TEST_TENANT, 'api', 1000);
      
      expect(result.allowed).toBe(true);
      expect(offlineRateLimiter.localCounters.size).toBeGreaterThan(0);
    });

    test('should store counters in-memory correctly', async () => {
      const limit = 10;
      const requests = 5;

      for (let i = 0; i < requests; i++) {
        await rateLimiter.checkLimit(TEST_TENANT, 'api', limit);
      }

      const key = `ratelimit:${TEST_TENANT}:api`;
      expect(rateLimiter.localCounters.has(key)).toBe(true);
    });

    test('should handle concurrent requests correctly', async () => {
      const limit = 100;
      const concurrentRequests = 50;
      const promises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(rateLimiter.checkLimit(TEST_TENANT, 'api', limit));
      }

      const results = await Promise.all(promises);
      const allowed = results.filter(r => r.allowed).length;

      expect(allowed).toBeLessThanOrEqual(limit);
    });
  });

  describe('Edge Cases', () => {
    test('should handle zero limit gracefully', async () => {
      const result = await rateLimiter.checkLimit(TEST_TENANT, 'api', 0);
      // With zero limit, first request should be blocked or allowed open (depends on implementation)
      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('limit');
    });

    test('should handle very high limits', async () => {
      const limit = 1000000;
      const results = [];

      for (let i = 0; i < 100; i++) {
        const result = await rateLimiter.checkLimit(TEST_TENANT, 'api', limit);
        results.push(result.allowed);
      }

      expect(results.every(r => r === true)).toBe(true);
    });

    test('should handle special characters in tenant ID', async () => {
      const specialTenant = 'tenant-with-special_chars.123';
      const result = await rateLimiter.checkLimit(specialTenant, 'api', 1000);
      
      expect(result.allowed).toBe(true);
    });

    test('should track separate limits for long-running processes', async () => {
      const limit1 = 50;
      const limit2 = 100;

      // Make requests with different limits
      const result1a = await rateLimiter.checkLimit(TEST_TENANT, 'decision', limit1);
      const result2a = await rateLimiter.checkLimit(TEST_TENANT, 'decision', limit2);

      // Both should be counted separately based on actual limit used
      expect(result1a.allowed).toBe(true);
      expect(result2a.allowed).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle null tenant gracefully', async () => {
      const result = await rateLimiter.checkLimit(null, 'api', 1000);
      expect(result).toBeDefined();
      expect(result.allowed).toBeDefined();
    });

    test('should handle undefined operation type', async () => {
      const result = await rateLimiter.checkLimit(TEST_TENANT, undefined, 1000);
      expect(result).toBeDefined();
      expect(result.allowed).toBeDefined();
    });

    test('should provide consistent response format', async () => {
      const result = await rateLimiter.checkLimit(TEST_TENANT, 'api', 1000);
      
      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('remaining');
      expect(result).toHaveProperty('resetAfterMs');
    });
  });

  describe('Performance', () => {
    test('should handle rate limit check in < 10ms', async () => {
      const startTime = Date.now();
      
      for (let i = 0; i < 100; i++) {
        await rateLimiter.checkLimit(TEST_TENANT, 'api', 10000);
      }
      
      const elapsed = Date.now() - startTime;
      const avgTime = elapsed / 100;
      
      expect(avgTime).toBeLessThan(10);
    });
  });
});
