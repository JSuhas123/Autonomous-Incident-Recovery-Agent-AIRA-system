/**
 * Policy Rollback Service
 * Tracks policy versions and automatically reverts if effectiveness drops
 * Monitors success metrics and triggers rollback on degradation
 */

const mongoose = require('mongoose');

// Policy version tracking schema
const policyVersionSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true },
    policyId: { type: String, required: true },
    version: { type: String, required: true, unique: true },
    content: { type: mongoose.Schema.Types.Mixed, required: true },
    
    // Metadata
    createdBy: String,
    createdAt: { type: Date, default: Date.now, index: true },
    activatedAt: Date,
    deactivatedAt: Date,
    
    // Effectiveness tracking
    status: {
      type: String,
      enum: ['draft', 'active', 'superseded', 'rolled_back'],
      default: 'draft',
    },
    
    // Metrics
    metrics: {
      totalIncidentsProcessed: { type: Number, default: 0 },
      successfulActions: { type: Number, default: 0 },
      failedActions: { type: Number, default: 0 },
      averageResolutionTimeMs: Number,
      
      // Effectiveness score (0-100)
      effectivenessScore: Number,
      lastCalculatedAt: Date,
      
      // Trend
      scoreHistory: [
        {
          timestamp: Date,
          score: Number,
          sampleSize: Number,
        },
      ],
    },
    
    // Rollback info (if rolled back)
    rollbackReason: String,
    rolledBackFrom: String, // Version that triggered rollback
    rolledBackAt: Date,
    rolledBackBy: String,
  },
  { timestamps: true }
);

// Rollback event tracking
const rollbackEventSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    policyId: { type: String, required: true },
    timestamp: { type: Date, default: Date.now, index: true },
    
    // What happened
    event: {
      type: String,
      enum: ['activation', 'deactivation', 'auto_rollback', 'manual_rollback'],
    },
    
    fromVersion: String,
    toVersion: String,
    
    // Why it happened
    reason: String,
    metrics: {
      beforeScore: Number,
      afterScore: Number,
      scoreChange: Number,
      failureRate: Number,
      averageResolutionMs: Number,
    },
    
    // Who did it
    actor: String, // system or username
    actorType: { type: String, enum: ['system', 'user'] },
  },
  { timestamps: true }
);

class PolicyRollbackService {
  constructor() {
    this.PolicyVersion = mongoose.models.PolicyVersion || mongoose.model('PolicyVersion', policyVersionSchema);
    this.RollbackEvent = mongoose.models.RollbackEvent || mongoose.model('RollbackEvent', rollbackEventSchema);
    
    // Configuration
    this.config = {
      effectivenessThreshold: 0.70,      // < 70% triggers warning
      autoRollbackThreshold: 0.50,       // < 50% triggers auto-rollback
      scoreDropThreshold: 0.15,          // 15% drop from previous version
      minSampleSize: 10,                 // Min incidents to calculate score
      checkInterval: 60000,              // Check every 1 minute
    };

    // Start periodic effectiveness monitoring
    this.startMonitoring();
  }

  /**
   * Create a new policy version
   */
  async createPolicyVersion(tenantId, policyId, content, createdBy) {
    const version = `${policyId}-v${Date.now()}`;

    const policyVersion = new this.PolicyVersion({
      tenantId,
      policyId,
      version,
      content,
      createdBy,
      status: 'draft',
    });

    await policyVersion.save();

    return policyVersion;
  }

  /**
   * Activate a policy version
   */
  async activateVersion(tenantId, policyId, version) {
    // Deactivate all previous versions
    await this.PolicyVersion.updateMany(
      { tenantId, policyId, status: 'active' },
      { status: 'superseded', deactivatedAt: new Date() }
    );

    // Activate new version
    const newVersion = await this.PolicyVersion.findOneAndUpdate(
      { tenantId, policyId, version },
      { status: 'active', activatedAt: new Date() },
      { new: true }
    );

    // Log activation event
    await this.logRollbackEvent(tenantId, policyId, {
      event: 'activation',
      fromVersion: null,
      toVersion: version,
      reason: 'Manual activation',
      actor: 'system',
      actorType: 'user',
    });

    return newVersion;
  }

