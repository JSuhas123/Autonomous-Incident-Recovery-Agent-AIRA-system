"use strict";

const crypto = require("node:crypto");

const PostgresTenantScope = require(
  "./PostgresTenantScope"
);

const {
  TAKEOVER_SESSION_STATUS,
  CONTROL_LEASE_STATUS,
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
      "HUMAN_TAKEOVER_ORGANIZATION_REQUIRED",
      422
    );
  }

  if (!input.environmentId) {
    throw createError(
      "environmentId is required",
      "HUMAN_TAKEOVER_ENVIRONMENT_REQUIRED",
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


function mapSession(
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

    incidentId:
      row.incident_id,

    taskId:
      row.task_id,

    requestedByUserId:
      row.requested_by_user_id,

    authorizedByUserId:
      row.authorized_by_user_id,

    status:
      row.status,

    reason:
      row.reason,

    requestedAt:
      row.requested_at,

    authorizedAt:
      row.authorized_at,

    activatedAt:
      row.activated_at,

    releaseRequestedAt:
      row.release_requested_at,

    releasedAt:
      row.released_at,

    expiresAt:
      row.expires_at,

    revokedAt:
      row.revoked_at,

    controlEpoch:
      Number(
        row.control_epoch ||
        0
      ),

    metadata:
      row.metadata || {},

    executionAuthorized:
      row.execution_authorized,
  };
}


function mapLease(
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

    incidentId:
      row.incident_id,

    takeoverSessionId:
      row.takeover_session_id,

    holderUserId:
      row.holder_user_id,

    status:
      row.status,

    leaseVersion:
      Number(
        row.lease_version ||
        1
      ),

    controlEpoch:
      Number(
        row.control_epoch ||
        0
      ),

    acquiredAt:
      row.acquired_at,

    heartbeatAt:
      row.heartbeat_at,

    createdAt:
      row.created_at,

    expiresAt:
      row.expires_at,

    releasedAt:
      row.released_at,

    revokedAt:
      row.revoked_at,

    releaseReason:
      row.release_reason,

    metadata:
      row.metadata || {},

    executionAuthorized:
      row.execution_authorized,
  };
}


class PostgresHumanTakeoverRepository {
  constructor(options = {}) {
    this.scope =
      options.scope ||
      new PostgresTenantScope(options);
  }


