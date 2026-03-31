/**
 * Circuit Breaker Service
 * Implements circuit breaker pattern for fault tolerance
 */

class CircuitBreakerService {
  static STATES = {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN',
  };

  static DEFAULTS = {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000, // 30 seconds
  };

  constructor(name, options = {}) {
    this.name = name;
    this.state = this.constructor.STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;

    this.failureThreshold =
      options.failureThreshold || this.constructor.DEFAULTS.failureThreshold;
    this.successThreshold =
      options.successThreshold || this.constructor.DEFAULTS.successThreshold;
    this.timeout = options.timeout || this.constructor.DEFAULTS.timeout;
  }

  /**
   * Execute operation through circuit breaker
   */
  async execute(operation) {
    if (this.state === this.constructor.STATES.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(
          `Circuit breaker [${this.name}] is OPEN. Retry after ${new Date(this.nextAttemptTime).toISOString()}`
        );
      }
      this.state = this.constructor.STATES.HALF_OPEN;
    }

    try {
      const result = await operation();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  _onSuccess() {
    this.failureCount = 0;

    if (this.state === this.constructor.STATES.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = this.constructor.STATES.CLOSED;
        this.successCount = 0;
      }
    }
  }

  /**
   * Handle failed operation
   */
  _onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = this.constructor.STATES.OPEN;
      this.nextAttemptTime = Date.now() + this.timeout;
    }

    if (this.state === this.constructor.STATES.HALF_OPEN) {
      this.state = this.constructor.STATES.OPEN;
      this.nextAttemptTime = Date.now() + this.timeout;
    }
  }

  /**
   * Get current state
   */
  getState() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this.state = this.constructor.STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }
}

module.exports = CircuitBreakerService;
