/**
 * Approval Service
 * 
 * Orchestrates the approval workflow:
 * 1. Decision engine creates decision with confidence score
 * 2. If confidence is in escalation range (0.6-0.85), request human approval
 * 3. Human approves or rejects via API
 * 4. If approved, action is executed
 * 5. Full audit trail is maintained
 */

const { getApprovalQueue } = require('./approvalQueue');
const { decisionTraceService } = require('../core');
const { loggingService } = require('../infrastructure');

class ApprovalService {
  constructor() {
    this.queue = getApprovalQueue();
    this.escalationThreshold = parseFloat(process.env.ESCALATION_THRESHOLD || '0.60');
    this.autoExecuteThreshold = parseFloat(process.env.AUTO_EXECUTE_THRESHOLD || '0.85');
  }

  /**
   * Determine if a decision requires approval based on confidence
   * 
   * @param {number} confidence - Confidence score (0-1)
   * @returns {object} - { requiresApproval, reason, tier }
   */
  requiresApproval(confidence) {
    if (confidence >= this.autoExecuteThreshold) {
      return {
        requiresApproval: false,
        reason: 'High confidence - auto-execution allowed',
        tier: 'AUTO_EXECUTE',
      };
    }

    if (confidence >= this.escalationThreshold) {
      return {
        requiresApproval: true,
        reason: 'Medium confidence - human approval required',
        tier: 'ESCALATE',
      };
    }

    return {
      requiresApproval: true,
      reason: 'Low confidence - blocked, approval required to proceed',
      tier: 'OBSERVE',
    };
  }

  /**
   * Create an approval request for a decision
   * 
   * @param {object} decision - Decision details
   * @param {object} context - Request context
   * @returns {Promise<object>} - Created approval request
   */
  async createApprovalRequest(decision, context = {}) {
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
    } = decision;

    // Validate required fields
    if (!tenantId || !decisionId || !action || !resource) {
      throw new Error(
        'Missing required decision fields: tenantId, decisionId, action, resource'
      );
    }

