"use strict";

const ApprovalRepository =
  require(
    "../repositories/ApprovalRepository"
  );

const ApprovalRequest =
  require(
    "../../models/ApprovalRequest"
  );

function sessionFrom(
  transaction
) {
  return transaction?.kind ===
    "mongo"
    ? transaction.session
    : null;
}

class MongoApprovalRepository
  extends ApprovalRepository {
  async createRequest(
    data,
    transaction = null
  ) {
    /*
     * Canonical model factory currently owns Approval-specific
     * defaults and expiry calculation.
     */
    if (
      typeof ApprovalRequest
        .createApprovalRequest ===
      "function" &&
      !sessionFrom(
        transaction
      )
    ) {
      return ApprovalRequest
        .createApprovalRequest(
          data
        );
    }

    const session =
      sessionFrom(
        transaction
      );

    if (!session) {
      return ApprovalRequest
        .create(
          data
        );
    }

    const [
      created,
    ] =
      await ApprovalRequest
        .create(
          [
            data,
          ],
          {
            session,
          }
        );

    return created;
  }

  async findPending(
    scope,
    transaction = null
  ) {
    /*
     * Backward-compatible old tenant signature.
     */
    if (
      typeof scope ===
      "string"
    ) {
      if (
        typeof ApprovalRequest
          .findPendingApprovals ===
        "function"
      ) {
        return ApprovalRequest
          .findPendingApprovals(
            scope
          );
      }

      return ApprovalRequest
        .find({
          tenantId:
            scope,

          status:
            "pending",
        });
    }

    if (
      typeof ApprovalRequest
        .findPendingApprovals ===
      "function" &&
      !sessionFrom(
        transaction
      )
    ) {
      return ApprovalRequest
        .findPendingApprovals(
          scope
        );
    }

    let query =
      ApprovalRequest
        .find({
          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,

          status:
            "pending",

          expiresAt: {
            $gt:
              new Date(),
          },
        })
        .sort({
          createdAt:
            -1,
        });

    const session =
      sessionFrom(
        transaction
      );

    if (session) {
      query =
        query.session(
          session
        );
    }

    return query;
  }

  async findByApprovalId(
    approvalId,
    scope = null,
    transaction = null
  ) {
    if (
      !scope
    ) {
      return ApprovalRequest
        .findOne({
          approvalId,
        });
    }

    if (
      typeof ApprovalRequest
        .findByApprovalId ===
      "function" &&
      !sessionFrom(
        transaction
      )
    ) {
      return ApprovalRequest
        .findByApprovalId(
          approvalId,
          scope
        );
    }

    let query =
      ApprovalRequest
        .findOne({
          approvalId,

          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,
        });

    const session =
      sessionFrom(
        transaction
      );

    if (session) {
      query =
        query.session(
          session
        );
    }

    return query;
  }

  async approve(
    request,
    approvedBy,
    metadata = {},
    transaction = null
  ) {
    if (
      request &&
      typeof request.approve ===
        "function" &&
      !sessionFrom(
        transaction
      )
    ) {
      return request.approve(
        approvedBy,
        metadata
      );
    }

    if (
      request.status !==
      "pending"
    ) {
      throw new Error(
        `Cannot approve request with status: ${request.status}`
      );
    }

    if (
      new Date() >
      new Date(
        request.expiresAt
      )
    ) {
      request.status =
        "expired";

      await this.save(
        request,
        transaction
      );

      throw new Error(
        "Approval request has expired"
      );
    }

    request.status =
      "approved";

    request.approvedBy =
      approvedBy;

    request.approvedAt =
      new Date();

    request.metadata = {
      ...(
        request.metadata ||
        {}
      ),

      ...metadata,
    };

    return this.save(
      request,
      transaction
    );
  }

  async reject(
    request,
    rejectedBy,
    reason = "",
    metadata = {},
    transaction = null
  ) {
    if (
      request &&
      typeof request.reject ===
        "function" &&
      !sessionFrom(
        transaction
      )
    ) {
      return request.reject(
        rejectedBy,
        reason,
        metadata
      );
    }

    if (
      request.status !==
      "pending"
    ) {
      throw new Error(
        `Cannot reject request with status: ${request.status}`
      );
    }

    request.status =
      "rejected";

    request.rejectedBy =
      rejectedBy;

    request.rejectionReason =
      reason;

    request.rejectedAt =
      new Date();

    request.metadata = {
      ...(
        request.metadata ||
        {}
      ),

      ...metadata,
    };

    return this.save(
      request,
      transaction
    );
  }

  async save(
    request,
    transaction = null
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

    const session =
      sessionFrom(
        transaction
      );

    return request.save(
      session
        ? {
            session,
          }
        : undefined
    );
  }

  async countByStatus(
    scope,
    status,
    transaction = null
  ) {
    /*
     * Legacy tests.
     */
    if (
      typeof scope ===
      "string"
    ) {
      return ApprovalRequest
        .countDocuments({
          tenantId:
            scope,

          status,
        });
    }

    let query =
      ApprovalRequest
        .countDocuments({
          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,

          status,
        });

    const session =
      sessionFrom(
        transaction
      );

    if (
      session &&
      typeof query.session ===
        "function"
    ) {
      query =
        query.session(
          session
        );
    }

    return query;
  }
}

module.exports =
  MongoApprovalRepository;