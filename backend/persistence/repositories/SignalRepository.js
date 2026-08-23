"use strict";

/**
 * Phase 13 — Enterprise Data Architecture
 *
 * Canonical Signal persistence contract.
 *
 * All operations capable of reading or mutating an existing Signal must carry
 * organization/environment scope so PostgreSQL RLS can remain enforced.
 */
class SignalRepository {
  async create(
    _data,
    _transaction = null
  ) {
    throw new Error(
      "SignalRepository.create() is not implemented"
    );
  }

  async findByDatabaseId(
    _context,
    _id,
    _transaction = null
  ) {
    throw new Error(
      "SignalRepository.findByDatabaseId() is not implemented"
    );
  }

  async findOne(
    _filter,
    _transaction = null
  ) {
    throw new Error(
      "SignalRepository.findOne() is not implemented"
    );
  }

  async findOneLean(
    _filter,
    _transaction = null
  ) {
    throw new Error(
      "SignalRepository.findOneLean() is not implemented"
    );
  }

  async findLatestDuplicate(
    _filter,
    _transaction = null
  ) {
    throw new Error(
      "SignalRepository.findLatestDuplicate() is not implemented"
    );
  }

  async list(
    _filter,
    _options = {},
    _transaction = null
  ) {
    throw new Error(
      "SignalRepository.list() is not implemented"
    );
  }

  async updateOne(
    _filter,
    _update,
    _transaction = null
  ) {
    throw new Error(
      "SignalRepository.updateOne() is not implemented"
    );
  }

  async updateMany(
    _filter,
    _update,
    _transaction = null
  ) {
    throw new Error(
      "SignalRepository.updateMany() is not implemented"
    );
  }

  async save(
    _signal,
    _transaction = null
  ) {
    throw new Error(
      "SignalRepository.save() is not implemented"
    );
  }
}

module.exports =
  SignalRepository;