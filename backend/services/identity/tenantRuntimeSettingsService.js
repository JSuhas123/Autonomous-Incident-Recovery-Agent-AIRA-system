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
    "./identityAuditService"
  );


const AUTONOMY_MODES =
  Object.freeze({
    OBSERVE_ONLY:
      "observe_only",

    RECOMMEND_ONLY:
      "recommend_only",

    APPROVAL_REQUIRED:
      "approval_required",

    AUTONOMOUS:
      "autonomous",
  });


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


async function getOrganizationSettings(
  organizationId
) {
  const result =
    await getPostgresPool()
      .query(
        `
          INSERT INTO tenancy.organization_runtime_settings (
            organization_id
          )
          VALUES ($1)

          ON CONFLICT (organization_id)
          DO UPDATE SET
            organization_id =
              EXCLUDED.organization_id

          RETURNING *
        `,
        [
          organizationId,
        ]
      );

  return result.rows[0];
}


function validateOrganizationSettings(
  input
) {
  if (
    input.autonomyMode !==
      undefined &&
    !Object.values(
      AUTONOMY_MODES
    ).includes(
      input.autonomyMode
    )
  ) {
    throw createError(
      "Invalid autonomy mode",
      422,
      "AUTONOMY_MODE_INVALID"
    );
  }

  if (
    input.minimumConfidenceForAutonomy !==
      undefined
  ) {
    const value =
      Number(
        input
          .minimumConfidenceForAutonomy
      );

    if (
      !Number.isFinite(
        value
      ) ||
      value < 0 ||
      value > 1
    ) {
      throw createError(
        "Autonomy confidence must be between 0 and 1",
        422,
        "AUTONOMY_CONFIDENCE_INVALID"
      );
    }
  }

  /**
   * Production autonomy is a separate explicit switch.
   *
   * Setting general AUTONOMOUS mode does not automatically authorize
   * production execution.
   */
  if (
    input.allowProductionAutonomy ===
      true &&
    input.allowAutonomousRecovery ===
      false
  ) {
    throw createError(
      "Production autonomy requires autonomous recovery to be enabled",
      422,
      "PRODUCTION_AUTONOMY_DEPENDENCY_INVALID"
    );
  }
}


