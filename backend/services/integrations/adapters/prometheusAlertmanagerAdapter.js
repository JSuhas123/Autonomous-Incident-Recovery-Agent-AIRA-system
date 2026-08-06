"use strict";

const { makeStubAdapter } = require("../adapterInterface");

/**
 * Prometheus Alertmanager webhook adapter.
 *
 * Accepts Alertmanager webhook POST payloads (v4 format).
 * Non-secret config: {} (no required fields)
 * Secret: optional webhook authentication secret
 */

const STATUS_MAP = { firing: "open", resolved: "resolved" };

const adapter = {
  ...makeStubAdapter("prometheus_alertmanager"),

  async validateConfiguration(_config) {
    return { valid: true, errors: [] };
  },

  async testConnection(_connection) {
    return { success: true, detail: "Prometheus Alertmanager webhook endpoint is ready." };
  },

  async receiveEvent(_connection, rawPayload, _headers) {
    return this.normalizeEvent(rawPayload);
  },

  normalizeEvent(raw) {
    const alerts = Array.isArray(raw.alerts) ? raw.alerts : [];
    return alerts.map((alert) => ({
      provider:   "prometheus_alertmanager",
      eventType:  "alert." + (STATUS_MAP[alert.status] ?? alert.status ?? "unknown"),
      title:      alert.annotations?.summary ?? alert.labels?.alertname ?? "Prometheus alert",
      severity:   _mapSeverity(alert.labels?.severity),
      service:    alert.labels?.service ?? alert.labels?.job ?? null,
      status:     STATUS_MAP[alert.status] ?? alert.status,
      startsAt:   alert.startsAt,
      endsAt:     alert.endsAt,
      labels:     alert.labels,
      annotations: alert.annotations,
      rawPayload: alert,
      receivedAt: new Date().toISOString(),
    }));
  },
};

function _mapSeverity(s) {
  if (!s) return "warning";
  if (s === "critical" || s === "page") return "critical";
  if (s === "warning" || s === "warn")  return "warning";
  return "info";
}

module.exports = adapter;
