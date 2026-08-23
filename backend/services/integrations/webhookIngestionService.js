"use strict";

const crypto =
  require("node:crypto");

const mongoose =
  require("../../persistence/operational/mongooseCompat");

const {
  getAdapter,
  hasAdapter,
} =
  require(
    "./adapterRegistry"
  );

// ============================================================================
// CONSTANTS
// ============================================================================

const WEBHOOK_SOURCE_TYPES = [
  "webhook_incoming",
  "prometheus_alertmanager",
  "grafana_alerting",
  "datadog",
  "pagerduty",
];

const WEBHOOK_EVENT_STATUSES = [
  "received",
  "processing",
  "actioned",
  "skipped",
  "failed",
];

const SEVERITIES = [
  "low",
  "medium",
  "high",
  "critical",
];

const MAX_METADATA_DEPTH =
  6;

const MAX_METADATA_ARRAY =
  100;

const BLOCKED_SECRET_KEYS =
  new Set([
    "authorization",
    "proxy-authorization",
    "apikey",
    "api_key",
    "api-key",
    "x-api-key",
    "token",
    "access_token",
    "access-token",
    "accesstoken",
    "secret",
    "password",
    "passwd",
    "cookie",
    "set-cookie",
    "client_secret",
    "client-secret",
    "private_key",
    "private-key",
  ]);

// ============================================================================
// WEBHOOK SOURCE SCHEMA
// ============================================================================

const webhookSourceSchema =
  new mongoose.Schema(
    {
      sourceId: {
        type:
          String,

        required:
          true,

        trim:
          true,
      },

      name: {
        type:
          String,

        required:
          true,

        trim:
          true,

        maxlength:
          128,
      },

      type: {
        type:
          String,

        enum:
          WEBHOOK_SOURCE_TYPES,

        required:
          true,
      },

      enabled: {
        type:
          Boolean,

        default:
          true,
      },

      /*
       * Raw API keys are NEVER persisted.
       */
      apiKeyHash: {
        type:
          String,

        required:
          true,

        select:
          false,
      },

      /*
       * Optional service/provider endpoints.
       *
       * These must not contain credentials.
       */
      endpoints: {
        type:
          [String],

        default:
          [],
      },

      /*
       * Provider-specific NON-SECRET mappings.
       */
      mappings: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          {},
      },

      createdAt: {
        type:
          Date,

        default:
          Date.now,
      },

      disabledAt: {
        type:
          Date,

        default:
          null,
      },
    },
    {
      _id:
        true,
    }
  );

// ============================================================================
// WEBHOOK CONFIG SCHEMA
// ============================================================================

const webhookConfigSchema =
  new mongoose.Schema(
    {
      organizationId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Organization",

        required:
          true,

        index:
          true,
      },

      environmentId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Environment",

        required:
          true,

        index:
          true,
      },

      /*
       * Legacy compatibility boundary.
       *
       * organizationId + environmentId remain canonical.
       */
      tenantId: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      sources: {
        type:
          [webhookSourceSchema],

        default:
          [],
      },

      autoAction: {
        type:
          Boolean,

        default:
          false,
      },

      severityThreshold: {
        type:
          String,

        enum:
          SEVERITIES,

        default:
          "medium",
      },
    },
    {
      timestamps:
        true,

      versionKey:
        false,
    }
  );

webhookConfigSchema.index(
  {
    organizationId:
      1,

    environmentId:
      1,
  },
  {
    unique:
      true,

    name:
      "unique_webhook_config_per_environment",
  }
);

webhookConfigSchema.index({
  tenantId:
    1,

  environmentId:
    1,
});

// ============================================================================
// WEBHOOK EVENT SCHEMA
// ============================================================================