async function updateOrganizationSettings({
  organizationId,
  actorUserId,
  updates,
}) {
  validateOrganizationSettings(
    updates
  );

  await getOrganizationSettings(
    organizationId
  );

  const map = {
    autonomyMode:
      "autonomy_mode",

    allowAutonomousRecovery:
      "allow_autonomous_recovery",

    allowProductionAutonomy:
      "allow_production_autonomy",

    requireApprovalForDestructiveActions:
      "require_approval_for_destructive_actions",

    requireApprovalForProduction:
      "require_approval_for_production",

    minimumConfidenceForAutonomy:
      "minimum_confidence_for_autonomy",

    maximumActionsPerIncident:
      "maximum_actions_per_incident",

    maximumConcurrentExecutions:
      "maximum_concurrent_executions",

    executionTimeoutSeconds:
      "execution_timeout_seconds",

    verificationRequired:
      "verification_required",

    rollbackRequiredWhenAvailable:
      "rollback_required_when_available",

    freezeOnRepeatedFailure:
      "freeze_on_repeated_failure",

    repeatedFailureThreshold:
      "repeated_failure_threshold",
  };

  const fields =
    [];

  const values = [
    organizationId,
  ];

  let parameter =
    2;

  for (
    const [
      key,
      column,
    ]
    of Object.entries(
      map
    )
  ) {
    if (
      updates[key] !==
        undefined
    ) {
      fields.push(
        `${column} = $${parameter++}`
      );

      values.push(
        updates[key]
      );
    }
  }

  const jsonMap = {
    notificationDefaults:
      "notification_defaults",

    executionRestrictions:
      "execution_restrictions",

    metadata:
      "metadata",
  };

  for (
    const [
      key,
      column,
    ]
    of Object.entries(
      jsonMap
    )
  ) {
    if (
      updates[key] !==
        undefined
    ) {
      fields.push(
        `${column} = $${parameter++}::jsonb`
      );

      values.push(
        JSON.stringify(
          updates[key] ||
          {}
        )
      );
    }
  }

  if (
    fields.length ===
    0
  ) {
    return getOrganizationSettings(
      organizationId
    );
  }

  fields.push(
    `updated_by_user_id = $${parameter++}`
  );

  values.push(
    actorUserId
  );

  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE
            tenancy.organization_runtime_settings
          SET
            ${fields.join(
              ", "
            )}
          WHERE
            organization_id = $1
          RETURNING *
        `,
        values
      );

  await auditRecord(
    "tenant_runtime_settings_updated",
    "success",
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        changedFields:
          Object.keys(
            updates
          ),
      },
    }
  ).catch(
    () => {}
  );

  return result.rows[0];
}


async function getEnvironmentSettings({
  organizationId,
  environmentId,
}) {
  const result =
    await getPostgresPool()
      .query(
        `
          SELECT *
          FROM tenancy.environment_runtime_settings
          WHERE
            organization_id = $1
            AND environment_id = $2
          LIMIT 1
        `,
        [
          organizationId,
          environmentId,
        ]
      );

  return result.rows[0] ||
    null;
}


async function updateEnvironmentSettings({
  organizationId,
  environmentId,
  actorUserId,
  updates,
}) {
  const environment =
    await getPostgresPool()
      .query(
        `
          SELECT
            id,
            type
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
    !environment.rows[0]
  ) {
    throw createError(
      "Environment not found",
      404,
      "ENVIRONMENT_NOT_FOUND"
    );
  }

  /**
   * Controlled production autonomy:
   *
   * Environment override cannot independently bypass the tenant-level
   * production-autonomy switch.
   */
  if (
    environment.rows[0]
      .type ===
      "production" &&
    (
      updates.autonomyMode ===
        AUTONOMY_MODES
          .AUTONOMOUS ||
      updates.allowAutonomousRecovery ===
        true
    )
  ) {
    const organizationSettings =
      await getOrganizationSettings(
        organizationId
      );

    if (
      !organizationSettings
        .allow_production_autonomy
    ) {
      throw createError(
        "Production autonomy is disabled by organization policy",
        403,
        "PRODUCTION_AUTONOMY_NOT_AUTHORIZED"
      );
    }
  }

  await getPostgresPool()
    .query(
      `
        INSERT INTO tenancy.environment_runtime_settings (
          organization_id,
          environment_id,
          updated_by_user_id
        )
        VALUES (
          $1,
          $2,
          $3
        )

        ON CONFLICT (environment_id)
        DO NOTHING
      `,
      [
        organizationId,
        environmentId,
        actorUserId,
      ]
    );

  const map = {
    autonomyMode:
      "autonomy_mode",

    allowAutonomousRecovery:
      "allow_autonomous_recovery",

    requireApprovalForDestructiveActions:
      "require_approval_for_destructive_actions",

    minimumConfidenceForAutonomy:
      "minimum_confidence_for_autonomy",

    maximumActionsPerIncident:
      "maximum_actions_per_incident",

    maximumConcurrentExecutions:
      "maximum_concurrent_executions",

    executionTimeoutSeconds:
      "execution_timeout_seconds",

    verificationRequired:
      "verification_required",

    rollbackRequiredWhenAvailable:
      "rollback_required_when_available",

    freezeOnRepeatedFailure:
      "freeze_on_repeated_failure",

    repeatedFailureThreshold:
      "repeated_failure_threshold",
  };

  const fields = [];
  const values = [
    organizationId,
    environmentId,
  ];

  let parameter =
    3;

  for (
    const [
      key,
      column,
    ]
    of Object.entries(
      map
    )
  ) {
    if (
      updates[key] !==
        undefined
    ) {
      fields.push(
        `${column} = $${parameter++}`
      );

      values.push(
        updates[key]
      );
    }
  }

  const jsonMap = {
    notificationOverrides:
      "notification_overrides",

    executionRestrictionOverrides:
      "execution_restriction_overrides",

    metadata:
      "metadata",
  };

  for (
    const [
      key,
      column,
    ]
    of Object.entries(
      jsonMap
    )
  ) {
    if (
      updates[key] !==
        undefined
    ) {
      fields.push(
        `${column} = $${parameter++}::jsonb`
      );

      values.push(
        JSON.stringify(
          updates[key] ||
          {}
        )
      );
    }
  }

  if (
    fields.length ===
    0
  ) {
    return getEnvironmentSettings({
      organizationId,
      environmentId,
    });
  }

  fields.push(
    `updated_by_user_id = $${parameter++}`
  );

  values.push(
    actorUserId
  );

  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE tenancy.environment_runtime_settings
          SET
            ${fields.join(
              ", "
            )}
          WHERE
            organization_id = $1
            AND environment_id = $2
          RETURNING *
        `,
        values
      );

  return result.rows[0];
}


function overlay(
  base,
  override,
  overrideKey,
  baseKey
) {
  if (
    override &&
    override[overrideKey] !==
      null &&
    override[overrideKey] !==
      undefined
  ) {
    return override[
      overrideKey
    ];
  }

  return base[
    baseKey
  ];
}


async function getEffectiveSettings({
  organizationId,
  environmentId,
}) {
  const organization =
    await getOrganizationSettings(
      organizationId
    );

  const environment =
    await getEnvironmentSettings({
      organizationId,
      environmentId,
    });

  return {
    organizationId,
    environmentId,

    autonomyMode:
      overlay(
        organization,
        environment,
        "autonomy_mode",
        "autonomy_mode"
      ),

    allowAutonomousRecovery:
      overlay(
        organization,
        environment,
        "allow_autonomous_recovery",
        "allow_autonomous_recovery"
      ),

    allowProductionAutonomy:
      organization
        .allow_production_autonomy,

    requireApprovalForDestructiveActions:
      overlay(
        organization,
        environment,
        "require_approval_for_destructive_actions",
        "require_approval_for_destructive_actions"
      ),

    requireApprovalForProduction:
      organization
        .require_approval_for_production,

    minimumConfidenceForAutonomy:
      Number(
        overlay(
          organization,
          environment,
          "minimum_confidence_for_autonomy",
          "minimum_confidence_for_autonomy"
        )
      ),

    maximumActionsPerIncident:
      overlay(
        organization,
        environment,
        "maximum_actions_per_incident",
        "maximum_actions_per_incident"
      ),

    maximumConcurrentExecutions:
      overlay(
        organization,
        environment,
        "maximum_concurrent_executions",
        "maximum_concurrent_executions"
      ),

    executionTimeoutSeconds:
      overlay(
        organization,
        environment,
        "execution_timeout_seconds",
        "execution_timeout_seconds"
      ),

    verificationRequired:
      overlay(
        organization,
        environment,
        "verification_required",
        "verification_required"
      ),

    rollbackRequiredWhenAvailable:
      overlay(
        organization,
        environment,
        "rollback_required_when_available",
        "rollback_required_when_available"
      ),

    freezeOnRepeatedFailure:
      overlay(
        organization,
        environment,
        "freeze_on_repeated_failure",
        "freeze_on_repeated_failure"
      ),

    repeatedFailureThreshold:
      overlay(
        organization,
        environment,
        "repeated_failure_threshold",
        "repeated_failure_threshold"
      ),

    notification:
      {
        ...(
          organization
            .notification_defaults ||
          {}
        ),

        ...(
          environment
            ?.notification_overrides ||
          {}
        ),
      },

    executionRestrictions:
      {
        ...(
          organization
            .execution_restrictions ||
          {}
        ),

        ...(
          environment
            ?.execution_restriction_overrides ||
          {}
        ),
      },
  };
}


module.exports = {
  AUTONOMY_MODES,

  getOrganizationSettings,

  updateOrganizationSettings,

  getEnvironmentSettings,

  updateEnvironmentSettings,

  getEffectiveSettings,

  validateOrganizationSettings,
};