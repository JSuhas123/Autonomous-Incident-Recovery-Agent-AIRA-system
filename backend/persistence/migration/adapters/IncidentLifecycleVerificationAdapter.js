"use strict";

const IncidentLifecycle =
  require(
    "../../../models/IncidentLifecycle"
  );

const PostgresIncidentLifecycleRepository =
  require(
    "../../postgres/PostgresIncidentLifecycleRepository"
  );

const BackfillDocumentNormalizer =
  require(
    "../BackfillDocumentNormalizer"
  );

class IncidentLifecycleVerificationAdapter {
  constructor(
    options = {}
  ) {
    this.Model =
      options.Model ||
      IncidentLifecycle;

    this.repository =
      options.repository ||
      new PostgresIncidentLifecycleRepository();

    this.normalizer =
      options.normalizer ||
      new BackfillDocumentNormalizer();

    this.ignoredFields = [
      "_id",
      "__v",
      "id",
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
    return this.Model
      .countDocuments(
        this.buildMongoScope(
          scope
        )
      );
  }

  async countTarget(
    scope
  ) {
    return this.repository
      .scope
      .run(
        scope,
        async (
          client,
          resolved
        ) => {
          const result =
            await client.query(
              `
                SELECT COUNT(*)::bigint AS count
                FROM incidents.incident_lifecycle
                WHERE organization_id = $1
                  AND environment_id = $2
              `,
              [
                resolved.organizationUuid,
                resolved.environmentUuid,
              ]
            );

          return Number(
            result.rows[0]
              ?.count ||
            0
          );
        }
      );
  }

  async readSource({
    scope,
    limit = null,
  } = {}) {
    let query =
      this.Model
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
    return source
      ?.incidentId
      ? String(
          source.incidentId
        )
      : null;
  }

  async findTarget(
    scope,
    logicalId
  ) {
    return this.repository
      .findCurrent({
        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        incidentId:
          logicalId,
      });
  }

  getTargetIdentity(
    target
  ) {
    return target
      ?.incidentId
      ? String(
          target.incidentId
        )
      : null;
  }

  canonicalizeSource(
    source
  ) {
    const normalized =
      this.normalizer
        .normalize(
          source
        );

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
          "IncidentLifecycle verification requires organization/environment scope"
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
  IncidentLifecycleVerificationAdapter;