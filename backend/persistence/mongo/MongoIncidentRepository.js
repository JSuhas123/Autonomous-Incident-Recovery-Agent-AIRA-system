"use strict";

const IncidentRepository =
  require(
    "../repositories/IncidentRepository"
  );

const {
  Incident,
} =
  require(
    "../../models/Incident"
  );

/**
 * MongoDB/Mongoose implementation of the Phase 13
 * IncidentRepository contract.
 *
 * This adapter intentionally preserves the existing persistence
 * behaviour while business logic is moved behind repository
 * boundaries.
 *
 * MongoDB remains authoritative during this migration step.
 */
class MongoIncidentRepository
  extends IncidentRepository {
  async findOne(filter) {
    return Incident.findOne(
      filter
    );
  }

  async findMany(filter) {
    return Incident.find(
      filter
    );
  }

  async create(data) {
    return Incident.create(
      data
    );
  }

  async save(incident) {
    if (
      !incident ||
      typeof incident.save !==
        "function"
    ) {
      throw Object.assign(
        new Error(
          "MongoIncidentRepository.save() requires a Mongoose Incident document"
        ),
        {
          code:
            "INVALID_INCIDENT_DOCUMENT",
        }
      );
    }

    return incident.save();
  }
}

module.exports =
  MongoIncidentRepository;