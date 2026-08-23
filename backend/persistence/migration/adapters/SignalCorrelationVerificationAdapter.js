"use strict";

const {
  SignalCorrelation,
} =
  require(
    "../../../models/SignalCorrelation"
  );

const PostgresSignalCorrelationRepository =
  require(
    "../../postgres/PostgresSignalCorrelationRepository"
  );

const BackfillDocumentNormalizer =
  require(
    "../BackfillDocumentNormalizer"
  );

class SignalCorrelationVerificationAdapter {
  constructor(
    options = {}
  ) {
    this.Model =
      options.Model ||
      SignalCorrelation;

    this.repository =
      options.repository ||
      new PostgresSignalCorrelationRepository();

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
      "tenantId",

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
                FROM signals.correlation_groups
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
      ?.correlationGroupId
      ? String(
          source
            .correlationGroupId
        )
      : null;
  }

  async findTarget(
    scope,
    logicalId
  ) {
    return this.repository
      .findGroup(
        {
          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,
        },
        logicalId
      );
  }

  getTargetIdentity(
    target
  ) {
    return target
      ?.correlationGroupId
      ? String(
          target
            .correlationGroupId
        )
      : null;
  }

  canonicalizeSource(
    value
  ) {
    return this.prepare(
      value
    );
  }

  canonicalizeTarget(
    value
  ) {
    return this.prepare(
      value
    );
  }

  prepare(
    value
  ) {
    const normalized =
      this.normalizer
        .normalize(
          value
        );

    delete normalized
      .organizationId;

    delete normalized
      .environmentId;

    delete normalized
      .tenantId;

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
          "SignalCorrelation verification requires organization/environment scope"
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
  SignalCorrelationVerificationAdapter;