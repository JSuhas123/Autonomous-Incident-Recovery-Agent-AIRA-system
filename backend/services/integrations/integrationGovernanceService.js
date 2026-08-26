"use strict";

const {
  getPostgresPool,
} =
  require(
    "../../persistence/postgres/postgresPool"
  );

const {
  record:
    auditRecord,
} =
  require(
    "../identity/identityAuditService"
  );


function createError(
  message,
  status,
  code
) {
  const error =
    new Error(
      message
    );

  error.status =
    status;

  error.code =
    code;

  error.executionAuthorized =
    false;

  return error;
}


async function requireEnvironment({
  organizationId,
  environmentId,
}) {
  const result =
    await getPostgresPool()
      .query(
        `
          SELECT id
          FROM tenancy.environments
          WHERE
            organization_id = $1
            AND id = $2
          LIMIT 1
        `,
        [
          organizationId,
          environmentId,
        ]
      );

  if (
    !result.rows[0]
  ) {
    throw createError(
      "Environment not found",
      404,
      "ENVIRONMENT_NOT_FOUND"
    );
  }

  return result.rows[0];
}


async function getGovernance({
  organizationId,
  environmentId,
  integrationId,
}) {
  await requireEnvironment({
    organizationId,
    environmentId,
  });

  const result =
    await getPostgresPool()
      .query(
        `
          SELECT *
          FROM integrations.connection_governance
          WHERE
            organization_id = $1
            AND environment_id = $2
            AND integration_id = $3
          LIMIT 1
        `,
        [
          organizationId,
          environmentId,
          String(
            integrationId
          ),
        ]
      );

  return result.rows[0] ||
    null;
}


async function upsertGovernance({
  organizationId,
  environmentId,
  integrationId,
  provider =
    null,
  actorUserId,
  settings =
    {},
}) {
  await requireEnvironment({
    organizationId,
    environmentId,
  });

  const result =
    await getPostgresPool()
      .query(
        `
          INSERT INTO integrations.connection_governance (
            organization_id,
            environment_id,
            integration_id,
            provider,
            enabled,
            allow_ingestion,
            allow_queries,
            allow_resource_discovery,
            allow_execution,
            credential_access_mode,
            credential_rotation_required,
            credential_rotation_days,
            allowed_capabilities,
            denied_capabilities,
            rate_limits,
            metadata,
            created_by_user_id,
            updated_by_user_id
          )
          VALUES (
            $1,$2,$3,$4,
            COALESCE($5, TRUE),
            COALESCE($6, TRUE),
            COALESCE($7, TRUE),
            COALESCE($8, TRUE),
            COALESCE($9, FALSE),
            COALESCE($10, 'managed_only'),
            COALESCE($11, TRUE),
            COALESCE($12, 90),
            COALESCE($13::jsonb, '[]'::jsonb),
            COALESCE($14::jsonb, '[]'::jsonb),
            COALESCE($15::jsonb, '{}'::jsonb),
            COALESCE($16::jsonb, '{}'::jsonb),
            $17,
            $17
          )

          ON CONFLICT (
            organization_id,
            environment_id,
            integration_id
          )
          DO UPDATE SET
            provider =
              COALESCE(
                EXCLUDED.provider,
                integrations.connection_governance.provider
              ),

            enabled =
              COALESCE(
                $5,
                integrations.connection_governance.enabled
              ),

            allow_ingestion =
              COALESCE(
                $6,
                integrations.connection_governance.allow_ingestion
              ),

            allow_queries =
              COALESCE(
                $7,
                integrations.connection_governance.allow_queries
              ),

            allow_resource_discovery =
              COALESCE(
                $8,
                integrations.connection_governance.allow_resource_discovery
              ),

            allow_execution =
              COALESCE(
                $9,
                integrations.connection_governance.allow_execution
              ),

            credential_access_mode =
              COALESCE(
                $10,
                integrations.connection_governance.credential_access_mode
              ),

            credential_rotation_required =
              COALESCE(
                $11,
                integrations.connection_governance.credential_rotation_required
              ),

            credential_rotation_days =
              COALESCE(
                $12,
                integrations.connection_governance.credential_rotation_days
              ),

            allowed_capabilities =
              COALESCE(
                $13::jsonb,
                integrations.connection_governance.allowed_capabilities
              ),

            denied_capabilities =
              COALESCE(
                $14::jsonb,
                integrations.connection_governance.denied_capabilities
              ),

            rate_limits =
              COALESCE(
                $15::jsonb,
                integrations.connection_governance.rate_limits
              ),

            metadata =
              COALESCE(
                $16::jsonb,
                integrations.connection_governance.metadata
              ),

            updated_by_user_id =
              $17

          RETURNING *
        `,
        [
          organizationId,
          environmentId,
          String(
            integrationId
          ),
          provider,

          settings.enabled ??
            null,

          settings.allowIngestion ??
            null,

          settings.allowQueries ??
            null,

          settings.allowResourceDiscovery ??
            null,

          settings.allowExecution ??
            null,

          settings.credentialAccessMode ??
            null,

          settings.credentialRotationRequired ??
            null,

          settings.credentialRotationDays ??
            null,

          settings.allowedCapabilities !==
            undefined
            ? JSON.stringify(
                settings.allowedCapabilities
              )
            : null,

          settings.deniedCapabilities !==
            undefined
            ? JSON.stringify(
                settings.deniedCapabilities
              )
            : null,

          settings.rateLimits !==
            undefined
            ? JSON.stringify(
                settings.rateLimits
              )
            : null,

          settings.metadata !==
            undefined
            ? JSON.stringify(
                settings.metadata
              )
            : null,

          actorUserId,
        ]
      );

  await auditRecord(
    "integration_governance_updated",
    "success",
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        environmentId,

        integrationId:
          String(
            integrationId
          ),
      },
    }
  ).catch(
    () => {}
  );

  return result.rows[0];
}


async function assertCapabilityAllowed({
  organizationId,
  environmentId,
  integrationId,
  capability,
}) {
  const governance =
    await getGovernance({
      organizationId,
      environmentId,
      integrationId,
    });

  /**
   * Existing integrations without a governance row remain usable.
   *
   * The default behavior matches their previous semantics.
   */
  if (
    !governance
  ) {
    return true;
  }

  if (
    !governance.enabled
  ) {
    throw createError(
      "Integration is disabled by tenant governance",
      403,
      "INTEGRATION_DISABLED_BY_GOVERNANCE"
    );
  }

  const denied =
    governance
      .denied_capabilities ||
    [];

  if (
    denied.includes(
      capability
    )
  ) {
    throw createError(
      "Integration capability is denied by tenant governance",
      403,
      "INTEGRATION_CAPABILITY_DENIED"
    );
  }

  const allowed =
    governance
      .allowed_capabilities ||
    [];

  if (
    allowed.length >
      0 &&
    !allowed.includes(
      capability
    )
  ) {
    throw createError(
      "Integration capability is outside tenant allow-list",
      403,
      "INTEGRATION_CAPABILITY_NOT_ALLOWED"
    );
  }

  return true;
}


module.exports = {
  getGovernance,
  upsertGovernance,
  assertCapabilityAllowed,
};