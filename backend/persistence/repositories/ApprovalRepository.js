"use strict";

class ApprovalRepository {
  async createRequest(_data) {
    throw new Error(
      "ApprovalRepository.createRequest() is not implemented"
    );
  }

  async findPending(_tenantId) {
    throw new Error(
      "ApprovalRepository.findPending() is not implemented"
    );
  }

  async findByApprovalId(_approvalId) {
    throw new Error(
      "ApprovalRepository.findByApprovalId() is not implemented"
    );
  }

  async save(_request) {
    throw new Error(
      "ApprovalRepository.save() is not implemented"
    );
  }

  async countByStatus(
    _tenantId,
    _status
  ) {
    throw new Error(
      "ApprovalRepository.countByStatus() is not implemented"
    );
  }
}

module.exports =
  ApprovalRepository;