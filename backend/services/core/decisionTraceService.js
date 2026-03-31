const DecisionTrace = require("../../models/DecisionTrace");

/**
 * Decision Trace Service
 * Manages creation and retrieval of decision traces
 * Central repository for decision explainability
 */

class DecisionTraceService {
  /**
   * Create a new decision trace
   */
  async createTrace(traceData) {
    try {
      const trace = new DecisionTrace({
        decisionId: traceData.decisionId,
        tenantId: traceData.tenantId,
        correlationId: traceData.correlationId,
        inputs: traceData.inputs,
        reasoning: traceData.reasoning,
        rulesTriggered: traceData.rulesTriggered,
        alternatives: traceData.alternatives,
        decision: traceData.decision,
        recommendedAction: traceData.recommendedAction,
        actionRisk: traceData.actionRisk,
        auditTrail: [
          {
            stage: "decision_made",
            timestamp: new Date(),
            status: "SUCCESS",
          },
        ],
      });

      await trace.save();
      console.log(`[decision-trace] Created trace: ${traceData.decisionId}`);
      return trace;
    } catch (error) {
      console.error("[decision-trace] Error creating trace:", error);
      throw error;
    }
  }

  /**
   * Update policy check result in trace
   * CRITICAL FIX: Now stores policyVersionId + policySnapshot for reproducibility
   */
  async updatePolicyCheck(decisionId, policyCheckData) {
    try {
      const trace = await DecisionTrace.findOneAndUpdate(
        { decisionId },
        {
          $set: {
            "policyCheck.policyVersionId": policyCheckData.policyVersionId,
            "policyCheck.policyVersion": policyCheckData.policyVersion,
            // CRITICAL: Store the exact policy that was used for this decision
            "policyCheck.policySnapshot": policyCheckData.policySnapshot,
            "policyCheck.timestamp": new Date(),
            "policyCheck.verdict": policyCheckData.verdict,
            "policyCheck.checks": policyCheckData.checks,
            "policyCheck.reason": policyCheckData.reason,
          },
          $push: {
            auditTrail: {
              stage: "policy_checked",
              timestamp: new Date(),
              status: policyCheckData.verdict,
            },
          },
        },
        { new: true }
      );

      console.log(`[decision-trace] Updated policy check (version=${policyCheckData.policyVersionId}): ${decisionId}`);
      return trace;
    } catch (error) {
      console.error("[decision-trace] Error updating policy check:", error);
      throw error;
    }
  }

  /**
   * Update action execution result in trace
   */
  async updateActionResult(decisionId, actionResultData) {
    try {
      const trace = await DecisionTrace.findOneAndUpdate(
        { decisionId },
        {
          $set: {
            "actionResult.actionId": actionResultData.actionId,
            "actionResult.status": actionResultData.status,
            "actionResult.durationMs": actionResultData.durationMs,
            "actionResult.dryRunPerformed": actionResultData.dryRunPerformed,
            "actionResult.dryRunResult": actionResultData.dryRunResult,
            "actionResult.outcome": actionResultData.outcome,
            "actionResult.error": actionResultData.error,
            "actionResult.timestamp": new Date(),
          },
          $push: {
            auditTrail: {
              stage: "action_executed",
              timestamp: new Date(),
              status: actionResultData.status,
            },
          },
        },
        { new: true }
      );

      console.log(`[decision-trace] Updated action result: ${decisionId}`);
      return trace;
    } catch (error) {
      console.error("[decision-trace] Error updating action result:", error);
      throw error;
    }
  }

