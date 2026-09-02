"use strict";

const crypto = require("node:crypto");

const PostgresTenantScope = require(
  "./PostgresTenantScope"
);

const {
  HUMAN_TASK_STATUS,
  ASSIGNMENT_STATUS,
  ACKNOWLEDGEMENT_OUTCOME,
} = require(
  "../../constants/humanTakeover"
);


function createError(
  message,
  code,
  status = 409
) {
  return Object.assign(
    new Error(message),
    {
      code,
      status,
      executionAuthorized: false,
    }
  );
}


function requireScope(input = {}) {
  if (!input.organizationId) {
    throw createError(
      "organizationId is required",
      "HUMAN_OPERATIONS_ORGANIZATION_REQUIRED",
      422
    );
  }

  if (!input.environmentId) {
    throw createError(
      "environmentId is required",
      "HUMAN_OPERATIONS_ENVIRONMENT_REQUIRED",
      422
    );
  }

  return {
    organizationId:
      input.organizationId,

    environmentId:
      input.environmentId,
  };
}


function requireValue(
  value,
  field,
  code
) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    throw createError(
      `${field} is required`,
      code,
      422
    );
  }
}


function generatePublicId(prefix) {
  return `${prefix}_${crypto
    .randomBytes(12)
    .toString("hex")}`;
}


function normalizeJson(value, fallback) {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  return value;
}


function mapTask(row, resolved) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    publicId: row.public_id,

    organizationId:
      resolved?.applicationOrganizationId ||
      row.organization_id,

    environmentId:
      resolved?.applicationEnvironmentId ||
      row.environment_id,

    incidentId: row.incident_id,
    approvalId: row.approval_id,
    escalationId: row.escalation_id,

    executionRequestId:
      row.execution_request_id,

    recoveryDecisionId:
      row.recovery_decision_id,

    taskType: row.task_type,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    source: row.source,

    assignedUserId:
      row.assigned_user_id,

    assignedTeamId:
      row.assigned_team_id,

    createdByUserId:
      row.created_by_user_id,

    acknowledgedByUserId:
      row.acknowledged_by_user_id,

    resolvedByUserId:
      row.resolved_by_user_id,

    cancelledByUserId:
      row.cancelled_by_user_id,

    acknowledgementRequired:
      row.acknowledgement_required,

    autonomousRecoveryBlocked:
      row.autonomous_recovery_blocked,

    executionAuthorized:
      row.execution_authorized,

    recommendedActions:
      row.recommended_actions || [],

    evidence:
      row.evidence || [],

    resolution:
      row.resolution || null,

    metadata:
      row.metadata || {},

    dueAt:
      row.due_at,

    expiresAt:
      row.expires_at,

    expiredAt:
      row.expired_at,

    acknowledgedAt:
      row.acknowledged_at,

    resolvedAt:
      row.resolved_at,

    cancelledAt:
      row.cancelled_at,

    escalatedAt:
      row.escalated_at,

    controlEpoch:
      Number(row.control_epoch || 0),

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}


function mapAssignment(
  row,
  resolved
) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    publicId: row.public_id,

    organizationId:
      resolved?.applicationOrganizationId ||
      row.organization_id,

    environmentId:
      resolved?.applicationEnvironmentId ||
      row.environment_id,

    taskId: row.task_id,

    assignedUserId:
      row.assigned_user_id,

    assignedTeamId:
      row.assigned_team_id,

    assignedByUserId:
      row.assigned_by_user_id,

    status: row.status,
    reason: row.reason,

    assignedAt:
      row.assigned_at,

    endedAt:
      row.ended_at,

    metadata:
      row.metadata || {},

    executionAuthorized:
      row.execution_authorized,
  };
}


function mapAcknowledgement(
  row,
  resolved
) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    publicId: row.public_id,

    organizationId:
      resolved?.applicationOrganizationId ||
      row.organization_id,

    environmentId:
      resolved?.applicationEnvironmentId ||
      row.environment_id,

    taskId: row.task_id,
    assignmentId: row.assignment_id,

    acknowledgedByUserId:
      row.acknowledged_by_user_id,

    outcome:
      row.outcome,

    note:
      row.note,

    acknowledgedAt:
      row.acknowledged_at,

    metadata:
      row.metadata || {},

    executionAuthorized:
      row.execution_authorized,
  };
}