const webhookEventSchema =
  new mongoose.Schema(
    {
      organizationId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Organization",

        required:
          true,

        index:
          true,
      },

      environmentId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Environment",

        required:
          true,

        index:
          true,
      },

      tenantId: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      sourceId: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      /*
       * Canonical provider name:
       *
       * prometheus_alertmanager
       * grafana_alerting
       * webhook_incoming
       * ...
       */
      source: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      /*
       * Canonical event identity.
       *
       * IMPORTANT:
       *
       * A Prometheus/Grafana fingerprint alone is NOT sufficient,
       * because firing and resolved states can share a fingerprint.
       */
      eventId: {
        type:
          String,

        required:
          true,
      },

      /*
       * Provider identity without lifecycle/status transformation.
       */
      providerEventId: {
        type:
          String,

        default:
          null,

        index:
          true,
      },

      eventType: {
        type:
          String,

        default:
          null,

        index:
          true,
      },

      timestamp: {
        type:
          Date,

        default:
          Date.now,

        index:
          true,
      },

      alert: {
        name:
          String,

        service:
          String,

        pattern:
          String,

        severity: {
          type:
            String,

          enum:
            SEVERITIES,
        },

        description:
          String,

        metrics:
          mongoose.Schema.Types.Mixed,
      },

      providerStatus: {
        type:
          String,

        default:
          null,
      },

      aiiraDecision: {
        action:
          String,

        confidence:
          Number,

        reasoning:
          String,

        decisionTraceId:
          String,
      },

      status: {
        type:
          String,

        enum:
          WEBHOOK_EVENT_STATUSES,

        default:
          "received",

        index:
          true,
      },

      processingTimeMs: {
        type:
          Number,

        min:
          0,

        default:
          null,
      },

      error: {
        type:
          String,

        maxlength:
          1024,

        default:
          null,
      },

      /*
       * Sanitized operational metadata only.
       */
      sourceMetadata: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          {},
      },
    },
    {
      timestamps:
        true,

      versionKey:
        false,
    }
  );

// ============================================================================
// EVENT INDEXES
// ============================================================================

webhookEventSchema.index(
  {
    organizationId:
      1,

    environmentId:
      1,

    sourceId:
      1,

    eventId:
      1,
  },
  {
    unique:
      true,

    name:
      "unique_webhook_event_per_source",
  }
);

webhookEventSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  timestamp:
    -1,
});

webhookEventSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  sourceId:
    1,

  timestamp:
    -1,
});

webhookEventSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  source:
    1,

  eventType:
    1,

  timestamp:
    -1,
});

webhookEventSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  status:
    1,

  timestamp:
    -1,
});

// ============================================================================
// LOW-LEVEL HELPERS
// ============================================================================

function generateSourceId() {
  return (
    `whsrc_${crypto
      .randomBytes(
        12
      )
      .toString(
        "hex"
      )}`
  );
}

function generateApiKey() {
  return (
    `aira_wh_${crypto
      .randomBytes(
        24
      )
      .toString(
        "hex"
      )}`
  );
}

function hashApiKey(
  value
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      String(value)
    )
    .digest(
      "hex"
    );
}

function safeTimingEqual(
  first,
  second
) {
  if (
    !first ||
    !second
  ) {
    return false;
  }

  const firstBuffer =
    Buffer.from(
      String(first)
    );

  const secondBuffer =
    Buffer.from(
      String(second)
    );

  if (
    firstBuffer.length !==
    secondBuffer.length
  ) {
    return false;
  }

  return crypto
    .timingSafeEqual(
      firstBuffer,
      secondBuffer
    );
}

function normalizeMetadataKey(
  key
) {
  return String(
    key
  )
    .trim()
    .toLowerCase()
    .replace(
      /[\s_]+/g,
      "-"
    );
}

function sanitizePayloadMetadata(
  value,
  depth = 0
) {
  if (
    depth >
    MAX_METADATA_DEPTH
  ) {
    return "[MAX_DEPTH]";
  }

  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return value;
  }

  if (
    typeof value ===
      "string"
  ) {
    return value.slice(
      0,
      4096
    );
  }

  if (
    typeof value ===
      "number" ||
    typeof value ===
      "boolean"
  ) {
    return value;
  }

  if (
    value instanceof Date
  ) {
    return value
      .toISOString();
  }

  if (
    Array.isArray(
      value
    )
  ) {
    return value
      .slice(
        0,
        MAX_METADATA_ARRAY
      )
      .map(
        (entry) =>
          sanitizePayloadMetadata(
            entry,
            depth + 1
          )
      );
  }

  if (
    typeof value !==
    "object"
  ) {
    return String(
      value
    );
  }

  const sanitized = {};

  for (
    const [
      key,
      entry,
    ]
    of Object.entries(
      value
    )
  ) {
    const normalizedKey =
      normalizeMetadataKey(
        key
      );

    if (
      BLOCKED_SECRET_KEYS.has(
        normalizedKey
      )
    ) {
      continue;
    }

    sanitized[key] =
      sanitizePayloadMetadata(
        entry,
        depth + 1
      );
  }

  return sanitized;
}

