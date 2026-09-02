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
  HUMAN_NOTIFICATION_STATUS,
} =
  require(
    "../../constants/humanNotification"
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
  field,
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
      `${field} is required`,
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
    "HUMAN_NOTIFICATION_ORGANIZATION_REQUIRED"
  );


  requireValue(
    input.environmentId,
    "environmentId",
    "HUMAN_NOTIFICATION_ENVIRONMENT_REQUIRED"
  );


  return {
    organizationId:
      input.organizationId,

    environmentId:
      input.environmentId,
  };
}


function createPublicId(
  prefix
) {
  return (
    `${prefix}_` +
    crypto
      .randomBytes(
        12
      )
      .toString(
        "hex"
      )
  );
}


function mapRow(
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

    humanTaskId:
      row.human_task_id,

    assignmentId:
      row.assignment_id,

    notificationEventType:
      row.notification_event_type,

    severity:
      row.severity,

    status:
      row.status,

    attemptCount:
      Number(
        row.attempt_count ||
        0
      ),

    maxAttempts:
      Number(
        row.max_attempts ||
        0
      ),

    targetType:
      row.target_type,

    targetRef:
      row.target_ref,

    targetSnapshot:
      row.target_snapshot ||
      {},

    title:
      row.title,

    message:
      row.message,

    payload:
      row.payload ||
      {},

    metadata:
      row.metadata ||
      {},

    outboxEventId:
      row.outbox_event_id,

    outboxEventKey:
      row.outbox_event_key,

    correlationId:
      row.correlation_id,

    acknowledgementDeadline:
      row.acknowledgement_deadline,

    queuedAt:
      row.queued_at,

    deliveredAt:
      row.delivered_at,

    failedAt:
      row.failed_at,

    deadLetteredAt:
      row.dead_lettered_at,

    cancelledAt:
      row.cancelled_at,

    executionAuthorized:
      row.execution_authorized ===
      true,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}


class PostgresHumanNotificationRepository {
  constructor(
    options = {}
  ) {
    this.scope =
      options.scope ||

      options.tenantScope ||

      new PostgresTenantScope({
        pool:
          options.pool ||
          null,
      });
  }


