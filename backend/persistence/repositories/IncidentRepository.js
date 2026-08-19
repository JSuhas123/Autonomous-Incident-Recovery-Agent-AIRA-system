"use strict";

/**
 * Phase 13 — Enterprise Data Architecture
 *
 * Persistence contract for the Incident aggregate.
 *
 * Domain/business services must depend on this contract rather than
 * importing a database implementation directly.
 *
 * IMPORTANT:
 * - This contract contains no Mongoose-specific types.
 * - This contract contains no PostgreSQL-specific types.
 * - Implementations must preserve tenant/environment scoping.
 * - Implementations must preserve concurrency and uniqueness semantics.
 */
class IncidentRepository {
  async findOne(_filter) {
    throw new Error(
      "IncidentRepository.findOne() is not implemented"
    );
  }

  async findMany(_filter) {
    throw new Error(
      "IncidentRepository.findMany() is not implemented"
    );
  }

  async create(_data) {
    throw new Error(
      "IncidentRepository.create() is not implemented"
    );
  }

  async save(_incident) {
    throw new Error(
      "IncidentRepository.save() is not implemented"
    );
  }
}

module.exports = IncidentRepository;