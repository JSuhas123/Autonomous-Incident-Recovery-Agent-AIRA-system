"use strict";

/**
 * ============================================================================
 * AIRA PHASE 23
 * POSTGRES HUMAN TAKEOVER REPOSITORY
 * ============================================================================
 *
 * PostgreSQL is authoritative for:
 *
 *   TakeoverSession
 *   ControlLease
 *   TakeoverEvent
 *
 * Safety laws:
 *
 *   HUMAN TAKEOVER != EXECUTION AUTHORIZATION
 *   TAKEOVER AUTHORIZATION != ACTIVE CONTROL
 *   CONTROL LEASE != EXECUTION AUTHORIZATION
 *
 * Exactly one ACTIVE control lease may exist per incident.
 *
 * IMPORTANT DURABILITY LAW
 * ------------------------
 *
 * If an ACTIVE control lease has expired, its transition to EXPIRED must
 * COMMIT before HUMAN_CONTROL_LEASE_EXPIRED is returned to the caller.
 *
 * Therefore heartbeatLease() MUST NOT throw from inside PostgresTenantScope
 * after writing EXPIRED state. Throwing inside the scoped transaction would
 * cause PostgresTenantScope to ROLLBACK the expiry transition.
 *
 * The correct pattern is:
 *
 *   transaction
 *       ↓
 *   detect expiry
 *       ↓
 *   lease -> EXPIRED
 *       ↓
 *   takeover session -> EXPIRED
 *       ↓
 *   append expiry event
 *       ↓
 *   RETURN sentinel
 *       ↓
 *   COMMIT
 *       ↓
 *   throw HUMAN_CONTROL_LEASE_EXPIRED outside transaction
 *
 * ============================================================================
 */


const crypto =
  require(
    "node:crypto"
  );


const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


const {
  TAKEOVER_SESSION_STATUS,
  CONTROL_LEASE_STATUS,
} = require(
  "../../constants/humanTakeover"
);


/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */


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
    "HUMAN_TAKEOVER_ORGANIZATION_REQUIRED",
    "organizationId"
  );


  requireValue(
    environmentId,
    "HUMAN_TAKEOVER_ENVIRONMENT_REQUIRED",
    "environmentId"
  );


  return {
    organizationId,
    environmentId,
  };
}


function generatePublicId(
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


function normalizeMetadata(
  value
) {
  if (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  ) {
    return value;
  }


  return {};
}


function normalizeLeaseDurationMs(
  value
) {
  const parsed =
    Number(
      value
    );


  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <=
      0
  ) {
    throw createError(
      "HUMAN_CONTROL_LEASE_DURATION_INVALID",
      "leaseDurationMs must be a positive number"
    );
  }


  return Math.floor(
    parsed
  );
}


function mapSession(
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
        row.control_epoch ??
        0
      ),

    metadata:
      row.metadata ||
      {},

    executionAuthorized:
      row.execution_authorized ===
      true,
  };
}


function mapLease(
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

    takeoverSessionId:
      row.takeover_session_id,

    holderUserId:
      row.holder_user_id,

    status:
      row.status,

    leaseVersion:
      Number(
        row.lease_version ??
        1
      ),

    controlEpoch:
      Number(
        row.control_epoch ??
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
      row.metadata ||
      {},

    executionAuthorized:
      row.execution_authorized ===
      true,
  };
}


function mapEvent(
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

    takeoverSessionId:
      row.takeover_session_id,

    controlLeaseId:
      row.control_lease_id,

    eventType:
      row.event_type,

    actorUserId:
      row.actor_user_id,

    controlEpoch:
      Number(
        row.control_epoch ??
        0
      ),

    metadata:
      row.metadata ||
      {},

    createdAt:
      row.created_at,

    executionAuthorized:
      row.execution_authorized ===
      true,
  };
}


/*
 * ============================================================================
 * REPOSITORY
 * ============================================================================
 */


class PostgresHumanTakeoverRepository {
  constructor(
    options = {}
  ) {
    /*
     * Support both names because earlier Phase-23 code has used:
     *
     *   new Repository({ scope })
     *
     * and repository tests may inject:
     *
     *   new Repository({ tenantScope })
     */
    this.scope =
      options.scope ||
      options.tenantScope ||
      new PostgresTenantScope({
        pool:
          options.pool ||
          null,
      });
  }


