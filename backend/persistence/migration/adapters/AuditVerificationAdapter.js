"use strict";

const AuditEvent =
  require(
    "../../../models/AuditEvent"
  );

const PostgresAuditRepository =
  require(
    "../../postgres/PostgresAuditRepository"
  );

const PostgresIdentityResolver =
  require(
    "../../postgres/PostgresIdentityResolver"
  );

const BackfillDocumentNormalizer =
  require(
    "../BackfillDocumentNormalizer"
  );

class AuditVerificationAdapter {
  constructor(
    options = {}
  ) {
    this.Model =
      options.Model ||
      AuditEvent;

    this.repository =
      options.repository ||
      new PostgresAuditRepository();

    this.identityResolver =
      options.identityResolver ||
      new PostgresIdentityResolver();

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
    this.assertScope(
      scope
    );

    return this.repository
      .tenantContext
      .run(
        scope.tenantId,
        async (
          client
        ) => {
          const resolved =
            await this
              .identityResolver
              .resolveScope(
                client,
                {
                  organizationId:
                    scope.organizationId,

                  environmentId:
                    scope.environmentId,
                }
              );

          const result =
            await client.query(
              `
                SELECT COUNT(*)::bigint AS count
                FROM audit.audit_events
                WHERE tenant_public_id = $1
                  AND organization_id = $2
                  AND environment_id = $3
              `,
              [
                scope.tenantId,

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
          timestamp:
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
    this.assertScope(
      scope
    );

    return this.repository
      .tenantContext
      .run(
        scope.tenantId,
        async (
          client
        ) => {
          const resolved =
            await this
              .identityResolver
              .resolveScope(
                client,
                {
                  organizationId:
                    scope.organizationId,

                  environmentId:
                    scope.environmentId,
                }
              );

          const result =
            await client.query(
              `
                SELECT *
                FROM audit.audit_events
                WHERE tenant_public_id = $1
                  AND organization_id = $2
                  AND environment_id = $3
                  AND public_id = $4
                LIMIT 1
              `,
              [
                scope.tenantId,

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

      eventId:
        row.public_id,

      tenantId:
        row.tenant_public_id,

      chainIndex:
        Number(
          row.chain_index
        ),

      eventType:
        row.event_type,

      principal:
        row.principal,

      principalId:
        row.principal_id,

      userId:
        row.user_id,

      correlationId:
        row.correlation_id,

      ipAddress:
        row.ip_address,

      action:
        row.action,

      serviceId:
        row.service_id,

      actionDetails:
        row.action_details,

      payload:
        row.payload,

      metadata:
        row.metadata,

      signature:
        row.signature,

      previousEventHash:
        row.previous_event_hash,

      eventHash:
        row.event_hash,

      status:
        row.status,

      timestamp:
        row.occurred_at,
    };
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
    this.assertScope(
      scope
    );

    return {
      tenantId:
        scope.tenantId,

      organizationId:
        scope.organizationId,

      environmentId:
        scope.environmentId,
    };
  }

  assertScope(
    scope = {}
  ) {
    if (
      !scope.tenantId ||
      !scope.organizationId ||
      !scope.environmentId
    ) {
      throw Object.assign(
        new Error(
          "Audit verification requires tenant/organization/environment scope"
        ),
        {
          code:
            "MIGRATION_VERIFICATION_SCOPE_REQUIRED",
        }
      );
    }
  }
}

module.exports =
  AuditVerificationAdapter;