"use strict";


const PostgresTenantScope =
  require(
    "../../persistence/postgres/PostgresTenantScope"
  );


const PRODUCT_NOTIFICATION_KINDS =
  Object.freeze([
    "incident",
    "approval",
    "human_task",
    "recovery",
    "trust",
    "certification",
    "integration",
    "policy",
    "security",
    "onboarding",
    "system",
  ]);


const PRODUCT_NOTIFICATION_SEVERITIES =
  Object.freeze([
    "CRITICAL",
    "HIGH",
    "MEDIUM",
    "LOW",
    "INFO",
  ]);


function createError(
  message,
  code,
  status = 400
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
  field
) {
  if (
    value === undefined ||
    value === null ||
    String(
      value
    ).trim() === ""
  ) {
    throw createError(
      `${field} is required`,
      "PRODUCT_NOTIFICATION_FIELD_REQUIRED",
      422
    );
  }


  return value;
}


function normalizeKind(
  value
) {
  const normalized =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();


  if (
    !PRODUCT_NOTIFICATION_KINDS
      .includes(
        normalized
      )
  ) {
    throw createError(
      `Unsupported notification kind: ${normalized}`,
      "PRODUCT_NOTIFICATION_KIND_INVALID",
      422
    );
  }


  return normalized;
}


function normalizeSeverity(
  value
) {
  const normalized =
    String(
      value || "INFO"
    )
      .trim()
      .toUpperCase();


  if (
    !PRODUCT_NOTIFICATION_SEVERITIES
      .includes(
        normalized
      )
  ) {
    throw createError(
      `Unsupported notification severity: ${normalized}`,
      "PRODUCT_NOTIFICATION_SEVERITY_INVALID",
      422
    );
  }


  return normalized;
}


function normalizeTarget(
  input = {}
) {
  const targetType =
    String(
      input.targetType ||
      "organization"
    )
      .trim()
      .toLowerCase();


  if (
    ![
      "organization",
      "team",
      "user",
    ].includes(
      targetType
    )
  ) {
    throw createError(
      "Unsupported product notification target",
      "PRODUCT_NOTIFICATION_TARGET_INVALID",
      422
    );
  }


  if (
    targetType === "user" &&
    !input.targetUserId
  ) {
    throw createError(
      "User-targeted notification requires targetUserId",
      "PRODUCT_NOTIFICATION_USER_REQUIRED",
      422
    );
  }


  if (
    targetType === "team" &&
    !input.targetTeamId
  ) {
    throw createError(
      "Team-targeted notification requires targetTeamId",
      "PRODUCT_NOTIFICATION_TEAM_REQUIRED",
      422
    );
  }


  return {
    targetType,

    targetUserId:
      targetType === "user"
        ? input.targetUserId
        : null,

    targetTeamId:
      targetType === "team"
        ? input.targetTeamId
        : null,
  };
}


function mapRow(
  row
) {
  if (!row) {
    return null;
  }


  return {
    id:
      row.public_id,

    organizationId:
      row.organization_id,

    environmentId:
      row.environment_id,

    kind:
      row.kind,

    severity:
      row.severity,

    title:
      row.title,

    message:
      row.message,

    sourceType:
      row.source_type,

    sourceRef:
      row.source_ref,

    incidentId:
      row.incident_id,

    humanTaskId:
      row.human_task_id,

    approvalId:
      row.approval_id,

    recoveryId:
      row.recovery_id,

    certificationId:
      row.certification_id,

    integrationId:
      row.integration_id,

    targetType:
      row.target_type,

    actionPath:
      row.action_path,

    metadata:
      row.metadata || {},

    read:
      Boolean(
        row.read_at
      ),

    readAt:
      row.read_at || null,

    dismissed:
      Boolean(
        row.dismissed_at
      ),

    dismissedAt:
      row.dismissed_at || null,

    createdAt:
      row.created_at,

    executionAuthorized:
      false,
  };
}


class ProductNotificationService {
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


  /*
   * ========================================================================
   * SERVER-SIDE PUBLISH
   * ========================================================================
   *
   * Browser routes never publish arbitrary product notifications.
   *
   * Only trusted AIRA backend workflows should call this method.
   *
   * Product notification state is informational only and can NEVER carry
   * infrastructure execution authority.
   * ========================================================================
   */