// ============================================================================
// SERVICE
// ============================================================================

class WebhookIngestionService {
  constructor() {
    this.WebhookEvent =
      mongoose.models
        .WebhookEvent ||
      mongoose.model(
        "WebhookEvent",
        webhookEventSchema,
        "webhook_events"
      );

    this.WebhookConfig =
      mongoose.models
        .WebhookConfig ||
      mongoose.model(
        "WebhookConfig",
        webhookConfigSchema,
        "webhook_configs"
      );
  }

  // ==========================================================================
  // REGISTRATION
  // ==========================================================================

  async registerWebhookSource(
    context,
    sourceConfig
  ) {
    try {
      const {
        organizationId,
        environmentId,
        tenantId,
      } =
        this
          .assertEnvironmentContext(
            context
          );

      if (
        !sourceConfig ||
        typeof sourceConfig !==
          "object"
      ) {
        throw Object.assign(
          new Error(
            "Webhook source configuration is required"
          ),
          {
            status:
              400,

            code:
              "WEBHOOK_SOURCE_CONFIG_REQUIRED",
          }
        );
      }

      if (
        !sourceConfig.name ||
        typeof sourceConfig.name !==
          "string" ||
        !sourceConfig.name
          .trim()
      ) {
        throw Object.assign(
          new Error(
            "Webhook source name is required"
          ),
          {
            status:
              400,

            code:
              "WEBHOOK_SOURCE_NAME_REQUIRED",
          }
        );
      }

      const provider =
        String(
          sourceConfig.type ||
          ""
        )
          .trim()
          .toLowerCase();

      if (
        !WEBHOOK_SOURCE_TYPES.includes(
          provider
        )
      ) {
        throw Object.assign(
          new Error(
            "Unsupported webhook source type"
          ),
          {
            status:
              422,

            code:
              "WEBHOOK_SOURCE_TYPE_INVALID",
          }
        );
      }

      /*
       * Do not allow registration of connector types whose
       * runtime adapter is not actually installed.
       *
       * Datadog/PagerDuty can stay in WEBHOOK_SOURCE_TYPES
       * for future compatibility but cannot be activated
       * until their adapter exists.
       */
      if (
        !hasAdapter(
          provider
        )
      ) {
        throw Object.assign(
          new Error(
            `Webhook adapter is not available for provider "${provider}"`
          ),
          {
            status:
              422,

            code:
              "WEBHOOK_ADAPTER_UNAVAILABLE",
          }
        );
      }

      const sourceId =
        generateSourceId();

      const rawApiKey =
        sourceConfig.apiKey ||
        generateApiKey();

      const storedSource = {
        sourceId,

        name:
          sourceConfig.name
            .trim(),

        type:
          provider,

        enabled:
          sourceConfig.enabled !==
          false,

        apiKeyHash:
          hashApiKey(
            rawApiKey
          ),

        endpoints:
          Array.isArray(
            sourceConfig.endpoints
          )
            ? sourceConfig
                .endpoints
                .filter(
                  (entry) =>
                    typeof entry ===
                      "string"
                )
                .map(
                  (entry) =>
                    entry.trim()
                )
                .filter(
                  Boolean
                )
            : [],

        mappings:
          sanitizePayloadMetadata(
            sourceConfig.mappings ||
            {}
          ),
      };

      let config =
        await this
          .WebhookConfig
          .findOne({
            organizationId,

            environmentId,
          })
          .select(
            "+sources.apiKeyHash"
          );

      if (!config) {
        config =
          new this
            .WebhookConfig({
              organizationId,

              environmentId,

              tenantId,

              sources: [
                storedSource,
              ],
            });
      } else {
        const duplicate =
          config.sources
            .some(
              (source) =>
                source.name
                  .toLowerCase() ===
                  storedSource.name
                    .toLowerCase()
            );

        if (
          duplicate
        ) {
          throw Object.assign(
            new Error(
              "Webhook source already exists"
            ),
            {
              status:
                409,

              code:
                "WEBHOOK_SOURCE_EXISTS",
            }
          );
        }

        config.sources.push(
          storedSource
        );
      }

      await config.save();

      /*
       * Raw credential is returned exactly once.
       */
      return {
        success:
          true,

        source: {
          sourceId,

          name:
            storedSource.name,

          type:
            storedSource.type,

          enabled:
            storedSource.enabled,
        },

        apiKey:
          rawApiKey,
      };
    } catch (error) {
      if (
        error.status ||
        error.statusCode ||
        error.code
      ) {
        throw error;
      }

      throw Object.assign(
        new Error(
          `Failed to register webhook source: ${error.message}`
        ),
        {
          code:
            "WEBHOOK_SOURCE_REGISTRATION_FAILED",

          cause:
            error,
        }
      );
    }
  }