  /**
   * Record outcome of policy action for effectiveness tracking
   */
  async recordOutcome(tenantId, policyId, outcome) {
    const activeVersion = await this.PolicyVersion.findOne({
      tenantId,
      policyId,
      status: 'active',
    });

    if (!activeVersion) {
      console.warn(`No active policy version for ${policyId}`);
      return;
    }

    // Update metrics
    activeVersion.metrics.totalIncidentsProcessed++;

    if (outcome.success) {
      activeVersion.metrics.successfulActions++;
    } else {
      activeVersion.metrics.failedActions++;
    }

    if (outcome.resolutionTimeMs) {
      // Calculate rolling average
      const n = activeVersion.metrics.totalIncidentsProcessed;
      const currentAvg = activeVersion.metrics.averageResolutionTimeMs || 0;
      activeVersion.metrics.averageResolutionTimeMs = 
        (currentAvg * (n - 1) + outcome.resolutionTimeMs) / n;
    }

    await activeVersion.save();
  }

  /**
   * Calculate effectiveness score for a policy version
   */
  async calculateEffectiveness(tenantId, policyId, version) {
    const policyVersion = await this.PolicyVersion.findOne({
      tenantId,
      policyId,
      version,
    });

    if (!policyVersion) {
      return null;
    }

    const { totalIncidentsProcessed, successfulActions, failedActions } = policyVersion.metrics;

    if (totalIncidentsProcessed < this.config.minSampleSize) {
      return null; // Not enough data
    }

    // Calculate effectiveness score
    // 80% from success rate, 20% from resolution time efficiency
    const successRate = successfulActions / totalIncidentsProcessed;
    const failureRate = failedActions / totalIncidentsProcessed;

    // Penalize slower resolution times
    const avgResTime = policyVersion.metrics.averageResolutionTimeMs || 5000;
    const timeScore = Math.max(0, 100 - (avgResTime / 100)); // 100ms penalty per score point
    
    const effectivenessScore = (successRate * 80) + (Math.min(timeScore, 20) * 0.2);

    return Math.round(effectivenessScore);
  }

  /**
   * Check if version should be rolled back
   */
  async checkAndRollback(tenantId, policyId) {
    const activeVersion = await this.PolicyVersion.findOne({
      tenantId,
      policyId,
      status: 'active',
    });

    if (!activeVersion) {
      return null;
    }

    // Calculate current effectiveness
    const currentScore = await this.calculateEffectiveness(
      tenantId,
      policyId,
      activeVersion.version
    );

    if (!currentScore) {
      return null; // Not enough data to decide
    }

    // Update score history
    if (!activeVersion.metrics.scoreHistory) {
      activeVersion.metrics.scoreHistory = [];
    }

    activeVersion.metrics.scoreHistory.push({
      timestamp: new Date(),
      score: currentScore,
      sampleSize: activeVersion.metrics.totalIncidentsProcessed,
    });

    activeVersion.metrics.effectivenessScore = currentScore;
    activeVersion.metrics.lastCalculatedAt = new Date();

    // Check rollback conditions
    if (currentScore < this.config.autoRollbackThreshold) {
      // Auto-rollback triggered
      const previousVersion = await this.getPreviousVersion(tenantId, policyId, activeVersion.version);

      if (previousVersion) {
        return await this.rollback(
          tenantId,
          policyId,
          previousVersion.version,
          `Auto-rollback: Effectiveness score ${currentScore} below threshold ${this.config.autoRollbackThreshold * 100}%`,
          'system'
        );
      }
    }

    // Check for significant score drop
    if (activeVersion.metrics.scoreHistory.length > 1) {
      const previousScore = activeVersion.metrics.scoreHistory[
        activeVersion.metrics.scoreHistory.length - 2
      ].score;

      const scoreDrop = (previousScore - currentScore) / previousScore;

      if (scoreDrop > this.config.scoreDropThreshold) {
        console.warn(
          `[Policy] ${policyId} effectiveness dropped by ${(scoreDrop * 100).toFixed(1)}%`
        );
        // Alert but don't auto-rollback yet (requires manual approval)
      }
    }

    await activeVersion.save();

    return {
      version: activeVersion.version,
      effectivenessScore: currentScore,
      totalIncidents: activeVersion.metrics.totalIncidentsProcessed,
      successRate: (activeVersion.metrics.successfulActions / activeVersion.metrics.totalIncidentsProcessed * 100).toFixed(1),
      status: 'monitored',
    };
  }

