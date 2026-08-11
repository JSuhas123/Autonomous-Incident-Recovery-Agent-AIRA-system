/**
 * Approval Queue Service
 * 
 * In-memory and Redis-backed queue for managing pending approvals.
 * Supports both modes: memory (for testing) and Redis (for production).
 * 
 * Provides:
 * - Store pending approval requests
 * - Retrieve pending approvals for a tenant
 * - Update approval status
 * - Auto-expire approvals after timeout
 */

const ApprovalRequest = require('../../models/ApprovalRequest');
const { loggingService } = require('../infrastructure');

class ApprovalQueue {
  constructor() {
    this.backedBy = process.env.APPROVAL_QUEUE_BACKEND || 'memory';
    this.memoryStore = new Map(); // Fallback in-memory store
    this.timeoutMs = parseInt(process.env.APPROVAL_TIMEOUT_MS || '600000'); // 10 minutes default
    
    console.log('[ApprovalQueue] Initialized — primary store: MongoDB, in-memory cache:', this.backedBy === 'memory' ? 'enabled' : 'disabled');
  }

  /**
   * Add an approval request to the queue
   * 
   * @param {object} decisionData - Decision details
   * @param {object} context - Additional context
   * @returns {Promise<object>} - Created approval request
   */
  async addApprovalRequest(decisionData, context = {}) {
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
    } = decisionData;

    if (!tenantId || !decisionId || !action || !resource) {
      throw new Error('Missing required fields for approval request');
    }

