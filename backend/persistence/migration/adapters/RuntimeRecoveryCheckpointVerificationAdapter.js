"use strict";

const RuntimeRecoveryCheckpointModule =
  require(
    "../../../models/RuntimeRecoveryCheckpoint"
  );

const PostgresRuntimeRecoveryCheckpointRepository =
  require(
    "../../postgres/PostgresRuntimeRecoveryCheckpointRepository"
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
      "Unable to resolve RuntimeRecoveryCheckpoint Mongo model"
    ),
    {
      code:
        "MIGRATION_RUNTIME_CHECKPOINT_MODEL_RESOLUTION_FAILED",
    }
  );
}

class RuntimeRecoveryCheckpointVerificationAdapter {
  constructor(
    options = {}
  ) {
    this.Model =
      options.Model ||
      resolveModel(
        RuntimeRecoveryCheckpointModule
      );

    this.repository =
      options.repository ||
      new PostgresRuntimeRecoveryCheckpointRepository();

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

      "executionAuthorized",
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
                FROM workflow.runtime_recovery_checkpoints
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
                FROM workflow.runtime_recovery_checkpoints
                WHERE organization_id = $1
                  AND environment_id = $2
                  AND (
                    database_id = $3
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
        row.id,

      operationKey:
        row.operation_key,

      stage:
        row.stage,

      status:
        row.status,

      workflowIdentity:
        row.workflow_identity ||
        {},

      owner: {
        workerId:
          row.owner_worker_id,

        claimToken:
          row.owner_claim_token,

        claimedAt:
          row.owner_claimed_at,

        heartbeatAt:
          row.owner_heartbeat_at,

        leaseExpiresAt:
          row.owner_lease_expires_at,
      },

      attempt:
        row.attempt,

      interruption: {
        interrupted:
          row.interrupted,

        reason:
          row.interruption_reason,

        detectedAt:
          row.interruption_detected_at,
      },

      resumeSafety:
        row.resume_safety,

      result:
        row.result,

      error: {
        code:
          row.error_code,

        message:
          row.error_message,

        retryable:
          row.error_retryable,
      },

      startedAt:
        row.started_at,

      completedAt:
        row.completed_at,

      lastTransitionAt:
        row.last_transition_at,

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
      ?._id
      ? String(
          target._id
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

    /*
     * PostgreSQL enforces this independently.
     */
    delete normalized.executionAuthorized;

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
          "RuntimeRecoveryCheckpoint verification requires organization/environment scope"
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
  RuntimeRecoveryCheckpointVerificationAdapter;