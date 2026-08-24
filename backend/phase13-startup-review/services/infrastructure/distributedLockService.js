/**
 * Distributed Lock Service
 * Provides atomic locking for concurrent operations across distributed system
 * Uses Redis with TTL to prevent deadlocks
 * 
 * CRITICAL SAFETY FEATURE: Enforces system-wide health state
 * - Single instance: In-memory fallback allowed
 * - Multi instance: In-memory fallback FORBIDDEN (prevents split-brain)
 * - SAFE_MODE: Disables action execution if Redis down in multi-instance
 * 
 * Usage:
 *   const lock = await lockService.acquire('policy-update:tenant1', 30000);
 *   try {
 *     // Critical section
 *   } finally {
 *     await lock.release();
 *   }
 */

const redis = require('redis');
const crypto = require('crypto');
const systemHealthService = require('./systemHealthService');

// Remove credentials from connection strings before logging
function redactUrl(url) {
  try { const u = new URL(url); if (u.password) u.password = '***'; if (u.username) u.username = '***'; return u.toString(); } catch { return '[redacted]'; }
}

class DistributedLockService {
  constructor() {
    this.client = null;
    this.connected = false;
    this.locks = new Map(); // Track locks in memory as backup
    
    // CRITICAL FIX #3: Use systemHealthService to determine if fallback is safe
    // This replaces static ALLOW_IN_MEMORY_LOCKS setting with dynamic safety checks
    console.log('[lock] 🔒 Lock safety enforced by systemHealthService (dynamic based on deployment mode)');
  }

