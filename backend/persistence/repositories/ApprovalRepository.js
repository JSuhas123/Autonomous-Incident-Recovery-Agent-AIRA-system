"use strict";

class ApprovalRepository {
  async createRequest(
    _data,
    _transaction = null
  ) {
    throw new Error(
      "ApprovalRepository.createRequest() is not implemented"
    );
  }

  async findPending(
    _scope,
    _transaction = null
  ) {
    throw new Error(
      "ApprovalRepository.findPending() is not implemented"
    );
  }

  async findByApprovalId(
    _approvalId,
    _scope,
    _transaction = null
  ) {
    throw new Error(
      "ApprovalRepository.findByApprovalId() is not implemented"
    );
  }

  async approve(
    _request,
    _approvedBy,
    _metadata = {},
    _transaction = null
  ) {
    throw new Error(
      "ApprovalRepository.approve() is not implemented"
    );
  }

  async reject(
    _request,
    _rejectedBy,
    _reason = "",
    _metadata = {},
    _transaction = null
  ) {
    throw new Error(
      "ApprovalRepository.reject() is not implemented"
    );
  }

  async save(
    _request,
    _transaction = null
  ) {
    throw new Error(
      "ApprovalRepository.save() is not implemented"
    );
  }

  async countByStatus(
    _scope,
    _status,
    _transaction = null
  ) {
    throw new Error(
      "ApprovalRepository.countByStatus() is not implemented"
    );
  }
}

module.exports =
  ApprovalRepository;