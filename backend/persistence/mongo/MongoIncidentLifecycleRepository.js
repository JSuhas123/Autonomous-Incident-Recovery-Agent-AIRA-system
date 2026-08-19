"use strict";

const IncidentLifecycleRepository =
  require(
    "../repositories/IncidentLifecycleRepository"
  );

const IncidentLifecycle =
  require(
    "../../models/IncidentLifecycle"
  );

const IncidentLifecycleTransition =
  require(
    "../../models/IncidentLifecycleTransition"
  );

/**
 * Phase 13 Mongo compatibility adapter.
 *
 * Mongo remains authoritative during the persistence-abstraction
 * portion of Phase 13.
 *
 * The adapter intentionally exposes domain-oriented operations rather
 * than leaking Mongoose query methods into lifecycle business logic.
 */
class MongoIncidentLifecycleRepository
  extends IncidentLifecycleRepository {
  async findCurrent(
    {
      organizationId,
      environmentId,
      incidentId,
    }
  ) {
    return IncidentLifecycle
      .findOne({
        organizationId,

        environmentId,

        incidentId,
      });
  }

  async createTransition(
    transition
  ) {
    return IncidentLifecycleTransition
      .create(
        transition
      );
  }

  async upsertCurrent(
    {
      organizationId,
      environmentId,
      incidentId,
    },
    update
  ) {
    return IncidentLifecycle
      .findOneAndUpdate(
        {
          organizationId,

          environmentId,

          incidentId,
        },
        {
          $set:
            update,

          $setOnInsert: {
            organizationId,

            environmentId,

            incidentId,
          },
        },
        {
          new:
            true,

          upsert:
            true,

          setDefaultsOnInsert:
            true,
        }
      );
  }

  async updateCurrent(
    {
      organizationId,
      environmentId,
      incidentId,
    },
    update
  ) {
    return IncidentLifecycle
      .findOneAndUpdate(
        {
          organizationId,

          environmentId,

          incidentId,
        },
        {
          $set:
            update,
        },
        {
          new:
            true,
        }
      );
  }

  async getHistory(
    {
      organizationId,
      environmentId,
      incidentId,
    },
    limit = 100
  ) {
    const safeLimit =
      Math.min(
        500,
        Math.max(
          1,
          Number(
            limit
          ) ||
          100
        )
      );

    return IncidentLifecycleTransition
      .find({
        organizationId,

        environmentId,

        incidentId,
      })
      .sort({
        revision:
          1,
      })
      .limit(
        safeLimit
      );
  }
}

module.exports =
  MongoIncidentLifecycleRepository;