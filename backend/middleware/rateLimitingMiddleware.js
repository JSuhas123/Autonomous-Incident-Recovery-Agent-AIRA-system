/**
 * Rate Limiting Middleware
 * Enforces per-tenant rate limits using Redis
 * 
 * Configuration:
 * - Default: 1000 requests per minute per tenant
 * - Can be customized via TenantConfig.rateLimits
 */

const redis = require('redis');

class RateLimitingService {
  constructor() {
    this.client = null;
    this.connected = false;
    this.localCounters = new Map(); // In-memory fallback

    // Default limits: requests per minute
    this.defaultLimits = {
      decision: 1000,
      action: 500,
      policy: 100,
      api: 10000,
    };
  }

  /**
   * Connect to Redis
   */
  async connect(url = process.env.REDIS_URL || 'redis://localhost:6379') {
    try {
      console.log(`[rate-limit] Connecting to Redis at ${url}...`);

      this.client = redis.createClient({ url, socket: { reconnectStrategy: () => null } });

      this.client.on('error', () => {
        this.connected = false;
      });

      this.client.on('connect', () => {
        console.log('[rate-limit] ✓ Connected to Redis');
        this.connected = true;
      });

      const connectionPromise = this.client.connect();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Redis connection timeout')), 2000)
      );

      try {
        await Promise.race([connectionPromise, timeoutPromise]);
        this.connected = true;
      } catch (timeoutError) {
        this.connected = false;
        console.warn(`[rate-limit] Redis connection timeout (non-fatal): ${url}`);
      }

      return this;
    } catch (error) {
      console.warn(`[rate-limit] Redis connection failed (non-fatal): ${error.message}`);
      this.connected = false;
      return this;
    }
  }

  /**
   * Check if request is allowed
   * Uses token bucket algorithm with sliding window
   * 
   * @param {string} tenantId - Tenant identifier
   * @param {string} operation - Operation type (decision, action, policy, api)
   * @param {number} limit - Requests per minute (optional)
   * @returns {object} {allowed, remaining, resetAfterMs}
   */
  async checkLimit(tenantId, operation = 'api', limit = null) {
    const finalLimit = limit || this.defaultLimits[operation] || this.defaultLimits.api;
    const key = `ratelimit:${tenantId}:${operation}`;
    const window = 60; // 1 minute window

    try {
      if (this.connected && this.client) {
        // Use Redis Lua script for atomic increment and check
        const script = `
          local key = KEYS[1]
          local limit = tonumber(ARGV[1])
          local window = tonumber(ARGV[2])
          
          local current = redis.call('incr', key)
          if current == 1 then
            redis.call('expire', key, window)
          end
          
          local remaining = limit - current
          local ttl = redis.call('pttl', key)
          
          return {current, remaining, ttl}
        `;

        const [current, remaining, ttl] = await this.client.eval(script, {
          keys: [key],
          arguments: [finalLimit.toString(), window.toString()],
        });

        const allowed = current <= finalLimit;

        return {
          allowed,
          current,
          remaining: Math.max(0, remaining),
          resetAfterMs: Math.max(0, ttl),
          limit: finalLimit,
        };
      } else {
        // Fallback to in-memory counting
        const counter = this.localCounters.get(key) || {
          count: 0,
          resetTime: Date.now() + 60000,
        };

        // Reset if window expired
        if (Date.now() > counter.resetTime) {
          counter.count = 0;
          counter.resetTime = Date.now() + 60000;
        }

        counter.count++;
        this.localCounters.set(key, counter);

        const allowed = counter.count <= finalLimit;

        return {
          allowed,
          current: counter.count,
          remaining: Math.max(0, finalLimit - counter.count),
          resetAfterMs: Math.max(0, counter.resetTime - Date.now()),
          limit: finalLimit,
          inMemory: true,
        };
      }
    } catch (error) {
      console.error(`[rate-limit] Error checking limit: ${error.message}`);
      // Fail open - allow the request
      return {
        allowed: true,
        remaining: finalLimit,
        resetAfterMs: 60000,
        limit: finalLimit,
        error: error.message,
      };
    }
  }

  /**
   * Reset limit for tenant
   */
  async resetLimit(tenantId, operation) {
    const key = `ratelimit:${tenantId}:${operation}`;

    try {
      if (this.connected && this.client) {
        await this.client.del(key);
      } else {
        this.localCounters.delete(key);
      }
    } catch (error) {
      console.error(`[rate-limit] Error resetting limit: ${error.message}`);
    }
  }

  /**
   * Get current usage
   */
  async getUsage(tenantId, operation) {
    const key = `ratelimit:${tenantId}:${operation}`;

    try {
      if (this.connected && this.client) {
        const count = await this.client.get(key);
        return { count: count ? parseInt(count, 10) : 0 };
      } else {
        const counter = this.localCounters.get(key);
        return { count: counter ? counter.count : 0 };
      }
    } catch (error) {
      console.error(`[rate-limit] Error getting usage: ${error.message}`);
      return { count: 0, error: error.message };
    }
  }
}

/**
 * Express middleware for rate limiting
 */
function rateLimitingMiddleware(operation = 'api') {
  const service = new RateLimitingService();
  service.connect();

  return async (req, res, next) => {
    try {
      const tenantId = req.params.tenantId || req.get('x-tenant-id') || 'default';
      const limit = req.get('x-rate-limit') ? parseInt(req.get('x-rate-limit'), 10) : null;

      const result = await service.checkLimit(tenantId, operation, limit);

      // Add rate limit headers
      res.set('X-Rate-Limit-Limit', result.limit.toString());
      res.set('X-Rate-Limit-Remaining', result.remaining.toString());
      res.set('X-Rate-Limit-Reset', (Date.now() + result.resetAfterMs).toString());

      if (!result.allowed) {
        return res.status(429).json({
          error: 'Too many requests',
          retryAfterMs: result.resetAfterMs,
          limit: result.limit,
          current: result.current,
        });
      }

      next();
    } catch (error) {
      console.error('[rate-limit-middleware] Error:', error.message);
      // Fail open - allow the request to prevent cascading failures
      next();
    }
  };
}

module.exports = {
  RateLimitingService,
  rateLimitingMiddleware,
  createRateLimitService: () => new RateLimitingService(),
};