  async publish(
    input = {}
  ) {
    requireValue(
      input.organizationId,
      "organizationId"
    );


    requireValue(
      input.sourceType,
      "sourceType"
    );


    requireValue(
      input.sourceRef,
      "sourceRef"
    );


    requireValue(
      input.title,
      "title"
    );


    requireValue(
      input.message,
      "message"
    );


    if (
      input.executionAuthorized ===
      true
    ) {
      throw createError(
        "Product notification cannot contain execution authorization",
        "PRODUCT_NOTIFICATION_AUTHORITY_VIOLATION",
        409
      );
    }


    const kind =
      normalizeKind(
        input.kind
      );


    const severity =
      normalizeSeverity(
        input.severity
      );


    const target =
      normalizeTarget(
        input
      );


    const environmentId =
      input.environmentId ||
      null;


    /*
     * Organization-wide notifications may persist environment_id = NULL.
     *
     * PostgreSQL RLS still requires a legitimate environment scope in order
     * to enter PostgresTenantScope.
     */
    const scopeEnvironmentId =
      environmentId ||
      input.scopeEnvironmentId;


    if (
      !scopeEnvironmentId
    ) {
      throw createError(
        "Notification publishing requires environment scope",
        "PRODUCT_NOTIFICATION_SCOPE_ENVIRONMENT_REQUIRED",
        422
      );
    }


    return this.scope
      .run(
        {
          organizationId:
            input.organizationId,

          environmentId:
            scopeEnvironmentId,
        },

        async (
          client,
          resolved
        ) => {
          /*
           * CRITICAL PHASE-25 TENANT CONTRACT
           *
           * Request/public identifiers are selectors only.
           *
           * Physical PostgreSQL UUID columns MUST use:
           *
           * resolved.organizationUuid
           * resolved.environmentUuid
           */
          const result =
            await client.query(
              `
                INSERT INTO
                    product.notification_events (
                        organization_id,
                        environment_id,
                        kind,
                        severity,
                        title,
                        message,
                        source_type,
                        source_ref,
                        incident_id,
                        human_task_id,
                        approval_id,
                        recovery_id,
                        certification_id,
                        integration_id,
                        target_type,
                        target_user_id,
                        target_team_id,
                        action_path,
                        metadata,
                        expires_at,
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
                    $13,
                    $14,
                    $15,
                    $16,
                    $17,
                    $18,
                    $19::jsonb,
                    $20,
                    FALSE
                )

                ON CONFLICT (
                    organization_id,

                    (
                        COALESCE(
                            environment_id,
                            '00000000-0000-0000-0000-000000000000'::uuid
                        )
                    ),

                    source_type,
                    source_ref,
                    kind
                )

                DO UPDATE SET
                    severity =
                        EXCLUDED.severity,

                    title =
                        EXCLUDED.title,

                    message =
                        EXCLUDED.message,

                    action_path =
                        EXCLUDED.action_path,

                    metadata =
                        EXCLUDED.metadata,

                    expires_at =
                        EXCLUDED.expires_at,

                    updated_at =
                        NOW()

                RETURNING
                    *
              `,
              [
                resolved.organizationUuid,

                environmentId
                  ? resolved.environmentUuid
                  : null,

                kind,

                severity,

                String(
                  input.title
                ).trim(),

                String(
                  input.message
                ).trim(),

                String(
                  input.sourceType
                ).trim(),

                String(
                  input.sourceRef
                ).trim(),

                input.incidentId ||
                  null,

                input.humanTaskId ||
                  null,

                input.approvalId ||
                  null,

                input.recoveryId ||
                  null,

                input.certificationId ||
                  null,

                input.integrationId ||
                  null,

                target.targetType,

                target.targetUserId,

                target.targetTeamId,

                input.actionPath ||
                  null,

                JSON.stringify(
                  input.metadata ||
                  {}
                ),

                input.expiresAt ||
                  null,
              ]
            );


          return {
            ...mapRow(
              result.rows[0]
            ),

            executionAuthorized:
              false,
          };
        }
      );
  }


  /*
   * ========================================================================
   * PHASE-23 → PHASE-25 PRODUCT INBOX BRIDGE
   * ========================================================================
   *
   * notifications.requests remains the authoritative durable human
   * notification workflow.
   *
   * notifications.deliveries remains authoritative for transport delivery.
   *
   * product.notification_events is only a product/read representation.
   *
   * Notification presentation:
   *
   * != acknowledgement
   * != human takeover
   * != approval
   * != certification
   * != infrastructure execution authorization
   * ========================================================================
   */

