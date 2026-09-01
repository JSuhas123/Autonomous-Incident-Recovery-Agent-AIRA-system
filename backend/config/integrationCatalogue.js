"use strict";

const {
  INTEGRATION_CAPABILITIES,
} =
  require(
    "../constants/integrationPlatform"
  );

/**
 * Canonical AIRA integration catalogue.
 *
 * availabilityStatus:
 *
 * available
 *   Adapter/backend implementation exists and may be used.
 *
 * beta
 *   Partial implementation or connector currently under development.
 *
 * coming_soon
 *   Product contract is defined, but runtime adapter is not ready.
 *
 * IMPORTANT:
 *
 * - "available" providers MUST have a registered adapter.
 * - Available provider capabilities MUST match adapter capabilities.
 * - "coming_soon" capabilities describe the intended connector contract.
 * - Never mark a provider available merely because it appears in the UI.
 */

// ============================================================================
// CATEGORIES
// ============================================================================

const CATEGORIES =
  Object.freeze({
    MONITORING:
      "monitoring_alerting",

    TELEMETRY:
      "telemetry_observability",

    CLOUD:
      "cloud",

    INFRA:
      "infrastructure",

    INCIDENT:
      "incident_management",

    COMMS:
      "communication",

    DATA:
      "databases_queues",

    DEV:
      "developer_tools",

    CUSTOM:
      "custom",
  });

// ============================================================================
// AVAILABILITY
// ============================================================================

const AVAILABILITY_STATUSES =
  Object.freeze([
    "available",
    "beta",
    "coming_soon",
  ]);

// ============================================================================
// CATALOGUE
// ============================================================================

