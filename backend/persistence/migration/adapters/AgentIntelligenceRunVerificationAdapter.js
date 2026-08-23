"use strict";

const AgentIntelligenceRunModule =
  require(
    "../../../models/AgentIntelligenceRun"
  );

const PostgresAgentIntelligenceRunRepository =
  require(
    "../../postgres/PostgresAgentIntelligenceRunRepository"
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

  throw Object.assign(
    new Error(
      "Unable to resolve AgentIntelligenceRun Mongo model"
    ),
    {
      code:
        "MIGRATION_AGENT_RUN_MODEL_RESOLUTION_FAILED",
    }
  );
}

class AgentIntelligenceRunVerificationAdapter {
  constructor(
    options = {}
  ) {
    this.Model =
      options.Model ||
      resolveModel(
        AgentIntelligenceRunModule
      );

    this.repository =
      options.repository ||
      new PostgresAgentIntelligenceRunRepository();

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
                FROM agents.intelligence_runs
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
      ?.runId
      ? String(
          source.runId
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
                FROM agents.intelligence_runs
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

      runId:
        row.public_id,

      status:
        row.status,

      phase:
        row.phase,

      diagnosisId:
        document.diagnosisId ||
        null,

      startedAt:
        row.started_at,

      completedAt:
        row.completed_at,

      failedAt:
        row.failed_at,

      durationMs:
        row.duration_ms,

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
    return target
      ?.runId
      ? String(
          target.runId
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
          "Agent intelligence verification requires organization/environment scope"
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
  AgentIntelligenceRunVerificationAdapter;