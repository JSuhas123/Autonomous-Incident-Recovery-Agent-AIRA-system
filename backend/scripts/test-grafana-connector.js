"use strict";

require("dotenv").config();

const mongoose =
  require("mongoose");

const webhookIngestionService =
  require(
    "../services/integrations/webhookIngestionService"
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
    "[grafana-test] MongoDB connected"
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
    `grafana-test-${Date.now()}`;

  // ==========================================================================
  // REGISTER GRAFANA SOURCE
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
            `Grafana Test ${Date.now()}`,

          type:
            "grafana_alerting",

          enabled:
            true,

          mappings: {},
        }
      );

  console.log(
    "[grafana-test] source registered"
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
  // GRAFANA WEBHOOK PAYLOAD
  // ==========================================================================

  const firingPayload = {
    receiver:
      "aira",

    status:
      "firing",

    orgId:
      1,

    title:
      "[FIRING:2] AIRA Grafana Test",

    state:
      "alerting",

    message:
      "Grafana test alerts",

    groupKey:
      '{}:{alertname="AIRA-Grafana-Test"}',

    truncatedAlerts:
      0,

    alerts: [
      {
        status:
          "firing",

        labels: {
          alertname:
            "DatabaseHighLatency",

          severity:
            "critical",

          service:
            "database-api",

          namespace:
            "production",
        },

        annotations: {
          summary:
            "Database latency is above threshold",

          description:
            "Database p95 latency exceeded 1500 ms",
        },

        startsAt:
          new Date(
            Date.now() -
            5 * 60 * 1000
          ).toISOString(),

        endsAt:
          "0001-01-01T00:00:00Z",

        generatorURL:
          "https://grafana.example.com/alerting/grafana/test-1/view",

        fingerprint:
          "grafana-db-latency-001",

        dashboardURL:
          "https://grafana.example.com/d/database",

        panelURL:
          "https://grafana.example.com/d/database?viewPanel=4",

        values: {
          A:
            1.8,
        },

        valueString:
          "[ var='A' value=1.8 ]",
      },

      {
        status:
          "firing",

        labels: {
          alertname:
            "CheckoutErrors",

          severity:
            "warning",

          service:
            "checkout-api",

          namespace:
            "production",
        },

        annotations: {
          summary:
            "Checkout errors increased",

          description:
            "Checkout error rate is above 5%",
        },

        startsAt:
          new Date(
            Date.now() -
            2 * 60 * 1000
          ).toISOString(),

        endsAt:
          "0001-01-01T00:00:00Z",

        generatorURL:
          "https://grafana.example.com/alerting/grafana/test-2/view",

        fingerprint:
          "grafana-checkout-errors-001",

        dashboardURL:
          "https://grafana.example.com/d/checkout",

        panelURL:
          "https://grafana.example.com/d/checkout?viewPanel=7",

        values: {
          A:
            0.08,
        },
      },
    ],
  };

  // ==========================================================================
  // FIRING TEST
  // ==========================================================================

  const firingResult =
    await webhookIngestionService
      .ingestEvent(
        registration
          .source
          .sourceId,

        registration
          .apiKey,

        firingPayload,

        {}
      );

  console.log(
    "\n[grafana-test] FIRING RESULT"
  );

  console.log({
    accepted:
      firingResult
        .accepted,

    duplicates:
      firingResult
        .duplicates,

    events:
      firingResult
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

        firingPayload,

        {}
      );

  console.log(
    "\n[grafana-test] DUPLICATE RESULT"
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
  // RESOLVED TEST
  // ==========================================================================
  //
  // Same fingerprint, different state.
  //
  // This verifies firing/resolved lifecycle events
  // remain distinct.
  // ==========================================================================

  const resolvedPayload = {
    ...firingPayload,

    status:
      "resolved",

    state:
      "ok",

    title:
      "[RESOLVED] AIRA Grafana Test",

    alerts: [
      {
        ...firingPayload
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
    "\n[grafana-test] RESOLVED RESULT"
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
  // DATABASE VERIFICATION
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
    "\n[grafana-test] DATABASE EVENTS"
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
    firingResult
      .accepted !==
    2
  ) {
    throw new Error(
      `Expected 2 Grafana firing events, received ${firingResult.accepted}`
    );
  }

  if (
    firingResult
      .duplicates !==
    0
  ) {
    throw new Error(
      "Unexpected duplicate during first Grafana ingestion"
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
      "Grafana duplicate protection failed"
    );
  }

  if (
    resolvedResult
      .accepted !==
    1
  ) {
    throw new Error(
      "Grafana resolved event was not persisted"
    );
  }

  if (
    storedEvents.length !==
    3
  ) {
    throw new Error(
      `Expected 3 stored Grafana events, found ${storedEvents.length}`
    );
  }

  const firingEvent =
    storedEvents.find(
      (event) =>
        event
          .providerEventId ===
          "grafana-db-latency-001" &&
        event
          .providerStatus ===
          "open"
    );

  const resolvedEvent =
    storedEvents.find(
      (event) =>
        event
          .providerEventId ===
          "grafana-db-latency-001" &&
        event
          .providerStatus ===
          "resolved"
    );

  if (
    !firingEvent
  ) {
    throw new Error(
      "Grafana firing event not found"
    );
  }

  if (
    !resolvedEvent
  ) {
    throw new Error(
      "Grafana resolved event not found"
    );
  }

  if (
    firingEvent
      .eventId ===
    resolvedEvent
      .eventId
  ) {
    throw new Error(
      "Grafana firing and resolved events incorrectly share the same eventId"
    );
  }

  if (
    firingEvent
      .alert
      ?.severity !==
    "critical"
  ) {
    throw new Error(
      "Grafana critical severity normalization failed"
    );
  }

  const checkoutEvent =
    storedEvents.find(
      (event) =>
        event
          .providerEventId ===
        "grafana-checkout-errors-001"
    );

  if (
    !checkoutEvent
  ) {
    throw new Error(
      "Grafana checkout event not found"
    );
  }

  if (
    checkoutEvent
      .alert
      ?.severity !==
    "medium"
  ) {
    throw new Error(
      `Expected Grafana warning severity to normalize to medium, received ${checkoutEvent.alert?.severity}`
    );
  }

  console.log(
    "\n✅ GRAFANA ALERTING CONNECTOR PASSED"
  );

  // ==========================================================================
  // CLEANUP
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
        "\n❌ GRAFANA CONNECTOR TEST FAILED"
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