  async synchronizeExistingNotificationPlatform({
    organizationId,
    environmentId,
  }) {
    return this.scope
      .run(
        {
          organizationId,
          environmentId,
        },

        async (
          client,
          resolved
        ) => {
          /*
           * ------------------------------------------------------------------
           * HUMAN ESCALATION / HUMAN TASK NOTIFICATIONS
           * ------------------------------------------------------------------
           */

          await client.query(
            `
              INSERT INTO
                  product.notification_events (
                      organization_id,
                      environment_id,
                      kind,
                      severity,
                      title,
                      message,
                      source_type,
                      source_ref,
                      incident_id,
                      human_task_id,
                      target_type,
                      target_user_id,
                      target_team_id,
                      action_path,
                      metadata,
                      execution_authorized
                  )

              SELECT
                  r.organization_id,

                  r.environment_id,

                  'human_task',

                  r.severity,

                  r.title,

                  r.message,

                  'human_notification_request',

                  r.public_id,

                  r.incident_id,

                  r.human_task_id,

                  CASE
                      WHEN
                          UPPER(
                              COALESCE(
                                  r.target_type,
                                  ''
                              )
                          ) = 'USER'

                          AND

                          (
                              r.target_snapshot
                                  ->> 'targetUserId'
                          ) ~
                          '^[0-9a-fA-F-]{36}$'

                      THEN
                          'user'


                      WHEN
                          UPPER(
                              COALESCE(
                                  r.target_type,
                                  ''
                              )
                          ) = 'TEAM'

                          AND

                          (
                              r.target_snapshot
                                  ->> 'targetTeamId'
                          ) ~
                          '^[0-9a-fA-F-]{36}$'

                      THEN
                          'team'


                      ELSE
                          'organization'
                  END,


                  CASE
                      WHEN
                          UPPER(
                              COALESCE(
                                  r.target_type,
                                  ''
                              )
                          ) = 'USER'

                          AND

                          (
                              r.target_snapshot
                                  ->> 'targetUserId'
                          ) ~
                          '^[0-9a-fA-F-]{36}$'

                      THEN
                          (
                              r.target_snapshot
                                  ->> 'targetUserId'
                          )::uuid

                      ELSE
                          NULL
                  END,


                  CASE
                      WHEN
                          UPPER(
                              COALESCE(
                                  r.target_type,
                                  ''
                              )
                          ) = 'TEAM'

                          AND

                          (
                              r.target_snapshot
                                  ->> 'targetTeamId'
                          ) ~
                          '^[0-9a-fA-F-]{36}$'

                      THEN
                          (
                              r.target_snapshot
                                  ->> 'targetTeamId'
                          )::uuid

                      ELSE
                          NULL
                  END,


                  CASE
                      WHEN
                          r.incident_id
                              IS NOT NULL
                      THEN
                          '/incidents/' ||
                          r.incident_id


                      WHEN
                          r.human_task_id
                              IS NOT NULL
                      THEN
                          '/human-tasks'


                      ELSE
                          '/notifications'
                  END,


                  jsonb_build_object(
                      'notificationEventType',
                      r.notification_event_type,

                      'deliveryStatus',
                      r.status,

                      'attemptCount',
                      r.attempt_count,

                      'maxAttempts',
                      r.max_attempts,

                      'acknowledgementDeadline',
                      r.acknowledgement_deadline,

                      'correlationId',
                      r.correlation_id,

                      'executionAuthorized',
                      FALSE
                  ),

                  FALSE

              FROM
                  notifications.requests r

              WHERE
                  r.organization_id =
                      $1

                  AND

                  r.environment_id =
                      $2

                  AND

                  r.execution_authorized =
                      FALSE

              ON CONFLICT (
                  organization_id,

                  (
                      COALESCE(
                          environment_id,
                          '00000000-0000-0000-0000-000000000000'::uuid
                      )
                  ),

                  source_type,
                  source_ref,
                  kind
              )

              DO UPDATE SET
                  severity =
                      EXCLUDED.severity,

                  title =
                      EXCLUDED.title,

                  message =
                      EXCLUDED.message,

                  target_type =
                      EXCLUDED.target_type,

                  target_user_id =
                      EXCLUDED.target_user_id,

                  target_team_id =
                      EXCLUDED.target_team_id,

                  action_path =
                      EXCLUDED.action_path,

                  metadata =
                      EXCLUDED.metadata,

                  updated_at =
                      NOW()
            `,
            [
              resolved.organizationUuid,
              resolved.environmentUuid,
            ]
          );


          /*
           * ------------------------------------------------------------------
           * FAILED EXTERNAL DELIVERY EVENTS
           * ------------------------------------------------------------------
           */

          await client.query(
            `
              INSERT INTO
                  product.notification_events (
                      organization_id,
                      environment_id,
                      kind,
                      severity,
                      title,
                      message,
                      source_type,
                      source_ref,
                      incident_id,
                      human_task_id,
                      integration_id,
                      target_type,
                      action_path,
                      metadata,
                      execution_authorized
                  )

              SELECT
                  d.organization_id,

                  d.environment_id,

                  'integration',

                  CASE
                      WHEN
                          d.status =
                              'failed'
                      THEN
                          'HIGH'

                      ELSE
                          'INFO'
                  END,

                  CASE
                      WHEN
                          d.status =
                              'failed'
                      THEN
                          'Notification delivery failed'

                      ELSE
                          'Notification delivery update'
                  END,

                  CASE
                      WHEN
                          d.status =
                              'failed'
                      THEN
                          'AIRA could not deliver an operational notification through ' ||
                          d.channel_type ||
                          '.'

                      ELSE
                          'Notification delivery state changed.'
                  END,

                  'notification_delivery',

                  d.public_id,

                  d.incident_id,

                  d.human_task_id,

                  CASE
                      WHEN
                          d.channel_id
                              IS NULL
                      THEN
                          NULL

                      ELSE
                          d.channel_id::text
                  END,

                  'organization',

                  '/team',

                  jsonb_build_object(
                      'channelType',
                      d.channel_type,

                      'destination',
                      d.destination,

                      'deliveryStatus',
                      d.status,

                      'attemptCount',
                      d.attempt_count,

                      'failure',
                      d.failure,

                      'executionAuthorized',
                      FALSE
                  ),

                  FALSE

              FROM
                  notifications.deliveries d

              WHERE
                  d.organization_id =
                      $1

                  AND

                  d.environment_id =
                      $2

                  AND

                  d.status IN (
                      'failed'
                  )

              ON CONFLICT (
                  organization_id,

                  (
                      COALESCE(
                          environment_id,
                          '00000000-0000-0000-0000-000000000000'::uuid
                      )
                  ),

                  source_type,
                  source_ref,
                  kind
              )

              DO UPDATE SET
                  severity =
                      EXCLUDED.severity,

                  title =
                      EXCLUDED.title,

                  message =
                      EXCLUDED.message,

                  metadata =
                      EXCLUDED.metadata,

                  updated_at =
                      NOW()
            `,
            [
              resolved.organizationUuid,
              resolved.environmentUuid,
            ]
          );


          return {
            synchronized:
              true,

            executionAuthorized:
              false,
          };
        }
      );
  }


