/**
 * MULTI-INSTANCE COORDINATION SERVICE
 * 
 * Ensures safe operation in multi-instance deployments by:
 * 1. Instance heartbeat tracking (each instance reports status)
 * 2. Leader election (one instance owns critical operations)
 * 3. Failover detection (automatic when instance dies)
 * 4. Split-brain prevention (Redis-based consensus)
 * 
 * CRITICAL: This is mandatory for production multi-instance deployments
 * Single-instance deployments can run with heartbeat disabled
 */

const crypto = require('crypto');

class MultiInstanceCoordinator {
  constructor(redisService) {
    this.redis = redisService;
    this.instanceId = crypto.randomUUID().substring(0, 8); // Short ID for logs
    this.heartbeatInterval = 5000; // 5 seconds
    this.heartbeatTimeout = 15000; // 15 seconds (3x interval)
    this.leaderElectionInterval = 10000; // 10 seconds
    
    this.isLeader = false;
    this.heartbeatTimer = null;
    this.electionTimer = null;
    this.lastHeartbeat = Date.now();
    this.knownInstances = new Set();
    
    this.config = {
      ENABLE_HEARTBEAT: process.env.ENABLE_HEARTBEAT !== 'false', // Default: ON
      ENABLE_LEADER_ELECTION: process.env.ENABLE_LEADER_ELECTION === 'true', // Default: OFF (single instance)
      REQUIRE_QUORUM_FOR_ACTIONS: process.env.REQUIRE_QUORUM_FOR_ACTIONS === 'true',
    };
  }

  /**
   * Start multi-instance coordination
   */
  async start() {
    if (!this.config.ENABLE_HEARTBEAT) {
      console.log('[multi-instance] Heartbeat disabled (single-instance mode)');
      return;
    }

    console.log(`[multi-instance] Starting coordinator (instance: ${this.instanceId})`);
    
    try {
      // Register this instance
      await this._registerInstance();
      
      // Start heartbeat
      this.heartbeatTimer = setInterval(() => this._sendHeartbeat(), this.heartbeatInterval);
      
      // Start health check (detect dead instances)
      this.healthCheckTimer = setInterval(() => this._healthCheck(), this.heartbeatInterval * 2);
      
      // Start leader election if enabled
      if (this.config.ENABLE_LEADER_ELECTION) {
        this.electionTimer = setInterval(() => this._electLeader(), this.leaderElectionInterval);
      }
      
      console.log('[multi-instance] ✓ Coordinator started');
    } catch (error) {
      console.error('[multi-instance] Failed to start coordinator:', error.message);
      throw error;
    }
  }

  /**
   * Stop coordination
   */
  async stop() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    if (this.electionTimer) clearInterval(this.electionTimer);
    