  /**
   * Update memory learning result in trace
   */
  async updateMemoryUpdate(decisionId, memoryUpdateData) {
    try {
      const trace = await DecisionTrace.findOneAndUpdate(
        { decisionId },
        {
          $set: {
            "memoryUpdate.patternId": memoryUpdateData.patternId,
            "memoryUpdate.pattern": memoryUpdateData.pattern,
            "memoryUpdate.actionRecorded": memoryUpdateData.actionRecorded,
            "memoryUpdate.successRecorded": memoryUpdateData.successRecorded,
            "memoryUpdate.recoveryTime": memoryUpdateData.recoveryTime,
            "memoryUpdate.timestamp": new Date(),
          },
          $push: {
            auditTrail: {
              stage: "memory_updated",
              timestamp: new Date(),
              status: "SUCCESS",
            },
          },
        },
        { new: true }
      );

      console.log(`[decision-trace] Updated memory: ${decisionId}`);
      return trace;
    } catch (error) {
      console.error("[decision-trace] Error updating memory:", error);
      throw error;
    }
  }

  /**
   * Retrieve trace by ID
   */
  async getTrace(decisionId, tenantId) {
    try {
      const trace = await DecisionTrace.findOne({
        decisionId,
        tenantId,
      });

      if (!trace) {
        throw new Error(`Trace not found: ${decisionId}`);
      }

      return trace;
    } catch (error) {
      console.error("[decision-trace] Error retrieving trace:", error);
      throw error;
    }
  }

  /**
   * Get recent decision traces for tenant
   */
  async getRecentTraces(tenantId, limit = 50, filter = {}) {
    try {
      const query = { tenantId, ...filter };
      const traces = await DecisionTrace.find(query)
        .sort({ createdAt: -1 })
        .limit(limit);

      return traces;
    } catch (error) {
      console.error("[decision-trace] Error retrieving recent traces:", error);
      throw error;
    }
  }

  /**
   * Get decision summary (for statistics)
   */
  async getDecisionSummary(tenantId, timeWindowMs = 86400000) {
    try {
      const since = new Date(Date.now() - timeWindowMs);

      const summary = {
        totalDecisions: 0,
        byDecisionType: {},
        byActionType: {},
        successRate: 0,
        avgConfidence: 0,
        policyApprovalRate: 0,
      };

      const traces = await DecisionTrace.find({
        tenantId,
        createdAt: { $gte: since },
      });

      if (traces.length === 0) {
        return summary;
      }

      summary.totalDecisions = traces.length;

      let totalConfidence = 0;
      let approvedCount = 0;
      let successCount = 0;

      for (const trace of traces) {
        // Decision type
        summary.byDecisionType[trace.decision] =
          (summary.byDecisionType[trace.decision] || 0) + 1;

        // Action type
        summary.byActionType[trace.recommendedAction] =
          (summary.byActionType[trace.recommendedAction] || 0) + 1;

        // Confidence
        if (trace.inputs.confidence) {
          totalConfidence += trace.inputs.confidence;
        }

        // Policy approval
        if (trace.policyCheck?.verdict === "APPROVED") {
          approvedCount++;
        }

        // Action success
        if (trace.actionResult?.status === "SUCCESS") {
          successCount++;
        }
      }

      summary.avgConfidence = totalConfidence / traces.length;
      summary.policyApprovalRate = approvedCount / traces.length;
      summary.successRate = successCount / traces.length;

      return summary;
    } catch (error) {
      console.error("[decision-trace] Error computing summary:", error);
      throw error;
    }
  }

  /**
   * Search traces with advanced filtering
   */
  async searchTraces(tenantId, query = {}) {
    try {
      const filter = { tenantId };

      // Support filtering by decision outcome
      if (query.decision) filter.decision = query.decision;
      if (query.action) filter.recommendedAction = query.action;
      if (query.policyVerdict) filter["policyCheck.verdict"] = query.policyVerdict;
      if (query.actionStatus) filter["actionResult.status"] = query.actionStatus;

      // Time range
      if (query.startTime || query.endTime) {
        filter.createdAt = {};
        if (query.startTime) filter.createdAt.$gte = new Date(query.startTime);
        if (query.endTime) filter.createdAt.$lte = new Date(query.endTime);
      }

      const traces = await DecisionTrace.find(filter)
        .sort({ createdAt: -1 })
        .limit(query.limit || 50);

      return traces;
    } catch (error) {
      console.error("[decision-trace] Error searching traces:", error);
      throw error;
    }
  }
}

module.exports = new DecisionTraceService();
