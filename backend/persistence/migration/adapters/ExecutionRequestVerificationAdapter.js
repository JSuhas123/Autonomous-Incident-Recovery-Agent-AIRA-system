"use strict";

const ExecutionRequestModule =
  require(
    "../../../models/ExecutionRequest"
  );

const PostgresExecutionAuthorizationRepository =
  require(
    "../../postgres/PostgresExecutionAuthorizationRepository"
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
      "Unable to resolve ExecutionRequest Mongo model"
    ),
    {
      code:
        "MIGRATION_EXECUTION_REQUEST_MODEL_RESOLUTION_FAILED",
    }
  );
}

class ExecutionRequestVerificationAdapter {
  constructor(
    options = {}
  ) {
    this.Model =
      options.Model ||
      resolveModel(
        ExecutionRequestModule
      );

    this.repository =
      options.repository ||
      new PostgresExecutionAuthorizationRepository();

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
                FROM execution.execution_requests
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
      ?.executionRequestId
      ? String(
          source.executionRequestId
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
                FROM execution.execution_requests
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

      executionRequestId:
        row.public_id,

      recoveryDecisionRevision:
        row.recovery_decision_revision,

      candidateId:
        row.candidate_id,

      playbookId:
        row.playbook_id,

      state:
        row.state,

      planId:
        row.plan_id,

      planHash:
        row.plan_hash,

      executionPlan:
        row.execution_plan ||
        {},

      idempotencyKey:
        row.idempotency_key,

      lockKey:
        row.lock_key,

      leaseOwnerId:
        row.lease_owner_id,

      attempt:
        row.attempt,

      maxAttempts:
        row.max_attempts,

      requestedAt:
        row.requested_at,

      queuedAt:
        row.queued_at,

      startedAt:
        row.started_at,

      completedAt:
        row.completed_at,

      cancelledAt:
        row.cancelled_at,

      failure:
        row.failure,

      result:
        row.result,

      rollback:
        row.rollback,

      metadata:
        row.metadata ||
        {},
    };
  }

  getTargetIdentity(
    target
  ) {
    return target
      ?.executionRequestId
      ? String(
          target.executionRequestId
        )
      : null;
  }

  canonicalizeSource(
    source
  ) {
    return this
      .prepareCanonical(
        source
      );
  }

  canonicalizeTarget(
    target
  ) {
    return this
      .prepareCanonical(
        target
      );
  }

  prepareCanonical(
    value
  ) {
    const normalized =
      this.normalizer
        .normalize(
          value
        );

    delete normalized.organizationId;
    delete normalized.environmentId;
    delete normalized.tenantId;
    delete normalized.legacyMongoId;

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
          "ExecutionRequest verification requires organization/environment scope"
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
  ExecutionRequestVerificationAdapter;