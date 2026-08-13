"use strict";

const {
  ClientSecretCredential,
  DefaultAzureCredential,
} =
  require(
    "@azure/identity"
  );

const {
  MetricsQueryClient,
  LogsQueryClient,
} =
  require(
    "@azure/monitor-query"
  );

const {
  ResourceManagementClient,
} =
  require(
    "@azure/arm-resources"
  );

const {
  makeStubAdapter,
} =
  require(
    "../adapterInterface"
  );

const PROVIDER =
  "azure_monitor";

const CAPABILITIES = [
  "receive_events",
  "normalize_events",
  "get_health",
  "discover_resources",
  "query_metrics",
  "query_logs",
  "revoke",
];

const adapter = {
  ...makeStubAdapter(
    PROVIDER,
    CAPABILITIES
  ),

  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  async validateConfiguration(
    config = {}
  ) {
    const errors = [];

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
          "Configuration must be an object",
        ],
      };
    }

    if (
      !config.subscriptionId
    ) {
      errors.push(
        "subscriptionId is required"
      );
    }

    if (
      config.authMode &&
      ![
        "service_principal",
        "default_credential",
      ].includes(
        config.authMode
      )
    ) {
      errors.push(
        'authMode must be "service_principal" or "default_credential"'
      );
    }

    if (
      config.defaultResourceId !==
        undefined &&
      (
        typeof config
          .defaultResourceId !==
          "string" ||
        !config
          .defaultResourceId
          .trim()
      )
    ) {
      errors.push(
        "defaultResourceId must be a non-empty string"
      );
    }

    if (
      config.defaultWorkspaceId !==
        undefined &&
      (
        typeof config
          .defaultWorkspaceId !==
          "string" ||
        !config
          .defaultWorkspaceId
          .trim()
      )
    ) {
      errors.push(
        "defaultWorkspaceId must be a non-empty string"
      );
    }

    return {
      valid:
        errors.length ===
        0,

      errors,
    };
  },

  // ==========================================================================
  // TEST CONNECTION
  // ==========================================================================

  async testConnection(
    connection
  ) {
    const startedAt =
      Date.now();

    try {
      const {
        credential,
      } =
        buildAzureContext(
          connection
        );

      /*
       * Token acquisition validates the configured Azure
       * identity without requiring any particular resource.
       */
      const token =
        await credential
          .getToken(
            "https://management.azure.com/.default"
          );

      if (
        !token ||
        !token.token
      ) {
        throw new Error(
          "Azure credential did not return an access token"
        );
      }

      return {
        success:
          true,

        provider:
          PROVIDER,

        latencyMs:
          Date.now() -
          startedAt,

        detail:
          "Azure credentials validated successfully",
      };
    } catch (
      error
    ) {
      return {
        success:
          false,

        provider:
          PROVIDER,

        latencyMs:
          Date.now() -
          startedAt,

        detail:
          error.message,

        code:
          error.code ||
          "AZURE_CONNECTION_FAILED",
      };
    }
  },

  // ==========================================================================
  // HEALTH
  // ==========================================================================

  async getHealth(
    connection
  ) {
    const result =
      await this
        .testConnection(
          connection
        );

    return {
      status:
        result.success
          ? "healthy"
          : "unhealthy",

      latencyMs:
        result.latencyMs,

      detail:
        result.detail,

      provider:
        PROVIDER,
    };
  },

  // ==========================================================================
  // ALERT INGESTION
  // ==========================================================================

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
    const data =
      raw?.data ||
      raw ||
      {};

    const essentials =
      data.essentials ||
      {};

    const alertContext =
      data.alertContext ||
      {};

    const monitorCondition =
      String(
        essentials
          .monitorCondition ||
        alertContext
          .condition ||
        "unknown"
      )
        .trim()
        .toLowerCase();

    const status =
      normalizeCondition(
        monitorCondition
      );

    const targetResource =
      Array.isArray(
        essentials
          .alertTargetIDs
      )
        ? essentials
            .alertTargetIDs[0] ||
          null
        : essentials
            .targetResource ||
          null;

    return {
      provider:
        PROVIDER,

      externalEventId:
        essentials
          .alertId ||
        raw?.id ||
        null,

      eventType:
        `alert.${status}`,

      title:
        essentials
          .alertRule ||
        essentials
          .signalType ||
        "Azure Monitor alert",

      severity:
        normalizeSeverity(
          essentials
            .severity
        ),

      service:
        essentials
          .targetResourceType ||
        null,

      status,

      labels: {
        signalType:
          essentials
            .signalType ||
          null,

        monitorService:
          essentials
            .monitoringService ||
          null,

        resource:
          targetResource,

        resourceGroup:
          essentials
            .targetResourceGroup ||
          null,
      },

      annotations: {
        description:
          essentials
            .description ||
          null,

        firedDateTime:
          essentials
            .firedDateTime ||
          null,

        resolvedDateTime:
          essentials
            .resolvedDateTime ||
          null,

        alertContext,
      },

      fingerprint:
        essentials
          .alertId ||
        null,

      startsAt:
        essentials
          .firedDateTime ||
        null,

      endsAt:
        essentials
          .resolvedDateTime ||
        null,

      rawPayload:
        raw,

      receivedAt:
        new Date()
          .toISOString(),
    };
  },

  // ==========================================================================
  // METRICS
  // ==========================================================================

  async queryMetrics(
    connection,
    query = {}
  ) {
    const {
      credential,
    } =
      buildAzureContext(
        connection
      );

    const resourceId =
      query.resourceId ||
      connection
        .nonSecretConfig
        ?.defaultResourceId;

    if (!resourceId) {
      throw Object.assign(
        new Error(
          "Azure resourceId is required"
        ),
        {
          code:
            "AZURE_RESOURCE_ID_REQUIRED",
        }
      );
    }

    const metricNames =
      Array.isArray(
        query.metricNames
      )
        ? query.metricNames
        : [];

    if (
      metricNames.length ===
      0
    ) {
      throw Object.assign(
        new Error(
          "metricNames is required"
        ),
        {
          code:
            "AZURE_METRIC_NAMES_REQUIRED",
        }
      );
    }

    const metricsClient =
      new MetricsQueryClient(
        credential
      );

    const endTime =
      new Date(
        query.endTime ||
        Date.now()
      );

    const startTime =
      new Date(
        query.startTime ||
        endTime.getTime() -
          15 *
          60 *
          1000
      );

    return metricsClient
      .queryResource(
        resourceId,
        metricNames,
        {
          timespan: {
            startTime,

            endTime,
          },

          ...(query.aggregation
            ? {
                aggregation:
                  query.aggregation,
              }
            : {}),

          ...(query.filter
            ? {
                filter:
                  query.filter,
              }
            : {}),

          ...(query.interval
            ? {
                interval:
                  query.interval,
              }
            : {}),
        }
      );
  },

  // ==========================================================================
  // LOGS
  // ==========================================================================

  async queryLogs(
    connection,
    query = {}
  ) {
    const {
      credential,
    } =
      buildAzureContext(
        connection
      );

    const workspaceId =
      query.workspaceId ||
      connection
        .nonSecretConfig
        ?.defaultWorkspaceId;

    if (!workspaceId) {
      throw Object.assign(
        new Error(
          "Azure Log Analytics workspaceId is required"
        ),
        {
          code:
            "AZURE_WORKSPACE_ID_REQUIRED",
        }
      );
    }

    if (
      !query.query ||
      typeof query.query !==
        "string"
    ) {
      throw Object.assign(
        new Error(
          "Azure Log Analytics query is required"
        ),
        {
          code:
            "AZURE_LOG_QUERY_REQUIRED",
        }
      );
    }

    const logsClient =
      new LogsQueryClient(
        credential
      );

    const endTime =
      new Date(
        query.endTime ||
        Date.now()
      );

    const startTime =
      new Date(
        query.startTime ||
        endTime.getTime() -
          15 *
          60 *
          1000
      );

    return logsClient
      .queryWorkspace(
        workspaceId,
        query.query,
        {
          startTime,

          endTime,
        },
        {
          includeStatistics:
            Boolean(
              query
                .includeStatistics
            ),

          includeVisualization:
            Boolean(
              query
                .includeVisualization
            ),
        }
      );
  },

  // ==========================================================================
  // RESOURCE DISCOVERY
  // ==========================================================================

  async discoverResources(
    connection,
    options = {}
  ) {
    const {
      credential,
      subscriptionId,
    } =
      buildAzureContext(
        connection
      );

    const client =
      new ResourceManagementClient(
        credential,
        subscriptionId
      );

    const resources = [];

    const limit =
      Math.min(
        Math.max(
          Number.parseInt(
            options.limit,
            10
          ) ||
          250,
          1
        ),
        1000
      );

    for await (
      const resource
      of client.resources
        .list()
    ) {
      resources.push({
        id:
          resource.id ||
          null,

        name:
          resource.name ||
          null,

        type:
          resource.type ||
          null,

        location:
          resource.location ||
          null,

        kind:
          resource.kind ||
          null,

        tags:
          resource.tags ||
          {},

        managedBy:
          resource.managedBy ||
          null,
      });

      if (
        resources.length >=
        limit
      ) {
        break;
      }
    }

    return {
      provider:
        PROVIDER,

      resources,

      count:
        resources.length,
    };
  },

  // ==========================================================================
  // REVOCATION
  // ==========================================================================

  async revoke(
    _connection
  ) {
    /*
     * AIRA does not own Azure service-principal credentials.
     *
     * Removing the integration prevents further usage.
     */
    return {
      success:
        true,

      remoteRevocationRequired:
        false,
    };
  },
};

