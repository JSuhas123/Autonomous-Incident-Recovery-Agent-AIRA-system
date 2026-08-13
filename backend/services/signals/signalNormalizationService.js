"use strict";

const crypto =
  require("node:crypto");

const {
  SIGNAL_TYPES,
  SIGNAL_SEVERITIES,
  SIGNAL_SOURCES,
} =
  require(
    "../../models/Signal"
  );

const PROVIDER_SOURCE_MAP =
  Object.freeze({
    monitor:
      "monitor",

    prometheus_alertmanager:
      "integration",

    grafana_alerting:
      "integration",

    datadog:
      "integration",

    aws_cloudwatch:
      "integration",

    azure_monitor:
      "integration",

    gcp_monitoring:
      "integration",

    kubernetes:
      "integration",

    webhook_incoming:
      "integration",

    opentelemetry:
      "telemetry",
  });

const PROVIDER_SIGNAL_TYPE_MAP =
  Object.freeze({
    monitor:
      "monitor",

    prometheus_alertmanager:
      "alert",

    grafana_alerting:
      "alert",

    datadog:
      "alert",

    aws_cloudwatch:
      "alert",

    azure_monitor:
      "alert",

    gcp_monitoring:
      "alert",

    kubernetes:
      "event",

    webhook_incoming:
      "event",
  });

class SignalNormalizationService {
  // ==========================================================================
  // PUBLIC ENTRY POINT
  // ==========================================================================

  normalize(
    input,
    context = {}
  ) {
    if (
      !input ||
      typeof input !==
        "object" ||
      Array.isArray(
        input
      )
    ) {
      throw Object.assign(
        new Error(
          "Signal input must be an object"
        ),
        {
          code:
            "SIGNAL_INPUT_INVALID",
        }
      );
    }

    const provider =
      this.normalizeProvider(
        input.provider ||
        context.provider ||
        "internal"
      );

    /*
     * OpenTelemetry produces three different signal types.
     */
    if (
      provider ===
      "opentelemetry"
    ) {
      return this.normalizeOpenTelemetry(
        input,
        context
      );
    }

    /*
     * Native monitor checks have their own shape.
     */
    if (
      provider ===
      "monitor"
    ) {
      return this.normalizeMonitor(
        input,
        context
      );
    }

    /*
     * Every Phase 3 adapter was intentionally built around
     * a common normalized event shape, so all provider alerts
     * can converge here.
     */
    return this.normalizeIntegrationEvent(
      input,
      context,
      provider
    );
  }

  // ==========================================================================
  // INTEGRATION EVENTS
  // ==========================================================================