const CATALOGUE = [

  // ==========================================================================
  // GENERIC WEBHOOKS
  // ==========================================================================

  {
    provider:
      "webhook_incoming",

    displayName:
      "Generic Incoming Webhook",

    category:
      CATEGORIES.CUSTOM,

    description:
      "Receive signed events from external systems and normalize them into AIRA operational signals.",

    capabilities: [
      "receive_events",
      "normalize_events",
    ],

    availabilityStatus:
      "available",

    documentationUrl:
      null,

    icon:
      "webhook",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "webhook_outgoing",

    displayName:
      "Generic Outgoing Webhook",

    category:
      CATEGORIES.CUSTOM,

    description:
      "Send AIRA operational, incident, recovery and automation notifications to external HTTP endpoints.",

    capabilities: [
      "send_notifications",
    ],

    availabilityStatus:
      "available",

    documentationUrl:
      null,

    icon:
      "webhook",

    configSchemaVersion:
      1,
  },

  // ==========================================================================
  // MONITORING / ALERTING
  // ==========================================================================

  {
    provider:
      "prometheus_alertmanager",

    displayName:
      "Prometheus Alertmanager",

    category:
      CATEGORIES.MONITORING,

    description:
      "Receive firing and resolved Alertmanager notifications and normalize them into AIRA operational events.",

    capabilities: [
      "receive_events",
      "normalize_events",
    ],

    availabilityStatus:
      "available",

    documentationUrl:
      "https://prometheus.io/docs/alerting/latest/alertmanager/",

    icon:
      "prometheus",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "grafana_alerting",

    displayName:
      "Grafana Alerting",

    category:
      CATEGORIES.MONITORING,

    description:
      "Receive Grafana unified alerting notifications and normalize firing and resolved alerts into AIRA signals.",

    capabilities: [
      "receive_events",
      "normalize_events",
    ],

    availabilityStatus:
      "available",

    documentationUrl:
      "https://grafana.com/docs/grafana/latest/alerting/",

    icon:
      "grafana",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "datadog",

    displayName:
      "Datadog",

    category:
      CATEGORIES.MONITORING,

    description:
      "Integrate Datadog monitors, events, metrics, logs and APM telemetry with AIRA.",

    capabilities: [
      "receive_events",
      "normalize_events",
      "send_notifications",
      "get_health",
      "query_metrics",
      "query_logs",
      "query_traces",
      "revoke",
    ],

    /*
     * Keep beta until datadogAdapter is implemented
     * and passes connector validation.
     */
    availabilityStatus:
      "beta",

    documentationUrl:
      "https://docs.datadoghq.com/integrations/webhooks/",

    icon:
      "datadog",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "newrelic",

    displayName:
      "New Relic",

    category:
      CATEGORIES.MONITORING,

    description:
      "Integrate New Relic alerts, metrics, logs and distributed tracing signals with AIRA.",

    capabilities: [
      "receive_events",
      "normalize_events",
      "get_health",
      "query_metrics",
      "query_logs",
      "query_traces",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "newrelic",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "sentry",

    displayName:
      "Sentry",

    category:
      CATEGORIES.MONITORING,

    description:
      "Receive application errors, issue events and alerts from Sentry for AIRA incident analysis.",

    capabilities: [
      "receive_events",
      "normalize_events",
      "get_health",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "sentry",

    configSchemaVersion:
      1,
  },

  // ==========================================================================
  // TELEMETRY / OBSERVABILITY
  // ==========================================================================

  {
    provider:
      "opentelemetry",

    displayName:
      "OpenTelemetry Collector",

    category:
      CATEGORIES.TELEMETRY,

    description:
      "Ingest and query OpenTelemetry logs, metrics and traces through AIRA's OTLP HTTP/JSON telemetry connector.",

    capabilities: [
      "receive_events",
      "normalize_events",
      "get_health",
      "query_metrics",
      "query_logs",
      "query_traces",
      "revoke",
    ],

    availabilityStatus:
      "available",

    documentationUrl:
      "https://opentelemetry.io/docs/collector/",

    icon:
      "opentelemetry",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "elastic",

    displayName:
      "Elastic Observability",

    category:
      CATEGORIES.TELEMETRY,

    description:
      "Integrate Elastic alerts, logs, metrics and observability data with AIRA.",

    capabilities: [
      "receive_events",
      "normalize_events",
      "get_health",
      "query_metrics",
      "query_logs",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "elastic",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "splunk",

    displayName:
      "Splunk",

    category:
      CATEGORIES.TELEMETRY,

    description:
      "Integrate Splunk notable events, alerts and searchable operational logs with AIRA.",

    capabilities: [
      "receive_events",
      "normalize_events",
      "get_health",
      "query_logs",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "splunk",

    configSchemaVersion:
      1,
  },

  // ==========================================================================
  // INFRASTRUCTURE
  // ==========================================================================

  {
    provider:
      "kubernetes",

    displayName:
      "Kubernetes",

    category:
      CATEGORIES.INFRA,

    description:
      "Connect Kubernetes clusters for health checking, infrastructure discovery, inventory, topology analysis, and tightly authorized operational capabilities.",

    /*
     * Kubernetes event ingestion is intentionally NOT advertised yet.
     *
     * execute_capability is a TECHNICAL capability only.
     *
     * It does not grant execution authority.
     *
     * Execution still requires:
     *
     * Recovery Decision
     *   ->
     * Policy / Approval
     *   ->
     * ExecutionAuthorizationEngine
     *   ->
     * immutable persisted execution request
     *   ->
     * IntegrationExecutionAuthorizationBoundary
     *   ->
     * IntegrationRuntime
     *   ->
     * Kubernetes adapter
     */
    capabilities: [
      "get_health",
      "discover_resources",
      "execute_capability",
      "revoke",
    ],

    availabilityStatus:
      "available",

    documentationUrl:
      null,

    icon:
      "kubernetes",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "docker",

    displayName:
      "Docker",

    category:
      CATEGORIES.INFRA,

    description:
      "Discover Docker containers, monitor container health and ingest container lifecycle events.",

    capabilities: [
      "receive_events",
      "normalize_events",
      "get_health",
      "discover_resources",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "docker",

    configSchemaVersion:
      1,
  },

  // ==========================================================================
  // CLOUD PROVIDERS
  // ==========================================================================

  {
    provider:
      "aws_cloudwatch",

    displayName:
      "AWS CloudWatch",

    category:
      CATEGORIES.CLOUD,

    description:
      "Receive CloudWatch alarms and AWS operational events, query metrics and logs, and discover supported AWS resources.",

    capabilities: [
      "receive_events",
      "normalize_events",
      "get_health",
      "discover_resources",
      "query_metrics",
      "query_logs",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "aws",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "azure_monitor",

    displayName:
      "Azure Monitor",

    category:
      CATEGORIES.CLOUD,

    description:
      "Receive Azure Monitor alerts, query Azure operational telemetry and discover supported Azure resources.",

    capabilities: [
      "receive_events",
      "normalize_events",
      "get_health",
      "discover_resources",
      "query_metrics",
      "query_logs",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "azure",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "gcp_monitoring",

    displayName:
      "Google Cloud Monitoring",

    category:
      CATEGORIES.CLOUD,

    description:
      "Receive Google Cloud incidents and alerts, query operational telemetry and discover supported GCP resources.",

    capabilities: [
      "receive_events",
      "normalize_events",
      "get_health",
      "discover_resources",
      "query_metrics",
      "query_logs",
      "query_traces",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "gcp",

    configSchemaVersion:
      1,
  },

  // ==========================================================================
  // INCIDENT MANAGEMENT
  // ==========================================================================

  {
    provider:
      "pagerduty",

    displayName:
      "PagerDuty",

    category:
      CATEGORIES.INCIDENT,

    description:
      "Receive PagerDuty incidents and send incident lifecycle updates from AIRA.",

    capabilities: [
      "receive_events",
      "normalize_events",
      "send_notifications",
      "get_health",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "pagerduty",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "opsgenie",

    displayName:
      "Opsgenie",

    category:
      CATEGORIES.INCIDENT,

    description:
      "Receive Opsgenie alerts and send AIRA incident and recovery notifications.",

    capabilities: [
      "receive_events",
      "normalize_events",
      "send_notifications",
      "get_health",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "opsgenie",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "servicenow",

    displayName:
      "ServiceNow",

    category:
      CATEGORIES.INCIDENT,

    description:
      "Synchronize incidents and operational notifications between ServiceNow and AIRA.",

    capabilities: [
      "receive_events",
      "normalize_events",
      "send_notifications",
      "get_health",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "servicenow",

    configSchemaVersion:
      1,
  },

  // ==========================================================================
  // COMMUNICATION
  // ==========================================================================

  {
    provider:
      "slack",

    displayName:
      "Slack",

    category:
      CATEGORIES.COMMS,

    description:
      "Send AIRA incident alerts, approval requests, recovery results and operational notifications to Slack.",

    capabilities: [
      "send_notifications",
      "get_health",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "slack",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "msteams",

    displayName:
      "Microsoft Teams",

    category:
      CATEGORIES.COMMS,

    description:
      "Send incident cards, approvals and operational notifications to Microsoft Teams.",

    capabilities: [
      "send_notifications",
      "get_health",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "msteams",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "email",

    displayName:
      "Email",

    category:
      CATEGORIES.COMMS,

    description:
      "Send incident, approval, escalation and recovery notifications through email.",

    capabilities: [
      "send_notifications",
      "get_health",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "email",

    configSchemaVersion:
      1,
  },

  // ==========================================================================
  // DATABASES
  // ==========================================================================

  {
    provider:
      "postgresql",

    displayName:
      "PostgreSQL",

    category:
      CATEGORIES.DATA,

    description:
      "Monitor PostgreSQL availability, connections, replication and operational performance.",

    capabilities: [
      "get_health",
      "discover_resources",
      "query_metrics",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "postgresql",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "mysql",

    displayName:
      "MySQL",

    category:
      CATEGORIES.DATA,

    description:
      "Monitor MySQL health, replication, connections and performance metrics.",

    capabilities: [
      "get_health",
      "discover_resources",
      "query_metrics",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "mysql",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "mongodb_integration",

    displayName:
      "MongoDB",

    category:
      CATEGORIES.DATA,

    description:
      "Monitor MongoDB cluster health, replication, connections and operational metrics.",

    capabilities: [
      "get_health",
      "discover_resources",
      "query_metrics",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "mongodb",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "redis_integration",

    displayName:
      "Redis",

    category:
      CATEGORIES.DATA,

    description:
      "Monitor Redis availability, memory utilization, replication and key operational metrics.",

    capabilities: [
      "get_health",
      "discover_resources",
      "query_metrics",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "redis",

    configSchemaVersion:
      1,
  },

  // ==========================================================================
  // MESSAGING / STREAMING
  // ==========================================================================

  {
    provider:
      "rabbitmq",

    displayName:
      "RabbitMQ",

    category:
      CATEGORIES.DATA,

    description:
      "Monitor RabbitMQ brokers, exchanges, queues and consumers and ingest messaging health events.",

    capabilities: [
      "receive_events",
      "normalize_events",
      "get_health",
      "discover_resources",
      "query_metrics",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "rabbitmq",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "kafka",

    displayName:
      "Kafka",

    category:
      CATEGORIES.DATA,

    description:
      "Monitor Kafka brokers, topics, partitions and consumer groups and ingest messaging health events.",

    capabilities: [
      "receive_events",
      "normalize_events",
      "get_health",
      "discover_resources",
      "query_metrics",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "kafka",

    configSchemaVersion:
      1,
  },

  // ==========================================================================
  // CI/CD + DELIVERY
  // ==========================================================================

  {
    provider:
      "github_actions",

    displayName:
      "GitHub Actions",

    category:
      CATEGORIES.DEV,

    description:
      "Receive workflow, deployment and failure events from GitHub Actions.",

    capabilities: [
      "receive_events",
      "normalize_events",
      "get_health",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "github",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "gitlab_ci",

    displayName:
      "GitLab CI",

    category:
      CATEGORIES.DEV,

    description:
      "Receive GitLab pipeline, deployment and failure events for incident correlation.",

    capabilities: [
      "receive_events",
      "normalize_events",
      "get_health",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "gitlab",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "jenkins",

    displayName:
      "Jenkins",

    category:
      CATEGORIES.DEV,

    description:
      "Receive Jenkins build, deployment and failure events for AIRA incident correlation.",

    capabilities: [
      "receive_events",
      "normalize_events",
      "get_health",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "jenkins",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "argocd",

    displayName:
      "Argo CD",

    category:
      CATEGORIES.DEV,

    description:
      "Receive Argo CD synchronization, deployment and degraded application events.",

    capabilities: [
      "receive_events",
      "normalize_events",
      "get_health",
      "discover_resources",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      null,

    icon:
      "argocd",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "tekton",

    displayName:
      "Tekton",

    category:
      CATEGORIES.DEV,

    description:
      "Integrate Tekton PipelineRuns, TaskRuns, build status and deployment pipeline events with AIRA.",

    capabilities: [
      "receive_events",
      "normalize_events",
      "get_health",
      "discover_resources",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      "https://tekton.dev/docs/",

    icon:
      "tekton",

    configSchemaVersion:
      1,
  },

  {
    provider:
      "terraform",

    displayName:
      "Terraform",

    category:
      CATEGORIES.INFRA,

    description:
      "Integrate Terraform infrastructure state, resource discovery and infrastructure change evidence with AIRA.",

    capabilities: [
      "get_health",
      "discover_resources",
      "discover_relationships",
      "get_changes",
      "revoke",
    ],

    availabilityStatus:
      "coming_soon",

    documentationUrl:
      "https://developer.hashicorp.com/terraform/docs",

    icon:
      "terraform",

    configSchemaVersion:
      1,
  },
];

// ============================================================================
// VALIDATION
// ============================================================================

function validateCatalogue() {
  const errors = [];

  const providers =
    new Set();

  for (
    const definition
    of CATALOGUE
  ) {
    if (
      !definition.provider ||
      typeof definition.provider !==
        "string"
    ) {
      errors.push(
        "Integration definition is missing a valid provider"
      );

      continue;
    }


    if (
      definition.provider !==
      definition.provider
        .trim()
        .toLowerCase()
    ) {
      errors.push(
        `Provider must use canonical lowercase form: "${definition.provider}"`
      );
    }


    if (
      providers.has(
        definition.provider
      )
    ) {
      errors.push(
        `Duplicate integration provider: ${definition.provider}`
      );
    }


    providers.add(
      definition.provider
    );


    if (
      !definition.displayName ||
      typeof definition.displayName !==
        "string"
    ) {
      errors.push(
        `Provider "${definition.provider}" is missing displayName`
      );
    }


    if (
      !Object.values(
        CATEGORIES
      ).includes(
        definition.category
      )
    ) {
      errors.push(
        `Invalid category for provider "${definition.provider}"`
      );
    }


    if (
      !AVAILABILITY_STATUSES
        .includes(
          definition
            .availabilityStatus
        )
    ) {
      errors.push(
        `Invalid availabilityStatus for provider "${definition.provider}"`
      );
    }


    if (
      !Array.isArray(
        definition.capabilities
      )
    ) {
      errors.push(
        `Capabilities must be an array for provider "${definition.provider}"`
      );

      continue;
    }


    if (
      definition
        .capabilities
        .length ===
      0
    ) {
      errors.push(
        `Provider "${definition.provider}" must advertise at least one capability`
      );
    }


    const seenCapabilities =
      new Set();


    for (
      const capability
      of definition.capabilities
    ) {
      if (
        !INTEGRATION_CAPABILITIES
          .includes(
            capability
          )
      ) {
        errors.push(
          `Unknown capability "${capability}" for provider "${definition.provider}"`
        );
      }


      if (
        seenCapabilities.has(
          capability
        )
      ) {
        errors.push(
          `Duplicate capability "${capability}" for provider "${definition.provider}"`
        );
      }


      seenCapabilities.add(
        capability
      );
    }


    if (
      !Number.isInteger(
        definition
          .configSchemaVersion
      ) ||
      definition
        .configSchemaVersion <
        1
    ) {
      errors.push(
        `Invalid configSchemaVersion for provider "${definition.provider}"`
      );
    }
  }


  return {
    valid:
      errors.length ===
      0,

    errors,

    providerCount:
      CATALOGUE.length,
  };
}

// ============================================================================
// LOOKUP SETS
// ============================================================================

const AVAILABLE_PROVIDERS =
  new Set(
    CATALOGUE
      .filter(
        definition =>
          definition
            .availabilityStatus ===
          "available"
      )
      .map(
        definition =>
          definition.provider
      )
  );


const BETA_PROVIDERS =
  new Set(
    CATALOGUE
      .filter(
        definition =>
          definition
            .availabilityStatus ===
          "beta"
      )
      .map(
        definition =>
          definition.provider
      )
  );


const COMING_SOON_PROVIDERS =
  new Set(
    CATALOGUE
      .filter(
        definition =>
          definition
            .availabilityStatus ===
          "coming_soon"
      )
      .map(
        definition =>
          definition.provider
      )
  );

// ============================================================================
// LOOKUPS
// ============================================================================

function findDefinition(
  provider
) {
  if (
    !provider ||
    typeof provider !==
      "string"
  ) {
    return null;
  }


  const normalized =
    provider
      .trim()
      .toLowerCase();


  return (
    CATALOGUE.find(
      definition =>
        definition.provider ===
        normalized
    ) ||
    null
  );
}


function isAvailable(
  provider
) {
  return Boolean(
    findDefinition(
      provider
    )
      ?.availabilityStatus ===
    "available"
  );
}


function isBeta(
  provider
) {
  return Boolean(
    findDefinition(
      provider
    )
      ?.availabilityStatus ===
    "beta"
  );
}


function isComingSoon(
  provider
) {
  return Boolean(
    findDefinition(
      provider
    )
      ?.availabilityStatus ===
    "coming_soon"
  );
}


function getByCategory(
  category
) {
  return CATALOGUE
    .filter(
      definition =>
        definition.category ===
        category
    );
}


function getAvailableDefinitions() {
  return CATALOGUE
    .filter(
      definition =>
        definition
          .availabilityStatus ===
        "available"
    );
}


function getBetaDefinitions() {
  return CATALOGUE
    .filter(
      definition =>
        definition
          .availabilityStatus ===
        "beta"
    );
}


function getComingSoonDefinitions() {
  return CATALOGUE
    .filter(
      definition =>
        definition
          .availabilityStatus ===
        "coming_soon"
    );
}


function getProvidersByCapability(
  capability,
  {
    availabilityStatus =
      null,
  } = {}
) {
  if (
    !INTEGRATION_CAPABILITIES
      .includes(
        capability
      )
  ) {
    return [];
  }


  return CATALOGUE
    .filter(
      definition => {
        if (
          !definition
            .capabilities
            .includes(
              capability
            )
        ) {
          return false;
        }


        if (
          availabilityStatus &&
          definition
            .availabilityStatus !==
          availabilityStatus
        ) {
          return false;
        }


        return true;
      }
    );
}

// ============================================================================
// STARTUP ASSERTION
// ============================================================================

function assertCatalogueValid() {
  const result =
    validateCatalogue();


  if (
    !result.valid
  ) {
    throw Object.assign(
      new Error(
        `Integration catalogue is invalid: ${result.errors.join(
          "; "
        )}`
      ),
      {
        code:
          "INTEGRATION_CATALOGUE_INVALID",

        errors:
          result.errors,
      }
    );
  }


  return result;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  CATALOGUE,

  CATEGORIES,

  AVAILABILITY_STATUSES,

  INTEGRATION_CAPABILITIES,

  AVAILABLE_PROVIDERS,

  BETA_PROVIDERS,

  COMING_SOON_PROVIDERS,

  findDefinition,

  isAvailable,

  isBeta,

  isComingSoon,

  getByCategory,

  getAvailableDefinitions,

  getBetaDefinitions,

  getComingSoonDefinitions,

  getProvidersByCapability,

  validateCatalogue,

  assertCatalogueValid,
};