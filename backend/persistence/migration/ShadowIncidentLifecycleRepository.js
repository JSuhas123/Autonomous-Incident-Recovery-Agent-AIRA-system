"use strict";

const IncidentLifecycleRepository =
  require(
    "../repositories/IncidentLifecycleRepository"
  );

const MigrationShadowReadService =
  require(
    "./MigrationShadowReadService"
  );

class ShadowIncidentLifecycleRepository
  extends IncidentLifecycleRepository {
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

  async findCurrent(
    scope,
    transaction = null
  ) {
    if (
      transaction ||
      !hasScope(
        scope
      )
    ) {
      return this.primary
        .findCurrent(
          scope,
          transaction
        );
    }

    return this
      .shadowReadService
      .read({
        scope,

        domain:
          "incidentLifecycle",

        operation:
          "findCurrent",

        identity:
          scope.incidentId ||
          null,

        primaryRead:
          () =>
            this.primary
              .findCurrent(
                scope,
                null
              ),

        shadowRead:
          () =>
            this.shadow
              .findCurrent(
                scope,
                null
              ),
      });
  }

  async createTransition(
    transition,
    transaction = null
  ) {
    return this.primary
      .createTransition(
        transition,
        transaction
      );
  }

  async upsertCurrent(
    scope,
    update,
    transaction = null
  ) {
    return this.primary
      .upsertCurrent(
        scope,
        update,
        transaction
      );
  }

  async updateCurrent(
    scope,
    update,
    transaction = null
  ) {
    return this.primary
      .updateCurrent(
        scope,
        update,
        transaction
      );
  }

  async getHistory(
    scope,
    limit = 100,
    transaction = null
  ) {
    if (
      transaction ||
      !hasScope(
        scope
      )
    ) {
      return this.primary
        .getHistory(
          scope,
          limit,
          transaction
        );
    }

    return this
      .shadowReadService
      .read({
        scope,

        /*
         * Transition history has its own verification domain.
         */
        domain:
          "incidentLifecycleTransitions",

        operation:
          "getHistory",

        identity:
          scope.incidentId ||
          null,

        primaryRead:
          () =>
            this.primary
              .getHistory(
                scope,
                limit,
                null
              ),

        shadowRead:
          () =>
            this.shadow
              .getHistory(
                scope,
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
        `ShadowIncidentLifecycleRepository requires ${type}Repository`
      ),
      {
        code:
          "SHADOW_INCIDENT_LIFECYCLE_REPOSITORY_REQUIRED",
      }
    );
  }

  return repository;
}

module.exports =
  ShadowIncidentLifecycleRepository;