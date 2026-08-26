"use strict";

/**
 * ============================================================================
 * AIRA PHASE 14 — APPROVAL ROUTES
 * ============================================================================
 *
 * Approval workflow API:
 *
 * GET    /approvals
 * GET    /approvals/queue/stats
 * GET    /approvals/:approvalId
 * POST   /approvals/:approvalId/approve
 * POST   /approvals/:approvalId/reject
 *
 * Canonical ownership scope:
 *
 * tenantId
 * + organizationId
 * + environmentId
 *
 * Phase 14 authorization:
 *
 * Read approval state:
 *   execution.read
 *
 * Approve / reject:
 *   execution.approve
 *
 * SECURITY:
 *
 * approvedBy / rejectedBy MUST NOT be trusted from request bodies.
 *
 * The authenticated principal represented by req.context.userId is the
 * authoritative human identity performing the approval operation.
 */

const express =
  require(
    "express"
  );

const Joi =
  require(
    "joi"
  );

const {
  getApprovalService,
} =
  require(
    "../services/approval"
  );

const {
  loggingService,
} =
  require(
    "../services/infrastructure"
  );

const {
  PERMISSIONS,
} =
  require(
    "../constants/permissions"
  );

const {
  requirePermission,
} =
  require(
    "../middleware/authorizationMiddleware"
  );

const router =
  express.Router({
    mergeParams:
      true,
  });

const approvalService =
  getApprovalService();

/**
 * ============================================================================
 * VALIDATION
 * ============================================================================
 */

const listQuerySchema =
  Joi.object({
    status:
      Joi.string()
        .valid(
          "pending",
          "approved",
          "rejected",
          "expired",
          "executed"
        )
        .optional(),

    limit:
      Joi.number()
        .integer()
        .min(1)
        .max(100)
        .default(50),

    sort:
      Joi.string()
        .valid(
          "asc",
          "desc"
        )
        .default(
          "desc"
        ),

    cursor:
      Joi.string()
        .optional(),
  });

const approveBodySchema =
  Joi.object({
    /**
     * approvedBy is intentionally NOT accepted.
     *
     * Identity comes from req.context.userId.
     */
    comment:
      Joi.string()
        .trim()
        .max(1000)
        .allow("")
        .default(""),
  })
    .unknown(false);

const rejectBodySchema =
  Joi.object({
    /**
     * rejectedBy is intentionally NOT accepted.
     *
     * Identity comes from req.context.userId.
     */
    reason:
      Joi.string()
        .trim()
        .max(1000)
        .allow("")
        .default(""),
  })
    .unknown(false);

/**
 * ============================================================================
 * VALIDATION HELPERS
 * ============================================================================
 */

function validateBody(
  schema
) {
  return (
    req,
    res,
    next
  ) => {
    const {
      error,
      value,
    } =
      schema.validate(
        req.body ||
          {},
        {
          abortEarly:
            false,

          stripUnknown:
            false,
        }
      );

    if (
      error
    ) {
      return res
        .status(
          400
        )
        .json({
          error:
            "Invalid request body",

          code:
            "VALIDATION_ERROR",

          details:
            error
              .details
              .map(
                (
                  detail
                ) => ({
                  field:
                    detail
                      .path
                      .join(
                        "."
                      ),

                  message:
                    detail
                      .message,
                })
              ),
        });
    }

    req.validatedBody =
      value;

    return next();
  };
}

/**
 * ============================================================================
 * SCOPE
 * ============================================================================
 */

/**
 * Build canonical approval ownership context.
 *
 * Authentication / tenant middleware is mounted by server.js before this
 * router.
 */
function getApprovalScope(
  req
) {
  const tenantId =
    req.auth
      ?.tenantId ||
    null;

  const organizationId =
    req.context
      ?.organizationId ||
    req.auth
      ?.organizationId ||
    req.organizationId ||
    null;

  const environmentId =
    req.context
      ?.environmentId ||
    req.auth
      ?.environmentId ||
    req.environmentId ||
    req.environment
      ?._id ||
    req.environment
      ?.id ||
    null;

  if (
    !tenantId
  ) {
    const error =
      new Error(
        "Authenticated tenantId is required"
      );

    error.status =
      400;

    error.code =
      "APPROVAL_TENANT_REQUIRED";

    throw error;
  }

  if (
    !organizationId
  ) {
    const error =
      new Error(
        "Authenticated organizationId is required"
      );

    error.status =
      400;

    error.code =
      "APPROVAL_ORGANIZATION_REQUIRED";

    throw error;
  }

  if (
    !environmentId
  ) {
    const error =
      new Error(
        "Active environmentId is required for approval operations"
      );

    error.status =
      400;

    error.code =
      "APPROVAL_ENVIRONMENT_REQUIRED";

    throw error;
  }

  return {
    tenantId,

    organizationId,

    environmentId,

    userAgent:
      req.get(
        "user-agent"
      ),

    ipAddress:
      req.ip,
  };
}

