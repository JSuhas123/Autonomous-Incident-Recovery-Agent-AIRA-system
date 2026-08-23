"use strict";

class PolicyRepository {
  async findOne(
    _filter,
    _transaction = null
  ) {
    throw new Error(
      "PolicyRepository.findOne() is not implemented"
    );
  }

  async findActiveForTenant(
    _tenantId,
    _version = null,
    _transaction = null
  ) {
    throw new Error(
      "PolicyRepository.findActiveForTenant() is not implemented"
    );
  }

  async list(
    _filter,
    _options = {},
    _transaction = null
  ) {
    throw new Error(
      "PolicyRepository.list() is not implemented"
    );
  }

  async create(
    _data,
    _transaction = null
  ) {
    throw new Error(
      "PolicyRepository.create() is not implemented"
    );
  }

  async save(
    _policy,
    _transaction = null
  ) {
    throw new Error(
      "PolicyRepository.save() is not implemented"
    );
  }

  async updateOne(
    _filter,
    _update,
    _transaction = null
  ) {
    throw new Error(
      "PolicyRepository.updateOne() is not implemented"
    );
  }
}

module.exports =
  PolicyRepository;