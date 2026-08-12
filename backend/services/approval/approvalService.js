"use strict";

/**
 * Approval Service
 *
 * Orchestrates the human-approval workflow.
 *
 * Canonical runtime scope:
 *
 * {
 *   tenantId,
 *   organizationId,
 *   environmentId,
 *   incidentId?
 * }
 *
 * Approval reads and mutations must always use the same
 * organization + environment scope as the decision that created them.
 */

const {
  getApprovalQueue,
} =
  require("./approvalQueue");

const {
  decisionTraceService,
} =
  require("../core");

const {
  loggingService,
} =
  require("../infrastructure");

class ApprovalService {
  constructor() {
    this.queue =
      getApprovalQueue();

    this.escalationThreshold =
      parseFloat(
        process.env
          .ESCALATION_THRESHOLD ||
          "0.60"
      );

    this.autoExecuteThreshold =
      parseFloat(
        process.env
          .AUTO_EXECUTE_THRESHOLD ||
          "0.85"
      );
  }

  // ==========================================================================
  // CONTEXT
  // ==========================================================================

  _normalizeContext(
    context = {}
  ) {
    return {
      tenantId:
        context.tenantId ||
        null,

      organizationId:
        context.organizationId ||
        null,

      environmentId:
        context.environmentId ||
        null,

      incidentId:
        context.incidentId ||
        null,

      userAgent:
        context.userAgent ||
        null,

      ipAddress:
        context.ipAddress ||
        null,
    };
  }

  _assertScope(
    context = {}
  ) {
    const scope =
      this._normalizeContext(
        context
      );

    if (
      !scope.organizationId ||
      !scope.environmentId
    ) {
      const error =
        new Error(
          "organizationId and environmentId are required for approval operations"
        );

      error.status =
        400;

      error.code =
        "APPROVAL_SCOPE_REQUIRED";

      throw error;
    }

    return scope;
  }

  _notFound(
    approvalId
  ) {
    const error =
      new Error(
        `Approval request not found: ${approvalId}`
      );

    error.status =
      404;

    error.code =
      "APPROVAL_NOT_FOUND";

    return error;
  }

  // ==========================================================================
  // APPROVAL DECISION
  // ==========================================================================

  requiresApproval(
    confidence
  ) {
    if (
      confidence >=
      this.autoExecuteThreshold
    ) {
      return {
        requiresApproval:
          false,

        reason:
          "High confidence - auto-execution allowed",

        tier:
          "AUTO_EXECUTE",
      };
    }

    if (
      confidence >=
      this.escalationThreshold
    ) {
      return {
        requiresApproval:
          true,

        reason:
          "Medium confidence - human approval required",

        tier:
          "ESCALATE",
      };
    }

    return {
      requiresApproval:
        true,

      reason:
        "Low confidence - blocked, approval required to proceed",

      tier:
        "OBSERVE",
    };
  }

  // ==========================================================================
  // CREATE
  // ==========================================================================

