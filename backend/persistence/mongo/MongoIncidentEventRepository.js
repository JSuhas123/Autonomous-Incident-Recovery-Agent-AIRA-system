"use strict";

const IncidentEventRepository =
  require(
    "../repositories/IncidentEventRepository"
  );

const IncidentEvent =
  require(
    "../../models/IncidentEvent"
  );

/**
 * Phase 13 MongoDB compatibility adapter.
 *
 * MongoDB remains authoritative during the persistence-abstraction
 * stage of Phase 13.
 *
 * This adapter deliberately preserves the existing Mongoose behaviour
 * so the IncidentEvent service can become database-agnostic without
 * changing runtime semantics.
 */
class MongoIncidentEventRepository
  extends IncidentEventRepository {
  async create(
    data
  ) {
    return IncidentEvent
      .create(
        data
      );
  }

  async findByEventId(
    eventId
  ) {
    return IncidentEvent
      .findOne({
        eventId,
      });
  }

  async save(
    event
  ) {
    if (
      !event ||
      typeof event.save !==
        "function"
    ) {
      throw Object.assign(
        new Error(
          "MongoIncidentEventRepository.save() requires a Mongoose IncidentEvent document"
        ),
        {
          code:
            "INVALID_INCIDENT_EVENT_DOCUMENT",
        }
      );
    }

    return event
      .save();
  }

  async markProcessed(
    eventId,
    processingTimeMs =
      null
  ) {
    return IncidentEvent
      .findOneAndUpdate(
        {
          eventId,
        },
        {
          $set: {
            status:
              "processed",

            processedAt:
              new Date(),

            processingTimeMs:
              processingTimeMs,
          },
        },
        {
          new:
            true,
        }
      );
  }

  async listForIncident(
    {
      organizationId,
      environmentId,
    },
    incidentId,
    limit = 200
  ) {
    const safeLimit =
      Math.min(
        Math.max(
          Number(
            limit
          ) ||
          200,
          1
        ),
        1000
      );

    return IncidentEvent
      .find({
        organizationId,

        environmentId,

        incidentId,
      })
      .sort({
        occurredAt:
          1,
      })
      .limit(
        safeLimit
      )
      .lean();
  }
}

module.exports =
  MongoIncidentEventRepository;