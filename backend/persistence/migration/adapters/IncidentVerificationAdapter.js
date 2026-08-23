"use strict";

const IncidentModule =
  require(
    "../../../models/Incident"
  );

const PostgresIncidentRepository =
  require(
    "../../postgres/PostgresIncidentRepository"
  );

const BackfillDocumentNormalizer =
  require(
    "../BackfillDocumentNormalizer"
  );

function resolveModel(
  moduleValue
) {
  if (
    moduleValue?.Incident
  ) {
    return moduleValue
      .Incident;
  }

  if (
    typeof moduleValue ===
    "function"
  ) {
    return moduleValue;
  }

  throw Object.assign(
    new Error(
      "Unable to resolve Incident Mongo model"
    ),
    {
      code:
        "MIGRATION_INCIDENT_MODEL_RESOLUTION_FAILED",
    }
  );
}

class IncidentVerificationAdapter {
  constructor(
    options = {}
  ) {
    this.Incident =
      options.Incident ||
      resolveModel(
        IncidentModule
      );

    this.repository =
      options.repository ||
      new PostgresIncidentRepository();

    this.normalizer =
      options.normalizer ||
      new BackfillDocumentNormalizer();

    this.ignoredFields = [
      "_id",
      "__v",
      "id",
      "databaseId",
      "legacyMongoId",

      "organizationId",
      "environmentId",

      "createdAt",
      "updatedAt",
      "created_at",
      "updated_at",
    ];
  }

  async countSource(
    scope
  ) {
    return this.Incident
      .countDocuments(
        this.buildMongoScope(
          scope
        )
      );
  }

  async countTarget(
    scope
  ) {
    const rows =
      await this.repository
        .findMany({
          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,
        });

    return rows.length;
  }

  async readSource({
    scope,
    limit = null,
  } = {}) {
    let query =
      this.Incident
        .find(
          this.buildMongoScope(
            scope
          )
        )
        .sort({
          _id:
            1,
        })
        .lean();

    if (
      Number.isInteger(
        limit
      ) &&
      limit >
        0
    ) {
      query =
        query.limit(
          limit
        );
    }

    const rows =
      await query;

    return rows.map(
      (
        row
      ) =>
        this.normalizer
          .normalize(
            row
          )
    );
  }

  getSourceIdentity(
    source
  ) {
    if (
      !source?._id
    ) {
      return null;
    }

    return String(
      source._id
    );
  }

  async findTarget(
    scope,
    logicalId
  ) {
    return this.repository
      .findOne({
        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        _id:
          logicalId,
      });
  }

  getTargetIdentity(
    target
  ) {
    if (
      !target?._id
    ) {
      return null;
    }

    return String(
      target._id
    );
  }

  canonicalizeSource(
    source
  ) {
    const normalized =
      this.normalizer
        .normalize(
          source
        );

    /*
     * PostgreSQL deliberately rewrites ownership identifiers into
     * canonical PostgreSQL-resolvable public IDs.
     *
     * Ownership is verified independently by the repository scope/RLS,
     * therefore those identifiers are excluded from content parity.
     */
    delete normalized
      .organizationId;

    delete normalized
      .environmentId;

    delete normalized
      .legacyMongoId;

    return normalized;
  }

  canonicalizeTarget(
    target
  ) {
    const normalized =
      this.normalizer
        .normalize(
          target
        );

    delete normalized
      .organizationId;

    delete normalized
      .environmentId;

    delete normalized
      .legacyMongoId;

    return normalized;
  }

  buildMongoScope(
    scope = {}
  ) {
    if (
      !scope.organizationId ||
      !scope.environmentId
    ) {
      throw Object.assign(
        new Error(
          "Incident verification requires Mongo organization/environment scope"
        ),
        {
          code:
            "MIGRATION_VERIFICATION_SCOPE_REQUIRED",
        }
      );
    }

    return {
      organizationId:
        scope.organizationId,

      environmentId:
        scope.environmentId,
    };
  }
}

module.exports =
  IncidentVerificationAdapter;