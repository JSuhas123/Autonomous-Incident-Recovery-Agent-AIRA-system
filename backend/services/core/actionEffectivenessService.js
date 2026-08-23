/**
 * Action Effectiveness Service
 * Tracks before/after metrics to measure action effectiveness
 * Compares incident state before and after AIRA action
 */

const mongoose = require("../../persistence/operational/mongooseCompat");

// Effectiveness metrics schema
const effectivenessMetricsSchema = new mongoose.Schema(
  {
    decisionTraceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
    },
    service: String,
    incident_pattern: String,

    // Timeline
    incident_detected_at: Date,
    action_executed_at: Date,
    incident_resolved_at: Date,

    // Before metrics (at decision time)
    metrics_before: {
      // Availability
      error_rate: Number,           // 0-100 (%)
      availability_percent: Number,  // 0-100 (%)

      // Performance
      p50_latency_ms: Number,
      p95_latency_ms: Number,
      p99_latency_ms: Number,
      mean_latency_ms: Number,

      // Volume
      request_rate_ps: Number,       // requests per second
      transaction_volume: Number,

      // Resource usage
      cpu_percent: Number,           // 0-100
      memory_percent: Number,        // 0-100
      disk_percent: Number,          // 0-100
      connection_pool_utilization: Number,

      // Business metrics
      user_impact_estimate: Number,  // estimated affected users
      revenue_impact_estimate: Number, // estimated revenue loss

      // Custom metrics
      custom: mongoose.Schema.Types.Mixed,

      // Timestamp
      collected_at: Date,
    },

    // After metrics (post-action)
    metrics_after: {
      error_rate: Number,
      availability_percent: Number,
      p50_latency_ms: Number,
      p95_latency_ms: Number,
      p99_latency_ms: Number,
      mean_latency_ms: Number,
      request_rate_ps: Number,
      transaction_volume: Number,
      cpu_percent: Number,
      memory_percent: Number,
      disk_percent: Number,
      connection_pool_utilization: Number,
      user_impact_estimate: Number,
      revenue_impact_estimate: Number,
      custom: mongoose.Schema.Types.Mixed,
      collected_at: Date,
    },

    // Calculated effectiveness
    effectiveness: {
      // Success indicators
      incident_resolved: Boolean,
      error_rate_reduced: Boolean,
      error_rate_reduction_percent: Number,

      availability_improved: Boolean,
      availability_improvement_percent: Number,

      latency_improved: Boolean,
      latency_improvement_percent: Number,

      user_impact_reduced: Boolean,
      user_impact_reduction_percent: Number,

      // Time to resolution
      time_to_detect_ms: Number,
      time_to_decide_ms: Number,
      time_to_execute_ms: Number,
      time_to_resolve_ms: Number,  // Total: detect → resolved
      total_incident_duration_ms: Number,

      // Scoring
      effectiveness_score: Number,  // 0-100
      success: Boolean,
    },

    // Comparison with baseline
    baseline_comparison: {
      // How this compares to similar incidents in the past
      similar_incidents_count: Number,
      average_resolution_time_ms: Number,
      success_rate_percent: Number,
      
      // Did we do better/worse?
      beat_baseline: Boolean,
      percentile_rank: Number,  // 0-100
    },

    // Cost analysis
    cost_analysis: {
      action_cost_estimate: Number,  // Cost of executing action
      incident_cost_estimate: Number, // Cost of incident (downtime, etc)
      savings: Number,               // Estimated savings
      roi: Number,                   // Return on investment %
    },

    // Recommendations
    recommendations: [
      {
        type: String,
        // e.g., "Consider scaling earlier - latency threshold could be lower"
        // e.g., "Action was on critical path - good choice"
        // e.g., "Alternative action X had better success rate"
      },
    ],

    // Status
    status: {
      type: String,
      enum: ['pending', 'complete', 'partial'],
      default: 'pending',
    },

    createdAt: { type: Date, default: Date.now, index: true },
    completedAt: Date,
  },
  { timestamps: true }
);

class ActionEffectivenessService {
  constructor() {
    this.EffectivenessMetrics = mongoose.model('ActionEffectiveness', effectivenessMetricsSchema);
  }

