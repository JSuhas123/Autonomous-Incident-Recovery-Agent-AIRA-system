"use strict";

const crypto =
  require("node:crypto");

const PostgresOpenTelemetrySignalRepository =
  require(
    "../../persistence/postgres/PostgresOpenTelemetrySignalRepository"
  );


// ============================================================================
// HELPERS
// ============================================================================

function hashPayload(value) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify(value)
    )
    .digest("hex");
}


function normalizeAttributes(attributes) {
  if (
    !Array.isArray(attributes)
  ) {
    if (
      attributes &&
      typeof attributes === "object"
    ) {
      return {
        ...attributes,
      };
    }

    return {};
  }


  const result = {};


  for (
    const attribute
    of attributes
  ) {
    if (
      !attribute ||
      !attribute.key
    ) {
      continue;
    }


    result[
      attribute.key
    ] =
      unwrapOtelValue(
        attribute.value
      );
  }


  return result;
}


function unwrapOtelValue(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }


  if (
    typeof value !== "object"
  ) {
    return value;
  }


  const scalarKeys = [
    "stringValue",
    "boolValue",
    "intValue",
    "doubleValue",
    "bytesValue",
  ];


  for (
    const key
    of scalarKeys
  ) {
    if (
      value[key] !==
      undefined
    ) {
      return value[key];
    }
  }


  if (
    Array.isArray(
      value.arrayValue
        ?.values
    )
  ) {
    return value
      .arrayValue
      .values
      .map(
        unwrapOtelValue
      );
  }


  if (
    Array.isArray(
      value.kvlistValue
        ?.values
    )
  ) {
    return normalizeAttributes(
      value
        .kvlistValue
        .values
    );
  }


  return value;
}


function nanoToDate(value) {
  if (!value) {
    return new Date();
  }


  try {
    const nanos =
      BigInt(
        String(value)
      );


    return new Date(
      Number(
        nanos /
        1000000n
      )
    );
  } catch {
    const parsed =
      new Date(value);


    return Number.isNaN(
      parsed.getTime()
    )
      ? new Date()
      : parsed;
  }
}


function durationMs(
  start,
  end
) {
  if (
    !start ||
    !end
  ) {
    return null;
  }


  const difference =
    end.getTime() -
    start.getTime();


  return difference >= 0
    ? difference
    : null;
}


function extractServiceName(
  resourceAttributes
) {
  return (
    resourceAttributes[
      "service.name"
    ] ||
    resourceAttributes[
      "service"
    ] ||
    null
  );
}


function severityFromLog(record) {
  const text =
    String(
      record
        ?.severityText ||
      ""
    )
      .trim()
      .toLowerCase();


  if (
    text.includes(
      "fatal"
    ) ||
    text.includes(
      "critical"
    )
  ) {
    return "critical";
  }


  if (
    text.includes(
      "error"
    )
  ) {
    return "error";
  }


  if (
    text.includes(
      "warn"
    )
  ) {
    return "warning";
  }


  if (
    text.includes(
      "debug"
    ) ||
    text.includes(
      "trace"
    )
  ) {
    return "debug";
  }


  if (text) {
    return "info";
  }


  return "unknown";
}


function getInstrumentationScope(
  scope
) {
  return {
    name:
      scope?.name ||
      null,

    version:
      scope?.version ||
      null,
  };
}


// ============================================================================
// SERVICE
// ============================================================================

