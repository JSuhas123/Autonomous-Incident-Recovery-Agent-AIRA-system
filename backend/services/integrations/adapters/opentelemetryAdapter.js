"use strict";

const {
  makeStubAdapter,
} =
  require(
    "../adapterInterface"
  );

const opentelemetryIngestionService =
  require(
    "../opentelemetryIngestionService"
  );

const PROVIDER =
  "opentelemetry";

const CAPABILITIES = [
  "receive_events",
  "normalize_events",
  "get_health",
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

  // ==========================================================================
  // CONFIG
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
      config.transport &&
      ![
        "http_json",
      ].includes(
        config.transport
      )
    ) {
      errors.push(
        'transport currently supports only "http_json"'
      );
    }

    if (
      config.maxBatchSize !==
        undefined &&
      (
        !Number.isInteger(
          config.maxBatchSize
        ) ||
        config.maxBatchSize <
          1 ||
        config.maxBatchSize >
          10000
      )
    ) {
      errors.push(
        "maxBatchSize must be an integer between 1 and 10000"
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
  // HEALTH
  // ==========================================================================

  async testConnection(
    connection
  ) {
    const startedAt =
      Date.now();

    try {
      if (
        !connection
          ?.organizationId ||
        !connection
          ?.environmentId
      ) {
        throw new Error(
          "OpenTelemetry connection context is incomplete"
        );
      }

      return {
        success:
          true,

        latencyMs:
          Date.now() -
          startedAt,

        detail:
          "OpenTelemetry HTTP/JSON ingestion endpoint is ready.",
      };
    } catch (
      error
    ) {
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

  // ==========================================================================
  // INGEST
  // ==========================================================================

  async receiveEvent(
    connection,
    rawPayload,
    _headers = {}
  ) {
    const context =
      buildContext(
        connection
      );

    return opentelemetryIngestionService
      .ingest(
        context,
        rawPayload
      );
  },

  normalizeEvent(
    rawPayload
  ) {
    return opentelemetryIngestionService
      .normalizePayload(
        rawPayload
      );
  },

  // ==========================================================================
  // QUERY
  // ==========================================================================

  async queryMetrics(
    connection,
    query = {}
  ) {
    return opentelemetryIngestionService
      .queryMetrics(
        buildContext(
          connection
        ),
        query
      );
  },

  async queryLogs(
    connection,
    query = {}
  ) {
    return opentelemetryIngestionService
      .queryLogs(
        buildContext(
          connection
        ),
        query
      );
  },

  async queryTraces(
    connection,
    query = {}
  ) {
    return opentelemetryIngestionService
      .queryTraces(
        buildContext(
          connection
        ),
        query
      );
  },

  // ==========================================================================
  // REVOKE
  // ==========================================================================

  async revoke() {
    return {
      success:
        true,

      remoteRevocationRequired:
        false,
    };
  },
};

function buildContext(
  connection
) {
  if (!connection) {
    throw Object.assign(
      new Error(
        "OpenTelemetry integration connection is required"
      ),
      {
        code:
          "OTEL_CONNECTION_REQUIRED",
      }
    );
  }

  const integrationId =
    connection._id ||
    connection.integrationId;

  if (
    !connection
      .organizationId ||
    !connection
      .environmentId ||
    !connection
      .tenantId ||
    !integrationId
  ) {
    throw Object.assign(
      new Error(
        "OpenTelemetry integration context is incomplete"
      ),
      {
        code:
          "OTEL_CONTEXT_REQUIRED",
      }
    );
  }

  return {
    organizationId:
      connection
        .organizationId,

    environmentId:
      connection
        .environmentId,

    tenantId:
      connection
        .tenantId,

    integrationId,
  };
}

module.exports =
  adapter;