"use strict";

const INTEGRATION_SDK_VERSION =
  "20.1-v1";

const INTEGRATION_CONTRACT_VERSION =
  "20.0-v1";


const INTEGRATION_CAPABILITY =
  Object.freeze({
    /*
     * Existing stored capability names are preserved where possible.
     *
     * The Phase 20 SDK method is receiveSignals(), but existing AIRA
     * integration data already uses receive_events.
     */
    RECEIVE_SIGNALS:
      "receive_events",

    NORMALIZE_SIGNALS:
      "normalize_events",

    QUERY_METRICS:
      "query_metrics",

    QUERY_LOGS:
      "query_logs",

    QUERY_TRACES:
      "query_traces",

    DISCOVER_RESOURCES:
      "discover_resources",

    DISCOVER_RELATIONSHIPS:
      "discover_relationships",

    GET_CHANGES:
      "get_changes",

    EXECUTE_CAPABILITY:
      "execute_capability",

    SEND_NOTIFICATION:
      "send_notifications",

    HEALTH_CHECK:
      "get_health",

    REVOKE:
      "revoke",
  });


const INTEGRATION_CAPABILITIES =
  Object.freeze(
    Object.values(
      INTEGRATION_CAPABILITY
    )
  );


const INTEGRATION_OPERATION =
  Object.freeze({
    RECEIVE_SIGNALS:
      "receiveSignals",

    QUERY_METRICS:
      "queryMetrics",

    QUERY_LOGS:
      "queryLogs",

    QUERY_TRACES:
      "queryTraces",

    DISCOVER_RESOURCES:
      "discoverResources",

    DISCOVER_RELATIONSHIPS:
      "discoverRelationships",

    GET_CHANGES:
      "getChanges",

    EXECUTE_CAPABILITY:
      "executeCapability",

    SEND_NOTIFICATION:
      "sendNotification",

    HEALTH_CHECK:
      "healthCheck",
  });


const INTEGRATION_OPERATION_CAPABILITY_MAP =
  Object.freeze({
    receiveSignals:
      INTEGRATION_CAPABILITY
        .RECEIVE_SIGNALS,

    queryMetrics:
      INTEGRATION_CAPABILITY
        .QUERY_METRICS,

    queryLogs:
      INTEGRATION_CAPABILITY
        .QUERY_LOGS,

    queryTraces:
      INTEGRATION_CAPABILITY
        .QUERY_TRACES,

    discoverResources:
      INTEGRATION_CAPABILITY
        .DISCOVER_RESOURCES,

    discoverRelationships:
      INTEGRATION_CAPABILITY
        .DISCOVER_RELATIONSHIPS,

    getChanges:
      INTEGRATION_CAPABILITY
        .GET_CHANGES,

    executeCapability:
      INTEGRATION_CAPABILITY
        .EXECUTE_CAPABILITY,

    sendNotification:
      INTEGRATION_CAPABILITY
        .SEND_NOTIFICATION,

    healthCheck:
      INTEGRATION_CAPABILITY
        .HEALTH_CHECK,
  });


const INTEGRATION_GROUP =
  Object.freeze({
    OBSERVABILITY:
      "OBSERVABILITY",

    CLOUD:
      "CLOUD",

    INCIDENT:
      "INCIDENT",

    COMMUNICATION:
      "COMMUNICATION",

    CI_CD:
      "CI_CD",

    DATA:
      "DATA",

    INFRA:
      "INFRA",

    CUSTOM:
      "CUSTOM",
  });


const INTEGRATION_RESULT_STATUS =
  Object.freeze({
    SUCCESS:
      "SUCCESS",

    PARTIAL:
      "PARTIAL",

    UNAVAILABLE:
      "UNAVAILABLE",

    FAILED:
      "FAILED",

    UNSUPPORTED:
      "UNSUPPORTED",
  });


const INTEGRATION_ERROR_CODE =
  Object.freeze({
    INVALID_CONFIGURATION:
      "INTEGRATION_INVALID_CONFIGURATION",

    CONNECTION_FAILED:
      "INTEGRATION_CONNECTION_FAILED",

    PROVIDER_UNAVAILABLE:
      "INTEGRATION_PROVIDER_UNAVAILABLE",

    RATE_LIMITED:
      "INTEGRATION_RATE_LIMITED",

    TIMEOUT:
      "INTEGRATION_TIMEOUT",

    AUTHENTICATION_FAILED:
      "INTEGRATION_AUTHENTICATION_FAILED",

    AUTHORIZATION_REQUIRED:
      "INTEGRATION_AUTHORIZATION_REQUIRED",

    CAPABILITY_DENIED:
      "INTEGRATION_CAPABILITY_DENIED",

    UNSUPPORTED_OPERATION:
      "UNSUPPORTED_OPERATION",

    INVALID_RESULT:
      "INTEGRATION_INVALID_RESULT",
  });


const CANONICAL_INTEGRATION_AUTHORITIES =
  Object.freeze({
    CONNECTIONS:
      "POSTGRESQL",

    GOVERNANCE:
      "POSTGRESQL",

    RESOURCE_TRUTH:
      "PHASE_17_RESOURCE_GRAPH",

    RECOVERY_KNOWLEDGE:
      "PHASE_18_POSTGRESQL_KNOWLEDGE",

    COVERAGE:
      "PHASE_19_POSTGRESQL_COVERAGE",

    MEMORY:
      "PHASE_16_POSTGRESQL_MEMORY",

    /*
     * Metrics/logs/traces remain in the customer's observability
     * provider unless some later architecture explicitly changes this.
     */
    TELEMETRY:
      "EXTERNAL_PROVIDER",
  });


module.exports = {
  INTEGRATION_SDK_VERSION,

  INTEGRATION_CONTRACT_VERSION,

  INTEGRATION_CAPABILITY,

  INTEGRATION_CAPABILITIES,

  INTEGRATION_OPERATION,

  INTEGRATION_OPERATION_CAPABILITY_MAP,

  INTEGRATION_GROUP,

  INTEGRATION_RESULT_STATUS,

  INTEGRATION_ERROR_CODE,

  CANONICAL_INTEGRATION_AUTHORITIES,
};