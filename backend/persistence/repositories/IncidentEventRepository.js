"use strict";

/**
 * Phase 13 — Enterprise Data Architecture
 *
 * Persistence contract for durable IncidentEvent records.
 *
 * This boundary intentionally contains no MongoDB/Mongoose or PostgreSQL
 * implementation details.
 *
 * Implementations must preserve:
 *
 * - globally unique eventId semantics
 * - organization/environment ownership
 * - durable publication state
 * - retry state
 * - ordered incident event retrieval
 * - fail-closed persistence behaviour
 */
class IncidentEventRepository {
  async create(_data) {
    throw new Error(
      "IncidentEventRepository.create() is not implemented"
    );
  }

  async findByEventId(_eventId) {
    throw new Error(
      "IncidentEventRepository.findByEventId() is not implemented"
    );
  }

  async save(_event) {
    throw new Error(
      "IncidentEventRepository.save() is not implemented"
    );
  }

  async markProcessed(
    _eventId,
    _processingTimeMs = null
  ) {
    throw new Error(
      "IncidentEventRepository.markProcessed() is not implemented"
    );
  }

  async listForIncident(
    _context,
    _incidentId,
    _limit = 200
  ) {
    throw new Error(
      "IncidentEventRepository.listForIncident() is not implemented"
    );
  }
}

module.exports =
  IncidentEventRepository;