"use strict";


const crypto =
  require(
    "node:crypto"
  );


const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


const SIGNAL_TYPES =
  Object.freeze([
    "log",
    "metric",
    "trace",
  ]);


const SEVERITIES =
  Object.freeze([
    "debug",
    "info",
    "warning",
    "error",
    "critical",
    "unknown",
  ]);


class PostgresOpenTelemetrySignalRepository {
  constructor(
    options = {}
  ) {
    this.scope =
      options.scope ||
      new PostgresTenantScope(
        options
      );
  }


  async insertIfAbsent(
    {
      organizationId,

      environmentId,

      tenantId,

      integrationId,

      signal,
    },

    transaction =
      null
  ) {
    requireScope({
      organizationId,

      environmentId,

      tenantId,

      integrationId,
    });


    validateSignal(
      signal
    );


    return this.scope.run(
      {
        organizationId,

        environmentId,
      },

      async (
        client,
        resolved
      ) => {
        /*
         * The integration connection must belong to exactly the same
         * canonical organization/environment scope.
         *
         * This prevents a caller from presenting a connection UUID
         * belonging to another tenant.
         */
        const connectionResult =
          await client.query(
            `
              SELECT
                id,
                provider
              FROM
                integrations.connections
              WHERE
                id = $1

                AND

                organization_id = $2

                AND

                environment_id = $3
              LIMIT 1
            `,
            [
              integrationId,

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,
            ]
          );


        const connection =
          connectionResult
            .rows[0];


        if (
          !connection
        ) {
          throw repositoryError(
            "OTEL_INTEGRATION_CONNECTION_NOT_FOUND",

            "OpenTelemetry integration connection was not found in the requested tenant/environment"
          );
        }


        if (
          connection.provider !==
          "opentelemetry"
        ) {
          throw repositoryError(
            "OTEL_INTEGRATION_PROVIDER_MISMATCH",

            `Integration ${integrationId} is not an OpenTelemetry connection`
          );
        }


        const publicId =
          "otel_signal_" +
          crypto
            .randomUUID();


        const result =
          await client.query(
            `
              INSERT INTO
                integrations.opentelemetry_signals (
                  public_id,

                  organization_id,
                  environment_id,
                  integration_id,

                  tenant_id,

                  provider,

                  signal_type,
                  signal_id,
                  payload_hash,

                  service_name,

                  trace_id,
                  span_id,
                  parent_span_id,

                  name,
                  severity,

                  signal_timestamp,
                  observed_at,

                  attributes,
                  resource_attributes,
                  scope,

                  log_data,
                  metric_data,
                  span_data,

                  execution_authorized
                )
              VALUES (
                $1,

                $2,
                $3,
                $4,

                $5,

                'opentelemetry',

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

                $17::jsonb,
                $18::jsonb,
                $19::jsonb,

                $20::jsonb,
                $21::jsonb,
                $22::jsonb,

                false
              )

              ON CONFLICT (
                organization_id,
                environment_id,
                integration_id,
                signal_id
              )

              DO NOTHING

              RETURNING *
            `,
            [
              publicId,

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              integrationId,

              String(
                tenantId
              ),

              signal.signalType,

              signal.signalId,

              signal.payloadHash,

              nullableString(
                signal.serviceName
              ),

              nullableString(
                signal.traceId
              ),

              nullableString(
                signal.spanId
              ),

              nullableString(
                signal.parentSpanId
              ),

              nullableString(
                signal.name
              ),

              normalizeSeverity(
                signal.severity
              ),

              normalizeDate(
                signal.timestamp,
                "timestamp"
              ),

              signal.observedAt
                ? normalizeDate(
                    signal.observedAt,
                    "observedAt"
                  )
                : new Date(),

              JSON.stringify(
                normalizeObject(
                  signal.attributes
                )
              ),

              JSON.stringify(
                normalizeObject(
                  signal.resourceAttributes
                )
              ),

              JSON.stringify(
                normalizeObject(
                  signal.scope
                )
              ),

              signal.log
                ? JSON.stringify(
                    signal.log
                  )
                : null,

              signal.metric
                ? JSON.stringify(
                    signal.metric
                  )
                : null,

              signal.span
                ? JSON.stringify(
                    signal.span
                  )
                : null,
            ]
          );


        if (
          result.rowCount ===
          1
        ) {
          return {
            inserted:
              true,

            signal:
              mapSignal(
                result.rows[0]
              ),

            executionAuthorized:
              false,
          };
        }


        return {
          inserted:
            false,

          signal:
            null,

          executionAuthorized:
            false,
        };
      },

      transaction
    );
  }


