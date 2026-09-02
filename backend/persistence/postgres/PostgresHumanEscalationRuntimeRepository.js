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
  ESCALATION_STATUS,
} = require(
  "../../constants/humanEscalation"
);


function createError(
  message,
  code,
  status = 409
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,
      status,
      executionAuthorized:
        false,
    }
  );
}


function requireValue(
  value,
  label,
  code
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
      `${label} is required`,
      code,
      422
    );
  }


  return value;
}


function requireScope(
  input = {}
) {
  requireValue(
    input.organizationId,
    "organizationId",
    "HUMAN_ESCALATION_ORGANIZATION_REQUIRED"
  );


  requireValue(
    input.environmentId,
    "environmentId",
    "HUMAN_ESCALATION_ENVIRONMENT_REQUIRED"
  );


  return {
    organizationId:
      input.organizationId,

    environmentId:
      input.environmentId,
  };
}


function publicId(
  prefix
) {
  return (
    `${prefix}_` +
    crypto
      .randomBytes(
        10
      )
      .toString(
        "hex"
      )
  );
}


function mapEscalation(
  row,
  resolved
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
      resolved
        ?.applicationOrganizationId ||
      row.organization_id,

    environmentId:
      resolved
        ?.applicationEnvironmentId ||
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
      row.decision_snapshot ||
      {},

    routingSnapshot:
      row.routing_snapshot ||
      {},

    acknowledgementDeadline:
      row
        .acknowledgement_deadline,

    deliveryAttemptCount:
      Number(
        row
          .delivery_attempt_count ||
        0
      ),

    maxDeliveryAttempts:
      Number(
        row
          .max_delivery_attempts ||
        3
      ),

    acknowledgementTimeoutCount:
      Number(
        row
          .acknowledgement_timeout_count ||
        0
      ),

    lastDeliveryAttemptAt:
      row
        .last_delivery_attempt_at,

    nextDeliveryAttemptAt:
      row
        .next_delivery_attempt_at,

    metadata:
      row.metadata ||
      {},

    executionAuthorized:
      row.execution_authorized ===
      true,

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


function mapTask(
  row,
  resolved
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
      resolved
        ?.applicationOrganizationId ||
      row.organization_id,

    environmentId:
      resolved
        ?.applicationEnvironmentId ||
      row.environment_id,

    incidentId:
      row.incident_id,

    escalationId:
      row.escalation_id,

    taskType:
      row.task_type,

    title:
      row.title,

    priority:
      row.priority,

    status:
      row.status,

    assignedUserId:
      row.assigned_user_id,

    assignedTeamId:
      row.assigned_team_id,

    executionAuthorized:
      row.execution_authorized ===
      true,

    metadata:
      row.metadata ||
      {},
  };
}


class PostgresHumanEscalationRuntimeRepository {
  constructor(
    options = {}
  ) {
    this.scope =
      options.scope ||

      new PostgresTenantScope({
        pool:
          options.pool ||
          null,
      });
  }


  async initializeRuntime(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(
        input
      );


    requireValue(
      input.escalationId,
      "escalationId",
      "HUMAN_ESCALATION_ID_REQUIRED"
    );


    const maxDeliveryAttempts =
      Math.max(
        1,

        Number.parseInt(
          input
            .maxDeliveryAttempts,
          10
        ) ||
        3
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
              UPDATE
                human_operations.escalations

              SET
                max_delivery_attempts =
                  $2,

                delivery_attempt_count =
                  CASE
                    WHEN
                      delivery_attempt_count = 0
                    THEN 1
                    ELSE delivery_attempt_count
                  END,

                last_delivery_attempt_at =
                  COALESCE(
                    last_delivery_attempt_at,
                    NOW()
                  )

              WHERE
                public_id = $1
                OR id::text = $1

              RETURNING *
            `,
            [
              String(
                input
                  .escalationId
              ),

              maxDeliveryAttempts,
            ]
          );


        if (
          !result.rows[0]
        ) {
          throw createError(
            `Escalation not found: ${input.escalationId}`,
            "HUMAN_ESCALATION_NOT_FOUND",
            404
          );
        }


        await this
          .#insertEvent(
            client,
            resolved,
            {
              escalation:
                result.rows[0],

              eventType:
                "DELIVERY_INITIALIZED",

              attemptNumber:
                Number(
                  result
                    .rows[0]
                    .delivery_attempt_count ||
                  1
                ),

              targetId:
                result
                  .rows[0]
                  .selected_target_id,

              metadata: {
                maxDeliveryAttempts,

                executionAuthorized:
                  false,
              },
            }
          );


        return mapEscalation(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async getByPublicId(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(
        input
      );


    requireValue(
      input.escalationId,
      "escalationId",
      "HUMAN_ESCALATION_ID_REQUIRED"
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
                human_operations.escalations

              WHERE
                public_id = $1
                OR id::text = $1

              LIMIT 1
            `,
            [
              String(
                input
                  .escalationId
              ),
            ]
          );


        return mapEscalation(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async getTaskByEscalationPublicId(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(
        input
      );


    requireValue(
      input
        .escalationPublicId,

      "escalationPublicId",

      "HUMAN_ESCALATION_ID_REQUIRED"
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
                escalation_id = $1

              LIMIT 1
            `,
            [
              String(
                input
                  .escalationPublicId
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


  async listAcknowledgementTimeouts(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(
        input
      );


    const limit =
      Math.min(
        250,

        Math.max(
          1,

          Number.parseInt(
            input.limit,
            10
          ) ||
          50
        )
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
                human_operations.escalations

              WHERE
                status IN (
                  'WAITING_ACK',
                  'ROUTED'
                )

                AND
                acknowledgement_deadline
                  IS NOT NULL

                AND
                acknowledgement_deadline
                  <= NOW()

              ORDER BY
                acknowledgement_deadline ASC,
                created_at ASC

              LIMIT $1
            `,
            [
              limit,
            ]
          );


        return result.rows.map(
          (
            row
          ) =>
            mapEscalation(
              row,
              resolved
            )
        );
      },

      transaction
    );
  }


