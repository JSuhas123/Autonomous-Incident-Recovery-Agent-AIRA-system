"use strict";

const {
  makeStubAdapter,
} =
  require(
    "../adapterInterface"
  );

const PROVIDER =
  "datadog";

const CAPABILITIES = [
  "receive_events",
  "normalize_events",
  "send_notifications",
  "get_health",
  "query_metrics",
  "query_logs",
  "query_traces",
  "revoke",
];

const SITE_HOSTS = {
  us1:
    "datadoghq.com",

  us3:
    "us3.datadoghq.com",

  us5:
    "us5.datadoghq.com",

  eu:
    "datadoghq.eu",

  ap1:
    "ap1.datadoghq.com",

  ap2:
    "ap2.datadoghq.com",
};

const adapter = {
  ...makeStubAdapter(
    PROVIDER,
    CAPABILITIES
  ),

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
      config.site &&
      !SITE_HOSTS[
        config.site
      ]
    ) {
      errors.push(
        "Unsupported Datadog site"
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
        apiKey,
      } =
        getCredentials(
          connection
        );

      const response =
        await ddRequest(
          connection,
          "/api/v1/validate",
          {
            method:
              "GET",

            apiKey,

            requireAppKey:
              false,
          }
        );

      return {
        success:
          response.valid ===
          true,

        latencyMs:
          Date.now() -
          startedAt,

        detail:
          response.valid
            ? "Datadog API key is valid"
            : "Datadog rejected the API key",
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
    raw
  ) {
    const status =
      String(
        raw.alert_status ||
        raw.status ||
        raw.event_type ||
        "unknown"
      )
        .trim()
        .toLowerCase();

    return {
      provider:
        PROVIDER,

      externalEventId:
        String(
          raw.id ||
          raw.alert_id ||
          raw.event_id ||
          raw.monitor_id ||
          ""
        ) ||
        null,

      eventType:
        `alert.${normalizeStatus(
          status
        )}`,

      title:
        raw.title ||
        raw.alert_title ||
        raw.event_title ||
        raw.message ||
        "Datadog alert",

      severity:
        normalizeSeverity(
          raw.priority ||
          raw.severity ||
          raw.alert_priority ||
          status
        ),

      service:
        raw.service ||
        raw.service_name ||
        extractServiceFromTags(
          raw.tags
        ),

      status:
        normalizeStatus(
          status
        ),

      labels:
        normalizeTags(
          raw.tags
        ),

      annotations: {
        message:
          raw.body ||
          raw.message ||
          null,

        link:
          raw.link ||
          raw.event_url ||
          null,
      },

      fingerprint:
        raw.aggregation_key ||
        raw.alert_id ||
        raw.monitor_id ||
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
    if (!query.query) {
      throw Object.assign(
        new Error(
          "Datadog metric query is required"
        ),
        {
          code:
            "DATADOG_METRIC_QUERY_REQUIRED",
        }
      );
    }

    const now =
      Math.floor(
        Date.now() /
        1000
      );

    const from =
      query.from ||
      now - 900;

    const to =
      query.to ||
      now;

    const params =
      new URLSearchParams({
        from:
          String(from),

        to:
          String(to),

        query:
          query.query,
      });

    return ddRequest(
      connection,
      `/api/v1/query?${params.toString()}`,
      {
        method:
          "GET",
      }
    );
  },

  async queryLogs(
    connection,
    query = {}
  ) {
    return ddRequest(
      connection,
      "/api/v2/logs/events/search",
      {
        method:
          "POST",

        body: {
          filter: {
            query:
              query.query ||
              "*",

            from:
              query.from ||
              "now-15m",

            to:
              query.to ||
              "now",
          },

          sort:
            query.sort ||
            "-timestamp",

          page: {
            limit:
              Math.min(
                query.limit ||
                50,
                1000
              ),
          },
        },
      }
    );
  },

  async queryTraces(
    connection,
    query = {}
  ) {
    return ddRequest(
      connection,
      "/api/v2/spans/events/search",
      {
        method:
          "POST",

        body: {
          data: {
            type:
              "search_request",

            attributes: {
              filter: {
                from:
                  query.from ||
                  "now-15m",

                to:
                  query.to ||
                  "now",

                query:
                  query.query ||
                  "*",
              },

              page: {
                limit:
                  Math.min(
                    query.limit ||
                    50,
                    1000
                  ),
              },

              sort:
                query.sort ||
                "-timestamp",
            },
          },
        },
      }
    );
  },

  async sendNotification(
    connection,
    notification
  ) {
    /*
     * V1 events remain useful for generic operational
     * notifications.
     */
    return ddRequest(
      connection,
      "/api/v1/events",
      {
        method:
          "POST",

        requireAppKey:
          false,

        body: {
          title:
            notification.title ||
            "AIRA notification",

          text:
            notification.text ||
            notification.message ||
            "AIRA operational event",

          alert_type:
            mapDatadogAlertType(
              notification.severity
            ),

          source_type_name:
            "aira",

          tags:
            Array.isArray(
              notification.tags
            )
              ? notification.tags
              : [],
        },
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

function getCredentials(
  connection
) {
  if (
    !connection
      ?._decryptedSecret
  ) {
    throw Object.assign(
      new Error(
        "Datadog credentials are missing"
      ),
      {
        code:
          "DATADOG_CREDENTIALS_MISSING",
      }
    );
  }

  let parsed;

  try {
    parsed =
      JSON.parse(
        connection
          ._decryptedSecret
      );
  } catch {
    parsed = {
      apiKey:
        connection
          ._decryptedSecret,
    };
  }

  if (!parsed.apiKey) {
    throw new Error(
      "Datadog apiKey is required"
    );
  }

  return parsed;
}

async function ddRequest(
  connection,
  path,
  {
    method = "GET",
    body = null,
    apiKey = null,
    requireAppKey = true,
  } = {}
) {
  const credentials =
    getCredentials(
      connection
    );

  const resolvedApiKey =
    apiKey ||
    credentials.apiKey;

  if (
    requireAppKey &&
    !credentials.appKey
  ) {
    throw Object.assign(
      new Error(
        "Datadog appKey is required for read operations"
      ),
      {
        code:
          "DATADOG_APP_KEY_MISSING",
      }
    );
  }

  const site =
    connection
      .nonSecretConfig
      ?.site ||
    "us1";

  const host =
    SITE_HOSTS[
      site
    ] ||
    SITE_HOSTS.us1;

  const response =
    await fetch(
      `https://api.${host}${path}`,
      {
        method,

        headers: {
          Accept:
            "application/json",

          "Content-Type":
            "application/json",

          "DD-API-KEY":
            resolvedApiKey,

          ...(credentials.appKey
            ? {
                "DD-APPLICATION-KEY":
                  credentials.appKey,
              }
            : {}),
        },

        body:
          body
            ? JSON.stringify(
                body
              )
            : undefined,

        signal:
          AbortSignal.timeout(
            15000
          ),
      }
    );

  const text =
    await response.text();

  let data = {};

  if (text) {
    try {
      data =
        JSON.parse(
          text
        );
    } catch {
      data = {
        raw:
          text,
      };
    }
  }

  if (!response.ok) {
    throw Object.assign(
      new Error(
        `Datadog HTTP ${response.status}: ${
          data.errors
            ? JSON.stringify(
                data.errors
              )
            : text
        }`
      ),
      {
        code:
          "DATADOG_API_ERROR",

        statusCode:
          response.status,
      }
    );
  }

  return data;
}

function normalizeStatus(
  value
) {
  if (
    [
      "alert",
      "triggered",
      "firing",
      "error",
    ].includes(
      value
    )
  ) {
    return "open";
  }

  if (
    [
      "recovered",
      "resolved",
      "ok",
      "success",
    ].includes(
      value
    )
  ) {
    return "resolved";
  }

  return value ||
    "unknown";
}

function normalizeSeverity(
  value
) {
  const text =
    String(
      value ||
      ""
    ).toLowerCase();

  if (
    /critical|fatal|error|p1/.test(
      text
    )
  ) {
    return "critical";
  }

  if (
    /warn|high|p2/.test(
      text
    )
  ) {
    return "warning";
  }

  return "info";
}

function normalizeTags(
  tags
) {
  if (
    Array.isArray(
      tags
    )
  ) {
    return Object.fromEntries(
      tags
        .map(
          (tag) =>
            String(tag)
              .split(
                ":"
              )
        )
        .filter(
          (parts) =>
            parts.length >=
            2
        )
        .map(
          (
            [
              key,
              ...rest
            ]
          ) => [
            key,
            rest.join(
              ":"
            ),
          ]
        )
    );
  }

  return tags &&
    typeof tags ===
      "object"
    ? tags
    : {};
}

function extractServiceFromTags(
  tags
) {
  return normalizeTags(
    tags
  ).service ||
    null;
}

function mapDatadogAlertType(
  severity
) {
  switch (
    String(
      severity ||
      ""
    ).toLowerCase()
  ) {
    case "critical":
    case "error":
      return "error";

    case "warning":
      return "warning";

    case "success":
      return "success";

    default:
      return "info";
  }
}

module.exports =
  adapter;