function mapResolution(
  row,
  resolved
) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    publicId: row.public_id,

    organizationId:
      resolved?.applicationOrganizationId ||
      row.organization_id,

    environmentId:
      resolved?.applicationEnvironmentId ||
      row.environment_id,

    taskId: row.task_id,
    incidentId: row.incident_id,

    resolvedByUserId:
      row.resolved_by_user_id,

    resolutionType:
      row.resolution_type,

    summary:
      row.summary,

    details:
      row.details || {},

    verificationRequired:
      row.verification_required,

    resolvedAt:
      row.resolved_at,

    createdAt:
      row.created_at,

    executionAuthorized:
      row.execution_authorized,
  };
}


class PostgresHumanOperationsRepository {
  constructor(options = {}) {
    this.scope =
      options.scope ||
      new PostgresTenantScope(options);
  }


  async createTask(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(input);

    requireValue(
      input.taskType,
      "taskType",
      "HUMAN_TASK_TYPE_REQUIRED"
    );

    requireValue(
      input.title,
      "title",
      "HUMAN_TASK_TITLE_REQUIRED"
    );

    const status =
      input.status ||
      HUMAN_TASK_STATUS.OPEN;

    if (
      !Object.values(
        HUMAN_TASK_STATUS
      ).includes(status)
    ) {
      throw createError(
        "Invalid human task status",
        "HUMAN_TASK_STATUS_INVALID",
        422
      );
    }

    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO
                human_operations.tasks (
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

                  due_at,
                  expires_at,

                  control_epoch
                )
              VALUES (
                $1,

                $2,
                $3,

                $4,
                $5,
                $6,
                $7,
                $8,

                $9,
                $10,
                $11,

                $12,
                $13,
                $14,

                $15,
                $16,

                $17,

                $18,
                TRUE,
                FALSE,

                $19::jsonb,
                $20::jsonb,
                $21::jsonb,

                $22,
                $23,

                $24
              )

              RETURNING *
            `,
            [
              input.publicId ||
                generatePublicId(
                  "htask"
                ),

              resolved.organizationUuid,
              resolved.environmentUuid,

              input.incidentId || null,
              input.approvalId || null,
              input.escalationId || null,

              input.executionRequestId ||
                null,

              input.recoveryDecisionId ||
                null,

              input.taskType,

              String(
                input.title
              ).trim(),

              input.description ||
                null,

              input.priority ||
                "MEDIUM",

              status,

              input.source ||
                "AIRA",

              input.assignedUserId ||
                null,

              input.assignedTeamId ||
                null,

              input.createdByUserId ||
                null,

              input.acknowledgementRequired !==
                false,

              JSON.stringify(
                normalizeJson(
                  input.recommendedActions,
                  []
                )
              ),

              JSON.stringify(
                normalizeJson(
                  input.evidence,
                  []
                )
              ),

              JSON.stringify(
                normalizeJson(
                  input.metadata,
                  {}
                )
              ),

              input.dueAt ||
                null,

              input.expiresAt ||
                null,

              Number(
                input.controlEpoch ||
                0
              ),
            ]
          );

        return mapTask(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async getTask(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(input);

    requireValue(
      input.taskId,
      "taskId",
      "HUMAN_TASK_ID_REQUIRED"
    );

    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM
                human_operations.tasks

              WHERE
                (
                  public_id = $1
                  OR id::text = $1
                )

              LIMIT 1
            `,
            [
              String(
                input.taskId
              ),
            ]
          );