  normalizeIntegrationEvent(
    input,
    context,
    provider
  ) {
    const ownership =
      this.requireOwnership(
        input,
        context
      );

    const resource =
      this.extractResource(
        input
      );

    const observedAt =
      this.resolveTimestamp([
        input.observedAt,
        input.startsAt,
        input.timestamp,
        input.receivedAt,
      ]);

    const severity =
      this.normalizeSeverity(
        input.severity
      );

    const eventType =
      this.cleanString(
        input.eventType
      ) ||
      "event.unknown";

    const title =
      this.cleanString(
        input.title
      ) ||
      `${provider} operational event`;

    const errorCode =
      this.cleanString(
        input.errorCode ||
        input.code
      );

    const statusCode =
      this.normalizeStatusCode(
        input.statusCode
      );

    const sourceEventId =
      this.cleanString(
        input.externalEventId ||
        input.sourceEventId
      );

    const fingerprint =
      this.buildFingerprint({
        organizationId:
          ownership.organizationId,

        environmentId:
          ownership.environmentId,

        provider,

        sourceEventId,

        eventType,

        serviceId:
          ownership.serviceId,

        serviceName:
          resource.serviceName,

        resourceId:
          resource.resourceId,

        errorCode,

        statusCode,

        traceId:
          input.traceId,
      });

    return {
      signalId:
        this.buildSignalId({
          provider,
          fingerprint,
          observedAt,
          sourceEventId,
        }),

      ...ownership,

      source:
        this.resolveSource(
          provider,
          context.source
        ),

      provider,

      sourceEventId,

      signalType:
        this.resolveSignalType(
          provider,
          input.signalType
        ),

      eventType,

      severity,

      title,

      description:
        this.cleanString(
          input.description ||
          input.annotations
            ?.description ||
          input.annotations
            ?.summary ||
          input.annotations
            ?.message
        ),

      resource,

      traceId:
        this.cleanString(
          input.traceId
        ),

      spanId:
        this.cleanString(
          input.spanId
        ),

      parentSpanId:
        this.cleanString(
          input.parentSpanId
        ),

      correlationId:
        this.cleanString(
          input.correlationId ||
          context.correlationId
        ),

      errorCode,

      statusCode,

      errorMessage:
        this.cleanString(
          input.errorMessage ||
          input.annotations
            ?.error ||
          input.annotations
            ?.message
        ),

      metric:
        this.normalizeMetric(
          input.metric
        ),

      labels:
        this.safeObject(
          input.labels
        ),

      annotations:
        this.safeObject(
          input.annotations
        ),

      attributes:
        this.safeObject(
          input.attributes
        ),

      fingerprint,

      duplicateCount:
        0,

      firstSeenAt:
        observedAt,

      lastSeenAt:
        observedAt,

      processingStatus:
        "normalized",

      normalizedAt:
        new Date(),

      incidentCandidate:
        this.isIncidentCandidate({
          severity,

          eventType,

          status:
            input.status,
        }),

      observedAt,

      receivedAt:
        this.resolveTimestamp([
          input.receivedAt,
          new Date(),
        ]),

      rawPayload:
        input.rawPayload ||
        input,

      schemaVersion:
        1,
    };
  }

  // ==========================================================================
  // MONITOR CHECKS
  // ==========================================================================

