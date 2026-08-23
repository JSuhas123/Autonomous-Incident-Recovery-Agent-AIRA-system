"use strict";

const {
  AuditEvent,
} =
  require(
    "../../persistence/operational/extendedModels"
  );

/**
 * Action Log Service
 * 
 * Provides backward compatibility after Phase 2 consolidation.
 * ActionLog.js model was consolidated into AuditEvent.
 * This service queries AuditEvent for action-related audit entries.
 */

class ActionLogService {
  /**
   * Get the latest action logs
   * @param {number} limit - Maximum number of logs to return (default: 50)
   * @param {string} tenantId - Tenant identifier (optional, defaults to "default")
   * @returns {Promise<Array>} Array of action-related audit events
   */
  static async getLatestActionLogs(limit = 50, tenantId = "default") {
    try {
      const actionLogs = await AuditEvent.find({
        tenantId,
        eventType: { $in: ["action_executed", "action_approved", "action_rejected"] },
      })
        .sort({ timestamp: -1 })
        .limit(parseInt(limit))
        .lean();

      return actionLogs;
    } catch (error) {
      console.error("Error fetching latest action logs:", error);
      throw error;
    }
  }

  /**
   * Get count of recent actions of a specific type
   * @param {string} actionType - Type of action (restart, scale, etc.)
   * @param {number} timeWindowMs - Time window in milliseconds (default: 90 seconds)
   * @param {string} tenantId - Tenant identifier
   * @returns {Promise<number>} Count of recent actions
   */
  static async getRecentActionCount(actionType, timeWindowMs = 90000, tenantId = "default") {
    try {
      const cutoffTime = new Date(Date.now() - timeWindowMs);
      
      const count = await AuditEvent.countDocuments({
        tenantId,
        eventType: "action_executed",
        "payload.actionType": actionType,
        timestamp: { $gte: cutoffTime },
      });

      return count;
    } catch (error) {
      console.error("Error counting recent actions:", error);
      return 0;
    }
  }

  /**
   * Create an action log entry
   * @param {object} actionLogData - Action log data
   * @returns {Promise<object>} Created action log
   */
  static async createActionLog(actionLogData) {
    try {
      const auditEvent = await AuditEvent.create({
        tenantId: actionLogData.tenantId || "default",
        eventType: "action_executed",
        eventId: actionLogData.actionId || `action-${Date.now()}`,
        payload: {
          action: actionLogData.action,
          executionStatus: actionLogData.executionStatus,
          outcome: actionLogData.outcome,
          durationMs: actionLogData.durationMs,
          severity: actionLogData.severity,
          correlationId: actionLogData.correlationId,
        },
        timestamp: actionLogData.executedAt || new Date(),
      });

      await auditEvent.save();
      return auditEvent;
    } catch (error) {
      console.error("Error creating action log:", error);
      throw error;
    }
  }
}

// Export both class and destructurable functions for backward compatibility
module.exports = ActionLogService;
module.exports.createActionLog = ActionLogService.createActionLog;
module.exports.getLatestActionLogs = ActionLogService.getLatestActionLogs;
module.exports.getRecentActionCount = ActionLogService.getRecentActionCount;
