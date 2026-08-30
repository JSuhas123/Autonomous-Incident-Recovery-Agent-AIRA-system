"use strict";

const PostgresTenantScope =
  require(
    "../../persistence/postgres/PostgresTenantScope"
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
  return Object.assign(
    new Error(
      message
    ),
    {
      status,

      code,

      executionAuthorized:
        false,
    }
  );
}


function createScope(
  options =
    {}
) {
  return (
    options.scope ||
    new PostgresTenantScope(
      options
    )
  );
}


async function getGovernance({
  organizationId,

  environmentId,

  integrationId,

  scope =
    null,
} = {}) {
  requireFields({
    organizationId,

    environmentId,

    integrationId,
  });


  const tenantScope =
    scope ||
    createScope();


  return tenantScope.run(
    {
      organizationId,

      environmentId,
    },

    async (
      client,
      resolved
    ) => {
      const result =
        await client.query(
          `
            SELECT *
            FROM
              integrations.connection_governance
            WHERE
              organization_id = $1
              AND environment_id = $2
              AND integration_id = $3
            LIMIT 1
          `,
          [
            resolved
              .organizationUuid,

            resolved
              .environmentUuid,

            String(
              integrationId
            ),
          ]
        );


      return result.rows[0] ||
        null;
    }
  );
}


async function upsertGovernance({
  organizationId,

  environmentId,

  integrationId,

  provider =
    null,

  actorUserId =
    null,

  settings =
    {},

  scope =
    null,
} = {}) {
  requireFields({
    organizationId,

    environmentId,

    integrationId,
  });


  const tenantScope =
    scope ||
    createScope();


  const governance =
    await tenantScope.run(
      {
        organizationId,

        environmentId,
      },

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO
                integrations.connection_governance (
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
                $1,
                $2,
                $3,

                $4,

                COALESCE(
                  $5,
                  TRUE
                ),

                COALESCE(
                  $6,
                  TRUE
                ),

                COALESCE(
                  $7,
                  TRUE
                ),

                COALESCE(
                  $8,
                  TRUE
                ),

                COALESCE(
                  $9,
                  FALSE
                ),

                COALESCE(
                  $10,
                  'managed_only'
                ),

                COALESCE(
                  $11,
                  TRUE
                ),

                COALESCE(
                  $12,
                  90
                ),

                COALESCE(
                  $13::jsonb,
                  '[]'::jsonb
                ),

                COALESCE(
                  $14::jsonb,
                  '[]'::jsonb
                ),

                COALESCE(
                  $15::jsonb,
                  '{}'::jsonb
                ),

                COALESCE(
                  $16::jsonb,
                  '{}'::jsonb
                ),

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
                    integrations
                      .connection_governance
                      .provider
                  ),

                enabled =
                  COALESCE(
                    $5,
                    integrations
                      .connection_governance
                      .enabled
                  ),

                allow_ingestion =
                  COALESCE(
                    $6,
                    integrations
                      .connection_governance
                      .allow_ingestion
                  ),

                allow_queries =
                  COALESCE(
                    $7,
                    integrations
                      .connection_governance
                      .allow_queries
                  ),

                allow_resource_discovery =
                  COALESCE(
                    $8,
                    integrations
                      .connection_governance
                      .allow_resource_discovery
                  ),

                allow_execution =
                  COALESCE(
                    $9,
                    integrations
                      .connection_governance
                      .allow_execution
                  ),

                credential_access_mode =
                  COALESCE(
                    $10,
                    integrations
                      .connection_governance
                      .credential_access_mode
                  ),

                credential_rotation_required =
                  COALESCE(
                    $11,
                    integrations
                      .connection_governance
                      .credential_rotation_required
                  ),

                credential_rotation_days =
                  COALESCE(
                    $12,
                    integrations
                      .connection_governance
                      .credential_rotation_days
                  ),

                allowed_capabilities =
                  COALESCE(
                    $13::jsonb,
                    integrations
                      .connection_governance
                      .allowed_capabilities
                  ),

                denied_capabilities =
                  COALESCE(
                    $14::jsonb,
                    integrations
                      .connection_governance
                      .denied_capabilities
                  ),

                rate_limits =
                  COALESCE(
                    $15::jsonb,
                    integrations
                      .connection_governance
                      .rate_limits
                  ),

                metadata =
                  COALESCE(
                    $16::jsonb,
                    integrations
                      .connection_governance
                      .metadata
                  ),

                updated_by_user_id =
                  $17

              RETURNING *
            `,
            [
              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              String(
                integrationId
              ),

              provider
                ? String(
                    provider
                  )
                    .trim()
                    .toLowerCase()
                : null,

              nullableBoolean(
                settings.enabled
              ),

              nullableBoolean(
                settings
                  .allowIngestion
              ),

              nullableBoolean(
                settings
                  .allowQueries
              ),

              nullableBoolean(
                settings
                  .allowResourceDiscovery
              ),

              nullableBoolean(
                settings
                  .allowExecution
              ),

              settings
                .credentialAccessMode ??
              null,

              nullableBoolean(
                settings
                  .credentialRotationRequired
              ),

              settings
                .credentialRotationDays ??
              null,

              jsonOrNull(
                settings
                  .allowedCapabilities
              ),

              jsonOrNull(
                settings
                  .deniedCapabilities
              ),

              jsonOrNull(
                settings
                  .rateLimits
              ),

              jsonOrNull(
                settings.metadata
              ),

              actorUserId,
            ]
          );


        return result.rows[0];
      }
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

        executionAuthorized:
          false,
      },
    }
  ).catch(
    () => {}
  );


  return governance;
}


async function assertCapabilityAllowed({
  organizationId,

  environmentId,

  integrationId,

  capability,

  scope =
    null,
} = {}) {
  const governance =
    await getGovernance({
      organizationId,

      environmentId,

      integrationId,

      scope,
    });


  if (
    !governance
  ) {
    return true;
  }


  if (
    governance.enabled !==
    true
  ) {
    throw createError(
      "Integration is disabled by tenant governance",
      403,
      "INTEGRATION_DISABLED_BY_GOVERNANCE"
    );
  }


  const denied =
    Array.isArray(
      governance
        .denied_capabilities
    )
      ? governance
          .denied_capabilities
      : [];


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
    Array.isArray(
      governance
        .allowed_capabilities
    )
      ? governance
          .allowed_capabilities
      : [];


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


function requireFields(
  input
) {
  for (
    const field
    of [
      "organizationId",
      "environmentId",
      "integrationId",
    ]
  ) {
    if (
      !input?.[
        field
      ]
    ) {
      throw createError(
        `${field} is required`,
        400,
        "INTEGRATION_GOVERNANCE_SCOPE_REQUIRED"
      );
    }
  }
}


function nullableBoolean(
  value
) {
  return (
    typeof value ===
    "boolean"
  )
    ? value
    : null;
}


function jsonOrNull(
  value
) {
  return value ===
    undefined
    ? null
    : JSON.stringify(
        value
      );
}


module.exports = {
  getGovernance,

  upsertGovernance,

  assertCapabilityAllowed,
};