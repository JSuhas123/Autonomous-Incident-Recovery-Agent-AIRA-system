"use strict";

const IncidentEventRepository =
  require(
    "../repositories/IncidentEventRepository"
  );

const MigrationShadowReadService =
  require(
    "./MigrationShadowReadService"
  );

class ShadowIncidentEventRepository
  extends IncidentEventRepository {
  constructor(
    options = {}
  ) {
    super();

    this.primary =
      requireRepository(
        options.primaryRepository,
        "primary"
      );

    this.shadow =
      requireRepository(
        options.shadowRepository,
        "shadow"
      );

    this.shadowReadService =
      options.shadowReadService ||
      new MigrationShadowReadService();
  }

  async create(
    data,
    transaction = null
  ) {
    return this.primary
      .create(
        data,
        transaction
      );
  }

  async findByEventId(
    context,
    eventId,
    transaction = null
  ) {
    if (
      transaction ||
      !hasScope(
        context
      )
    ) {
      return this.primary
        .findByEventId(
          context,
          eventId,
          transaction
        );
    }

    return this
      .shadowReadService
      .read({
        scope:
          context,

        domain:
          "incidentEvents",

        operation:
          "findByEventId",

        identity:
          eventId,

        primaryRead:
          () =>
            this.primary
              .findByEventId(
                context,
                eventId,
                null
              ),

        shadowRead:
          () =>
            this.shadow
              .findByEventId(
                context,
                eventId,
                null
              ),
      });
  }

  async save(
    event,
    transaction = null
  ) {
    return this.primary
      .save(
        event,
        transaction
      );
  }

  async markProcessed(
    context,
    eventId,
    processingTimeMs = null,
    transaction = null
  ) {
    return this.primary
      .markProcessed(
        context,
        eventId,
        processingTimeMs,
        transaction
      );
  }

  async listForIncident(
    context,
    incidentId,
    limit = 200,
    transaction = null
  ) {
    if (
      transaction ||
      !hasScope(
        context
      )
    ) {
      return this.primary
        .listForIncident(
          context,
          incidentId,
          limit,
          transaction
        );
    }

    return this
      .shadowReadService
      .read({
        scope:
          context,

        domain:
          "incidentEvents",

        operation:
          "listForIncident",

        identity:
          incidentId,

        primaryRead:
          () =>
            this.primary
              .listForIncident(
                context,
                incidentId,
                limit,
                null
              ),

        shadowRead:
          () =>
            this.shadow
              .listForIncident(
                context,
                incidentId,
                limit,
                null
              ),
      });
  }
}

function hasScope(
  value = {}
) {
  return Boolean(
    value.organizationId &&
    value.environmentId
  );
}

function requireRepository(
  repository,
  type
) {
  if (!repository) {
    throw Object.assign(
      new Error(
        `ShadowIncidentEventRepository requires ${type}Repository`
      ),
      {
        code:
          "SHADOW_INCIDENT_EVENT_REPOSITORY_REQUIRED",
      }
    );
  }

  return repository;
}

module.exports =
  ShadowIncidentEventRepository;