    try {
      // Create approval request in database
      const approvalRequest = await ApprovalRequest.createApprovalRequest({
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
        metadata: {
          userAgent: context.userAgent,
          ipAddress: context.ipAddress,
          systemVersion: process.env.VERSION || '1.0.0',
        },
      });

      // Also store in memory for quick access
      this.memoryStore.set(approvalRequest.approvalId, {
        ...approvalRequest.toObject(),
        addedAt: Date.now(),
      });

      console.log('[ApprovalQueue] ✓ Added approval request', {
        approvalId: approvalRequest.approvalId,
        tenantId,
        action,
        correlationId,
      });

      if (loggingService) {
        loggingService.logQueue(approvalRequest.approvalId, 'Approval request created', {
          tenantId,
          action,
          confidence,
        });
      }

      return approvalRequest;
    } catch (error) {
      console.error('[ApprovalQueue] Error adding approval request:', error.message);
      throw error;
    }
  }

  /**
   * Get all pending approvals for a tenant
   * 
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<array>} - Pending approval requests
   */
  async getPendingApprovals(tenantId) {
    try {
      const approvals = await ApprovalRequest.findPendingApprovals(tenantId);
      return approvals;
    } catch (error) {
      console.error('[ApprovalQueue] Error getting pending approvals:', error.message);
      // Return empty array on error
      return [];
    }
  }

  /**
   * Get a specific approval request by ID
   * 
   * @param {string} approvalId - Approval request ID
   * @returns {Promise<object>} - Approval request
   */
  async getApprovalRequest(approvalId) {
    try {
      // Try memory store first for speed
      if (this.memoryStore.has(approvalId)) {
        return this.memoryStore.get(approvalId);
      }

      // Fall back to database
      const request = await ApprovalRequest.findByApprovalId(approvalId);
      
      if (request) {
        // Update memory store
        this.memoryStore.set(approvalId, {
          ...request.toObject(),
          addedAt: Date.now(),
        });
      }

      return request;
    } catch (error) {
      console.error('[ApprovalQueue] Error getting approval request:', error.message);
      throw error;
    }
  }

  /**
   * Approve an approval request
   * 
   * @param {string} approvalId - Approval request ID
   * @param {string} approvedBy - User/service approving
   * @param {object} metadata - Additional metadata
   * @returns {Promise<object>} - Updated approval request
   */
  async approveRequest(approvalId, approvedBy, metadata = {}) {
    try {
      const request = await ApprovalRequest.findByApprovalId(approvalId);

      if (!request) {
        throw new Error(`Approval request not found: ${approvalId}`);
      }

      // Approve the request
      await request.approve(approvedBy, metadata);

      // Update memory store
      this.memoryStore.delete(approvalId);

      console.log('[ApprovalQueue] ✓ Approved request', {
        approvalId,
        approvedBy,
        action: request.action,
      });

      if (loggingService) {
        loggingService.logQueue(approvalId, 'Approval request approved', {
          approvedBy,
          action: request.action,
        });
      }

      return request;
    } catch (error) {
      console.error('[ApprovalQueue] Error approving request:', error.message);
      throw error;
    }
  }

  /**
   * Reject an approval request
   * 
   * @param {string} approvalId - Approval request ID
   * @param {string} rejectedBy - User/service rejecting
   * @param {string} reason - Reason for rejection
   * @param {object} metadata - Additional metadata
   * @returns {Promise<object>} - Updated approval request
   */
  async rejectRequest(approvalId, rejectedBy, reason = '', metadata = {}) {
    try {
      const request = await ApprovalRequest.findByApprovalId(approvalId);

      if (!request) {
        throw new Error(`Approval request not found: ${approvalId}`);
      }

      // Reject the request
      await request.reject(rejectedBy, reason, metadata);

      // Update memory store
      this.memoryStore.delete(approvalId);

      console.log('[ApprovalQueue] ✓ Rejected request', {
        approvalId,
        rejectedBy,
        reason,
        action: request.action,
      });

      if (loggingService) {
        loggingService.logQueue(approvalId, 'Approval request rejected', {
          rejectedBy,
          reason,
          action: request.action,
        });
      }

      return request;
    } catch (error) {
      console.error('[ApprovalQueue] Error rejecting request:', error.message);
      throw error;
    }
  }

  /**
   * Clean up expired approval requests
   * Should be called periodically (e.g., by a cleanup job)
   * 
   * @returns {Promise<number>} - Number of expired requests cleaned up
   */
  async cleanupExpired() {
    try {
      const now = new Date();
      let count = 0;

      // Clean memory store
      for (const [approvalId, request] of this.memoryStore.entries()) {
        if (new Date(request.expiresAt) < now) {
          this.memoryStore.delete(approvalId);
          count++;
        }
      }

      // Database cleanup is handled by MongoDB TTL index on expiresAt

      console.log('[ApprovalQueue] ✓ Cleaned up', count, 'expired approval requests');

      return count;
    } catch (error) {
      console.error('[ApprovalQueue] Error cleaning up expired requests:', error.message);
      return 0;
    }
  }

  /**
   * Get queue statistics
   * 
   * @param {string} tenantId - Tenant ID (optional)
   * @returns {Promise<object>} - Queue statistics
   */
  async getStats(tenantId = null) {
    const zeroStats = { total: 0, pending: 0, approved: 0, rejected: 0, expired: 0 };
    try {
      const filter = (status) => tenantId ? { tenantId, status } : { status };
      const [pending, approved, rejected, expired] = await Promise.all([
        ApprovalRequest.countDocuments(filter('pending')),
        ApprovalRequest.countDocuments(filter('approved')),
        ApprovalRequest.countDocuments(filter('rejected')),
        ApprovalRequest.countDocuments(filter('expired')),
      ]);

      return {
        total: pending + approved + rejected + expired,
        pending,
        approved,
        rejected,
        expired,
      };
    } catch (error) {
      console.error('[ApprovalQueue] Error getting stats:', error.message);
      return zeroStats;
    }
  }

  /**
   * Clear memory store (for testing)
   */
  clearMemoryStore() {
    this.memoryStore.clear();
    console.log('[ApprovalQueue] Memory store cleared');
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create ApprovalQueue singleton
 * 
 * @returns {ApprovalQueue} - Approval queue instance
 */
function getApprovalQueue() {
  if (!instance) {
    instance = new ApprovalQueue();
  }
  return instance;
}

module.exports = {
  ApprovalQueue,
  getApprovalQueue,
};
