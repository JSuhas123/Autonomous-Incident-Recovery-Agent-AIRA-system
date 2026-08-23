"use strict";

const SignalRepository =
  require(
    "../repositories/SignalRepository"
  );

const MigrationShadowReadService =
  require(
    "./MigrationShadowReadService"
  );

class ShadowSignalRepository
  extends SignalRepository {
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

  async findByDatabaseId(
    context,
    id,
    transaction = null
  ) {
    if (
      transaction ||
      !hasScope(
        context
      )
    ) {
      return this.primary
        .findByDatabaseId(
          context,
          id,
          transaction
        );
    }

    return this
      .shadowReadService
      .read({
        scope:
          context,

        domain:
          "signals",

        operation:
          "findByDatabaseId",

        identity:
          id,

        primaryRead:
          () =>
            this.primary
              .findByDatabaseId(
                context,
                id,
                null
              ),

        shadowRead:
          () =>
            this.shadow
              .findByDatabaseId(
                context,
                id,
                null
              ),
      });
  }

  async findLatestDuplicate(
    ...args
  ) {
    /*
     * Keep specialized correlation/dedup lookup Mongo-only for now.
     */
    return this.primary
      .findLatestDuplicate(
        ...args
      );
  }

  async updateOne(
    ...args
  ) {
    return this.primary
      .updateOne(
        ...args
      );
  }

  async save(
    ...args
  ) {
    return this.primary
      .save(
        ...args
      );
  }

  async list(
    context,
    query = {},
    transaction = null
  ) {
    if (
      transaction ||
      !hasScope(
        context
      )
    ) {
      return this.primary
        .list(
          context,
          query,
          transaction
        );
    }

    return this
      .shadowReadService
      .read({
        scope:
          context,

        domain:
          "signals",

        operation:
          "list",

        primaryRead:
          () =>
            this.primary
              .list(
                context,
                query,
                null
              ),

        shadowRead:
          () =>
            this.shadow
              .list(
                context,
                query,
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
        `ShadowSignalRepository requires ${type}Repository`
      ),
      {
        code:
          "SHADOW_SIGNAL_REPOSITORY_REQUIRED",
      }
    );
  }

  return repository;
}

module.exports =
  ShadowSignalRepository;