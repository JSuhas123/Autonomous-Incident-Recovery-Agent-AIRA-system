"use strict";

const crypto =
  require(
    "node:crypto"
  );

const WorkflowOutboxRepository =
  require(
    "../repositories/WorkflowOutboxRepository"
  );

const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );

const {
  normalizeId,
  serializeDocument,
  reviveDocument,
  translatePostgresError,
} =
  require(
    "./postgresDomainMapper"
  );

const {
  assertNoExecutionAuthority,
} =
  require(
    "../../services/workflowOutbox/workflowOutboxContracts"
  );

class PostgresWorkflowOutboxRepository
  extends WorkflowOutboxRepository {
  constructor(
    options = {}
  ) {
    super();

    this.scope =
      options.scope ||
      new PostgresTenantScope(
        options
      );
  }

  async create(
    data,
    transaction = null
  ) {
    const scope =
      requireScope(
        data
      );

    assertNoExecutionAuthority(
      data.payload ||
      {}
    );

    if (
      data.executionAuthorized ===
      true
    ) {
      throw unsafeAuthorityError();
    }

    return this.scope.run(
      scope,
      async (
        client,
        resolved
      ) => {
        const incident =
          await this.scope
            .identityResolver
            .resolveIncident(
              client,
              resolved,
              data.incidentId
            );

        if (!incident) {
          throw Object.assign(
            new Error(
              `Incident not found: ${data.incidentId}`
            ),
            {
              code:
                "POSTGRES_INCIDENT_NOT_FOUND",
            }
          );
        }

        const databaseId =
          normalizeId(
            data._id
          ) ||
          crypto
            .randomBytes(
              12
            )
            .toString(
              "hex"
            );

        const document =
          serializeDocument({
            ...data,

            _id:
              databaseId,

            executionAuthorized:
              false,
          });

        try {
          const result =
            await client.query(
              `
                INSERT INTO workflow.outbox_events (
                  public_id,
                  database_id,
                  event_key,
                  payload_fingerprint,
                  organization_id,
                  environment_id,
                  incident_id,
                  event_type,
                  aggregate_type,
                  aggregate_id,
                  status,
                  payload,
                  owner_worker_id,
                  owner_claim_token,
                  owner_claimed_at,
                  owner_heartbeat_at,
                  owner_lease_expires_at,
                  attempt_count,
                  max_attempts,
                  last_attempt_at,
                  next_attempt_at,
                  delivered_at,
                  message_id,
                  queue,
                  exchange,
                  routing_key,
                  failure_code,
                  failure_message,
                  failure_retryable,
                  failed_at,
                  dead_letter_reason,
                  dead_lettered_at,
                  execution_authorized,
                  metadata,
                  document
                )
                VALUES (
                  $1,  $2,  $3,  $4,  $5,
                  $6,  $7,  $8,  $9,  $10,
                  $11, $12::jsonb, $13, $14, $15,
                  $16, $17, $18, $19, $20,
                  $21, $22, $23, $24, $25,
                  $26, $27, $28, $29, $30,
                  $31, $32, FALSE, $33::jsonb, $34::jsonb
                )
                RETURNING *
              `,
              [
                data.eventId,

                databaseId,

                data.eventKey,

                data.payloadFingerprint,

                resolved.organizationUuid,

                resolved.environmentUuid,

                incident.id,

                data.eventType,

                data.aggregateType,

                data.aggregateId,

                data.status ||
                  "pending",

                JSON.stringify(
                  data.payload ||
                  {}
                ),

                data.owner
                  ?.workerId ||
                  null,

                data.owner
                  ?.claimToken ||
                  null,

                data.owner
                  ?.claimedAt ||
                  null,

                data.owner
                  ?.heartbeatAt ||
                  null,

                data.owner
                  ?.leaseExpiresAt ||
                  null,

                Number(
                  data.attempts
                    ?.count ||
                  0
                ),

                Number(
                  data.attempts
                    ?.maxAttempts ||
                  10
                ),

                data.attempts
                  ?.lastAttemptAt ||
                  null,

                data.attempts
                  ?.nextAttemptAt ||
                  null,

                data.delivery
                  ?.deliveredAt ||
                  null,

                data.delivery
                  ?.messageId ||
                  null,

                data.delivery
                  ?.queue ||
                  null,

                data.delivery
                  ?.exchange ||
                  null,

                data.delivery
                  ?.routingKey ||
                  null,

                data.failure
                  ?.code ||
                  null,

                data.failure
                  ?.message ||
                  null,

                Boolean(
                  data.failure
                    ?.retryable
                ),

                data.failure
                  ?.failedAt ||
                  null,

                data.deadLetter
                  ?.reason ||
                  null,

                data.deadLetter
                  ?.deadLetteredAt ||
                  null,

                JSON.stringify(
                  data.metadata ||
                  {}
                ),

                JSON.stringify(
                  document
                ),
              ]
            );

          return mapEvent(
            result.rows[0],
            scope
          );
        } catch (
          error
        ) {
          throw translatePostgresError(
            error
          );
        }
      },
      transaction
    );
  }

  async findByEventId(
    scope,
    eventId,
    transaction = null
  ) {
    requireScope(
      scope
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
              FROM workflow.outbox_events
              WHERE public_id = $1
              LIMIT 1
            `,
            [
              eventId,
            ]
          );

        return result.rows[0]
          ? mapEvent(
              result.rows[0],
              scope
            )
          : null;
      },
      transaction
    );
  }

  async findByEventKey(
    scope,
    eventKey,
    transaction = null
  ) {
    requireScope(
      scope
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
              FROM workflow.outbox_events
              WHERE event_key = $1
              LIMIT 1
            `,
            [
              eventKey,
            ]
          );

        return result.rows[0]
          ? mapEvent(
              result.rows[0],
              scope
            )
          : null;
      },
      transaction
    );
  }

  async claim(
    scope,
    {
      eventId,
      ownerId,
      claimToken,
      currentTime,
      leaseExpiresAt,
    },
    transaction = null
  ) {
    return this.scope.run(
      requireScope(
        scope
      ),
      async (
        client
      ) => {
        const result =
          await client.query(
            `
              UPDATE workflow.outbox_events
              SET
                status = 'processing',
                owner_worker_id = $2,
                owner_claim_token = $3,
                owner_claimed_at = $4,
                owner_heartbeat_at = $4,
                owner_lease_expires_at = $5,
                attempt_count = attempt_count + 1,
                failure_code = NULL,
                failure_message = NULL,
                failure_retryable = FALSE,
                failed_at = NULL
              WHERE
                public_id = $1
                AND status IN (
                  'pending',
                  'failed',
                  'processing'
                )
                AND (
                  owner_lease_expires_at IS NULL
                  OR
                  owner_lease_expires_at <= $4
                )
                AND attempt_count < max_attempts
              RETURNING *
            `,
            [
              eventId,
              ownerId,
              claimToken,
              currentTime,
              leaseExpiresAt,
            ]
          );

        return result.rows[0]
          ? mapEvent(
              result.rows[0],
              scope
            )
          : null;
      },
      transaction
    );
  }

  async heartbeat(
    scope,
    {
      eventId,
      ownerId,
      claimToken,
      currentTime,
      leaseExpiresAt,
    },
    transaction = null
  ) {
    return this.ownedUpdate(
      scope,
      {
        eventId,
        ownerId,
        claimToken,
        currentTime,
      },
      `
        owner_heartbeat_at = $5,
        owner_lease_expires_at = $6
      `,
      [
        currentTime,
        leaseExpiresAt,
      ],
      transaction
    );
  }

  async markDelivered(
    scope,
    {
      eventId,
      ownerId,
      claimToken,
      currentTime,
      messageId,
      queue,
      exchange,
      routingKey,
    },
    transaction = null
  ) {
    return this.ownedUpdate(
      scope,
      {
        eventId,
        ownerId,
        claimToken,
        currentTime,
      },
      `
        status = 'delivered',
        delivered_at = $5,
        message_id = $6,
        queue = $7,
        exchange = $8,
        routing_key = $9,
        owner_heartbeat_at = $5,
        owner_lease_expires_at = $5,
        next_attempt_at = NULL,
        failure_code = NULL,
        failure_message = NULL,
        failure_retryable = FALSE,
        failed_at = NULL
      `,
      [
        currentTime,
        messageId ||
          null,
        queue ||
          null,
        exchange ||
          null,
        routingKey ||
          null,
      ],
      transaction
    );
  }

  async markFailed(
    scope,
    {
      eventId,
      ownerId,
      claimToken,
      currentTime,
      error,
      retryable,
      nextAttemptAt,
    },
    transaction = null
  ) {
    return this.ownedUpdate(
      scope,
      {
        eventId,
        ownerId,
        claimToken,
        currentTime,
      },
      `
        status = 'failed',
        failure_code = $5,
        failure_message = $6,
        failure_retryable = $7,
        failed_at = $8,
        last_attempt_at = $8,
        next_attempt_at = $9,
        owner_heartbeat_at = $8,
        owner_lease_expires_at = $8
      `,
      [
        error?.code ||
          "OUTBOX_DELIVERY_FAILED",

        error?.message ||
          "Workflow outbox delivery failed",

        retryable ===
          true,

        currentTime,

        nextAttemptAt ||
          null,
      ],
      transaction
    );
  }

  async markDeadLetter(
    scope,
    {
      eventId,
      ownerId,
      claimToken,
      currentTime,
      reason,
    },
    transaction = null
  ) {
    return this.ownedUpdate(
      scope,
      {
        eventId,
        ownerId,
        claimToken,
        currentTime,
      },
      `
        status = 'dead_letter',
        dead_letter_reason = $5,
        dead_lettered_at = $6,
        next_attempt_at = NULL,
        owner_heartbeat_at = $6,
        owner_lease_expires_at = $6
      `,
      [
        String(
          reason
        ).trim(),

        currentTime,
      ],
      transaction
    );
  }

  async ownedUpdate(
    scope,
    {
      eventId,
      ownerId,
      claimToken,
      currentTime,
    },
    setSql,
    extraValues,
    transaction
  ) {
    return this.scope.run(
      requireScope(
        scope
      ),
      async (
        client
      ) => {
        const result =
          await client.query(
            `
              UPDATE workflow.outbox_events
              SET
                ${setSql}
              WHERE
                public_id = $1
                AND status = 'processing'
                AND owner_worker_id = $2
                AND owner_claim_token = $3
                AND owner_lease_expires_at > $4
              RETURNING *
            `,
            [
              eventId,
              ownerId,
              claimToken,
              currentTime,
              ...extraValues,
            ]
          );

        return result.rows[0]
          ? mapEvent(
              result.rows[0],
              scope
            )
          : null;
      },
      transaction
    );
  }


  async findForIncident(
    scope,
    incidentId,
    transaction = null
  ) {
    requireScope(
      scope
    );

    return this.scope.run(
      scope,
      async (
        client
      ) => {
        const incident =
          await this.scope
            .identityResolver
            .resolveIncident(
              client,
              scope,
              incidentId
            );

        if (!incident) {
          return [];
        }

        const result =
          await client.query(
            `
              SELECT *
              FROM workflow.outbox_events
              WHERE incident_id = $1
              ORDER BY created_at ASC
            `,
            [
              incident.id,
            ]
          );

        return result.rows.map(
          (
            row
          ) =>
            mapEvent(
              row,
              scope
            )
        );
      },
      transaction
    );
  }
  async findDeliverable() {
    throw Object.assign(
      new Error(
        "PostgreSQL global outbox scanning requires the dedicated Phase 13.5 worker-role strategy"
      ),
      {
        code:
          "POSTGRES_OUTBOX_WORKER_ROLE_REQUIRED",
      }
    );
  }
}

