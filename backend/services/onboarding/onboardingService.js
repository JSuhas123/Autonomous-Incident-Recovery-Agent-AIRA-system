"use strict";

const {
  getPostgresPool,
} =
  require(
    "../../persistence/postgres"
  );

const {
  record:
    auditRecord,
} =
  require(
    "../identity/identityAuditService"
  );

const {
  AUTH_EVENT_TYPES,
  AUTH_EVENT_OUTCOMES,
} =
  require(
    "../../constants/authEvents"
  );


const ONBOARDING_STATUS =
  Object.freeze({
    IN_PROGRESS:
      "IN_PROGRESS",

    COMPLETED:
      "COMPLETED",

    PAUSED:
      "PAUSED",
  });


const ONBOARDING_STEP_STATUS =
  Object.freeze({
    PENDING:
      "PENDING",

    IN_PROGRESS:
      "IN_PROGRESS",

    COMPLETED:
      "COMPLETED",

    SKIPPED:
      "SKIPPED",
  });


const ONBOARDING_STEPS =
  Object.freeze([
    {
      key:
        "ORGANIZATION_PROFILE",

      required:
        true,
    },

    {
      key:
        "CREATE_ENVIRONMENT",

      required:
        true,
    },

    {
      key:
        "ADD_INTEGRATION",

      required:
        true,
    },

    {
      key:
        "CONFIGURE_AUTONOMY",

      required:
        true,
    },

    {
      key:
        "CONFIGURE_NOTIFICATIONS",

      required:
        false,
    },

    {
      key:
        "INVITE_TEAM",

      required:
        false,
    },

    {
      key:
        "ENTERPRISE_IDENTITY",

      required:
        false,
    },

    {
      key:
        "VERIFY_FIRST_SIGNAL",

      required:
        true,
    },
  ]);


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


function getStepDefinition(
  stepKey
) {
  return ONBOARDING_STEPS
    .find(
      (
        step
      ) =>
        step.key ===
        stepKey
    ) ||
    null;
}


async function ensureOnboarding({
  organizationId,
  actorUserId =
    null,
}) {
  await getPostgresPool()
    .query(
      `
        INSERT INTO onboarding.organization_onboarding (
          organization_id,
          started_by_user_id
        )
        VALUES ($1,$2)

        ON CONFLICT (organization_id)
        DO NOTHING
      `,
      [
        organizationId,
        actorUserId,
      ]
    );

  for (
    const step
    of ONBOARDING_STEPS
  ) {
    await getPostgresPool()
      .query(
        `
          INSERT INTO onboarding.organization_onboarding_steps (
            organization_id,
            step_key,
            required
          )
          VALUES ($1,$2,$3)

          ON CONFLICT (
            organization_id,
            step_key
          )
          DO NOTHING
        `,
        [
          organizationId,
          step.key,
          step.required,
        ]
      );
  }
}


async function calculateProgress(
  organizationId
) {
  const result =
    await getPostgresPool()
      .query(
        `
          SELECT
            step_key,
            required,
            status
          FROM onboarding.organization_onboarding_steps
          WHERE organization_id = $1
        `,
        [
          organizationId,
        ]
      );

  const steps =
    result.rows;

  if (
    steps.length ===
    0
  ) {
    return {
      completionPercent:
        0,

      complete:
        false,

      currentStep:
        ONBOARDING_STEPS[0]
          .key,
    };
  }

  const completed =
    steps.filter(
      (
        step
      ) =>
        step.status ===
          ONBOARDING_STEP_STATUS
            .COMPLETED ||
        step.status ===
          ONBOARDING_STEP_STATUS
            .SKIPPED
    );

  const completionPercent =
    Math.round(
      (
        completed.length /
        steps.length
      ) *
      100
    );

  const incompleteRequired =
    steps.filter(
      (
        step
      ) =>
        step.required &&
        step.status !==
          ONBOARDING_STEP_STATUS
            .COMPLETED
    );

  const nextStep =
    ONBOARDING_STEPS
      .find(
        (
          definition
        ) => {
          const current =
            steps.find(
              (
                step
              ) =>
                step.step_key ===
                definition.key
            );

          return (
            current &&
            ![
              ONBOARDING_STEP_STATUS
                .COMPLETED,

              ONBOARDING_STEP_STATUS
                .SKIPPED,
            ].includes(
              current.status
            )
          );
        }
      );

  return {
    completionPercent,

    complete:
      incompleteRequired.length ===
      0,

    currentStep:
      nextStep
        ?.key ||
      null,
  };
}


