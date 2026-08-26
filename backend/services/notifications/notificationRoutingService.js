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

const NotificationService =
  require(
    "../notificationService"
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


const NOTIFICATION_SEVERITIES =
  Object.freeze([
    "CRITICAL",
    "HIGH",
    "MEDIUM",
    "LOW",
    "INFO",
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


function createPublicId(
  prefix
) {
  return (
    prefix +
    "_" +
    crypto
      .randomBytes(
        12
      )
      .toString(
        "hex"
      )
  );
}


function ensureSafeConfiguration(
  configuration =
    {}
) {
  const forbidden =
    [
      "password",
      "secret",
      "token",
      "apiKey",
      "api_key",
      "accessToken",
      "access_token",
      "clientSecret",
      "client_secret",
    ];

  const serialized =
    JSON.stringify(
      configuration
    ).toLowerCase();

  for (
    const key
    of forbidden
  ) {
    if (
      serialized.includes(
        `"${key.toLowerCase()}"`
      )
    ) {
      throw createError(
        "Notification channel secrets must not be stored in routing configuration",
        422,
        "NOTIFICATION_SECRET_CONFIGURATION_FORBIDDEN"
      );
    }
  }
}


async function listChannels(
  organizationId
) {
  const result =
    await getPostgresPool()
      .query(
        `
          SELECT
            public_id,
            name,
            channel_type,
            status,
            destination,
            configuration,
            metadata,
            created_at,
            updated_at
          FROM notifications.channels
          WHERE organization_id = $1
          ORDER BY created_at DESC
        `,
        [
          organizationId,
        ]
      );

  return result.rows;
}


async function createChannel({
  organizationId,
  actorUserId,
  name,
  channelType,
  destination,
  configuration =
    {},
  metadata =
    {},
}) {
  ensureSafeConfiguration(
    configuration
  );

  if (
    ![
      "email",
      "slack",
      "pagerduty",
      "webhook",
    ].includes(
      channelType
    )
  ) {
    throw createError(
      "Unsupported notification channel",
      422,
      "NOTIFICATION_CHANNEL_TYPE_INVALID"
    );
  }

  const result =
    await getPostgresPool()
      .query(
        `
          INSERT INTO notifications.channels (
            public_id,
            organization_id,
            name,
            channel_type,
            destination,
            configuration,
            metadata,
            created_by_user_id,
            updated_by_user_id
          )
          VALUES (
            $1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$8
          )
          RETURNING *
        `,
        [
          createPublicId(
            "nch"
          ),

          organizationId,
          String(
            name ||
            ""
          ).trim(),

          channelType,

          String(
            destination ||
            ""
          ).trim(),

          JSON.stringify(
            configuration
          ),

          JSON.stringify(
            metadata
          ),

          actorUserId,
        ]
      );

  await auditRecord(
    AUTH_EVENT_TYPES
      .NOTIFICATION_CHANNEL_CREATED,
    AUTH_EVENT_OUTCOMES
      .SUCCESS,
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        channelId:
          result.rows[0]
            .public_id,

        channelType,
      },
    }
  ).catch(
    () => {}
  );

  return result.rows[0];
}


async function updateChannel({
  organizationId,
  channelId,
  actorUserId,
  updates =
    {},
}) {
  if (
    updates.configuration !==
      undefined
  ) {
    ensureSafeConfiguration(
      updates.configuration
    );
  }

  const current =
    await getPostgresPool()
      .query(
        `
          SELECT *
          FROM notifications.channels
          WHERE
            organization_id = $1
            AND (
              public_id = $2
              OR id::text = $2
            )
          LIMIT 1
        `,
        [
          organizationId,
          channelId,
        ]
      );

  if (
    !current.rows[0]
  ) {
    throw createError(
      "Notification channel not found",
      404,
      "NOTIFICATION_CHANNEL_NOT_FOUND"
    );
  }

  const row =
    current.rows[0];

  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE notifications.channels
          SET
            name = COALESCE($3, name),
            status = COALESCE($4, status),
            destination = COALESCE($5, destination),
            configuration =
              COALESCE(
                $6::jsonb,
                configuration
              ),
            metadata =
              COALESCE(
                $7::jsonb,
                metadata
              ),
            updated_by_user_id = $8
          WHERE
            organization_id = $1
            AND id = $2
          RETURNING *
        `,
        [
          organizationId,
          row.id,

          updates.name ??
            null,

          updates.status ??
            null,

          updates.destination ??
            null,

          updates.configuration !==
            undefined
            ? JSON.stringify(
                updates.configuration
              )
            : null,

          updates.metadata !==
            undefined
            ? JSON.stringify(
                updates.metadata
              )
            : null,

          actorUserId,
        ]
      );

  await auditRecord(
    AUTH_EVENT_TYPES
      .NOTIFICATION_CHANNEL_UPDATED,
    AUTH_EVENT_OUTCOMES
      .SUCCESS,
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        channelId:
          row.public_id,
      },
    }
  ).catch(
    () => {}
  );

  return result.rows[0];
}


async function listRules(
  organizationId
) {
  const result =
    await getPostgresPool()
      .query(
        `
          SELECT *
          FROM notifications.routing_rules
          WHERE organization_id = $1
          ORDER BY priority ASC, created_at ASC
        `,
        [
          organizationId,
        ]
      );

  return result.rows;
}


async function createRule({
  organizationId,
  environmentId =
    null,
  actorUserId,
  name,
  enabled =
    true,
  priority =
    100,
  eventTypes =
    [],
  severities =
    [],
  channelIds =
    [],
  stopProcessing =
    false,
  metadata =
    {},
}) {
  const normalizedSeverities =
    severities.map(
      (value) =>
        String(
          value
        ).toUpperCase()
    );

  for (
    const severity
    of normalizedSeverities
  ) {
    if (
      !NOTIFICATION_SEVERITIES
        .includes(
          severity
        )
    ) {
      throw createError(
        `Unknown notification severity: ${severity}`,
        422,
        "NOTIFICATION_SEVERITY_INVALID"
      );
    }
  }

  const result =
    await getPostgresPool()
      .query(
        `
          INSERT INTO notifications.routing_rules (
            public_id,
            organization_id,
            environment_id,
            name,
            enabled,
            priority,
            event_types,
            severities,
            channel_ids,
            stop_processing,
            metadata,
            created_by_user_id,
            updated_by_user_id
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,
            $7::jsonb,$8::jsonb,$9::jsonb,
            $10,$11::jsonb,$12,$12
          )
          RETURNING *
        `,
        [
          createPublicId(
            "nrule"
          ),

          organizationId,
          environmentId,
          name,
          enabled,
          priority,

          JSON.stringify(
            eventTypes
          ),

          JSON.stringify(
            normalizedSeverities
          ),

          JSON.stringify(
            channelIds
          ),

          stopProcessing,

          JSON.stringify(
            metadata
          ),

          actorUserId,
        ]
      );

  await auditRecord(
    AUTH_EVENT_TYPES
      .NOTIFICATION_RULE_CREATED,
    AUTH_EVENT_OUTCOMES
      .SUCCESS,
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        ruleId:
          result.rows[0]
            .public_id,

        environmentId,
      },
    }
  ).catch(
    () => {}
  );

  return result.rows[0];
}


async function updateRule({
  organizationId,
  ruleId,
  actorUserId,
  updates =
    {},
}) {
  const current =
    await getPostgresPool()
      .query(
        `
          SELECT *
          FROM notifications.routing_rules
          WHERE
            organization_id = $1
            AND (
              public_id = $2
              OR id::text = $2
            )
          LIMIT 1
        `,
        [
          organizationId,
          ruleId,
        ]
      );

  if (
    !current.rows[0]
  ) {
    throw createError(
      "Notification routing rule not found",
      404,
      "NOTIFICATION_RULE_NOT_FOUND"
    );
  }

  const row =
    current.rows[0];

  const severities =
    updates.severities !==
      undefined
      ? updates.severities.map(
          (value) =>
            String(
              value
            ).toUpperCase()
        )
      : null;

  if (
    severities
  ) {
    for (
      const severity
      of severities
    ) {
      if (
        !NOTIFICATION_SEVERITIES
          .includes(
            severity
          )
      ) {
        throw createError(
          `Unknown notification severity: ${severity}`,
          422,
          "NOTIFICATION_SEVERITY_INVALID"
        );
      }
    }
  }

  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE notifications.routing_rules
          SET
            name = COALESCE($3, name),
            enabled = COALESCE($4, enabled),
            priority = COALESCE($5, priority),
            event_types =
              COALESCE(
                $6::jsonb,
                event_types
              ),
            severities =
              COALESCE(
                $7::jsonb,
                severities
              ),
            channel_ids =
              COALESCE(
                $8::jsonb,
                channel_ids
              ),
            stop_processing =
              COALESCE(
                $9,
                stop_processing
              ),
            metadata =
              COALESCE(
                $10::jsonb,
                metadata
              ),
            updated_by_user_id =
              $11
          WHERE
            organization_id = $1
            AND id = $2
          RETURNING *
        `,
        [
          organizationId,
          row.id,

          updates.name ??
            null,

          updates.enabled ??
            null,

          updates.priority ??
            null,

          updates.eventTypes !==
            undefined
            ? JSON.stringify(
                updates.eventTypes
              )
            : null,

          severities !==
            null
            ? JSON.stringify(
                severities
              )
            : null,

          updates.channelIds !==
            undefined
            ? JSON.stringify(
                updates.channelIds
              )
            : null,

          updates.stopProcessing ??
            null,

          updates.metadata !==
            undefined
            ? JSON.stringify(
                updates.metadata
              )
            : null,

          actorUserId,
        ]
      );

  return result.rows[0];
}