  // ==========================================================================
  // AUTHENTICATION
  // ==========================================================================

  async authenticateSource(
    sourceId,
    rawApiKey
  ) {
    if (
      !sourceId ||
      !rawApiKey
    ) {
      return null;
    }

    /*
     * apiKeyHash uses select:false, therefore explicitly include it.
     */
    const config =
      await this
        .WebhookConfig
        .findOne({
          "sources.sourceId":
            sourceId,

          "sources.enabled":
            true,
        })
        .select(
          "+sources.apiKeyHash"
        );

    if (!config) {
      return null;
    }

    const source =
      config.sources
        .find(
          (candidate) =>
            candidate.sourceId ===
              sourceId &&
            candidate.enabled
        );

    if (
      !source ||
      !source.apiKeyHash
    ) {
      return null;
    }

    const providedHash =
      hashApiKey(
        rawApiKey
      );

    if (
      !safeTimingEqual(
        providedHash,
        source.apiKeyHash
      )
    ) {
      return null;
    }

    return {
      organizationId:
        config.organizationId,

      environmentId:
        config.environmentId,

      tenantId:
        config.tenantId,

      source,

      config,
    };
  }

  // ==========================================================================
  // INGESTION
  // ==========================================================================

  async ingestEvent(
    sourceId,
    rawApiKey,
    rawPayload,
    headers = {}
  ) {
    const startTime =
      Date.now();

    const sourceContext =
      await this
        .authenticateSource(
          sourceId,
          rawApiKey
        );

    if (!sourceContext) {
      throw Object.assign(
        new Error(
          "Webhook authentication failed"
        ),
        {
          status:
            401,

          code:
            "WEBHOOK_AUTH_FAILED",
        }
      );
    }

    const {
      organizationId,
      environmentId,
      tenantId,
      source,
      config,
    } =
      sourceContext;

    let adapter;

    try {
      adapter =
        getAdapter(
          source.type
        );
    } catch (
      error
    ) {
      throw Object.assign(
        new Error(
          `Webhook provider adapter is unavailable: ${source.type}`
        ),
        {
          status:
            501,

          code:
            "WEBHOOK_ADAPTER_UNAVAILABLE",

          cause:
            error,
        }
      );
    }

    /*
     * The AIRA webhook API key authenticates access to this
     * ingestion endpoint.
     *
     * Provider-specific secrets are independent and should
     * eventually come from IntegrationConnection.
     */
    const runtimeConnection = {
      organizationId,

      environmentId,

      tenantId,

      provider:
        source.type,

      nonSecretConfig:
        source.mappings ||
        {},

      _decryptedSecret:
        null,
    };

    let normalizedEvents;

    try {
      normalizedEvents =
        await adapter
          .receiveEvent(
            runtimeConnection,
            rawPayload,
            headers
          );
    } catch (
      error
    ) {
      throw Object.assign(
        new Error(
          `Provider event normalization failed: ${error.message}`
        ),
        {
          status:
            error.status ||
            422,

          code:
            error.code ||
            "WEBHOOK_NORMALIZATION_FAILED",

          cause:
            error,
        }
      );
    }

    if (
      !Array.isArray(
        normalizedEvents
      )
    ) {
      normalizedEvents = [
        normalizedEvents,
      ];
    }

    normalizedEvents =
      normalizedEvents.filter(
        (event) =>
          event &&
          typeof event ===
            "object"
      );

    const result = {
      accepted:
        0,

      duplicates:
        0,

      events:
        [],
    };

    for (
      let index = 0;
      index <
      normalizedEvents.length;
      index++
    ) {
      const normalized =
        normalizedEvents[
          index
        ];

      const providerEventId =
        normalized
          .externalEventId ||
        normalized
          .fingerprint ||
        rawPayload
          ?.eventId ||
        rawPayload
          ?.id ||
        null;

      /*
       * IMPORTANT:
       *
       * Do not use fingerprint directly as eventId.
       *
       * Alertmanager/Grafana commonly reuse the same fingerprint
       * when an alert transitions:
       *
       * firing -> resolved
       *
       * Event identity includes lifecycle state and timestamps.
       */
      const eventId =
        this
          .buildDeterministicEventId(
            source.sourceId,
            normalized,
            index,
            providerEventId
          );

      const severity =
        this
          .normalizeSeverity(
            normalized
              .severity
          );

      const timestamp =
        this
          .resolveEventTimestamp(
            normalized
          );

      const event =
        new this
          .WebhookEvent({
            organizationId,

            environmentId,

            tenantId,

            sourceId:
              source.sourceId,

            source:
              source.type,

            eventId,

            providerEventId,

            eventType:
              normalized
                .eventType ||
              "webhook.event",

            timestamp,

            alert: {
              name:
                normalized.title ||
                normalized
                  .eventType ||
                "Operational event",

              service:
                normalized
                  .service ||
                null,

              pattern:
                normalized
                  .eventType ||
                this
                  .inferPattern(
                    rawPayload ||
                    {}
                  ),

              severity,

              description:
                normalized
                  .annotations
                  ?.description ||
                normalized
                  .annotations
                  ?.summary ||
                normalized.title ||
                null,

              metrics:
                sanitizePayloadMetadata(
                  normalized
                    .metrics ||
                  {}
                ),
            },

            providerStatus:
              normalized
                .status ||
              null,

            status:
              (
                config.autoAction &&
                this.shouldAction(
                  severity,
                  config
                    .severityThreshold
                )
              )
                ? "processing"
                : "received",

            processingTimeMs:
              Date.now() -
              startTime,

            sourceMetadata:
              sanitizePayloadMetadata({
                provider:
                  source.type,

                eventType:
                  normalized
                    .eventType ||
                  null,

                status:
                  normalized
                    .status ||
                  null,

                labels:
                  normalized
                    .labels ||
                  {},

                annotations:
                  normalized
                    .annotations ||
                  {},

                fingerprint:
                  normalized
                    .fingerprint ||
                  null,

                startsAt:
                  normalized
                    .startsAt ||
                  null,

                endsAt:
                  normalized
                    .endsAt ||
                  null,

                receivedAt:
                  normalized
                    .receivedAt ||
                  new Date()
                    .toISOString(),
              }),
          });

      try {
        await event.save();

        result.accepted +=
          1;

        result.events.push(
          event
        );
      } catch (
        error
      ) {
        if (
          error?.code ===
          11000
        ) {
          result.duplicates +=
            1;

          continue;
        }

        throw Object.assign(
          new Error(
            `Failed to persist webhook event: ${error.message}`
          ),
          {
            code:
              "WEBHOOK_EVENT_PERSISTENCE_FAILED",

            cause:
              error,
          }
        );
      }
    }

    return result;
  }