  normalizeMonitor(
    input,
    context
  ) {
    const ownership =
      this.requireOwnership(
        input,
        context
      );

    const observedAt =
      this.resolveTimestamp([
        input.checkedAt,
        input.observedAt,
        input.receivedAt,
      ]);

    const isHealthy =
      input.status ===
      "healthy";

    const severity =
      isHealthy
        ? "info"
        : this.normalizeMonitorSeverity(
            input
          );

    const eventType =
      isHealthy
        ? "monitor.recovered"
        : input.status ===
          "degraded"
          ? "monitor.degraded"
          : "monitor.failed";

    const errorCode =
      this.cleanString(
        input.errorCode
      );

    const statusCode =
      this.normalizeStatusCode(
        input.statusCode
      );

    const fingerprint =
      this.buildFingerprint({
        organizationId:
          ownership.organizationId,

        environmentId:
          ownership.environmentId,

        provider:
          "monitor",

        sourceEventId:
          null,

        eventType,

        serviceId:
          ownership.serviceId,

        monitorId:
          ownership.monitorId,

        errorCode:
          errorCode ||
          (
            statusCode
              ? `HTTP_${statusCode}`
              : input.status
          ),
      });

    return {
      signalId:
        this.buildSignalId({
          provider:
            "monitor",

          fingerprint,

          observedAt,
        }),

      ...ownership,

      source:
        "monitor",

      provider:
        "monitor",

      sourceEventId:
        null,

      signalType:
        "monitor",

      eventType,

      severity,

      title:
        this.buildMonitorTitle(
          input,
          context
        ),

      description:
        this.cleanString(
          input
            .sanitizedErrorMessage
        ) ||
        (
          isHealthy
            ? "Monitor check recovered."
            : "Monitor reported an operational failure."
        ),

      resource: {
        serviceName:
          this.cleanString(
            context
              .serviceName
          ),

        namespace:
          null,

        cluster:
          null,

        pod:
          null,

        container:
          null,

        node:
          null,

        host:
          this.cleanString(
            context.host
          ),

        region:
          this.cleanString(
            input
              .checkerRegion
          ),

        cloudProvider:
          null,

        resourceType:
          "service",

        resourceId:
          ownership.serviceId
            ? String(
                ownership
                  .serviceId
              )
            : null,
      },

      traceId:
        null,

      spanId:
        null,

      parentSpanId:
        null,

      correlationId:
        this.cleanString(
          context
            .correlationId
        ),

      errorCode,

      statusCode,

      errorMessage:
        this.cleanString(
          input
            .sanitizedErrorMessage
        ),

      metric: {
        name:
          "monitor.response_time",

        value:
          input
            .responseTimeMs ??
          null,

        unit:
          "ms",

        metricType:
          "gauge",
      },

      labels: {
        monitorStatus:
          input.status,

        checkerRegion:
          input
            .checkerRegion ||
          null,
      },

      annotations: {
        sslValid:
          input.sslValid ??
          null,

        sslDaysRemaining:
          input
            .sslDaysRemaining ??
          null,

        contentMatched:
          input
            .contentMatched ??
          null,

        redirectCount:
          input
            .redirectCount ??
          0,
      },

      attributes: {
        dnsTimeMs:
          input.dnsTimeMs ??
          null,

        tcpTimeMs:
          input.tcpTimeMs ??
          null,

        tlsTimeMs:
          input.tlsTimeMs ??
          null,

        firstByteTimeMs:
          input
            .firstByteTimeMs ??
          null,

        responseSizeBytes:
          input
            .responseSizeBytes ??
          null,
      },

      fingerprint,

      duplicateCount:
        0,

      firstSeenAt:
        observedAt,

      lastSeenAt:
        observedAt,

      processingStatus:
        "normalized",

      normalizedAt:
        new Date(),

      incidentCandidate:
        !isHealthy,

      observedAt,

      receivedAt:
        new Date(),

      rawPayload:
        input,

      schemaVersion:
        1,
    };
  }

  // ==========================================================================
  // OPENTELEMETRY
  // ==========================================================================

