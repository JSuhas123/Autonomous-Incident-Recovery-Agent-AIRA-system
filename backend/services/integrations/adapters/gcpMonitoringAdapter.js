"use strict";

const {
  v3,
} =
  require(
    "@google-cloud/monitoring"
  );

const {
  Logging,
} =
  require(
    "@google-cloud/logging"
  );

const {
  GoogleAuth,
} =
  require(
    "google-auth-library"
  );

const {
  makeStubAdapter,
} =
  require(
    "../adapterInterface"
  );

const PROVIDER =
  "gcp_monitoring";

const CAPABILITIES = [
  "receive_events",
  "normalize_events",
  "get_health",
  "discover_resources",
  "query_metrics",
  "query_logs",
  "query_traces",
  "revoke",
];

const adapter = {
  ...makeStubAdapter(
    PROVIDER,
    CAPABILITIES
  ),

  async validateConfiguration(
    config = {}
  ) {
    const errors = [];

    if (!config.projectId) {
      errors.push(
        "projectId is required"
      );
    }

    return {
      valid:
        errors.length ===
        0,

      errors,
    };
  },

  async testConnection(
    connection
  ) {
    const startedAt =
      Date.now();

    try {
      const {
        monitoringClient,
        projectName,
      } =
        buildGcp(
          connection
        );

      await monitoringClient
        .listMetricDescriptors({
          name:
            projectName,

          pageSize:
            1,
        });

      return {
        success:
          true,

        latencyMs:
          Date.now() -
          startedAt,

        detail:
          "Google Cloud Monitoring connection successful",
      };
    } catch (error) {
      return {
        success:
          false,

        latencyMs:
          Date.now() -
          startedAt,

        detail:
          error.message,
      };
    }
  },

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
    };
  },

  async receiveEvent(
    _connection,
    payload
  ) {
    return this
      .normalizeEvent(
        payload
      );
  },

  normalizeEvent(
    input
  ) {
    let raw =
      input;

    /*
     * Pub/Sub push envelope.
     */
    if (
      input
        ?.message
        ?.data
    ) {
      try {
        raw =
          JSON.parse(
            Buffer.from(
              input
                .message
                .data,
              "base64"
            ).toString(
              "utf8"
            )
          );
      } catch {
        raw =
          input;
      }
    }

    const incident =
      raw.incident ||
      raw;

    const state =
      String(
        incident.state ||
        incident
          .incident_state ||
        "unknown"
      ).toLowerCase();

    return {
      provider:
        PROVIDER,

      externalEventId:
        incident
          .incident_id ||
        incident.id ||
        null,

      eventType:
        `alert.${mapGcpState(
          state
        )}`,

      title:
        incident
          .policy_name ||
        incident
          .condition_name ||
        "Google Cloud Monitoring incident",

      severity:
        mapGcpSeverity(
          incident.severity
        ),

      service:
        incident
          .resource
          ?.type ||
        incident
          .resource_type_display_name ||
        null,

      status:
        mapGcpState(
          state
        ),

      labels:
        incident
          .resource
          ?.labels ||
        incident
          .metric
          ?.labels ||
        {},

      annotations: {
        summary:
          incident.summary ||
          null,

        url:
          incident.url ||
          null,
      },

      fingerprint:
        incident
          .incident_id ||
        null,

      receivedAt:
        new Date()
          .toISOString(),

      rawPayload:
        raw,
    };
  },

  async queryMetrics(
    connection,
    query = {}
  ) {
    if (!query.filter) {
      throw new Error(
        "GCP Monitoring filter is required"
      );
    }

    const {
      monitoringClient,
      projectName,
    } =
      buildGcp(
        connection
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

    const [
      timeSeries,
    ] =
      await monitoringClient
        .listTimeSeries({
          name:
            projectName,

          filter:
            query.filter,

          interval: {
            startTime: {
              seconds:
                Math.floor(
                  startTime
                    .getTime() /
                  1000
                ),
            },

            endTime: {
              seconds:
                Math.floor(
                  endTime
                    .getTime() /
                  1000
                ),
            },
          },

          view:
            "FULL",

          pageSize:
            Math.min(
              query.limit ||
              100,
              1000
            ),
        });

    return {
      timeSeries,
    };
  },

  async queryLogs(
    connection,
    query = {}
  ) {
    const {
      logging,
    } =
      buildGcp(
        connection
      );

    const [
      entries,
    ] =
      await logging
        .getEntries({
          filter:
            query.filter ||
            "",

          pageSize:
            Math.min(
              query.limit ||
              100,
              1000
            ),

          orderBy:
            query.orderBy ||
            "timestamp desc",
        });

    return {
      entries:
        entries.map(
          (entry) => ({
            metadata:
              entry.metadata,

            data:
              entry.data,
          })
        ),
    };
  },

  async queryTraces(
    connection,
    query = {}
  ) {
    const {
      auth,
      projectId,
    } =
      buildGcp(
        connection
      );

    const client =
      await auth
        .getClient();

    const params =
      new URLSearchParams();

    params.set(
      "view",
      query.view ||
      "ROOTSPAN"
    );

    params.set(
      "pageSize",
      String(
        Math.min(
          query.limit ||
          100,
          1000
        )
      )
    );

    if (
      query.startTime
    ) {
      params.set(
        "startTime",
        new Date(
          query.startTime
        ).toISOString()
      );
    }

    if (
      query.endTime
    ) {
      params.set(
        "endTime",
        new Date(
          query.endTime
        ).toISOString()
      );
    }

    if (
      query.filter
    ) {
      params.set(
        "filter",
        query.filter
      );
    }

    const response =
      await client.request({
        url:
          `https://cloudtrace.googleapis.com/v1/projects/${encodeURIComponent(
            projectId
          )}/traces?${params.toString()}`,

        method:
          "GET",
      });

    return response.data;
  },

  async discoverResources(
    connection,
    options = {}
  ) {
    const {
      monitoringClient,
      projectName,
    } =
      buildGcp(
        connection
      );

    const [
      descriptors,
    ] =
      await monitoringClient
        .listMonitoredResourceDescriptors({
          name:
            projectName,

          pageSize:
            Math.min(
              options.limit ||
              100,
              1000
            ),
        });

    return {
      resources:
        descriptors,

      count:
        descriptors.length,
    };
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

function buildGcp(
  connection
) {
  const config =
    connection
      .nonSecretConfig ||
    {};

  const projectId =
    config.projectId;

  if (!projectId) {
    throw new Error(
      "GCP projectId is required"
    );
  }

  let credentials =
    null;

  if (
    connection
      ._decryptedSecret
  ) {
    try {
      credentials =
        JSON.parse(
          connection
            ._decryptedSecret
        );
    } catch {
      throw new Error(
        "GCP service account secret must be JSON"
      );
    }
  }

  const clientOptions = {
    projectId,

    ...(credentials
      ? {
          credentials,
        }
      : {}),
  };

  const auth =
    new GoogleAuth({
      ...clientOptions,

      scopes: [
        "https://www.googleapis.com/auth/cloud-platform",
        "https://www.googleapis.com/auth/monitoring.read",
        "https://www.googleapis.com/auth/logging.read",
        "https://www.googleapis.com/auth/trace.readonly",
      ],
    });

  return {
    projectId,

    projectName:
      `projects/${projectId}`,

    auth,

    monitoringClient:
      new v3
        .MetricServiceClient(
          clientOptions
        ),

    logging:
      new Logging(
        clientOptions
      ),
  };
}

function mapGcpState(
  state
) {
  if (
    [
      "open",
      "firing",
      "active",
    ].includes(
      state
    )
  ) {
    return "open";
  }

  if (
    [
      "closed",
      "resolved",
      "ok",
    ].includes(
      state
    )
  ) {
    return "resolved";
  }

  return "unknown";
}

function mapGcpSeverity(
  severity
) {
  const value =
    String(
      severity ||
      ""
    ).toLowerCase();

  if (
    /critical|error|fatal/.test(
      value
    )
  ) {
    return "critical";
  }

  if (
    /warn|high/.test(
      value
    )
  ) {
    return "warning";
  }

  return "info";
}

module.exports =
  adapter;