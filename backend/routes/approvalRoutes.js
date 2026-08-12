'use strict';

/**
 * Approval Routes
 *
 * API endpoints for approval workflow:
 *
 * - GET    /approvals
 * - GET    /approvals/queue/stats
 * - GET    /approvals/:approvalId
 * - POST   /approvals/:approvalId/approve
 * - POST   /approvals/:approvalId/reject
 *
 * Canonical approval scope:
 *
 * tenantId
 * + organizationId
 * + environmentId
 *
 * An approval created for one environment must never be visible,
 * approved, rejected, or counted from another environment.
 */

const express = require('express');
const Joi = require('joi');

const {
  getApprovalService,
} = require('../services/approval');

const {
  loggingService,
} = require('../services/infrastructure');

const router = express.Router({
  mergeParams: true,
});

const approvalService =
  getApprovalService();

// ============================================================================
// VALIDATION
// ============================================================================

const listQuerySchema = Joi.object({
  status: Joi.string()
    .valid(
      'pending',
      'approved',
      'rejected',
      'expired',
      'executed'
    )
    .optional(),

  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(50),

  sort: Joi.string()
    .valid(
      'asc',
      'desc'
    )
    .default('desc'),

  cursor: Joi.string()
    .optional(),
});

// ============================================================================
// SCOPE
// ============================================================================

/**
 * Build canonical approval ownership context from authenticated request.
 *
 * Expected authenticated fields:
 *
 * req.auth.tenantId
 * req.auth.organizationId
 * req.auth.environmentId
 *
 * Some existing environment middleware may expose environmentId through
 * req.environment or req.context, so safe fallbacks are retained.
 */
function getApprovalScope(req) {
  const tenantId =
    req.auth?.tenantId ||
    null;

  const organizationId =
    req.auth?.organizationId ||
    req.organizationId ||
    req.context?.organizationId ||
    null;

  const environmentId =
    req.auth?.environmentId ||
    req.environmentId ||
    req.environment?._id ||
    req.environment?.id ||
    req.context?.environmentId ||
    null;

  if (!tenantId) {
    const error =
      new Error(
        'Authenticated tenantId is required'
      );

    error.status = 400;
    error.code =
      'APPROVAL_TENANT_REQUIRED';

    throw error;
  }

  if (!organizationId) {
    const error =
      new Error(
        'Authenticated organizationId is required'
      );

    error.status = 400;
    error.code =
      'APPROVAL_ORGANIZATION_REQUIRED';

    throw error;
  }

  if (!environmentId) {
    const error =
      new Error(
        'Active environmentId is required for approval operations'
      );

    error.status = 400;
    error.code =
      'APPROVAL_ENVIRONMENT_REQUIRED';

    throw error;
  }

  return {
    tenantId,
    organizationId,
    environmentId,

    userAgent:
      req.get('user-agent'),

    ipAddress:
      req.ip,
  };
}

// ============================================================================
// SERIALISER
// ============================================================================

function serializeApproval(
  approval
) {
  return {
    approvalId:
      approval.approvalId,

    decisionId:
      approval.decisionId,

    incidentId:
      approval.incidentId ||
      null,

    action:
      approval.action,

    reason:
      approval.reason,

    confidence:
      approval.confidence,

    resource:
      approval.resource,

    namespace:
      approval.namespace,

    severity:
      approval.severity,

    status:
      approval.status,

    createdAt:
      approval.createdAt,

    expiresAt:
      approval.expiresAt,

    approvedBy:
      approval.approvedBy ||
      null,

    rejectedBy:
      approval.rejectedBy ||
      null,

    rejectionReason:
      approval.rejectionReason ||
      null,

    organizationId:
      approval.organizationId,

    environmentId:
      approval.environmentId,

    expiresIn:
      approval.expiresAt
        ? `${Math.max(
            0,
            Math.round(
              (
                new Date(
                  approval.expiresAt
                ).getTime() -
                Date.now()
              ) /
              1000
            )
          )}s`
        : null,
  };
}

// ============================================================================
// GET /approvals
// ============================================================================

/**
 * List pending approval requests for the current environment.
 */