// ============================================================================
// AZURE CONTEXT
// ============================================================================

function buildAzureContext(
  connection
) {
  if (!connection) {
    throw Object.assign(
      new Error(
        "Azure integration connection is required"
      ),
      {
        code:
          "AZURE_CONNECTION_REQUIRED",
      }
    );
  }

  const config =
    connection
      .nonSecretConfig ||
    {};

  const subscriptionId =
    config.subscriptionId;

  if (!subscriptionId) {
    throw Object.assign(
      new Error(
        "Azure subscriptionId is required"
      ),
      {
        code:
          "AZURE_SUBSCRIPTION_ID_REQUIRED",
      }
    );
  }

  const authMode =
    config.authMode ||
    "service_principal";

  let credential;

  if (
    authMode ===
    "default_credential"
  ) {
    credential =
      new DefaultAzureCredential();
  } else {
    let secret;

    try {
      secret =
        JSON.parse(
          connection
            ._decryptedSecret ||
          "{}"
        );
    } catch {
      throw Object.assign(
        new Error(
          "Azure integration secret must be JSON"
        ),
        {
          code:
            "AZURE_SECRET_INVALID",
        }
      );
    }

    if (
      !secret.tenantId ||
      !secret.clientId ||
      !secret.clientSecret
    ) {
      throw Object.assign(
        new Error(
          "Azure tenantId, clientId and clientSecret are required"
        ),
        {
          code:
            "AZURE_CREDENTIALS_MISSING",
        }
      );
    }

    credential =
      new ClientSecretCredential(
        secret.tenantId,
        secret.clientId,
        secret.clientSecret
      );
  }

  return {
    credential,

    subscriptionId,
  };
}

// ============================================================================
// NORMALIZATION HELPERS
// ============================================================================

function normalizeCondition(
  value
) {
  const normalized =
    String(
      value ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    [
      "fired",
      "activated",
      "active",
      "alert",
      "true",
    ].includes(
      normalized
    )
  ) {
    return "open";
  }

  if (
    [
      "resolved",
      "deactivated",
      "inactive",
      "closed",
      "false",
    ].includes(
      normalized
    )
  ) {
    return "resolved";
  }

  return "unknown";
}

function normalizeSeverity(
  severity
) {
  const value =
    String(
      severity ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    [
      "sev0",
      "sev1",
      "critical",
    ].includes(
      value
    )
  ) {
    return "critical";
  }

  if (
    [
      "sev2",
      "sev3",
      "warning",
      "warn",
    ].includes(
      value
    )
  ) {
    return "warning";
  }

  return "info";
}

module.exports =
  adapter;