  normalizeOpenTelemetry(
    input,
    context
  ) {
    const ownership =
      this.requireOwnership(
        input,
        context
      );

    const signalType =
      this.normalizeSignalType(
        input.signalType
      );

    const observedAt =
      this.resolveTimestamp([
        input.timestamp,
        input.observedAt,
        input.receivedAt,
      ]);

    const severity =
      this.normalizeSeverity(
        input.severity
      );

    const resource = {
  serviceName:
    this.cleanString(
      input.serviceName
    ),

  namespace:
    this.cleanString(
      input.resourceAttributes
        ?.["k8s.namespace.name"]
    ),

  cluster:
    this.cleanString(
      input.resourceAttributes
        ?.["k8s.cluster.name"]
    ),

  pod:
    this.cleanString(
      input.resourceAttributes
        ?.["k8s.pod.name"]
    ),

  container:
    this.cleanString(
      input.resourceAttributes
        ?.["container.name"]
    ),

  node:
    this.cleanString(
      input.resourceAttributes
        ?.["k8s.node.name"]
    ),

  host:
    this.cleanString(
      input.resourceAttributes
        ?.["host.name"]
    ),

  region:
    this.cleanString(
      input.resourceAttributes
        ?.["cloud.region"]
    ),

  cloudProvider:
    this.cleanString(
      input.resourceAttributes
        ?.["cloud.provider"]
    ),

  resourceType:
    signalType,

  resourceId:
    this.cleanString(
      input.resourceAttributes
        ?.["service.instance.id"]
    ),
};

    const eventType =
      this.buildOtelEventType(
        input,
        signalType
      );

    const sourceEventId =
      this.cleanString(
        input.signalId
      );

    const fingerprint =
      this.buildFingerprint({
        organizationId:
          ownership.organizationId,

        environmentId:
          ownership.environmentId,

        provider:
          "opentelemetry",

        sourceEventId,

        eventType,

        serviceId:
          ownership.serviceId,

        serviceName:
          resource.serviceName,

        traceId:
          input.traceId,

        spanId:
          input.spanId,

        errorCode:
          this.extractOtelErrorCode(
            input
          ),
      });

    return {
      signalId:
        this.buildSignalId({
          provider:
            "opentelemetry",

          fingerprint,

          observedAt,

          sourceEventId,
        }),

      ...ownership,

      source:
        "telemetry",

      provider:
        "opentelemetry",

      sourceEventId,

      signalType,

      eventType,

      severity,

      title:
        this.buildOtelTitle(
          input,
          signalType
        ),

      description:
        this.buildOtelDescription(
          input,
          signalType
        ),

      resource,

      traceId:
        this.cleanString(
          input.traceId
        ),

      spanId:
        this.cleanString(
          input.spanId
        ),

      parentSpanId:
        this.cleanString(
          input.parentSpanId
        ),

      correlationId:
        this.cleanString(
          context
            .correlationId
        ),

      errorCode:
        this.extractOtelErrorCode(
          input
        ),

      statusCode:
        this.extractOtelStatusCode(
          input
        ),

      errorMessage:
        this.cleanString(
          input.span
            ?.statusMessage
        ),

      metric:
        signalType ===
        "metric"
          ? {
              name:
                this.cleanString(
                  input.name
                ),

              value:
                input.metric
                  ?.value ??
                null,

              unit:
                this.cleanString(
                  input.metric
                    ?.unit
                ),

              metricType:
                this.cleanString(
                  input.metric
                    ?.metricType
                ),
            }
          : {
              name:
                null,

              value:
                null,

              unit:
                null,

              metricType:
                null,
            },

      labels:
        {},

      annotations:
        this.safeObject(
          input
            .resourceAttributes
        ),

      attributes:
        this.safeObject(
          input.attributes
        ),

      fingerprint,

      duplicateCount:
        0,

      firstSeenAt:
        observedAt,

      lastSeenAt:
        observedAt,

      processingStatus:
        "normalized",

      normalizedAt:
        new Date(),

      incidentCandidate:
        this.isOtelIncidentCandidate(
          input,
          severity,
          signalType
        ),

      observedAt,

      receivedAt:
        new Date(),

      rawPayload:
        input,

      schemaVersion:
        1,
    };
  }

  // ==========================================================================
  // OWNERSHIP
  // ==========================================================================

  requireOwnership(
    input,
    context
  ) {
    const organizationId =
      input.organizationId ||
      context.organizationId;

    const environmentId =
      input.environmentId ||
      context.environmentId;

    const tenantId =
      input.tenantId ||
      context.tenantId;

    if (!organizationId) {
      throw Object.assign(
        new Error(
          "organizationId is required for signal normalization"
        ),
        {
          code:
            "SIGNAL_ORGANIZATION_REQUIRED",
        }
      );
    }

    if (!environmentId) {
      throw Object.assign(
        new Error(
          "environmentId is required for signal normalization"
        ),
        {
          code:
            "SIGNAL_ENVIRONMENT_REQUIRED",
        }
      );
    }

    if (!tenantId) {
      throw Object.assign(
        new Error(
          "tenantId is required for signal normalization"
        ),
        {
          code:
            "SIGNAL_TENANT_REQUIRED",
        }
      );
    }

    return {
      organizationId,

      environmentId,

      tenantId:

        String(
          tenantId
        ),

      serviceId:
        input.serviceId ||
        context.serviceId ||
        null,

      monitorId:
        input.monitorId ||
        context.monitorId ||
        null,

      integrationConnectionId:
        input
          .integrationConnectionId ||
        input.integrationId ||
        context
          .integrationConnectionId ||
        context.integrationId ||
        null,
    };
  }

