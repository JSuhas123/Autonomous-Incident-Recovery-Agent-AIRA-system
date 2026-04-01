/**
 * Policy Management Routes
 * Validation, Dry-Run, and Rollback endpoints
 */

const express = require('express');
const yaml = require('js-yaml');
const { validatePolicy, checkActionAllowed } = require('../services/core/policy/policyValidator');
const dryRunService = require('../services/core/policy/dryRunService');
const policyRollbackService = require('../services/core/policy/policyRollbackService');

const router = express.Router();

/**
 * POST /api/policy/validate
 * Validate a policy against schema
 */
router.post('/validate', (req, res) => {
  try {
    const { policy } = req.body;

    if (!policy) {
      return res.status(400).json({ error: 'policy required' });
    }

    const validationResult = validatePolicy(policy);

    res.json({
      valid: validationResult.valid,
      errors: validationResult.errors,
      warnings: validationResult.warnings,
      validatedPolicy: validationResult.valid ? validationResult.value : null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Validation failed', details: error.message });
  }
});

/**
 * POST /api/policy/dry-run
 * Simulate action execution without actually running it
 */
router.post('/dry-run', async (req, res) => {
  try {
    const { action, conditions, incidentData, policy } = req.body;

    if (!action || !conditions) {
      return res.status(400).json({ error: 'action and conditions required' });
    }

    // Validate policy first
    if (policy) {
      const validation = validatePolicy(policy);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid policy',
          details: validation.errors,
        });
      }
    }

    // Check if action would be allowed
    const policyToUse = policy || {};
    const allowedCheck = checkActionAllowed(action, conditions, policyToUse);

    // Simulate the action
    const simulation = await dryRunService.simulateAction(
      action,
      conditions,
      incidentData || {},
      policyToUse
    );

    res.json({
      simulationId: simulation.simulationId,
      action,
      policyAllows: allowedCheck.allowed,
      policyDenialReason: allowedCheck.reason,
      requiresApproval: allowedCheck.requiresApproval,
      analysis: simulation.analysis,
      recommendation: simulation.recommendation,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Dry-run simulation failed',
      details: error.message,
    });
  }
});

/**
 * POST /api/policy/dry-run/compare
 * Compare multiple scenarios through dry-run
 */
router.post('/dry-run/compare', async (req, res) => {
  try {
    const { scenarios, policy } = req.body;

    if (!scenarios || !Array.isArray(scenarios)) {
      return res.status(400).json({ error: 'scenarios array required' });
    }

    const comparisons = [];

    for (const scenario of scenarios) {
      const simulation = await dryRunService.simulateAction(
        scenario.action,
        scenario.conditions,
        scenario.incidentData || {},
        policy || {}
      );

      comparisons.push({
        action: scenario.action,
        severity: scenario.conditions?.severity,
        recommendation: simulation.recommendation.recommendation,
        successProbability: simulation.analysis.successProbability,
        estimatedDurationMs: simulation.analysis.estimatedDurationMs,
        blastRadius: simulation.analysis.blastRadius,
        safe: simulation.analysis.safetyAssessment.safe,
        riskLevel: simulation.analysis.safetyAssessment.riskLevel,
      });
    }

    // Sort by recommendation confidence
    comparisons.sort((a, b) => b.successProbability - a.successProbability);

    res.json({
      compareCount: comparisons.length,
      scenarios: comparisons,
      bestOption: comparisons[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Comparison failed',
      details: error.message,
    });
  }
});

/**
 * GET /api/policy/dry-run/results
 * Get recent dry-run results
 */
router.get('/dry-run/results', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const results = dryRunService.getRecentResults(limit);

    res.json({
      results,
      count: results.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve results' });
  }
});

/**
 * POST /api/policy/create-version
 * Create a new policy version
 */
router.post('/create-version', async (req, res) => {
  try {
    const { tenantId, policyId, content, createdBy } = req.body;

    if (!tenantId || !policyId || !content) {
      return res.status(400).json({
        error: 'tenantId, policyId, and content required',
      });
    }

    // Validate policy content
    const validation = validatePolicy(content);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid policy content',
        details: validation.errors,
      });
    }

    const version = await policyRollbackService.createPolicyVersion(
      tenantId,
      policyId,
      validation.value,
      createdBy || 'system'
    );

    res.status(201).json({
      success: true,
      version: version.version,
      status: version.status,
      createdAt: version.createdAt,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create policy version',
      details: error.message,
    });
  }
});