function mapEvent(
  row,
  scope
) {
  const document =
    reviveDocument(
      row.document ||
      {}
    );

  return {
    ...document,

    _id:
      row.database_id ||
      row.id,

    eventId:
      row.public_id,

    eventKey:
      row.event_key,

    payloadFingerprint:
      row.payload_fingerprint,

    organizationId:
      normalizeId(
        scope.organizationId
      ),

    environmentId:
      normalizeId(
        scope.environmentId
      ),

    aggregateType:
      row.aggregate_type,

    aggregateId:
      row.aggregate_id,

    eventType:
      row.event_type,

    payload:
      row.payload ||
      {},

    metadata:
      row.metadata ||
      {},

    status:
      row.status,

    owner: {
      workerId:
        row.owner_worker_id,

      claimToken:
        row.owner_claim_token,

      claimedAt:
        row.owner_claimed_at,

      heartbeatAt:
        row.owner_heartbeat_at,

      leaseExpiresAt:
        row.owner_lease_expires_at,
    },

    attempts: {
      count:
        row.attempt_count,

      maxAttempts:
        row.max_attempts,

      lastAttemptAt:
        row.last_attempt_at,

      nextAttemptAt:
        row.next_attempt_at,
    },

    delivery: {
      deliveredAt:
        row.delivered_at,

      messageId:
        row.message_id,

      queue:
        row.queue,

      exchange:
        row.exchange,

      routingKey:
        row.routing_key,
    },

    failure: {
      code:
        row.failure_code,

      message:
        row.failure_message,

      retryable:
        row.failure_retryable,

      failedAt:
        row.failed_at,
    },

    deadLetter: {
      reason:
        row.dead_letter_reason,

      deadLetteredAt:
        row.dead_lettered_at,
    },

    executionAuthorized:
      false,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

function requireScope(
  value = {}
) {
  if (
    !value.organizationId ||
    !value.environmentId
  ) {
    throw Object.assign(
      new Error(
        "Workflow outbox PostgreSQL operation requires organizationId and environmentId"
      ),
      {
        code:
          "POSTGRES_OUTBOX_SCOPE_REQUIRED",
      }
    );
  }

  return value;
}

function unsafeAuthorityError() {
  return Object.assign(
    new Error(
      "Workflow outbox event cannot contain execution authorization"
    ),
    {
      code:
        "OUTBOX_UNSAFE_AUTHORITY",
    }
  );
}

module.exports =
  PostgresWorkflowOutboxRepository;
