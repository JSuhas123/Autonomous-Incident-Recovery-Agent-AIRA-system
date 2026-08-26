"use strict";

const crypto =
  require(
    "node:crypto"
  );

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

const {
  routeNotification,
} =
  require(
    "../notifications/notificationRoutingService"
  );


const HUMAN_TASK_STATUS =
  Object.freeze({
    OPEN:
      "OPEN",

    ASSIGNED:
      "ASSIGNED",

    ACKNOWLEDGED:
      "ACKNOWLEDGED",

    IN_PROGRESS:
      "IN_PROGRESS",

    RESOLVED:
      "RESOLVED",

    CANCELLED:
      "CANCELLED",

    ESCALATED:
      "ESCALATED",
  });


const HUMAN_TASK_PRIORITY =
  Object.freeze({
    CRITICAL:
      "CRITICAL",

    HIGH:
      "HIGH",

    MEDIUM:
      "MEDIUM",

    LOW:
      "LOW",
  });


const HUMAN_TASK_TYPES =
  Object.freeze({
    INCIDENT_REVIEW:
      "INCIDENT_REVIEW",

    APPROVAL_REQUIRED:
      "APPROVAL_REQUIRED",

    RECOVERY_FAILED:
      "RECOVERY_FAILED",

    ROLLBACK_REQUIRED:
      "ROLLBACK_REQUIRED",

    POLICY_REVIEW:
      "POLICY_REVIEW",

    VERIFICATION_REVIEW:
      "VERIFICATION_REVIEW",

    MANUAL_INTERVENTION:
      "MANUAL_INTERVENTION",

    GENERAL:
      "GENERAL",
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


function createPublicId() {
  return (
    "htask_" +
    crypto
      .randomBytes(
        12
      )
      .toString(
        "hex"
      )
  );
}


async function requireEnvironmentScope({
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
      "HUMAN_TASK_ENVIRONMENT_NOT_FOUND"
    );
  }
}


async function requireTask({
  organizationId,
  environmentId,
  taskId,
}) {
  const result =
    await getPostgresPool()
      .query(
        `
          SELECT *
          FROM human_operations.tasks
          WHERE
            organization_id = $1
            AND environment_id = $2
            AND (
              public_id = $3
              OR id::text = $3
            )
          LIMIT 1
        `,
        [
          organizationId,
          environmentId,
          taskId,
        ]
      );

  if (
    !result.rows[0]
  ) {
    throw createError(
      "Human task not found",
      404,
      "HUMAN_TASK_NOT_FOUND"
    );
  }

  return result.rows[0];
}


async function listTasks({
  organizationId,
  environmentId,
  status =
    null,
}) {
  const values = [
    organizationId,
    environmentId,
  ];

  let filter =
    "";

  if (
    status
  ) {
    values.push(
      status
    );

    filter =
      "AND status = $3";
  }

  const result =
    await getPostgresPool()
      .query(
        `
          SELECT *
          FROM human_operations.tasks
          WHERE
            organization_id = $1
            AND environment_id = $2
            ${filter}
          ORDER BY
            CASE priority
              WHEN 'CRITICAL' THEN 1
              WHEN 'HIGH' THEN 2
              WHEN 'MEDIUM' THEN 3
              ELSE 4
            END,
            created_at ASC
        `,
        values
      );

  return result.rows;
}


async function createTask({
  organizationId,
  environmentId,

  actorUserId =
    null,

  incidentId =
    null,

  approvalId =
    null,

  escalationId =
    null,

  executionRequestId =
    null,

  recoveryDecisionId =
    null,

  taskType =
    HUMAN_TASK_TYPES
      .GENERAL,

  title,

  description =
    null,

  priority =
    HUMAN_TASK_PRIORITY
      .MEDIUM,

  source =
    "AIRA",

  assignedUserId =
    null,

  assignedTeamId =
    null,

  acknowledgementRequired =
    true,

  recommendedActions =
    [],

  evidence =
    [],

  metadata =
    {},

  dueAt =
    null,
}) {
  await requireEnvironmentScope({
    organizationId,
    environmentId,
  });

  if (
    !Object.values(
      HUMAN_TASK_TYPES
    ).includes(
      taskType
    )
  ) {
    throw createError(
      "Unknown human task type",
      422,
      "HUMAN_TASK_TYPE_INVALID"
    );
  }

  if (
    !Object.values(
      HUMAN_TASK_PRIORITY
    ).includes(
      priority
    )
  ) {
    throw createError(
      "Unknown human task priority",
      422,
      "HUMAN_TASK_PRIORITY_INVALID"
    );
  }

  const normalizedTitle =
    String(
      title ||
      ""
    ).trim();

  if (
    !normalizedTitle
  ) {
    throw createError(
      "Human task title is required",
      422,
      "HUMAN_TASK_TITLE_REQUIRED"
    );
  }

  if (
    escalationId
  ) {
    const existing =
      await getPostgresPool()
        .query(
          `
            SELECT *
            FROM human_operations.tasks
            WHERE
              organization_id = $1
              AND environment_id = $2
              AND escalation_id = $3
            LIMIT 1
          `,
          [
            organizationId,
            environmentId,
            escalationId,
          ]
        );

    if (
      existing.rows[0]
    ) {
      return existing.rows[0];
    }
  }

  const initialStatus =
    assignedUserId ||
    assignedTeamId
      ? HUMAN_TASK_STATUS
          .ASSIGNED
      : HUMAN_TASK_STATUS
          .OPEN;

  const result =
    await getPostgresPool()
      .query(
        `
          INSERT INTO human_operations.tasks (
            public_id,
            organization_id,
            environment_id,
            incident_id,
            approval_id,
            escalation_id,
            execution_request_id,
            recovery_decision_id,
            task_type,
            title,
            description,
            priority,
            status,
            source,
            assigned_user_id,
            assigned_team_id,
            created_by_user_id,
            acknowledgement_required,
            autonomous_recovery_blocked,
            execution_authorized,
            recommended_actions,
            evidence,
            metadata,
            due_at
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
            $15,$16,$17,$18,TRUE,FALSE,
            $19::jsonb,$20::jsonb,$21::jsonb,$22
          )
          RETURNING *
        `,
        [
          createPublicId(),

          organizationId,
          environmentId,

          incidentId,
          approvalId,
          escalationId,
          executionRequestId,
          recoveryDecisionId,

          taskType,
          normalizedTitle,
          description,
          priority,
          initialStatus,
          source,

          assignedUserId,
          assignedTeamId,
          actorUserId,

          Boolean(
            acknowledgementRequired
          ),

          JSON.stringify(
            recommendedActions
          ),

          JSON.stringify(
            evidence
          ),

          JSON.stringify(
            metadata
          ),

          dueAt,
        ]
      );

  const task =
    result.rows[0];

  await auditRecord(
    AUTH_EVENT_TYPES
      .HUMAN_TASK_CREATED,
    AUTH_EVENT_OUTCOMES
      .SUCCESS,
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        humanTaskId:
          task.public_id,

        environmentId,

        incidentId,

        taskType,

        priority,
      },
    }
  ).catch(
    () => {}
  );

  routeNotification({
    notificationId:
      "human_task_" +
      task.public_id,

    organizationId,

    environmentId,

    incidentId,

    humanTaskId:
      task.public_id,

    escalationId,

    eventType:
      "human_task.created",

    severity:
      priority,

    title:
      normalizedTitle,

    message:
      description ||
      "AIRA requires human operator action.",
  }).catch(
    () => {}
  );

  return task;
}


