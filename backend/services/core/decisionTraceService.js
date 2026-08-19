"use strict";

const {
  decisionTraceRepository,

  persistenceIdentifierPolicy,
} =
  require(
    "../../persistence/repositories"
  );

/**
 * Decision Trace Service
 *
 * Phase 13 — Enterprise Data Architecture
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
 * Every operational read/write is scoped by:
 *
 * tenantId
 * organizationId
 * environmentId
 *
 * Persistence is accessed exclusively through repository abstractions.
 *
 * SAFETY:
 *
 * - decisionId alone is never sufficient for scoped operations
 * - ownership fields cannot be overridden by caller search filters
 * - persistence-specific identifier validation is abstracted
 * - no infrastructure execution authority is granted here
 */

class DecisionTraceService {
  // ==========================================================================
  // CONTEXT HELPERS
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
    };
  }

  _assertContext(
    context,
    {
      requireIncident =
        false,
    } = {}
  ) {
    const normalized =
      this._normalizeContext(
        context
      );

    if (
      !normalized.tenantId
    ) {
      const error =
        new Error(
          "tenantId is required for decision trace operations"
        );

      error.status =
        400;

      error.code =
        "DECISION_TRACE_TENANT_REQUIRED";

      throw error;
    }

    if (
      !normalized.organizationId
    ) {
      const error =
        new Error(
          "organizationId is required for decision trace operations"
        );

      error.status =
        400;

      error.code =
        "DECISION_TRACE_ORGANIZATION_REQUIRED";

      throw error;
    }

    if (
      !normalized.environmentId
    ) {
      const error =
        new Error(
          "environmentId is required for decision trace operations"
        );

      error.status =
        400;

      error.code =
        "DECISION_TRACE_ENVIRONMENT_REQUIRED";

      throw error;
    }

    if (
      requireIncident &&
      !normalized.incidentId
    ) {
      const error =
        new Error(
          "incidentId is required for this decision trace operation"
        );

      error.status =
        400;

      error.code =
        "DECISION_TRACE_INCIDENT_REQUIRED";

      throw error;
    }

    if (
      !persistenceIdentifierPolicy
        .isValidOrganizationId(
          normalized.organizationId
        )
    ) {
      const error =
        new Error(
          "Invalid organizationId"
        );

      error.status =
        400;

      error.code =
        "INVALID_ORGANIZATION_ID";

      throw error;
    }

    if (
      !persistenceIdentifierPolicy
        .isValidEnvironmentId(
          normalized.environmentId
        )
    ) {
      const error =
        new Error(
          "Invalid environmentId"
        );

      error.status =
        400;

      error.code =
        "INVALID_ENVIRONMENT_ID";

      throw error;
    }

    if (
      normalized.incidentId &&
      !persistenceIdentifierPolicy
        .isValidIncidentId(
          normalized.incidentId
        )
    ) {
      const error =
        new Error(
          "Invalid incidentId"
        );

      error.status =
        400;

      error.code =
        "INVALID_INCIDENT_ID";

      throw error;
    }

    return normalized;
  }

  _scopeFilter(
    context
  ) {
    const normalized =
      this._assertContext(
        context
      );

    return {
      tenantId:
        normalized.tenantId,

      organizationId:
        normalized.organizationId,

      environmentId:
        normalized.environmentId,
    };
  }

  _notFound(
    decisionId
  ) {
    const error =
      new Error(
        `Decision trace not found: ${decisionId}`
      );

    error.status =
      404;

    error.code =
      "DECISION_TRACE_NOT_FOUND";

    return error;
  }

  // ==========================================================================
  // CREATE
  // ==========================================================================

  /**
   * Create a new decision trace.
   *
   * traceData must contain:
   *
   * tenantId
   * organizationId
   * environmentId
   *
   * incidentId is optional for non-incident decisions,
   * but should be supplied whenever this trace originates
   * from an incident.
   */
  async createTrace(
    traceData
  ) {
    try {
      const context =
        this._assertContext({
          tenantId:
            traceData.tenantId,

          organizationId:
            traceData.organizationId,

          environmentId:
            traceData.environmentId,

          incidentId:
            traceData.incidentId,
        });

      if (
        !traceData.decisionId
      ) {
        const error =
          new Error(
            "decisionId is required"
          );

        error.status =
          400;

        error.code =
          "DECISION_ID_REQUIRED";

        throw error;
      }

      const trace =
        await decisionTraceRepository
          .create({
            decisionId:
              traceData.decisionId,

            tenantId:
              context.tenantId,

            organizationId:
              context.organizationId,

            environmentId:
              context.environmentId,

            incidentId:
              context.incidentId,

            correlationId:
              traceData.correlationId,

            inputs:
              traceData.inputs,

            reasoning:
              traceData.reasoning,

            rulesTriggered:
              traceData.rulesTriggered,

            alternatives:
              traceData.alternatives,

            decision:
              traceData.decision,

            recommendedAction:
              traceData.recommendedAction,

            tier:
              traceData.tier,

            actionRisk:
              traceData.actionRisk,

            auditTrail: [
              {
                stage:
                  "decision_made",

                timestamp:
                  new Date(),

                status:
                  "SUCCESS",
              },
            ],
          });

      console.log(
        `[decision-trace] Created trace: ${traceData.decisionId}`,
        {
          organizationId:
            String(
              context.organizationId
            ),

          environmentId:
            String(
              context.environmentId
            ),

          incidentId:
            context.incidentId
              ? String(
                  context.incidentId
                )
              : null,
        }
      );

      return trace;
    } catch (
      error
    ) {
      console.error(
        "[decision-trace] Error creating trace:",
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // POLICY
  // ==========================================================================

  /**
   * Update policy result.
   *
   * decisionId alone is NEVER sufficient.
   */
  async updatePolicyCheck(
    decisionId,
    policyCheckData,
    context
  ) {
    try {
      const scope =
        this._scopeFilter(
          context
        );

      const trace =
        await decisionTraceRepository
          .updateOne(
            {
              decisionId,

              ...scope,
            },
            {
              $set: {
                "policyCheck.policyVersionId":
                  policyCheckData
                    .policyVersionId,

                "policyCheck.policyVersion":
                  policyCheckData
                    .policyVersion,

                "policyCheck.policySnapshot":
                  policyCheckData
                    .policySnapshot,

                "policyCheck.timestamp":
                  new Date(),

                "policyCheck.verdict":
                  policyCheckData
                    .verdict,

                "policyCheck.checks":
                  policyCheckData
                    .checks,

                "policyCheck.reason":
                  policyCheckData
                    .reason,

                updatedAt:
                  new Date(),
              },

              $push: {
                auditTrail: {
                  stage:
                    "policy_checked",

                  timestamp:
                    new Date(),

                  status:
                    policyCheckData
                      .verdict,
                },
              },
            }
          );

      if (!trace) {
        throw this._notFound(
          decisionId
        );
      }

      console.log(
        `[decision-trace] Updated policy check (version=${policyCheckData.policyVersionId}): ${decisionId}`
      );

      return trace;
    } catch (
      error
    ) {
      console.error(
        "[decision-trace] Error updating policy check:",
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // ACTION RESULT
  // ==========================================================================

  async updateActionResult(
    decisionId,
    actionResultData,
    context
  ) {
    try {
      const scope =
        this._scopeFilter(
          context
        );

      const trace =
        await decisionTraceRepository
          .updateOne(
            {
              decisionId,

              ...scope,
            },
            {
              $set: {
                "actionResult.actionId":
                  actionResultData
                    .actionId,

                "actionResult.status":
                  actionResultData
                    .status,

                "actionResult.durationMs":
                  actionResultData
                    .durationMs,

                "actionResult.dryRunPerformed":
                  actionResultData
                    .dryRunPerformed,

                "actionResult.dryRunResult":
                  actionResultData
                    .dryRunResult,

                "actionResult.outcome":
                  actionResultData
                    .outcome,

                "actionResult.error":
                  actionResultData
                    .error,

                "actionResult.timestamp":
                  new Date(),

                updatedAt:
                  new Date(),
              },

              $push: {
                auditTrail: {
                  stage:
                    "action_executed",

                  timestamp:
                    new Date(),

                  status:
                    actionResultData
                      .status,
                },
              },
            }
          );

      if (!trace) {
        throw this._notFound(
          decisionId
        );
      }

      console.log(
        `[decision-trace] Updated action result: ${decisionId}`
      );

      return trace;
    } catch (
      error
    ) {
      console.error(
        "[decision-trace] Error updating action result:",
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // MEMORY UPDATE
  // ==========================================================================

  async updateMemoryUpdate(
    decisionId,
    memoryUpdateData,
    context
  ) {
    try {
      const scope =
        this._scopeFilter(
          context
        );

      const trace =
        await decisionTraceRepository
          .updateOne(
            {
              decisionId,

              ...scope,
            },
            {
              $set: {
                "memoryUpdate.patternId":
                  memoryUpdateData
                    .patternId,

                "memoryUpdate.pattern":
                  memoryUpdateData
                    .pattern,

                "memoryUpdate.actionRecorded":
                  memoryUpdateData
                    .actionRecorded,

                "memoryUpdate.successRecorded":
                  memoryUpdateData
                    .successRecorded,

                "memoryUpdate.recoveryTime":
                  memoryUpdateData
                    .recoveryTime,

                "memoryUpdate.timestamp":
                  new Date(),

                updatedAt:
                  new Date(),
              },

              $push: {
                auditTrail: {
                  stage:
                    "memory_updated",

                  timestamp:
                    new Date(),

                  status:
                    "SUCCESS",
                },
              },
            }
          );

      if (!trace) {
        throw this._notFound(
          decisionId
        );
      }

      console.log(
        `[decision-trace] Updated memory: ${decisionId}`
      );

      return trace;
    } catch (
      error
    ) {
      console.error(
        "[decision-trace] Error updating memory:",
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // GET ONE
  // ==========================================================================

  async getTrace(
    decisionId,
    context
  ) {
    try {
      const trace =
        await decisionTraceRepository
          .findOne({
            decisionId,

            ...this._scopeFilter(
              context
            ),
          });

      if (!trace) {
        throw this._notFound(
          decisionId
        );
      }

      return trace;
    } catch (
      error
    ) {
      console.error(
        "[decision-trace] Error retrieving trace:",
        error.message
      );

      throw error;
    }
  }

  /**
   * Compatibility alias.
   */
  async getDecisionTrace(
    context,
    decisionId
  ) {
    return this.getTrace(
      decisionId,
      context
    );
  }

  // ==========================================================================
  // RECENT
  // ==========================================================================

  async getRecentTraces(
    context,
    limit = 50,
    filter = {}
  ) {
    try {
      const safeLimit =
        Math.min(
          Math.max(
            Number.parseInt(
              limit,
              10
            ) ||
            50,
            1
          ),
          200
        );

      const query = {
        ...this._scopeFilter(
          context
        ),

        ...filter,
      };

      /**
       * Ownership fields may never be overridden by filter.
       */
      const scope =
        this._scopeFilter(
          context
        );

      query.tenantId =
        scope.tenantId;

      query.organizationId =
        scope.organizationId;

      query.environmentId =
        scope.environmentId;

      return decisionTraceRepository
        .list(
          query,
          {
            sort: {
              createdAt:
                -1,
            },

            limit:
              safeLimit,
          }
        );
    } catch (
      error
    ) {
      console.error(
        "[decision-trace] Error retrieving recent traces:",
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // SUMMARY
  // ==========================================================================

  async getDecisionSummary(
    context,
    timeWindowMs =
      86400000
  ) {
    try {
      const since =
        new Date(
          Date.now() -
          timeWindowMs
        );

      const summary = {
        totalDecisions:
          0,

        byDecisionType:
          {},

        byActionType:
          {},

        successRate:
          0,

        avgConfidence:
          0,

        policyApprovalRate:
          0,
      };

      const traces =
        await decisionTraceRepository
          .list(
            {
              ...this._scopeFilter(
                context
              ),

              createdAt: {
                $gte:
                  since,
              },
            },
            {
              sort: {
                createdAt:
                  -1,
              },

              limit:
                200,
            }
          );

      if (
        traces.length ===
        0
      ) {
        return summary;
      }

      summary.totalDecisions =
        traces.length;

      let totalConfidence =
        0;

      let confidenceCount =
        0;

      let approvedCount =
        0;

      let successCount =
        0;

      for (
        const trace
        of traces
      ) {
        if (
          trace.decision
        ) {
          summary
            .byDecisionType[
              trace.decision
            ] =
            (
              summary
                .byDecisionType[
                  trace.decision
                ] ||
              0
            ) +
            1;
        }

        if (
          trace.recommendedAction
        ) {
          summary
            .byActionType[
              trace
                .recommendedAction
            ] =
            (
              summary
                .byActionType[
                  trace
                    .recommendedAction
                ] ||
              0
            ) +
            1;
        }

        if (
          typeof trace.inputs
            ?.confidence ===
          "number"
        ) {
          totalConfidence +=
            trace.inputs
              .confidence;

          confidenceCount +=
            1;
        }

        if (
          trace.policyCheck
            ?.verdict ===
          "APPROVED"
        ) {
          approvedCount +=
            1;
        }

        if (
          trace.actionResult
            ?.status ===
          "SUCCESS"
        ) {
          successCount +=
            1;
        }
      }

      summary.avgConfidence =
        confidenceCount > 0
          ? totalConfidence /
            confidenceCount
          : 0;

      summary.policyApprovalRate =
        approvedCount /
        traces.length;

      summary.successRate =
        successCount /
        traces.length;

      return summary;
    } catch (
      error
    ) {
      console.error(
        "[decision-trace] Error computing summary:",
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // SEARCH
  // ==========================================================================

  async searchTraces(
    context,
    query = {}
  ) {
    try {
      const filter = {
        ...this._scopeFilter(
          context
        ),
      };

      if (
        query.decision
      ) {
        filter.decision =
          query.decision;
      }

      if (
        query.action
      ) {
        filter.recommendedAction =
          query.action;
      }

      if (
        query.policyVerdict
      ) {
        filter[
          "policyCheck.verdict"
        ] =
          query.policyVerdict;
      }

      if (
        query.actionStatus
      ) {
        filter[
          "actionResult.status"
        ] =
          query.actionStatus;
      }

      if (
        query.incidentId
      ) {
        if (
          !persistenceIdentifierPolicy
            .isValidIncidentId(
              query.incidentId
            )
        ) {
          const error =
            new Error(
              "Invalid incidentId"
            );

          error.status =
            400;

          error.code =
            "INVALID_INCIDENT_ID";

          throw error;
        }

        filter.incidentId =
          query.incidentId;
      }

      if (
        query.startTime ||
        query.endTime
      ) {
        filter.createdAt =
          {};

        if (
          query.startTime
        ) {
          filter
            .createdAt
            .$gte =
            new Date(
              query.startTime
            );
        }

        if (
          query.endTime
        ) {
          filter
            .createdAt
            .$lte =
            new Date(
              query.endTime
            );
        }
      }

      const safeLimit =
        Math.min(
          Math.max(
            Number.parseInt(
              query.limit,
              10
            ) ||
            50,
            1
          ),
          200
        );

      return decisionTraceRepository
        .list(
          filter,
          {
            sort: {
              createdAt:
                -1,
            },

            limit:
              safeLimit,
          }
        );
    } catch (
      error
    ) {
      console.error(
        "[decision-trace] Error searching traces:",
        error.message
      );

      throw error;
    }
  }
}

module.exports =
  new DecisionTraceService();

module.exports
  .DecisionTraceService =
  DecisionTraceService;