  /*
   * ========================================================================
   * VISIBLE PRODUCT INBOX
   * ========================================================================
   */

  async list({
    organizationId,
    environmentId,
    userId,
    membershipId,

    unreadOnly = false,

    kind = null,

    limit = 50,
  }) {
    await this
      .synchronizeExistingNotificationPlatform({
        organizationId,
        environmentId,
      });


    return this.scope
      .run(
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
                SELECT
                    n.*,

                    receipt.read_at,

                    receipt.dismissed_at

                FROM
                    product.notification_events n

                LEFT JOIN
                    product.notification_receipts receipt

                ON
                    receipt.notification_event_id =
                        n.id

                    AND

                    receipt.user_id =
                        $3

                WHERE
                    n.organization_id =
                        $1

                    AND

                    (
                        n.environment_id
                            IS NULL

                        OR

                        n.environment_id =
                            $2
                    )

                    AND

                    (
                        n.expires_at
                            IS NULL

                        OR

                        n.expires_at >
                            NOW()
                    )

                    AND

                    receipt.dismissed_at
                        IS NULL

                    AND

                    (
                        n.target_type =
                            'organization'

                        OR

                        (
                            n.target_type =
                                'user'

                            AND

                            n.target_user_id =
                                $3
                        )

                        OR

                        (
                            n.target_type =
                                'team'

                            AND

                            EXISTS (
                                SELECT
                                    1

                                FROM
                                    tenancy.team_memberships tm

                                WHERE
                                    tm.organization_id =
                                        $1

                                    AND

                                    tm.team_id =
                                        n.target_team_id

                                    AND

                                    tm.membership_id =
                                        $4
                            )
                        )
                    )

                    AND

                    (
                        $5::boolean =
                            FALSE

                        OR

                        receipt.read_at
                            IS NULL
                    )

                    AND

                    (
                        $6::text
                            IS NULL

                        OR

                        n.kind =
                            $6
                    )

                ORDER BY
                    CASE
                        WHEN
                            n.severity =
                                'CRITICAL'
                        THEN
                            1

                        WHEN
                            n.severity =
                                'HIGH'
                        THEN
                            2

                        WHEN
                            n.severity =
                                'MEDIUM'
                        THEN
                            3

                        WHEN
                            n.severity =
                                'LOW'
                        THEN
                            4

                        ELSE
                            5
                    END ASC,

                    n.created_at
                        DESC

                LIMIT
                    $7
              `,
              [
                resolved.organizationUuid,

                resolved.environmentUuid,

                userId,

                membershipId,

                unreadOnly ===
                  true,

                kind ||
                  null,

                Math.min(
                  Math.max(
                    Number(
                      limit
                    ) ||
                      50,
                    1
                  ),
                  100
                ),
              ]
            );


          return result.rows
            .map(
              mapRow
            );
        }
      );
  }


  async summary({
    organizationId,
    environmentId,
    userId,
    membershipId,
  }) {
    const items =
      await this.list({
        organizationId,
        environmentId,
        userId,
        membershipId,

        unreadOnly:
          false,

        limit:
          100,
      });


    const unread =
      items.filter(
        (
          item
        ) =>
          item.read !==
            true
      );


    return {
      unreadCount:
        unread.length,

      criticalUnread:
        unread.filter(
          (
            item
          ) =>
            item.severity ===
              "CRITICAL"
        ).length,

      highUnread:
        unread.filter(
          (
            item
          ) =>
            item.severity ===
              "HIGH"
        ).length,

      totalVisible:
        items.length,

      executionAuthorized:
        false,
    };
  }


  /*
   * ========================================================================
   * READ RECEIPT
   * ========================================================================
   *
   * Reading a product notification:
   *
   * != human-task acknowledgement
   * != incident acknowledgement
   * != approval
   * != takeover
   * != recovery authorization
   * ========================================================================
   */

  async markRead({
    organizationId,
    environmentId,
    userId,
    membershipId,
    notificationId,
  }) {
    return this.scope
      .run(
        {
          organizationId,
          environmentId,
        },

        async (
          client,
          resolved
        ) => {
          const visible =
            await client.query(
              `
                SELECT
                    n.id

                FROM
                    product.notification_events n

                WHERE
                    n.organization_id =
                        $1

                    AND

                    n.public_id =
                        $2

                    AND

                    (
                        n.environment_id
                            IS NULL

                        OR

                        n.environment_id =
                            $3
                    )

                    AND

                    (
                        n.expires_at
                            IS NULL

                        OR

                        n.expires_at >
                            NOW()
                    )

                    AND

                    (
                        n.target_type =
                            'organization'

                        OR

                        (
                            n.target_type =
                                'user'

                            AND

                            n.target_user_id =
                                $4
                        )

                        OR

                        (
                            n.target_type =
                                'team'

                            AND

                            EXISTS (
                                SELECT
                                    1

                                FROM
                                    tenancy.team_memberships tm

                                WHERE
                                    tm.organization_id =
                                        $1

                                    AND

                                    tm.team_id =
                                        n.target_team_id

                                    AND

                                    tm.membership_id =
                                        $5
                            )
                        )
                    )

                LIMIT 1
              `,
              [
                resolved.organizationUuid,

                notificationId,

                resolved.environmentUuid,

                userId,

                membershipId,
              ]
            );


          if (
            !visible.rows[0]
          ) {
            throw createError(
              "Notification not found",
              "PRODUCT_NOTIFICATION_NOT_FOUND",
              404
            );
          }


          await client.query(
            `
              INSERT INTO
                  product.notification_receipts (
                      organization_id,
                      notification_event_id,
                      user_id,
                      read_at
                  )

              VALUES (
                  $1,
                  $2,
                  $3,
                  NOW()
              )

              ON CONFLICT (
                  notification_event_id,
                  user_id
              )

              DO UPDATE SET
                  read_at =
                      COALESCE(
                          product.notification_receipts.read_at,
                          NOW()
                      ),

                  updated_at =
                      NOW()
            `,
            [
              resolved.organizationUuid,

              visible.rows[0]
                .id,

              userId,
            ]
          );


          return {
            read:
              true,

            notificationId,

            humanTaskAcknowledged:
              false,

            incidentAcknowledged:
              false,

            executionAuthorized:
              false,
          };
        }
      );
  }


  async markAllRead({
    organizationId,
    environmentId,
    userId,
    membershipId,
  }) {
    return this.scope
      .run(
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
                    product.notification_receipts (
                        organization_id,
                        notification_event_id,
                        user_id,
                        read_at
                    )

                SELECT
                    $1,

                    n.id,

                    $3,

                    NOW()

                FROM
                    product.notification_events n

                WHERE
                    n.organization_id =
                        $1

                    AND

                    (
                        n.environment_id
                            IS NULL

                        OR

                        n.environment_id =
                            $2
                    )

                    AND

                    (
                        n.expires_at
                            IS NULL

                        OR

                        n.expires_at >
                            NOW()
                    )

                    AND

                    (
                        n.target_type =
                            'organization'

                        OR

                        (
                            n.target_type =
                                'user'

                            AND

                            n.target_user_id =
                                $3
                        )

                        OR

                        (
                            n.target_type =
                                'team'

                            AND

                            EXISTS (
                                SELECT
                                    1

                                FROM
                                    tenancy.team_memberships tm

                                WHERE
                                    tm.organization_id =
                                        $1

                                    AND

                                    tm.team_id =
                                        n.target_team_id

                                    AND

                                    tm.membership_id =
                                        $4
                            )
                        )
                    )

                ON CONFLICT (
                    notification_event_id,
                    user_id
                )

                DO UPDATE SET
                    read_at =
                        COALESCE(
                            product.notification_receipts.read_at,
                            NOW()
                        ),

                    updated_at =
                        NOW()
              `,
              [
                resolved.organizationUuid,

                resolved.environmentUuid,

                userId,

                membershipId,
              ]
            );


          return {
            updated:
              result.rowCount,

            humanTaskAcknowledged:
              false,

            incidentAcknowledged:
              false,

            executionAuthorized:
              false,
          };
        }
      );
  }


  async dismiss({
    organizationId,
    environmentId,
    userId,
    membershipId,
    notificationId,
  }) {
    /*
     * Dismissal includes read state, but remains product presentation state.
     */
    await this.markRead({
      organizationId,
      environmentId,
      userId,
      membershipId,
      notificationId,
    });


    return this.scope
      .run(
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
                UPDATE
                    product.notification_receipts receipt

                SET
                    dismissed_at =
                        NOW(),

                    updated_at =
                        NOW()

                FROM
                    product.notification_events event

                WHERE
                    receipt.notification_event_id =
                        event.id

                    AND

                    receipt.organization_id =
                        $1

                    AND

                    receipt.user_id =
                        $2

                    AND

                    event.public_id =
                        $3

                    AND

                    event.organization_id =
                        $1

                    AND

                    (
                        event.environment_id
                            IS NULL

                        OR

                        event.environment_id =
                            $4
                    )

                RETURNING
                    receipt.id
              `,
              [
                resolved.organizationUuid,

                userId,

                notificationId,

                resolved.environmentUuid,
              ]
            );


          if (
            result.rowCount ===
              0
          ) {
            throw createError(
              "Notification not found",
              "PRODUCT_NOTIFICATION_NOT_FOUND",
              404
            );
          }


          return {
            dismissed:
              true,

            notificationId,

            humanTaskAcknowledged:
              false,

            incidentAcknowledged:
              false,

            executionAuthorized:
              false,
          };
        }
      );
  }
}


const productNotificationService =
  new ProductNotificationService();


module.exports =
  productNotificationService;


module.exports
  .ProductNotificationService =
  ProductNotificationService;


module.exports
  .PRODUCT_NOTIFICATION_KINDS =
  PRODUCT_NOTIFICATION_KINDS;