  /**
   * Manually rollback to a previous version
   */
  async rollback(tenantId, policyId, targetVersion, reason = 'Manual rollback', actor = 'system') {
    // Get target version
    const targetPolicy = await this.PolicyVersion.findOne({
      tenantId,
      policyId,
      version: targetVersion,
    });

    if (!targetPolicy) {
      throw new Error(`Version ${targetVersion} not found`);
    }

    const currentVersion = await this.PolicyVersion.findOne({
      tenantId,
      policyId,
      status: 'active',
    });

    // Deactivate current version
    await this.PolicyVersion.updateMany(
      { tenantId, policyId, status: 'active' },
      { 
        status: 'rolled_back',
        deactivatedAt: new Date(),
        rollbackReason: reason,
        rolledBackFrom: currentVersion?.version,
        rolledBackAt: new Date(),
        rolledBackBy: actor,
      }
    );

    // Activate target version
    await this.PolicyVersion.updateOne(
      { tenantId, policyId, version: targetVersion },
      { 
        status: 'active',
        activatedAt: new Date(),
      }
    );

    // Log event
    const beforeScore = currentVersion?.metrics.effectivenessScore;
    const afterScore = targetPolicy.metrics.effectivenessScore;

    await this.logRollbackEvent(tenantId, policyId, {
      event: 'auto_rollback',
      fromVersion: currentVersion?.version,
      toVersion: targetVersion,
      reason,
      metrics: {
        beforeScore,
        afterScore,
        scoreChange: afterScore - beforeScore,
        failureRate: currentVersion?.metrics.failedActions / currentVersion?.metrics.totalIncidentsProcessed,
      },
      actor,
      actorType: actor === 'system' ? 'system' : 'user',
    });

    return {
      success: true,
      fromVersion: currentVersion?.version,
      toVersion: targetVersion,
      reason,
    };
  }

  /**
   * Get previous policy version
   */
  async getPreviousVersion(tenantId, policyId, currentVersion) {
    const versions = await this.PolicyVersion.find({
      tenantId,
      policyId,
      status: { $in: ['superseded', 'active'] },
    }).sort({ activatedAt: -1 });

    return versions[1] || null; // Return second-most-recent
  }

  /**
   * Log rollback event
   */
  async logRollbackEvent(tenantId, policyId, event) {
    const rollbackEvent = new this.RollbackEvent({
      tenantId,
      policyId,
      ...event,
    });

    await rollbackEvent.save();
    return rollbackEvent;
  }

  /**
   * Get version history
   */
  async getVersionHistory(tenantId, policyId) {
    return await this.PolicyVersion.find({
      tenantId,
      policyId,
    }).sort({ createdAt: -1 });
  }

  /**
   * Get rollback history
   */
  async getRollbackHistory(tenantId, policyId, limit = 20) {
    return await this.RollbackEvent.find({
      tenantId,
      policyId,
    })
      .sort({ timestamp: -1 })
      .limit(limit);
  }

  /**
   * Start monitoring for automatic rollbacks
   */
  startMonitoring() {
    setInterval(async () => {
      try {
        // In production, this would query all tenants and policies
        // For now, this is a placeholder
        console.log('[Policy] Checking policy effectiveness scores...');
      } catch (error) {
        console.error('[Policy] Rollback monitoring error:', error);
      }
    }, this.config.checkInterval);
  }
}

module.exports = new PolicyRollbackService();
