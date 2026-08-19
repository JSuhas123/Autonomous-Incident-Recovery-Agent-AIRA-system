"use strict";

/**
 * Phase 13 — Enterprise Data Architecture
 *
 * Persistence contract for canonical AIRA Signals.
 *
 * IMPORTANT:
 * - No Mongoose-specific API may escape this boundary.
 * - No PostgreSQL-specific API belongs here.
 * - organization/environment scope must be preserved.
 * - provider deduplication and processing-state semantics must survive
 *   the eventual PostgreSQL migration.
 */
class SignalRepository {
  async create(_data) {
    throw new Error(
      "SignalRepository.create() is not implemented"
    );
  }

  async findByDatabaseId(_id) {
    throw new Error(
      "SignalRepository.findByDatabaseId() is not implemented"
    );
  }

  async findOne(_filter) {
    throw new Error(
      "SignalRepository.findOne() is not implemented"
    );
  }

  async findOneLean(_filter) {
    throw new Error(
      "SignalRepository.findOneLean() is not implemented"
    );
  }

  async findLatestDuplicate(
    _filter
  ) {
    throw new Error(
      "SignalRepository.findLatestDuplicate() is not implemented"
    );
  }

  async list(
    _filter,
    _options = {}
  ) {
    throw new Error(
      "SignalRepository.list() is not implemented"
    );
  }

  async updateOne(
    _filter,
    _update
  ) {
    throw new Error(
      "SignalRepository.updateOne() is not implemented"
    );
  }

  async updateMany(
  _filter,
  _update
) {
  throw new Error(
    "SignalRepository.updateMany() is not implemented"
  );
}

  async save(_signal) {
    throw new Error(
      "SignalRepository.save() is not implemented"
    );
  }
}

module.exports =
  SignalRepository;