  // ==========================================================================
  // RESOURCE
  // ==========================================================================

  extractResource(
    input
  ) {
    const labels =
      this.safeObject(
        input.labels
      );

    const attributes =
      this.safeObject(
        input.attributes
      );

    return {
      serviceName:
        this.cleanString(
          input.service ||
          input.serviceName ||
          labels.service ||
          attributes[
            "service.name"
          ]
        ),

      namespace:
        this.cleanString(
          input.namespace ||
          labels.namespace ||
          labels[
            "k8s_namespace"
          ] ||
          attributes[
            "k8s.namespace.name"
          ]
        ),

      cluster:
        this.cleanString(
          input.cluster ||
          labels.cluster ||
          attributes[
            "k8s.cluster.name"
          ]
        ),

      pod:
        this.cleanString(
          input.pod ||
          labels.pod ||
          attributes[
            "k8s.pod.name"
          ]
        ),

      container:
        this.cleanString(
          input.container ||
          labels.container ||
          attributes[
            "container.name"
          ]
        ),

      node:
        this.cleanString(
          input.node ||
          labels.node ||
          attributes[
            "k8s.node.name"
          ]
        ),

      host:
        this.cleanString(
          input.host ||
          labels.host ||
          attributes[
            "host.name"
          ]
        ),

      region:
        this.cleanString(
          input.region ||
          labels.region ||
          attributes[
            "cloud.region"
          ]
        ),

      cloudProvider:
        this.cleanString(
          input.cloudProvider ||
          attributes[
            "cloud.provider"
          ]
        ),

      resourceType:
        this.cleanString(
          input.resourceType
        ),

      resourceId:
        this.cleanString(
          input.resourceId
        ),
    };
  }

  // ==========================================================================
  // NORMALIZATION HELPERS
  // ==========================================================================

  normalizeProvider(
    value
  ) {
    return String(
      value ||
      "internal"
    )
      .trim()
      .toLowerCase();
  }

  resolveSource(
    provider,
    explicit
  ) {
    const source =
      explicit ||
      PROVIDER_SOURCE_MAP[
        provider
      ] ||
      "internal";

    return SIGNAL_SOURCES
      .includes(
        source
      )
      ? source
      : "internal";
  }

  resolveSignalType(
    provider,
    explicit
  ) {
    if (explicit) {
      return this
        .normalizeSignalType(
          explicit
        );
    }

    return (
      PROVIDER_SIGNAL_TYPE_MAP[
        provider
      ] ||
      "event"
    );
  }

  normalizeSignalType(
    value
  ) {
    const normalized =
      String(
        value ||
        "unknown"
      )
        .trim()
        .toLowerCase();

    return SIGNAL_TYPES
      .includes(
        normalized
      )
      ? normalized
      : "unknown";
  }

  normalizeSeverity(
    value
  ) {
    const normalized =
      String(
        value ||
        "unknown"
      )
        .trim()
        .toLowerCase();

    if (
      [
        "critical",
        "fatal",
        "page",
        "p0",
        "p1",
        "sev0",
        "sev1",
        "error",
      ].includes(
        normalized
      )
    ) {
      return "critical";
    }

    if (
      [
        "warning",
        "warn",
        "high",
        "medium",
        "p2",
        "p3",
        "sev2",
        "sev3",
        "degraded",
      ].includes(
        normalized
      )
    ) {
      return "warning";
    }

    if (
      [
        "info",
        "informational",
        "debug",
        "trace",
        "healthy",
        "resolved",
        "ok",
      ].includes(
        normalized
      )
    ) {
      return "info";
    }

    return SIGNAL_SEVERITIES
      .includes(
        normalized
      )
      ? normalized
      : "unknown";
  }