function ruleMatches(
  rule,
  notification
) {
  const eventTypes =
    Array.isArray(
      rule.event_types
    )
      ? rule.event_types
      : [];

  const severities =
    Array.isArray(
      rule.severities
    )
      ? rule.severities
      : [];

  const eventMatches =
    eventTypes.length ===
      0 ||
    eventTypes.includes(
      notification.eventType
    );

  const severityMatches =
    severities.length ===
      0 ||
    severities.includes(
      String(
        notification.severity ||
        "INFO"
      ).toUpperCase()
    );

  return (
    eventMatches &&
    severityMatches
  );
}


async function resolveRoutes(
  notification
) {
  const result =
    await getPostgresPool()
      .query(
        `
          SELECT *
          FROM notifications.routing_rules
          WHERE
            organization_id = $1
            AND enabled = TRUE
            AND (
              environment_id IS NULL
              OR environment_id = $2
            )
          ORDER BY
            priority ASC,
            created_at ASC
        `,
        [
          notification
            .organizationId,

          notification
            .environmentId,
        ]
      );

  const channelIds =
    [];

  for (
    const rule
    of result.rows
  ) {
    if (
      !ruleMatches(
        rule,
        notification
      )
    ) {
      continue;
    }

    for (
      const channelId
      of (
        rule.channel_ids ||
        []
      )
    ) {
      if (
        !channelIds.includes(
          channelId
        )
      ) {
        channelIds.push(
          channelId
        );
      }
    }

    if (
      rule.stop_processing
    ) {
      break;
    }
  }

  if (
    channelIds.length ===
      0
  ) {
    return [];
  }

  const channels =
    await getPostgresPool()
      .query(
        `
          SELECT *
          FROM notifications.channels
          WHERE
            organization_id = $1
            AND status = 'active'
            AND (
              public_id = ANY($2::text[])
              OR id::text = ANY($2::text[])
            )
        `,
        [
          notification
            .organizationId,

          channelIds,
        ]
      );

  return channels.rows;
}