  /*
   * ==========================================================================
   * TAKEOVER SESSION
   * ==========================================================================
   */


  async createTakeoverSession({
    organizationId,
    environmentId,
    incidentId,
    taskId = null,

    requestedByUserId = null,
    actorUserId = null,

    reason = null,
    controlEpoch = 0,
    expiresAt = null,
    metadata = {},
  }) {
    const scope =
      requireScope({
        organizationId,
        environmentId,
      });


    requireValue(
      incidentId,
      "HUMAN_TAKEOVER_INCIDENT_REQUIRED",
      "incidentId"
    );


    const requesterId =
      requestedByUserId ||
      actorUserId;


    requireValue(
      requesterId,
      "HUMAN_TAKEOVER_REQUESTER_REQUIRED",
      "requestedByUserId"
    );


    const epoch =
      Number(
        controlEpoch ||
        0
      );


    if (
      !Number.isFinite(
        epoch
      ) ||
      epoch <
        0
    ) {
      throw createError(
        "HUMAN_TAKEOVER_CONTROL_EPOCH_INVALID",
        "controlEpoch must be a non-negative number"
      );
    }


    try {
      return await this.scope.run(
        scope,

        async (
          client,
          resolved
        ) => {
          const task =
            taskId
              ? await this.#findTask(
                  client,
                  taskId
                )
              : null;


          if (
            taskId &&
            !task
          ) {
            throw createError(
              "HUMAN_TASK_NOT_FOUND",
              `Human task not found: ${taskId}`
            );
          }


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
                    requested_at,
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
                  NOW(),
                  $8,
                  $9,
                  $10::jsonb,
                  FALSE
                )

                RETURNING *
              `,
              [
                generatePublicId(
                  "takeover"
                ),

                resolved
                  .organizationUuid,

                resolved
                  .environmentUuid,

                String(
                  incidentId
                ),

                task
                  ?.id ||
                null,

                requesterId,

                reason
                  ? String(
                      reason
                    )
                  : null,

                expiresAt ||
                null,

                epoch,

                JSON.stringify(
                  normalizeMetadata(
                    metadata
                  )
                ),
              ]
            );


          const session =
            result.rows[0];


          await this.#insertEvent(
            client,
            {
              resolved,

              incidentId:
                session.incident_id,

              takeoverSessionId:
                session.id,

              controlLeaseId:
                null,

              eventType:
                "TAKEOVER_REQUESTED",

              actorUserId:
                requesterId,

              controlEpoch:
                session.control_epoch,

              metadata: {
                reason:
                  reason ||
                  null,

                ...normalizeMetadata(
                  metadata
                ),

                executionAuthorized:
                  false,
              },
            }
          );


          return mapSession(
            session
          );
        }
      );
    } catch (
      error
    ) {
      if (
        error?.code ===
        "23505"
      ) {
        throw createError(
          "HUMAN_TAKEOVER_ALREADY_ACTIVE",
          `An active takeover session already exists for incident ${incidentId}`,
          {
            cause:
              error,
          }
        );
      }


      throw error;
    }
  }


  async authorizeSession({
    organizationId,
    environmentId,
    sessionId,

    authorizedByUserId = null,
    actorUserId = null,

    expiresAt = undefined,
    metadata = {},
  }) {
    const scope =
      requireScope({
        organizationId,
        environmentId,
      });


    requireValue(
      sessionId,
      "HUMAN_TAKEOVER_SESSION_ID_REQUIRED",
      "sessionId"
    );


    const authorizerId =
      authorizedByUserId ||
      actorUserId;


    requireValue(
      authorizerId,
      "HUMAN_TAKEOVER_AUTHORIZER_REQUIRED",
      "authorizedByUserId"
    );


    try {
      return await this.scope.run(
        scope,

        async (
          client
        ) => {
          const session =
            await this.#findSession(
              client,
              sessionId,
              true
            );


          if (
            !session
          ) {
            throw createError(
              "HUMAN_TAKEOVER_SESSION_NOT_FOUND",
              `Takeover session not found: ${sessionId}`
            );
          }


          if (
            session.status !==
            TAKEOVER_SESSION_STATUS.REQUESTED
          ) {
            throw createError(
              "HUMAN_TAKEOVER_SESSION_NOT_REQUESTED",
              [
                "Takeover authorization requires",
                "a REQUESTED session.",
                `current=${session.status}`,
              ].join(
                " "
              ),
              {
                session:
                  mapSession(
                    session
                  ),
              }
            );
          }


          const result =
            await client.query(
              `
                UPDATE
                  human_operations.takeover_sessions

                SET
                  status =
                    'AUTHORIZED',

                  authorized_by_user_id =
                    $2,

                  authorized_at =
                    NOW(),

                  expires_at =
                    CASE
                      WHEN $3::timestamptz IS NULL
                        THEN expires_at
                      ELSE $3::timestamptz
                    END,

                  metadata =
                    metadata ||
                    $4::jsonb

                WHERE
                  id = $1

                RETURNING *
              `,
              [
                session.id,

                authorizerId,

                expiresAt ===
                  undefined
                  ? null
                  : expiresAt,

                JSON.stringify({
                  ...normalizeMetadata(
                    metadata
                  ),

                  executionAuthorized:
                    false,
                }),
              ]
            );


          const authorized =
            result.rows[0];


          await this.#insertEvent(
            client,
            {
              resolved: {
                organizationUuid:
                  authorized
                    .organization_id,

                environmentUuid:
                  authorized
                    .environment_id,
              },

              incidentId:
                authorized
                  .incident_id,

              takeoverSessionId:
                authorized.id,

              controlLeaseId:
                null,

              eventType:
                "TAKEOVER_AUTHORIZED",

              actorUserId:
                authorizerId,

              controlEpoch:
                authorized
                  .control_epoch,

              metadata: {
                ...normalizeMetadata(
                  metadata
                ),

                controlGranted:
                  false,

                executionAuthorized:
                  false,
              },
            }
          );


          return mapSession(
            authorized
          );
        }
      );
    } catch (
      error
    ) {
      /*
       * Concurrent authorization of multiple sessions for the same
       * incident can hit the partial unique active-session index.
       *
       * Expose a deterministic domain error instead of raw PG 23505.
       */
      if (
        error?.code ===
        "23505"
      ) {
        throw createError(
          "HUMAN_TAKEOVER_ALREADY_ACTIVE",
          "Another active takeover session already exists for this incident",
          {
            cause:
              error,
          }
        );
      }


      throw error;
    }
  }


  async getSession({
    organizationId,
    environmentId,
    sessionId,
  }) {
    const scope =
      requireScope({
        organizationId,
        environmentId,
      });


    requireValue(
      sessionId,
      "HUMAN_TAKEOVER_SESSION_ID_REQUIRED",
      "sessionId"
    );


    return this.scope.run(
      scope,

      async (
        client
      ) => {
        return mapSession(
          await this.#findSession(
            client,
            sessionId,
            false
          )
        );
      }
    );
  }


  /*
   * ==========================================================================
   * CONTROL LEASE
   * ==========================================================================
   */


  async acquireControlLease({
    organizationId,
    environmentId,
    sessionId,
    holderUserId,
    leaseDurationMs = 300000,
    metadata = {},
  }) {
    const scope =
      requireScope({
        organizationId,
        environmentId,
      });


    requireValue(
      sessionId,
      "HUMAN_TAKEOVER_SESSION_ID_REQUIRED",
      "sessionId"
    );


    requireValue(
      holderUserId,
      "HUMAN_CONTROL_LEASE_HOLDER_REQUIRED",
      "holderUserId"
    );


    const durationMs =
      normalizeLeaseDurationMs(
        leaseDurationMs
      );


    try {
      return await this.scope.run(
        scope,

        async (
          client,
          resolved
        ) => {
          /*
           * Lock the session row so competing acquisitions serialize.
           */
          const session =
            await this.#findSession(
              client,
              sessionId,
              true
            );


          if (
            !session
          ) {
            throw createError(
              "HUMAN_TAKEOVER_SESSION_NOT_FOUND",
              `Takeover session not found: ${sessionId}`
            );
          }


          if (
            ![
              TAKEOVER_SESSION_STATUS.AUTHORIZED,
              TAKEOVER_SESSION_STATUS.ACTIVE,
            ].includes(
              session.status
            )
          ) {
            throw createError(
              "HUMAN_TAKEOVER_SESSION_NOT_AUTHORIZED",
              [
                "Control acquisition requires",
                "an AUTHORIZED takeover session.",
                `current=${session.status}`,
              ].join(
                " "
              ),
              {
                session:
                  mapSession(
                    session
                  ),
              }
            );
          }


          /*
           * Check existing lease after session lock.
           *
           * Partial unique index remains the final database fence.
           */
          const existing =
            await client.query(
              `
                SELECT *
                FROM
                  human_operations.control_leases

                WHERE
                  incident_id = $1

                  AND
                  status = 'ACTIVE'

                LIMIT 1

                FOR UPDATE
              `,
              [
                session
                  .incident_id,
              ]
            );


          if (
            existing.rows[0]
          ) {
            throw createError(
              "HUMAN_CONTROL_LEASE_CONFLICT",
              `An ACTIVE control lease already exists for incident ${session.incident_id}`,
              {
                lease:
                  mapLease(
                    existing.rows[0]
                  ),
              }
            );
          }


          const result =
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
                  NOW() +
                    ($8::bigint * INTERVAL '1 millisecond'),
                  $9::jsonb,
                  FALSE
                )

                RETURNING *
              `,
              [
                generatePublicId(
                  "control_lease"
                ),

                resolved
                  .organizationUuid,

                resolved
                  .environmentUuid,

                session
                  .incident_id,

                session.id,

                holderUserId,

                Number(
                  session
                    .control_epoch ||
                  0
                ),

                durationMs,

                JSON.stringify({
                  ...normalizeMetadata(
                    metadata
                  ),

                  executionAuthorized:
                    false,
                }),
              ]
            );


          const lease =
            result.rows[0];


          await client.query(
            `
              UPDATE
                human_operations.takeover_sessions

              SET
                status =
                  'ACTIVE',

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
            {
              resolved,

              incidentId:
                lease.incident_id,

              takeoverSessionId:
                lease
                  .takeover_session_id,

              controlLeaseId:
                lease.id,

              eventType:
                "CONTROL_LEASE_ACQUIRED",

              actorUserId:
                holderUserId,

              controlEpoch:
                lease
                  .control_epoch,

              metadata: {
                leaseVersion:
                  Number(
                    lease
                      .lease_version
                  ),

                expiresAt:
                  lease
                    .expires_at,

                ...normalizeMetadata(
                  metadata
                ),

                executionAuthorized:
                  false,
              },
            }
          );


          return mapLease(
            lease
          );
        }
      );
    } catch (
      error
    ) {
      if (
        error?.code ===
        "23505"
      ) {
        throw createError(
          "HUMAN_CONTROL_LEASE_CONFLICT",
          "Another ACTIVE human control lease won the concurrent acquisition race",
          {
            cause:
              error,
          }
        );
      }


      throw error;
    }
  }


  /*
   * ==========================================================================
   * HEARTBEAT
   * ==========================================================================
   *
   * THIS METHOD CONTAINS THE 23.1F DURABILITY FIX.
   * ==========================================================================
   */


  async heartbeatLease({
    organizationId,
    environmentId,
    leaseId,
    holderUserId,
    leaseDurationMs = 300000,
    metadata = {},
  }) {
    const scope =
      requireScope({
        organizationId,
        environmentId,
      });


    requireValue(
      leaseId,
      "HUMAN_CONTROL_LEASE_ID_REQUIRED",
      "leaseId"
    );


    requireValue(
      holderUserId,
      "HUMAN_CONTROL_LEASE_HOLDER_REQUIRED",
      "holderUserId"
    );


    const durationMs =
      normalizeLeaseDurationMs(
        leaseDurationMs
      );


    /*
     * CRITICAL:
     *
     * Do not throw HUMAN_CONTROL_LEASE_EXPIRED from inside this
     * transaction.
     */
    const outcome =
      await this.scope.run(
        scope,

        async (
          client,
          resolved
        ) => {
          const lease =
            await this.#findLease(
              client,
              leaseId,
              true
            );


          if (
            !lease
          ) {
            throw createError(
              "HUMAN_CONTROL_LEASE_NOT_FOUND",
              `Control lease not found: ${leaseId}`
            );
          }


          if (
            lease.status !==
            CONTROL_LEASE_STATUS.ACTIVE
          ) {
            throw createError(
              "HUMAN_CONTROL_LEASE_NOT_ACTIVE",
              [
                "Control lease heartbeat requires",
                "an ACTIVE lease.",
                `current=${lease.status}`,
              ].join(
                " "
              ),
              {
                lease:
                  mapLease(
                    lease
                  ),
              }
            );
          }


          if (
            String(
              lease.holder_user_id
            ) !==
            String(
              holderUserId
            )
          ) {
            throw createError(
              "HUMAN_CONTROL_LEASE_NOT_OWNER",
              "Only the current control-lease holder may heartbeat the lease",
              {
                lease:
                  mapLease(
                    lease
                  ),
              }
            );
          }


          const expiresAt =
            new Date(
              lease.expires_at
            );


          const expired =
            Number.isNaN(
              expiresAt.getTime()
            )
              ? true
              : expiresAt.getTime() <=
                Date.now();


          /*
           * --------------------------------------------------------------------
           * DURABLE EXPIRY PATH
           * --------------------------------------------------------------------
           *
           * Persist everything and RETURN a sentinel.
           * PostgresTenantScope.run() will COMMIT.
           *
           * heartbeatLease() throws only AFTER this scope.run() completes.
           */
          if (
            expired
          ) {
            const expiredLeaseResult =
              await client.query(
                `
                  UPDATE
                    human_operations.control_leases

                  SET
                    status =
                      'EXPIRED',

                    heartbeat_at =
                      NOW(),

                    lease_version =
                      lease_version + 1,

                    metadata =
                      metadata ||
                      $2::jsonb

                  WHERE
                    id = $1

                    AND
                    status = 'ACTIVE'

                  RETURNING *
                `,
                [
                  lease.id,

                  JSON.stringify({
                    ...normalizeMetadata(
                      metadata
                    ),

                    expiryDetectedBy:
                      "HEARTBEAT",

                    expiryDurable:
                      true,

                    executionAuthorized:
                      false,
                  }),
                ]
              );


            const expiredLease =
              expiredLeaseResult.rows[0] ||
              lease;


            /*
             * The session must expire in the SAME committed transaction.
             *
             * We only transition states that could still represent takeover
             * ownership.
             */
            await client.query(
              `
                UPDATE
                  human_operations.takeover_sessions

                SET
                  status =
                    'EXPIRED',

                  expires_at =
                    COALESCE(
                      expires_at,
                      NOW()
                    ),

                  metadata =
                    metadata ||
                    $2::jsonb

                WHERE
                  id = $1

                  AND
                  status IN (
                    'AUTHORIZED',
                    'ACTIVE',
                    'RELEASING'
                  )
              `,
              [
                lease
                  .takeover_session_id,

                JSON.stringify({
                  leaseExpiryDetected:
                    true,

                  leaseId:
                    lease.public_id ||
                    lease.id,

                  requiresFreshEvaluation:
                    true,

                  stalePlanResumeAllowed:
                    false,

                  executionAuthorized:
                    false,
                }),
              ]
            );


            await this.#insertEvent(
              client,
              {
                resolved,

                incidentId:
                  lease.incident_id,

                takeoverSessionId:
                  lease
                    .takeover_session_id,

                controlLeaseId:
                  lease.id,

                eventType:
                  "CONTROL_LEASE_EXPIRED",

                actorUserId:
                  holderUserId,

                controlEpoch:
                  lease
                    .control_epoch,

                metadata: {
                  detectedBy:
                    "HEARTBEAT",

                  previousStatus:
                    lease.status,

                  expiresAt:
                    lease.expires_at,

                  detectedAt:
                    new Date()
                      .toISOString(),

                  requiresFreshEvaluation:
                    true,

                  stalePlanResumeAllowed:
                    false,

                  ...normalizeMetadata(
                    metadata
                  ),

                  executionAuthorized:
                    false,
                },
              }
            );


            /*
             * DO NOT THROW HERE.
             */
            return {
              expired:
                true,

              lease:
                mapLease(
                  expiredLease
                ),
            };
          }


          /*
           * --------------------------------------------------------------------
           * HEALTHY HEARTBEAT PATH
           * --------------------------------------------------------------------
           */

          const result =
            await client.query(
              `
                UPDATE
                  human_operations.control_leases

                SET
                  heartbeat_at =
                    NOW(),

                  expires_at =
                    NOW() +
                      ($2::bigint * INTERVAL '1 millisecond'),

                  lease_version =
                    lease_version + 1,

                  metadata =
                    metadata ||
                    $3::jsonb

                WHERE
                  id = $1

                  AND
                  status = 'ACTIVE'

                RETURNING *
              `,
              [
                lease.id,

                durationMs,

                JSON.stringify({
                  ...normalizeMetadata(
                    metadata
                  ),

                  executionAuthorized:
                    false,
                }),
              ]
            );


          const heartbeat =
            result.rows[0];


          if (
            !heartbeat
          ) {
            throw createError(
              "HUMAN_CONTROL_LEASE_HEARTBEAT_CONFLICT",
              "Control lease changed before heartbeat could be committed"
            );
          }


          await this.#insertEvent(
            client,
            {
              resolved,

              incidentId:
                heartbeat
                  .incident_id,

              takeoverSessionId:
                heartbeat
                  .takeover_session_id,

              controlLeaseId:
                heartbeat.id,

              eventType:
                "CONTROL_LEASE_HEARTBEAT",

              actorUserId:
                holderUserId,

              controlEpoch:
                heartbeat
                  .control_epoch,

              metadata: {
                leaseVersion:
                  Number(
                    heartbeat
                      .lease_version
                  ),

                expiresAt:
                  heartbeat
                    .expires_at,

                ...normalizeMetadata(
                  metadata
                ),

                executionAuthorized:
                  false,
              },
            }
          );


          return {
            expired:
              false,

            lease:
              mapLease(
                heartbeat
              ),
          };
        }
      );


    /*
     * ==========================================================================
     * OUTSIDE TRANSACTION
     * ==========================================================================
     *
     * At this point PostgresTenantScope.run() has committed:
     *
     *   lease = EXPIRED
     *   session = EXPIRED
     *   event = CONTROL_LEASE_EXPIRED
     *
     * It is now safe to report the domain error.
     */
    if (
      outcome
        ?.expired ===
      true
    ) {
      throw createError(
        "HUMAN_CONTROL_LEASE_EXPIRED",
        "Human control lease has expired",
        {
          lease:
            outcome.lease,

          humanControlActive:
            false,

          requiresFreshEvaluation:
            true,

          stalePlanResumeAllowed:
            false,
        }
      );
    }


    return outcome
      ?.lease ||
      null;
  }


  async getActiveLeaseForIncident({
    organizationId,
    environmentId,
    incidentId,
  }) {
    const scope =
      requireScope({
        organizationId,
        environmentId,
      });


    requireValue(
      incidentId,
      "HUMAN_TAKEOVER_INCIDENT_REQUIRED",
      "incidentId"
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
                human_operations.control_leases

              WHERE
                incident_id = $1

                AND
                status = 'ACTIVE'

                AND
                expires_at > NOW()

              ORDER BY
                acquired_at DESC NULLS LAST,
                created_at DESC

              LIMIT 1
            `,
            [
              String(
                incidentId
              ),
            ]
          );


        return mapLease(
          result.rows[0]
        );
      }
    );
  }


  async releaseControlLease({
    organizationId,
    environmentId,
    leaseId,

    holderUserId = null,
    actorUserId = null,

    reason = null,
    force = false,
    metadata = {},
  }) {
    const scope =
      requireScope({
        organizationId,
        environmentId,
      });


    requireValue(
      leaseId,
      "HUMAN_CONTROL_LEASE_ID_REQUIRED",
      "leaseId"
    );


    const actorId =
      actorUserId ||
      holderUserId ||
      null;


    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const lease =
          await this.#findLease(
            client,
            leaseId,
            true
          );


        if (
          !lease
        ) {
          throw createError(
            "HUMAN_CONTROL_LEASE_NOT_FOUND",
            `Control lease not found: ${leaseId}`
          );
        }


        if (
          lease.status ===
          CONTROL_LEASE_STATUS.RELEASED
        ) {
          return mapLease(
            lease
          );
        }


        if (
          lease.status !==
          CONTROL_LEASE_STATUS.ACTIVE
        ) {
          throw createError(
            "HUMAN_CONTROL_LEASE_NOT_ACTIVE",
            [
              "Only an ACTIVE lease can be released.",
              `current=${lease.status}`,
            ].join(
              " "
            ),
            {
              lease:
                mapLease(
                  lease
                ),
            }
          );
        }


        if (
          !force
        ) {
          requireValue(
            actorId,
            "HUMAN_CONTROL_LEASE_HOLDER_REQUIRED",
            "holderUserId"
          );


          if (
            String(
              lease
                .holder_user_id
            ) !==
            String(
              actorId
            )
          ) {
            throw createError(
              "HUMAN_CONTROL_LEASE_NOT_OWNER",
              "Only the current lease holder may release human control",
              {
                lease:
                  mapLease(
                    lease
                  ),
              }
            );
          }
        }


        /*
         * Mark session as RELEASING before completing the release.
         */
        await client.query(
          `
            UPDATE
              human_operations.takeover_sessions

            SET
              status =
                'RELEASING',

              release_requested_at =
                COALESCE(
                  release_requested_at,
                  NOW()
                )

            WHERE
              id = $1

              AND
              status = 'ACTIVE'
          `,
          [
            lease
              .takeover_session_id,
          ]
        );


        const result =
          await client.query(
            `
              UPDATE
                human_operations.control_leases

              SET
                status =
                  'RELEASED',

                released_at =
                  NOW(),

                release_reason =
                  $2,

                lease_version =
                  lease_version + 1,

                metadata =
                  metadata ||
                  $3::jsonb

              WHERE
                id = $1

              RETURNING *
            `,
            [
              lease.id,

              reason
                ? String(
                    reason
                  )
                : null,

              JSON.stringify({
                ...normalizeMetadata(
                  metadata
                ),

                requiresFreshEvaluation:
                  true,

                stalePlanResumeAllowed:
                  false,

                executionAuthorized:
                  false,
              }),
            ]
          );


        const released =
          result.rows[0];


        await client.query(
          `
            UPDATE
              human_operations.takeover_sessions

            SET
              status =
                'RELEASED',

              released_at =
                NOW(),

              metadata =
                metadata ||
                $2::jsonb

            WHERE
              id = $1

              AND
              status IN (
                'ACTIVE',
                'RELEASING'
              )
          `,
          [
            lease
              .takeover_session_id,

            JSON.stringify({
              requiresFreshEvaluation:
                true,

              stalePlanResumeAllowed:
                false,

              executionAuthorized:
                false,
            }),
          ]
        );


        await this.#insertEvent(
          client,
          {
            resolved,

            incidentId:
              released
                .incident_id,

            takeoverSessionId:
              released
                .takeover_session_id,

            controlLeaseId:
              released.id,

            eventType:
              "CONTROL_LEASE_RELEASED",

            actorUserId:
              actorId,

            controlEpoch:
              released
                .control_epoch,

            metadata: {
              reason:
                reason ||
                null,

              force:
                Boolean(
                  force
                ),

              requiresFreshEvaluation:
                true,

              stalePlanResumeAllowed:
                false,

              ...normalizeMetadata(
                metadata
              ),

              executionAuthorized:
                false,
            },
          }
        );


        return mapLease(
          released
        );
      }
    );
  }


  async expireControlLease({
    organizationId,
    environmentId,
    leaseId,
    actorUserId = null,
    reason = "CONTROL_LEASE_EXPIRED",
    metadata = {},
  }) {
    const scope =
      requireScope({
        organizationId,
        environmentId,
      });


    requireValue(
      leaseId,
      "HUMAN_CONTROL_LEASE_ID_REQUIRED",
      "leaseId"
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
            leaseId,
            true
          );


        if (
          !lease
        ) {
          throw createError(
            "HUMAN_CONTROL_LEASE_NOT_FOUND",
            `Control lease not found: ${leaseId}`
          );
        }


        if (
          lease.status ===
          CONTROL_LEASE_STATUS.EXPIRED
        ) {
          return mapLease(
            lease
          );
        }


        if (
          lease.status !==
          CONTROL_LEASE_STATUS.ACTIVE
        ) {
          throw createError(
            "HUMAN_CONTROL_LEASE_NOT_ACTIVE",
            [
              "Only an ACTIVE control lease can expire.",
              `current=${lease.status}`,
            ].join(
              " "
            ),
            {
              lease:
                mapLease(
                  lease
                ),
            }
          );
        }


        const result =
          await client.query(
            `
              UPDATE
                human_operations.control_leases

              SET
                status =
                  'EXPIRED',

                lease_version =
                  lease_version + 1,

                metadata =
                  metadata ||
                  $2::jsonb

              WHERE
                id = $1

              RETURNING *
            `,
            [
              lease.id,

              JSON.stringify({
                ...normalizeMetadata(
                  metadata
                ),

                reason,

                requiresFreshEvaluation:
                  true,

                stalePlanResumeAllowed:
                  false,

                executionAuthorized:
                  false,
              }),
            ]
          );


        const expired =
          result.rows[0];


        await client.query(
          `
            UPDATE
              human_operations.takeover_sessions

            SET
              status =
                'EXPIRED',

              expires_at =
                COALESCE(
                  expires_at,
                  NOW()
                ),

              metadata =
                metadata ||
                $2::jsonb

            WHERE
              id = $1

              AND
              status IN (
                'AUTHORIZED',
                'ACTIVE',
                'RELEASING'
              )
          `,
          [
            lease
              .takeover_session_id,

            JSON.stringify({
              reason,

              requiresFreshEvaluation:
                true,

              stalePlanResumeAllowed:
                false,

              executionAuthorized:
                false,
            }),
          ]
        );


        await this.#insertEvent(
          client,
          {
            resolved,

            incidentId:
              expired
                .incident_id,

            takeoverSessionId:
              expired
                .takeover_session_id,

            controlLeaseId:
              expired.id,

            eventType:
              "CONTROL_LEASE_EXPIRED",

            actorUserId,

            controlEpoch:
              expired
                .control_epoch,

            metadata: {
              reason,

              requiresFreshEvaluation:
                true,

              stalePlanResumeAllowed:
                false,

              ...normalizeMetadata(
                metadata
              ),

              executionAuthorized:
                false,
            },
          }
        );


        return mapLease(
          expired
        );
      }
    );
  }


  /*
   * ==========================================================================
   * INCIDENT EVENT HISTORY
   * ==========================================================================
   */


  async listIncidentEvents({
    organizationId,
    environmentId,
    incidentId,
    limit = 200,
  }) {
    const scope =
      requireScope({
        organizationId,
        environmentId,
      });


    requireValue(
      incidentId,
      "HUMAN_TAKEOVER_INCIDENT_REQUIRED",
      "incidentId"
    );


    const safeLimit =
      Math.min(
        Math.max(
          Number.parseInt(
            limit,
            10
          ) ||
          200,

          1
        ),

        1000
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
                created_at ASC,
                id ASC

              LIMIT $2
            `,
            [
              String(
                incidentId
              ),

              safeLimit,
            ]
          );


        return result.rows.map(
          mapEvent
        );
      }
    );
  }


  /*
   * ==========================================================================
   * PRIVATE LOOKUPS
   * ==========================================================================
   */


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
            public_id = $1
            OR
            id::text = $1

          LIMIT 1
        `,
        [
          String(
            taskId
          ),
        ]
      );


    return result.rows[0] ||
      null;
  }


  async #findSession(
    client,
    sessionId,
    forUpdate = false
  ) {
    const result =
      await client.query(
        `
          SELECT *
          FROM
            human_operations.takeover_sessions

          WHERE
            public_id = $1
            OR
            id::text = $1

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


    return result.rows[0] ||
      null;
  }


  async #findLease(
    client,
    leaseId,
    forUpdate = false
  ) {
    const result =
      await client.query(
        `
          SELECT *
          FROM
            human_operations.control_leases

          WHERE
            public_id = $1
            OR
            id::text = $1

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


    return result.rows[0] ||
      null;
  }


  /*
   * ==========================================================================
   * IMMUTABLE TAKEOVER EVENT
   * ==========================================================================
   */


  async #insertEvent(
    client,
    {
      resolved,
      incidentId,
      takeoverSessionId = null,
      controlLeaseId = null,
      eventType,
      actorUserId = null,
      controlEpoch = 0,
      metadata = {},
    }
  ) {
    requireValue(
      incidentId,
      "HUMAN_TAKEOVER_EVENT_INCIDENT_REQUIRED",
      "incidentId"
    );


    requireValue(
      eventType,
      "HUMAN_TAKEOVER_EVENT_TYPE_REQUIRED",
      "eventType"
    );


    const result =
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

          RETURNING *
        `,
        [
          generatePublicId(
            "takeover_event"
          ),

          resolved
            .organizationUuid,

          resolved
            .environmentUuid,

          String(
            incidentId
          ),

          takeoverSessionId,

          controlLeaseId,

          String(
            eventType
          ),

          actorUserId,

          Number(
            controlEpoch ||
            0
          ),

          JSON.stringify({
            ...normalizeMetadata(
              metadata
            ),

            executionAuthorized:
              false,
          }),
        ]
      );


    return mapEvent(
      result.rows[0]
    );
  }
}


/*
 * ============================================================================
 * EXPORT
 * ============================================================================
 */


module.exports =
  PostgresHumanTakeoverRepository;