  normalizeMonitorSeverity(
    input
  ) {
    if (
      [
        "ENOTFOUND",
        "ECONNREFUSED",
        "ECONNRESET",
        "ETIMEDOUT",
        "CERT_HAS_EXPIRED",
      ].includes(
        input.errorCode
      )
    ) {
      return "critical";
    }

    if (
      input.status ===
      "down"
    ) {
      return "critical";
    }

    return "warning";
  }

  normalizeStatusCode(
    value
  ) {
    if (
      value ===
      null ||
      value ===
      undefined ||
      value ===
      ""
    ) {
      return null;
    }

    const number =
      Number(
        value
      );

    return Number.isFinite(
      number
    )
      ? number
      : null;
  }

  normalizeMetric(
    metric
  ) {
    if (
      !metric ||
      typeof metric !==
        "object"
    ) {
      return {
        name:
          null,

        value:
          null,

        unit:
          null,

        metricType:
          null,
      };
    }

    return {
      name:
        this.cleanString(
          metric.name
        ),

      value:
        metric.value ??
        null,

      unit:
        this.cleanString(
          metric.unit
        ),

      metricType:
        this.cleanString(
          metric.metricType
        ),
    };
  }

  // ==========================================================================
  // INCIDENT CANDIDATE
  // ==========================================================================

  isIncidentCandidate({
    severity,
    eventType,
    status,
  }) {
    const normalizedStatus =
      String(
        status ||
        ""
      )
        .trim()
        .toLowerCase();

    if (
      [
        "resolved",
        "closed",
        "healthy",
        "ok",
      ].includes(
        normalizedStatus
      )
    ) {
      return false;
    }

    if (
      String(
        eventType
      ).includes(
        "resolved"
      )
    ) {
      return false;
    }

    return (
      severity ===
        "critical" ||
      severity ===
        "warning"
    );
  }

  isOtelIncidentCandidate(
    input,
    severity,
    signalType
  ) {
    if (
      severity ===
      "critical"
    ) {
      return true;
    }

    if (
      signalType ===
      "trace" &&
      input.span
        ?.statusCode ===
      2
    ) {
      return true;
    }

    if (
      signalType ===
      "log" &&
      [
        "error",
        "critical",
      ].includes(
        severity
      )
    ) {
      return true;
    }

    /*
     * Raw metrics are evidence, not incidents by themselves.
     * Thresholding belongs to correlation/routing.
     */
    return false;
  }

  // ==========================================================================
  // FINGERPRINT
  // ==========================================================================

  buildFingerprint(
    components
  ) {
    const canonical =
      Object.entries(
        components
      )
        .filter(
          (
            [
              ,
              value,
            ]
          ) =>
            value !==
              null &&
            value !==
              undefined &&
            value !==
              ""
        )
        .sort(
          (
            [first],
            [second]
          ) =>
            first.localeCompare(
              second
            )
        )
        .map(
          (
            [
              key,
              value,
            ]
          ) =>
            `${key}=${String(
              value
            )}`
        )
        .join(
          "|"
        );

    return crypto
      .createHash(
        "sha256"
      )
      .update(
        canonical
      )
      .digest(
        "hex"
      );
  }

  buildSignalId({
    provider,
    fingerprint,
    observedAt,
    sourceEventId = null,
  }) {
    /*
     * If provider supplied an event ID, signal identity remains
     * deterministic across retries.
     *
     * Without one, observedAt distinguishes repeated observations
     * while fingerprint still groups equivalent failures.
     */
    const raw =
      [
        provider,
        sourceEventId ||
        "no-source-id",
        fingerprint,
        new Date(
          observedAt
        ).toISOString(),
      ].join(
        "::"
      );

    return (
      `sig_${crypto
        .createHash(
          "sha256"
        )
        .update(
          raw
        )
        .digest(
          "hex"
        )
        .slice(
          0,
          48
        )}`
    );
  }

  // ==========================================================================
  // OTEL HELPERS
  // ==========================================================================

