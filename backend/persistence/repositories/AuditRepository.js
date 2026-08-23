"use strict";

class AuditRepository {
  async create(
    _data,
    _transaction = null
  ) {
    throw new Error(
      "AuditRepository.create() is not implemented"
    );
  }

  async findLatestForTenant(
    _tenantId,
    _transaction = null
  ) {
    throw new Error(
      "AuditRepository.findLatestForTenant() is not implemented"
    );
  }

  async findOne(
    _filter,
    _transaction = null
  ) {
    throw new Error(
      "AuditRepository.findOne() is not implemented"
    );
  }

  async list(
    _filter,
    _options = {},
    _transaction = null
  ) {
    throw new Error(
      "AuditRepository.list() is not implemented"
    );
  }
}

module.exports =
  AuditRepository;