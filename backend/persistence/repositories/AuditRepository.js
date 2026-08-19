"use strict";

/**
 * Append-only audit persistence contract.
 *
 * Audit records are immutable.
 */
class AuditRepository {
  async create(_data) {
    throw new Error(
      "AuditRepository.create() is not implemented"
    );
  }

  async findLatestForTenant(
    _tenantId
  ) {
    throw new Error(
      "AuditRepository.findLatestForTenant() is not implemented"
    );
  }

  async findOne(
    _filter
  ) {
    throw new Error(
      "AuditRepository.findOne() is not implemented"
    );
  }

  async list(
    _filter,
    _options = {}
  ) {
    throw new Error(
      "AuditRepository.list() is not implemented"
    );
  }
}

module.exports =
  AuditRepository;