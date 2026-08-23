"use strict";

const IncidentRepository =
  require(
    "../repositories/IncidentRepository"
  );

const MigrationShadowReadService =
  require(
    "./MigrationShadowReadService"
  );

/**
 * Phase 13.5C-3B
 *
 * Mongo remains authoritative.
 *
 * Only safe, deterministic point reads are shadowed in this step.
 *
 * Writes continue exclusively through the primary repository.
 *
 * findMany() is deliberately NOT shadow-compared yet because unordered
 * collection comparisons require a separate deterministic-list strategy.
 */
class ShadowIncidentRepository
  extends IncidentRepository {
  constructor(
    options = {}
  ) {
    super();

    if (
      !options.primaryRepository
    ) {
      throw Object.assign(
        new Error(
          "ShadowIncidentRepository requires primaryRepository"
        ),
        {
          code:
            "SHADOW_INCIDENT_PRIMARY_REQUIRED",
        }
      );
    }

    if (
      !options.shadowRepository
    ) {
      throw Object.assign(
        new Error(
          "ShadowIncidentRepository requires shadowRepository"
        ),
        {
          code:
            "SHADOW_INCIDENT_TARGET_REQUIRED",
        }
      );
    }

    this.primary =
      options.primaryRepository;

    this.shadow =
      options.shadowRepository;

    this.shadowReadService =
      options.shadowReadService ||
      new MigrationShadowReadService();
  }

  async findOne(
    filter = {},
    transaction = null
  ) {
    /*
     * Never compare reads occurring inside a Mongo transaction.
     *
     * Cross-database transactional equivalence is not meaningful and
     * PostgreSQL must not participate in Mongo transactional semantics.
     */
    if (
      transaction
    ) {
      return this.primary
        .findOne(
          filter,
          transaction
        );
    }

    const scope =
      this.extractScope(
        filter
      );

    /*
     * Legacy/unscoped reads remain Mongo-only.
     *
     * PostgreSQL repositories intentionally require full ownership scope.
     */
    if (
      !scope
    ) {
      return this.primary
        .findOne(
          filter,
          transaction
        );
    }

    return this
      .shadowReadService
      .read({
        scope,

        domain:
          "incidents",

        operation:
          "findOne",

        identity:
          extractIdentity(
            filter
          ),

        primaryRead:
          () =>
            this.primary
              .findOne(
                filter,
                transaction
              ),

        shadowRead:
          () =>
            this.shadow
              .findOne(
                filter,
                null
              ),
      });
  }

  async findMany(
    filter = {},
    transaction = null
  ) {
    /*
     * Phase 13.5C-3B:
     *
     * Leave collection reads Mongo-only.
     *
     * 13.5C-3C will introduce deterministic ordered collection comparison.
     */
    return this.primary
      .findMany(
        filter,
        transaction
      );
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

  async save(
    incident,
    transaction = null
  ) {
    return this.primary
      .save(
        incident,
        transaction
      );
  }

  translateDuplicateKey(
    error
  ) {
    if (
      typeof this.primary
        .translateDuplicateKey ===
      "function"
    ) {
      return this.primary
        .translateDuplicateKey(
          error
        );
    }

    return error;
  }

  isDuplicateKeyError(
    error
  ) {
    if (
      typeof this.primary
        .isDuplicateKeyError ===
      "function"
    ) {
      return this.primary
        .isDuplicateKeyError(
          error
        );
    }

    return (
      error?.code ===
      11000
    );
  }

  extractScope(
    value = {}
  ) {
    if (
      !value.organizationId ||
      !value.environmentId
    ) {
      return null;
    }

    return {
      organizationId:
        normalizeId(
          value.organizationId
        ),

      environmentId:
        normalizeId(
          value.environmentId
        ),
    };
  }
}

function extractIdentity(
  filter = {}
) {
  return (
    normalizeId(
      filter._id
    ) ||
    normalizeId(
      filter.incidentId
    ) ||
    filter.fingerprint ||
    filter.sourceEventId ||
    null
  );
}

function normalizeId(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }

  if (
    typeof value.toHexString ===
    "function"
  ) {
    return value
      .toHexString();
  }

  return String(
    value
  );
}

module.exports =
  ShadowIncidentRepository;