/**
 * ============================================================================
 * PRINCIPAL
 * ============================================================================
 */

/**
 * Resolve the authenticated human principal performing an approval action.
 *
 * Client-controlled identity values are forbidden.
 */
function getAuthenticatedActorId(
  req
) {
  const userId =
    req.context
      ?.userId ||
    null;

  if (
    !userId
  ) {
    const error =
      new Error(
        "Authenticated user identity is required for approval operations"
      );

    error.status =
      403;

    error.code =
      "APPROVAL_ACTOR_REQUIRED";

    error.executionAuthorized =
      false;

    throw error;
  }

  return String(
    userId
  );
}

/**
 * ============================================================================
 * SERIALIZER
 * ============================================================================
 */

function serializeApproval(
  approval
) {
  return {
    approvalId:
      approval
        .approvalId,

    decisionId:
      approval
        .decisionId,

    incidentId:
      approval
        .incidentId ||
      null,

    action:
      approval
        .action,

    reason:
      approval
        .reason,

    confidence:
      approval
        .confidence,

    resource:
      approval
        .resource,

    namespace:
      approval
        .namespace,

    severity:
      approval
        .severity,

    status:
      approval
        .status,

    createdAt:
      approval
        .createdAt,

    expiresAt:
      approval
        .expiresAt,

    approvedBy:
      approval
        .approvedBy ||
      null,

    rejectedBy:
      approval
        .rejectedBy ||
      null,

    rejectionReason:
      approval
        .rejectionReason ||
      null,

    organizationId:
      approval
        .organizationId,

    environmentId:
      approval
        .environmentId,

    expiresIn:
      approval
        .expiresAt
        ? `${Math.max(
            0,

            Math.round(
              (
                new Date(
                  approval
                    .expiresAt
                )
                  .getTime() -
                Date.now()
              ) /
                1000
            )
          )}s`
        : null,
  };
}

/**
 * ============================================================================
 * GET /approvals
 * ============================================================================
 *
 * Permission:
 *
 * execution.read
 */