  async createApprovalRequest(
    decision,
    context = {}
  ) {
    const {
      tenantId,
      decisionId,
      correlationId,
      action,
      reason,
      severity,
      confidence,
      resource,
      namespace,
      additionalParams,
      decisionTrace,
      incidentId,
    } =
      decision;

    if (
      !tenantId ||
      !decisionId ||
      !action ||
      !resource
    ) {
      throw new Error(
        "Missing required decision fields: tenantId, decisionId, action, resource"
      );
    }

    const scope =
      this._assertScope({
        ...context,

        tenantId:
          tenantId ||
          context.tenantId,

        incidentId:
          incidentId ||
          context.incidentId,
      });

    try {
      const approvalCheck =
        this.requiresApproval(
          confidence
        );

      if (
        !approvalCheck
          .requiresApproval
      ) {
        throw new Error(
          `Approval not needed for confidence ${confidence}. Use auto-execution instead.`
        );
      }

      const approvalRequest =
        await this.queue
          .addApprovalRequest(
            {
              tenantId,

              incidentId:
                scope.incidentId,

              decisionId,

              correlationId,

              action,

              reason,

              severity,

              confidence,

              resource,

              namespace,

              additionalParams,

              decisionTrace,
            },

            scope
          );

      console.log(
        "[ApprovalService] ✓ Approval request created",
        {
          approvalId:
            approvalRequest
              .approvalId,

          decisionId,

          action,

          confidence,

          organizationId:
            String(
              scope.organizationId
            ),

          environmentId:
            String(
              scope.environmentId
            ),
        }
      );

      if (
        loggingService
      ) {
        loggingService
          .logDecision(
            decisionId,

            "Approval request created",

            {
              approvalId:
                approvalRequest
                  .approvalId,

              action,

              confidence,

              tenantId,

              organizationId:
                String(
                  scope.organizationId
                ),

              environmentId:
                String(
                  scope.environmentId
                ),
            }
          );
      }

      return approvalRequest;
    } catch (error) {
      console.error(
        "[ApprovalService] Error creating approval request:",
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // LIST
  // ==========================================================================

  async getPendingApprovals(
    context
  ) {
    const scope =
      this._assertScope(
        context
      );

    try {
      const pending =
        await this.queue
          .getPendingApprovals(
            scope
          );

      console.log(
        "[ApprovalService] Found pending approvals",
        {
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

          count:
            pending.length,
        }
      );

      return pending;
    } catch (error) {
      console.error(
        "[ApprovalService] Error getting pending approvals:",
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // STATUS
  // ==========================================================================

  async getApprovalStatus(
    approvalId,
    context
  ) {
    const scope =
      this._assertScope(
        context
      );

    try {
      const request =
        await this.queue
          .getApprovalRequest(
            approvalId,
            scope
          );

      if (!request) {
        throw this._notFound(
          approvalId
        );
      }

      return {
        approvalId:
          request.approvalId,

        status:
          request.status,

        action:
          request.action,

        reason:
          request.reason,

        confidence:
          request.confidence,

        resource:
          request.resource,

        createdAt:
          request.createdAt,

        expiresAt:
          request.expiresAt,

        approvedBy:
          request.approvedBy,

        rejectedBy:
          request.rejectedBy,

        rejectionReason:
          request.rejectionReason,

        organizationId:
          request.organizationId,

        environmentId:
          request.environmentId,

        incidentId:
          request.incidentId,
      };
    } catch (error) {
      console.error(
        "[ApprovalService] Error getting approval status:",
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // APPROVE
  // ==========================================================================

  async approveAndExecute(
    approvalId,
    approvedBy,
    context = {}
  ) {
    const scope =
      this._assertScope(
        context
      );

    try {
      const request =
        await this.queue
          .getApprovalRequest(
            approvalId,
            scope
          );

      if (!request) {
        throw this._notFound(
          approvalId
        );
      }

      if (
        request.status !==
        "pending"
      ) {
        throw new Error(
          `Cannot approve request with status: ${request.status}`
        );
      }

      const now =
        Date.now();

      const expiresAt =
        new Date(
          request.expiresAt
        ).getTime();

      if (
        now >
        expiresAt
      ) {
        throw new Error(
          "Approval request has expired"
        );
      }

      /**
       * Queue API:
       *
       * approveRequest(
       *   approvalId,
       *   approvedBy,
       *   metadata,
       *   scope
       * )
       */
      await this.queue
        .approveRequest(
          approvalId,
          approvedBy,
          {
            userAgent:
              scope.userAgent,

            ipAddress:
              scope.ipAddress,
          },
          scope
        );

      console.log(
        "[ApprovalService] ✓ Request approved",
        {
          approvalId,

          approvedBy,

          action:
            request.action,

          environmentId:
            String(
              scope.environmentId
            ),
        }
      );

      if (
        loggingService
      ) {
        loggingService
          .logDecision(
            request.decisionId,

            "Approval granted",

            {
              approvalId,

              approvedBy,

              action:
                request.action,

              organizationId:
                String(
                  scope.organizationId
                ),

              environmentId:
                String(
                  scope.environmentId
                ),
            }
          );
      }

      return {
        approvalId,

        status:
          "approved",

        message:
          "Approval granted. Action is now approved for execution.",

        action:
          request.action,

        resource:
          request.resource,

        approvedBy,

        environmentId:
          scope.environmentId,

        timestamp:
          new Date()
            .toISOString(),
      };
    } catch (error) {
      console.error(
        "[ApprovalService] Error approving request:",
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // REJECT
  // ==========================================================================

  async rejectRequest(
    approvalId,
    rejectedBy,
    reason = "",
    context = {}
  ) {
    const scope =
      this._assertScope(
        context
      );

    try {
      const request =
        await this.queue
          .getApprovalRequest(
            approvalId,
            scope
          );

      if (!request) {
        throw this._notFound(
          approvalId
        );
      }

      if (
        request.status !==
        "pending"
      ) {
        throw new Error(
          `Cannot reject request with status: ${request.status}`
        );
      }

      /**
       * Queue API:
       *
       * rejectRequest(
       *   approvalId,
       *   rejectedBy,
       *   reason,
       *   metadata,
       *   scope
       * )
       */
      await this.queue
        .rejectRequest(
          approvalId,
          rejectedBy,
          reason,
          {
            userAgent:
              scope.userAgent,

            ipAddress:
              scope.ipAddress,
          },
          scope
        );

      console.log(
        "[ApprovalService] ✓ Request rejected",
        {
          approvalId,

          rejectedBy,

          reason,

          action:
            request.action,

          environmentId:
            String(
              scope.environmentId
            ),
        }
      );

      if (
        loggingService
      ) {
        loggingService
          .logDecision(
            request.decisionId,

            "Approval denied",

            {
              approvalId,

              rejectedBy,

              reason,

              action:
                request.action,

              organizationId:
                String(
                  scope.organizationId
                ),

              environmentId:
                String(
                  scope.environmentId
                ),
            }
          );
      }

      return {
        approvalId,

        status:
          "rejected",

        message:
          "Approval request has been rejected.",

        action:
          request.action,

        rejectedBy,

        reason,

        environmentId:
          scope.environmentId,

        timestamp:
          new Date()
            .toISOString(),
      };
    } catch (error) {
      console.error(
        "[ApprovalService] Error rejecting request:",
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // MAIN DECISION ENTRY
  // ==========================================================================

  async handleDecision(
    decision,
    context = {}
  ) {
    const {
      confidence,
      decisionId,
    } =
      decision;

    const scope =
      this._assertScope({
        ...context,

        tenantId:
          decision.tenantId ||
          context.tenantId,

        incidentId:
          decision.incidentId ||
          context.incidentId,
      });

    const approvalCheck =
      this.requiresApproval(
        confidence
      );

    if (
      !approvalCheck
        .requiresApproval
    ) {
      console.log(
        "[ApprovalService] Auto-executing decision",
        {
          decisionId,

          confidence,

          tier:
            approvalCheck
              .tier,

          environmentId:
            String(
              scope.environmentId
            ),
        }
      );

      return {
        requiresApproval:
          false,

        autoExecuted:
          true,

        tier:
          approvalCheck
            .tier,

        message:
          approvalCheck
            .reason,
      };
    }

    console.log(
      "[ApprovalService] Creating approval request",
      {
        decisionId,

        confidence,

        tier:
          approvalCheck
            .tier,

        environmentId:
          String(
            scope.environmentId
          ),
      }
    );

    const approvalRequest =
      await this
        .createApprovalRequest(
          decision,
          scope
        );

    return {
      requiresApproval:
        true,

      autoExecuted:
        false,

      approvalRequest,

      tier:
        approvalCheck
          .tier,

      message:
        approvalCheck
          .reason,
    };
  }

  // ==========================================================================
  // STATS
  // ==========================================================================

  async getQueueStats(
    context
  ) {
    const scope =
      this._assertScope(
        context
      );

    return this.queue
      .getStats(
        scope
      );
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  async cleanupExpired() {
    return this.queue
      .cleanupExpired();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance =
  null;

function getApprovalService() {
  if (!instance) {
    instance =
      new ApprovalService();
  }

  return instance;
}

module.exports = {
  ApprovalService,
  getApprovalService,
};