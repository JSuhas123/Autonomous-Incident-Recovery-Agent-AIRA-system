"use strict";

const mongoose =
  require("../../persistence/operational/mongooseCompat");

/**
 * Execution Modes Service
 *
 * Legacy execution-mode configuration subsystem.
 *
 * IMPORTANT PHASE 13 NOTE:
 *
 * This service still owns inline Mongoose schemas and therefore remains
 * a Mongo-retirement blocker. It will be migrated into canonical
 * provider-neutral persistence during the remaining Mongo-runtime batch.
 *
 * For now, its internal execution request model MUST NOT use the global
 * Mongoose model name "ExecutionRequest", because AIRA already has the
 * canonical models/ExecutionRequest model.
 *
 * Both legacy models therefore use unique internal model names while
 * preserving their existing Mongo collections.
 *
 * Manages:
 *
 * - AUTO
 * - APPROVAL
 * - SUGGEST_ONLY
 */

const executionModeConfigSchema =
  new mongoose.Schema({
    tenantId: {
      type:
        String,

      required:
        true,

      index:
        true,

      unique:
        true,
    },

    defaultMode: {
      type:
        String,

      enum: [
        "AUTO",
        "APPROVAL",
        "SUGGEST_ONLY",
      ],

      default:
        "APPROVAL",
    },

    actionModes: [
      {
        action:
          String,

        mode: {
          type:
            String,

          enum: [
            "AUTO",
            "APPROVAL",
            "SUGGEST_ONLY",
          ],
        },

        requiresApprover:
          Boolean,

        approverRoleOrUser:
          String,
      },
    ],

    severityModes: [
      {
        severity: {
          type:
            String,

          enum: [
            "low",
            "medium",
            "high",
            "critical",
          ],
        },

        mode: {
          type:
            String,

          enum: [
            "AUTO",
            "APPROVAL",
            "SUGGEST_ONLY",
          ],
        },
      },
    ],

    approvalWorkflow: {
      requiresApproval:
        Boolean,

      maxApprovalTimeMinutes:
        Number,

      escalateAfterMinutes:
        Number,

      escalationChannel:
        String,
    },

    createdAt: {
      type:
        Date,

      default:
        Date.now,
    },

    updatedAt: {
      type:
        Date,

      default:
        Date.now,
    },
  });


const executionRequestSchema =
  new mongoose.Schema({
    tenantId: {
      type:
        String,

      required:
        true,

      index:
        true,
    },

    decisionTraceId: {
      type:
        String,

      required:
        true,

      index:
        true,
    },

    action: {
      type:
        String,

      required:
        true,
    },

    severity: {
      type:
        String,

      enum: [
        "low",
        "medium",
        "high",
        "critical",
      ],
    },

    executionMode: {
      type:
        String,

      enum: [
        "AUTO",
        "APPROVAL",
        "SUGGEST_ONLY",
      ],

      required:
        true,
    },

    decision: {
      confidence:
        Number,

      reasoning:
        String,

      estimatedImpact:
        String,
    },

    approval: {
      status: {
        type:
          String,

        enum: [
          "pending",
          "approved",
          "rejected",
          "expired",
        ],

        default:
          "pending",
      },

      requestedAt:
        Date,

      requiredApprovals:
        Number,

      currentApprovals:
        Number,

      approvers: [
        {
          userId:
            String,

          userName:
            String,

          status: {
            type:
              String,

            enum: [
              "pending",
              "approved",
              "rejected",
            ],
          },

          respondedAt:
            Date,

          reason:
            String,
        },
      ],

      expiresAt:
        Date,
    },

    execution: {
      status: {
        type:
          String,

        enum: [
          "pending",
          "executing",
          "completed",
          "failed",
          "skipped",
        ],
      },

      startedAt:
        Date,

      completedAt:
        Date,

      duration:
        Number,

      result:
        mongoose.Schema.Types.Mixed,

      error:
        String,
    },

    createdAt: {
      type:
        Date,

      default:
        Date.now,

      index:
        true,
    },

    updatedAt: {
      type:
        Date,

      default:
        Date.now,
    },
  });


