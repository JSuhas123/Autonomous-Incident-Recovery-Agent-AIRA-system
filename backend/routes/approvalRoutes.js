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
const Joi = require('joi');
const router = express.Router({ mergeParams: true });
const { getApprovalService } = require('../services/approval');
const { loggingService } = require('../services/infrastructure');

const approvalService = getApprovalService();

const listQuerySchema = Joi.object({
  status: Joi.string().valid('pending', 'approved', 'rejected', 'expired', 'executed').optional(),
  limit: Joi.number().integer().min(1).max(100).default(50),
  sort: Joi.string().valid('asc', 'desc').default('desc'),
  cursor: Joi.string().optional(),
});

/**
 * GET /approvals
 * Get pending approval requests for tenant
 */
router.get('/', async (req, res, next) => {
  const { error: qErr } = listQuerySchema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (qErr) {
    return res.status(400).json({
      error: 'Invalid query parameters',
      code: 'VALIDATION_ERROR',
      details: qErr.details.map(d => ({ field: d.path.join('.'), message: d.message })),
    });
  }

  try {
    const tenantId = req.auth.tenantId;

    const pending = await approvalService.getPendingApprovals(tenantId);

    return res.json({
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
        expiresIn: p.expiresAt
          ? Math.round((new Date(p.expiresAt).getTime() - Date.now()) / 1000) + 's'
          : null,
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
router.get('/queue/stats', async (req, res, next) => {
  try {
    const tenantId = req.auth.tenantId;
    const stats = await approvalService.getQueueStats(tenantId);

    return res.json({
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
router.get('/:approvalId', async (req, res, next) => {
  try {
    const { approvalId } = req.params;
    const tenantId = req.auth.tenantId;

    const status = await approvalService.getApprovalStatus(approvalId);

    return res.json({
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
router.post('/:approvalId/approve', async (req, res, next) => {
  try {
    const { approvalId } = req.params;
    const tenantId = req.auth.tenantId;
    const { approvedBy, comment } = req.body || {};

    if (!approvedBy) {
      return res.status(400).json({
        error: 'Missing required field: approvedBy',
        code: 'VALIDATION_ERROR',
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
router.post('/:approvalId/reject', async (req, res, next) => {
  try {
    const { approvalId } = req.params;
    const tenantId = req.auth.tenantId;
    const { rejectedBy, reason } = req.body || {};

    if (!rejectedBy) {
      return res.status(400).json({
        error: 'Missing required field: rejectedBy',
        code: 'VALIDATION_ERROR',
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
