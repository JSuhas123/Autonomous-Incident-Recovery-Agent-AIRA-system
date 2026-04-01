/**
 * Action Effectiveness Metrics Routes
 * Track and analyze effectiveness of AIRA actions
 */

const express = require('express');
const actionEffectivenessService = require('../services/core/actionEffectivenessService');

const router = express.Router();

/**
 * POST /api/effectiveness/record-before
 * Record metrics before action execution
 */
router.post('/record-before', async (req, res) => {
  try {
    const { decisionTraceId, tenantId, metrics } = req.body;

    if (!decisionTraceId || !tenantId || !metrics) {
      return res.status(400).json({
        error: 'decisionTraceId, tenantId, and metrics required',
      });
    }

    const recorded = await actionEffectivenessService.recordBeforeMetrics(
      decisionTraceId,
      tenantId,
      metrics
    );

    res.status(201).json({
      success: true,
      decisionTraceId,
      status: recorded.status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to record before metrics',
      details: error.message,
    });
  }
});

/**
 * POST /api/effectiveness/record-action
 * Record action execution details
 */
router.post('/record-action', async (req, res) => {
  try {
    const { decisionTraceId, actionId, durationMs, success } = req.body;

    if (!decisionTraceId || !actionId) {
      return res.status(400).json({
        error: 'decisionTraceId and actionId required',
      });
    }

    const recorded = await actionEffectivenessService.recordActionExecution(
      decisionTraceId,
      actionId,
      durationMs || 0,
      success || false
    );

    res.json({
      success: true,
      decisionTraceId,
      actionExecutedAt: recorded.action_executed_at,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to record action',
      details: error.message,
    });
  }
});

/**
 * POST /api/effectiveness/record-after
 * Record metrics after action execution and incident resolution
 */
router.post('/record-after', async (req, res) => {
  try {
    const { decisionTraceId, metrics } = req.body;

    if (!decisionTraceId || !metrics) {
      return res.status(400).json({
        error: 'decisionTraceId and metrics required',
      });
    }

    const recorded = await actionEffectivenessService.recordAfterMetrics(
      decisionTraceId,
      metrics
    );

    res.json({
      success: true,
      decisionTraceId,
      effectiveness: recorded.effectiveness,
      status: recorded.status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to record after metrics',
      details: error.message,
    });
  }
});

/**
 * GET /api/effectiveness/:decisionTraceId
 * Get effectiveness metrics for a specific decision
 */
router.get('/:decisionTraceId', async (req, res) => {
  try {
    const { decisionTraceId } = req.params;

    const metrics = await actionEffectivenessService.getEffectiveness(decisionTraceId);

    if (!metrics) {
      return res.status(404).json({ error: 'Metrics not found' });
    }

    res.json({
      decisionTraceId,
      metricsBefore: metrics.metrics_before,
      metricsAfter: metrics.metrics_after,
      effectiveness: metrics.effectiveness,
      costAnalysis: metrics.cost_analysis,
      recommendations: metrics.recommendations,
      status: metrics.status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve metrics',
      details: error.message,
    });
  }
});

/**
 * GET /api/effectiveness/compare/actions
 * Compare effectiveness across different actions
 */
router.get('/compare/actions', async (req, res) => {
  try {
    const tenantId = req.query.tenantId || 'default';
    const timeRangeHours = parseInt(req.query.timeRangeHours || 24);
    const timeRangeMs = timeRangeHours * 3600 * 1000;

    const comparison = await actionEffectivenessService.compareActions(
      tenantId,
      timeRangeMs
    );

    res.json({
      tenantId,
      timeRangeHours,
      actions: comparison,
      topPerformer: comparison[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to compare actions',
      details: error.message,
    });
  }
});

/**
 * GET /api/effectiveness/pattern/:pattern
 * Get effectiveness for a specific incident pattern
 */
router.get('/pattern/:pattern', async (req, res) => {
  try {
    const tenantId = req.query.tenantId || 'default';
    const { pattern } = req.params;
    const timeRangeHours = parseInt(req.query.timeRangeHours || 24);
    const timeRangeMs = timeRangeHours * 3600 * 1000;

    const results = await actionEffectivenessService.getEffectivenessByPattern(
      tenantId,
      pattern,
      timeRangeMs
    );

    // Calculate aggregate statistics
    const successCount = results.filter(r => r.effectiveness.success).length;
    const avgEffectiveness = results.length > 0
      ? results.reduce((sum, r) => sum + r.effectiveness.effectiveness_score, 0) / results.length
      : 0;

    res.json({
      pattern,
      tenantId,
      totalIncidents: results.length,
      successCount,
      successRate: results.length > 0 ? (successCount / results.length * 100).toFixed(1) : 0,
      avgEffectivenessScore: avgEffectiveness.toFixed(1),
      incidents: results.map(r => ({
        decisionTraceId: r.decisionTraceId,
        action: r.action,
        effectiveness: r.effectiveness,
        timestamp: r.completedAt,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve pattern effectiveness',
      details: error.message,
    });
  }
});

/**
 * GET /api/effectiveness/trends/:action
 * Get effectiveness trends for a specific action
 */
router.get('/trends/:action', async (req, res) => {
  try {
    const tenantId = req.query.tenantId || 'default';
    const { action } = req.params;

    const trends = await actionEffectivenessService.getEffectivenessTrends(
      tenantId,
      action,
      3600000 // 1 hour intervals
    );

    res.json({
      action,
      tenantId,
      timeRange: 'last 24 hours',
      intervalMinutes: 60,
      trends,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve trends',
      details: error.message,
    });
  }
});

/**
 * POST /api/effectiveness/cost-analysis
 * Calculate ROI for an action
 */
router.post('/cost-analysis', async (req, res) => {
  try {
    const { decisionTraceId, actionCostEstimate } = req.body;

    if (!decisionTraceId) {
      return res.status(400).json({ error: 'decisionTraceId required' });
    }

    const metrics = await actionEffectivenessService.getEffectiveness(decisionTraceId);
    
    if (!metrics) {
      return res.status(404).json({ error: 'Metrics not found' });
    }

    const costAnalysis = await actionEffectivenessService.calculateCostAnalysis(
      metrics,
      actionCostEstimate || 100
    );

    res.json({
      decisionTraceId,
      costAnalysis,
      effectiveness: metrics.effectiveness,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to calculate cost analysis',
      details: error.message,
    });
  }
});

/**
 * GET /api/effectiveness/stats
 * Get overall effectiveness statistics
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = req.query.tenantId || 'default';

    const comparison = await actionEffectivenessService.compareActions(tenantId);

    // Calculate overall stats
    const totalActions = comparison.reduce((sum, c) => sum + c.sampleSize, 0);
    const avgEffectiveness = comparison.length > 0
      ? comparison.reduce((sum, c) => sum + c.effectivenessScore, 0) / comparison.length
      : 0;
    const overallSuccessRate = comparison.length > 0
      ? comparison.reduce((sum, c) => sum + c.successRate, 0) / comparison.length
      : 0;

    res.json({
      tenantId,
      timeRange: 'last 24 hours',
      stats: {
        totalActionsExecuted: totalActions,
        avgEffectivenessScore: parseFloat(avgEffectiveness.toFixed(1)),
        overallSuccessRate: parseFloat(overallSuccessRate.toFixed(1)),
        uniqueActions: comparison.length,
      },
      byAction: comparison,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve statistics',
      details: error.message,
    });
  }
});

module.exports = router;
