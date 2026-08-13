"use strict";

const {
  makeStubAdapter,
} =
  require(
    "../adapterInterface"
  );

const PROVIDER =
  "prometheus_alertmanager";

const CAPABILITIES = [
  "receive_events",
  "normalize_events",
];

const STATUS_MAP =
  Object.freeze({
    firing:
      "open",

    resolved:
      "resolved",
  });

const adapter = {
  ...makeStubAdapter(
    PROVIDER,
    CAPABILITIES
  ),

  async validateConfiguration(
    config = {}
  ) {
    if (
      !config ||
      typeof config !==
        "object" ||
      Array.isArray(
        config
      )
    ) {
      return {
        valid:
          false,

        errors: [
          "config must be an object",
        ],
      };
    }

    return {
      valid:
        true,

      errors: [],
    };
  },

  async testConnection(
    _connection
  ) {
    return {
      success:
        true,

      latencyMs:
        0,

      detail:
        "Prometheus Alertmanager webhook endpoint is ready.",
    };
  },

  async getHealth(
    _connection
  ) {
    return {
      status:
        "healthy",

      detail:
        "Prometheus Alertmanager webhook endpoint is available.",
    };
  },

  async receiveEvent(
    _connection,
    rawPayload,
    _headers = {}
  ) {
    return this
      .normalizeEvent(
        rawPayload
      );
  },

  normalizeEvent(
    raw
  ) {
    const payload =
      raw &&
      typeof raw ===
        "object" &&
      !Array.isArray(
        raw
      )
        ? raw
        : {};

    const alerts =
      Array.isArray(
        payload.alerts
      )
        ? payload.alerts
        : [];

    return alerts.map(
      (alert) => {
        const status =
          STATUS_MAP[
            alert.status
          ] ??
          alert.status ??
          "unknown";

        return {
          provider:
            PROVIDER,

          eventType:
            `alert.${status}`,

          title:
            alert.annotations
              ?.summary ??
            alert.labels
              ?.alertname ??
            "Prometheus alert",

          severity:
            mapSeverity(
              alert.labels
                ?.severity
            ),

          service:
            alert.labels
              ?.service ??
            alert.labels
              ?.job ??
            null,

          status,

          startsAt:
            alert.startsAt ??
            null,

          endsAt:
            alert.endsAt ??
            null,

          labels:
            alert.labels ??
            {},

          annotations:
            alert.annotations ??
            {},

          fingerprint:
            alert.fingerprint ??
            null,

          generatorUrl:
            alert.generatorURL ??
            null,

          groupKey:
            payload.groupKey ??
            null,

          externalUrl:
            payload.externalURL ??
            null,

          rawPayload:
            alert,

          receivedAt:
            new Date()
              .toISOString(),
        };
      }
    );
  },

  async revoke() {
    return {
      success:
        true,

      remoteRevocationRequired:
        false,
    };
  },
};

function mapSeverity(
  severity
) {
  if (!severity) {
    return "warning";
  }

  const normalized =
    String(
      severity
    )
      .trim()
      .toLowerCase();

  if (
    [
      "critical",
      "page",
      "fatal",
      "sev1",
      "p1",
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
      "sev2",
      "sev3",
      "p2",
      "p3",
    ].includes(
      normalized
    )
  ) {
    return "warning";
  }

  return "info";
}

module.exports =
  adapter;