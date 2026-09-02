"use strict";


const crypto =
  require(
    "node:crypto"
  );


const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


const {
  ESCALATION_DECISION,
  ESCALATION_REASON,
  ESCALATION_STATUS,
  ON_CALL_TARGET_TYPE,
  ESCALATION_TRIGGER_SOURCE,
} = require(
  "../../constants/humanEscalation"
);


function createError(
  code,
  message,
  details = {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      executionAuthorized:
        false,

      ...details,
    }
  );
}


function requireValue(
  value,
  code,
  label
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    String(
      value
    ).trim() ===
      ""
  ) {
    throw createError(
      code,
      `${label} is required`
    );
  }


  return value;
}


function requireScope({
  organizationId,
  environmentId,
}) {
  requireValue(
    organizationId,
    "HUMAN_ESCALATION_ORGANIZATION_REQUIRED",
    "organizationId"
  );


  requireValue(
    environmentId,
    "HUMAN_ESCALATION_ENVIRONMENT_REQUIRED",
    "environmentId"
  );


  return {
    organizationId,
    environmentId,
  };
}


function publicId(
  prefix
) {
  return [
    prefix,
    crypto
      .randomBytes(
        10
      )
      .toString(
        "hex"
      ),
  ].join(
    "_"
  );
}


function parseJson(
  value,
  fallback
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return fallback;
  }


  return value;
}