router.get(
  "/",

  requirePermission(
    PERMISSIONS
      .EXECUTION_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    const {
      error:
        queryError,

      value:
        query,
    } =
      listQuerySchema
        .validate(
          req.query,
          {
            abortEarly:
              false,

            stripUnknown:
              true,
          }
        );

    if (
      queryError
    ) {
      return res
        .status(
          400
        )
        .json({
          error:
            "Invalid query parameters",

          code:
            "VALIDATION_ERROR",

          details:
            queryError
              .details
              .map(
                (
                  detail
                ) => ({
                  field:
                    detail
                      .path
                      .join(
                        "."
                      ),

                  message:
                    detail
                      .message,
                })
              ),
        });
    }

    try {
      const scope =
        getApprovalScope(
          req
        );

      const pending =
        await approvalService
          .getPendingApprovals(
            scope
          );

      let results =
        [
          ...pending,
        ];

      if (
        query.status &&
        query.status !==
          "pending"
      ) {
        results =
          results.filter(
            (
              approval
            ) =>
              approval
                .status ===
              query.status
          );
      }

      results.sort(
        (
          firstApproval,
          secondApproval
        ) => {
          const first =
            new Date(
              firstApproval
                .createdAt
            ).getTime();

          const second =
            new Date(
              secondApproval
                .createdAt
            ).getTime();

          return query.sort ===
            "asc"
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
          scope
            .tenantId,

        organizationId:
          scope
            .organizationId,

        environmentId:
          scope
            .environmentId,

        pendingCount:
          results.length,

        pending:
          results.map(
            serializeApproval
          ),
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

/**
 * ============================================================================
 * GET /approvals/queue/stats
 * ============================================================================
 *
 * Permission:
 *
 * execution.read
 */

router.get(
  "/queue/stats",

  requirePermission(
    PERMISSIONS
      .EXECUTION_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const scope =
        getApprovalScope(
          req
        );

      const stats =
        await approvalService
          .getQueueStats(
            scope
          );

      return res.json({
        tenantId:
          scope
            .tenantId,

        organizationId:
          scope
            .organizationId,

        environmentId:
          scope
            .environmentId,

        queue:
          stats,
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

/**
 * ============================================================================
 * GET /approvals/:approvalId
 * ============================================================================
 *
 * Permission:
 *
 * execution.read
 *
 * Cross-environment IDs resolve as NOT_FOUND rather than exposing existence
 * in another environment.
 */

router.get(
  "/:approvalId",

  requirePermission(
    PERMISSIONS
      .EXECUTION_READ
  ),

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
        getApprovalScope(
          req
        );

      const status =
        await approvalService
          .getApprovalStatus(
            approvalId,
            scope
          );

      return res.json({
        tenantId:
          scope
            .tenantId,

        organizationId:
          scope
            .organizationId,

        environmentId:
          scope
            .environmentId,

        approval:
          status,
      });
    } catch (
      error
    ) {
      if (
        error.code ===
          "APPROVAL_NOT_FOUND" ||
        error.message
          ?.toLowerCase()
          .includes(
            "not found"
          )
      ) {
        error.status =
          404;
      }

      return next(
        error
      );
    }
  }
);

/**
 * ============================================================================
 * POST /approvals/:approvalId/approve
 * ============================================================================
 *
 * Permission:
 *
 * execution.approve
 *
 * Body:
 *
 * {
 *   "comment": "optional approval comment"
 * }
 *
 * IMPORTANT:
 *
 * approvedBy comes exclusively from req.context.userId.
 */

router.post(
  "/:approvalId/approve",

  requirePermission(
    PERMISSIONS
      .EXECUTION_APPROVE
  ),

  validateBody(
    approveBodySchema
  ),

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
        getApprovalScope(
          req
        );

      const approvedBy =
        getAuthenticatedActorId(
          req
        );

      const {
        comment,
      } =
        req.validatedBody;

      const result =
        await approvalService
          .approveAndExecute(
            approvalId,

            approvedBy,

            {
              ...scope,

              comment:
                comment ||
                "",
            }
          );

      if (
        loggingService
      ) {
        loggingService
          .logStructured({
            level:
              "info",

            message:
              "Approval request approved via API",

            service:
              "approval-routes",

            tenantId:
              scope
                .tenantId,

            organizationId:
              String(
                scope
                  .organizationId
              ),

            environmentId:
              String(
                scope
                  .environmentId
              ),

            approvalId,

            approvedBy,
          });
      }

      return res.json({
        tenantId:
          scope
            .tenantId,

        organizationId:
          scope
            .organizationId,

        environmentId:
          scope
            .environmentId,

        result,
      });
    } catch (
      error
    ) {
      if (
        error.code ===
          "APPROVAL_NOT_FOUND" ||
        error.message
          ?.toLowerCase()
          .includes(
            "not found"
          )
      ) {
        error.status =
          404;
      }

      if (
        error.message
          ?.includes(
            "Cannot approve"
          ) ||
        error.message
          ?.includes(
            "expired"
          )
      ) {
        error.status =
          409;
      }

      return next(
        error
      );
    }
  }
);

/**
 * ============================================================================
 * POST /approvals/:approvalId/reject
 * ============================================================================
 *
 * Permission:
 *
 * execution.approve
 *
 * Rejecting an approval is considered part of the approval authority domain.
 *
 * Body:
 *
 * {
 *   "reason": "optional rejection reason"
 * }
 *
 * IMPORTANT:
 *
 * rejectedBy comes exclusively from req.context.userId.
 */

router.post(
  "/:approvalId/reject",

  requirePermission(
    PERMISSIONS
      .EXECUTION_APPROVE
  ),

  validateBody(
    rejectBodySchema
  ),

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
        getApprovalScope(
          req
        );

      const rejectedBy =
        getAuthenticatedActorId(
          req
        );

      const {
        reason,
      } =
        req.validatedBody;

      const result =
        await approvalService
          .rejectRequest(
            approvalId,

            rejectedBy,

            reason ||
              "",

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
              "info",

            message:
              "Approval request rejected via API",

            service:
              "approval-routes",

            tenantId:
              scope
                .tenantId,

            organizationId:
              String(
                scope
                  .organizationId
              ),

            environmentId:
              String(
                scope
                  .environmentId
              ),

            approvalId,

            rejectedBy,

            reason:
              reason ||
              "",
          });
      }

      return res.json({
        tenantId:
          scope
            .tenantId,

        organizationId:
          scope
            .organizationId,

        environmentId:
          scope
            .environmentId,

        result,
      });
    } catch (
      error
    ) {
      if (
        error.code ===
          "APPROVAL_NOT_FOUND" ||
        error.message
          ?.toLowerCase()
          .includes(
            "not found"
          )
      ) {
        error.status =
          404;
      }

      if (
        error.message
          ?.includes(
            "Cannot reject"
          )
      ) {
        error.status =
          409;
      }

      return next(
        error
      );
    }
  }
);

module.exports =
  router;