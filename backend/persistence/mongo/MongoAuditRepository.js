"use strict";

const AuditRepository =
  require(
    "../repositories/AuditRepository"
  );

const AuditEvent =
  require(
    "../../models/AuditEvent"
  );

class MongoAuditRepository
  extends AuditRepository {
  async create(
    data
  ) {
    return AuditEvent
      .create(
        data
      );
  }

  async findLatestForTenant(
    tenantId
  ) {
    return AuditEvent
      .findOne({
        tenantId,
      })
      .sort({
        timestamp:
          -1,
      });
  }

  async findOne(
    filter
  ) {
    return AuditEvent
      .findOne(
        filter
      );
  }

  async list(
    filter,
    {
      sort = {
        timestamp:
          1,
      },

      limit = null,
    } = {}
  ) {
    let query =
      AuditEvent
        .find(
          filter
        )
        .sort(
          sort
        );

    if (
      limit !==
        null &&
      limit !==
        undefined
    ) {
      const safeLimit =
        Math.min(
          Math.max(
            Number.parseInt(
              limit,
              10
            ) ||
            100,
            1
          ),
          1000
        );

      query =
        query.limit(
          safeLimit
        );
    }

    return query;
  }
}

module.exports =
  MongoAuditRepository;