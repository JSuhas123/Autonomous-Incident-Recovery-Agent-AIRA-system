"use strict";

const DecisionTrace =
  require(
    "../../../models/DecisionTrace"
  );

const PostgresDecisionTraceRepository =
  require(
    "../../postgres/PostgresDecisionTraceRepository"
  );

const BackfillDocumentNormalizer =
  require(
    "../BackfillDocumentNormalizer"
  );

class DecisionTraceVerificationAdapter {
  constructor(
    options = {}
  ) {
    this.Model =
      options.Model ||
      DecisionTrace;

    this.repository =
      options.repository ||
      new PostgresDecisionTraceRepository();

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
                FROM audit.decision_traces
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
      ?.decisionId
      ? String(
          source.decisionId
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
                FROM audit.decision_traces
                WHERE organization_id = $1
                  AND environment_id = $2
                  AND public_id = $3
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

      decisionId:
        row.public_id,

      tenantId:
        row.tenant_public_id,

      correlationId:
        row.correlation_id,

      inputs:
        row.inputs ||
        {},

      reasoning:
        row.reasoning ||
        {},

      rulesTriggered:
        row.rules_triggered ||
        [],

      alternatives:
        row.alternatives ||
        [],

      decision:
        row.decision,

      recommendedAction:
        row.recommended_action,

      tier:
        row.tier,

      actionRisk:
        row.action_risk,

      policyCheck:
        row.policy_check ||
        {},

      actionResult:
        row.action_result ||
        {},

      memoryUpdate:
        row.memory_update ||
        {},

      auditTrail:
        row.audit_trail ||
        [],
    };
  }

  getTargetIdentity(
    target
  ) {
    return target
      ?.decisionId
      ? String(
          target.decisionId
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
          "DecisionTrace verification requires organization/environment scope"
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
  DecisionTraceVerificationAdapter;