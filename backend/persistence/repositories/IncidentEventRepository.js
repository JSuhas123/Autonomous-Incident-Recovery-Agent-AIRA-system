"use strict";

class IncidentEventRepository {
  async create(
    _data,
    _transaction = null
  ) {
    throw new Error(
      "IncidentEventRepository.create() is not implemented"
    );
  }

  async findByEventId(
    _context,
    _eventId,
    _transaction = null
  ) {
    throw new Error(
      "IncidentEventRepository.findByEventId() is not implemented"
    );
  }

  async save(
    _event,
    _transaction = null
  ) {
    throw new Error(
      "IncidentEventRepository.save() is not implemented"
    );
  }

  async markProcessed(
    _context,
    _eventId,
    _processingTimeMs = null,
    _transaction = null
  ) {
    throw new Error(
      "IncidentEventRepository.markProcessed() is not implemented"
    );
  }

  async listForIncident(
    _context,
    _incidentId,
    _limit = 200,
    _transaction = null
  ) {
    throw new Error(
      "IncidentEventRepository.listForIncident() is not implemented"
    );
  }
}

module.exports =
  IncidentEventRepository;