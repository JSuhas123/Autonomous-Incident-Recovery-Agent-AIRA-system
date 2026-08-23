"use strict";

const IncidentEventRepository =
  require(
    "../repositories/IncidentEventRepository"
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

class PostgresIncidentEventRepository
  extends IncidentEventRepository {
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
    const context =
      requireScope(
        data
      );

    return this.scope.run(
      context,
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

        const document =
          serializeDocument(
            data
          );

        try {
          const result =
            await client.query(
              `
                INSERT INTO incidents.incident_events (
                  public_id,
                  organization_id,
                  environment_id,
                  incident_id,
                  event_type,
                  source,
                  correlation_id,
                  payload,
                  metadata,
                  occurred_at,
                  status,
                  processed_at,
                  processing_time_ms,
                  tenant_public_id,
                  service_id,
                  monitor_id,
                  correlation_group_id,
                  signal_id,
                  incident_status,
                  severity,
                  issue,
                  occurrence_count,
                  previous_status,
                  new_status,
                  change_type,
                  confidence_score,
                  suggested_action,
                  action_tier,
                  retry_count,
                  published_at,
                  failed_at,
                  error,
                  document
                )
                VALUES (
                  $1,  $2,  $3,  $4,  $5,
                  $6,  $7,  $8::jsonb, $9::jsonb, $10,
                  $11, $12, $13, $14, $15,
                  $16, $17, $18, $19, $20,
                  $21, $22, $23, $24, $25,
                  $26, $27, $28, $29, $30,
                  $31, $32, $33::jsonb
                )
                RETURNING *
              `,
              eventValues(
                data,
                document,
                incident.id,
                resolved
              )
            );

          return mapEvent(
            result.rows[0],
            context
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
    context,
    eventId,
    transaction = null
  ) {
    requireScope(
      context
    );

    return this.scope.run(
      context,
      async (
        client
      ) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM incidents.incident_events
              WHERE public_id = $1
              LIMIT 1
            `,
            [
              normalizeId(
                eventId
              ),
            ]
          );

        return result.rows[0]
          ? mapEvent(
              result.rows[0],
              context
            )
          : null;
      },
      transaction
    );
  }

  async save(
    event,
    transaction = null
  ) {
    if (
      !event?.eventId ||
      !event.organizationId ||
      !event.environmentId
    ) {
      throw Object.assign(
        new Error(
          "PostgresIncidentEventRepository.save() requires eventId and scope"
        ),
        {
          code:
            "INVALID_INCIDENT_EVENT_DOCUMENT",
        }
      );
    }

    const context = {
      organizationId:
        event.organizationId,

      environmentId:
        event.environmentId,
    };

    return this.scope.run(
      context,
      async (
        client
      ) => {
        const document =
          serializeDocument(
            event
          );

        const result =
          await client.query(
            `
              UPDATE incidents.incident_events
              SET
                status = $2,
                processed_at = $3,
                processing_time_ms = $4,
                retry_count = $5,
                published_at = $6,
                failed_at = $7,
                error = $8,
                payload = $9::jsonb,
                metadata = $10::jsonb,
                document = $11::jsonb
              WHERE public_id = $1
              RETURNING *
            `,
            [
              normalizeId(
                event.eventId
              ),

              event.status ||
                "pending",

              event.processedAt ||
                null,

              event
                .processingTimeMs ??
                null,

              Number(
                event.retryCount ||
                0
              ),

              event.publishedAt ||
                null,

              event.failedAt ||
                null,

              event.error ||
                null,

              JSON.stringify(
                event.payload ||
                {}
              ),

              JSON.stringify(
                event.metadata ||
                {}
              ),

              JSON.stringify(
                document
              ),
            ]
          );

        return result.rows[0]
          ? mapEvent(
              result.rows[0],
              context
            )
          : null;
      },
      transaction
    );
  }

  async markProcessed(
    context,
    eventId,
    processingTimeMs = null,
    transaction = null
  ) {
    requireScope(
      context
    );

    return this.scope.run(
      context,
      async (
        client
      ) => {
        const result =
          await client.query(
            `
              UPDATE incidents.incident_events
              SET
                status = 'processed',
                processed_at = NOW(),
                processing_time_ms = $2,
                document =
                  jsonb_set(
                    jsonb_set(
                      document,
                      '{status}',
                      '"processed"'::jsonb,
                      true
                    ),
                    '{processingTimeMs}',
                    to_jsonb($2::bigint),
                    true
                  )
              WHERE public_id = $1
              RETURNING *
            `,
            [
              normalizeId(
                eventId
              ),

              processingTimeMs,
            ]
          );

        return result.rows[0]
          ? mapEvent(
              result.rows[0],
              context
            )
          : null;
      },
      transaction
    );
  }

  async listForIncident(
    context,
    incidentId,
    limit = 200,
    transaction = null
  ) {
    requireScope(
      context
    );

    const safeLimit =
      Math.min(
        Math.max(
          Number(
            limit
          ) ||
          200,
          1
        ),
        1000
      );

    return this.scope.run(
      context,
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
              incidentId
            );

        if (!incident) {
          return [];
        }

        const result =
          await client.query(
            `
              SELECT *
              FROM incidents.incident_events
              WHERE incident_id = $1
              ORDER BY occurred_at ASC
              LIMIT $2
            `,
            [
              incident.id,
              safeLimit,
            ]
          );

        return result.rows.map(
          (
            row
          ) =>
            mapEvent(
              row,
              context
            )
        );
      },
      transaction
    );
  }
}

function requireScope(
  context = {}
) {
  if (
    !context.organizationId ||
    !context.environmentId
  ) {
    throw Object.assign(
      new Error(
        "IncidentEvent PostgreSQL operation requires organizationId and environmentId"
      ),
      {
        code:
          "POSTGRES_INCIDENT_EVENT_SCOPE_REQUIRED",
      }
    );
  }

  return context;
}

function eventValues(
  event,
  document,
  incidentUuid,
  resolved
) {
  return [
    event.eventId,

    resolved.organizationUuid,

    resolved.environmentUuid,

    incidentUuid,

    event.eventType,

    event.source ||
      "incident_service",

    event.correlationId,

    JSON.stringify(
      event.payload ||
      {}
    ),

    JSON.stringify(
      event.metadata ||
      {}
    ),

    event.occurredAt ||
      new Date(),

    event.status ||
      "pending",

    event.processedAt ||
      null,

    event
      .processingTimeMs ??
      null,

    event.tenantId ||
      null,

    normalizeId(
      event.serviceId
    ),

    normalizeId(
      event.monitorId
    ),

    event.correlationGroupId ||
      null,

    event.signalId ||
      null,

    event.incidentStatus ||
      null,

    event.severity ||
      "warning",

    event.issue ||
      null,

    Number(
      event.occurrenceCount ||
      0
    ),

    event.previousStatus ||
      null,

    event.newStatus ||
      null,

    event.changeType ||
      null,

    event
      .confidenceScore ??
      null,

    event.suggestedAction ||
      null,

    event.actionTier ||
      null,

    Number(
      event.retryCount ||
      0
    ),

    event.publishedAt ||
      null,

    event.failedAt ||
      null,

    event.error ||
      null,

    JSON.stringify(
      document
    ),
  ];
}

function mapEvent(
  row,
  context
) {
  const document =
    reviveDocument(
      row.document ||
      {}
    );

  return {
    ...document,

    _id:
      row.id,

    eventId:
      row.public_id,

    organizationId:
      document.organizationId ||
      normalizeId(
        context.organizationId
      ),

    environmentId:
      document.environmentId ||
      normalizeId(
        context.environmentId
      ),

    incidentId:
      document.incidentId,

    status:
      row.status,

    processedAt:
      row.processed_at,

    processingTimeMs:
      row.processing_time_ms,

    publishedAt:
      row.published_at,

    failedAt:
      row.failed_at,

    retryCount:
      row.retry_count,

    error:
      row.error,

    occurredAt:
      row.occurred_at,

    createdAt:
      row.created_at,
  };
}

module.exports =
  PostgresIncidentEventRepository;