  /**
   * Connect to Redis
   */
  async connect(url = process.env.REDIS_URL || 'redis://localhost:6379') {
    try {
      console.log(`[lock] Connecting to Redis at ${redactUrl(url)}...`);

      this.client = redis.createClient({ url, socket: { reconnectStrategy: () => null } });

      this.client.on('error', () => {
        this.connected = false;
        systemHealthService.reportRedisStatus(false);
      });

      this.client.on('connect', () => {
        console.log('[lock] ✓ Connected to Redis');
        this.connected = true;
        systemHealthService.reportRedisStatus(true);
      });

      const connectionPromise = this.client.connect();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Redis connection timeout')), 2000)
      );

      try {
        await Promise.race([connectionPromise, timeoutPromise]);
        this.connected = true;
        systemHealthService.reportRedisStatus(true);
      } catch (timeoutError) {
        this.connected = false;
        systemHealthService.reportRedisStatus(false);
        console.warn(`[lock] Redis connection timeout (non-fatal): ${url}`);
      }

      return this;
    } catch (error) {
      console.warn(`[lock] Redis connection failed (non-fatal): ${error.message}`);
      this.connected = false;
      systemHealthService.reportRedisStatus(false);
      return this;
    }
  }

  /**
   * Acquire a lock with timeout
   * @param {string} key - Lock key (e.g., 'policy-update:tenant1')
   * @param {number} ttlMs - Lock TTL in milliseconds (default: 120000ms = 120s for database operations)
   * @param {number} waitMs - Max wait time for lock acquisition
   * @returns {object} Lock object with release() method
   */
  async acquire(key, ttlMs = 120000, waitMs = 5000) {
    const lockId = crypto.randomUUID();
    const startTime = Date.now();
    const redisKey = `lock:${key}`;

    const backoff = {
      initialMs: 10,
      maxMs: 100,
      multiplier: 1.5,
      current: 10,
    };

    while (Date.now() - startTime < waitMs) {
      try {
        if (this.connected && this.client) {
          // Try to acquire with Redis (atomic SET NX)
          const result = await this.client.set(redisKey, lockId, {
            EX: Math.ceil(ttlMs / 1000),
            NX: true,
          });

          if (result === 'OK') {
            console.log(`[lock] ✓ Acquired lock: ${key} (id=${lockId.substring(0, 8)}...)`);

            // Store locally as backup
            this.locks.set(key, {
              id: lockId,
              acquiredAt: Date.now(),
              ttlMs,
            });

            return {
              key,
              lockId,
              release: () => this.release(key, lockId),
              extend: (newTtlMs) => this.extend(key, lockId, newTtlMs),
            };
          }
        } else {
          // CRITICAL FIX #3: Redis unavailable - check if in-memory fallback is safe
          // Use systemHealthService to determine safety based on deployment mode
          const canUseFallback = systemHealthService.allowInMemoryLockFallback();
          
          if (!canUseFallback) {
            // Multi-instance mode with Redis down: FATAL - prevent split-brain
            throw new Error(
              `[lock] FATAL: Redis unavailable in MULTI_INSTANCE mode. ` +
              `Cannot acquire distributed lock for ${key}. ` +
              `In-memory fallback is forbidden to prevent split-brain race conditions. ` +
              `Restore Redis connectivity immediately.`
            );
          }
          
          // Single-instance mode: Warn and use in-memory fallback
          if (!this.locks.has(key)) {
            console.warn(
              `[lock] ⚠️  WARNING: Using in-memory fallback lock (Redis unavailable): ${key}. ` +
              `This is only safe in SINGLE_INSTANCE mode!`
            );
            
            this.locks.set(key, {
              id: lockId,
              acquiredAt: Date.now(),
              ttlMs,
            });

            return {
              key,
              lockId,
              release: () => this.release(key, lockId),
              extend: (newTtlMs) => this.extend(key, lockId, newTtlMs),
            };
          }
        }

        // Lock not available, wait and retry with backoff
        const waitTime = Math.min(backoff.current, backoff.maxMs);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        backoff.current = Math.min(backoff.current * backoff.multiplier, backoff.maxMs);
      } catch (error) {
        console.error(`[lock] Error acquiring lock: ${error.message}`);
        
        // Check if this is a safety-related error (should propagate immediately)
        if (error.message.includes('FATAL') || error.message.includes('MULTI_INSTANCE')) {
          throw error;
        }
        
        // For other errors, try in-memory fallback if safe
        const canUseFallback = systemHealthService.allowInMemoryLockFallback();
        if (!canUseFallback) {
          throw new Error(
            `[lock] FATAL: Lock acquisition failed and in-memory fallback not allowed (multi-instance with Redis unavailable). ` +
            `Original error: ${error.message}`
          );
        }
        
        if (!this.locks.has(key)) {
          console.warn(`[lock] ⚠️  Falling back to in-memory lock after error: ${error.message}`);
          this.locks.set(key, { id: lockId, acquiredAt: Date.now(), ttlMs });
          return {
            key,
            lockId,
            release: () => this.release(key, lockId),
            extend: (newTtlMs) => this.extend(key, lockId, newTtlMs),
          };
        }
      }
    }

    throw new Error(`[lock] Timeout acquiring lock: ${key} after ${waitMs}ms`);
  }

  /**
   * Release a lock
   * @param {string} key - Lock key
   * @param {string} lockId - Lock ID (must match to prevent releasing someone else's lock)
   */
  async release(key, lockId) {
    const redisKey = `lock:${key}`;

    try {
      if (this.connected && this.client) {
        // Use Lua script for atomic get-and-delete
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;

        const result = await this.client.eval(script, { keys: [redisKey], arguments: [lockId] });

        if (result === 1) {
          console.log(`[lock] ✓ Released lock: ${key}`);
        } else {
          console.warn(`[lock] Lock ID mismatch for key: ${key} (another process may own it)`);
        }
      }

      // Also remove from in-memory
      const localLock = this.locks.get(key);
      if (localLock && localLock.id === lockId) {
        this.locks.delete(key);
      }
    } catch (error) {
      console.error(`[lock] Error releasing lock: ${error.message}`);
      // Still remove from local memory
      const localLock = this.locks.get(key);
      if (localLock && localLock.id === lockId) {
        this.locks.delete(key);
      }
    }
  }

  /**
   * Extend a lock's TTL
   * @param {string} key - Lock key
   * @param {string} lockId - Lock ID
   * @param {number} newTtlMs - New TTL in milliseconds
   */
  async extend(key, lockId, newTtlMs = 30000) {
    const redisKey = `lock:${key}`;

    try {
      if (this.connected && this.client) {
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("expire", KEYS[1], ARGV[2])
          else
            return 0
          end
        `;

        const result = await this.client.eval(script, {
          keys: [redisKey],
          arguments: [lockId, Math.ceil(newTtlMs / 1000)],
        });

        if (result === 1) {
          console.log(`[lock] ✓ Extended lock TTL: ${key}`);
        }
      }

      // Also extend in-memory
      const localLock = this.locks.get(key);
      if (localLock && localLock.id === lockId) {
        localLock.ttlMs = newTtlMs;
      }
    } catch (error) {
      console.error(`[lock] Error extending lock: ${error.message}`);
    }
  }

  /**
   * Check if lock exists
   * @param {string} key - Lock key
   */
  async exists(key) {
    const redisKey = `lock:${key}`;

    try {
      if (this.connected && this.client) {
        const result = await this.client.exists(redisKey);
        return result === 1;
      }

      return this.locks.has(key);
    } catch (error) {
      console.error(`[lock] Error checking lock: ${error.message}`);
      return this.locks.has(key);
    }
  }

  /**
   * Get Redis client for multi-instance coordination
   * Used by MultiInstanceCoordinator to access Redis directly
   * @returns {object} Redis client instance (may be null if not connected)
   */
  getRedisClient() {
    return this.client;
  }
}

module.exports = new DistributedLockService();
