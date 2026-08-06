"use strict";

const { makeStubAdapter } = require("../adapterInterface");

/**
 * Grafana Alerting adapter.
 *
 * Handles Grafana unified alerting webhook payloads (Grafana 8+).
 * Non-secret config: {}
 * Secret: optional webhook authorization token
 */

const STATUS_MAP = { firing: "open", resolved: "resolved", "no_data": "unknown", "ok": "resolved" };

const adapter = {
  ...makeStubAdapter("grafana_alerting"),

  async validateConfiguration(_config) {
    return { valid: true, errors: [] };
  },

  async testConnection(_connection) {
    return { success: true, detail: "Grafana Alerting webhook endpoint is ready." };
  },

  async receiveEvent(_connection, rawPayload, _headers) {
    return this.normalizeEvent(rawPayload);
  },

  normalizeEvent(raw) {
    const alerts = Array.isArray(raw.alerts) ? raw.alerts : [];
    return alerts.map((alert) => ({
      provider:   "grafana_alerting",
      eventType:  "alert." + (STATUS_MAP[alert.status] ?? "unknown"),
      title:      alert.annotations?.summary ?? alert.labels?.alertname ?? "Grafana alert",
      severity:   _mapSeverity(alert.labels?.severity),
      service:    alert.labels?.service ?? null,
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
  if (s === "critical") return "critical";
  if (s === "warning")  return "warning";
  return "info";
}

module.exports = adapter;