/**
 * Return an already compiled Mongoose model when available.
 *
 * Jest/server reloads can cause the same service module graph to be
 * evaluated after another module has already registered a model.
 *
 * Using mongoose.models prevents OverwriteModelError.
 */
function getOrCreateModel(
  name,
  schema,
  collection
) {
  return (
    mongoose.models[
      name
    ] ||
    mongoose.model(
      name,
      schema,
      collection
    )
  );
}


class ExecutionModesService {
  constructor() {
    /*
     * Do NOT use model name "ExecutionRequest".
     *
     * That global Mongoose model name belongs to:
     *
     *   models/ExecutionRequest.js
     *
     * This legacy execution-mode subsystem has a different schema.
     */
    this.ExecutionModeConfig =
      getOrCreateModel(
        "LegacyExecutionModeConfig",
        executionModeConfigSchema,
        "execution_mode_configs"
      );

    this.ExecutionRequest =
      getOrCreateModel(
        "LegacyExecutionModeRequest",
        executionRequestSchema,
        "execution_requests"
      );
  }

  /**
   * Set default execution mode for tenant.
   */
  async setDefaultMode(
    tenantId,
    mode
  ) {
    try {
      let config =
        await this
          .ExecutionModeConfig
          .findOne({
            tenantId,
          });

      if (
        !config
      ) {
        config =
          new this
            .ExecutionModeConfig({
              tenantId,
            });
      }

      config.defaultMode =
        mode;

      config.updatedAt =
        new Date();

      await config.save();

      return {
        success:
          true,

        mode,
      };
    } catch (
      error
    ) {
      throw new Error(
        `Failed to set default mode: ${error.message}`
      );
    }
  }

  /**
   * Set execution mode for a specific action.
   */
  async setActionMode(
    tenantId,
    action,
    mode
  ) {
    try {
      let config =
        await this
          .ExecutionModeConfig
          .findOne({
            tenantId,
          });

      if (
        !config
      ) {
        config =
          new this
            .ExecutionModeConfig({
              tenantId,
            });
      }

      const existingMode =
        config
          .actionModes
          .find(
            (
              entry
            ) =>
              entry.action ===
              action
          );

      if (
        existingMode
      ) {
        existingMode.mode =
          mode;
      } else {
        config.actionModes
          .push({
            action,
            mode,
          });
      }

      config.updatedAt =
        new Date();

      await config.save();

      return {
        success:
          true,

        action,

        mode,
      };
    } catch (
      error
    ) {
      throw new Error(
        `Failed to set action mode: ${error.message}`
      );
    }
  }

  /**
   * Determine execution mode for a decision.
   */
  async determineExecutionMode(
    tenantId,
    action,
    severity
  ) {
    try {
      const config =
        await this
          .ExecutionModeConfig
          .findOne({
            tenantId,
          });

      if (
        !config
      ) {
        return "APPROVAL";
      }

      const actionMode =
        config
          .actionModes
          .find(
            (
              entry
            ) =>
              entry.action ===
              action
          );

      if (
        actionMode
      ) {
        return actionMode.mode;
      }

      const severityMode =
        config
          .severityModes
          .find(
            (
              entry
            ) =>
              entry.severity ===
              severity
          );

      if (
        severityMode
      ) {
        return severityMode.mode;
      }

      return config.defaultMode;
    } catch (
      error
    ) {
      throw new Error(
        `Failed to determine execution mode: ${error.message}`
      );
    }
  }

