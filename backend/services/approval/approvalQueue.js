"use strict";

/**
 * Approval Queue Service
 *
 * Environment-safe approval management.
 *
 * Canonical scope:
 *
 * organizationId
 * + environmentId
 *
 * The in-memory cache is also scoped by environment so a copied approvalId
 * from another environment cannot be returned accidentally.
 */

const {
  approvalRepository,
} =
  require(
    "../../persistence/repositories"
  );

const {
  loggingService,
} =
  require("../infrastructure");

class ApprovalQueue {
  constructor() {
    this.backedBy =
      process.env
        .APPROVAL_QUEUE_BACKEND ||
      "memory";

    this.memoryStore =
      new Map();

    this.timeoutMs =
      parseInt(
        process.env
          .APPROVAL_TIMEOUT_MS ||
          "600000",
        10
      );

    console.log(
      "[ApprovalQueue] Initialized — primary store: persistence repository, in-memory cache:",
      this.backedBy === "memory"
        ? "enabled"
        : "disabled"
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
    const normalized =
      this._normalizeContext(
        context
      );

    if (
      !normalized.organizationId ||
      !normalized.environmentId
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

    return normalized;
  }

  _cacheKey(
    approvalId,
    context
  ) {
    const scope =
      this._assertScope(
        context
      );

    return [
      String(
        scope.organizationId
      ),
      String(
        scope.environmentId
      ),
      String(
        approvalId
      ),
    ].join("::");
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
  // CREATE
  // ==========================================================================

  async addApprovalRequest(
    decisionData,
    context = {}
  ) {
    const scope =
      this._assertScope({
        ...context,

        tenantId:
          decisionData.tenantId ||
          context.tenantId,

        incidentId:
          decisionData.incidentId ||
          context.incidentId,
      });

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
    } =
      decisionData;

    if (
      !tenantId ||
      !decisionId ||
      !action ||
      !resource
    ) {
      throw new Error(
        "Missing required fields for approval request"
      );
    }

    try {
      const approvalRequest =
        await approvalRepository
          .createRequest({
            tenantId,

            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

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

            metadata: {
              userAgent:
                scope.userAgent,

              ipAddress:
                scope.ipAddress,

              systemVersion:
                process.env
                  .VERSION ||
                "1.0.0",
            },
          });

      const cacheKey =
        this._cacheKey(
          approvalRequest
            .approvalId,
          scope
        );

      this.memoryStore.set(
        cacheKey,
        {
          ...toPlain(
            approvalRequest
          ),

          addedAt:
            Date.now(),
        }
      );

      console.log(
        "[ApprovalQueue] ✓ Added approval request",
        {
          approvalId:
            approvalRequest
              .approvalId,

          tenantId,

          organizationId:
            String(
              scope.organizationId
            ),

          environmentId:
            String(
              scope.environmentId
            ),

          action,

          correlationId,
        }
      );

      if (
        loggingService
      ) {
        loggingService
          .logQueue(
            approvalRequest
              .approvalId,

            "Approval request created",

            {
              tenantId,

              organizationId:
                String(
                  scope.organizationId
                ),

              environmentId:
                String(
                  scope.environmentId
                ),

              action,

              confidence,
            }
          );
      }

      return approvalRequest;
    } catch (error) {
      console.error(
        "[ApprovalQueue] Error adding approval request:",
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
    try {
      const scope =
        this._assertScope(
          context
        );

      return approvalRepository
        .findPending({
          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,
        });
    } catch (error) {
      console.error(
        "[ApprovalQueue] Error getting pending approvals:",
        error.message
      );

      return [];
    }
  }

  // ==========================================================================
  // GET ONE
  // ==========================================================================

  async getApprovalRequest(
    approvalId,
    context
  ) {
    try {
      const scope =
        this._assertScope(
          context
        );

      const cacheKey =
        this._cacheKey(
          approvalId,
          scope
        );

      if (
        this.memoryStore
          .has(
            cacheKey
          )
      ) {
        return this.memoryStore
          .get(
            cacheKey
          );
      }

      const request =
        await approvalRepository
          .findByApprovalId(
            approvalId,
            {
              organizationId:
                scope.organizationId,

              environmentId:
                scope.environmentId,
            }
          );

      if (request) {
        this.memoryStore
          .set(
            cacheKey,
            {
              ...toPlain(
                request
              ),

              addedAt:
                Date.now(),
            }
          );
      }

      return request;
    } catch (error) {
      console.error(
        "[ApprovalQueue] Error getting approval request:",
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // APPROVE
  // ==========================================================================

  async approveRequest(
    approvalId,
    approvedBy,
    metadata = {},
    context
  ) {
    try {
      const scope =
        this._assertScope(
          context
        );

      const request =
        await approvalRepository
          .findByApprovalId(
            approvalId,
            {
              organizationId:
                scope.organizationId,

              environmentId:
                scope.environmentId,
            }
          );

      if (!request) {
        throw this._notFound(
          approvalId
        );
      }

      const approvedRequest =
        await approvalRepository
          .approve(
            request,
            approvedBy,
            metadata
          );

      this.memoryStore.delete(
        this._cacheKey(
          approvalId,
          scope
        )
      );

      console.log(
        "[ApprovalQueue] ✓ Approved request",
        {
          approvalId,

          approvedBy,

          action:
            approvedRequest.action,

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
          .logQueue(
            approvalId,

            "Approval request approved",

            {
              approvedBy,

              action:
                approvedRequest.action,

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

      return approvedRequest;
    } catch (error) {
      console.error(
        "[ApprovalQueue] Error approving request:",
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
    metadata = {},
    context
  ) {
    try {
      const scope =
        this._assertScope(
          context
        );

      const request =
        await approvalRepository
          .findByApprovalId(
            approvalId,
            {
              organizationId:
                scope.organizationId,

              environmentId:
                scope.environmentId,
            }
          );

      if (!request) {
        throw this._notFound(
          approvalId
        );
      }

      const rejectedRequest =
        await approvalRepository
          .reject(
            request,
            rejectedBy,
            reason,
            metadata
          );

      this.memoryStore.delete(
        this._cacheKey(
          approvalId,
          scope
        )
      );

      console.log(
        "[ApprovalQueue] ✓ Rejected request",
        {
          approvalId,

          rejectedBy,

          reason,

          action:
            rejectedRequest.action,

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
          .logQueue(
            approvalId,

            "Approval request rejected",

            {
              rejectedBy,

              reason,

              action:
                rejectedRequest.action,

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

      return rejectedRequest;
    } catch (error) {
      console.error(
        "[ApprovalQueue] Error rejecting request:",
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  async cleanupExpired() {
    try {
      const now =
        new Date();

      let count =
        0;

      for (
        const [
          cacheKey,
          request,
        ]
        of this.memoryStore
          .entries()
      ) {
        if (
          new Date(
            request.expiresAt
          ) <
          now
        ) {
          this.memoryStore
            .delete(
              cacheKey
            );

          count +=
            1;
        }
      }

      console.log(
        "[ApprovalQueue] ✓ Cleaned up",
        count,
        "expired approval requests"
      );

      return count;
    } catch (error) {
      console.error(
        "[ApprovalQueue] Error cleaning up expired requests:",
        error.message
      );

      return 0;
    }
  }

  // ==========================================================================
  // STATS
  // ==========================================================================

  async getStats(
    context
  ) {
    const zeroStats = {
      total:
        0,

      pending:
        0,

      approved:
        0,

      rejected:
        0,

      expired:
        0,
    };

    try {
      const scope =
        this._assertScope(
          context
        );

      const [
        pending,
        approved,
        rejected,
        expired,
      ] =
        await Promise.all([
          approvalRepository
            .countByStatus(
              {
                organizationId:
                  scope.organizationId,

                environmentId:
                  scope.environmentId,
              },
              "pending"
            ),

          approvalRepository
            .countByStatus(
              {
                organizationId:
                  scope.organizationId,

                environmentId:
                  scope.environmentId,
              },
              "approved"
            ),

          approvalRepository
            .countByStatus(
              {
                organizationId:
                  scope.organizationId,

                environmentId:
                  scope.environmentId,
              },
              "rejected"
            ),

          approvalRepository
            .countByStatus(
              {
                organizationId:
                  scope.organizationId,

                environmentId:
                  scope.environmentId,
              },
              "expired"
            ),
        ]);

      return {
        total:
          pending +
          approved +
          rejected +
          expired,

        pending,

        approved,

        rejected,

        expired,
      };
    } catch (error) {
      console.error(
        "[ApprovalQueue] Error getting stats:",
        error.message
      );

      return zeroStats;
    }
  }

  // ==========================================================================
  // TEST SUPPORT
  // ==========================================================================

  clearMemoryStore() {
    this.memoryStore.clear();

    console.log(
      "[ApprovalQueue] Memory store cleared"
    );
  }
}

function toPlain(
  value
) {
  if (
    value &&
    typeof value.toObject ===
      "function"
  ) {
    return value
      .toObject();
  }

  if (
    value &&
    typeof value.toJSON ===
      "function"
  ) {
    return value
      .toJSON();
  }

  return {
    ...(value || {}),
  };
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance =
  null;

function getApprovalQueue() {
  if (!instance) {
    instance =
      new ApprovalQueue();
  }

  return instance;
}

module.exports = {
  ApprovalQueue,
  getApprovalQueue,
};