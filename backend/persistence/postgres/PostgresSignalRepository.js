"use strict";

const crypto =
  require(
    "node:crypto"
  );

const SignalRepository =
  require(
    "../repositories/SignalRepository"
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

const COLUMN_MAP = {
  signalId:
    "public_id",

  provider:
    "provider",

  source:
    "source",

  signalType:
    "signal_type",

  eventType:
    "event_type",

  severity:
    "severity",

  fingerprint:
    "fingerprint",

  processingStatus:
    "processing_status",

  serviceId:
    "service_id",

  monitorId:
    "monitor_id",

  integrationConnectionId:
    "integration_connection_id",

  correlationGroupId:
    "correlation_group_id",

  traceId:
    "trace_id",

  incidentCandidate:
    "incident_candidate",

  sourceEventId:
    "source_event_id",

  observedAt:
    "observed_at",

  lastSeenAt:
    "last_seen_at",
};

class PostgresSignalRepository
  extends SignalRepository {
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

        let incidentUuid =
          null;

        if (
          data.incidentId
        ) {
          const incident =
            await this.scope
              .identityResolver
              .resolveIncident(
                client,
                resolved,
                data.incidentId
              );

          incidentUuid =
            incident?.id ||
            null;
        }

        const document =
          serializeDocument({
            ...data,

            _id:
              databaseId,
          });

        try {
          const result =
            await client.query(
              `
                INSERT INTO signals.signals (
                  public_id,
                  database_id,
                  legacy_mongo_id,
                  tenant_public_id,
                  organization_id,
                  environment_id,
                  incident_id,
                  service_id,
                  monitor_id,
                  integration_connection_id,
                  source,
                  provider,
                  source_event_id,
                  signal_type,
                  event_type,
                  severity,
                  title,
                  description,
                  resource,
                  trace_id,
                  span_id,
                  parent_span_id,
                  correlation_id,
                  error_code,
                  error_message,
                  status_code,
                  metric,
                  labels,
                  annotations,
                  attributes,
                  fingerprint,
                  duplicate_count,
                  first_seen_at,
                  last_seen_at,
                  correlation_group_id,
                  correlated_signal_ids,
                  correlation_score,
                  processing_status,
                  normalized_at,
                  enriched_at,
                  correlated_at,
                  routed_at,
                  processing_error,
                  incident_candidate,
                  observed_at,
                  received_at,
                  raw_payload,
                  schema_version,
                  metadata,
                  payload,
                  document
                )
                VALUES (
                  $1,  $2,  $3,  $4,  $5,
                  $6,  $7,  $8,  $9,  $10,
                  $11, $12, $13, $14, $15,
                  $16, $17, $18, $19::jsonb, $20,
                  $21, $22, $23, $24, $25,
                  $26, $27::jsonb, $28::jsonb, $29::jsonb, $30::jsonb,
                  $31, $32, $33, $34, $35,
                  $36, $37, $38, $39, $40,
                  $41, $42, $43, $44, $45,
                  $46, $47::jsonb, $48, $49::jsonb, $50::jsonb,
                  $51::jsonb
                )
                RETURNING *
              `,
              buildValues(
                data,
                document,
                databaseId,
                incidentUuid,
                resolved
              )
            );

          return mapSignal(
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

  async findByDatabaseId(
    context,
    id,
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
              FROM signals.signals
              WHERE
                database_id = $1
                OR legacy_mongo_id = $1
                OR id::text = $1
              LIMIT 1
            `,
            [
              normalizeId(
                id
              ),
            ]
          );

        return result.rows[0]
          ? mapSignal(
              result.rows[0],
              context
            )
          : null;
      },
      transaction
    );
  }

  async findOne(
    filter,
    transaction = null
  ) {
    return this.findInternal(
      filter,
      {
        lean:
          false,

        single:
          true,
      },
      transaction
    );
  }

  async findOneLean(
    filter,
    transaction = null
  ) {
    return this.findInternal(
      filter,
      {
        lean:
          true,

        single:
          true,
      },
      transaction
    );
  }

  async findLatestDuplicate(
    filter,
    transaction = null
  ) {
    return this.findInternal(
      filter,
      {
        single:
          true,

        sort: {
          lastSeenAt:
            -1,
        },
      },
      transaction
    );
  }

  async list(
    filter,
    options = {},
    transaction = null
  ) {
    return this.findInternal(
      filter,
      {
        ...options,

        single:
          false,
      },
      transaction
    );
  }

  async findInternal(
    filter,
    options,
    transaction
  ) {
    const context =
      requireScope(
        filter
      );

    return this.scope.run(
      context,
      async (
        client,
        resolved
      ) => {
        const {
          where,
          values,
        } =
          buildWhere(
            filter,
            resolved
          );

        const sort =
          buildSort(
            options.sort
          );

        const limit =
          Math.min(
            500,
            Math.max(
              1,
              Number(
                options.limit
              ) ||
              (
                options.single
                  ? 1
                  : 100
              )
            )
          );

        const result =
          await client.query(
            `
              SELECT *
              FROM signals.signals
              WHERE ${where}
              ORDER BY ${sort}
              LIMIT $${values.length + 1}
            `,
            [
              ...values,
              limit,
            ]
          );

        if (
          options.single
        ) {
          return result.rows[0]
            ? mapSignal(
                result.rows[0],
                context
              )
            : null;
        }

        return result.rows.map(
          (
            row
          ) =>
            mapSignal(
              row,
              context
            )
        );
      },
      transaction
    );
  }

  async updateOne(
    filter,
    update,
    transaction = null
  ) {
    return this.updateInternal(
      filter,
      update,
      false,
      transaction
    );
  }

  async updateMany(
    filter,
    update,
    transaction = null
  ) {
    return this.updateInternal(
      filter,
      update,
      true,
      transaction
    );
  }

  async updateInternal(
    filter,
    update,
    many,
    transaction
  ) {
    const context =
      requireScope(
        filter
      );

    return this.scope.run(
      context,
      async (
        client,
        resolved
      ) => {
        const candidates =
          await this.selectForMutation(
            client,
            filter,
            resolved,
            many
          );

        let modifiedCount =
          0;

        for (
          const row
          of candidates
        ) {
          const signal =
            mapSignal(
              row,
              context
            );

          applyMongoUpdate(
            signal,
            update
          );

          await this.saveOnClient(
            client,
            resolved,
            signal
          );

          modifiedCount +=
            1;
        }

        return {
          acknowledged:
            true,

          matchedCount:
            candidates.length,

          modifiedCount,
        };
      },
      transaction
    );
  }

  async save(
    signal,
    transaction = null
  ) {
    if (
      !signal?._id ||
      !signal.organizationId ||
      !signal.environmentId
    ) {
      throw Object.assign(
        new Error(
          "PostgresSignalRepository.save() requires persisted signal with scope"
        ),
        {
          code:
            "INVALID_SIGNAL_DOCUMENT",
        }
      );
    }

    const context = {
      organizationId:
        signal.organizationId,

      environmentId:
        signal.environmentId,
    };

    return this.scope.run(
      context,
      async (
        client,
        resolved
      ) =>
        this.saveOnClient(
          client,
          resolved,
          signal
        ),
      transaction
    );
  }

  async saveOnClient(
    client,
    resolved,
    signal
  ) {
    let incidentUuid =
      null;

    if (
      signal.incidentId
    ) {
      const incident =
        await this.scope
          .identityResolver
          .resolveIncident(
            client,
            resolved,
            signal.incidentId
          );

      incidentUuid =
        incident?.id ||
        null;
    }

    const document =
      serializeDocument(
        signal
      );

    const result =
      await client.query(
        `
          UPDATE signals.signals
          SET
            tenant_public_id = $1,
            incident_id = $2,
            service_id = $3,
            monitor_id = $4,
            integration_connection_id = $5,
            source = $6,
            provider = $7,
            source_event_id = $8,
            signal_type = $9,
            event_type = $10,
            severity = $11,
            title = $12,
            description = $13,
            resource = $14::jsonb,
            trace_id = $15,
            span_id = $16,
            parent_span_id = $17,
            correlation_id = $18,
            error_code = $19,
            error_message = $20,
            status_code = $21,
            metric = $22::jsonb,
            labels = $23::jsonb,
            annotations = $24::jsonb,
            attributes = $25::jsonb,
            fingerprint = $26,
            duplicate_count = $27,
            first_seen_at = $28,
            last_seen_at = $29,
            correlation_group_id = $30,
            correlated_signal_ids = $31,
            correlation_score = $32,
            processing_status = $33,
            normalized_at = $34,
            enriched_at = $35,
            correlated_at = $36,
            routed_at = $37,
            processing_error = $38,
            incident_candidate = $39,
            observed_at = $40,
            received_at = $41,
            raw_payload = $42::jsonb,
            schema_version = $43,
            metadata = $44::jsonb,
            payload = $45::jsonb,
            document = $46::jsonb
          WHERE
            organization_id = $47
            AND environment_id = $48
            AND (
              database_id = $49
              OR legacy_mongo_id = $49
              OR id::text = $49
            )
          RETURNING *
        `,
        [
          signal.tenantId ||
            null,

          incidentUuid,

          normalizeId(
            signal.serviceId
          ),

          normalizeId(
            signal.monitorId
          ),

          normalizeId(
            signal.integrationConnectionId
          ),

          signal.source,

          signal.provider,

          signal.sourceEventId ||
            null,

          signal.signalType ||
            "unknown",

          signal.eventType,

          signal.severity ||
            "unknown",

          signal.title,

          signal.description ||
            null,

          JSON.stringify(
            signal.resource ||
            {}
          ),

          signal.traceId ||
            null,

          signal.spanId ||
            null,

          signal.parentSpanId ||
            null,

          signal.correlationId ||
            null,

          signal.errorCode ||
            null,

          signal.errorMessage ||
            null,

          signal.statusCode ??
            null,

          JSON.stringify(
            signal.metric ||
            {}
          ),

          JSON.stringify(
            signal.labels ||
            {}
          ),

          JSON.stringify(
            signal.annotations ||
            {}
          ),

          JSON.stringify(
            signal.attributes ||
            {}
          ),

          signal.fingerprint,

          Number(
            signal.duplicateCount ||
            0
          ),

          signal.firstSeenAt ||
            new Date(),

          signal.lastSeenAt ||
            new Date(),

          signal.correlationGroupId ||
            null,

          signal.correlatedSignalIds ||
            [],

          signal.correlationScore ??
            null,

          signal.processingStatus ||
            "received",

          signal.normalizedAt ||
            null,

          signal.enrichedAt ||
            null,

          signal.correlatedAt ||
            null,

          signal.routedAt ||
            null,

          signal.processingError ||
            null,

          Boolean(
            signal.incidentCandidate
          ),

          signal.observedAt ||
            new Date(),

          signal.receivedAt ||
            new Date(),

          signal.rawPayload ===
            undefined
            ? null
            : JSON.stringify(
                signal.rawPayload
              ),

          Number(
            signal.schemaVersion ||
            1
          ),

          JSON.stringify(
            signal.metadata ||
            {}
          ),

          JSON.stringify(
            signal.payload ||
            {}
          ),

          JSON.stringify(
            document
          ),

          resolved.organizationUuid,

          resolved.environmentUuid,

          normalizeId(
            signal._id
          ),
        ]
      );

    return result.rows[0]
      ? mapSignal(
          result.rows[0],
          signal
        )
      : null;
  }

  async selectForMutation(
    client,
    filter,
    resolved,
    many
  ) {
    const {
      where,
      values,
    } =
      buildWhere(
        filter,
        resolved
      );

    const result =
      await client.query(
        `
          SELECT *
          FROM signals.signals
          WHERE ${where}
          ORDER BY observed_at DESC
          ${many ? "" : "LIMIT 1"}
        `,
        values
      );

    return result.rows;
  }
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
        "Signal PostgreSQL operation requires organizationId and environmentId"
      ),
      {
        code:
          "POSTGRES_SIGNAL_SCOPE_REQUIRED",
      }
    );
  }

  return {
    organizationId:
      value.organizationId,

    environmentId:
      value.environmentId,
  };
}

function buildWhere(
  filter,
  resolved
) {
  const values = [
    resolved.organizationUuid,
    resolved.environmentUuid,
  ];

  const clauses = [
    "organization_id = $1",
    "environment_id = $2",
  ];

  const compile =
    (
      key,
      value
    ) => {
      if (
        key ===
          "organizationId" ||
        key ===
          "environmentId"
      ) {
        return null;
      }

      if (
        key ===
        "_id"
      ) {
        return compileDatabaseId(
          value,
          values
        );
      }

      if (
        key ===
        "$or"
      ) {
        const parts =
          value
            .map(
              (
                entry
              ) =>
                Object.entries(
                  entry
                )
                  .map(
                    (
                      [
                        childKey,
                        childValue,
                      ]
                    ) =>
                      compile(
                        childKey,
                        childValue
                      )
                  )
                  .filter(
                    Boolean
                  )
                  .join(
                    " AND "
                  )
            )
            .filter(
              Boolean
            );

        return `(${parts.join(" OR ")})`;
      }

      const column =
        COLUMN_MAP[
          key
        ];

      if (!column) {
        throw Object.assign(
          new Error(
            `Unsupported Signal PostgreSQL filter: ${key}`
          ),
          {
            code:
              "POSTGRES_SIGNAL_FILTER_UNSUPPORTED",

            field:
              key,
          }
        );
      }

      return compileOperator(
        column,
        value,
        values
      );
    };

  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      filter
    )
  ) {
    const expression =
      compile(
        key,
        value
      );

    if (expression) {
      clauses.push(
        expression
      );
    }
  }

  return {
    where:
      clauses.join(
        "\nAND "
      ),

    values,
  };
}

function compileDatabaseId(
  value,
  values
) {
  if (
    value &&
    typeof value ===
      "object" &&
    Array.isArray(
      value.$in
    )
  ) {
    const index =
      values.push(
        value.$in.map(
          normalizeId
        )
      );

    return `database_id = ANY($${index}::text[])`;
  }

  if (
    value &&
    typeof value ===
      "object" &&
    value.$ne !==
      undefined
  ) {
    const index =
      values.push(
        normalizeId(
          value.$ne
        )
      );

    return `database_id <> $${index}`;
  }

  const index =
    values.push(
      normalizeId(
        value
      )
    );

  return `(
    database_id = $${index}
    OR legacy_mongo_id = $${index}
    OR id::text = $${index}
  )`;
}

function compileOperator(
  column,
  value,
  values
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    value instanceof
      Date ||
    Array.isArray(
      value
    )
  ) {
    const index =
      values.push(
        value
      );

    return `${column} = $${index}`;
  }

  const clauses = [];

  for (
    const [
      operator,
      operand,
    ]
    of Object.entries(
      value
    )
  ) {
    if (
      operator ===
      "$in"
    ) {
      const index =
        values.push(
          operand.map(
            normalizeId
          )
        );

      clauses.push(
        `${column} = ANY($${index}::text[])`
      );
    } else if (
      operator ===
      "$nin"
    ) {
      const index =
        values.push(
          operand.map(
            normalizeId
          )
        );

      clauses.push(
        `NOT (${column} = ANY($${index}::text[]))`
      );
    } else if (
      operator ===
      "$ne"
    ) {
      const index =
        values.push(
          operand
        );

      clauses.push(
        `${column} <> $${index}`
      );
    } else if (
      operator ===
      "$gte"
    ) {
      const index =
        values.push(
          operand
        );

      clauses.push(
        `${column} >= $${index}`
      );
    } else if (
      operator ===
      "$lte"
    ) {
      const index =
        values.push(
          operand
        );

      clauses.push(
        `${column} <= $${index}`
      );
    } else {
      throw Object.assign(
        new Error(
          `Unsupported Signal PostgreSQL operator: ${operator}`
        ),
        {
          code:
            "POSTGRES_SIGNAL_OPERATOR_UNSUPPORTED",
        }
      );
    }
  }

  return `(${clauses.join(" AND ")})`;
}

function buildSort(
  sort = {
    observedAt:
      -1,
  }
) {
  const allowed = {
    observedAt:
      "observed_at",

    lastSeenAt:
      "last_seen_at",

    createdAt:
      "created_at",
  };

  const [
    entry,
  ] =
    Object.entries(
      sort
    );

  if (!entry) {
    return "observed_at DESC";
  }

  const [
    key,
    direction,
  ] =
    entry;

  const column =
    allowed[
      key
    ] ||
    "observed_at";

  return `${column} ${Number(direction) >= 0 ? "ASC" : "DESC"}`;
}

function applyMongoUpdate(
  signal,
  update = {}
) {
  if (
    update.$set
  ) {
    Object.assign(
      signal,
      update.$set
    );
  }

  if (
    update.$addToSet
  ) {
    for (
      const [
        field,
        instruction,
      ]
      of Object.entries(
        update.$addToSet
      )
    ) {
      const current =
        Array.isArray(
          signal[field]
        )
          ? signal[field]
          : [];

      const additions =
        Array.isArray(
          instruction?.$each
        )
          ? instruction.$each
          : [
              instruction,
            ];

      signal[field] =
        [
          ...new Set([
            ...current,
            ...additions,
          ]),
        ];
    }
  }
}

function buildValues(
  signal,
  document,
  databaseId,
  incidentUuid,
  resolved
) {
  return [
    signal.signalId,

    databaseId,

    signal.legacyMongoId ||
      null,

    signal.tenantId,

    resolved.organizationUuid,

    resolved.environmentUuid,

    incidentUuid,

    normalizeId(
      signal.serviceId
    ),

    normalizeId(
      signal.monitorId
    ),

    normalizeId(
      signal.integrationConnectionId
    ),

    signal.source,

    signal.provider,

    signal.sourceEventId ||
      null,

    signal.signalType ||
      "unknown",

    signal.eventType,

    signal.severity ||
      "unknown",

    signal.title,

    signal.description ||
      null,

    JSON.stringify(
      signal.resource ||
      {}
    ),

    signal.traceId ||
      null,

    signal.spanId ||
      null,

    signal.parentSpanId ||
      null,

    signal.correlationId ||
      null,

    signal.errorCode ||
      null,

    signal.errorMessage ||
      null,

    signal.statusCode ??
      null,

    JSON.stringify(
      signal.metric ||
      {}
    ),

    JSON.stringify(
      signal.labels ||
      {}
    ),

    JSON.stringify(
      signal.annotations ||
      {}
    ),

    JSON.stringify(
      signal.attributes ||
      {}
    ),

    signal.fingerprint,

    Number(
      signal.duplicateCount ||
      0
    ),

    signal.firstSeenAt ||
      new Date(),

    signal.lastSeenAt ||
      new Date(),

    signal.correlationGroupId ||
      null,

    signal.correlatedSignalIds ||
      [],

    signal.correlationScore ??
      null,

    signal.processingStatus ||
      "received",

    signal.normalizedAt ||
      null,

    signal.enrichedAt ||
      null,

    signal.correlatedAt ||
      null,

    signal.routedAt ||
      null,

    signal.processingError ||
      null,

    Boolean(
      signal.incidentCandidate
    ),

    signal.observedAt ||
      new Date(),

    signal.receivedAt ||
      new Date(),

    signal.rawPayload ===
      undefined
      ? null
      : JSON.stringify(
          signal.rawPayload
        ),

    Number(
      signal.schemaVersion ||
      1
    ),

    JSON.stringify(
      signal.metadata ||
      {}
    ),

    JSON.stringify(
      signal.payload ||
      {}
    ),

    JSON.stringify(
      document
    ),
  ];
}

function mapSignal(
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
      row.database_id ||
      row.legacy_mongo_id ||
      row.id,

    signalId:
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

    tenantId:
      row.tenant_public_id,

    serviceId:
      row.service_id,

    monitorId:
      row.monitor_id,

    integrationConnectionId:
      row.integration_connection_id,

    source:
      row.source,

    provider:
      row.provider,

    sourceEventId:
      row.source_event_id,

    signalType:
      row.signal_type,

    eventType:
      row.event_type,

    severity:
      row.severity,

    title:
      row.title,

    description:
      row.description,

    resource:
      row.resource ||
      {},

    traceId:
      row.trace_id,

    spanId:
      row.span_id,

    parentSpanId:
      row.parent_span_id,

    correlationId:
      row.correlation_id,

    errorCode:
      row.error_code,

    errorMessage:
      row.error_message,

    statusCode:
      row.status_code,

    metric:
      row.metric ||
      {},

    labels:
      row.labels ||
      {},

    annotations:
      row.annotations ||
      {},

    attributes:
      row.attributes ||
      {},

    fingerprint:
      row.fingerprint,

    duplicateCount:
      row.duplicate_count,

    firstSeenAt:
      row.first_seen_at,

    lastSeenAt:
      row.last_seen_at,

    correlationGroupId:
      row.correlation_group_id,

    correlatedSignalIds:
      row.correlated_signal_ids ||
      [],

    correlationScore:
      row.correlation_score ===
        null
        ? null
        : Number(
            row.correlation_score
          ),

    processingStatus:
      row.processing_status,

    normalizedAt:
      row.normalized_at,

    enrichedAt:
      row.enriched_at,

    correlatedAt:
      row.correlated_at,

    routedAt:
      row.routed_at,

    processingError:
      row.processing_error,

    incidentCandidate:
      row.incident_candidate,

    observedAt:
      row.observed_at,

    receivedAt:
      row.received_at,

    rawPayload:
      row.raw_payload,

    schemaVersion:
      row.schema_version,

    metadata:
      row.metadata ||
      {},

    payload:
      row.payload ||
      {},

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

module.exports =
  PostgresSignalRepository;