  /**
   * Record before-action metrics
   */
  async recordBeforeMetrics(decisionTraceId, tenantId, incidentMetrics) {
    const metrics = new this.EffectivenessMetrics({
      decisionTraceId,
      tenantId,
      action: incidentMetrics.action,
      service: incidentMetrics.service,
      incident_pattern: incidentMetrics.pattern,
      incident_detected_at: incidentMetrics.detected_at || new Date(),
      metrics_before: {
        error_rate: incidentMetrics.error_rate,
        availability_percent: incidentMetrics.availability,
        p50_latency_ms: incidentMetrics.p50_latency,
        p95_latency_ms: incidentMetrics.p95_latency,
        p99_latency_ms: incidentMetrics.p99_latency,
        mean_latency_ms: incidentMetrics.mean_latency,
        request_rate_ps: incidentMetrics.request_rate,
        transaction_volume: incidentMetrics.transaction_volume,
        cpu_percent: incidentMetrics.cpu_percent,
        memory_percent: incidentMetrics.memory_percent,
        disk_percent: incidentMetrics.disk_percent,
        connection_pool_utilization: incidentMetrics.connection_pool_utilization,
        user_impact_estimate: incidentMetrics.user_impact,
        revenue_impact_estimate: incidentMetrics.revenue_impact,
        custom: incidentMetrics.custom,
        collected_at: new Date(),
      },
      status: 'pending',
    });

    await metrics.save();
    return metrics;
  }

  /**
   * Record action execution
   */
  async recordActionExecution(decisionTraceId, actionId, durationMs, success) {
    const metrics = await this.EffectivenessMetrics.findOne({ decisionTraceId });
    
    if (!metrics) {
      throw new Error(`Metrics not found for ${decisionTraceId}`);
    }

    metrics.action_executed_at = new Date();
    metrics.effectiveness.time_to_execute_ms = durationMs;
    
    if (success) {
      metrics.effectiveness.success = true;
    }

    await metrics.save();
    return metrics;
  }

  /**
   * Record after-action metrics
   */
  async recordAfterMetrics(decisionTraceId, postIncidentMetrics) {
    const metrics = await this.EffectivenessMetrics.findOne({ decisionTraceId });
    
    if (!metrics) {
      throw new Error(`Metrics not found for ${decisionTraceId}`);
    }

    metrics.metrics_after = {
      error_rate: postIncidentMetrics.error_rate,
      availability_percent: postIncidentMetrics.availability,
      p50_latency_ms: postIncidentMetrics.p50_latency,
      p95_latency_ms: postIncidentMetrics.p95_latency,
      p99_latency_ms: postIncidentMetrics.p99_latency,
      mean_latency_ms: postIncidentMetrics.mean_latency,
      request_rate_ps: postIncidentMetrics.request_rate,
      transaction_volume: postIncidentMetrics.transaction_volume,
      cpu_percent: postIncidentMetrics.cpu_percent,
      memory_percent: postIncidentMetrics.memory_percent,
      disk_percent: postIncidentMetrics.disk_percent,
      connection_pool_utilization: postIncidentMetrics.connection_pool_utilization,
      user_impact_estimate: postIncidentMetrics.user_impact,
      revenue_impact_estimate: postIncidentMetrics.revenue_impact,
      custom: postIncidentMetrics.custom,
      collected_at: new Date(),
    };

    // Calculate effectiveness
    metrics.incident_resolved_at = postIncidentMetrics.resolved_at || new Date();
    await this.calculateEffectiveness(metrics);

    metrics.status = 'complete';
    metrics.completedAt = new Date();

    await metrics.save();
    return metrics;
  }

  /**
   * Calculate effectiveness score and metrics
   */
  async calculateEffectiveness(metrics) {
    const before = metrics.metrics_before;
    const after = metrics.metrics_after;

    if (!before || !after) return;

    const eff = metrics.effectiveness;

    // Error rate reduction
    if (before.error_rate && after.error_rate !== undefined) {
      const reduction = before.error_rate - after.error_rate;
      eff.error_rate_reduced = reduction > 0;
      eff.error_rate_reduction_percent = (reduction / before.error_rate * 100);
    }

    // Availability improvement
    if (before.availability_percent && after.availability_percent !== undefined) {
      const improvement = after.availability_percent - before.availability_percent;
      eff.availability_improved = improvement > 0;
      eff.availability_improvement_percent = improvement;
    }

    // Latency improvement (use p99)
    if (before.p99_latency_ms && after.p99_latency_ms !== undefined) {
      const improvement = before.p99_latency_ms - after.p99_latency_ms;
      eff.latency_improved = improvement > 0;
      eff.latency_improvement_percent = (improvement / before.p99_latency_ms * 100);
    }

    // User impact reduction
    if (before.user_impact_estimate && after.user_impact_estimate !== undefined) {
      const reduction = before.user_impact_estimate - after.user_impact_estimate;
      eff.user_impact_reduced = reduction > 0;
      eff.user_impact_reduction_percent = (reduction / before.user_impact_estimate * 100);
    }

    // Time calculations
    eff.time_to_detect_ms = 0; // Usually collected from incident timestamp
    eff.time_to_decide_ms = metrics.action_executed_at - new Date(metrics.incident_detected_at);
    eff.time_to_execute_ms = eff.time_to_execute_ms || 0;
    eff.time_to_resolve_ms = metrics.incident_resolved_at - new Date(metrics.incident_detected_at);

    // Effectiveness score (0-100)
    let score = 0;
    let factors = 0;

    if (eff.error_rate_reduced) {
      score += Math.min(100, (eff.error_rate_reduction_percent / 100) * 30); // 30% of score
      factors++;
    }

    if (eff.availability_improved) {
      score += Math.min(100, (eff.availability_improvement_percent / 100) * 30); // 30% of score
      factors++;
    }

    if (eff.latency_improved) {
      score += Math.min(100, (eff.latency_improvement_percent / 100) * 20); // 20% of score
      factors++;
    }

    if (eff.user_impact_reduced) {
      score += Math.min(100, (eff.user_impact_reduction_percent / 100) * 20); // 20% of score
      factors++;
    }

    // Speed bonus: resolve in < 1 minute
    if (eff.time_to_resolve_ms < 60000) {
      score += 10;
    }

    eff.effectiveness_score = Math.min(100, Math.round(score));
    eff.success = eff.effectiveness_score >= 60; // 60+ = success

    return metrics;
  }