async function createDelivery({
  notification,
  channel,
}) {
  const result =
    await getPostgresPool()
      .query(
        `
          INSERT INTO notifications.deliveries (
            public_id,
            organization_id,
            environment_id,
            notification_id,
            incident_id,
            human_task_id,
            escalation_id,
            event_type,
            severity,
            channel_id,
            channel_type,
            destination
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
          )
          RETURNING *
        `,
        [
          createPublicId(
            "ndel"
          ),

          notification
            .organizationId,

          notification
            .environmentId ||
          null,

          notification
            .notificationId ||
          null,

          notification
            .incidentId ||
          null,

          notification
            .humanTaskId ||
          null,

          notification
            .escalationId ||
          null,

          notification
            .eventType,

          notification
            .severity ||
          "INFO",

          channel.id,

          channel
            .channel_type,

          channel
            .destination,
        ]
      );

  return result.rows[0];
}


async function routeNotification(
  notification
) {
  if (
    !notification
      ?.organizationId ||
    !notification
      ?.eventType
  ) {
    throw createError(
      "Notification requires organization and event type",
      400,
      "NOTIFICATION_ROUTE_INPUT_INVALID"
    );
  }

  const channels =
    await resolveRoutes(
      notification
    );

  const results =
    [];

  for (
    const channel
    of channels
  ) {
    const delivery =
      await createDelivery({
        notification,
        channel,
      });

    try {
      const providerResult =
        await NotificationService
          .send(
            notification
              .tenantId ||
            notification
              .organizationId,
            {
              channel:
                channel
                  .channel_type,

              recipient:
                channel
                  .destination,

              subject:
                notification
                  .title,

              message:
                notification
                  .message,

              priority:
                String(
                  notification
                    .severity ||
                  "INFO"
                ).toLowerCase(),
            }
          );

      await getPostgresPool()
        .query(
          `
            UPDATE notifications.deliveries
            SET
              status = 'delivered',
              attempt_count =
                attempt_count + 1,
              provider_result =
                $2::jsonb,
              delivered_at =
                NOW()
            WHERE id = $1
          `,
          [
            delivery.id,

            JSON.stringify(
              providerResult ||
              {}
            ),
          ]
        );

      results.push({
        channelId:
          channel.public_id,

        delivered:
          true,

        providerResult,
      });

      auditRecord(
        AUTH_EVENT_TYPES
          .NOTIFICATION_DELIVERED,
        AUTH_EVENT_OUTCOMES
          .SUCCESS,
        {
          organizationId:
            notification
              .organizationId,

          metadata: {
            eventType:
              notification
                .eventType,

            channelId:
              channel
                .public_id,
          },
        }
      ).catch(
        () => {}
      );
    } catch (
      error
    ) {
      await getPostgresPool()
        .query(
          `
            UPDATE notifications.deliveries
            SET
              status = 'failed',
              attempt_count =
                attempt_count + 1,
              failure =
                $2::jsonb
            WHERE id = $1
          `,
          [
            delivery.id,

            JSON.stringify({
              message:
                error.message,

              code:
                error.code ||
                null,
            }),
          ]
        );

      results.push({
        channelId:
          channel.public_id,

        delivered:
          false,

        error:
          error.message,
      });

      auditRecord(
        AUTH_EVENT_TYPES
          .NOTIFICATION_DELIVERY_FAILED,
        AUTH_EVENT_OUTCOMES
          .FAILURE,
        {
          organizationId:
            notification
              .organizationId,

          metadata: {
            eventType:
              notification
                .eventType,

            channelId:
              channel
                .public_id,

            error:
              error.message,
          },
        }
      ).catch(
        () => {}
      );
    }
  }

  return {
    routed:
      channels.length >
      0,

    attempted:
      channels.length,

    results,
  };
}


module.exports = {
  NOTIFICATION_SEVERITIES,

  listChannels,
  createChannel,
  updateChannel,

  listRules,
  createRule,
  updateRule,

  ruleMatches,
  resolveRoutes,
  routeNotification,

  ensureSafeConfiguration,
};