        return mapTask(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async listTasks(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(input);

    if (
      input.status &&
      !Object.values(
        HUMAN_TASK_STATUS
      ).includes(
        input.status
      )
    ) {
      throw createError(
        "Invalid human task status",
        "HUMAN_TASK_STATUS_INVALID",
        422
      );
    }

    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const values = [];

        let statusFilter =
          "";

        if (input.status) {
          values.push(
            input.status
          );

          statusFilter =
            `
              WHERE status = $1
            `;
        }

        const result =
          await client.query(
            `
              SELECT *
              FROM
                human_operations.tasks

              ${statusFilter}

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

        return result.rows.map(
          (row) =>
            mapTask(
              row,
              resolved
            )
        );
      },

      transaction
    );
  }


  async updateTaskStatus(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(input);

    requireValue(
      input.taskId,
      "taskId",
      "HUMAN_TASK_ID_REQUIRED"
    );

    requireValue(
      input.status,
      "status",
      "HUMAN_TASK_STATUS_REQUIRED"
    );

    if (
      !Object.values(
        HUMAN_TASK_STATUS
      ).includes(
        input.status
      )
    ) {
      throw createError(
        "Invalid human task status",
        "HUMAN_TASK_STATUS_INVALID",
        422
      );
    }

    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const existing =
          await this.#findTaskRow(
            client,
            input.taskId
          );

        if (!existing) {
          throw createError(
            "Human task not found",
            "HUMAN_TASK_NOT_FOUND",
            404
          );
        }

        const result =
          await client.query(
            `
              UPDATE
                human_operations.tasks

              SET
                status = $2,

                expired_at =
                  CASE
                    WHEN $2 = 'EXPIRED'
                      THEN COALESCE(
                        expired_at,
                        NOW()
                      )
                    ELSE expired_at
                  END,

                updated_at = NOW()

              WHERE
                id = $1

              RETURNING *
            `,
            [
              existing.id,
              input.status,
            ]
          );

        await client.query(
          `
            INSERT INTO
              human_operations.task_status_history (
                public_id,

                organization_id,
                environment_id,

                task_id,

                from_status,
                to_status,

                actor_user_id,
                reason,
                metadata,

                execution_authorized
              )
            VALUES (
              $1,

              $2,
              $3,

              $4,

              $5,
              $6,

              $7,
              $8,
              $9::jsonb,

              FALSE
            )
          `,
          [
            generatePublicId(
              "htsh"
            ),

            resolved.organizationUuid,
            resolved.environmentUuid,

            existing.id,

            existing.status,
            input.status,

            input.actorUserId ||
              null,

            input.reason ||
              null,

            JSON.stringify(
              normalizeJson(
                input.metadata,
                {}
              )
            ),
          ]
        );

        return mapTask(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async createAssignment(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(input);

    requireValue(
      input.taskId,
      "taskId",
      "HUMAN_TASK_ID_REQUIRED"
    );

    if (
      !input.assignedUserId &&
      !input.assignedTeamId
    ) {
      throw createError(
        "Assignment requires a user or team",
        "HUMAN_ASSIGNMENT_TARGET_REQUIRED",
        422
      );
    }

    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const task =
          await this.#findTaskRow(
            client,
            input.taskId
          );

        if (!task) {
          throw createError(
            "Human task not found",
            "HUMAN_TASK_NOT_FOUND",
            404
          );
        }

        await client.query(
          `
            UPDATE
              human_operations.assignments

            SET
              status = 'REASSIGNED',
              ended_at = NOW()

            WHERE
              task_id = $1
              AND status = 'ACTIVE'
          `,
          [
            task.id,
          ]
        );

        const result =
          await client.query(
            `
              INSERT INTO
                human_operations.assignments (
                  public_id,

                  organization_id,
                  environment_id,

                  task_id,

                  assigned_user_id,
                  assigned_team_id,
                  assigned_by_user_id,

                  status,
                  reason,
                  metadata,

                  execution_authorized
                )
              VALUES (
                $1,

                $2,
                $3,

                $4,

                $5,
                $6,
                $7,

                'ACTIVE',
                $8,
                $9::jsonb,

                FALSE
              )

              RETURNING *
            `,
            [
              input.publicId ||
                generatePublicId(
                  "hasg"
                ),

              resolved.organizationUuid,
              resolved.environmentUuid,

              task.id,

              input.assignedUserId ||
                null,

              input.assignedTeamId ||
                null,

              input.assignedByUserId ||
                null,

              input.reason ||
                null,

              JSON.stringify(
                normalizeJson(
                  input.metadata,
                  {}
                )
              ),
            ]
          );

        await client.query(
          `
            UPDATE
              human_operations.tasks

            SET
              assigned_user_id = $2,
              assigned_team_id = $3,
              status = 'ASSIGNED',
              updated_at = NOW()

            WHERE
              id = $1
          `,
          [
            task.id,

            input.assignedUserId ||
              null,

            input.assignedTeamId ||
              null,
          ]
        );

        await this.#insertTaskHistory(
          client,
          resolved,
          {
            taskId:
              task.id,

            fromStatus:
              task.status,

            toStatus:
              HUMAN_TASK_STATUS
                .ASSIGNED,

            actorUserId:
              input.assignedByUserId,

            reason:
              input.reason,

            metadata: {
              assignmentId:
                result.rows[0]
                  .public_id,
            },
          }
        );

        return mapAssignment(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async getActiveAssignment(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(input);

    requireValue(
      input.taskId,
      "taskId",
      "HUMAN_TASK_ID_REQUIRED"
    );

    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const task =
          await this.#findTaskRow(
            client,
            input.taskId
          );

        if (!task) {
          return null;
        }

        const result =
          await client.query(
            `
              SELECT *
              FROM
                human_operations.assignments

              WHERE
                task_id = $1
                AND status = 'ACTIVE'

              LIMIT 1
            `,
            [
              task.id,
            ]
          );

        return mapAssignment(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async acknowledgeTask(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(input);

    requireValue(
      input.taskId,
      "taskId",
      "HUMAN_TASK_ID_REQUIRED"
    );

    requireValue(
      input.acknowledgedByUserId,
      "acknowledgedByUserId",
      "HUMAN_ACK_USER_REQUIRED"
    );

    const outcome =
      input.outcome ||
      ACKNOWLEDGEMENT_OUTCOME
        .ACKNOWLEDGED;

    if (
      !Object.values(
        ACKNOWLEDGEMENT_OUTCOME
      ).includes(outcome)
    ) {
      throw createError(
        "Invalid acknowledgement outcome",
        "HUMAN_ACK_OUTCOME_INVALID",
        422
      );
    }

    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const task =
          await this.#findTaskRow(
            client,
            input.taskId
          );

        if (!task) {
          throw createError(
            "Human task not found",
            "HUMAN_TASK_NOT_FOUND",
            404
          );
        }

        let assignmentId =
          null;

        if (input.assignmentId) {
          const assignment =
            await this.#findAssignmentRow(
              client,
              input.assignmentId
            );

          if (!assignment) {
            throw createError(
              "Human assignment not found",
              "HUMAN_ASSIGNMENT_NOT_FOUND",
              404
            );
          }

          if (
            String(
              assignment.task_id
            ) !==
            String(task.id)
          ) {
            throw createError(
              "Assignment does not belong to task",
              "HUMAN_ASSIGNMENT_TASK_MISMATCH",
              409
            );
          }

          assignmentId =
            assignment.id;
        }

        const result =
          await client.query(
            `
              INSERT INTO
                human_operations.acknowledgements (
                  public_id,

                  organization_id,
                  environment_id,

                  task_id,
                  assignment_id,

                  acknowledged_by_user_id,

                  outcome,
                  note,
                  metadata,

                  execution_authorized
                )
              VALUES (
                $1,

                $2,
                $3,

                $4,
                $5,

                $6,

                $7,
                $8,
                $9::jsonb,

                FALSE
              )

              RETURNING *
            `,
            [
              input.publicId ||
                generatePublicId(
                  "hack"
                ),

              resolved.organizationUuid,
              resolved.environmentUuid,

              task.id,
              assignmentId,

              input.acknowledgedByUserId,

              outcome,

              input.note ||
                null,

              JSON.stringify(
                normalizeJson(
                  input.metadata,
                  {}
                )
              ),
            ]
          );

        if (
          outcome ===
          ACKNOWLEDGEMENT_OUTCOME
            .ACKNOWLEDGED
        ) {
          await client.query(
            `
              UPDATE
                human_operations.tasks

              SET
                status = 'ACKNOWLEDGED',

                acknowledged_by_user_id =
                  $2,

                acknowledged_at =
                  NOW(),

                updated_at =
                  NOW()

              WHERE
                id = $1
            `,
            [
              task.id,
              input.acknowledgedByUserId,
            ]
          );

          await this.#insertTaskHistory(
            client,
            resolved,
            {
              taskId:
                task.id,

              fromStatus:
                task.status,

              toStatus:
                HUMAN_TASK_STATUS
                  .ACKNOWLEDGED,

              actorUserId:
                input.acknowledgedByUserId,

              reason:
                input.note,

              metadata: {
                acknowledgementId:
                  result.rows[0]
                    .public_id,
              },
            }
          );
        }

        return mapAcknowledgement(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async resolveTask(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(input);

    requireValue(
      input.taskId,
      "taskId",
      "HUMAN_TASK_ID_REQUIRED"
    );

    requireValue(
      input.resolvedByUserId,
      "resolvedByUserId",
      "HUMAN_RESOLUTION_USER_REQUIRED"
    );

    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const task =
          await this.#findTaskRow(
            client,
            input.taskId
          );

        if (!task) {
          throw createError(
            "Human task not found",
            "HUMAN_TASK_NOT_FOUND",
            404
          );
        }

        if (
          task.status ===
          HUMAN_TASK_STATUS.CANCELLED
        ) {
          throw createError(
            "Cancelled human task cannot be resolved",
            "HUMAN_TASK_CANCELLED",
            409
          );
        }

        const existing =
          await client.query(
            `
              SELECT *
              FROM
                human_operations.resolutions

              WHERE
                task_id = $1

              LIMIT 1
            `,
            [
              task.id,
            ]
          );

        if (
          existing.rows[0]
        ) {
          return mapResolution(
            existing.rows[0],
            resolved
          );
        }

        const result =
          await client.query(
            `
              INSERT INTO
                human_operations.resolutions (
                  public_id,

                  organization_id,
                  environment_id,

                  task_id,
                  incident_id,

                  resolved_by_user_id,

                  resolution_type,
                  summary,
                  details,

                  verification_required,

                  execution_authorized
                )
              VALUES (
                $1,

                $2,
                $3,

                $4,
                $5,

                $6,

                $7,
                $8,
                $9::jsonb,

                $10,

                FALSE
              )

              RETURNING *
            `,
            [
              input.publicId ||
                generatePublicId(
                  "hres"
                ),

              resolved.organizationUuid,
              resolved.environmentUuid,

              task.id,
              task.incident_id,

              input.resolvedByUserId,

              input.resolutionType ||
                "MANUAL",

              input.summary ||
                null,

              JSON.stringify(
                normalizeJson(
                  input.details,
                  {}
                )
              ),

              input.verificationRequired !==
                false,
            ]
          );

        await client.query(
          `
            UPDATE
              human_operations.tasks

            SET
              status = 'RESOLVED',

              resolved_by_user_id =
                $2,

              resolved_at =
                NOW(),

              resolution =
                $3::jsonb,

              updated_at =
                NOW()

            WHERE
              id = $1
          `,
          [
            task.id,

            input.resolvedByUserId,

            JSON.stringify({
              resolutionType:
                input.resolutionType ||
                "MANUAL",

              summary:
                input.summary ||
                null,

              details:
                normalizeJson(
                  input.details,
                  {}
                ),

              verificationRequired:
                input.verificationRequired !==
                false,
            }),
          ]
        );

        await this.#insertTaskHistory(
          client,
          resolved,
          {
            taskId:
              task.id,

            fromStatus:
              task.status,

            toStatus:
              HUMAN_TASK_STATUS
                .RESOLVED,

            actorUserId:
              input.resolvedByUserId,

            reason:
              input.summary,

            metadata: {
              resolutionId:
                result.rows[0]
                  .public_id,
            },
          }
        );

        return mapResolution(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async listTaskHistory(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(input);

    requireValue(
      input.taskId,
      "taskId",
      "HUMAN_TASK_ID_REQUIRED"
    );

    return this.scope.run(
      scope,

      async (
        client
      ) => {
        const task =
          await this.#findTaskRow(
            client,
            input.taskId
          );

        if (!task) {
          return [];
        }

        const result =
          await client.query(
            `
              SELECT *
              FROM
                human_operations.task_status_history

              WHERE
                task_id = $1

              ORDER BY
                created_at ASC
            `,
            [
              task.id,
            ]
          );

        return result.rows;
      },

      transaction
    );
  }


  async #findTaskRow(
    client,
    taskId
  ) {
    const result =
      await client.query(
        `
          SELECT *
          FROM
            human_operations.tasks

          WHERE
            (
              public_id = $1
              OR id::text = $1
            )

          LIMIT 1
        `,
        [
          String(taskId),
        ]
      );

    return (
      result.rows[0] ||
      null
    );
  }


  async #findAssignmentRow(
    client,
    assignmentId
  ) {
    const result =
      await client.query(
        `
          SELECT *
          FROM
            human_operations.assignments

          WHERE
            (
              public_id = $1
              OR id::text = $1
            )

          LIMIT 1
        `,
        [
          String(
            assignmentId
          ),
        ]
      );

    return (
      result.rows[0] ||
      null
    );
  }


  async #insertTaskHistory(
    client,
    resolved,
    input
  ) {
    await client.query(
      `
        INSERT INTO
          human_operations.task_status_history (
            public_id,

            organization_id,
            environment_id,

            task_id,

            from_status,
            to_status,

            actor_user_id,
            reason,
            metadata,

            execution_authorized
          )
        VALUES (
          $1,

          $2,
          $3,

          $4,

          $5,
          $6,

          $7,
          $8,
          $9::jsonb,

          FALSE
        )
      `,
      [
        generatePublicId(
          "htsh"
        ),

        resolved.organizationUuid,
        resolved.environmentUuid,

        input.taskId,

        input.fromStatus ||
          null,

        input.toStatus,

        input.actorUserId ||
          null,

        input.reason ||
          null,

        JSON.stringify(
          normalizeJson(
            input.metadata,
            {}
          )
        ),
      ]
    );
  }
}


module.exports = PostgresHumanOperationsRepository;