router.get(
  '/',
  async (
    req,
    res,
    next
  ) => {
    const {
      error: queryError,
      value: query,
    } =
      listQuerySchema.validate(
        req.query,
        {
          abortEarly: false,
          stripUnknown: true,
        }
      );

    if (queryError) {
      return res
        .status(400)
        .json({
          error:
            'Invalid query parameters',

          code:
            'VALIDATION_ERROR',

          details:
            queryError.details.map(
              (detail) => ({
                field:
                  detail.path.join('.'),

                message:
                  detail.message,
              })
            ),
        });
    }

    try {
      const scope =
        getApprovalScope(req);

      /**
       * ApprovalService currently returns pending approvals.
       *
       * status/limit/sort/cursor remain validated here for API compatibility
       * and can later be moved into the service query implementation.
       */
      const pending =
        await approvalService
          .getPendingApprovals(
            scope
          );

      let results =
        [...pending];

      if (
        query.status &&
        query.status !==
          'pending'
      ) {
        results =
          results.filter(
            (approval) =>
              approval.status ===
              query.status
          );
      }

      results.sort(
        (a, b) => {
          const first =
            new Date(
              a.createdAt
            ).getTime();

          const second =
            new Date(
              b.createdAt
            ).getTime();

          return query.sort ===
            'asc'
            ? first -
                second
            : second -
                first;
        }
      );

      results =
        results.slice(
          0,
          query.limit
        );

      return res.json({
        tenantId:
          scope.tenantId,

        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        pendingCount:
          results.length,

        pending:
          results.map(
            serializeApproval
          ),
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ============================================================================
// GET /approvals/queue/stats
// ============================================================================

/**
 * Environment-scoped approval queue statistics.
 */
router.get(
  '/queue/stats',
  async (
    req,
    res,
    next
  ) => {
    try {
      const scope =
        getApprovalScope(req);

      const stats =
        await approvalService
          .getQueueStats(
            scope
          );

      return res.json({
        tenantId:
          scope.tenantId,

        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        queue:
          stats,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ============================================================================
// GET /approvals/:approvalId
// ============================================================================

/**
 * Get a single approval within the active environment.
 *
 * Cross-environment approval IDs resolve as NOT_FOUND rather than exposing
 * that the resource exists elsewhere.
 */
router.get(
  '/:approvalId',
  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        approvalId,
      } =
        req.params;

      const scope =
        getApprovalScope(req);

      const status =
        await approvalService
          .getApprovalStatus(
            approvalId,
            scope
          );

      return res.json({
        tenantId:
          scope.tenantId,

        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        approval:
          status,
      });
    } catch (error) {
      if (
        error.code ===
          'APPROVAL_NOT_FOUND' ||
        error.message
          ?.toLowerCase()
          .includes(
            'not found'
          )
      ) {
        error.status = 404;
      }

      return next(error);
    }
  }
);

// ============================================================================
// POST /approvals/:approvalId/approve
// ============================================================================

/**
 * Approve an approval request.
 *
 * Body:
 *
 * {
 *   "approvedBy": "user-id or service-name",
 *   "comment": "optional approval comment"
 * }
 */
router.post(
  '/:approvalId/approve',
  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        approvalId,
      } =
        req.params;

      const scope =
        getApprovalScope(req);

      const {
        approvedBy,
        comment,
      } =
        req.body ||
        {};

      if (!approvedBy) {
        return res
          .status(400)
          .json({
            error:
              'Missing required field: approvedBy',

            code:
              'VALIDATION_ERROR',
          });
      }

      /**
       * ApprovalService signature:
       *
       * approveAndExecute(
       *   approvalId,
       *   approvedBy,
       *   context
       * )
       */
      const result =
        await approvalService
          .approveAndExecute(
            approvalId,

            approvedBy,

            {
              ...scope,

              comment,
            }
          );

      if (
        loggingService
      ) {
        loggingService
          .logStructured({
            level:
              'info',

            message:
              'Approval request approved via API',

            service:
              'approval-routes',

            tenantId:
              scope.tenantId,

            organizationId:
              String(
                scope.organizationId
              ),

            environmentId:
              String(
                scope.environmentId
              ),

            approvalId,

            approvedBy,
          });
      }

      return res.json({
        tenantId:
          scope.tenantId,

        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        result,
      });
    } catch (error) {
      if (
        error.code ===
          'APPROVAL_NOT_FOUND' ||
        error.message
          ?.toLowerCase()
          .includes(
            'not found'
          )
      ) {
        error.status = 404;
      }

      if (
        error.message
          ?.includes(
            'Cannot approve'
          ) ||
        error.message
          ?.includes(
            'expired'
          )
      ) {
        error.status = 409;
      }

      return next(error);
    }
  }
);

// ============================================================================
// POST /approvals/:approvalId/reject
// ============================================================================

/**
 * Reject an approval request.
 *
 * Body:
 *
 * {
 *   "rejectedBy": "user-id or service-name",
 *   "reason": "reason for rejection"
 * }
 */
router.post(
  '/:approvalId/reject',
  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        approvalId,
      } =
        req.params;

      const scope =
        getApprovalScope(req);

      const {
        rejectedBy,
        reason,
      } =
        req.body ||
        {};

      if (!rejectedBy) {
        return res
          .status(400)
          .json({
            error:
              'Missing required field: rejectedBy',

            code:
              'VALIDATION_ERROR',
          });
      }

      /**
       * ApprovalService signature:
       *
       * rejectRequest(
       *   approvalId,
       *   rejectedBy,
       *   reason,
       *   context
       * )
       */
      const result =
        await approvalService
          .rejectRequest(
            approvalId,

            rejectedBy,

            reason ||
              '',

            {
              ...scope,
            }
          );

      if (
        loggingService
      ) {
        loggingService
          .logStructured({
            level:
              'info',

            message:
              'Approval request rejected via API',

            service:
              'approval-routes',

            tenantId:
              scope.tenantId,

            organizationId:
              String(
                scope.organizationId
              ),

            environmentId:
              String(
                scope.environmentId
              ),

            approvalId,

            rejectedBy,

            reason:
              reason ||
              '',
          });
      }

      return res.json({
        tenantId:
          scope.tenantId,

        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        result,
      });
    } catch (error) {
      if (
        error.code ===
          'APPROVAL_NOT_FOUND' ||
        error.message
          ?.toLowerCase()
          .includes(
            'not found'
          )
      ) {
        error.status = 404;
      }

      if (
        error.message
          ?.includes(
            'Cannot reject'
          )
      ) {
        error.status = 409;
      }

      return next(error);
    }
  }
);

module.exports =
  router;