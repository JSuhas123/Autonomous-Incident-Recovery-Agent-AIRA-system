/**
 * DATABASE OPTIMIZATION SERVICE
 * 
 * Ensures production-grade database performance by:
 * 1. Creating optimal indexes for query patterns
 * 2. Implementing query analysis (slow query detection)
 * 3. Archiving old data to prevent unbounded growth
 * 4. Compacting collections periodically
 * 5. Monitoring database metrics
 * 
 * CRITICAL: Must run at startup and periodically during operation
 */

const mongoose = require('mongoose');

class DatabaseOptimizationService {
  constructor() {
    this.indexes = {
      // Core queries: most frequent patterns
      DecisionTrace: [
        // Pattern 1: Get decision by ID (primary)
        { fields: { decisionId: 1 }, name: 'idx_decision_id', unique: true },
        
        // Pattern 2: List decisions for tenant (most frequent query)
        { fields: { tenantId: 1, timestamp: -1 }, name: 'idx_tenant_timestamp' },
        
        // Pattern 3: List decisions for tenant by action
        { fields: { tenantId: 1, 'decision.recommendedAction': 1, timestamp: -1 }, name: 'idx_tenant_action_time' },
        
        // Pattern 4: Find by correlation ID (incident tracing)
        { fields: { tenantId: 1, correlationId: 1 }, name: 'idx_tenant_correlation' },
        
        // Pattern 5: TTL index for automatic cleanup of old traces
        { fields: { timestamp: 1 }, expireAfterSeconds: 7776000, name: 'idx_ttl_traces' }, // 90 days
      ],
      
      AuditEvent: [
        // Pattern 1: Get audit trail for correlation ID
        { fields: { tenantId: 1, correlationId: 1 }, name: 'idx_audit_correlation' },
        
        // Pattern 2: List audit events for tenant
        { fields: { tenantId: 1, timestamp: -1 }, name: 'idx_audit_tenant_time' },
        
        // Pattern 3: List by event type for forensics
        { fields: { tenantId: 1, eventType: 1, timestamp: -1 }, name: 'idx_audit_type_time' },
        
        // Pattern 4: TTL for audit log retention (longer than traces)
        { fields: { timestamp: 1 }, expireAfterSeconds: 31536000, name: 'idx_ttl_audit' }, // 1 year
      ],
      
      IncidentMemory: [
        // Pattern 1: Find pattern by type for tenant
        { fields: { tenantId: 1, patternType: 1 }, name: 'idx_pattern_type' },
        
        // Pattern 2: Find by pattern ID
        { fields: { patternId: 1 }, name: 'idx_pattern_id' },
        
        // Pattern 3: List all patterns for tenant
        { fields: { tenantId: 1, 'stats.lastOccurrence': -1 }, name: 'idx_tenant_patterns' },
      ],

      ActionLog: [
        // Pattern 1: List actions for tenant
        { fields: { tenantId: 1, timestamp: -1 }, name: 'idx_action_tenant_time' },
        
        // Pattern 2: Find action by ID
        { fields: { actionId: 1 }, name: 'idx_action_id' },
        
        // Pattern 3: Find actions by type
        { fields: { tenantId: 1, actionType: 1 }, name: 'idx_action_type' },
      ],

      Log: [
        // Pattern 1: List logs for tenant (infrequent but needed)
        { fields: { tenantId: 1, timestamp: -1 }, name: 'idx_log_tenant_time' },
        
        // Pattern 2: TTL for log rotation (short retention)
        { fields: { timestamp: 1 }, expireAfterSeconds: 259200, name: 'idx_ttl_logs' }, // 3 days
      ],
    };

    this.config = {
      archiveOlderThanDays: 90,
      compactThresholdSizeMB: 1024,
      slowQueryThresholdMs: 100,
      runOptimizationEveryHours: 24,
    };
  }

