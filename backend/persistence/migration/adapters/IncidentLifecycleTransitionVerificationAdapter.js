"use strict";

const IncidentLifecycleTransition =
  require(
    "../../../models/IncidentLifecycleTransition"
  );

const PostgresIncidentLifecycleRepository =
  require(
    "../../postgres/PostgresIncidentLifecycleRepository"
  );

const BackfillDocumentNormalizer =
  require(
    "../BackfillDocumentNormalizer"
  );

class IncidentLifecycleTransitionVerificationAdapter {
  constructor(
    options = {}
  ) {
    this.Model =
      options.Model ||
      IncidentLifecycleTransition;

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
                FROM incidents.incident_lifecycle_transitions
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
      ?.transitionId
      ? String(
          source.transitionId
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
                FROM incidents.incident_lifecycle_transitions
                WHERE organization_id = $1
                  AND environment_id = $2
                  AND public_id = $3
                LIMIT 1
              `,
              [
                resolved.organizationUuid,
                resolved.environmentUuid,
                logicalId,
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

  getTargetIdentity(
    target
  ) {
    return target
      ?.transitionId
      ? String(
          target.transitionId
        )
      : null;
  }

  mapRow(
    row
  ) {
    return {
      transitionId:
        row.public_id,

      revision:
        row.revision,

      fromState:
        row.from_state,

      toState:
        row.to_state,

      reason:
        row.reason,

      actor:
        row.actor,

      source:
        row.source,

      verificationId:
        row.verification_id,

      recoveryDecisionId:
        row.recovery_decision_id,

      executionRequestId:
        row.execution_request_id,

      retryRequestId:
        row.retry_request_id,

      rollbackRequestId:
        row.rollback_request_id,

      escalationId:
        row.escalation_id,

      metadata:
        row.metadata,

      transitionedAt:
        row.transitioned_at,
    };
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
      .incidentId;

    delete normalized
      .legacyMongoId;

    return normalized;
  }

  canonicalizeTarget(
    target
  ) {
    return this.normalizer
      .normalize(
        target
      );
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
          "IncidentLifecycleTransition verification requires organization/environment scope"
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
  IncidentLifecycleTransitionVerificationAdapter;