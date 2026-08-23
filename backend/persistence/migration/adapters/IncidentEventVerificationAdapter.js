"use strict";

const IncidentEvent =
  require(
    "../../../models/IncidentEvent"
  );

const PostgresIncidentEventRepository =
  require(
    "../../postgres/PostgresIncidentEventRepository"
  );

const BackfillDocumentNormalizer =
  require(
    "../BackfillDocumentNormalizer"
  );

class IncidentEventVerificationAdapter {
  constructor(
    options = {}
  ) {
    this.IncidentEvent =
      options.IncidentEvent ||
      IncidentEvent;

    this.repository =
      options.repository ||
      new PostgresIncidentEventRepository();

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
    return this.IncidentEvent
      .countDocuments(
        this.buildMongoScope(
          scope
        )
      );
  }

  async countTarget(
    scope
  ) {
    /*
     * IncidentEvent repository has no generic list-all method.
     *
     * For verification we use the scoped PostgreSQL repository
     * execution boundary and count inside the same RLS scope.
     */
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
                FROM incidents.incident_events
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
      this.IncidentEvent
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
      ?.eventId
      ? String(
          source.eventId
        )
      : null;
  }

  async findTarget(
    scope,
    logicalId
  ) {
    return this.repository
      .findByEventId(
        scope,
        logicalId
      );
  }

  getTargetIdentity(
    target
  ) {
    return target
      ?.eventId
      ? String(
          target.eventId
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
          "IncidentEvent verification requires organization/environment scope"
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
  IncidentEventVerificationAdapter;