class OpenTelemetryIngestionService {
  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresOpenTelemetrySignalRepository(
        options
      );
  }


  // ==========================================================================
  // CONTEXT
  // ==========================================================================

  _scope(context) {
    if (
      !context
        ?.organizationId ||
      !context
        ?.environmentId ||
      !context
        ?.tenantId ||
      !context
        ?.integrationId
    ) {
      throw Object.assign(
        new Error(
          "Complete OpenTelemetry context is required"
        ),
        {
          code:
            "OTEL_CONTEXT_REQUIRED",

          executionAuthorized:
            false,
        }
      );
    }


    return {
      organizationId:
        context.organizationId,

      environmentId:
        context.environmentId,

      tenantId:
        context.tenantId,

      integrationId:
        context.integrationId,
    };
  }


  // ==========================================================================
  // NORMALIZATION
  // ==========================================================================

  normalizePayload(payload) {
    if (
      !payload ||
      typeof payload !==
        "object" ||
      Array.isArray(payload)
    ) {
      throw Object.assign(
        new Error(
          "OpenTelemetry payload must be an object"
        ),
        {
          code:
            "OTEL_PAYLOAD_INVALID",

          executionAuthorized:
            false,
        }
      );
    }


    return [
      ...this.normalizeLogs(
        payload
      ),

      ...this.normalizeMetrics(
        payload
      ),

      ...this.normalizeTraces(
        payload
      ),
    ];
  }


  // ==========================================================================
  // LOGS
  // ==========================================================================

  normalizeLogs(payload) {
    const result = [];


    const resourceLogs =
      Array.isArray(
        payload.resourceLogs
      )
        ? payload.resourceLogs
        : [];


    for (
      const resourceLog
      of resourceLogs
    ) {
      const resourceAttributes =
        normalizeAttributes(
          resourceLog
            ?.resource
            ?.attributes
        );


      const serviceName =
        extractServiceName(
          resourceAttributes
        );


      const scopeLogs =
        Array.isArray(
          resourceLog
            ?.scopeLogs
        )
          ? resourceLog
              .scopeLogs
          : Array.isArray(
              resourceLog
                ?.instrumentationLibraryLogs
            )
            ? resourceLog
                .instrumentationLibraryLogs
            : [];


      for (
        const scopeLog
        of scopeLogs
      ) {
        const scope =
          getInstrumentationScope(
            scopeLog
              ?.scope ||
            scopeLog
              ?.instrumentationLibrary
          );


        const records =
          Array.isArray(
            scopeLog
              ?.logRecords
          )
            ? scopeLog
                .logRecords
            : [];


        for (
          const record
          of records
        ) {
          const timestamp =
            nanoToDate(
              record
                ?.timeUnixNano ||
              record
                ?.observedTimeUnixNano
            );


          const attributes =
            normalizeAttributes(
              record
                ?.attributes
            );


          const body =
            unwrapOtelValue(
              record
                ?.body
            );


          const rawIdentity = {
            signalType:
              "log",

            traceId:
              record
                ?.traceId ||
              null,

            spanId:
              record
                ?.spanId ||
              null,

            timestamp:
              timestamp
                .toISOString(),

            body,

            attributes,
          };


          result.push({
            signalType:
              "log",

            signalId:
              `otel_${hashPayload(
                rawIdentity
              ).slice(
                0,
                48
              )}`,

            payloadHash:
              hashPayload(
                record
              ),

            serviceName,

            traceId:
              record
                ?.traceId ||
              null,

            spanId:
              record
                ?.spanId ||
              null,

            parentSpanId:
              null,

            name:
              attributes[
                "event.name"
              ] ||
              null,

            severity:
              severityFromLog(
                record
              ),

            timestamp,

            observedAt:
              new Date(),

            attributes,

            resourceAttributes,

            scope,

            log: {
              body,

              severityText:
                record
                  ?.severityText ||
                null,

              severityNumber:
                record
                  ?.severityNumber ??
                null,
            },
          });
        }
      }
    }


    return result;
  }


  // ==========================================================================
  // METRICS
  // ==========================================================================

  normalizeMetrics(payload) {
    const result = [];


    const resourceMetrics =
      Array.isArray(
        payload.resourceMetrics
      )
        ? payload.resourceMetrics
        : [];


    for (
      const resourceMetric
      of resourceMetrics
    ) {
      const resourceAttributes =
        normalizeAttributes(
          resourceMetric
            ?.resource
            ?.attributes
        );


      const serviceName =
        extractServiceName(
          resourceAttributes
        );


      const scopeMetrics =
        Array.isArray(
          resourceMetric
            ?.scopeMetrics
        )
          ? resourceMetric
              .scopeMetrics
          : Array.isArray(
              resourceMetric
                ?.instrumentationLibraryMetrics
            )
            ? resourceMetric
                .instrumentationLibraryMetrics
            : [];


      for (
        const scopeMetric
        of scopeMetrics
      ) {
        const scope =
          getInstrumentationScope(
            scopeMetric
              ?.scope ||
            scopeMetric
              ?.instrumentationLibrary
          );


        const metrics =
          Array.isArray(
            scopeMetric
              ?.metrics
          )
            ? scopeMetric
                .metrics
            : [];


        for (
          const metric
          of metrics
        ) {
          const metricData =
            this.getMetricData(
              metric
            );


          if (
            !metricData
          ) {
            continue;
          }


          for (
            const point
            of metricData
              .dataPoints
          ) {
            const timestamp =
              nanoToDate(
                point
                  ?.timeUnixNano
              );


            const attributes =
              normalizeAttributes(
                point
                  ?.attributes
              );


            const value =
              this
                .extractMetricValue(
                  point,
                  metricData.type
                );


            const rawIdentity = {
              signalType:
                "metric",

              name:
                metric
                  ?.name ||
                null,

              serviceName,

              timestamp:
                timestamp
                  .toISOString(),

              attributes,

              value,
            };


            result.push({
              signalType:
                "metric",

              signalId:
                `otel_${hashPayload(
                  rawIdentity
                ).slice(
                  0,
                  48
                )}`,

              payloadHash:
                hashPayload(
                  point
                ),

              serviceName,

              traceId:
                null,

              spanId:
                null,

              parentSpanId:
                null,

              name:
                metric
                  ?.name ||
                null,

              severity:
                "unknown",

              timestamp,

              observedAt:
                new Date(),

              attributes,

              resourceAttributes,

              scope,

              metric: {
                metricType:
                  metricData.type,

                unit:
                  metric
                    ?.unit ||
                  null,

                description:
                  metric
                    ?.description ||
                  null,

                value,

                aggregationTemporality:
                  metricData
                    ?.data
                    ?.aggregationTemporality ??
                  null,

                isMonotonic:
                  metricData
                    ?.data
                    ?.isMonotonic ??
                  null,
              },
            });
          }
        }
      }
    }


    return result;
  }


  getMetricData(metric) {
    if (
      !metric ||
      typeof metric !==
        "object"
    ) {
      return null;
    }


    const types = [
      [
        "gauge",
        "gauge",
      ],

      [
        "sum",
        "sum",
      ],

      [
        "histogram",
        "histogram",
      ],

      [
        "exponentialHistogram",
        "exponential_histogram",
      ],

      [
        "summary",
        "summary",
      ],
    ];


    for (
      const [
        field,
        type,
      ]
      of types
    ) {
      if (
        !metric[field]
      ) {
        continue;
      }


      return {
        type,

        data:
          metric[field],

        dataPoints:
          Array.isArray(
            metric[field]
              ?.dataPoints
          )
            ? metric[field]
                .dataPoints
            : [],
      };
    }


    return null;
  }


  extractMetricValue(
    point,
    type
  ) {
    if (
      point
        ?.asDouble !==
      undefined
    ) {
      return point.asDouble;
    }


    if (
      point
        ?.asInt !==
      undefined
    ) {
      return point.asInt;
    }


    if (
      type ===
        "histogram" ||
      type ===
        "exponential_histogram"
    ) {
      return {
        count:
          point
            ?.count ??
          null,

        sum:
          point
            ?.sum ??
          null,

        min:
          point
            ?.min ??
          null,

        max:
          point
            ?.max ??
          null,

        bucketCounts:
          point
            ?.bucketCounts ||
          null,

        explicitBounds:
          point
            ?.explicitBounds ||
          null,
      };
    }


    if (
      type ===
      "summary"
    ) {
      return {
        count:
          point
            ?.count ??
          null,

        sum:
          point
            ?.sum ??
          null,

        quantileValues:
          point
            ?.quantileValues ||
          [],
      };
    }


    return null;
  }


  // ==========================================================================
  // TRACES
  // ==========================================================================

  normalizeTraces(payload) {
    const result = [];


    const resourceSpans =
      Array.isArray(
        payload.resourceSpans
      )
        ? payload.resourceSpans
        : [];


    for (
      const resourceSpan
      of resourceSpans
    ) {
      const resourceAttributes =
        normalizeAttributes(
          resourceSpan
            ?.resource
            ?.attributes
        );


      const serviceName =
        extractServiceName(
          resourceAttributes
        );


      const scopeSpans =
        Array.isArray(
          resourceSpan
            ?.scopeSpans
        )
          ? resourceSpan
              .scopeSpans
          : Array.isArray(
              resourceSpan
                ?.instrumentationLibrarySpans
            )
            ? resourceSpan
                .instrumentationLibrarySpans
            : [];


      for (
        const scopeSpan
        of scopeSpans
      ) {
        const scope =
          getInstrumentationScope(
            scopeSpan
              ?.scope ||
            scopeSpan
              ?.instrumentationLibrary
          );


        const spans =
          Array.isArray(
            scopeSpan
              ?.spans
          )
            ? scopeSpan
                .spans
            : [];


        for (
          const span
          of spans
        ) {
          const startTime =
            nanoToDate(
              span
                ?.startTimeUnixNano
            );


          const endTime =
            span
              ?.endTimeUnixNano
              ? nanoToDate(
                  span
                    .endTimeUnixNano
                )
              : null;


          const attributes =
            normalizeAttributes(
              span
                ?.attributes
            );


          const rawIdentity = {
            signalType:
              "trace",

            traceId:
              span
                ?.traceId ||
              null,

            spanId:
              span
                ?.spanId ||
              null,
          };


          result.push({
            signalType:
              "trace",

            signalId:
              `otel_${hashPayload(
                rawIdentity
              ).slice(
                0,
                48
              )}`,

            payloadHash:
              hashPayload(
                span
              ),

            serviceName,

            traceId:
              span
                ?.traceId ||
              null,

            spanId:
              span
                ?.spanId ||
              null,

            parentSpanId:
              span
                ?.parentSpanId ||
              null,

            name:
              span
                ?.name ||
              null,

            severity:
              this.spanSeverity(
                span
              ),

            timestamp:
              startTime,

            observedAt:
              new Date(),

            attributes,

            resourceAttributes,

            scope,

            span: {
              kind:
                span
                  ?.kind ??
                null,

              startTime,

              endTime,

              durationMs:
                durationMs(
                  startTime,
                  endTime
                ),

              statusCode:
                span
                  ?.status
                  ?.code ??
                null,

              statusMessage:
                span
                  ?.status
                  ?.message ||
                null,
            },
          });
        }
      }
    }


    return result;
  }


  spanSeverity(span) {
    const code =
      span
        ?.status
        ?.code;


    if (
      code === 2 ||
      String(
        code
      )
        .toUpperCase() ===
        "STATUS_CODE_ERROR"
    ) {
      return "error";
    }


    return "info";
  }


  // ==========================================================================
  // POSTGRESQL PERSISTENCE
  // ==========================================================================

  async ingest(
    context,
    payload
  ) {
    const scope =
      this._scope(
        context
      );


    const normalized =
      this.normalizePayload(
        payload
      );


    const result = {
      accepted:
        0,

      duplicates:
        0,

      signals: [],

      executionAuthorized:
        false,
    };


    for (
      const signal
      of normalized
    ) {
      try {
        const persistenceResult =
          await this
            .repository
            .insertIfAbsent({
              organizationId:
                scope
                  .organizationId,

              environmentId:
                scope
                  .environmentId,

              tenantId:
                scope
                  .tenantId,

              integrationId:
                scope
                  .integrationId,

              signal,
            });


        if (
          persistenceResult
            ?.inserted ===
          true
        ) {
          result.accepted +=
            1;


          if (
            persistenceResult
              .signal
          ) {
            result
              .signals
              .push(
                persistenceResult
                  .signal
              );
          }


          continue;
        }


        result.duplicates +=
          1;
      } catch (
        error
      ) {
        throw Object.assign(
          new Error(
            `Failed to persist OpenTelemetry signal: ${error.message}`
          ),

          {
            code:
              error.code ||
              "OTEL_SIGNAL_PERSISTENCE_FAILED",

            executionAuthorized:
              false,

            cause:
              error,
          }
        );
      }
    }


    return result;
  }


  // ==========================================================================
  // QUERIES
  // ==========================================================================

  async queryLogs(
    context,
    query = {}
  ) {
    return this.querySignals(
      context,
      "log",
      query
    );
  }


  async queryMetrics(
    context,
    query = {}
  ) {
    return this.querySignals(
      context,
      "metric",
      query
    );
  }


  async queryTraces(
    context,
    query = {}
  ) {
    return this.querySignals(
      context,
      "trace",
      query
    );
  }


  async querySignals(
    context,
    signalType,
    query = {}
  ) {
    const scope =
      this._scope(
        context
      );


    return this
      .repository
      .querySignals({
        organizationId:
          scope
            .organizationId,

        environmentId:
          scope
            .environmentId,

        tenantId:
          scope
            .tenantId,

        integrationId:
          scope
            .integrationId,

        signalType,

        serviceName:
          query
            ?.serviceName ||
          null,

        traceId:
          query
            ?.traceId ||
          null,

        name:
          query
            ?.name ||
          null,

        severity:
          query
            ?.severity ||
          null,

        from:
          query
            ?.from ||
          null,

        to:
          query
            ?.to ||
          null,

        limit:
          query
            ?.limit ||
          100,
      });
  }
}


// ============================================================================
// SINGLETON
// ============================================================================

const service =
  new OpenTelemetryIngestionService();


module.exports =
  service;


module.exports
  .OpenTelemetryIngestionService =
  OpenTelemetryIngestionService;