/**
 * POST /api/policy/activate-version
 * Activate a specific policy version
 */
router.post('/activate-version', async (req, res) => {
  try {
    const { tenantId, policyId, version } = req.body;

    if (!tenantId || !policyId || !version) {
      return res.status(400).json({
        error: 'tenantId, policyId, and version required',
      });
    }

    const activated = await policyRollbackService.activateVersion(
      tenantId,
      policyId,
      version
    );

    res.json({
      success: true,
      activatedVersion: activated.version,
      status: activated.status,
      activatedAt: activated.activatedAt,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to activate version',
      details: error.message,
    });
  }
});

/**
 * POST /api/policy/rollback
 * Manually rollback to previous version
 */
router.post('/rollback', async (req, res) => {
  try {
    const { tenantId, policyId, targetVersion, reason, actor } = req.body;

    if (!tenantId || !policyId || !targetVersion) {
      return res.status(400).json({
        error: 'tenantId, policyId, and targetVersion required',
      });
    }

    const result = await policyRollbackService.rollback(
      tenantId,
      policyId,
      targetVersion,
      reason || 'Manual rollback',
      actor || 'system'
    );

    res.json({
      success: result.success,
      fromVersion: result.fromVersion,
      toVersion: result.toVersion,
      reason: result.reason,
      rollbackAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Rollback failed',
      details: error.message,
    });
  }
});

/**
 * POST /api/policy/record-outcome
 * Record the outcome of a policy action
 */
router.post('/record-outcome', async (req, res) => {
  try {
    const { tenantId, policyId, success, resolutionTimeMs, action } = req.body;

    if (!tenantId || !policyId) {
      return res.status(400).json({
        error: 'tenantId and policyId required',
      });
    }

    await policyRollbackService.recordOutcome(
      tenantId,
      policyId,
      {
        success: success || false,
        resolutionTimeMs: resolutionTimeMs || 0,
        action,
      }
    );

    res.json({
      success: true,
      recorded: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to record outcome',
      details: error.message,
    });
  }
});

/**
 * GET /api/policy/version-history
 * Get version history for a policy
 */
router.get('/version-history', async (req, res) => {
  try {
    const { tenantId, policyId } = req.query;

    if (!tenantId || !policyId) {
      return res.status(400).json({
        error: 'tenantId and policyId query parameters required',
      });
    }

    const history = await policyRollbackService.getVersionHistory(
      tenantId,
      policyId
    );

    res.json({
      tenantId,
      policyId,
      versions: history.map(v => ({
        version: v.version,
        status: v.status,
        createdAt: v.createdAt,
        activatedAt: v.activatedAt,
        deactivatedAt: v.deactivatedAt,
        effectivenessScore: v.metrics.effectivenessScore,
        totalIncidents: v.metrics.totalIncidentsProcessed,
        successRate: v.metrics.successfulActions / (v.metrics.totalIncidentsProcessed || 1),
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve version history',
      details: error.message,
    });
  }
});

/**
 * GET /api/policy/rollback-history
 * Get rollback events for a policy
 */
router.get('/rollback-history', async (req, res) => {
  try {
    const { tenantId, policyId } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    if (!tenantId || !policyId) {
      return res.status(400).json({
        error: 'tenantId and policyId query parameters required',
      });
    }

    const history = await policyRollbackService.getRollbackHistory(
      tenantId,
      policyId,
      limit
    );

    res.json({
      tenantId,
      policyId,
      rollbackEvents: history,
      count: history.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve rollback history',
      details: error.message,
    });
  }
});

/**
 * POST /api/policy/check-allowed
 * Check if an action is allowed under current conditions
 */
router.post('/check-allowed', (req, res) => {
  try {
    const { action, conditions, policy } = req.body;

    if (!action || !conditions || !policy) {
      return res.status(400).json({
        error: 'action, conditions, and policy required',
      });
    }

    const result = checkActionAllowed(action, conditions, policy);

    res.json({
      action,
      allowed: result.allowed,
      reason: result.reason,
      rule: result.rule,
      requiresApproval: result.requiresApproval,
      approvers: result.approvers,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Check failed',
      details: error.message,
    });
  }
});

module.exports = router;
