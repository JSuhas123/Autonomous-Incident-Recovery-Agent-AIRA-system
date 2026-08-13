"use strict";

require("dotenv").config();

const mongoose =
  require("mongoose");

const Service =
  require(
    "../models/Service"
  );

const {
  Signal,
} =
  require(
    "../models/Signal"
  );

const {
  SignalCorrelation,
} =
  require(
    "../models/SignalCorrelation"
  );

const signalIngestionService =
  require(
    "../services/signals/signalIngestionService"
  );

async function main() {
  if (
    !process.env
      .MONGODB_URI
  ) {
    throw new Error(
      "MONGODB_URI is required"
    );
  }

  await mongoose.connect(
    process.env
      .MONGODB_URI
  );

  console.log(
    "[signal-test] MongoDB connected"
  );

  const organizationId =
    new mongoose
      .Types.ObjectId();

  const environmentId =
    new mongoose
      .Types.ObjectId();

  const tenantId =
    `signal-test-${Date.now()}`;

  const userId =
    new mongoose
      .Types.ObjectId();

  const service =
    await Service.create({
      organizationId,

      environmentId,

      tenantId,

      name:
        "Payment API",

      slug:
        `payment-api-${Date.now()}`,

      description:
        "Signal pipeline test service",

      type:
        "api",

      environment:
        "production",

      status:
        "active",

      createdBy:
        userId,
    });

  console.log(
    "[signal-test] Test service created"
  );

  const context = {
    organizationId,

    environmentId,

    tenantId,

    serviceId:
      service._id,
  };

  // ==========================================================================
  // 1. PROMETHEUS SIGNAL
  // ==========================================================================

  const prometheusSignal = {
    provider:
      "prometheus_alertmanager",

    eventType:
      "alert.open",

    title:
      "Payment API error rate high",

    severity:
      "critical",

    service:
      "Payment API",

    status:
      "open",

    errorCode:
      "HTTP_500_SPIKE",

    labels: {
      service:
        "Payment API",

      namespace:
        "production",
    },

    annotations: {
      summary:
        "HTTP 500 rate above threshold",
    },

    observedAt:
      new Date(),

    sourceEventId:
      "prometheus-test-001",
  };

  const prometheusResult =
    await signalIngestionService
      .ingest(
        prometheusSignal,
        context
      );

  console.log(
    "\n[signal-test] PROMETHEUS RESULT"
  );

  console.log({
    duplicate:
      prometheusResult
        .duplicate,

    signalId:
      prometheusResult
        .signal
        ?.signalId,

    serviceId:
      prometheusResult
        .signal
        ?.serviceId,

    incidentCandidate:
      prometheusResult
        .signal
        ?.incidentCandidate,
  });

  // ==========================================================================
  // 2. DUPLICATE PROMETHEUS
  // ==========================================================================

  const duplicateResult =
    await signalIngestionService
      .ingest(
        prometheusSignal,
        context
      );

  console.log(
    "\n[signal-test] DUPLICATE RESULT"
  );

  console.log({
    duplicate:
      duplicateResult
        .duplicate,

    duplicateCount:
      duplicateResult
        .signal
        ?.duplicateCount,
  });

  // ==========================================================================
  // 3. OTEL ERROR TRACE
  // ==========================================================================

  const otelSignal = {
    provider:
      "opentelemetry",

    signalType:
      "trace",

    signalId:
      "otel-test-trace-001",

    timestamp:
      new Date(),

    serviceName:
      "Payment API",

    name:
      "POST /payments",

    severity:
      "error",

    traceId:
      "0123456789abcdef0123456789abcdef",

    spanId:
      "0123456789abcdef",

    attributes: {
      "http.status_code":
        500,

      "error.type":
        "HTTP_500_SPIKE",
    },

    resourceAttributes: {
      "service.name":
        "Payment API",
    },

    span: {
      statusCode:
        2,

      statusMessage:
        "Internal Server Error",
    },
  };

  const otelResult =
    await signalIngestionService
      .ingest(
        otelSignal,
        context
      );

  console.log(
    "\n[signal-test] OTEL RESULT"
  );

  console.log({
    signalId:
      otelResult
        .signal
        ?.signalId,

    correlationGroupId:
      otelResult
        .signal
        ?.correlationGroupId,

    correlationScore:
      otelResult
        .signal
        ?.correlationScore,

    candidate:
      otelResult
        .signal
        ?.incidentCandidate,
  });

  // ==========================================================================
  // 4. MONITOR FAILURE SIGNAL
  // ==========================================================================

  const monitorId =
    new mongoose
      .Types.ObjectId();

  const monitorSignal = {
    provider:
      "monitor",

    monitorId,

    serviceId:
      service._id,

    checkedAt:
      new Date(),

    status:
      "down",

    statusCode:
      500,

    responseTimeMs:
      900,

    errorCode:
      "HTTP_500_SPIKE",

    sanitizedErrorMessage:
      "HTTP 500 observed",

    checkerRegion:
      "test",
  };

  const monitorResult =
    await signalIngestionService
      .ingest(
        monitorSignal,
        {
          ...context,

          monitorId,

          monitorName:
            "Payment API monitor",
        }
      );

  console.log(
    "\n[signal-test] MONITOR RESULT"
  );

  console.log({
    signalId:
      monitorResult
        .signal
        ?.signalId,

    group:
      monitorResult
        .signal
        ?.correlationGroupId,

    candidate:
      monitorResult
        .signal
        ?.incidentCandidate,
  });

  // ==========================================================================
  // DATABASE VERIFICATION
  // ==========================================================================

  const signals =
    await Signal
      .find({
        organizationId,

        environmentId,
      })
      .sort({
        observedAt:
          1,
      })
      .lean();

  const groups =
    await SignalCorrelation
      .find({
        organizationId,

        environmentId,
      })
      .lean();

  console.log(
    "\n[signal-test] SIGNALS"
  );

  console.table(
    signals.map(
      (signal) => ({
        provider:
          signal.provider,

        signalId:
          signal.signalId,

        duplicateCount:
          signal
            .duplicateCount,

        serviceId:
          String(
            signal
              .serviceId ||
            ""
          ),

        group:
          signal
            .correlationGroupId,

        score:
          signal
            .correlationScore,

        candidate:
          signal
            .incidentCandidate,

        status:
          signal
            .processingStatus,
      })
    )
  );

  console.log(
    "\n[signal-test] CORRELATION GROUPS"
  );

  console.table(
    groups.map(
      (group) => ({
        group:
          group
            .correlationGroupId,

        signals:
          group
            .signalCount,

        providers:
          group
            .providerCount,

        severity:
          group
            .highestSeverity,

        confidence:
          group
            .confidenceScore,

        candidate:
          group
            .incidentCandidate,

        status:
          group.status,
      })
    )
  );

  // ==========================================================================
  // ASSERTIONS
  // ==========================================================================

  if (
    prometheusResult
      .duplicate
  ) {
    throw new Error(
      "First Prometheus signal was incorrectly treated as duplicate"
    );
  }

  if (
    !duplicateResult
      .duplicate
  ) {
    throw new Error(
      "Signal deduplication failed"
    );
  }

  if (
    duplicateResult
      .signal
      ?.duplicateCount <
    1
  ) {
    throw new Error(
      "Duplicate counter was not incremented"
    );
  }

  if (
    String(
      prometheusResult
        .signal
        ?.serviceId
    ) !==
    String(
      service._id
    )
  ) {
    throw new Error(
      "Service enrichment failed"
    );
  }

  if (
    signals.length !==
    3
  ) {
    throw new Error(
      `Expected 3 canonical signals, found ${signals.length}`
    );
  }

  const providers =
    new Set(
      signals.map(
        (signal) =>
          signal.provider
      )
    );

  for (
    const provider
    of [
      "prometheus_alertmanager",
      "opentelemetry",
      "monitor",
    ]
  ) {
    if (
      !providers.has(
        provider
      )
    ) {
      throw new Error(
        `Missing canonical ${provider} signal`
      );
    }
  }

  const correlatedSignals =
    signals.filter(
      (signal) =>
        signal
          .correlationGroupId
    );

  if (
    correlatedSignals.length <
    2
  ) {
    throw new Error(
      "Cross-provider correlation failed"
    );
  }

  const sharedGroups =
    new Set(
      correlatedSignals.map(
        (signal) =>
          signal
            .correlationGroupId
      )
    );

  if (
    sharedGroups.size !==
    1
  ) {
    throw new Error(
      `Expected one correlated failure group, found ${sharedGroups.size}`
    );
  }

  if (
    groups.length <
    1
  ) {
    throw new Error(
      "SignalCorrelation record was not created"
    );
  }

  const primaryGroup =
    groups.find(
      (group) =>
        group
          .providerCount >=
        2
    );

  if (
    !primaryGroup
  ) {
    throw new Error(
      "No cross-provider correlation group was created"
    );
  }

  if (
    !primaryGroup
      .incidentCandidate
  ) {
    throw new Error(
      "Strong correlated failure did not become incident candidate"
    );
  }

  if (
    primaryGroup
      .providerCount <
    2
  ) {
    throw new Error(
      "Cross-provider evidence count is incorrect"
    );
  }

  // ==========================================================================
  // TENANT / ENVIRONMENT ISOLATION
  // ==========================================================================

  const otherEnvironmentId =
    new mongoose
      .Types.ObjectId();

  const isolated =
    await Signal.find({
      organizationId,

      environmentId:
        otherEnvironmentId,
    });

  if (
    isolated.length !==
    0
  ) {
    throw new Error(
      "Environment isolation failed"
    );
  }

  console.log(
    "\n✅ SIGNAL PIPELINE PASSED"
  );

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  await Signal.deleteMany({
    organizationId,
  });

  await SignalCorrelation
    .deleteMany({
      organizationId,
    });

  await Service.deleteOne({
    _id:
      service._id,
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
        "\n❌ SIGNAL PIPELINE TEST FAILED"
      );

      console.error(
        error
      );

      try {
        await mongoose
          .disconnect();
      } catch {
        // Ignore.
      }

      process.exitCode =
        1;
    }
  );