  // ==========================================================================
  // DECISION
  // ==========================================================================

  async recordAiiraDecision(
    eventId,
    decision,
    context
  ) {
    try {
      const {
        organizationId,
        environmentId,
      } =
        this
          .assertEnvironmentContext(
            context,
            {
              requireTenant:
                false,
            }
          );

      const event =
        await this
          .WebhookEvent
          .findOne({
            eventId,

            organizationId,

            environmentId,
          });

      if (!event) {
        throw Object.assign(
          new Error(
            "Event not found"
          ),
          {
            status:
              404,

            code:
              "WEBHOOK_EVENT_NOT_FOUND",
          }
        );
      }

      event.aiiraDecision = {
        action:
          decision.action,

        confidence:
          decision.confidence,

        reasoning:
          decision.reasoning,

        decisionTraceId:
          decision
            .decisionTraceId,
      };

      event.status =
        "actioned";

      await event.save();

      return event;
    } catch (
      error
    ) {
      if (
        error.status ||
        error.code
      ) {
        throw error;
      }

      throw Object.assign(
        new Error(
          `Failed to record decision: ${error.message}`
        ),
        {
          code:
            "WEBHOOK_DECISION_RECORD_FAILED",

          cause:
            error,
        }
      );
    }
  }

  // ==========================================================================
  // HISTORY
  // ==========================================================================