  /**
   * Get effectiveness metrics for an action
   */
  async getEffectiveness(decisionTraceId) {
    return await this.EffectivenessMetrics.findOne({ decisionTraceId });
  }

  /**
   * Compare action effectiveness across actions
   */
  async compareActions(tenantId, timeRangeMs = 86400000) {
    // timeRangeMs default = 24 hours
    const startTime = new Date(Date.now() - timeRangeMs);

    const results = await this.EffectivenessMetrics.aggregate([
      {
        $match: {
          tenantId,
          status: 'complete',
          completedAt: { $gte: startTime },
        },
      },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          avgEffectiveness: { $avg: '$effectiveness.effectiveness_score' },
          successRate: {
            $avg: {
              $cond: [{ $eq: ['$effectiveness.success', true] }, 1, 0],
            },
          },
          avgResolutionMs: { $avg: '$effectiveness.time_to_resolve_ms' },
          avgErrorReduction: { $avg: '$effectiveness.error_rate_reduction_percent' },
        },
      },
      { $sort: { avgEffectiveness: -1 } },
    ]);

    return results.map(r => ({
      action: r._id,
      sampleSize: r.count,
      effectivenessScore: parseFloat(r.avgEffectiveness.toFixed(1)),
      successRate: parseFloat((r.successRate * 100).toFixed(1)),
      avgResolutionTimeSec: Math.round(r.avgResolutionMs / 1000),
      avgErrorReduction: parseFloat(r.avgErrorReduction.toFixed(1)),
    }));
  }

  /**
   * Get actioneffectiveness by pattern/service
   */
  async getEffectivenessByPattern(tenantId, pattern, timeRangeMs = 86400000) {
    const startTime = new Date(Date.now() - timeRangeMs);

    return await this.EffectivenessMetrics.find({
      tenantId,
      incident_pattern: pattern,
      status: 'complete',
      completedAt: { $gte: startTime },
    }).sort({ completedAt: -1 });
  }

  /**
   * Get effectiveness trends
   */
  async getEffectivenessTrends(tenantId, action, intervalMs = 3600000) {
    // Default interval = 1 hour
    const startTime = new Date(Date.now() - (24 * 3600000)); // Last 24 hours

    const results = await this.EffectivenessMetrics.aggregate([
      {
        $match: {
          tenantId,
          action,
          status: 'complete',
          completedAt: { $gte: startTime },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d %H:00:00',
              date: '$completedAt',
            },
          },
          count: { $sum: 1 },
          avgEffectiveness: { $avg: '$effectiveness.effectiveness_score' },
          successRate: {
            $avg: {
              $cond: [{ $eq: ['$effectiveness.success', true] }, 1, 0],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return results.map(r => ({
      timestamp: r._id,
      sampleCount: r.count,
      effectivenessScore: parseFloat(r.avgEffectiveness.toFixed(1)),
      successRate: parseFloat((r.successRate * 100).toFixed(1)),
    }));
  }

  /**
   * Calculate cost analysis for an action
   */
  async calculateCostAnalysis(metrics, actionCostEstimate = 100) {
    if (!metrics.effectiveness.success || !metrics.metrics_before) {
      return null;
    }

    const incidentCost = metrics.metrics_before.revenue_impact_estimate || 0;
    const savings = incidentCost - actionCostEstimate;
    const roi = incidentCost > 0 ? ((savings / actionCostEstimate) * 100) : 0;

    metrics.cost_analysis = {
      action_cost_estimate: actionCostEstimate,
      incident_cost_estimate: incidentCost,
      savings: Math.max(0, savings),
      roi: parseFloat(roi.toFixed(1)),
    };

    return metrics.cost_analysis;
  }
}

module.exports = new ActionEffectivenessService();
