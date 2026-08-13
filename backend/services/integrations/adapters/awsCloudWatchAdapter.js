"use strict";

const {
  CloudWatchClient,
  DescribeAlarmsCommand,
  GetMetricDataCommand,
} =
  require(
    "@aws-sdk/client-cloudwatch"
  );

const {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
} =
  require(
    "@aws-sdk/client-cloudwatch-logs"
  );

const {
  ResourceGroupsTaggingAPIClient,
  GetResourcesCommand,
} =
  require(
    "@aws-sdk/client-resource-groups-tagging-api"
  );

const {
  makeStubAdapter,
} =
  require(
    "../adapterInterface"
  );

const PROVIDER =
  "aws_cloudwatch";

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

  async validateConfiguration(
    config = {}
  ) {
    const errors = [];

    if (!config.region) {
      errors.push(
        "region is required"
      );
    }

    if (
      config.authMode &&
      ![
        "access_key",
        "default_chain",
      ].includes(
        config.authMode
      )
    ) {
      errors.push(
        "authMode must be access_key or default_chain"
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
      const client =
        createCloudWatchClient(
          connection
        );

      await client.send(
        new DescribeAlarmsCommand({
          MaxRecords:
            1,
        })
      );

      return {
        success:
          true,

        latencyMs:
          Date.now() -
          startedAt,

        detail:
          "AWS CloudWatch connection successful",
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
    raw
  ) {
    return this
      .normalizeEvent(
        raw
      );
  },

  normalizeEvent(
    input
  ) {
    let raw =
      input;

    /*
     * SNS CloudWatch Alarm delivery.
     */
    if (
      input?.Type ===
        "Notification" &&
      input.Message
    ) {
      try {
        raw =
          JSON.parse(
            input.Message
          );
      } catch {
        raw =
          input;
      }
    }

    /*
     * EventBridge CloudWatch event.
     */
    const detail =
      raw.detail ||
      raw;

    const alarmName =
      detail.AlarmName ||
      detail.alarmName ||
      detail
        .alarmData
        ?.alarmName ||
      raw["detail-type"] ||
      "AWS CloudWatch event";

    const state =
      detail.NewStateValue ||
      detail.state
        ?.value ||
      detail.state ||
      "UNKNOWN";

    return {
      provider:
        PROVIDER,

      externalEventId:
        raw.id ||
        detail
          .AlarmArn ||
        null,

      eventType:
        `alert.${mapAwsState(
          state
        )}`,

      title:
        alarmName,

      severity:
        mapAwsState(
          state
        ) === "open"
          ? "critical"
          : "info",

      service:
        inferAwsService(
          detail
        ),

      status:
        mapAwsState(
          state
        ),

      labels:
        detail.Trigger
          ?.Dimensions ||
        detail.configuration
          ?.metrics ||
        {},

      annotations: {
        reason:
          detail.NewStateReason ||
          detail.state
            ?.reason ||
          null,
      },

      fingerprint:
        detail.AlarmArn ||
        alarmName,

      rawPayload:
        raw,

      receivedAt:
        new Date()
          .toISOString(),
    };
  },

  async queryMetrics(
    connection,
    query = {}
  ) {
    if (
      !Array.isArray(
        query.metricDataQueries
      ) ||
      query
        .metricDataQueries
        .length ===
      0
    ) {
      throw new Error(
        "metricDataQueries is required"
      );
    }

    const client =
      createCloudWatchClient(
        connection
      );

    return client.send(
      new GetMetricDataCommand({
        MetricDataQueries:
          query.metricDataQueries,

        StartTime:
          new Date(
            query.startTime ||
            Date.now() -
              15 *
              60 *
              1000
          ),

        EndTime:
          new Date(
            query.endTime ||
            Date.now()
          ),

        ScanBy:
          query.scanBy ||
          "TimestampDescending",

        MaxDatapoints:
          query.maxDatapoints ||
          1000,
      })
    );
  },

  async queryLogs(
    connection,
    query = {}
  ) {
    if (
      !query.logGroupName ||
      !query.queryString
    ) {
      throw new Error(
        "logGroupName and queryString are required"
      );
    }

    const client =
      createLogsClient(
        connection
      );

    const start =
      Math.floor(
        (
          query.startTime ||
          Date.now() -
            15 *
            60 *
            1000
        ) /
        1000
      );

    const end =
      Math.floor(
        (
          query.endTime ||
          Date.now()
        ) /
        1000
      );

    const started =
      await client.send(
        new StartQueryCommand({
          logGroupName:
            query.logGroupName,

          startTime:
            start,

          endTime:
            end,

          queryString:
            query.queryString,

          limit:
            Math.min(
              query.limit ||
              100,
              10000
            ),
        })
      );

    const queryId =
      started.queryId;

    for (
      let attempt = 0;
      attempt < 20;
      attempt++
    ) {
      await delay(
        500
      );

      const result =
        await client.send(
          new GetQueryResultsCommand({
            queryId,
          })
        );

      if (
        [
          "Complete",
          "Failed",
          "Cancelled",
          "Timeout",
        ].includes(
          result.status
        )
      ) {
        return result;
      }
    }

    throw Object.assign(
      new Error(
        "CloudWatch Logs Insights query timed out"
      ),
      {
        code:
          "AWS_LOG_QUERY_TIMEOUT",
      }
    );
  },

  async discoverResources(
    connection,
    options = {}
  ) {
    const client =
      createTaggingClient(
        connection
      );

    return client.send(
      new GetResourcesCommand({
        ResourceTypeFilters:
          options
            .resourceTypeFilters ||
          undefined,

        ResourcesPerPage:
          Math.min(
            options.limit ||
            100,
            100
          ),
      })
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

function awsConfig(
  connection
) {
  const config =
    connection
      .nonSecretConfig ||
    {};

  const result = {
    region:
      config.region,
  };

  if (
    config.authMode ===
    "default_chain"
  ) {
    return result;
  }

  let credentials;

  try {
    credentials =
      JSON.parse(
        connection
          ._decryptedSecret ||
        "{}"
      );
  } catch {
    throw new Error(
      "AWS secret must be JSON"
    );
  }

  if (
    !credentials.accessKeyId ||
    !credentials.secretAccessKey
  ) {
    throw new Error(
      "AWS accessKeyId and secretAccessKey are required"
    );
  }

  result.credentials = {
    accessKeyId:
      credentials.accessKeyId,

    secretAccessKey:
      credentials.secretAccessKey,

    ...(credentials.sessionToken
      ? {
          sessionToken:
            credentials.sessionToken,
        }
      : {}),
  };

  return result;
}

function createCloudWatchClient(
  connection
) {
  return new CloudWatchClient(
    awsConfig(
      connection
    )
  );
}

function createLogsClient(
  connection
) {
  return new CloudWatchLogsClient(
    awsConfig(
      connection
    )
  );
}

function createTaggingClient(
  connection
) {
  return new ResourceGroupsTaggingAPIClient(
    awsConfig(
      connection
    )
  );
}

function mapAwsState(
  state
) {
  switch (
    String(
      state
    ).toUpperCase()
  ) {
    case "ALARM":
      return "open";

    case "OK":
      return "resolved";

    default:
      return "unknown";
  }
}

function inferAwsService(
  detail
) {
  return (
    detail
      ?.Trigger
      ?.Namespace ||
    detail
      ?.configuration
      ?.metrics?.[0]
      ?.metricStat
      ?.metric
      ?.namespace ||
    null
  );
}

function delay(
  ms
) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}

module.exports =
  adapter;