  async recordRetry(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(
        input
      );


    requireValue(
      input.escalationId,
      "escalationId",
      "HUMAN_ESCALATION_ID_REQUIRED"
    );


    requireValue(
      input.targetId,
      "targetId",
      "HUMAN_ESCALATION_TARGET_REQUIRED"
    );


    const acknowledgementTimeoutSeconds =
      Math.max(
        1,

        Number.parseInt(
          input
            .acknowledgementTimeoutSeconds,
          10
        ) ||
        900
      );


    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const escalationResult =
          await client.query(
            `
              SELECT *
              FROM
                human_operations.escalations

              WHERE
                public_id = $1
                OR id::text = $1

              LIMIT 1

              FOR UPDATE
            `,
            [
              String(
                input
                  .escalationId
              ),
            ]
          );


        const escalation =
          escalationResult
            .rows[0];


        if (
          !escalation
        ) {
          throw createError(
            `Escalation not found: ${input.escalationId}`,
            "HUMAN_ESCALATION_NOT_FOUND",
            404
          );
        }


        if (
          ![
            ESCALATION_STATUS
              .WAITING_ACK,

            ESCALATION_STATUS
              .ROUTED,
          ].includes(
            escalation.status
          )
        ) {
          throw createError(
            `Escalation is not waiting for acknowledgement: ${escalation.status}`,
            "HUMAN_ESCALATION_NOT_WAITING_ACK"
          );
        }


        if (
          Number(
            escalation
              .delivery_attempt_count ||
            0
          ) >=
          Number(
            escalation
              .max_delivery_attempts ||
            3
          )
        ) {
          throw createError(
            "Escalation delivery attempts are exhausted",
            "HUMAN_ESCALATION_RETRY_EXHAUSTED"
          );
        }


        const targetResult =
          await client.query(
            `
              SELECT id
              FROM
                human_operations.on_call_targets

              WHERE
                public_id = $1
                OR id::text = $1

              LIMIT 1
            `,
            [
              String(
                input.targetId
              ),
            ]
          );


        if (
          !targetResult
            .rows[0]
        ) {
          throw createError(
            `Escalation target not found: ${input.targetId}`,
            "HUMAN_ESCALATION_TARGET_NOT_FOUND",
            404
          );
        }


        const result =
          await client.query(
            `
              UPDATE
                human_operations.escalations

              SET
                selected_target_id =
                  $2,

                status =
                  $3,

                delivery_attempt_count =
                  delivery_attempt_count + 1,

                acknowledgement_timeout_count =
                  acknowledgement_timeout_count + 1,

                last_delivery_attempt_at =
                  NOW(),

                next_delivery_attempt_at =
                  NULL,

                acknowledgement_deadline =
                  NOW() +
                  (
                    $4::bigint *
                    INTERVAL '1 second'
                  ),

                routing_snapshot =
                  routing_snapshot ||
                  $5::jsonb

              WHERE
                id = $1

              RETURNING *
            `,
            [
              escalation.id,

              targetResult
                .rows[0]
                .id,

              input.status ||
                ESCALATION_STATUS
                  .WAITING_ACK,

              acknowledgementTimeoutSeconds,

              JSON.stringify({
                retry:
                  true,

                previousTargetId:
                  escalation
                    .selected_target_id,

                targetId:
                  targetResult
                    .rows[0]
                    .id,

                executionAuthorized:
                  false,

                ...(
                  input
                    .routingMetadata ||
                  {}
                ),
              }),
            ]
          );


        await this
          .#insertEvent(
            client,
            resolved,
            {
              escalation:
                result.rows[0],

              eventType:
                "ACK_TIMEOUT_RETRY_SCHEDULED",

              attemptNumber:
                Number(
                  result
                    .rows[0]
                    .delivery_attempt_count ||
                  0
                ),

              targetId:
                targetResult
                  .rows[0]
                  .id,

              actorUserId:
                input.actorUserId ||
                null,

              metadata: {
                acknowledgementTimeoutSeconds,

                executionAuthorized:
                  false,
              },
            }
          );


