"use strict";

const SIGNAL_TYPES = Object.freeze([
  "alert",
  "log",
  "metric",
  "trace",
  "monitor",
  "event",
  "health",
  "unknown",
]);

const SIGNAL_SEVERITIES = Object.freeze([
  "unknown",
  "info",
  "warning",
  "critical",
]);

const SIGNAL_STATUSES = Object.freeze([
  "received",
  "normalized",
  "enriched",
  "correlated",
  "routed",
  "ignored",
  "failed",
]);

const SIGNAL_SOURCES = Object.freeze([
  "monitor",
  "integration",
  "telemetry",
  "manual",
  "internal",
]);

module.exports = {
  SIGNAL_TYPES,
  SIGNAL_SEVERITIES,
  SIGNAL_STATUSES,
  SIGNAL_SOURCES,
};
