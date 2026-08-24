/**
 * System Health Service
 * Manages system-wide health state and degradation modes
 * 
 * CRITICAL FIX #3: REDIS FAILURE STRATEGY
 * When Redis is unavailable:
 * - Single instance: Allow fallback to in-memory locks (risky but isolated)
 * - Multi instance: Enter SAFE_MODE (disable action execution, block queue writes)
 * 
 * This prevents split-brain scenarios where multiple instances acquire conflicting locks
 */

class SystemHealthService {
  constructor() {
    // Detect deployment mode from environment
    this.nodeInstanceId = process.env.NODE_INSTANCE_ID || null;
    this.isMultiInstance = process.env.NODE_INSTANCE_ID != null; // Multi-instance if ID is set
    
    // Health state
    this.redisConnected = false;
    this.redisLastCheckTime = null;
    this.redisFailureStartTime = null;
    this.isSafeMode = false;
    this.lastHealthCheck = null;

    console.log(`[system-health] Deployment mode: ${this.isMultiInstance ? 'MULTI_INSTANCE (NODE_INSTANCE_ID=' + this.nodeInstanceId + ')' : 'SINGLE_INSTANCE'}`);
    
    if(this.isMultiInstance) {
      console.log('[system-health] ⚠️  MULTI_INSTANCE mode: In-memory lock fallback will be DISABLED');
    }
  }

  /**
   * Report Redis connection status
   * Call this from distributedLockService when connection changes
   */
  reportRedisStatus(isConnected) {
    this.redisConnected = isConnected;
    this.redisLastCheckTime = Date.now();

    if (!isConnected && !this.redisFailureStartTime) {
      this.redisFailureStartTime = Date.now();
      
      if (this.isMultiInstance) {
        this.isSafeMode = true;
        console.error('[system-health] 🔴 CRITICAL: Redis disconnected in MULTI_INSTANCE mode');
        console.error('[system-health] 🔴 Entering SAFE_MODE - action execution DISABLED');
        console.error('[system-health] 🔴 To recover: Restore Redis connectivity');
      } else {
        console.warn('[system-health] ⚠️  Redis disconnected (SINGLE_INSTANCE mode - will use in-memory fallback)');
      }
    }

    if (isConnected && this.redisFailureStartTime) {
      const downtime = Date.now() - this.redisFailureStartTime;
      console.log(`[system-health] ✓ Redis reconnected after ${downtime}ms downtime`);
      this.redisFailureStartTime = null;
      this.isSafeMode = false;
    }
  }

  /**
   * Check if system can execute actions
   * Returns false if in SAFE_MODE (Redis down + multi-instance)
   */
  canExecuteActions() {
    return !this.isSafeMode;
  }

  /**
   * Check if system can accept queue writes
   * In SAFE_MODE, can still accept signal ingestion for later processing
   * but cannot queue for execution
   */
  canQueueForExecution() {
    return !this.isSafeMode;
  }

  /**
   * Get health status object for /health endpoint
   */
  getHealthStatus() {
    return {
      status: this.isSafeMode ? 'degraded' : 'healthy',
      timestamp: new Date().toISOString(),
      safeMode: this.isSafeMode,
      deploymentMode: this.isMultiInstance ? 'multi-instance' : 'single-instance',
      redis: {
        connected: this.redisConnected,
        lastCheckTime: this.redisLastCheckTime ? new Date(this.redisLastCheckTime).toISOString() : null,
        failureStartTime: this.redisFailureStartTime ? new Date(this.redisFailureStartTime).toISOString() : null,
      },
      warnings: this._getWarnings(),
    };
  }

  /**
   * Get array of active warnings
   */
  _getWarnings() {
    const warnings = [];
    
    if (this.isSafeMode) {
      warnings.push({
        level: 'CRITICAL',
        message: 'System in SAFE_MODE: action execution disabled due to Redis unavailability in multi-instance deployment',
        action: 'Restore Redis connectivity immediately',
      });
    }

    if (!this.redisConnected && !this.isSafeMode) {
      warnings.push({
        level: 'WARNING',
        message: 'Redis unavailable but using in-memory lock fallback (SINGLE_INSTANCE mode only)',
        action: 'Restore Redis connectivity to ensure safety in multi-instance scenarios',
      });
    }

    const redisDowntimeMinutes = this.redisFailureStartTime 
      ? Math.floor((Date.now() - this.redisFailureStartTime) / 60000) 
      : 0;
    
    if (redisDowntimeMinutes > 5) {
      warnings.push({
        level: 'CRITICAL',
        message: `Redis has been unavailable for ${redisDowntimeMinutes} minutes`,
        action: 'Investigate Redis infrastructure immediately',
      });
    }

    return warnings;
  }

  /**
   * Check if in-memory lock fallback is allowed
   * CRITICAL: In multi-instance mode with Redis down, return false
   */
  allowInMemoryLockFallback() {
    // Multi-instance: never allow in-memory fallback
    if (this.isMultiInstance && !this.redisConnected) {
      return false;
    }

    // Single-instance: allow fallback
    return true;
  }

  /**
   * Get detailed status for diagnostics
   */
  getDiagnostics() {
    return {
      deploymentMode: this.isMultiInstance ? 'multi-instance' : 'single-instance',
      nodeInstanceId: this.nodeInstanceId,
      redisConnected: this.redisConnected,
      safeMode: this.isSafeMode,
      redisDowntime: this.redisFailureStartTime 
        ? Date.now() - this.redisFailureStartTime 
        : 0,
      allowInMemoryFallback: this.allowInMemoryLockFallback(),
      canExecuteActions: this.canExecuteActions(),
      canQueueForExecution: this.canQueueForExecution(),
      lastHealthCheck: this.lastHealthCheck ? new Date(this.lastHealthCheck).toISOString() : null,
    };
  }
}

module.exports = new SystemHealthService();
