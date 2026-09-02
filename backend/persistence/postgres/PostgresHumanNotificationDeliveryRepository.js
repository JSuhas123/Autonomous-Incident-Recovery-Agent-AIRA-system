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
  HUMAN_NOTIFICATION_ATTEMPT_STATUS,
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
  input =
    {}
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


function publicId(
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


function mapRequest(
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


class PostgresHumanNotificationDeliveryRepository {
  constructor(
    options =
      {}
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


  async getRequest(
    input =
      {},
    transaction =
      null
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


        return mapRequest(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async beginAttempt(
    input =
      {},
    transaction =
      null
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
        const found =
          await client.query(
            `
              SELECT *
              FROM notifications.requests

              WHERE
                public_id = $1
                OR id::text = $1

              LIMIT 1

              FOR UPDATE
            `,
            [
              String(
                input.notificationRequestId
              ),
            ]
          );


        const request =
          found.rows[0];


        if (
          !request
        ) {
          throw createError(
            `Notification request not found: ${input.notificationRequestId}`,
            "HUMAN_NOTIFICATION_REQUEST_NOT_FOUND",
            404
          );
        }


        if (
          request.execution_authorized ===
          true
        ) {
          throw createError(
            "Notification request attempted to contain execution authority",
            "HUMAN_NOTIFICATION_AUTHORITY_VIOLATION"
          );
        }


        if (
          request.status ===
          HUMAN_NOTIFICATION_STATUS
            .DELIVERED
        ) {
          return {
            started:
              false,

            duplicate:
              true,

            terminal:
              true,

            deadLettered:
              false,

            request:
              mapRequest(
                request,
                resolved
              ),

            executionAuthorized:
              false,
          };
        }


        if (
          [
            HUMAN_NOTIFICATION_STATUS
              .DEAD_LETTER,

            HUMAN_NOTIFICATION_STATUS
              .CANCELLED,
          ].includes(
            request.status
          )
        ) {
          return {
            started:
              false,

            duplicate:
              false,

            terminal:
              true,

            deadLettered:
              request.status ===
              HUMAN_NOTIFICATION_STATUS
                .DEAD_LETTER,

            request:
              mapRequest(
                request,
                resolved
              ),

            executionAuthorized:
              false,
          };
        }


        const attemptCount =
          Number(
            request.attempt_count ||
            0
          );


        const maxAttempts =
          Number(
            request.max_attempts ||
            3
          );


        if (
          attemptCount >=
          maxAttempts
        ) {
          const exhausted =
            await client.query(
              `
                UPDATE notifications.requests

                SET
                  status =
                    'DEAD_LETTER',

                  dead_lettered_at =
                    COALESCE(
                      dead_lettered_at,
                      NOW()
                    ),

                  metadata =
                    metadata ||
                    $2::jsonb

                WHERE id = $1

                RETURNING *
              `,
              [
                request.id,

                JSON.stringify({
                  retryExhausted:
                    true,

                  executionAuthorized:
                    false,
                }),
              ]
            );


          return {
            started:
              false,

            duplicate:
              false,

            terminal:
              true,

            deadLettered:
              true,

            request:
              mapRequest(
                exhausted.rows[0],
                resolved
              ),

            executionAuthorized:
              false,
          };
        }


        const attemptNumber =
          attemptCount +
          1;


        const updated =
          await client.query(
            `
              UPDATE notifications.requests

              SET
                status =
                  'DELIVERING',

                attempt_count =
                  $2

              WHERE id = $1

              RETURNING *
            `,
            [
              request.id,

              attemptNumber,
            ]
          );


        const attempt =
          await client.query(
            `
              INSERT INTO notifications.delivery_attempts (
                public_id,

                organization_id,
                environment_id,

                notification_request_id,

                attempt_number,

                status,

                broker_message_id,

                execution_authorized
              )

              VALUES (
                $1,$2,$3,$4,$5,$6,$7,FALSE
              )

              ON CONFLICT (
                organization_id,
                environment_id,
                notification_request_id,
                attempt_number
              )

              DO NOTHING

              RETURNING *
            `,
            [
              publicId(
                "natm"
              ),

              resolved.organizationUuid,

              resolved.environmentUuid,

              request.id,

              attemptNumber,

              HUMAN_NOTIFICATION_ATTEMPT_STATUS
                .STARTED,

              input.brokerMessageId ||
              null,
            ]
          );


        /*
         * The request row is locked, therefore under normal processing an
         * attempt conflict cannot happen. This fallback still fails safely.
         */
        if (
          !attempt.rows[0]
        ) {
          throw createError(
            "Notification delivery attempt already exists",
            "HUMAN_NOTIFICATION_ATTEMPT_CONFLICT"
          );
        }


        return {
          started:
            true,

          duplicate:
            false,

          terminal:
            false,

          deadLettered:
            false,

          attempt: {
            id:
              attempt.rows[0].id,

            publicId:
              attempt.rows[0]
                .public_id,

            attemptNumber,

            status:
              attempt.rows[0]
                .status,

            executionAuthorized:
              false,
          },

          request:
            mapRequest(
              updated.rows[0],
              resolved
            ),

          executionAuthorized:
            false,
        };
      },

      transaction
    );
  }


  async markDelivered(
    input =
      {},
    transaction =
      null
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
      input.attemptId,
      "attemptId",
      "HUMAN_NOTIFICATION_ATTEMPT_REQUIRED"
    );


    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const request =
          await client.query(
            `
              SELECT *
              FROM notifications.requests

              WHERE
                public_id = $1
                OR id::text = $1

              LIMIT 1

              FOR UPDATE
            `,
            [
              String(
                input.notificationRequestId
              ),
            ]
          );


        if (
          !request.rows[0]
        ) {
          throw createError(
            "Notification request not found",
            "HUMAN_NOTIFICATION_REQUEST_NOT_FOUND",
            404
          );
        }


        await client.query(
          `
            UPDATE notifications.delivery_attempts

            SET
              status =
                'DELIVERED',

              provider =
                $2,

              integration_id =
                $3,

              channel_type =
                $4,

              destination_ref =
                $5,

              provider_result =
                $6::jsonb,

              completed_at =
                NOW()

            WHERE
              notification_request_id =
                $1

              AND
              (
                public_id = $7
                OR id::text = $7
              )
          `,
          [
            request.rows[0].id,

            input.provider ||
            null,

            input.integrationId ||
            null,

            input.channelType ||
            null,

            input.destinationRef ||
            null,

            JSON.stringify(
              input.providerResult ||
              {}
            ),

            String(
              input.attemptId
            ),
          ]
        );


        const updated =
          await client.query(
            `
              UPDATE notifications.requests

              SET
                status =
                  'DELIVERED',

                delivered_at =
                  COALESCE(
                    delivered_at,
                    NOW()
                  ),

                failed_at =
                  NULL,

                metadata =
                  metadata ||
                  $2::jsonb

              WHERE id = $1

              RETURNING *
            `,
            [
              request.rows[0].id,

              JSON.stringify({
                delivered:
                  true,

                executionAuthorized:
                  false,
              }),
            ]
          );


        return mapRequest(
          updated.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async markFailed(
    input =
      {},
    transaction =
      null
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
      input.attemptId,
      "attemptId",
      "HUMAN_NOTIFICATION_ATTEMPT_REQUIRED"
    );


    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const found =
          await client.query(
            `
              SELECT *
              FROM notifications.requests

              WHERE
                public_id = $1
                OR id::text = $1

              LIMIT 1

              FOR UPDATE
            `,
            [
              String(
                input.notificationRequestId
              ),
            ]
          );


        const request =
          found.rows[0];


        if (
          !request
        ) {
          throw createError(
            "Notification request not found",
            "HUMAN_NOTIFICATION_REQUEST_NOT_FOUND",
            404
          );
        }


        const exhausted =
          Number(
            request.attempt_count ||
            0
          ) >=
          Number(
            request.max_attempts ||
            3
          );


        await client.query(
          `
            UPDATE notifications.delivery_attempts

            SET
              status =
                'FAILED',

              provider =
                $2,

              integration_id =
                $3,

              channel_type =
                $4,

              destination_ref =
                $5,

              failure =
                $6::jsonb,

              completed_at =
                NOW()

            WHERE
              notification_request_id =
                $1

              AND
              (
                public_id = $7
                OR id::text = $7
              )
          `,
          [
            request.id,

            input.provider ||
            null,

            input.integrationId ||
            null,

            input.channelType ||
            null,

            input.destinationRef ||
            null,

            JSON.stringify({
              message:
                input.error?.message ||
                "Notification delivery failed",

              code:
                input.error?.code ||
                null,

              retryable:
                input.retryable !==
                false,

              executionAuthorized:
                false,
            }),

            String(
              input.attemptId
            ),
          ]
        );


        const updated =
          await client.query(
            `
              UPDATE notifications.requests

              SET
                status =
                  $2,

                failed_at =
                  NOW(),

                dead_lettered_at =
                  CASE
                    WHEN $2 =
                      'DEAD_LETTER'
                    THEN
                      COALESCE(
                        dead_lettered_at,
                        NOW()
                      )
                    ELSE
                      dead_lettered_at
                  END,

                metadata =
                  metadata ||
                  $3::jsonb

              WHERE id = $1

              RETURNING *
            `,
            [
              request.id,

              exhausted
                ? HUMAN_NOTIFICATION_STATUS
                    .DEAD_LETTER
                : HUMAN_NOTIFICATION_STATUS
                    .FAILED,

              JSON.stringify({
                lastFailureCode:
                  input.error?.code ||
                  null,

                retryExhausted:
                  exhausted,

                executionAuthorized:
                  false,
              }),
            ]
          );


        return {
          request:
            mapRequest(
              updated.rows[0],
              resolved
            ),

          deadLettered:
            exhausted,

          retryable:
            !exhausted &&
            input.retryable !==
              false,

          executionAuthorized:
            false,
        };
      },

      transaction
    );
  }
}


module.exports =
  PostgresHumanNotificationDeliveryRepository;