function mapPolicy(
  row
) {
  if (
    !row
  ) {
    return null;
  }


  return {
    id:
      row.id,

    publicId:
      row.public_id,

    organizationId:
      row.organization_id,

    environmentId:
      row.environment_id,

    policyKey:
      row.policy_key,

    name:
      row.name,

    description:
      row.description,

    enabled:
      row.enabled,

    priority:
      row.priority,

    matchConditions:
      parseJson(
        row.match_conditions,
        {}
      ),

    acknowledgementTimeoutSeconds:
      row.acknowledgement_timeout_seconds,

    maxDeliveryAttempts:
      row.max_delivery_attempts,

    createHumanTask:
      row.create_human_task,

    blockAutonomousRecovery:
      row.block_autonomous_recovery,

    metadata:
      parseJson(
        row.metadata,
        {}
      ),

    executionAuthorized:
      row.execution_authorized,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}


function mapTarget(
  row
) {
  if (
    !row
  ) {
    return null;
  }


  return {
    id:
      row.id,

    publicId:
      row.public_id,

    organizationId:
      row.organization_id,

    environmentId:
      row.environment_id,

    targetKey:
      row.target_key,

    name:
      row.name,

    targetType:
      row.target_type,

    targetUserId:
      row.target_user_id,

    targetTeamId:
      row.target_team_id,

    integrationRef:
      row.integration_ref,

    routingKey:
      row.routing_key,

    channels:
      parseJson(
        row.channels,
        []
      ),

    enabled:
      row.enabled,

    priority:
      row.priority,

    metadata:
      parseJson(
        row.metadata,
        {}
      ),

    executionAuthorized:
      row.execution_authorized,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}


function mapEscalation(
  row
) {
  if (
    !row
  ) {
    return null;
  }


  return {
    id:
      row.id,

    publicId:
      row.public_id,

    organizationId:
      row.organization_id,

    environmentId:
      row.environment_id,

    incidentId:
      row.incident_id,

    taskId:
      row.task_id,

    policyId:
      row.policy_id,

    selectedTargetId:
      row.selected_target_id,

    decision:
      row.decision,

    reasonCode:
      row.reason_code,

    severity:
      row.severity,

    triggerSource:
      row.trigger_source,

    status:
      row.status,

    decisionSnapshot:
      parseJson(
        row.decision_snapshot,
        {}
      ),

    routingSnapshot:
      parseJson(
        row.routing_snapshot,
        {}
      ),

    acknowledgementDeadline:
      row.acknowledgement_deadline,

    createdByUserId:
      row.created_by_user_id,

    metadata:
      parseJson(
        row.metadata,
        {}
      ),

    executionAuthorized:
      row.execution_authorized,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    resolvedAt:
      row.resolved_at,

    expiredAt:
      row.expired_at,

    cancelledAt:
      row.cancelled_at,
  };
}


class PostgresHumanEscalationRepository {
  constructor({
    pool = null,
    scope = null,
  } = {}) {
    this.scope =
      scope ||
      new PostgresTenantScope({
        pool,
      });
  }


  async createPolicy({
    organizationId,
    environmentId,

    publicId:
      requestedPublicId = null,

    policyKey,
    name,
    description = "",
    enabled = true,
    priority = 100,
    matchConditions = {},
    acknowledgementTimeoutSeconds = 900,
    maxDeliveryAttempts = 3,
    createHumanTask = true,
    blockAutonomousRecovery = true,
    metadata = {},
  }) {
    const scope =
      requireScope({
        organizationId,
        environmentId,
      });


    requireValue(
      policyKey,
      "HUMAN_ESCALATION_POLICY_KEY_REQUIRED",
      "policyKey"
    );


    requireValue(
      name,
      "HUMAN_ESCALATION_POLICY_NAME_REQUIRED",
      "name"
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
              INSERT INTO
                human_operations.escalation_policies (
                  public_id,
                  organization_id,
                  environment_id,
                  policy_key,
                  name,
                  description,
                  enabled,
                  priority,
                  match_conditions,
                  acknowledgement_timeout_seconds,
                  max_delivery_attempts,
                  create_human_task,
                  block_autonomous_recovery,
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
                $10,
                $11,
                $12,
                $13,
                $14::jsonb,
                FALSE
              )

              RETURNING *
            `,
            [
              requestedPublicId ||
                publicId(
                  "esc_policy"
                ),

              resolved.organizationUuid,

              resolved.environmentUuid,

              String(
                policyKey
              ),

              String(
                name
              ),

              String(
                description ||
                ""
              ),

              Boolean(
                enabled
              ),

              Number(
                priority
              ),

              JSON.stringify(
                matchConditions ||
                {}
              ),

              Number(
                acknowledgementTimeoutSeconds
              ),

              Number(
                maxDeliveryAttempts
              ),

              Boolean(
                createHumanTask
              ),

              Boolean(
                blockAutonomousRecovery
              ),

              JSON.stringify(
                metadata ||
                {}
              ),
            ]
          );


        return mapPolicy(
          result.rows[0]
        );
      }
    );
  }


  async listPolicies({
    organizationId,
    environmentId,
    enabledOnly = true,
  }) {
    const scope =
      requireScope({
        organizationId,
        environmentId,
      });


    return this.scope.run(
      scope,

      async (
        client
      ) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM
                human_operations.escalation_policies

              WHERE
                (
                  $1::boolean = FALSE
                  OR enabled = TRUE
                )

              ORDER BY
                priority ASC,
                created_at ASC,
                id ASC
            `,
            [
              Boolean(
                enabledOnly
              ),
            ]
          );


        return result.rows.map(
          mapPolicy
        );
      }
    );
  }


  async createTarget({
    organizationId,
    environmentId,

    publicId:
      requestedPublicId = null,

    targetKey,
    name,
    targetType,
    targetUserId = null,
    targetTeamId = null,
    integrationRef = null,
    routingKey = null,
    channels = [],
    enabled = true,
    priority = 100,
    metadata = {},
  }) {
    const scope =
      requireScope({
        organizationId,
        environmentId,
      });


    requireValue(
      targetKey,
      "HUMAN_ESCALATION_TARGET_KEY_REQUIRED",
      "targetKey"
    );


    requireValue(
      name,
      "HUMAN_ESCALATION_TARGET_NAME_REQUIRED",
      "name"
    );


    if (
      !Object.values(
        ON_CALL_TARGET_TYPE
      ).includes(
        targetType
      )
    ) {
      throw createError(
        "HUMAN_ESCALATION_TARGET_TYPE_INVALID",
        `Unsupported targetType: ${targetType}`
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
                human_operations.on_call_targets (
                  public_id,
                  organization_id,
                  environment_id,
                  target_key,
                  name,
                  target_type,
                  target_user_id,
                  target_team_id,
                  integration_ref,
                  routing_key,
                  channels,
                  enabled,
                  priority,
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
                $9,
                $10,
                $11::jsonb,
                $12,
                $13,
                $14::jsonb,
                FALSE
              )

              RETURNING *
            `,
            [
              requestedPublicId ||
                publicId(
                  "oncall"
                ),

              resolved.organizationUuid,

              resolved.environmentUuid,

              String(
                targetKey
              ),

              String(
                name
              ),

              targetType,

              targetUserId,

              targetTeamId,

              integrationRef,

              routingKey,

              JSON.stringify(
                Array.isArray(
                  channels
                )
                  ? channels
                  : []
              ),

              Boolean(
                enabled
              ),

              Number(
                priority
              ),

              JSON.stringify(
                metadata ||
                {}
              ),
            ]
          );


        return mapTarget(
          result.rows[0]
        );
      }
    );
  }


  async listTargets({
    organizationId,
    environmentId,
    enabledOnly = true,
  }) {
    const scope =
      requireScope({
        organizationId,
        environmentId,
      });


    return this.scope.run(
      scope,

      async (
        client
      ) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM
                human_operations.on_call_targets

              WHERE
                (
                  $1::boolean = FALSE
                  OR enabled = TRUE
                )

              ORDER BY
                priority ASC,
                created_at ASC,
                id ASC
            `,
            [
              Boolean(
                enabledOnly
              ),
            ]
          );


        return result.rows.map(
          mapTarget
        );
      }
    );
  }


  async createEscalation({
    organizationId,
    environmentId,

    publicId:
      requestedPublicId = null,

    incidentId,
    taskId = null,
    policyId = null,
    selectedTargetId = null,
    decision,
    reasonCode,
    severity = null,
    triggerSource,
    status = ESCALATION_STATUS.DECIDED,
    decisionSnapshot = {},
    routingSnapshot = {},
    acknowledgementDeadline = null,
    createdByUserId = null,
    metadata = {},
  }) {
    const scope =
      requireScope({
        organizationId,
        environmentId,
      });


    requireValue(
      incidentId,
      "HUMAN_ESCALATION_INCIDENT_REQUIRED",
      "incidentId"
    );


    if (
      !Object.values(
        ESCALATION_DECISION
      ).includes(
        decision
      )
    ) {
      throw createError(
        "HUMAN_ESCALATION_DECISION_INVALID",
        `Unsupported escalation decision: ${decision}`
      );
    }


    if (
      !Object.values(
        ESCALATION_REASON
      ).includes(
        reasonCode
      )
    ) {
      throw createError(
        "HUMAN_ESCALATION_REASON_INVALID",
        `Unsupported escalation reason: ${reasonCode}`
      );
    }


    if (
      !Object.values(
        ESCALATION_TRIGGER_SOURCE
      ).includes(
        triggerSource
      )
    ) {
      throw createError(
        "HUMAN_ESCALATION_TRIGGER_INVALID",
        `Unsupported triggerSource: ${triggerSource}`
      );
    }


    if (
      !Object.values(
        ESCALATION_STATUS
      ).includes(
        status
      )
    ) {
      throw createError(
        "HUMAN_ESCALATION_STATUS_INVALID",
        `Unsupported escalation status: ${status}`
      );
    }


    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const resolvedPolicyId =
          await this.#resolveScopedId(
            client,
            "human_operations.escalation_policies",
            policyId
          );


        const resolvedTargetId =
          await this.#resolveScopedId(
            client,
            "human_operations.on_call_targets",
            selectedTargetId
          );


        const resolvedTaskId =
          await this.#resolveScopedId(
            client,
            "human_operations.tasks",
            taskId
          );


        const result =
          await client.query(
            `
              INSERT INTO
                human_operations.escalations (
                  public_id,
                  organization_id,
                  environment_id,
                  incident_id,
                  task_id,
                  policy_id,
                  selected_target_id,
                  decision,
                  reason_code,
                  severity,
                  trigger_source,
                  status,
                  decision_snapshot,
                  routing_snapshot,
                  acknowledgement_deadline,
                  created_by_user_id,
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
                $9,
                $10,
                $11,
                $12,
                $13::jsonb,
                $14::jsonb,
                $15,
                $16,
                $17::jsonb,
                FALSE
              )

              RETURNING *
            `,
            [
              requestedPublicId ||
                publicId(
                  "esc"
                ),

              resolved.organizationUuid,

              resolved.environmentUuid,

              String(
                incidentId
              ),

              resolvedTaskId,

              resolvedPolicyId,

              resolvedTargetId,

              decision,

              reasonCode,

              severity,

              triggerSource,

              status,

              JSON.stringify(
                decisionSnapshot ||
                {}
              ),

              JSON.stringify(
                routingSnapshot ||
                {}
              ),

              acknowledgementDeadline,

              createdByUserId,

              JSON.stringify(
                metadata ||
                {}
              ),
            ]
          );


        return mapEscalation(
          result.rows[0]
        );
      }
    );
  }


  async getEscalation({
    organizationId,
    environmentId,
    escalationId,
  }) {
    const scope =
      requireScope({
        organizationId,
        environmentId,
      });


    requireValue(
      escalationId,
      "HUMAN_ESCALATION_ID_REQUIRED",
      "escalationId"
    );


    return this.scope.run(
      scope,

      async (
        client
      ) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM
                human_operations.escalations

              WHERE
                public_id = $1
                OR id::text = $1

              LIMIT 1
            `,
            [
              String(
                escalationId
              ),
            ]
          );


        return mapEscalation(
          result.rows[0]
        );
      }
    );
  }


  async updateEscalationStatus({
    organizationId,
    environmentId,
    escalationId,
    status,
    routingSnapshot = undefined,
    taskId = undefined,
  }) {
    const scope =
      requireScope({
        organizationId,
        environmentId,
      });


    if (
      !Object.values(
        ESCALATION_STATUS
      ).includes(
        status
      )
    ) {
      throw createError(
        "HUMAN_ESCALATION_STATUS_INVALID",
        `Unsupported escalation status: ${status}`
      );
    }


    return this.scope.run(
      scope,

      async (
        client
      ) => {
        const resolvedTaskId =
          taskId ===
            undefined
            ? undefined
            : await this.#resolveScopedId(
                client,
                "human_operations.tasks",
                taskId
              );


        const result =
          await client.query(
            `
              UPDATE
                human_operations.escalations

              SET
                status = $2,

                routing_snapshot =
                  CASE
                    WHEN $3::jsonb IS NULL
                      THEN routing_snapshot
                    ELSE $3::jsonb
                  END,

                task_id =
                  CASE
                    WHEN $4::boolean = FALSE
                      THEN task_id
                    ELSE $5::uuid
                  END,

                resolved_at =
                  CASE
                    WHEN $2 = 'RESOLVED'
                      THEN COALESCE(
                        resolved_at,
                        NOW()
                      )
                    ELSE resolved_at
                  END,

                expired_at =
                  CASE
                    WHEN $2 = 'EXPIRED'
                      THEN COALESCE(
                        expired_at,
                        NOW()
                      )
                    ELSE expired_at
                  END,

                cancelled_at =
                  CASE
                    WHEN $2 = 'CANCELLED'
                      THEN COALESCE(
                        cancelled_at,
                        NOW()
                      )
                    ELSE cancelled_at
                  END

              WHERE
                public_id = $1
                OR id::text = $1

              RETURNING *
            `,
            [
              String(
                escalationId
              ),

              status,

              routingSnapshot ===
                undefined
                ? null
                : JSON.stringify(
                    routingSnapshot ||
                    {}
                  ),

              taskId !==
                undefined,

              resolvedTaskId ||
                null,
            ]
          );


        if (
          !result.rows[0]
        ) {
          throw createError(
            "HUMAN_ESCALATION_NOT_FOUND",
            `Escalation not found: ${escalationId}`
          );
        }


        return mapEscalation(
          result.rows[0]
        );
      }
    );
  }


  async #resolveScopedId(
    client,
    table,
    value
  ) {
    if (
      value ===
        undefined ||
      value ===
        null ||
      value ===
        ""
    ) {
      return null;
    }


    const allowedTables =
      new Set([
        "human_operations.escalation_policies",
        "human_operations.on_call_targets",
        "human_operations.tasks",
      ]);


    if (
      !allowedTables.has(
        table
      )
    ) {
      throw createError(
        "HUMAN_ESCALATION_INTERNAL_TABLE_INVALID",
        `Unsupported scoped table: ${table}`
      );
    }


    const result =
      await client.query(
        `
          SELECT id
          FROM ${table}

          WHERE
            public_id = $1
            OR id::text = $1

          LIMIT 1
        `,
        [
          String(
            value
          ),
        ]
      );


    if (
      !result.rows[0]
    ) {
      throw createError(
        "HUMAN_ESCALATION_REFERENCE_NOT_FOUND",
        `Scoped reference not found: ${value}`
      );
    }


    return result.rows[0]
      .id;
  }
}


module.exports =
  PostgresHumanEscalationRepository;