async function assignTask({
  organizationId,
  environmentId,
  taskId,
  actorUserId,
  assignedUserId =
    null,
  assignedTeamId =
    null,
}) {
  const task =
    await requireTask({
      organizationId,
      environmentId,
      taskId,
    });

  if (
    [
      HUMAN_TASK_STATUS
        .RESOLVED,

      HUMAN_TASK_STATUS
        .CANCELLED,
    ].includes(
      task.status
    )
  ) {
    throw createError(
      "Closed human task cannot be reassigned",
      409,
      "HUMAN_TASK_CLOSED"
    );
  }

  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE human_operations.tasks
          SET
            assigned_user_id = $4,
            assigned_team_id = $5,
            status = 'ASSIGNED'
          WHERE
            organization_id = $1
            AND environment_id = $2
            AND id = $3
          RETURNING *
        `,
        [
          organizationId,
          environmentId,
          task.id,
          assignedUserId,
          assignedTeamId,
        ]
      );

  await auditRecord(
    AUTH_EVENT_TYPES
      .HUMAN_TASK_ASSIGNED,
    AUTH_EVENT_OUTCOMES
      .SUCCESS,
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        humanTaskId:
          task.public_id,

        environmentId,

        assignedUserId,

        assignedTeamId,
      },
    }
  ).catch(
    () => {}
  );

  return result.rows[0];
}


async function acknowledgeTask({
  organizationId,
  environmentId,
  taskId,
  actorUserId,
}) {
  const task =
    await requireTask({
      organizationId,
      environmentId,
      taskId,
    });

  if (
    [
      HUMAN_TASK_STATUS
        .RESOLVED,

      HUMAN_TASK_STATUS
        .CANCELLED,
    ].includes(
      task.status
    )
  ) {
    throw createError(
      "Closed human task cannot be acknowledged",
      409,
      "HUMAN_TASK_CLOSED"
    );
  }

  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE human_operations.tasks
          SET
            status = 'ACKNOWLEDGED',
            acknowledged_by_user_id = $4,
            acknowledged_at = NOW()
          WHERE
            organization_id = $1
            AND environment_id = $2
            AND id = $3
          RETURNING *
        `,
        [
          organizationId,
          environmentId,
          task.id,
          actorUserId,
        ]
      );

  await auditRecord(
    AUTH_EVENT_TYPES
      .HUMAN_TASK_ACKNOWLEDGED,
    AUTH_EVENT_OUTCOMES
      .SUCCESS,
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        humanTaskId:
          task.public_id,

        environmentId,
      },
    }
  ).catch(
    () => {}
  );

  return result.rows[0];
}