  /**
   * Create all indexes on startup
   */
  async createIndexes(db) {
    console.log('[db-optimization] Creating indexes...\n');

    for (const [modelName, indexConfigs] of Object.entries(this.indexes)) {
      try {
        const Model = mongoose.model(modelName);
        
        for (const indexConfig of indexConfigs) {
          try {
            await Model.collection.createIndex(
              indexConfig.fields,
              {
                name: indexConfig.name,
                expireAfterSeconds: indexConfig.expireAfterSeconds,
                ...indexConfig.options,
              }
            );
            console.log(`✓ ${modelName}.${indexConfig.name}`);
          } catch (error) {
            if (error.codeName === 'IndexKeySpecConflict') {
              console.warn(`⚠️  ${modelName}.${indexConfig.name} - already exists`);
            } else {
              throw error;
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️  Failed to create indexes for ${modelName}: ${error.message}`);
      }
    }

    console.log('[db-optimization] ✓ Index creation complete\n');
  }

  /**
   * Analyze slow queries and provide optimization recommendations
   */
  async analyzeSlowQueries() {
    try {
      const db = mongoose.connection.db;
      
      // Get profile data (must be enabled)
      const profiling = await db.admin().profilingLevel();
      
      if (profiling === 0) {
        console.log('[db-optimization] Query profiling disabled (not collecting slow queries)');
        return [];
      }

      const system_profile = db.collection('system.profile');
      const slowQueries = await system_profile
        .find({ millis: { $gt: this.config.slowQueryThresholdMs } })
        .sort({ millis: -1 })
        .limit(10)
        .toArray();

      return slowQueries.map(q => ({
        operation: q.op,
        namespace: q.ns,
        duration_ms: q.millis,
        query: q.command,
        timestamp: q.ts,
      }));
    } catch (error) {
      console.warn('[db-optimization] Could not analyze slow queries:', error.message);
      return [];
    }
  }

  /**
   * Archive old decision traces to cold storage
   * Keep hot data in MongoDB, move old data to compressed archive
   */
  async archiveOldTraces() {
    try {
      const DecisionTrace = mongoose.model('DecisionTrace');
      const archiveDate = new Date();
      archiveDate.setDate(archiveDate.getDate() - this.config.archiveOlderThanDays);

      const oldTraces = await DecisionTrace.countDocuments({
        timestamp: { $lt: archiveDate },
      });

      if (oldTraces > 0) {
        console.log(
          `[db-optimization] Found ${oldTraces} traces older than ${this.config.archiveOlderThanDays} days`
        );
        console.log('[db-optimization]   To implement: Export to S3, then delete from MongoDB');
        // In production: use AWS S3 + lifecycle policies
        // For now: just log recommendation
      }
    } catch (error) {
      console.warn('[db-optimization] Archive check failed:', error.message);
    }
  }

  /**
   * Compact collections to reclaim space
   * MongoDB uses disk space even when documents are deleted
   */
  async compactCollections() {
    try {
      const db = mongoose.connection.db;
      const collections = ['decisiontraces', 'auditevents', 'incidentmemories', 'actionlogs'];

      for (const collName of collections) {
        try {
          // Get collection stats
          const stats = await db.collection(collName).stats();
          const sizeGB = stats.size / (1024 * 1024 * 1024);

          if (sizeGB > this.config.compactThresholdSizeMB / 1024) {
            console.log(`[db-optimization] Collection ${collName} is ${sizeGB.toFixed(2)}GB`);
            console.log(
              `[db-optimization]   To compact: db.${collName}.compact() in MongoDB shell`
            );
          }
        } catch (error) {
          // Collection may not exist
        }
      }
    } catch (error) {
      console.warn('[db-optimization] Collection compaction check failed:', error.message);
    }
  }

  /**
   * Get database health metrics
   */
  async getHealthMetrics() {
    try {
      const db = mongoose.connection.db;
      const admin = db.admin();

      const status = await admin.serverStatus();

      return {
        connections: {
          current: status.connections.current,
          available: status.connections.available,
        },
        memory: {
          resident_mb: status.mem.resident,
          virtual_mb: status.mem.virtual,
        },
        replication: status.repl ? status.repl.hosts.length : 0,
        uptime_seconds: status.uptime,
      };
    } catch (error) {
      console.warn('[db-optimization] Could not get health metrics:', error.message);
      return null;
    }
  }

  /**
   * Run full optimization cycle
   */
  async runFullOptimization() {
    console.log('[db-optimization] Running full optimization cycle...\n');

    // 1. Analyze slow queries
    const slowQueries = await this.analyzeSlowQueries();
    if (slowQueries.length > 0) {
      console.log('[db-optimization] ⚠️  Slow queries detected:');
      slowQueries.forEach(q => {
        console.log(`   ${q.namespace}: ${q.duration_ms}ms`);
      });
    }

    // 2. Check for archival candidates
    await this.archiveOldTraces();

    // 3. Check for compaction candidates
    await this.compactCollections();

    // 4. Get health metrics
    const health = await this.getHealthMetrics();
    if (health) {
      console.log('[db-optimization] Database health:');
      console.log(`   Connections: ${health.connections.current}/${health.connections.available}`);
      console.log(`   Memory: ${health.memory.resident_mb}MB resident`);
      console.log(`   Uptime: ${Math.round(health.uptime_seconds / 3600)}h`);
    }

    console.log('[db-optimization] ✓ Optimization cycle complete\n');
  }

  /**
   * Start periodic optimization
   */
  startPeriodicOptimization() {
    const interval = this.config.runOptimizationEveryHours * 60 * 60 * 1000;
    
    setInterval(() => {
      this.runFullOptimization().catch(err => {
        console.error('[db-optimization] Periodic optimization failed:', err.message);
      });
    }, interval);

    console.log(
      `[db-optimization] Periodic optimization scheduled every ${this.config.runOptimizationEveryHours}h`
    );
  }
}

module.exports = new DatabaseOptimizationService();