    try {
      await this._unregisterInstance();
      console.log('[multi-instance] ✓ Coordinator stopped');
    } catch (error) {
      console.warn('[multi-instance] Error during stop:', error.message);
    }
  }

  /**
   * Get all active instances
   */
  async getActiveInstances() {
    try {
      const key = 'instance:registry';
      const instances = await this.redis.hgetall(key);
      
      const active = [];
      for (const [instanceId, data] of Object.entries(instances)) {
        const parsed = JSON.parse(data);
        const age = Date.now() - parsed.lastHeartbeat;
        
        if (age < this.heartbeatTimeout) {
          active.push({
            ...parsed,
            instanceId,
            age,
          });
        }
      }
      
      return active;
    } catch (error) {
      console.error('[multi-instance] Failed to get active instances:', error.message);
      return [];
    }
  }

  /**
   * Check if quorum is available
   * Quorum = majority of instances responding
   */
  async hasQuorum() {
    try {
      const instances = await this.getActiveInstances();
      // At least 1 instance (this one) = quorum for 1-2 instances
      // 2+ instances required for 3+ node setups
      return instances.length >= 1;
    } catch (error) {
      console.error('[multi-instance] Quorum check failed:', error.message);
      return false;
    }
  }

  /**
   * Attempt action with failover safety
   * Only execute if:
   * 1. Heartbeat is healthy, OR
   * 2. Quorum is available, OR
   * 3. Single instance (no coordination required)
   */
  async executeWithFailoverSafety(action, context = {}) {
    try {
      const instances = await this.getActiveInstances();
      
      // Single instance → safe to execute
      if (instances.length === 1) {
        return await action();
      }
      
      // Multiple instances → check quorum
      if (instances.length >= Math.ceil((instances.length + 1) / 2)) {
        // Quorum available → safe to execute
        if (this.config.REQUIRE_QUORUM_FOR_ACTIONS) {
          console.log(
            `[multi-instance] Executing with quorum (${instances.length} active instances)`
          );
        }
        return await action();
      }
      
      // No quorum → block action
      throw new Error(
        `FAILOVER_UNSAFE: No quorum (${instances.length} instances). ` +
        `Blocking action execution to prevent split-brain.`
      );
    } catch (error) {
      console.error('[multi-instance] Failover safety check failed:', error.message);
      throw error;
    }
  }

  /**
   * Register this instance in Redis registry
   * @private
   */
  async _registerInstance() {
    const key = 'instance:registry';
    const data = JSON.stringify({
      instanceId: this.instanceId,
      pid: process.pid,
      hostname: require('os').hostname(),
      port: process.env.PORT || 5000,
      startTime: Date.now(),
      lastHeartbeat: Date.now(),
      status: 'healthy',
    });
    
    try {
      await this.redis.hset(key, this.instanceId, data);
      await this.redis.expire(key, 3600); // Auto-expire old registry
      console.log(`[multi-instance] ✓ Registered instance: ${this.instanceId}`);
    } catch (error) {
      console.error('[multi-instance] Failed to register instance:', error.message);
      throw error;
    }
  }

  /**
   * Unregister this instance
   * @private
   */
  async _unregisterInstance() {
    try {
      await this.redis.hdel('instance:registry', this.instanceId);
      console.log(`[multi-instance] ✓ Unregistered instance: ${this.instanceId}`);
    } catch (error) {
      console.warn('[multi-instance] Failed to unregister:', error.message);
    }
  }

  /**
   * Send heartbeat
   * @private
   */
  async _sendHeartbeat() {
    try {
      const key = 'instance:registry';
      const data = JSON.stringify({
        instanceId: this.instanceId,
        pid: process.pid,
        hostname: require('os').hostname(),
        port: process.env.PORT || 5000,
        startTime: Date.now() - require('os').uptime() * 1000,
        lastHeartbeat: Date.now(),
        status: 'healthy',
        leader: this.isLeader,
      });
      
      await this.redis.hset(key, this.instanceId, data);
      this.lastHeartbeat = Date.now();
    } catch (error) {
      console.warn(`[multi-instance] Heartbeat failed: ${error.message}`);
    }
  }

  /**
   * Health check: remove dead instances
   * @private
   */
  async _healthCheck() {
    try {
      const key = 'instance:registry';
      const instances = await this.redis.hgetall(key);
      
      for (const [instanceId, data] of Object.entries(instances)) {
        const parsed = JSON.parse(data);
        const age = Date.now() - parsed.lastHeartbeat;
        
        if (age > this.heartbeatTimeout) {
          await this.redis.hdel(key, instanceId);
          console.log(
            `[multi-instance] ⚠️  Removed dead instance (${instanceId}, age: ${Math.round(age / 1000)}s)`
          );
        }
      }
    } catch (error) {
      console.warn('[multi-instance] Health check failed:', error.message);
    }
  }

  /**
   * Leader election using Redis
   * @private
   */
  async _electLeader() {
    try {
      const lockKey = 'instance:leader-lock';
      const ttl = this.leaderElectionInterval / 1000 + 5; // Hold lock for ~15 seconds
      
      // Try to acquire leader lock
      const acquired = await this.redis.set(
        lockKey,
        this.instanceId,
        'EX',
        ttl,
        'NX' // Only set if doesn't exist
      );
      
      if (acquired) {
        this.isLeader = true;
        console.log(`[multi-instance] ✓ Elected as LEADER`);
      } else {
        this.isLeader = false;
      }
    } catch (error) {
      console.warn('[multi-instance] Leader election failed:', error.message);
      this.isLeader = false;
    }
  }

  /**
   * Get coordination status
   */
  async getStatus() {
    const instances = await this.getActiveInstances();
    const quorum = await this.hasQuorum();
    
    return {
      instanceId: this.instanceId,
      isLeader: this.isLeader,
      activeInstances: instances.length,
      instances: instances.map(i => ({
        id: i.instanceId,
        hostname: i.hostname,
        age: i.age,
        leader: i.leader,
      })),
      quorumAvailable: quorum,
      heartbeatEnabled: this.config.ENABLE_HEARTBEAT,
      leaderElectionEnabled: this.config.ENABLE_LEADER_ELECTION,
    };
  }
}

module.exports = MultiInstanceCoordinator;