async function resolveTask({
  organizationId,
  environmentId,
  taskId,
  actorUserId,
  resolution =
    {},
}) {
  const task =
    await requireTask({
      organizationId,
      environmentId,
      taskId,
    });

  if (
    task.status ===
      HUMAN_TASK_STATUS
        .CANCELLED
  ) {
    throw createError(
      "Cancelled human task cannot be resolved",
      409,
      "HUMAN_TASK_CANCELLED"
    );
  }

  if (
    task.status ===
      HUMAN_TASK_STATUS
        .RESOLVED
  ) {
    return task;
  }

  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE human_operations.tasks
          SET
            status = 'RESOLVED',
            resolved_by_user_id = $4,
            resolved_at = NOW(),
            resolution = $5::jsonb
          WHERE
            organization_id = $1
            AND environment_id = $2
            AND id = $3
          RETURNING *
        `,
        [
          organizationId,
          environmentId,
          task.id,
          actorUserId,

          JSON.stringify(
            resolution
          ),
        ]
      );

  await auditRecord(
    AUTH_EVENT_TYPES
      .HUMAN_TASK_RESOLVED,
    AUTH_EVENT_OUTCOMES
      .SUCCESS,
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        humanTaskId:
          task.public_id,

        environmentId,
      },
    }
  ).catch(
    () => {}
  );

  return result.rows[0];
}


async function cancelTask({
  organizationId,
  environmentId,
  taskId,
  actorUserId,
  reason =
    null,
}) {
  const task =
    await requireTask({
      organizationId,
      environmentId,
      taskId,
    });

  if (
    task.status ===
      HUMAN_TASK_STATUS
        .RESOLVED
  ) {
    throw createError(
      "Resolved human task cannot be cancelled",
      409,
      "HUMAN_TASK_ALREADY_RESOLVED"
    );
  }

  const metadata = {
    ...(
      task.metadata ||
      {}
    ),

    cancellationReason:
      reason,
  };

  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE human_operations.tasks
          SET
            status = 'CANCELLED',
            cancelled_by_user_id = $4,
            cancelled_at = NOW(),
            metadata = $5::jsonb
          WHERE
            organization_id = $1
            AND environment_id = $2
            AND id = $3
          RETURNING *
        `,
        [
          organizationId,
          environmentId,
          task.id,
          actorUserId,

          JSON.stringify(
            metadata
          ),
        ]
      );

  await auditRecord(
    AUTH_EVENT_TYPES
      .HUMAN_TASK_CANCELLED,
    AUTH_EVENT_OUTCOMES
      .SUCCESS,
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        humanTaskId:
          task.public_id,

        environmentId,

        reason,
      },
    }
  ).catch(
    () => {}
  );

  return result.rows[0];
}


