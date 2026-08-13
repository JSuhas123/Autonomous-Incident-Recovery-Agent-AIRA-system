"use strict";

require("dotenv").config();

const mongoose =
  require("mongoose");

const opentelemetryIngestionService =
  require(
    "../services/integrations/opentelemetryIngestionService"
  );

async function main() {
  const mongoUri =
    process.env
      .MONGODB_URI;

  if (!mongoUri) {
    throw new Error(
      "MONGODB_URI is required"
    );
  }

  await mongoose.connect(
    mongoUri
  );

  console.log(
    "[otel-test] MongoDB connected"
  );

  // ==========================================================================
  // TEST CONTEXT
  // ==========================================================================

  const organizationId =
    new mongoose
      .Types.ObjectId();

  const environmentId =
    new mongoose
      .Types.ObjectId();

  const integrationId =
    new mongoose
      .Types.ObjectId();

  const tenantId =
    `otel-test-${Date.now()}`;

  const context = {
    organizationId,

    environmentId,

    tenantId,

    integrationId,
  };

  // ==========================================================================
  // TIME HELPERS
  // ==========================================================================

  const nowMs =
    Date.now();

  const nowNs =
    (
      BigInt(
        nowMs
      ) *
      1000000n
    ).toString();

  const spanStartNs =
    (
      BigInt(
        nowMs - 500
      ) *
      1000000n
    ).toString();

  const spanEndNs =
    (
      BigInt(
        nowMs
      ) *
      1000000n
    ).toString();

  // ==========================================================================
  // OTLP JSON PAYLOAD
  // ==========================================================================

  const payload = {
    // ========================================================================
    // LOG
    // ========================================================================

    resourceLogs: [
      {
        resource: {
          attributes: [
            {
              key:
                "service.name",

              value: {
                stringValue:
                  "payment-api",
              },
            },

            {
              key:
                "deployment.environment",

              value: {
                stringValue:
                  "production",
              },
            },
          ],
        },

        scopeLogs: [
          {
            scope: {
              name:
                "aira-test-logger",

              version:
                "1.0.0",
            },

            logRecords: [
              {
                timeUnixNano:
                  nowNs,

                severityText:
                  "ERROR",

                severityNumber:
                  17,

                traceId:
                  "0123456789abcdef0123456789abcdef",

                spanId:
                  "0123456789abcdef",

                body: {
                  stringValue:
                    "Payment provider request failed",
                },

                attributes: [
                  {
                    key:
                      "http.status_code",

                    value: {
                      intValue:
                        "500",
                    },
                  },

                  {
                    key:
                      "error.type",

                    value: {
                      stringValue:
                        "PaymentGatewayError",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],

    // ========================================================================
    // METRIC
    // ========================================================================

    resourceMetrics: [
      {
        resource: {
          attributes: [
            {
              key:
                "service.name",

              value: {
                stringValue:
                  "payment-api",
              },
            },
          ],
        },

        scopeMetrics: [
          {
            scope: {
              name:
                "aira-test-meter",

              version:
                "1.0.0",
            },

            metrics: [
              {
                name:
                  "http.server.request.duration",

                description:
                  "HTTP request duration",

                unit:
                  "ms",

                gauge: {
                  dataPoints: [
                    {
                      timeUnixNano:
                        nowNs,

                      asDouble:
                        325.5,

                      attributes: [
                        {
                          key:
                            "http.route",

                          value: {
                            stringValue:
                              "/payments",
                          },
                        },

                        {
                          key:
                            "http.method",

                          value: {
                            stringValue:
                              "POST",
                          },
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],

    // ========================================================================
    // TRACE
    // ========================================================================

    resourceSpans: [
      {
        resource: {
          attributes: [
            {
              key:
                "service.name",

              value: {
                stringValue:
                  "payment-api",
              },
            },
          ],
        },

        scopeSpans: [
          {
            scope: {
              name:
                "aira-test-tracer",

              version:
                "1.0.0",
            },

            spans: [
              {
                traceId:
                  "0123456789abcdef0123456789abcdef",

                spanId:
                  "0123456789abcdef",

                parentSpanId:
                  "fedcba9876543210",

                name:
                  "POST /payments",

                kind:
                  2,

                startTimeUnixNano:
                  spanStartNs,

                endTimeUnixNano:
                  spanEndNs,

                attributes: [
                  {
                    key:
                      "http.method",

                    value: {
                      stringValue:
                        "POST",
                    },
                  },

                  {
                    key:
                      "http.status_code",

                    value: {
                      intValue:
                        "500",
                    },
                  },
                ],

                status: {
                  code:
                    2,

                  message:
                    "Payment gateway failure",
                },
              },
            ],
          },
        ],
      },
    ],
  };

  // ==========================================================================
  // FIRST INGEST
  // ==========================================================================

  const firstResult =
    await opentelemetryIngestionService
      .ingest(
        context,
        payload
      );

  console.log(
    "\n[otel-test] FIRST INGEST"
  );

  console.log({
    accepted:
      firstResult.accepted,

    duplicates:
      firstResult.duplicates,

    signals:
      firstResult.signals.map(
        (signal) => ({
          signalId:
            signal.signalId,

          signalType:
            signal.signalType,

          serviceName:
            signal.serviceName,

          name:
            signal.name,

          severity:
            signal.severity,
        })
      ),
  });

  // ==========================================================================
  // DUPLICATE INGEST
  // ==========================================================================

  const duplicateResult =
    await opentelemetryIngestionService
      .ingest(
        context,
        payload
      );

  console.log(
    "\n[otel-test] DUPLICATE INGEST"
  );

  console.log({
    accepted:
      duplicateResult.accepted,

    duplicates:
      duplicateResult.duplicates,
  });

  // ==========================================================================
  // QUERY LOGS
  // ==========================================================================

  const logs =
    await opentelemetryIngestionService
      .queryLogs(
        context,
        {
          serviceName:
            "payment-api",

          limit:
            10,
        }
      );

  console.log(
    "\n[otel-test] LOG QUERY"
  );

  console.table(
    logs.map(
      (log) => ({
        signalId:
          log.signalId,

        service:
          log.serviceName,

        severity:
          log.severity,

        body:
          log.log?.body,

        traceId:
          log.traceId,
      })
    )
  );

  // ==========================================================================
  // QUERY METRICS
  // ==========================================================================

  const metrics =
    await opentelemetryIngestionService
      .queryMetrics(
        context,
        {
          serviceName:
            "payment-api",

          name:
            "http.server.request.duration",

          limit:
            10,
        }
      );

  console.log(
    "\n[otel-test] METRIC QUERY"
  );

  console.table(
    metrics.map(
      (metric) => ({
        signalId:
          metric.signalId,

        service:
          metric.serviceName,

        metric:
          metric.name,

        type:
          metric.metric
            ?.metricType,

        value:
          JSON.stringify(
            metric.metric
              ?.value
          ),
      })
    )
  );

  // ==========================================================================
  // QUERY TRACES
  // ==========================================================================

  const traces =
    await opentelemetryIngestionService
      .queryTraces(
        context,
        {
          traceId:
            "0123456789abcdef0123456789abcdef",

          limit:
            10,
        }
      );

  console.log(
    "\n[otel-test] TRACE QUERY"
  );

  console.table(
    traces.map(
      (trace) => ({
        signalId:
          trace.signalId,

        service:
          trace.serviceName,

        name:
          trace.name,

        traceId:
          trace.traceId,

        spanId:
          trace.spanId,

        durationMs:
          trace.span
            ?.durationMs,

        severity:
          trace.severity,
      })
    )
  );

  // ==========================================================================
  // ASSERTIONS
  // ==========================================================================

  if (
    firstResult.accepted !==
    3
  ) {
    throw new Error(
      `Expected 3 OTEL signals, received ${firstResult.accepted}`
    );
  }

  if (
    firstResult.duplicates !==
    0
  ) {
    throw new Error(
      "Unexpected duplicate during first OTEL ingestion"
    );
  }

  if (
    duplicateResult.accepted !==
      0 ||
    duplicateResult.duplicates !==
      3
  ) {
    throw new Error(
      "OTEL duplicate protection failed"
    );
  }

  if (
    logs.length !==
    1
  ) {
    throw new Error(
      `Expected 1 OTEL log, found ${logs.length}`
    );
  }

  if (
    metrics.length !==
    1
  ) {
    throw new Error(
      `Expected 1 OTEL metric, found ${metrics.length}`
    );
  }

  if (
    traces.length !==
    1
  ) {
    throw new Error(
      `Expected 1 OTEL trace, found ${traces.length}`
    );
  }

  if (
    logs[0].severity !==
    "error"
  ) {
    throw new Error(
      `Expected log severity "error", received "${logs[0].severity}"`
    );
  }

  if (
    logs[0]
      .serviceName !==
    "payment-api"
  ) {
    throw new Error(
      "OTEL log service.name extraction failed"
    );
  }

  if (
    metrics[0]
      .metric
      ?.value !==
    325.5
  ) {
    throw new Error(
      `Unexpected metric value: ${metrics[0].metric?.value}`
    );
  }

  if (
    traces[0]
      .traceId !==
    "0123456789abcdef0123456789abcdef"
  ) {
    throw new Error(
      "OTEL traceId extraction failed"
    );
  }

  if (
    traces[0]
      .span
      ?.durationMs !==
    500
  ) {
    throw new Error(
      `Expected 500ms span duration, received ${traces[0].span?.durationMs}`
    );
  }

  if (
    traces[0]
      .severity !==
    "error"
  ) {
    throw new Error(
      "OTEL error span severity normalization failed"
    );
  }

  console.log(
    "\n✅ OPENTELEMETRY CONNECTOR PASSED"
  );

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  await mongoose
    .model(
      "OpenTelemetrySignal"
    )
    .deleteMany({
      organizationId,

      environmentId,

      integrationId,
    });

  await mongoose
    .disconnect();
}

main()
  .catch(
    async (
      error
    ) => {
      console.error(
        "\n❌ OPENTELEMETRY CONNECTOR TEST FAILED"
      );

      console.error(
        error
      );

      try {
        await mongoose
          .disconnect();
      } catch {
        // Ignore cleanup failure.
      }

      process.exitCode =
        1;
    }
  );