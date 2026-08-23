"use strict";

const IncidentDiagnosisModule =
  require(
    "../../../models/IncidentDiagnosis"
  );

const PostgresIncidentDiagnosisRepository =
  require(
    "../../postgres/PostgresIncidentDiagnosisRepository"
  );

const BackfillDocumentNormalizer =
  require(
    "../BackfillDocumentNormalizer"
  );

function resolveModel(
  moduleValue
) {
  if (
    typeof moduleValue ===
    "function"
  ) {
    return moduleValue;
  }

  const candidate =
    Object.values(
      moduleValue ||
      {}
    )
      .find(
        (
          value
        ) =>
          typeof value ===
            "function" &&
          value.modelName
      );

  if (
    candidate
  ) {
    return candidate;
  }

  throw new Error(
    "Unable to resolve IncidentDiagnosis Mongo model"
  );
}

class IncidentDiagnosisVerificationAdapter {
  constructor(
    options = {}
  ) {
    this.Model =
      options.Model ||
      resolveModel(
        IncidentDiagnosisModule
      );

    this.repository =
      options.repository ||
      new PostgresIncidentDiagnosisRepository();

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
                FROM incidents.diagnoses
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
    if (
      source?.diagnosisId
    ) {
      return String(
        source.diagnosisId
      );
    }

    return source?._id
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
                SELECT *
                FROM incidents.diagnoses
                WHERE organization_id = $1
                  AND environment_id = $2
                  AND (
                    public_id = $3
                    OR database_id = $3
                    OR legacy_mongo_id = $3
                    OR id::text = $3
                  )
                LIMIT 1
              `,
              [
                resolved.organizationUuid,
                resolved.environmentUuid,
                String(
                  logicalId
                ),
              ]
            );

          if (
            result.rows.length ===
            0
          ) {
            return null;
          }

          return this.mapRow(
            result.rows[0]
          );
        }
      );
  }

  mapRow(
    row
  ) {
    const document = {
      ...(
        row.document ||
        {}
      ),
    };

    return {
      ...document,

      _id:
        row.database_id ||
        row.legacy_mongo_id ||
        row.id,

      diagnosisId:
        row.public_id,

      revision:
        row.revision,

      isCurrent:
        row.is_current,

      status:
        row.status,

      outcome:
        row.outcome,

      title:
        row.title,

      summary:
        row.summary,

      probableRootCause:
        row.probable_root_cause,

      rootCauseCategory:
        row.root_cause_category,

      metadata:
        row.metadata ||
        {},

      executionAuthorized:
        false,
    };
  }

  getTargetIdentity(
    target
  ) {
    return (
      target?.diagnosisId ||
      target?._id ||
      null
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

    delete normalized.organizationId;
    delete normalized.environmentId;
    delete normalized.tenantId;
    delete normalized.legacyMongoId;

    normalized.executionAuthorized =
      false;

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

    delete normalized.organizationId;
    delete normalized.environmentId;
    delete normalized.tenantId;
    delete normalized.legacyMongoId;

    normalized.executionAuthorized =
      false;

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
          "IncidentDiagnosis verification requires organization/environment scope"
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
  IncidentDiagnosisVerificationAdapter;