async function escalateTask({
  organizationId,
  environmentId,
  taskId,
  actorUserId,
  priority =
    HUMAN_TASK_PRIORITY
      .CRITICAL,
}) {
  const task =
    await requireTask({
      organizationId,
      environmentId,
      taskId,
    });

  if (
    [
      HUMAN_TASK_STATUS
        .RESOLVED,

      HUMAN_TASK_STATUS
        .CANCELLED,
    ].includes(
      task.status
    )
  ) {
    throw createError(
      "Closed human task cannot be escalated",
      409,
      "HUMAN_TASK_CLOSED"
    );
  }

  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE human_operations.tasks
          SET
            status = 'ESCALATED',
            priority = $4,
            escalated_at = NOW()
          WHERE
            organization_id = $1
            AND environment_id = $2
            AND id = $3
          RETURNING *
        `,
        [
          organizationId,
          environmentId,
          task.id,
          priority,
        ]
      );

  await auditRecord(
    AUTH_EVENT_TYPES
      .HUMAN_TASK_ESCALATED,
    AUTH_EVENT_OUTCOMES
      .SUCCESS,
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        humanTaskId:
          task.public_id,

        environmentId,

        priority,
      },
    }
  ).catch(
    () => {}
  );

  routeNotification({
    notificationId:
      "human_task_escalated_" +
      task.public_id,

    organizationId,

    environmentId,

    incidentId:
      task.incident_id,

    humanTaskId:
      task.public_id,

    escalationId:
      task.escalation_id,

    eventType:
      "human_task.escalated",

    severity:
      priority,

    title:
      `Human task escalated: ${task.title}`,

    message:
      task.description ||
      "Human intervention has been escalated.",
  }).catch(
    () => {}
  );

  return result.rows[0];
}


async function createFromEscalation(
  escalation
) {
  return createTask({
    organizationId:
      escalation
        .organizationId,

    environmentId:
      escalation
        .environmentId,

    incidentId:
      escalation
        .incidentId,

    escalationId:
      escalation
        .escalationId,

    executionRequestId:
      escalation
        .executionRequestId,

    recoveryDecisionId:
      escalation
        .recoveryDecisionId,

    taskType:
      HUMAN_TASK_TYPES
        .MANUAL_INTERVENTION,

    title:
      "AIRA operator intervention required",

    description:
      escalation
        .message,

    priority:
      escalation
        .priority,

    recommendedActions:
      escalation
        .recommendedActions ||
      [],

    evidence:
      escalation
        .evidence ||
      [],

    metadata: {
      escalationReason:
        escalation
          .reason,

      verificationId:
        escalation
          .verificationId,
    },
  });
}


module.exports = {
  HUMAN_TASK_STATUS,
  HUMAN_TASK_PRIORITY,
  HUMAN_TASK_TYPES,

  listTasks,
  requireTask,

  createTask,
  createFromEscalation,

  assignTask,
  acknowledgeTask,
  resolveTask,
  cancelTask,
  escalateTask,
};