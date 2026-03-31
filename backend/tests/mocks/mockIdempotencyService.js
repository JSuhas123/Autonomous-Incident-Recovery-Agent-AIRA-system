/**
 * Mock Idempotency Service for Development/Testing
 * Provides in-memory idempotency tracking when Redis is unavailable
 */

class MockIdempotencyService {
  constructor() {
    this.idempotencyCache = new Map();
    this.connected = true;
  }

  /**
   * Connect to idempotency service (mock - always succeeds)
   */
  async connect(url) {
    console.log("[mock-idempotency] Connected (in-memory mock)");
    this.connected = true;
    return this;
  }

  /**
   * Generate an idempotency key from tenant/action/correlation
   */
  static generateKey(tenantId, action, correlationId) {
    const crypto = require('crypto');
    return crypto.createHash('sha256')
      .update(`${tenantId}:${action}:${correlationId}`)
      .digest('hex');
  }

  /**
   * Check if an action has been idempotently executed
   */
  async checkIdempotency(idempotencyKey) {
    if (this.idempotencyCache.has(idempotencyKey)) {
      return {
        isDuplicate: true,
        result: this.idempotencyCache.get(idempotencyKey),
      };
    }
    return { isDuplicate: false, result: null };
  }

  /**
   * Record an action as executed (idempotent)
   */
  async recordExecution(idempotencyKey, result) {
    this.idempotencyCache.set(idempotencyKey, result);
    return true;
  }

  /**
   * Clear idempotency record for an action
   */
  async clearRecord(idempotencyKey) {
    this.idempotencyCache.delete(idempotencyKey);
    return true;
  }

  /**
   * Get idempotency stats
   */
  getStats() {
    return {
      cacheSize: this.idempotencyCache.size,
      connected: this.connected,
    };
  }
}

// Singleton instance
let mockInstance = null;

function getMockIdempotencyService() {
  if (!mockInstance) {
    mockInstance = new MockIdempotencyService();
  }
  return mockInstance;
}

// Static method available on the function
getMockIdempotencyService.generateKey = MockIdempotencyService.generateKey;

module.exports = getMockIdempotencyService();