        return mapEscalation(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async markRetryExhausted(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(
        input
      );


    requireValue(
      input.escalationId,
      "escalationId",
      "HUMAN_ESCALATION_ID_REQUIRED"
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
              UPDATE
                human_operations.escalations

              SET
                status =
                  'FAILED',

                acknowledgement_timeout_count =
                  acknowledgement_timeout_count + 1,

                next_delivery_attempt_at =
                  NULL,

                metadata =
                  metadata ||
                  $2::jsonb

              WHERE
                public_id = $1
                OR id::text = $1

              RETURNING *
            `,
            [
              String(
                input
                  .escalationId
              ),

              JSON.stringify({
                retryExhausted:
                  true,

                requiresHumanReview:
                  true,

                executionAuthorized:
                  false,

                ...(
                  input.metadata ||
                  {}
                ),
              }),
            ]
          );


        if (
          !result.rows[0]
        ) {
          throw createError(
            `Escalation not found: ${input.escalationId}`,
            "HUMAN_ESCALATION_NOT_FOUND",
            404
          );
        }


        await this
          .#insertEvent(
            client,
            resolved,
            {
              escalation:
                result.rows[0],

              eventType:
                "ACK_RETRY_EXHAUSTED",

              attemptNumber:
                Number(
                  result
                    .rows[0]
                    .delivery_attempt_count ||
                  0
                ),

              targetId:
                result
                  .rows[0]
                  .selected_target_id,

              actorUserId:
                input.actorUserId ||
                null,

              metadata: {
                requiresHumanReview:
                  true,

                executionAuthorized:
                  false,
              },
            }
          );


        return mapEscalation(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async listEvents(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(
        input
      );


    requireValue(
      input.escalationId,
      "escalationId",
      "HUMAN_ESCALATION_ID_REQUIRED"
    );


    return this.scope.run(
      scope,

      async (
        client
      ) => {
        const result =
          await client.query(
            `
              SELECT
                ee.*

              FROM
                human_operations.escalation_events ee

              JOIN
                human_operations.escalations e
                  ON e.id =
                    ee.escalation_id

              WHERE
                e.public_id = $1
                OR e.id::text = $1

              ORDER BY
                ee.created_at ASC,
                ee.id ASC
            `,
            [
              String(
                input
                  .escalationId
              ),
            ]
          );


        return result.rows.map(
          (
            row
          ) => ({
            id:
              row.id,

            publicId:
              row.public_id,

            escalationId:
              row.escalation_id,

            incidentId:
              row.incident_id,

            taskId:
              row.task_id,

            eventType:
              row.event_type,

            attemptNumber:
              Number(
                row
                  .attempt_number ||
                0
              ),

            targetId:
              row.target_id,

            actorUserId:
              row.actor_user_id,

            metadata:
              row.metadata ||
              {},

            executionAuthorized:
              row.execution_authorized ===
              true,

            createdAt:
              row.created_at,
          })
        );
      },

      transaction
    );
  }


  async #insertEvent(
    client,
    resolved,
    input
  ) {
    const escalation =
      input.escalation;


    await client.query(
      `
        INSERT INTO
          human_operations.escalation_events (
            public_id,

            organization_id,
            environment_id,

            escalation_id,
            incident_id,
            task_id,

            event_type,
            attempt_number,
            target_id,

            actor_user_id,

            metadata,

            execution_authorized
          )

        VALUES (
          $1,$2,$3,$4,$5,$6,
          $7,$8,$9,$10,
          $11::jsonb,
          FALSE
        )
      `,
      [
        publicId(
          "escev"
        ),

        resolved
          .organizationUuid,

        resolved
          .environmentUuid,

        escalation.id,

        escalation
          .incident_id,

        escalation
          .task_id ||
          null,

        input.eventType,

        Number(
          input
            .attemptNumber ||
          0
        ),

        input.targetId ||
          null,

        input.actorUserId ||
          null,

        JSON.stringify({
          ...(
            input.metadata ||
            {}
          ),

          executionAuthorized:
            false,
        }),
      ]
    );
  }
}


module.exports =
  PostgresHumanEscalationRuntimeRepository;