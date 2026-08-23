"use strict";

const IncidentEventRepository =
  require(
    "../repositories/IncidentEventRepository"
  );

const IncidentEvent =
  require(
    "../../models/IncidentEvent"
  );

function sessionFrom(
  transaction
) {
  return transaction
    ?.kind ===
    "mongo"
    ? transaction.session
    : null;
}

class MongoIncidentEventRepository
  extends IncidentEventRepository {
  async create(
    data,
    transaction = null
  ) {
    const session =
      sessionFrom(
        transaction
      );

    if (!session) {
      return IncidentEvent
        .create(
          data
        );
    }

    const [
      created,
    ] =
      await IncidentEvent
        .create(
          [
            data,
          ],
          {
            session,
          }
        );

    return created;
  }

  /**
   * Supports both:
   *
   * Legacy:
   * findByEventId(eventId)
   *
   * Phase 13 PostgreSQL-safe:
   * findByEventId(context, eventId, transaction)
   */
  async findByEventId(
    contextOrEventId,
    eventId = null,
    transaction = null
  ) {
    let filter;

    if (
      contextOrEventId &&
      typeof contextOrEventId ===
        "object" &&
      !Array.isArray(
        contextOrEventId
      )
    ) {
      filter = {
        organizationId:
          contextOrEventId
            .organizationId,

        environmentId:
          contextOrEventId
            .environmentId,

        eventId,
      };
    } else {
      filter = {
        eventId:
          contextOrEventId,
      };

      /*
       * Legacy second argument was not a transaction.
       */
      transaction =
        null;
    }

    let query =
      IncidentEvent
        .findOne(
          filter
        );

    const session =
      sessionFrom(
        transaction
      );

    if (
      session &&
      typeof query.session ===
        "function"
    ) {
      query =
        query.session(
          session
        );
    }

    return query;
  }

  async save(
    event,
    transaction = null
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

    const session =
      sessionFrom(
        transaction
      );

    return event.save(
      session
        ? {
            session,
          }
        : undefined
    );
  }

  /**
   * Supports both:
   *
   * Legacy:
   * markProcessed(eventId, processingTimeMs)
   *
   * Phase 13:
   * markProcessed(context, eventId, processingTimeMs, transaction)
   */
  async markProcessed(
    contextOrEventId,
    eventIdOrProcessingTime = null,
    processingTimeMs = null,
    transaction = null
  ) {
    let filter;
    let actualProcessingTime;

    if (
      contextOrEventId &&
      typeof contextOrEventId ===
        "object" &&
      !Array.isArray(
        contextOrEventId
      )
    ) {
      filter = {
        organizationId:
          contextOrEventId
            .organizationId,

        environmentId:
          contextOrEventId
            .environmentId,

        eventId:
          eventIdOrProcessingTime,
      };

      actualProcessingTime =
        processingTimeMs;
    } else {
      filter = {
        eventId:
          contextOrEventId,
      };

      actualProcessingTime =
        eventIdOrProcessingTime;

      transaction =
        null;
    }

    let query =
      IncidentEvent
        .findOneAndUpdate(
          filter,
          {
            $set: {
              status:
                "processed",

              processedAt:
                new Date(),

              processingTimeMs:
                actualProcessingTime,
            },
          },
          {
            new:
              true,
          }
        );

    const session =
      sessionFrom(
        transaction
      );

    if (
      session &&
      typeof query.session ===
        "function"
    ) {
      query =
        query.session(
          session
        );
    }

    return query;
  }

  async listForIncident(
    {
      organizationId,
      environmentId,
    },
    incidentId,
    limit = 200,
    transaction = null
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

    let query =
      IncidentEvent
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
        );

    const session =
      sessionFrom(
        transaction
      );

    if (
      session &&
      typeof query.session ===
        "function"
    ) {
      query =
        query.session(
          session
        );
    }

    return query
      .lean();
  }
}

module.exports =
  MongoIncidentEventRepository;