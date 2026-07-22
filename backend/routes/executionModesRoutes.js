const express = require('express');
const router = express.Router();
const executionModesService = require('../services/core/executionModesService');

/**
 * Phase 8: Execution Modes Routes
 * 
 * Manage AUTO, APPROVAL, and SUGGEST_ONLY execution modes
 */

/**
 * POST /config/default-mode
 * Set default execution mode for tenant
 */
router.post('/config/default-mode', async (req, res, next) => {
  try {
    const { tenantId = 'default', mode } = req.body;

    if (!['AUTO', 'APPROVAL', 'SUGGEST_ONLY'].includes(mode)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid mode. Must be AUTO, APPROVAL, or SUGGEST_ONLY'
      });
    }

    const result = await executionModesService.setDefaultMode(tenantId, mode);

    res.json({
      success: true,
      message: `Default execution mode set to ${mode}`,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /config/action-mode
 * Set execution mode for specific action
 */
router.post('/config/action-mode', async (req, res, next) => {
  try {
    const { tenantId = 'default', action, mode } = req.body;

    if (!action || !mode) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: action, mode'
      });
    }

    const result = await executionModesService.setActionMode(tenantId, action, mode);

    res.json({
      success: true,
      message: `Execution mode for '${action}' set to ${mode}`,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /requests
 * Create execution request
 */
router.post('/requests', async (req, res, next) => {
  try {
    const { tenantId = 'default', requestData } = req.body;

    if (!requestData || !requestData.decisionTraceId || !requestData.action) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: decisionTraceId, action'
      });
    }

    const request = await executionModesService.createExecutionRequest(
      tenantId,
      requestData
    );

    res.json({
      success: true,
      decisionTraceId: request.decisionTraceId,
      executionMode: request.executionMode,
      requestId: request._id,
      message: `Request created with mode: ${request.executionMode}`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /requests/:decisionTraceId/approve
 * Approve execution request
 */
router.post('/requests/:decisionTraceId/approve', async (req, res, next) => {
  try {
    const { decisionTraceId } = req.params;
    const { tenantId = 'default', approverId, approverName } = req.body;

    if (!approverId || !approverName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: approverId, approverName'
      });
    }

    const request = await executionModesService.approveRequest(
      tenantId,
      decisionTraceId,
      approverId,
      approverName
    );

    const approved = request.approval.currentApprovals >= request.approval.requiredApprovals;

    res.json({
      success: true,
      decisionTraceId,
      approved,
      message: approved 
        ? 'Request approved and ready for execution'
        : `Approval recorded (${request.approval.currentApprovals}/${request.approval.requiredApprovals})`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /requests/:decisionTraceId/reject
 * Reject execution request
 */
router.post('/requests/:decisionTraceId/reject', async (req, res, next) => {
  try {
    const { decisionTraceId } = req.params;
    const { tenantId = 'default', rejecterId, reason } = req.body;

    if (!rejecterId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: rejecterId'
      });
    }

    const request = await executionModesService.rejectRequest(
      tenantId,
      decisionTraceId,
      rejecterId,
      reason
    );

    res.json({
      success: true,
      decisionTraceId,
      message: 'Request rejected'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /requests/:decisionTraceId/execute
 * Mark request as executing
 */
router.post('/requests/:decisionTraceId/execute', async (req, res, next) => {
  try {
    const { decisionTraceId } = req.params;
    const { tenantId = 'default' } = req.body;

    const request = await executionModesService.markExecutionStarted(
      tenantId,
      decisionTraceId
    );

    res.json({
      success: true,
      decisionTraceId,
      status: 'executing',
      message: 'Execution started'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /requests/:decisionTraceId/complete
 * Mark request as completed
 */
router.post('/requests/:decisionTraceId/complete', async (req, res, next) => {
  try {
    const { decisionTraceId } = req.params;
    const { tenantId = 'default', result } = req.body;

    const request = await executionModesService.markExecutionCompleted(
      tenantId,
      decisionTraceId,
      result
    );

    res.json({
      success: true,
      decisionTraceId,
      status: 'completed',
      duration: request.execution.duration,
      message: 'Execution completed'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /approvals/pending
 * Get pending approvals
 */
router.get('/approvals/pending', async (req, res, next) => {
  try {
    const { tenantId = 'default', limit = 50 } = req.query;

    const requests = await executionModesService.getPendingApprovals(
      tenantId,
      parseInt(limit)
    );

    res.json({
      success: true,
      tenantId,
      pendingCount: requests.length,
      requests
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /stats
 * Get execution statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const { tenantId = 'default' } = req.query;

    const stats = await executionModesService.getExecutionStats(tenantId);

    res.json({
      success: true,
      tenantId,
      statistics: stats
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
