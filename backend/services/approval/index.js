/**
 * Approval Services Module
 */

const { ApprovalService, getApprovalService } = require('./approvalService');
const { ApprovalQueue, getApprovalQueue } = require('./approvalQueue');

module.exports = {
  ApprovalService,
  getApprovalService,
  ApprovalQueue,
  getApprovalQueue,
};