  async querySignals(
    {
      organizationId,

      environmentId,

      tenantId,

      integrationId,

      signalType,

      serviceName =
        null,

      traceId =
        null,

      name =
        null,

      severity =
        null,

      from =
        null,

      to =
        null,

      limit =
        100,
    },

    transaction =
      null
  ) {
    requireScope({
      organizationId,

      environmentId,

      tenantId,

      integrationId,
    });


    const normalizedSignalType =
      normalizeSignalType(
        signalType
      );


    const normalizedLimit =
      Math.min(
        Math.max(
          Number.parseInt(
            limit,
            10
          ) ||
          100,

          1
        ),

        1000
      );


    return this.scope.run(
      {
        organizationId,

        environmentId,
      },

      async (
        client,
        resolved
      ) => {
        const values = [
          resolved
            .organizationUuid,

          resolved
            .environmentUuid,

          integrationId,

          String(
            tenantId
          ),

          normalizedSignalType,
        ];


        const conditions = [
          "organization_id = $1",

          "environment_id = $2",

          "integration_id = $3",

          "tenant_id = $4",

          "signal_type = $5",
        ];


        if (
          serviceName
        ) {
          values.push(
            String(
              serviceName
            )
          );

          conditions.push(
            `service_name = $${values.length}`
          );
        }


        if (
          traceId
        ) {
          values.push(
            String(
              traceId
            )
          );

          conditions.push(
            `trace_id = $${values.length}`
          );
        }


        if (
          name
        ) {
          values.push(
            String(
              name
            )
          );

          conditions.push(
            `name = $${values.length}`
          );
        }


        if (
          severity
        ) {
          values.push(
            normalizeSeverity(
              severity
            )
          );

          conditions.push(
            `severity = $${values.length}`
          );
        }


        if (
          from
        ) {
          values.push(
            normalizeDate(
              from,
              "from"
            )
          );

          conditions.push(
            `signal_timestamp >= $${values.length}`
          );
        }


        if (
          to
        ) {
          values.push(
            normalizeDate(
              to,
              "to"
            )
          );

          conditions.push(
            `signal_timestamp <= $${values.length}`
          );
        }


        values.push(
          normalizedLimit
        );


        const result =
          await client.query(
            `
              SELECT *
              FROM
                integrations.opentelemetry_signals
              WHERE
                ${conditions.join(
                  "\nAND\n"
                )}
              ORDER BY
                signal_timestamp DESC
              LIMIT
                $${values.length}
            `,
            values
          );


        return result.rows.map(
          mapSignal
        );
      },

      transaction
    );
  }
}


function requireScope({
  organizationId,

  environmentId,

  tenantId,

  integrationId,
}) {
  if (
    !organizationId
  ) {
    throw requiredError(
      "organizationId"
    );
  }


  if (
    !environmentId
  ) {
    throw requiredError(
      "environmentId"
    );
  }


  if (
    !tenantId
  ) {
    throw requiredError(
      "tenantId"
    );
  }


  if (
    !integrationId
  ) {
    throw requiredError(
      "integrationId"
    );
  }
}


function validateSignal(
  signal
) {
  if (
    !signal ||
    typeof signal !==
      "object"
  ) {
    throw repositoryError(
      "OTEL_SIGNAL_REQUIRED",

      "OpenTelemetry signal is required"
    );
  }


  normalizeSignalType(
    signal.signalType
  );


  if (
    !signal.signalId
  ) {
    throw requiredError(
      "signal.signalId"
    );
  }


  if (
    !signal.payloadHash
  ) {
    throw requiredError(
      "signal.payloadHash"
    );
  }


  normalizeDate(
    signal.timestamp,
    "signal.timestamp"
  );
}


function normalizeSignalType(
  value
) {
  const normalized =
    String(
      value ||
      ""
    )
      .trim()
      .toLowerCase();


  if (
    !SIGNAL_TYPES.includes(
      normalized
    )
  ) {
    throw repositoryError(
      "OTEL_SIGNAL_TYPE_INVALID",

      `Invalid OpenTelemetry signal type: ${value}`
    );
  }


  return normalized;
}


function normalizeSeverity(
  value
) {
  const normalized =
    String(
      value ||
      "unknown"
    )
      .trim()
      .toLowerCase();


  return SEVERITIES.includes(
    normalized
  )
    ? normalized
    : "unknown";
}


function normalizeDate(
  value,
  field
) {
  const date =
    value instanceof
      Date
      ? value
      : new Date(
          value
        );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw repositoryError(
      "OTEL_DATE_INVALID",

      `${field} is invalid`
    );
  }


  return date;
}


function normalizeObject(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    return {};
  }


  return {
    ...value,
  };
}


function nullableString(
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return null;
  }


  const normalized =
    String(
      value
    ).trim();


  return normalized ||
    null;
}


function requiredError(
  field
) {
  return repositoryError(
    "OTEL_REPOSITORY_FIELD_REQUIRED",

    `${field} is required`,

    {
      field,
    }
  );
}


function repositoryError(
  code,
  message,
  extra =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "PostgresOpenTelemetrySignalRepositoryError",

      code,

      executionAuthorized:
        false,

      ...extra,
    }
  );
}


function mapSignal(
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

    _id:
      row.id,

    publicId:
      row.public_id,

    organizationId:
      row.organization_id,

    environmentId:
      row.environment_id,

    tenantId:
      row.tenant_id,

    integrationId:
      row.integration_id,

    provider:
      row.provider,

    signalType:
      row.signal_type,

    signalId:
      row.signal_id,

    payloadHash:
      row.payload_hash,

    serviceName:
      row.service_name,

    traceId:
      row.trace_id,

    spanId:
      row.span_id,

    parentSpanId:
      row.parent_span_id,

    name:
      row.name,

    severity:
      row.severity,

    timestamp:
      row.signal_timestamp,

    observedAt:
      row.observed_at,

    attributes:
      row.attributes ||
      {},

    resourceAttributes:
      row.resource_attributes ||
      {},

    scope:
      row.scope ||
      {},

    log:
      row.log_data,

    metric:
      row.metric_data,

    span:
      row.span_data,

    executionAuthorized:
      false,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}


module.exports =
  PostgresOpenTelemetrySignalRepository;

module.exports
  .mapSignal =
  mapSignal;