  async getEventHistory(
    context,
    sourceId = null,
    limit = 50
  ) {
    try {
      const {
        organizationId,
        environmentId,
      } =
        this
          .assertEnvironmentContext(
            context,
            {
              requireTenant:
                false,
            }
          );

      const query = {
        organizationId,

        environmentId,
      };

      if (sourceId) {
        query.sourceId =
          sourceId;
      }

      const safeLimit =
        Math.min(
          Math.max(
            Number.parseInt(
              limit,
              10
            ) ||
            50,
            1
          ),
          200
        );

      return this
        .WebhookEvent
        .find(
          query
        )
        .sort({
          timestamp:
            -1,
        })
        .limit(
          safeLimit
        )
        .lean();
    } catch (
      error
    ) {
      if (
        error.status ||
        error.code
      ) {
        throw error;
      }

      throw Object.assign(
        new Error(
          `Failed to get event history: ${error.message}`
        ),
        {
          code:
            "WEBHOOK_HISTORY_FAILED",

          cause:
            error,
        }
      );
    }
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  async getStatistics(
    context
  ) {
    const {
      organizationId,
      environmentId,
    } =
      this
        .assertEnvironmentContext(
          context,
          {
            requireTenant:
              false,
          }
        );

    const organizationObjectId =
      this
        .toObjectId(
          organizationId,
          "organizationId"
        );

    const environmentObjectId =
      this
        .toObjectId(
          environmentId,
          "environmentId"
        );

    return this
      .WebhookEvent
      .aggregate([
        {
          $match: {
            organizationId:
              organizationObjectId,

            environmentId:
              environmentObjectId,
          },
        },

        {
          $group: {
            _id:
              "$source",

            total: {
              $sum:
                1,
            },

            received: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "received",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            processing: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "processing",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            processed: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      "$status",
                      [
                        "actioned",
                        "skipped",
                      ],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            failed: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "failed",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            avgProcessingTime: {
              $avg:
                "$processingTimeMs",
            },
          },
        },

        {
          $sort: {
            total:
              -1,
          },
        },
      ]);
  }

  // ==========================================================================
  // EVENT IDENTITY
  // ==========================================================================

  buildDeterministicEventId(
    sourceId,
    normalized,
    index,
    providerEventId = null
  ) {
    const identity = {
      sourceId,

      providerEventId,

      eventType:
        normalized
          .eventType ||
        null,

      title:
        normalized.title ||
        null,

      service:
        normalized.service ||
        null,

      /*
       * Required so firing and resolved alert events remain distinct.
       */
      status:
        normalized.status ||
        null,

      startsAt:
        normalized.startsAt ||
        null,

      endsAt:
        normalized.endsAt ||
        null,

      fingerprint:
        normalized
          .fingerprint ||
        null,

      index,
    };

    const digest =
      crypto
        .createHash(
          "sha256"
        )
        .update(
          JSON.stringify(
            identity
          )
        )
        .digest(
          "hex"
        );

    return (
      `evt_${digest.slice(
        0,
        48
      )}`
    );
  }

  // ==========================================================================
  // SEVERITY
  // ==========================================================================

  normalizeSeverity(
    severity
  ) {
    const value =
      String(
        severity ||
        "medium"
      )
        .trim()
        .toLowerCase();

    if (
      [
        "critical",
        "fatal",
        "page",
        "sev0",
        "sev1",
        "p0",
        "p1",
      ].includes(
        value
      )
    ) {
      return "critical";
    }

    if (
      [
        "high",
        "sev2",
        "p2",
      ].includes(
        value
      )
    ) {
      return "high";
    }

    if (
      [
        "warning",
        "warn",
        "medium",
        "sev3",
        "p3",
      ].includes(
        value
      )
    ) {
      return "medium";
    }

    return "low";
  }

  // ==========================================================================
  // TIMESTAMP
  // ==========================================================================

  resolveEventTimestamp(
    normalized
  ) {
    const candidates = [
      normalized.startsAt,
      normalized.timestamp,
      normalized.receivedAt,
    ];

    for (
      const candidate
      of candidates
    ) {
      if (!candidate) {
        continue;
      }

      const date =
        new Date(
          candidate
        );

      if (
        !Number.isNaN(
          date.getTime()
        )
      ) {
        return date;
      }
    }

    return new Date();
  }

  // ==========================================================================
  // CONTEXT
  // ==========================================================================

  assertEnvironmentContext(
    context,
    {
      requireTenant = true,
    } = {}
  ) {
    if (
      !context
        ?.organizationId
    ) {
      throw Object.assign(
        new Error(
          "organizationId is required"
        ),
        {
          status:
            400,

          code:
            "ORGANIZATION_CONTEXT_REQUIRED",
        }
      );
    }

    if (
      !context
        ?.environmentId
    ) {
      throw Object.assign(
        new Error(
          "environmentId is required"
        ),
        {
          status:
            400,

          code:
            "ENVIRONMENT_CONTEXT_REQUIRED",
        }
      );
    }

    if (
      requireTenant &&
      !context
        ?.tenantId
    ) {
      throw Object.assign(
        new Error(
          "tenantId is required"
        ),
        {
          status:
            400,

          code:
            "TENANT_CONTEXT_REQUIRED",
        }
      );
    }

    return {
      organizationId:
        context
          .organizationId,

      environmentId:
        context
          .environmentId,

      tenantId:
        context
          .tenantId ||
        null,
    };
  }

  toObjectId(
    value,
    field
  ) {
    if (
      value instanceof
      mongoose.Types.ObjectId
    ) {
      return value;
    }

    if (
      !mongoose.Types.ObjectId
        .isValid(
          value
        )
    ) {
      throw Object.assign(
        new Error(
          `${field} is invalid`
        ),
        {
          status:
            400,

          code:
            "INVALID_WEBHOOK_CONTEXT_ID",
        }
      );
    }

    return new mongoose
      .Types.ObjectId(
        value
      );
  }

  // ==========================================================================
  // LEGACY PATTERN CLASSIFICATION
  // ==========================================================================

  inferPattern(
    payload
  ) {
    const metricName =
      String(
        payload
          ?.metricName ||
        ""
      )
        .trim()
        .toLowerCase();

    if (
      metricName.includes(
        "error"
      )
    ) {
      return "high-error-rate";
    }

    if (
      metricName.includes(
        "latency"
      )
    ) {
      return "high-latency";
    }

    if (
      metricName.includes(
        "cpu"
      )
    ) {
      return "high-cpu";
    }

    if (
      metricName.includes(
        "memory"
      )
    ) {
      return "memory-pressure";
    }

    return "unknown-pattern";
  }

  shouldAction(
    severity,
    threshold
  ) {
    const levels = {
      low:
        1,

      medium:
        2,

      high:
        3,

      critical:
        4,
    };

    const severityLevel =
      levels[
        severity
      ] ||
      1;

    const thresholdLevel =
      levels[
        threshold
      ] ||
      2;

    return (
      severityLevel >=
      thresholdLevel
    );
  }
}

module.exports =
  new WebhookIngestionService();