/**
 * Approval Request Model
 * 
 * Represents a decision that requires human approval before execution.
 * Tracks approval status, timeout, and decision context.
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const ApprovalRequestSchema = new mongoose.Schema(
  {
    // Unique identifier
    _id: {
      type: String,
      default: () => uuidv4(),
    },
    approvalId: {
      type: String,
      default: () => uuidv4(),
      index: true,
      unique: true,
    },

    // Decision context
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    decisionId: {
      type: String,
      required: true,
      index: true,
    },
    correlationId: {
      type: String,
      index: true,
    },

    // Decision details
    action: {
      type: String,
      required: true,
      enum: [
        'restart_pod',
        'restart_deployment',
        'scale_deployment',
        'clear_cache',
        'scale_service',
        'custom_action',
      ],
    },
    reason: {
      type: String,
      required: true,
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    confidence: {
      type: Number,
      required: true,
      min: 0.0,
      max: 1.0,
    },

    // Resource details
    resource: {
      type: String,
      required: true, // Pod name, deployment name, etc.
    },
    namespace: {
      type: String,
      default: 'default',
    },
    additionalParams: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Status tracking
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'expired', 'executed'],
      index: true,
      default: 'pending',
    },
    approvedBy: {
      type: String, // User ID or service name
    },
    rejectedBy: {
      type: String,
    },
    rejectionReason: {
      type: String,
    },

    // Timing
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    expiresAt: {
      type: Date,
      index: true,
      // Set to current time + approval timeout
      default: () => new Date(Date.now() + (parseInt(process.env.APPROVAL_TIMEOUT_MS) || 600000)),
    },
    approvedAt: {
      type: Date,
    },
    rejectedAt: {
      type: Date,
    },
    executedAt: {
      type: Date,
    },

    // Audit trail
    metadata: {
      userAgent: String,
      ipAddress: String,
      requiredConfidence: Number,
      approvalThreshold: Number,
      systemVersion: String,
    },

    // Decision trace for full context
    decisionTrace: {
      signal: mongoose.Schema.Types.Mixed,
      analysisResult: mongoose.Schema.Types.Mixed,
      policyMatch: mongoose.Schema.Types.Mixed,
      safetyGates: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    collection: 'approval_requests',
  }
);

// Indexes for efficient queries
ApprovalRequestSchema.index({ tenantId: 1, status: 1 });
ApprovalRequestSchema.index({ tenantId: 1, createdAt: -1 });
ApprovalRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Static methods
ApprovalRequestSchema.statics.createApprovalRequest = async function (data) {
  try {
    const request = new this({
      ...data,
      expiresAt: new Date(Date.now() + (parseInt(process.env.APPROVAL_TIMEOUT_MS) || 600000)),
    });
    await request.save();
    return request;
  } catch (error) {
    console.error('[ApprovalRequest] Error creating approval request:', error.message);
    throw error;
  }
};

ApprovalRequestSchema.statics.findPendingApprovals = async function (tenantId) {
  try {
    return await this.find({
      tenantId,
      status: 'pending',
      expiresAt: { $gt: new Date() }, // Not expired
    }).sort({ createdAt: -1 });
  } catch (error) {
    console.error('[ApprovalRequest] Error finding pending approvals:', error.message);
    throw error;
  }
};

ApprovalRequestSchema.statics.findByApprovalId = async function (approvalId) {
  try {
    return await this.findOne({ approvalId });
  } catch (error) {
    console.error('[ApprovalRequest] Error finding approval by ID:', error.message);
    throw error;
  }
};

// Instance methods
ApprovalRequestSchema.methods.approve = async function (approvedBy, metadata = {}) {
  try {
    if (this.status !== 'pending') {
      throw new Error(`Cannot approve request with status: ${this.status}`);
    }

    if (new Date() > this.expiresAt) {
      this.status = 'expired';
      await this.save();
      throw new Error('Approval request has expired');
    }

    this.status = 'approved';
    this.approvedBy = approvedBy;
    this.approvedAt = new Date();
    this.metadata = { ...this.metadata, ...metadata };

    await this.save();

    console.log(`[ApprovalRequest] ✓ Approval request approved: ${this.approvalId}`, {
      approvedBy,
      action: this.action,
    });

    return this;
  } catch (error) {
    console.error('[ApprovalRequest] Error approving request:', error.message);
    throw error;
  }
};

ApprovalRequestSchema.methods.reject = async function (rejectedBy, reason = '', metadata = {}) {
  try {
    if (this.status !== 'pending') {
      throw new Error(`Cannot reject request with status: ${this.status}`);
    }

    this.status = 'rejected';
    this.rejectedBy = rejectedBy;
    this.rejectionReason = reason;
    this.rejectedAt = new Date();
    this.metadata = { ...this.metadata, ...metadata };

    await this.save();

    console.log(`[ApprovalRequest] ✓ Approval request rejected: ${this.approvalId}`, {
      rejectedBy,
      reason,
      action: this.action,
    });

    return this;
  } catch (error) {
    console.error('[ApprovalRequest] Error rejecting request:', error.message);
    throw error;
  }
};

ApprovalRequestSchema.methods.markExecuted = async function () {
  try {
    if (this.status !== 'approved') {
      throw new Error(`Cannot mark as executed with status: ${this.status}`);
    }

    this.status = 'executed';
    this.executedAt = new Date();

    await this.save();

    console.log(`[ApprovalRequest] ✓ Approval request marked as executed: ${this.approvalId}`);

    return this;
  } catch (error) {
    console.error('[ApprovalRequest] Error marking as executed:', error.message);
    throw error;
  }
};

ApprovalRequestSchema.methods.isExpired = function () {
  return new Date() > this.expiresAt;
};

ApprovalRequestSchema.methods.getStatus = function () {
  if (this.isExpired()) {
    return 'expired';
  }
  return this.status;
};

module.exports = mongoose.model('ApprovalRequest', ApprovalRequestSchema);