async function refreshOnboarding(
  organizationId
) {
  const progress =
    await calculateProgress(
      organizationId
    );

  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE onboarding.organization_onboarding
          SET
            completion_percent = $2,
            current_step =
              COALESCE(
                $3,
                current_step
              ),
            status =
              CASE
                WHEN $4 = TRUE
                  THEN 'COMPLETED'
                ELSE status
              END,
            completed_at =
              CASE
                WHEN $4 = TRUE
                  THEN COALESCE(
                    completed_at,
                    NOW()
                  )
                ELSE completed_at
              END
          WHERE organization_id = $1
          RETURNING *
        `,
        [
          organizationId,

          progress
            .completionPercent,

          progress
            .currentStep,

          progress
            .complete,
        ]
      );

  return {
    onboarding:
      result.rows[0],

    progress,
  };
}


async function getOnboarding({
  organizationId,
  actorUserId =
    null,
}) {
  await ensureOnboarding({
    organizationId,
    actorUserId,
  });

  await refreshOnboarding(
    organizationId
  );

  const onboarding =
    await getPostgresPool()
      .query(
        `
          SELECT *
          FROM onboarding.organization_onboarding
          WHERE organization_id = $1
          LIMIT 1
        `,
        [
          organizationId,
        ]
      );

  const steps =
    await getPostgresPool()
      .query(
        `
          SELECT *
          FROM onboarding.organization_onboarding_steps
          WHERE organization_id = $1
          ORDER BY created_at ASC
        `,
        [
          organizationId,
        ]
      );

  return {
    onboarding:
      onboarding.rows[0],

    steps:
      steps.rows,
  };
}


async function startOnboarding({
  organizationId,
  actorUserId,
}) {
  await ensureOnboarding({
    organizationId,
    actorUserId,
  });

  await auditRecord(
    AUTH_EVENT_TYPES
      .ONBOARDING_STARTED,

    AUTH_EVENT_OUTCOMES
      .SUCCESS,

    {
      userId:
        actorUserId,

      organizationId,
    }
  ).catch(
    () => {}
  );

  return getOnboarding({
    organizationId,
    actorUserId,
  });
}


async function completeStep({
  organizationId,
  stepKey,
  actorUserId,
  metadata =
    {},
}) {
  const definition =
    getStepDefinition(
      stepKey
    );

  if (
    !definition
  ) {
    throw createError(
      "Unknown onboarding step",
      422,
      "ONBOARDING_STEP_INVALID"
    );
  }

  await ensureOnboarding({
    organizationId,
    actorUserId,
  });

  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE onboarding.organization_onboarding_steps
          SET
            status = 'COMPLETED',
            completed_by_user_id = $3,
            completed_at = NOW(),
            skipped_by_user_id = NULL,
            skipped_at = NULL,
            metadata = $4::jsonb
          WHERE
            organization_id = $1
            AND step_key = $2
          RETURNING *
        `,
        [
          organizationId,
          stepKey,
          actorUserId,

          JSON.stringify(
            metadata
          ),
        ]
      );

  await auditRecord(
    AUTH_EVENT_TYPES
      .ONBOARDING_STEP_COMPLETED,

    AUTH_EVENT_OUTCOMES
      .SUCCESS,

    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        stepKey,
      },
    }
  ).catch(
    () => {}
  );

  const refreshed =
    await refreshOnboarding(
      organizationId
    );

  if (
    refreshed
      .progress
      .complete
  ) {
    await auditRecord(
      AUTH_EVENT_TYPES
        .ONBOARDING_COMPLETED,

      AUTH_EVENT_OUTCOMES
        .SUCCESS,

      {
        userId:
          actorUserId,

        organizationId,
      }
    ).catch(
      () => {}
    );
  }

  return {
    step:
      result.rows[0],

    ...refreshed,
  };
}


async function skipStep({
  organizationId,
  stepKey,
  actorUserId,
  reason =
    null,
}) {
  const definition =
    getStepDefinition(
      stepKey
    );

  if (
    !definition
  ) {
    throw createError(
      "Unknown onboarding step",
      422,
      "ONBOARDING_STEP_INVALID"
    );
  }

  if (
    definition.required
  ) {
    throw createError(
      "Required onboarding step cannot be skipped",
      409,
      "ONBOARDING_STEP_REQUIRED"
    );
  }

  await ensureOnboarding({
    organizationId,
    actorUserId,
  });

  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE onboarding.organization_onboarding_steps
          SET
            status = 'SKIPPED',
            skipped_by_user_id = $3,
            skipped_at = NOW(),
            completed_by_user_id = NULL,
            completed_at = NULL,
            metadata =
              jsonb_set(
                COALESCE(
                  metadata,
                  '{}'::jsonb
                ),
                '{skipReason}',
                to_jsonb(
                  $4::text
                ),
                TRUE
              )
          WHERE
            organization_id = $1
            AND step_key = $2
          RETURNING *
        `,
        [
          organizationId,
          stepKey,
          actorUserId,
          reason,
        ]
      );

  await auditRecord(
    AUTH_EVENT_TYPES
      .ONBOARDING_STEP_SKIPPED,

    AUTH_EVENT_OUTCOMES
      .SUCCESS,

    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        stepKey,
        reason,
      },
    }
  ).catch(
    () => {}
  );

  return {
    step:
      result.rows[0],

    ...(
      await refreshOnboarding(
        organizationId
      )
    ),
  };
}


module.exports = {
  ONBOARDING_STATUS,
  ONBOARDING_STEP_STATUS,
  ONBOARDING_STEPS,

  getStepDefinition,

  ensureOnboarding,
  calculateProgress,
  refreshOnboarding,

  getOnboarding,
  startOnboarding,
  completeStep,
  skipStep,
};