  /**
   * Create execution request.
   */
  async createExecutionRequest(
    tenantId,
    requestData
  ) {
    try {
      const executionMode =
        await this
          .determineExecutionMode(
            tenantId,
            requestData.action,
            requestData.severity
          );

      const request =
        new this
          .ExecutionRequest({
            tenantId,

            decisionTraceId:
              requestData
                .decisionTraceId,

            action:
              requestData.action,

            severity:
              requestData.severity,

            executionMode,

            decision:
              requestData.decision,
          });

      if (
        executionMode ===
        "APPROVAL"
      ) {
        request.approval.status =
          "pending";

        request.approval.requestedAt =
          new Date();

        request.approval.requiredApprovals =
          requestData
            .requiredApprovals ||
          1;

        request.approval.currentApprovals =
          0;

        request.approval.expiresAt =
          new Date(
            Date.now() +
            (
              requestData
                .approvalTimeoutMinutes ||
              30
            ) *
              60000
          );
      }

      if (
        executionMode ===
        "AUTO"
      ) {
        request.execution.status =
          "pending";
      }

      if (
        executionMode ===
        "SUGGEST_ONLY"
      ) {
        request.execution.status =
          "skipped";
      }

      await request.save();

      return request;
    } catch (
      error
    ) {
      throw new Error(
        `Failed to create execution request: ${error.message}`
      );
    }
  }

  /**
   * Approve execution request.
   */
  async approveRequest(
    tenantId,
    decisionTraceId,
    approverId,
    approverName
  ) {
    try {
      const request =
        await this
          .ExecutionRequest
          .findOne({
            tenantId,
            decisionTraceId,
          });

      if (
        !request
      ) {
        throw new Error(
          "Request not found"
        );
      }

      const approver =
        request
          .approval
          .approvers
          .find(
            (
              entry
            ) =>
              entry.userId ===
              approverId
          );

      if (
        approver
      ) {
        approver.status =
          "approved";

        approver.respondedAt =
          new Date();
      } else {
        request
          .approval
          .approvers
          .push({
            userId:
              approverId,

            userName:
              approverName,

            status:
              "approved",

            respondedAt:
              new Date(),
          });
      }

      request.approval.currentApprovals =
        request
          .approval
          .approvers
          .filter(
            (
              entry
            ) =>
              entry.status ===
              "approved"
          )
          .length;

      if (
        request.approval
          .currentApprovals >=
        request.approval
          .requiredApprovals
      ) {
        request.approval.status =
          "approved";

        request.execution.status =
          "pending";
      }

      request.updatedAt =
        new Date();

      await request.save();

      return request;
    } catch (
      error
    ) {
      throw new Error(
        `Failed to approve request: ${error.message}`
      );
    }
  }

  /**
   * Reject execution request.
   */
  async rejectRequest(
    tenantId,
    decisionTraceId,
    rejecterId,
    reason
  ) {
    try {
      const request =
        await this
          .ExecutionRequest
          .findOne({
            tenantId,
            decisionTraceId,
          });

      if (
        !request
      ) {
        throw new Error(
          "Request not found"
        );
      }

      request.approval.status =
        "rejected";

      request.approval.approvers
        .push({
          userId:
            rejecterId,

          status:
            "rejected",

          respondedAt:
            new Date(),

          reason:
            reason ||
            "No reason provided",
        });

      request.execution.status =
        "skipped";

      request.updatedAt =
        new Date();

      await request.save();

      return request;
    } catch (
      error
    ) {
      throw new Error(
        `Failed to reject request: ${error.message}`
      );
    }
  }

  /**
   * Mark execution as started.
   */
  async markExecutionStarted(
    tenantId,
    decisionTraceId
  ) {
    try {
      const request =
        await this
          .ExecutionRequest
          .findOne({
            tenantId,
            decisionTraceId,
          });

      if (
        !request
      ) {
        throw new Error(
          "Request not found"
        );
      }

      request.execution.status =
        "executing";

      request.execution.startedAt =
        new Date();

      request.updatedAt =
        new Date();

      await request.save();

      return request;
    } catch (
      error
    ) {
      throw new Error(
        `Failed to mark execution started: ${error.message}`
      );
    }
  }