    try {
      // Check if approval is actually needed
      const approvalCheck = this.requiresApproval(confidence);
      if (!approvalCheck.requiresApproval) {
        throw new Error(
          `Approval not needed for confidence ${confidence}. Use auto-execution instead.`
        );
      }

      // Create approval request via queue
      const approvalRequest = await this.queue.addApprovalRequest(
        {
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
        },
        context
      );

      console.log('[ApprovalService] ✓ Approval request created', {
        approvalId: approvalRequest.approvalId,
        decisionId,
        action,
        confidence,
      });

      if (loggingService) {
        loggingService.logDecision(decisionId, 'Approval request created', {
          approvalId: approvalRequest.approvalId,
          action,
          confidence,
          tenantId,
        });
      }

      return approvalRequest;
    } catch (error) {
      console.error('[ApprovalService] Error creating approval request:', error.message);
      throw error;
    }
  }

  /**
   * Get pending approvals for a tenant
   * 
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<array>} - Pending approval requests
   */
  async getPendingApprovals(tenantId) {
    try {
      const pending = await this.queue.getPendingApprovals(tenantId);

      console.log('[ApprovalService] Found pending approvals', {
        tenantId,
        count: pending.length,
      });

      return pending;
    } catch (error) {
      console.error('[ApprovalService] Error getting pending approvals:', error.message);
      throw error;
    }
  }

  /**
   * Get approval request status
   * 
   * @param {string} approvalId - Approval request ID
   * @returns {Promise<object>} - Approval request with status
   */
  async getApprovalStatus(approvalId) {
    try {
      const request = await this.queue.getApprovalRequest(approvalId);

      if (!request) {
        throw new Error(`Approval request not found: ${approvalId}`);
      }

      return {
        approvalId: request.approvalId,
        status: request.status,
        action: request.action,
        reason: request.reason,
        confidence: request.confidence,
        resource: request.resource,
        createdAt: request.createdAt,
        expiresAt: request.expiresAt,
        approvedBy: request.approvedBy,
        rejectedBy: request.rejectedBy,
        rejectionReason: request.rejectionReason,
      };
    } catch (error) {
      console.error('[ApprovalService] Error getting approval status:', error.message);
      throw error;
    }
  }

  /**
   * Approve a pending approval request
   * 
   * @param {string} approvalId - Approval request ID
   * @param {string} approvedBy - User/service approving
   * @param {object} context - Request context
   * @returns {Promise<object>} - Approved request and execution result
   */
  async approveAndExecute(approvalId, approvedBy, context = {}) {
    try {
      // Get the approval request
      let request = await this.queue.getApprovalRequest(approvalId);

      if (!request) {
        throw new Error(`Approval request not found: ${approvalId}`);
      }

      // Check if already processed
      if (request.status !== 'pending') {
        throw new Error(
          `Cannot approve request with status: ${request.status}`
        );
      }

      // Check if expired
      const now = Date.now();
      const expiresAt = new Date(request.expiresAt).getTime();
      if (now > expiresAt) {
        throw new Error('Approval request has expired');
      }

      // Approve the request
      await this.queue.approveRequest(approvalId, approvedBy, context);

      console.log('[ApprovalService] ✓ Request approved', {
        approvalId,
        approvedBy,
        action: request.action,
      });

      if (loggingService) {
        loggingService.logDecision(request.decisionId, 'Approval granted', {
          approvalId,
          approvedBy,
          action: request.action,
        });
      }

      return {
        approvalId,
        status: 'approved',
        message: 'Approval granted. Action is now approved for execution.',
        action: request.action,
        resource: request.resource,
        approvedBy,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[ApprovalService] Error approving request:', error.message);
      throw error;
    }
  }

  /**
   * Reject a pending approval request
   * 
   * @param {string} approvalId - Approval request ID
   * @param {string} rejectedBy - User/service rejecting
   * @param {string} reason - Reason for rejection
   * @param {object} context - Request context
   * @returns {Promise<object>} - Rejected request
   */
  async rejectRequest(approvalId, rejectedBy, reason = '', context = {}) {
    try {
      const request = await this.queue.getApprovalRequest(approvalId);

      if (!request) {
        throw new Error(`Approval request not found: ${approvalId}`);
      }

      // Check if already processed
      if (request.status !== 'pending') {
        throw new Error(
          `Cannot reject request with status: ${request.status}`
        );
      }

      // Reject the request
      await this.queue.rejectRequest(
        approvalId,
        rejectedBy,
        reason,
        context
      );

      console.log('[ApprovalService] ✓ Request rejected', {
        approvalId,
        rejectedBy,
        reason,
        action: request.action,
      });

      if (loggingService) {
        loggingService.logDecision(request.decisionId, 'Approval denied', {
          approvalId,
          rejectedBy,
          reason,
          action: request.action,
        });
      }

      return {
        approvalId,
        status: 'rejected',
        message: 'Approval request has been rejected.',
        action: request.action,
        rejectedBy,
        reason,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[ApprovalService] Error rejecting request:', error.message);
      throw error;
    }
  }

  /**
   * Handle decision that may or may not need approval
   * This is the main entry point from the decision engine
   * 
   * @param {object} decision - Decision with confidence score
   * @param {object} context - Request context
   * @returns {Promise<object>} - { requiresApproval, approvalRequest/autoExecuted }
   */
  async handleDecision(decision, context = {}) {
    const { confidence, tenantId, decisionId } = decision;

    // Check if approval is needed
    const approvalCheck = this.requiresApproval(confidence);

    if (!approvalCheck.requiresApproval) {
      // Auto-execute
      console.log('[ApprovalService] Auto-executing decision', {
        decisionId,
        confidence,
        tier: approvalCheck.tier,
      });

      return {
        requiresApproval: false,
        autoExecuted: true,
        tier: approvalCheck.tier,
        message: approvalCheck.reason,
      };
    } else {
      // Requires approval
      console.log('[ApprovalService] Creating approval request', {
        decisionId,
        confidence,
        tier: approvalCheck.tier,
      });

      const approvalRequest = await this.createApprovalRequest(decision, context);

      return {
        requiresApproval: true,
        autoExecuted: false,
        approvalRequest,
        tier: approvalCheck.tier,
        message: approvalCheck.reason,
      };
    }
  }

  /**
   * Get approval queue statistics
   * 
   * @param {string} tenantId - Tenant ID (optional)
   * @returns {Promise<object>} - Queue statistics
   */
  async getQueueStats(tenantId = null) {
    return await this.queue.getStats(tenantId);
  }

  /**
   * Cleanup expired approval requests
   * (Should be called periodically)
   * 
   * @returns {Promise<number>} - Number of cleaned up requests
   */
  async cleanupExpired() {
    return await this.queue.cleanupExpired();
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create ApprovalService singleton
 * 
 * @returns {ApprovalService} - Approval service instance
 */
function getApprovalService() {
  if (!instance) {
    instance = new ApprovalService();
  }
  return instance;
}

module.exports = {
  ApprovalService,
  getApprovalService,
};
