"use strict";

const INCIDENT_STATUSES =
  Object.freeze([
    "open",
    "acknowledged",
    "investigating",
    "recovering",
    "resolved",
    "closed",
  ]);

const INCIDENT_SEVERITIES =
  Object.freeze([
    "info",
    "warning",
    "critical",
  ]);

const INCIDENT_SOURCES =
  Object.freeze([
    "monitor",
    "manual",
    "alert",
    "integration",
  ]);

const INCIDENT_DETECTION_METHODS =
  Object.freeze([
    "monitor_transition",
    "single_signal",
    "correlated_signals",
    "cross_provider_correlation",
    "manual",
  ]);

const ACTIVE_INCIDENT_STATUSES =
  Object.freeze([
    "open",
    "acknowledged",
    "investigating",
    "recovering",
  ]);

module.exports = {
  INCIDENT_STATUSES,
  INCIDENT_SEVERITIES,
  INCIDENT_SOURCES,
  INCIDENT_DETECTION_METHODS,
  ACTIVE_INCIDENT_STATUSES,
};