  /**
   * Mark execution as completed.
   */
  async markExecutionCompleted(
    tenantId,
    decisionTraceId,
    result
  ) {
    try {
      const request =
        await this
          .ExecutionRequest
          .findOne({
            tenantId,
            decisionTraceId,
          });

      if (
        !request
      ) {
        throw new Error(
          "Request not found"
        );
      }

      request.execution.status =
        "completed";

      request.execution.completedAt =
        new Date();

      request.execution.duration =
        request.execution.startedAt
          ? (
              request.execution
                .completedAt -
              request.execution
                .startedAt
            )
          : null;

      request.execution.result =
        result;

      request.updatedAt =
        new Date();

      await request.save();

      return request;
    } catch (
      error
    ) {
      throw new Error(
        `Failed to mark execution completed: ${error.message}`
      );
    }
  }

  /**
   * Mark execution as failed.
   */
  async markExecutionFailed(
    tenantId,
    decisionTraceId,
    executionError
  ) {
    try {
      const request =
        await this
          .ExecutionRequest
          .findOne({
            tenantId,
            decisionTraceId,
          });

      if (
        !request
      ) {
        throw new Error(
          "Request not found"
        );
      }

      request.execution.status =
        "failed";

      request.execution.completedAt =
        new Date();

      request.execution.error =
        executionError;

      request.updatedAt =
        new Date();

      await request.save();

      return request;
    } catch (
      error
    ) {
      throw new Error(
        `Failed to mark execution failed: ${error.message}`
      );
    }
  }

  /**
   * Get pending approvals.
   */
  async getPendingApprovals(
    tenantId,
    limit = 50
  ) {
    try {
      const boundedLimit =
        Math.min(
          200,
          Math.max(
            1,
            Number(
              limit ||
              50
            )
          )
        );

      return this
        .ExecutionRequest
        .find({
          tenantId,

          "approval.status":
            "pending",
        })
        .sort({
          "approval.expiresAt":
            1,
        })
        .limit(
          boundedLimit
        );
    } catch (
      error
    ) {
      throw new Error(
        `Failed to get pending approvals: ${error.message}`
      );
    }
  }

  /**
   * Get execution statistics.
   */
  async getExecutionStats(
    tenantId
  ) {
    try {
      const stats =
        await this
          .ExecutionRequest
          .aggregate([
            {
              $match: {
                tenantId,
              },
            },

            {
              $facet: {
                byMode: [
                  {
                    $group: {
                      _id:
                        "$executionMode",

                      count: {
                        $sum:
                          1,
                      },
                    },
                  },
                ],

                byStatus: [
                  {
                    $group: {
                      _id:
                        "$execution.status",

                      count: {
                        $sum:
                          1,
                      },
                    },
                  },
                ],

                avgApprovalTime: [
                  {
                    $match: {
                      "approval.approvers.respondedAt": {
                        $exists:
                          true,
                      },
                    },
                  },

                  {
                    $unwind:
                      "$approval.approvers",
                  },

                  {
                    $match: {
                      "approval.approvers.respondedAt": {
                        $exists:
                          true,
                      },
                    },
                  },

                  {
                    $project: {
                      approvalTime: {
                        $subtract: [
                          "$approval.approvers.respondedAt",
                          "$approval.requestedAt",
                        ],
                      },
                    },
                  },

                  {
                    $group: {
                      _id:
                        null,

                      avgTime: {
                        $avg:
                          "$approvalTime",
                      },
                    },
                  },
                ],
              },
            },
          ]);

      return (
        stats[0] ||
        {
          byMode:
            [],

          byStatus:
            [],

          avgApprovalTime:
            [],
        }
      );
    } catch (
      error
    ) {
      throw new Error(
        `Failed to get execution stats: ${error.message}`
      );
    }
  }
}

module.exports =
  new ExecutionModesService();

module.exports
  .ExecutionModesService =
  ExecutionModesService;