  async createOrGetRequest(
    input = {},
    transaction = null
  ) {
    const scope =
      requireScope(
        input
      );


    requireValue(
      input.incidentId,
      "incidentId",
      "HUMAN_NOTIFICATION_INCIDENT_REQUIRED"
    );


    requireValue(
      input.escalationId,
      "escalationId",
      "HUMAN_NOTIFICATION_ESCALATION_REQUIRED"
    );


    requireValue(
      input.notificationEventType,
      "notificationEventType",
      "HUMAN_NOTIFICATION_EVENT_TYPE_REQUIRED"
    );


    requireValue(
      input.title,
      "title",
      "HUMAN_NOTIFICATION_TITLE_REQUIRED"
    );


    requireValue(
      input.message,
      "message",
      "HUMAN_NOTIFICATION_MESSAGE_REQUIRED"
    );


    const targetRef =
      input.targetRef ||
      null;


    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const existing =
          await client.query(
            `
              SELECT *
              FROM notifications.requests

              WHERE
                escalation_id = $1

                AND
                notification_event_type = $2

                AND
                target_ref IS NOT DISTINCT FROM $3

              LIMIT 1
            `,
            [
              String(
                input.escalationId
              ),

              input.notificationEventType,

              targetRef,
            ]
          );


        if (
          existing.rows[0]
        ) {
          return {
            created:
              false,

            duplicate:
              true,

            request:
              mapRow(
                existing.rows[0],
                resolved
              ),
          };
        }


        try {
          const result =
            await client.query(
              `
                INSERT INTO notifications.requests (
                  public_id,

                  organization_id,
                  environment_id,

                  incident_id,
                  escalation_id,
                  human_task_id,
                  assignment_id,

                  notification_event_type,
                  severity,
                  status,

                  attempt_count,
                  max_attempts,

                  target_type,
                  target_ref,
                  target_snapshot,

                  title,
                  message,

                  payload,
                  metadata,

                  correlation_id,
                  acknowledgement_deadline,

                  execution_authorized
                )

                VALUES (
                  $1,$2,$3,$4,$5,$6,$7,
                  $8,$9,$10,$11,$12,$13,$14,
                  $15::jsonb,$16,$17,$18::jsonb,$19::jsonb,
                  $20,$21,FALSE
                )

                RETURNING *
              `,
              [
                input.publicId ||
                createPublicId(
                  "nreq"
                ),

                resolved.organizationUuid,
                resolved.environmentUuid,

                String(
                  input.incidentId
                ),

                String(
                  input.escalationId
                ),

                input.humanTaskId ||
                null,

                input.assignmentId ||
                null,

                input.notificationEventType,

                String(
                  input.severity ||
                  "HIGH"
                ).toUpperCase(),

                HUMAN_NOTIFICATION_STATUS
                  .PENDING_OUTBOX,

                0,

                Math.max(
                  1,

                  Number.parseInt(
                    input.maxAttempts,
                    10
                  ) ||
                  3
                ),

                input.targetType ||
                null,

                targetRef,

                JSON.stringify(
                  input.targetSnapshot ||
                  {}
                ),

                String(
                  input.title
                ),

                String(
                  input.message
                ),

                JSON.stringify(
                  input.payload ||
                  {}
                ),

                JSON.stringify({
                  ...(
                    input.metadata ||
                    {}
                  ),

                  executionAuthorized:
                    false,
                }),

                input.correlationId ||
                null,

                input.acknowledgementDeadline ||
                null,
              ]
            );


          return {
            created:
              true,

            duplicate:
              false,

            request:
              mapRow(
                result.rows[0],
                resolved
              ),
          };
        } catch (
          error
        ) {
          if (
            error?.code !==
            "23505"
          ) {
            throw error;
          }


          const raced =
            await client.query(
              `
                SELECT *
                FROM notifications.requests

                WHERE
                  escalation_id = $1

                  AND
                  notification_event_type = $2

                  AND
                  target_ref IS NOT DISTINCT FROM $3

                LIMIT 1
              `,
              [
                String(
                  input.escalationId
                ),

                input.notificationEventType,

                targetRef,
              ]
            );


          if (
            !raced.rows[0]
          ) {
            throw error;
          }


          return {
            created:
              false,

            duplicate:
              true,

            raced:
              true,

            request:
              mapRow(
                raced.rows[0],
                resolved
              ),
          };
        }
      },

      transaction
    );
  }


  async getRequest(
    input = {},
    transaction = null
  ) {
    const scope =
      requireScope(
        input
      );


    requireValue(
      input.notificationRequestId,
      "notificationRequestId",
      "HUMAN_NOTIFICATION_REQUEST_REQUIRED"
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
              FROM notifications.requests

              WHERE
                public_id = $1
                OR id::text = $1

              LIMIT 1
            `,
            [
              String(
                input.notificationRequestId
              ),
            ]
          );


        return mapRow(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async markQueued(
    input = {},
    transaction = null
  ) {
    const scope =
      requireScope(
        input
      );


    requireValue(
      input.notificationRequestId,
      "notificationRequestId",
      "HUMAN_NOTIFICATION_REQUEST_REQUIRED"
    );


    requireValue(
      input.outboxEventId,
      "outboxEventId",
      "HUMAN_NOTIFICATION_OUTBOX_EVENT_REQUIRED"
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
              UPDATE notifications.requests

              SET
                status =
                  'QUEUED',

                outbox_event_id =
                  $2,

                outbox_event_key =
                  $3,

                queued_at =
                  COALESCE(
                    queued_at,
                    NOW()
                  ),

                metadata =
                  metadata ||
                  $4::jsonb

              WHERE
                public_id = $1
                OR id::text = $1

              RETURNING *
            `,
            [
              String(
                input.notificationRequestId
              ),

              String(
                input.outboxEventId
              ),

              input.outboxEventKey ||
              null,

              JSON.stringify({
                workflowOutboxPersisted:
                  true,

                executionAuthorized:
                  false,
              }),
            ]
          );


        if (
          !result.rows[0]
        ) {
          throw createError(
            `Notification request not found: ${input.notificationRequestId}`,
            "HUMAN_NOTIFICATION_REQUEST_NOT_FOUND",
            404
          );
        }


        return mapRow(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }
}


module.exports =
  PostgresHumanNotificationRepository;