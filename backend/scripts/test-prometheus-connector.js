"use strict";
require("dotenv").config();

const mongoose =
  require("mongoose");

const webhookIngestionService =
  require(
    "../services/integrations/webhookIngestionService"
  );

const {
  WebhookConfig,
  WebhookEvent,
} =
  (() => {
    /*
     * webhookIngestionService owns these models internally.
     * Reuse mongoose's registered models instead of creating
     * duplicate schemas.
     */

    return {
      WebhookConfig:
        mongoose.models
          .WebhookConfig,

      WebhookEvent:
        mongoose.models
          .WebhookEvent,
    };
  })();

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
    "[prometheus-test] MongoDB connected"
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

  const tenantId =
    `prom-test-${Date.now()}`;

  // ==========================================================================
  // REGISTER PROMETHEUS SOURCE
  // ==========================================================================

  const registration =
    await webhookIngestionService
      .registerWebhookSource(
        {
          organizationId,

          environmentId,

          tenantId,
        },
        {
          name:
            `Prometheus Test ${Date.now()}`,

          type:
            "prometheus_alertmanager",

          enabled:
            true,

          mappings: {},
        }
      );

  console.log(
    "[prometheus-test] source registered"
  );

  console.log({
    sourceId:
      registration
        .source
        .sourceId,

    provider:
      registration
        .source
        .type,
  });

  // ==========================================================================
  // ALERTMANAGER PAYLOAD
  // ==========================================================================

  const payload = {
    receiver:
      "aira",

    status:
      "firing",

    groupKey:
      '{}:{alertname="HighCPU"}',

    externalURL:
      "http://alertmanager.example.com",

    alerts: [
      {
        status:
          "firing",

        labels: {
          alertname:
            "HighCPU",

          severity:
            "critical",

          service:
            "payment-api",

          instance:
            "payment-api-01",
        },

        annotations: {
          summary:
            "Payment API CPU is above 95%",

          description:
            "CPU usage has remained above 95% for five minutes",
        },

        startsAt:
          new Date(
            Date.now() -
            5 * 60 * 1000
          ).toISOString(),

        endsAt:
          "0001-01-01T00:00:00Z",

        generatorURL:
          "http://prometheus.example.com/graph",

        fingerprint:
          "highcpu-payment-001",
      },

      {
        status:
          "firing",

        labels: {
          alertname:
            "HighLatency",

          severity:
            "warning",

          service:
            "checkout-api",

          instance:
            "checkout-api-02",
        },

        annotations: {
          summary:
            "Checkout latency is elevated",

          description:
            "p95 latency is above 2 seconds",
        },

        startsAt:
          new Date(
            Date.now() -
            2 * 60 * 1000
          ).toISOString(),

        endsAt:
          "0001-01-01T00:00:00Z",

        generatorURL:
          "http://prometheus.example.com/graph",

        fingerprint:
          "latency-checkout-001",
      },
    ],
  };

  // ==========================================================================
  // INGEST FIRING EVENTS
  // ==========================================================================

  const firstResult =
    await webhookIngestionService
      .ingestEvent(
        registration
          .source
          .sourceId,

        registration
          .apiKey,

        payload,

        {}
      );

  console.log(
    "\n[prometheus-test] FIRING INGEST RESULT"
  );

  console.log({
    accepted:
      firstResult
        .accepted,

    duplicates:
      firstResult
        .duplicates,

    events:
      firstResult
        .events
        .map(
          (event) => ({
            eventId:
              event.eventId,

            eventType:
              event.eventType,

            service:
              event.alert
                ?.service,

            severity:
              event.alert
                ?.severity,

            providerStatus:
              event
                .providerStatus,
          })
        ),
  });

  // ==========================================================================
  // DUPLICATE TEST
  // ==========================================================================

  const duplicateResult =
    await webhookIngestionService
      .ingestEvent(
        registration
          .source
          .sourceId,

        registration
          .apiKey,

        payload,

        {}
      );

  console.log(
    "\n[prometheus-test] DUPLICATE RESULT"
  );

  console.log({
    accepted:
      duplicateResult
        .accepted,

    duplicates:
      duplicateResult
        .duplicates,
  });

  // ==========================================================================
  // RESOLUTION TEST
  // ==========================================================================
  //
  // The fingerprint intentionally remains IDENTICAL.
  //
  // This proves resolved events no longer collide with firing events.
  // ==========================================================================

  const resolvedPayload = {
    ...payload,

    status:
      "resolved",

    alerts:
      [
        {
          ...payload
            .alerts[0],

          status:
            "resolved",

          endsAt:
            new Date()
              .toISOString(),
        },
      ],
  };

  const resolvedResult =
    await webhookIngestionService
      .ingestEvent(
        registration
          .source
          .sourceId,

        registration
          .apiKey,

        resolvedPayload,

        {}
      );

  console.log(
    "\n[prometheus-test] RESOLVED RESULT"
  );

  console.log({
    accepted:
      resolvedResult
        .accepted,

    duplicates:
      resolvedResult
        .duplicates,

    events:
      resolvedResult
        .events
        .map(
          (event) => ({
            eventId:
              event.eventId,

            providerEventId:
              event
                .providerEventId,

            eventType:
              event.eventType,

            providerStatus:
              event
                .providerStatus,
          })
        ),
  });

  // ==========================================================================
  // VERIFY DATABASE
  // ==========================================================================

  const storedEvents =
    await mongoose
      .model(
        "WebhookEvent"
      )
      .find({
        organizationId,

        environmentId,

        sourceId:
          registration
            .source
            .sourceId,
      })
      .sort({
        timestamp:
          1,
      })
      .lean();

  console.log(
    "\n[prometheus-test] DATABASE EVENTS"
  );

  console.table(
    storedEvents.map(
      (event) => ({
        eventId:
          event.eventId,

        providerEventId:
          event
            .providerEventId,

        eventType:
          event.eventType,

        service:
          event.alert
            ?.service,

        severity:
          event.alert
            ?.severity,

        providerStatus:
          event
            .providerStatus,

        status:
          event.status,
      })
    )
  );

  // ==========================================================================
  // ASSERTIONS
  // ==========================================================================

  if (
    firstResult.accepted !==
    2
  ) {
    throw new Error(
      `Expected 2 firing events, received ${firstResult.accepted}`
    );
  }

  if (
    duplicateResult
      .accepted !==
      0 ||
    duplicateResult
      .duplicates !==
      2
  ) {
    throw new Error(
      "Duplicate protection failed"
    );
  }

  if (
    resolvedResult
      .accepted !==
      1
  ) {
    throw new Error(
      "Resolved event was not persisted"
    );
  }

  if (
    storedEvents.length !==
    3
  ) {
    throw new Error(
      `Expected 3 database events, found ${storedEvents.length}`
    );
  }

  const firingEvent =
    storedEvents.find(
      (event) =>
        event
          .providerEventId ===
          "highcpu-payment-001" &&
        event
          .providerStatus ===
          "open"
    );

  const resolvedEvent =
    storedEvents.find(
      (event) =>
        event
          .providerEventId ===
          "highcpu-payment-001" &&
        event
          .providerStatus ===
          "resolved"
    );

  if (
    !firingEvent ||
    !resolvedEvent
  ) {
    throw new Error(
      "Firing/resolved lifecycle persistence failed"
    );
  }

  if (
    firingEvent.eventId ===
    resolvedEvent.eventId
  ) {
    throw new Error(
      "Firing and resolved events incorrectly share the same eventId"
    );
  }

  console.log(
    "\n✅ PROMETHEUS ALERTMANAGER CONNECTOR PASSED"
  );

  // ==========================================================================
  // CLEANUP TEST DATA
  // ==========================================================================

  await mongoose
    .model(
      "WebhookEvent"
    )
    .deleteMany({
      organizationId,

      environmentId,
    });

  await mongoose
    .model(
      "WebhookConfig"
    )
    .deleteMany({
      organizationId,

      environmentId,
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
        "\n❌ PROMETHEUS CONNECTOR TEST FAILED"
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