  buildOtelEventType(
    input,
    signalType
  ) {
    if (
      signalType ===
      "log"
    ) {
      return input.severity ===
        "error" ||
        input.severity ===
        "critical"
        ? "telemetry.log.error"
        : "telemetry.log";
    }

    if (
      signalType ===
      "metric"
    ) {
      return "telemetry.metric";
    }

    if (
      signalType ===
      "trace"
    ) {
      return input.span
        ?.statusCode ===
        2
        ? "telemetry.trace.error"
        : "telemetry.trace";
    }

    return "telemetry.event";
  }

  buildOtelTitle(
    input,
    signalType
  ) {
    if (
      signalType ===
      "log"
    ) {
      return (
        this.cleanString(
          input.name
        ) ||
        "OpenTelemetry log"
      );
    }

    if (
      signalType ===
      "metric"
    ) {
      return (
        this.cleanString(
          input.name
        ) ||
        "OpenTelemetry metric"
      );
    }

    if (
      signalType ===
      "trace"
    ) {
      return (
        this.cleanString(
          input.name
        ) ||
        "OpenTelemetry span"
      );
    }

    return "OpenTelemetry signal";
  }

  buildOtelDescription(
    input,
    signalType
  ) {
    if (
      signalType ===
      "log"
    ) {
      const body =
        input.log
          ?.body;

      return typeof body ===
        "string"
        ? body
        : body
          ? JSON.stringify(
              body
            )
          : null;
    }

    if (
      signalType ===
      "metric"
    ) {
      return input.metric
        ? `${input.name || "metric"} = ${JSON.stringify(
            input.metric
              .value
          )}`
        : null;
    }

    if (
      signalType ===
      "trace"
    ) {
      return (
        input.span
          ?.statusMessage ||
        input.name ||
        null
      );
    }

    return null;
  }

  extractOtelErrorCode(
  input
) {
  return this.cleanString(
    input.attributes
      ?.["error.type"] ||
    input.attributes
      ?.["exception.type"]
  );
}

  extractOtelStatusCode(
  input
) {
  return this.normalizeStatusCode(
    input.attributes
      ?.["http.status_code"] ||
    input.attributes
      ?.["http.response.status_code"]
  );
}

  // ==========================================================================
  // MONITOR HELPERS
  // ==========================================================================

  buildMonitorTitle(
    input,
    context
  ) {
    const monitorName =
      context.monitorName ||
      "Monitor";

    if (
      input.status ===
      "healthy"
    ) {
      return `${monitorName}: recovered`;
    }

    if (
      input.errorCode ===
      "ENOTFOUND"
    ) {
      return `${monitorName}: DNS resolution failure`;
    }

    if (
      input.errorCode ===
      "ECONNREFUSED"
    ) {
      return `${monitorName}: connection refused`;
    }

    if (
      input.errorCode ===
      "ETIMEDOUT"
    ) {
      return `${monitorName}: request timeout`;
    }

    if (
      input.statusCode
    ) {
      return `${monitorName}: HTTP ${input.statusCode}`;
    }

    return `${monitorName}: operational failure`;
  }

  // ==========================================================================
  // SAFE VALUES
  // ==========================================================================

  cleanString(
    value
  ) {
    if (
      value ===
      null ||
      value ===
      undefined
    ) {
      return null;
    }

    const string =
      String(
        value
      )
        .trim();

    return string ||
      null;
  }

  safeObject(
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

    return value;
  }

  resolveTimestamp(
    candidates
  ) {
    for (
      const candidate
      of candidates
    ) {
      if (!candidate) {
        continue;
      }

      const date =
        candidate instanceof
        Date
          ? candidate
          : new Date(
              candidate
            );

      if (
        !Number.isNaN(
          date.getTime()
        )
      ) {
        return date;
      }
    }

    return new Date();
  }
}

module.exports =
  new SignalNormalizationService();

module.exports
  .SignalNormalizationService =
  SignalNormalizationService;