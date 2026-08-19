"use strict";

const ApprovalRepository =
  require(
    "../repositories/ApprovalRepository"
  );

const ApprovalRequest =
  require(
    "../../models/ApprovalRequest"
  );

class MongoApprovalRepository
  extends ApprovalRepository {
  async createRequest(
    data
  ) {
    /*
     * Preserve the model's canonical factory because it contains
     * ApprovalRequest-specific defaults and validation.
     */
    if (
      typeof ApprovalRequest
        .createApprovalRequest ===
      "function"
    ) {
      return ApprovalRequest
        .createApprovalRequest(
          data
        );
    }

    return ApprovalRequest
      .create(
        data
      );
  }

  async findPending(
    tenantId
  ) {
    if (
      typeof ApprovalRequest
        .findPendingApprovals ===
      "function"
    ) {
      return ApprovalRequest
        .findPendingApprovals(
          tenantId
        );
    }

    return ApprovalRequest
      .find({
        tenantId,

        status:
          "pending",
      })
      .sort({
        createdAt:
          1,
      });
  }

  async findByApprovalId(
    approvalId
  ) {
    if (
      typeof ApprovalRequest
        .findByApprovalId ===
      "function"
    ) {
      return ApprovalRequest
        .findByApprovalId(
          approvalId
        );
    }

    return ApprovalRequest
      .findOne({
        approvalId,
      });
  }

  async save(
    request
  ) {
    if (
      !request ||
      typeof request.save !==
        "function"
    ) {
      throw Object.assign(
        new Error(
          "MongoApprovalRepository.save() requires an ApprovalRequest document"
        ),
        {
          code:
            "INVALID_APPROVAL_REQUEST_DOCUMENT",
        }
      );
    }

    return request
      .save();
  }

  async countByStatus(
    tenantId,
    status
  ) {
    return ApprovalRequest
      .countDocuments({
        tenantId,

        status,
      });
  }
}

module.exports =
  MongoApprovalRepository;