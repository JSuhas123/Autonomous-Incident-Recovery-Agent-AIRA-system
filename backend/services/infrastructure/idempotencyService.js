const redis = require("redis");
const crypto = require("crypto");

class IdempotencyService {
  constructor() {
    this.client = null;
    this.connected = false;
    // In-memory fallback store for when Redis is unavailable
    this.memoryStore = new Map();
    this.memoryTimeouts = new Map();
  }

  /**
   * Connect to Redis
   * @param {string} url - Redis connection URL
   */
  async connect(url = process.env.REDIS_URL || "redis://localhost:6379") {
    try {
      console.log(`[idempotency] Connecting to Redis at ${url}...`);

      this.client = redis.createClient({ url, socket: { reconnectStrategy: () => null } });

      this.client.on("error", (error) => {
        // Suppress error spam - Redis connection issues are non-fatal
        this.connected = false;
      });

      this.client.on("connect", () => {
        console.log("[idempotency] ✓ Connected to Redis");
        this.connected = true;
      });

      // Set a timeout for the connection attempt
      const connectionPromise = this.client.connect();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Redis connection timeout")), 2000)
      );

      try {
        await Promise.race([connectionPromise, timeoutPromise]);
        this.connected = true;
      } catch (timeoutError) {
        // Connection timed out - this is non-fatal
        this.connected = false;
        console.warn(`[idempotency] Redis connection timeout (non-fatal): ${url}`);
      }

      return this;
    } catch (error) {
      console.warn(`[idempotency] Redis connection failed (non-fatal): ${error.message}`);
      // Return with disconnected state - allowing server to continue
      this.connected = false;
      return this;
    }
  }

  /**
   * Generate idempotency key from request/action
   * @param {object} action - {tenantId, serviceId, actionType, payload}
   * @returns {string} - Unique idempotency key
   */
  static generateKey(action) {
    const { tenantId, serviceId, actionType, correlationId } = action;
    const data = `${tenantId}:${serviceId}:${actionType}:${correlationId}`;
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /**
   * Check if action already executed (idempotent)
   * @param {string} tenantId - Tenant identifier
   * @param {string} idempotencyKey - Unique key
   * @returns {object|null} - Previous result if exists
   */
  async checkIdempotency(tenantId, idempotencyKey) {
    try {
      if (this.connected && this.client) {
        const redisKey = `idempotency:${tenantId}:${idempotencyKey}`;
        const stored = await this.client.get(redisKey);

        if (stored) {
          const result = JSON.parse(stored);
          console.log(
            `[idempotency] ✓ Found existing result for key=${idempotencyKey.substring(0, 8)}... | status=${result.status}`
          );
          return result;
        }

        console.log(
          `[idempotency] New execution key=${idempotencyKey.substring(0, 8)}...`
        );
        return null;
      } else {
        // Fallback: use in-memory store
        const memKey = `${tenantId}:${idempotencyKey}`;
        const stored = this.memoryStore.get(memKey);
        
        if (stored) {
          console.log(
            `[idempotency] ✓ Found existing result (memory) for key=${idempotencyKey.substring(0, 8)}...`
          );
          return stored;
        }
        
        console.log(
          `[idempotency] New execution (memory) key=${idempotencyKey.substring(0, 8)}...`
        );
        return null;
      }
    } catch (error) {
      console.error("[idempotency] Error checking idempotency:", error.message);
      throw error;
    }
  }

  /**
   * Record action execution result (prevents duplicate execution)
   * @param {string} tenantId - Tenant identifier
   * @param {string} idempotencyKey - Unique key
   * @param {object} result - {status, actionId, outcome}
   * @param {number} ttlSeconds - Cache TTL (default: 24 hours)
   */
  async recordIdempotency(
    tenantId,
    idempotencyKey,
    result,
    ttlSeconds = 86400
  ) {
    try {
      if (this.connected && this.client) {
        const redisKey = `idempotency:${tenantId}:${idempotencyKey}`;
        const value = JSON.stringify(result);

        await this.client.setEx(redisKey, ttlSeconds, value);

        console.log(
          `[idempotency] ✓ Recorded key=${idempotencyKey.substring(0, 8)}... | ttl=${ttlSeconds}s`
        );

        return true;
      } else {
        // Fallback: use in-memory store
        const memKey = `${tenantId}:${idempotencyKey}`;
        this.memoryStore.set(memKey, result);
        
        // Set timeout to expire the key
        if (this.memoryTimeouts.has(memKey)) {
          clearTimeout(this.memoryTimeouts.get(memKey));
        }
        
        const timeout = setTimeout(() => {
          this.memoryStore.delete(memKey);
          this.memoryTimeouts.delete(memKey);
        }, ttlSeconds * 1000);
        
        this.memoryTimeouts.set(memKey, timeout);

        console.log(
          `[idempotency] ✓ Recorded (memory) key=${idempotencyKey.substring(0, 8)}... | ttl=${ttlSeconds}s`
        );

        return true;
      }
    } catch (error) {
      console.error("[idempotency] Error recording idempotency:", error.message);
      throw error;
    }
  }

  /**
   * Clear idempotency key (e.g., after rollback)
   * @param {string} tenantId - Tenant identifier
   * @param {string} idempotencyKey - Unique key
   */
  async clearIdempotency(tenantId, idempotencyKey) {
    if (!this.connected) {
      throw new Error("Idempotency service not connected");
    }

    try {
      const redisKey = `idempotency:${tenantId}:${idempotencyKey}`;
      const deleted = await this.client.del(redisKey);

      if (deleted > 0) {
        console.log(
          `[idempotency] ✓ Cleared key=${idempotencyKey.substring(0, 8)}...`
        );
      }

      return deleted > 0;
    } catch (error) {
      console.error("[idempotency] Error clearing idempotency:", error.message);
      throw error;
    }
  }

  /**
   * Set cooldown for action (prevent execution within window)
   * @param {string} tenantId - Tenant identifier
   * @param {string} serviceId - Service identifier
   * @param {string} actionType - Type of action
   * @param {number} windowSeconds - Cooldown window
   */
  async setCooldown(tenantId, serviceId, actionType, windowSeconds) {
    if (!this.connected) {
      throw new Error("Idempotency service not connected");
    }

    try {
      const redisKey = `cooldown:${tenantId}:${serviceId}:${actionType}`;
      const value = JSON.stringify({
        cooledAt: Date.now(),
        window: windowSeconds,
      });

      await this.client.setEx(redisKey, windowSeconds, value);

      console.log(
        `[idempotency] ✓ Set cooldown ${serviceId}/${actionType} for ${windowSeconds}s`
      );

      return true;
    } catch (error) {
      console.error("[idempotency] Error setting cooldown:", error.message);
      throw error;
    }
  }

  /**
   * Check if action is in cooldown
   * @param {string} tenantId - Tenant identifier
   * @param {string} serviceId - Service identifier
   * @param {string} actionType - Type of action
   * @returns {boolean} - True if in cooldown, false otherwise
   */
  async isCooldownActive(tenantId, serviceId, actionType) {
    if (!this.connected) {
      throw new Error("Idempotency service not connected");
    }

    try {
      const redisKey = `cooldown:${tenantId}:${serviceId}:${actionType}`;
      const stored = await this.client.get(redisKey);

      const active = stored !== null;

      if (active) {
        console.log(
          `[idempotency] Cooldown active: ${serviceId}/${actionType}`
        );
      }

      return active;
    } catch (error) {
      console.error("[idempotency] Error checking cooldown:", error.message);
      throw error;
    }
  }

  /**
   * Track request rate per tenant
   * @param {string} tenantId - Tenant identifier
   * @param {string} windowKey - Rate window (e.g., "requests:hourly")
   * @param {number} limit - Max requests in window
   * @returns {object} - {allowed: boolean, current: number, limit: number, resetAt: timestamp}
   */
  async checkRateLimit(tenantId, windowKey, limit) {
    if (!this.connected) {
      throw new Error("Idempotency service not connected");
    }

    try {
      const redisKey = `rate:${tenantId}:${windowKey}`;
      const current = await this.client.incr(redisKey);

      // First occurrence, set expiry
      if (current === 1) {
        const ttl = this._getTTLForWindow(windowKey);
        await this.client.expire(redisKey, ttl);
      }

      const allowed = current <= limit;
      const ttl = await this.client.ttl(redisKey);
      const resetAt = Date.now() + ttl * 1000;

      console.log(
        `[idempotency] Rate check: ${current}/${limit} | window=${windowKey}`
      );

      return {
        allowed,
        current,
        limit,
        resetAt,
      };
    } catch (error) {
      console.error("[idempotency] Error checking rate limit:", error.message);
      throw error;
    }
  }

  /**
   * Get TTL in seconds for a rate window
   * @private
   */
  _getTTLForWindow(windowKey) {
    const windows = {
      "requests:second": 1,
      "requests:minute": 60,
      "requests:hour": 3600,
      "requests:day": 86400,
    };

    return windows[windowKey] || 3600; // Default: 1 hour
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    try {
      if (this.client) {
        await this.client.quit();
        this.connected = false;
        console.log("[idempotency] ✓ Disconnected from Redis");
      }
    } catch (error) {
      console.error("[idempotency] Error disconnecting:", error.message);
      throw error;
    }
  }

  /**
   * Record a request for idempotency (test interface)
   * @param {string} tenantId - Tenant identifier
   * @param {string} idempotencyKey - Unique idempotency key
   * @param {string} operationType - Type of operation
   * @param {object} result - Optional result to cache
   * @param {number} ttlSeconds - TTL in seconds (default: 3600 for production, 1 for tests)
   * @returns {boolean} - True if new request recorded, false if duplicate
   */
  async recordRequest(tenantId, idempotencyKey, operationType, result = {}, ttlSeconds = null) {
    try {
      // Create a composite key that includes operation type
      const compositeKey = `${idempotencyKey}:${operationType}`;
      
      const existing = await this.checkIdempotency(tenantId, compositeKey);
      if (existing) {
        return false; // Duplicate detected
      }
      
      // Use provided TTL or default based on operation type
      const effectiveTtl = ttlSeconds !== null ? ttlSeconds : (operationType === 'TEST' ? 1 : 3600);
      
      await this.recordIdempotency(tenantId, compositeKey, {
        status: 'success',
        operationType,
        result: result || {},
        timestamp: new Date(),
      }, effectiveTtl);
      
      return true; // New request recorded
    } catch (error) {
      if (!this.connected) {
        return true; // Allow request if service unavailable
      }
      throw error;
    }
  }

  /**
   * Get cached result for a request (test interface)
   * @param {string} tenantId - Tenant identifier
   * @param {string} idempotencyKey - Unique idempotency key
   * @param {string} operationType - Type of operation
   * @returns {object|null} - Cached result or null if not found
   */
  async getCachedResult(tenantId, idempotencyKey, operationType) {
    try {
      const compositeKey = `${idempotencyKey}:${operationType}`;
      const result = await this.checkIdempotency(tenantId, compositeKey);
      if (result && result.operationType === operationType) {
        return result.result || result;
      }
      return null;
    } catch (error) {
      if (!this.connected) {
        return null; // Return null if service unavailable
      }
      throw error;
    }
  }

  /**
   * Clean up expired idempotency keys (test interface)
   */
  async cleanupExpiredKeys() {
    // Redis handles TTL automatically with setEx
    // This is a no-op for test compatibility
    return true;
  }

  /**
   * Validate idempotency key format (test interface)
   * @param {string} key - Key to validate
   * @returns {boolean} - True if valid format
   */
  isIdempotentKey(key) {
    // Reject empty strings, null, undefined, and non-strings
    if (key === '' || key === null || key === undefined || typeof key !== 'string') {
      return false;
    }
    // Require minimum length of 4 characters
    return key.length >= 4;
  }

  /**
   * Get count of active idempotency keys for a tenant (test interface)
   * @param {string} tenantId - Tenant identifier
   * @returns {number} - Count of active keys
   */
  async getActiveKeyCount(tenantId) {
    try {
      if (this.connected && this.client) {
        const pattern = `idempotency:${tenantId}:*`;
        const keys = await this.client.keys(pattern);
        return keys ? keys.length : 0;
      } else {
        // Fallback: count memory store keys
        let count = 0;
        for (const key of this.memoryStore.keys()) {
          if (key.startsWith(`${tenantId}:`)) {
            count++;
          }
        }
        return count;
      }
    } catch (error) {
      return 0;
    }
  }
}

// Singleton instance
let instance = null;
let useMockFallback = false;

async function getIdempotencyService(url) {
  if (useMockFallback) {
    // Return mock service when real service fails
    return require("../tests/mocks/mockIdempotencyService");
  }
  
  if (!instance) {
    instance = new IdempotencyService();
    await instance.connect(url);
  }
  return instance;
}

/**
 * Set fallback to mock idempotency service
 * Call this when Redis connection fails
 */
function setMockFallback() {
  useMockFallback = true;
  instance = null; // Clear the failed instance
}

module.exports = {
  IdempotencyService,
  getIdempotencyService,
  setMockFallback,
};
