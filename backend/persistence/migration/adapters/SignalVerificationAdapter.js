"use strict";

const SignalModule =
  require(
    "../../../models/Signal"
  );

const PostgresSignalRepository =
  require(
    "../../postgres/PostgresSignalRepository"
  );

const BackfillDocumentNormalizer =
  require(
    "../BackfillDocumentNormalizer"
  );

function resolveSignal(
  moduleValue
) {
  if (
    moduleValue?.Signal
  ) {
    return moduleValue.Signal;
  }

  if (
    typeof moduleValue ===
    "function"
  ) {
    return moduleValue;
  }

  throw Object.assign(
    new Error(
      "Unable to resolve Signal Mongo model"
    ),
    {
      code:
        "MIGRATION_SIGNAL_MODEL_RESOLUTION_FAILED",
    }
  );
}

class SignalVerificationAdapter {
  constructor(
    options = {}
  ) {
    this.Signal =
      options.Signal ||
      resolveSignal(
        SignalModule
      );

    this.repository =
      options.repository ||
      new PostgresSignalRepository();

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
    return this.Signal
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
                FROM signals.signals
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
      this.Signal
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
    /*
     * PostgreSQL SignalRepository stores Mongo _id as
     * database_id / legacy_mongo_id.
     */
    return source
      ?._id
      ? String(
          source._id
        )
      : null;
  }

  async findTarget(
    scope,
    logicalId
  ) {
    return this.repository
      .findByDatabaseId(
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
      ?._id
      ? String(
          target._id
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
          "Signal verification requires organization/environment scope"
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
  SignalVerificationAdapter;