  async createTakeoverSession(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(input);

    requireValue(
      input.incidentId,
      "incidentId",
      "HUMAN_TAKEOVER_INCIDENT_REQUIRED"
    );

    requireValue(
      input.requestedByUserId,
      "requestedByUserId",
      "HUMAN_TAKEOVER_REQUESTER_REQUIRED"
    );

    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        let taskUuid =
          null;

        if (input.taskId) {
          const task =
            await this.#findTask(
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

          taskUuid =
            task.id;
        }

        try {
          const result =
            await client.query(
              `
                INSERT INTO
                  human_operations.takeover_sessions (
                    public_id,

                    organization_id,
                    environment_id,

                    incident_id,
                    task_id,

                    requested_by_user_id,

                    status,
                    reason,

                    expires_at,
                    control_epoch,

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

                  'REQUESTED',
                  $7,

                  $8,
                  $9,

                  $10::jsonb,

                  FALSE
                )

                RETURNING *
              `,
              [
                input.publicId ||
                  generatePublicId(
                    "htko"
                  ),

                resolved.organizationUuid,
                resolved.environmentUuid,

                String(
                  input.incidentId
                ),

                taskUuid,

                input.requestedByUserId,

                input.reason ||
                  null,

                input.expiresAt ||
                  null,

                Number(
                  input.controlEpoch ||
                  0
                ),

                JSON.stringify(
                  input.metadata ||
                  {}
                ),
              ]
            );

          await this.#insertEvent(
            client,
            resolved,
            {
              incidentId:
                input.incidentId,

              takeoverSessionId:
                result.rows[0].id,

              eventType:
                "TAKEOVER_REQUESTED",

              actorUserId:
                input.requestedByUserId,

              controlEpoch:
                input.controlEpoch ||
                0,

              metadata:
                input.metadata ||
                {},
            }
          );

          return mapSession(
            result.rows[0],
            resolved
          );
        } catch (error) {
          if (
            error?.code ===
            "23505"
          ) {
            throw createError(
              "An authoritative takeover session already exists for this incident",
              "HUMAN_TAKEOVER_ALREADY_ACTIVE",
              409
            );
          }

          throw error;
        }
      },

      transaction
    );
  }


  async authorizeSession(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(input);

    requireValue(
      input.sessionId,
      "sessionId",
      "HUMAN_TAKEOVER_SESSION_REQUIRED"
    );

    requireValue(
      input.authorizedByUserId,
      "authorizedByUserId",
      "HUMAN_TAKEOVER_AUTHORIZER_REQUIRED"
    );

    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const session =
          await this.#findSession(
            client,
            input.sessionId,
            true
          );

        if (!session) {
          throw createError(
            "Takeover session not found",
            "HUMAN_TAKEOVER_SESSION_NOT_FOUND",
            404
          );
        }

        if (
          session.status !==
          TAKEOVER_SESSION_STATUS
            .REQUESTED
        ) {
          throw createError(
            "Only requested takeover sessions may be authorized",
            "HUMAN_TAKEOVER_INVALID_AUTHORIZATION_STATE",
            409
          );
        }

        const result =
          await client.query(
            `
              UPDATE
                human_operations.takeover_sessions

              SET
                status = 'AUTHORIZED',

                authorized_by_user_id =
                  $2,

                authorized_at =
                  NOW()

              WHERE
                id = $1

              RETURNING *
            `,
            [
              session.id,
              input.authorizedByUserId,
            ]
          );

        await this.#insertEvent(
          client,
          resolved,
          {
            incidentId:
              session.incident_id,

            takeoverSessionId:
              session.id,

            eventType:
              "TAKEOVER_AUTHORIZED",

            actorUserId:
              input.authorizedByUserId,

            controlEpoch:
              session.control_epoch,

            metadata:
              input.metadata ||
              {},
          }
        );

        return mapSession(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async acquireControlLease(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(input);

    requireValue(
      input.sessionId,
      "sessionId",
      "HUMAN_TAKEOVER_SESSION_REQUIRED"
    );

    requireValue(
      input.holderUserId,
      "holderUserId",
      "HUMAN_CONTROL_HOLDER_REQUIRED"
    );

    const leaseDurationMs =
      Number(
        input.leaseDurationMs ||
        300000
      );

    if (
      !Number.isFinite(
        leaseDurationMs
      ) ||
      leaseDurationMs <= 0
    ) {
      throw createError(
        "leaseDurationMs must be greater than zero",
        "HUMAN_CONTROL_LEASE_DURATION_INVALID",
        422
      );
    }

    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const session =
          await this.#findSession(
            client,
            input.sessionId,
            true
          );

        if (!session) {
          throw createError(
            "Takeover session not found",
            "HUMAN_TAKEOVER_SESSION_NOT_FOUND",
            404
          );
        }

        if (
          ![
            TAKEOVER_SESSION_STATUS
              .AUTHORIZED,

            TAKEOVER_SESSION_STATUS
              .ACTIVE,
          ].includes(
            session.status
          )
        ) {
          throw createError(
            "Takeover session is not authorized for control acquisition",
            "HUMAN_TAKEOVER_SESSION_NOT_AUTHORIZED",
            409
          );
        }

        const existingLease =
          await client.query(
            `
              SELECT *
              FROM
                human_operations.control_leases

              WHERE
                incident_id = $1
                AND status = 'ACTIVE'

              LIMIT 1

              FOR UPDATE
            `,
            [
              session.incident_id,
            ]
          );

        if (
          existingLease.rows[0]
        ) {
          throw createError(
            "Incident already has an active human control lease",
            "HUMAN_CONTROL_LEASE_CONFLICT",
            409
          );
        }

        const expiresAt =
          input.expiresAt ||
          new Date(
            Date.now() +
            leaseDurationMs
          );

        try {
          const leaseResult =
            await client.query(
              `
                INSERT INTO
                  human_operations.control_leases (
                    public_id,

                    organization_id,
                    environment_id,

                    incident_id,

                    takeover_session_id,
                    holder_user_id,

                    status,

                    lease_version,
                    control_epoch,

                    acquired_at,
                    heartbeat_at,

                    expires_at,

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

                  'ACTIVE',

                  1,
                  $7,

                  NOW(),
                  NOW(),

                  $8,

                  $9::jsonb,

                  FALSE
                )

                RETURNING *
              `,
              [
                input.publicId ||
                  generatePublicId(
                    "hlease"
                  ),

                resolved.organizationUuid,
                resolved.environmentUuid,

                session.incident_id,

                session.id,
                input.holderUserId,

                Number(
                  session.control_epoch ||
                  0
                ),

                expiresAt,

                JSON.stringify(
                  input.metadata ||
                  {}
                ),
              ]
            );

          await client.query(
            `
              UPDATE
                human_operations.takeover_sessions

              SET
                status = 'ACTIVE',

                activated_at =
                  COALESCE(
                    activated_at,
                    NOW()
                  )

              WHERE
                id = $1
            `,
            [
              session.id,
            ]
          );

          await this.#insertEvent(
            client,
            resolved,
            {
              incidentId:
                session.incident_id,

              takeoverSessionId:
                session.id,

              controlLeaseId:
                leaseResult.rows[0].id,

              eventType:
                "CONTROL_LEASE_ACQUIRED",

              actorUserId:
                input.holderUserId,

              controlEpoch:
                session.control_epoch,

              metadata: {
                expiresAt,
                ...(
                  input.metadata ||
                  {}
                ),
              },
            }
          );

          return mapLease(
            leaseResult.rows[0],
            resolved
          );
        } catch (error) {
          if (
            error?.code ===
            "23505"
          ) {
            throw createError(
              "Incident already has an active human control lease",
              "HUMAN_CONTROL_LEASE_CONFLICT",
              409
            );
          }

          throw error;
        }
      },

      transaction
    );
  }


  async heartbeatLease(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(input);

    requireValue(
      input.leaseId,
      "leaseId",
      "HUMAN_CONTROL_LEASE_REQUIRED"
    );

    requireValue(
      input.holderUserId,
      "holderUserId",
      "HUMAN_CONTROL_HOLDER_REQUIRED"
    );

    const extensionMs =
      Number(
        input.extensionMs ||
        300000
      );

    if (
      !Number.isFinite(
        extensionMs
      ) ||
      extensionMs <= 0
    ) {
      throw createError(
        "extensionMs must be greater than zero",
        "HUMAN_CONTROL_LEASE_EXTENSION_INVALID",
        422
      );
    }

    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const lease =
          await this.#findLease(
            client,
            input.leaseId,
            true
          );

        if (!lease) {
          throw createError(
            "Control lease not found",
            "HUMAN_CONTROL_LEASE_NOT_FOUND",
            404
          );
        }

        if (
          lease.status !==
          CONTROL_LEASE_STATUS
            .ACTIVE
        ) {
          throw createError(
            "Only active control leases may heartbeat",
            "HUMAN_CONTROL_LEASE_NOT_ACTIVE",
            409
          );
        }

        if (
          String(
            lease.holder_user_id
          ) !==
          String(
            input.holderUserId
          )
        ) {
          throw createError(
            "Control lease is owned by another operator",
            "HUMAN_CONTROL_LEASE_OWNER_MISMATCH",
            403
          );
        }

        if (
          new Date(
            lease.expires_at
          ).getTime() <=
          Date.now()
        ) {
          await client.query(
            `
              UPDATE
                human_operations.control_leases

              SET
                status = 'EXPIRED',

                lease_version =
                  lease_version + 1

              WHERE
                id = $1
            `,
            [
              lease.id,
            ]
          );

          throw createError(
            "Control lease has expired",
            "HUMAN_CONTROL_LEASE_EXPIRED",
            409
          );
        }

        const result =
          await client.query(
            `
              UPDATE
                human_operations.control_leases

              SET
                heartbeat_at = NOW(),

                expires_at =
                  NOW() +
                  ($2 * INTERVAL '1 millisecond'),

                lease_version =
                  lease_version + 1

              WHERE
                id = $1
                AND status = 'ACTIVE'

              RETURNING *
            `,
            [
              lease.id,
              extensionMs,
            ]
          );

        return mapLease(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async getActiveLeaseForIncident(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(input);

    requireValue(
      input.incidentId,
      "incidentId",
      "HUMAN_TAKEOVER_INCIDENT_REQUIRED"
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
                human_operations.control_leases

              WHERE
                incident_id = $1
                AND status = 'ACTIVE'
                AND expires_at > NOW()

              LIMIT 1
            `,
            [
              String(
                input.incidentId
              ),
            ]
          );

        return mapLease(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async releaseControlLease(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(input);

    requireValue(
      input.leaseId,
      "leaseId",
      "HUMAN_CONTROL_LEASE_REQUIRED"
    );

    requireValue(
      input.releasedByUserId,
      "releasedByUserId",
      "HUMAN_CONTROL_RELEASE_USER_REQUIRED"
    );

    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const lease =
          await this.#findLease(
            client,
            input.leaseId,
            true
          );

        if (!lease) {
          throw createError(
            "Control lease not found",
            "HUMAN_CONTROL_LEASE_NOT_FOUND",
            404
          );
        }

        if (
          lease.status ===
          CONTROL_LEASE_STATUS
            .RELEASED
        ) {
          return mapLease(
            lease,
            resolved
          );
        }

        if (
          lease.status !==
          CONTROL_LEASE_STATUS
            .ACTIVE
        ) {
          throw createError(
            "Only an active control lease may be released",
            "HUMAN_CONTROL_LEASE_NOT_ACTIVE",
            409
          );
        }

        if (
          String(
            lease.holder_user_id
          ) !==
          String(
            input.releasedByUserId
          ) &&
          !input.force
        ) {
          throw createError(
            "Only the lease holder may release control",
            "HUMAN_CONTROL_LEASE_OWNER_MISMATCH",
            403
          );
        }

        const result =
          await client.query(
            `
              UPDATE
                human_operations.control_leases

              SET
                status = 'RELEASED',

                released_at = NOW(),

                release_reason = $2,

                lease_version =
                  lease_version + 1

              WHERE
                id = $1

              RETURNING *
            `,
            [
              lease.id,

              input.reason ||
                null,
            ]
          );

        await client.query(
          `
            UPDATE
              human_operations.takeover_sessions

            SET
              status = 'RELEASED',

              released_at = NOW()

            WHERE
              id = $1
          `,
          [
            lease.takeover_session_id,
          ]
        );

        await this.#insertEvent(
          client,
          resolved,
          {
            incidentId:
              lease.incident_id,

            takeoverSessionId:
              lease.takeover_session_id,

            controlLeaseId:
              lease.id,

            eventType:
              "CONTROL_LEASE_RELEASED",

            actorUserId:
              input.releasedByUserId,

            controlEpoch:
              lease.control_epoch,

            metadata: {
              reason:
                input.reason ||
                null,

              forced:
                Boolean(
                  input.force
                ),
            },
          }
        );

        return mapLease(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async expireControlLease(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(input);

    requireValue(
      input.leaseId,
      "leaseId",
      "HUMAN_CONTROL_LEASE_REQUIRED"
    );

    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const lease =
          await this.#findLease(
            client,
            input.leaseId,
            true
          );

        if (!lease) {
          throw createError(
            "Control lease not found",
            "HUMAN_CONTROL_LEASE_NOT_FOUND",
            404
          );
        }

        if (
          lease.status ===
          CONTROL_LEASE_STATUS
            .EXPIRED
        ) {
          return mapLease(
            lease,
            resolved
          );
        }

        if (
          lease.status !==
          CONTROL_LEASE_STATUS
            .ACTIVE
        ) {
          throw createError(
            "Only an active control lease may expire",
            "HUMAN_CONTROL_LEASE_NOT_ACTIVE",
            409
          );
        }

        const result =
          await client.query(
            `
              UPDATE
                human_operations.control_leases

              SET
                status = 'EXPIRED',

                lease_version =
                  lease_version + 1

              WHERE
                id = $1

              RETURNING *
            `,
            [
              lease.id,
            ]
          );

        await client.query(
          `
            UPDATE
              human_operations.takeover_sessions

            SET
              status = 'EXPIRED'

            WHERE
              id = $1
          `,
          [
            lease.takeover_session_id,
          ]
        );

        await this.#insertEvent(
          client,
          resolved,
          {
            incidentId:
              lease.incident_id,

            takeoverSessionId:
              lease.takeover_session_id,

            controlLeaseId:
              lease.id,

            eventType:
              "CONTROL_LEASE_EXPIRED",

            actorUserId:
              null,

            controlEpoch:
              lease.control_epoch,

            metadata: {
              reason:
                input.reason ||
                "LEASE_EXPIRED",
            },
          }
        );

        return mapLease(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async getSession(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(input);

    requireValue(
      input.sessionId,
      "sessionId",
      "HUMAN_TAKEOVER_SESSION_REQUIRED"
    );

    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const session =
          await this.#findSession(
            client,
            input.sessionId,
            false
          );

        return mapSession(
          session,
          resolved
        );
      },

      transaction
    );
  }


  async listIncidentEvents(
    input,
    transaction = null
  ) {
    const scope =
      requireScope(input);

    requireValue(
      input.incidentId,
      "incidentId",
      "HUMAN_TAKEOVER_INCIDENT_REQUIRED"
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
                human_operations.takeover_events

              WHERE
                incident_id = $1

              ORDER BY
                created_at ASC
            `,
            [
              String(
                input.incidentId
              ),
            ]
          );

        return result.rows;
      },

      transaction
    );
  }


  async #findTask(
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


  async #findSession(
    client,
    sessionId,
    forUpdate
  ) {
    const result =
      await client.query(
        `
          SELECT *
          FROM
            human_operations.takeover_sessions

          WHERE
            (
              public_id = $1
              OR id::text = $1
            )

          LIMIT 1

          ${
            forUpdate
              ? "FOR UPDATE"
              : ""
          }
        `,
        [
          String(
            sessionId
          ),
        ]
      );

    return (
      result.rows[0] ||
      null
    );
  }


  async #findLease(
    client,
    leaseId,
    forUpdate
  ) {
    const result =
      await client.query(
        `
          SELECT *
          FROM
            human_operations.control_leases

          WHERE
            (
              public_id = $1
              OR id::text = $1
            )

          LIMIT 1

          ${
            forUpdate
              ? "FOR UPDATE"
              : ""
          }
        `,
        [
          String(
            leaseId
          ),
        ]
      );

    return (
      result.rows[0] ||
      null
    );
  }


  async #insertEvent(
    client,
    resolved,
    input
  ) {
    await client.query(
      `
        INSERT INTO
          human_operations.takeover_events (
            public_id,

            organization_id,
            environment_id,

            incident_id,

            takeover_session_id,
            control_lease_id,

            event_type,
            actor_user_id,

            control_epoch,
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
          $10::jsonb,

          FALSE
        )
      `,
      [
        generatePublicId(
          "htevt"
        ),

        resolved.organizationUuid,
        resolved.environmentUuid,

        String(
          input.incidentId
        ),

        input.takeoverSessionId ||
          null,

        input.controlLeaseId ||
          null,

        input.eventType,

        input.actorUserId ||
          null,

        Number(
          input.controlEpoch ||
          0
        ),

        JSON.stringify(
          input.metadata ||
          {}
        ),
      ]
    );
  }
}


module.exports = PostgresHumanTakeoverRepository;