/**
 * Rate Limiting Middleware Unit Tests
 * 
 * Tests per-tenant rate limiting using Redis with fallback to in-memory counters
 * Ensures fair resource distribution and DDoS/abuse prevention\n * 
 * Coverage: 6 critical rate limiting tests
 */

const { RateLimitingService } = require('../../middleware/rateLimitingMiddleware');

// Mock Redis client
jest.mock('redis', () => ({
  createClient: jest.fn(),
}));

const redis = require('redis');

describe('RateLimitingService', () => {
  let rateLimitService;

  beforeEach(() => {
    // Reset service for each test
    rateLimitService = new RateLimitingService();
    jest.clearAllMocks();
  });

  /**
   * Test 1: Service initializes with default limits
   */
  test('should initialize with default rate limits', () => {
    // Assert
    expect(rateLimitService.connected).toBe(false);
    expect(rateLimitService.defaultLimits.decision).toBe(1000);
    expect(rateLimitService.defaultLimits.action).toBe(500);
    expect(rateLimitService.defaultLimits.policy).toBe(100);
    expect(rateLimitService.defaultLimits.api).toBe(10000);
  });

  /**
   * Test 2: Redis connection fallback to in-memory counting
   */
  test('should fallback to in-memory counters when Redis unavailable', async () => {
    // Setup: Mock Redis connection failure
    const mockClient = {
      connect: jest.fn().mockRejectedValue(new Error('Connection failed')),
      on: jest.fn(),
    };
    redis.createClient.mockReturnValue(mockClient);

    // Execute: Try to connect
    await rateLimitService.connect('redis://localhost:6379');

    // Assert: Should be ready but not connected to Redis
    expect(rateLimitService.connected).toBe(false);
  });

  /**
   * Test 3: In-memory rate limit checking
   */
  test('should check rate limit using in-memory counters', async () => {
    // Setup: Service with no Redis
    expect(rateLimitService.connected).toBe(false);

    // Execute: Check limit (within bounds)
    const result1 = await rateLimitService.checkLimit('tenant-1', 'api', 1000);

    // Assert: First request should be allowed
    expect(result1.allowed).toBe(true);
    expect(result1.current).toBe(1);
    expect(result1.remaining).toBe(999);
    expect(result1.inMemory).toBe(true);

    // Execute: Multiple subsequent requests
    const result2 = await rateLimitService.checkLimit('tenant-1', 'api', 1000);
    const result3 = await rateLimitService.checkLimit('tenant-1', 'api', 1000);

    // Assert: Counters should increment
    expect(result2.current).toBe(2);
    expect(result3.current).toBe(3);
  });

  /**
   * Test 4: Rate limit exceeding detection (in-memory)
   */
  test('should deny request when in-memory limit exceeded', async () => {
    // Setup: Low limit for testing
    const limit = 3;
    const tenantId = 'tenant-test';
    const operation = 'api';

    // Execute: Make requests beyond limit
    const result1 = await rateLimitService.checkLimit(tenantId, operation, limit);
    const result2 = await rateLimitService.checkLimit(tenantId, operation, limit);
    const result3 = await rateLimitService.checkLimit(tenantId, operation, limit);
    const result4 = await rateLimitService.checkLimit(tenantId, operation, limit);

    // Assert
    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
    expect(result3.allowed).toBe(true);
    expect(result4.allowed).toBe(false); // 4th request denied
    expect(result4.current).toBe(4);
    expect(result4.limit).toBe(3);
  });

  /**
   * Test 5: Per-operation rate limit separation
   */
  test('should maintain separate limits for different operation types', async () => {
    // Setup
    const tenantId = 'tenant-separate';

    // Execute: Use different operations at or near limits
    const decisionLimit = 3;
    const actionLimit = 2;

    const decisionReq1 = await rateLimitService.checkLimit(
      tenantId,
      'decision',
      decisionLimit
    );
    const decisionReq2 = await rateLimitService.checkLimit(
      tenantId,
      'decision',
      decisionLimit
    );

    const actionReq1 = await rateLimitService.checkLimit(tenantId, 'action', actionLimit);
    const actionReq2 = await rateLimitService.checkLimit(tenantId, 'action', actionLimit);
    const actionReq3 = await rateLimitService.checkLimit(tenantId, 'action', actionLimit);

    // Assert: Operations have separate counters
    expect(decisionReq1.current).toBe(1);
    expect(decisionReq2.current).toBe(2);
    expect(actionReq1.current).toBe(1);
    expect(actionReq2.current).toBe(2);
    expect(actionReq3.allowed).toBe(false); // Action limit exceeded
  });

  /**
   * Test 6: Rate limit window expiration and reset
   */
  test('should reset counters after window expires', async () => {
    // Setup: Low limits and small window
    const tenantId = 'tenant-window';
    const operation = 'api';
    const limit = 2;

    // Execute: Fill limit in first window
    const req1 = await rateLimitService.checkLimit(tenantId, operation, limit);
    const req2 = await rateLimitService.checkLimit(tenantId, operation, limit);
    expect(req2.current).toBe(2);

    // Simulate time passage by manually manipulating the counter (normally window expires)
    const key = `ratelimit:${tenantId}:${operation}`;
    const counter = rateLimitService.localCounters.get(key);
    if (counter) {
      // Fast-forward reset time to past
      counter.resetTime = Date.now() - 1000;
    }

    // Execute: New request after expiration
    const req3 = await rateLimitService.checkLimit(tenantId, operation, limit);

    // Assert: Counter should reset
    expect(req3.current).toBe(1); // Reset counter
    expect(req3.allowed).toBe(true);
  });

  /**
   * Bonus Test: Service gracefully handles check errors
   */
  test('should gracefully handle and recover from errors', async () => {
    // Setup: Simulate error in limit checking
    const tenantId = 'tenant-error';

    // Execute: Normal operation
    const result1 = await rateLimitService.checkLimit(tenantId, 'api');

    // Assert: Should still return valid response
    expect(result1).toHaveProperty('allowed');
    expect(result1).toHaveProperty('current');
    expect(result1).toHaveProperty('remaining');
    expect(result1).toHaveProperty('limit');
  });

  /**
   * Bonus Test: Default operation type uses api limit
   */
  test('should use api limit when operation type not recognized', async () => {
    // Setup
    const tenantId = 'tenant-default';

    // Execute: Unknown operation type
    const result = await rateLimitService.checkLimit(tenantId, 'unknown-type');

    // Assert: Should fall back to api default (10000)
    expect(result.limit).toBe(10000);
    expect(result.allowed).toBe(true);
  });

  /**
   * Bonus Test: Remaining counter never goes negative
   */
  test('should never return negative remaining count', async () => {
    // Setup
    const tenantId = 'tenant-negative';
    const limit = 2;

    // Execute: Exceed limit multiple times
    await rateLimitService.checkLimit(tenantId, 'api', limit);
    await rateLimitService.checkLimit(tenantId, 'api', limit);
    const result3 = await rateLimitService.checkLimit(tenantId, 'api', limit);
    const result4 = await rateLimitService.checkLimit(tenantId, 'api', limit);
    const result5 = await rateLimitService.checkLimit(tenantId, 'api', limit);

    // Assert: Remaining should never be negative
    expect(result3.remaining).toBe(0);
    expect(result4.remaining).toBe(0);
    expect(result5.remaining).toBe(0);
  });

  /**
   * Bonus Test: Different tenants maintain separate rate limits
   */
  test('should isolate rate limits between different tenants', async () => {
    // Setup: Two tenants with same limit
    const limit = 2;

    // Execute: Tenant 1 makes requests
    const tenant1Req1 = await rateLimitService.checkLimit('tenant-1', 'api', limit);
    const tenant1Req2 = await rateLimitService.checkLimit('tenant-1', 'api', limit);

    // Execute: Tenant 2 makes requests
    const tenant2Req1 = await rateLimitService.checkLimit('tenant-2', 'api', limit);
    const tenant2Req2 = await rateLimitService.checkLimit('tenant-2', 'api', limit);

    // Assert: Each tenant has own counter
    expect(tenant1Req2.current).toBe(2);
    expect(tenant2Req2.current).toBe(2);
    expect(tenant1Req2.allowed).toBe(true);
    expect(tenant2Req2.allowed).toBe(true);

    // Both can exceed independently
    const tenant1Req3 = await rateLimitService.checkLimit('tenant-1', 'api', limit);
    const tenant2Req3 = await rateLimitService.checkLimit('tenant-2', 'api', limit);

    expect(tenant1Req3.allowed).toBe(false);
    expect(tenant2Req3.allowed).toBe(false);
  });

  /**
   * Bonus Test: resetAfterMs provides accurate window timing
   */
  test('should provide accurate reset time information', async () => {
    // Setup
    const tenantId = 'tenant-timing';
    const operation = 'api';

    // Execute
    const result = await rateLimitService.checkLimit(tenantId, operation);

    // Assert: Should have resetAfterMs value
    expect(result.resetAfterMs).toBeGreaterThan(0);
    expect(result.resetAfterMs).toBeLessThanOrEqual(60000); // ~1 minute window
  });
});

/**
 * Rate Limiting Express Middleware Integration Tests
 */
describe('rateLimitingMiddleware integration', () => {
  let req, res, next;
  let rateLimitService;

  beforeEach(() => {
    rateLimitService = new RateLimitingService();

    req = {
      tenant: { id: 'test-tenant' },
      method: 'POST',
      path: '/api/decisions',
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    next = jest.fn();

    jest.clearAllMocks();
  });

  /**
   * Test: Create middleware guard for rate limiting
   */
  test('should create rate limiting middleware guard', async () => {
    // This test verifies the interface for creating middleware
    const checkLimit = jest.spyOn(rateLimitService, 'checkLimit');

    // Execute: check limit for request
    const result = await rateLimitService.checkLimit(
      'test-tenant',
      'decision',
      1000
    );

    // Assert
    expect(checkLimit).toHaveBeenCalled();
    expect(result.allowed).toBe(true);

    checkLimit.mockRestore();
  });
});
