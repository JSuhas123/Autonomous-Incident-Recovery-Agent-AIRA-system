/**
 * Approval Routes
 * 
 * API endpoints for approval workflow:
 * - GET /approvals - List pending approvals
 * - GET /approvals/:approvalId - Get approval status
 * - POST /approvals/:approvalId/approve - Approve request
 * - POST /approvals/:approvalId/reject - Reject request
 * - GET /approvals/queue/stats - Get queue statistics
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const { getApprovalService } = require('../services/approval');
const { validateInput } = require('../middleware/inputValidationMiddleware');
const { loggingService } = require('../services/infrastructure');

const approvalService = getApprovalService();

/**
 * GET /approvals
 * Get pending approval requests for tenant
 */
router.get('/', validateInput, async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    if (!tenantId) {
      return res.status(400).json({
        error: 'Missing tenantId',
      });
    }

    const pending = await approvalService.getPendingApprovals(tenantId);

    res.json({
      tenantId,
      pendingCount: pending.length,
      pending: pending.map(p => ({
        approvalId: p.approvalId,
        action: p.action,
        reason: p.reason,
        confidence: p.confidence,
        resource: p.resource,
        severity: p.severity,
        createdAt: p.createdAt,
        expiresAt: p.expiresAt,
        expiresIn: Math.round((new Date(p.expiresAt).getTime() - Date.now()) / 1000) + 's',
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /approvals/queue/stats
 * Get approval queue statistics
 */
router.get('/queue/stats', validateInput, async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const stats = await approvalService.getQueueStats(tenantId);

    res.json({
      tenantId,
      queue: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /approvals/:approvalId
 * Get specific approval request status
 */
router.get('/:approvalId', validateInput, async (req, res, next) => {
  try {
    const { tenantId, approvalId } = req.params;

    if (!approvalId) {
      return res.status(400).json({
        error: 'Missing approvalId',
      });
    }

    const status = await approvalService.getApprovalStatus(approvalId);

    res.json({
      tenantId,
      approval: status,
    });
  } catch (error) {
    if (error.message.includes('not found')) error.status = 404;
    next(error);
  }
});

/**
 * POST /approvals/:approvalId/approve
 * Approve an approval request
 * 
 * Body:
 * {
 *   "approvedBy": "user-id or service-name",
 *   "comment": "optional approval comment"
 * }
 */
router.post('/:approvalId/approve', validateInput, async (req, res, next) => {
  try {
    const { tenantId, approvalId } = req.params;
    const { approvedBy, comment } = req.body;

    if (!approvalId || !approvedBy) {
      return res.status(400).json({
        error: 'Missing required fields: approvalId, approvedBy',
      });
    }

    const result = await approvalService.approveAndExecute(
      approvalId,
      approvedBy,
      {
        userAgent: req.get('user-agent'),
        ipAddress: req.ip,
        comment,
      }
    );

    if (loggingService) {
      loggingService.logStructured({
        level: 'info',
        message: 'Approval request approved via API',
        service: 'approval-routes',
        tenantId,
        approvalId,
        approvedBy,
      });
    }

    res.json({
      tenantId,
      result,
    });
  } catch (error) {
    if (error.message.includes('not found')) error.status = 404;
    if (error.message.includes('Cannot approve') || error.message.includes('expired')) error.status = 409;
    next(error);
  }
});

/**
 * POST /approvals/:approvalId/reject
 * Reject an approval request
 * 
 * Body:
 * {
 *   "rejectedBy": "user-id or service-name",
 *   "reason": "reason for rejection"
 * }
 */
router.post('/:approvalId/reject', validateInput, async (req, res, next) => {
  try {
    const { tenantId, approvalId } = req.params;
    const { rejectedBy, reason } = req.body;

    if (!approvalId || !rejectedBy) {
      return res.status(400).json({
        error: 'Missing required fields: approvalId, rejectedBy',
      });
    }

    const result = await approvalService.rejectRequest(
      approvalId,
      rejectedBy,
      reason || '',
      {
        userAgent: req.get('user-agent'),
        ipAddress: req.ip,
      }
    );

    if (loggingService) {
      loggingService.logStructured({
        level: 'info',
        message: 'Approval request rejected via API',
        service: 'approval-routes',
        tenantId,
        approvalId,
        rejectedBy,
        reason,
      });
    }

    res.json({
      tenantId,
      result,
    });
  } catch (error) {
    if (error.message.includes('not found')) error.status = 404;
    if (error.message.includes('Cannot reject')) error.status = 409;
    next(error);
  }
});

module.exports = router;
