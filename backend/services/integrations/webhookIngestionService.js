"use strict";

const crypto = require("crypto");
const mongoose = require("mongoose");

/**
 * Webhook Ingestion Service
 *
 * Canonical ownership:
 *
 * Organization
 *   -> Environment
 *      -> Integration / Webhook Source
 *         -> Webhook Event
 *
 * IMPORTANT:
 *
 * Incoming webhook requests MUST NOT determine their environment
 * from a browser-selected environment.
 *
 * The environment must be resolved from the registered webhook
 * source / integration identity.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WEBHOOK_SOURCE_TYPES = [
  "datadog",
  "pagerduty",
  "prometheus",
  "custom",
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

// ---------------------------------------------------------------------------
// Source schema
// ---------------------------------------------------------------------------

const webhookSourceSchema =
  new mongoose.Schema(
    {
      /**
       * Stable source identifier.
       *
       * External callers should reference this ID rather than
       * trusting arbitrary source names.
       */
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

      /**
       * API key is stored as a SHA-256 hash.
       *
       * Raw webhook secrets must never be persisted.
       */
      apiKeyHash: {
        type:
          String,
        default:
          null,
      },

      endpoints: {
        type:
          [String],
        default:
          [],
      },

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

// ---------------------------------------------------------------------------
// Webhook configuration
// ---------------------------------------------------------------------------

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

      /**
       * Legacy tenant identifier.
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

/**
 * Exactly one webhook configuration per environment.
 */
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

// ---------------------------------------------------------------------------
// Webhook event
// ---------------------------------------------------------------------------

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

      /**
       * Registered source ID.
       */
      sourceId: {
        type:
          String,
        required:
          true,
        index:
          true,
      },

      /**
       * Human/provider source type.
       */
      source: {
        type:
          String,
        required:
          true,
      },

      /**
       * External provider event identifier.
       *
       * This is NOT globally unique by itself.
       */
      eventId: {
        type:
          String,
        required:
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
      },

      processingTimeMs:
        Number,

      error: {
        type:
          String,
        maxlength:
          1024,
        default:
          null,
      },

      /**
       * Sanitized metadata only.
       *
       * Do not place raw Authorization/API tokens here.
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

/**
 * Provider event IDs only need to be unique inside one registered source.
 */
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

  status:
    1,

  timestamp:
    -1,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateSourceId() {
  return `whsrc_${crypto
    .randomBytes(12)
    .toString("hex")}`;
}

function generateApiKey() {
  return `aira_wh_${crypto
    .randomBytes(24)
    .toString("hex")}`;
}

function hashApiKey(value) {
  return crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex");
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

  return crypto.timingSafeEqual(
    firstBuffer,
    secondBuffer
  );
}

function sanitizePayloadMetadata(
  payload
) {
  if (
    !payload ||
    typeof payload !==
      "object"
  ) {
    return {};
  }

  const blockedKeys =
    new Set([
      "authorization",
      "apiKey",
      "apikey",
      "api_key",
      "token",
      "accessToken",
      "access_token",
      "secret",
      "password",
      "cookie",
    ]);

  const clean = {};

  for (
    const [
      key,
      value,
    ]
    of Object.entries(payload)
  ) {
    if (
      blockedKeys.has(key)
    ) {
      continue;
    }

    clean[key] =
      value;
  }

  return clean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class WebhookIngestionService {
  constructor() {
    this.WebhookEvent =
      mongoose.models.WebhookEvent ||
      mongoose.model(
        "WebhookEvent",
        webhookEventSchema,
        "webhook_events"
      );

    this.WebhookConfig =
      mongoose.models.WebhookConfig ||
      mongoose.model(
        "WebhookConfig",
        webhookConfigSchema,
        "webhook_configs"
      );
  }

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  /**
   * Register webhook source.
   *
   * context:
   *
   * {
   *   organizationId,
   *   environmentId,
   *   tenantId
   * }
   */
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
        this.assertEnvironmentContext(
          context
        );

      if (
        !sourceConfig?.name
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

      if (
        !WEBHOOK_SOURCE_TYPES.includes(
          sourceConfig.type
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

      const sourceId =
        generateSourceId();

      /**
       * Generate a credential when caller did not explicitly
       * provide one.
       *
       * The raw key is returned exactly once.
       */
      const rawApiKey =
        sourceConfig.apiKey ||
        generateApiKey();

      const storedSource = {
        sourceId,

        name:
          sourceConfig.name,

        type:
          sourceConfig.type,

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
            ? sourceConfig.endpoints
            : [],

        mappings:
          sourceConfig.mappings ||
          {},
      };

      let config =
        await this.WebhookConfig
          .findOne({
            organizationId,
            environmentId,
          });

      if (!config) {
        config =
          new this.WebhookConfig({
            organizationId,
            environmentId,
            tenantId,

            sources: [
              storedSource,
            ],
          });
      } else {
        const duplicate =
          config.sources.some(
            (source) =>
              source.name ===
                storedSource.name ||
              source.sourceId ===
                storedSource.sourceId
          );

        if (duplicate) {
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

        /**
         * Display this once to the user.
         *
         * Never store/return it again.
         */
        apiKey:
          rawApiKey,
      };
    } catch (error) {
      if (
        error.status ||
        error.code
      ) {
        throw error;
      }

      throw new Error(
        `Failed to register webhook source: ${error.message}`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Source authentication
  // -------------------------------------------------------------------------

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

    const config =
      await this.WebhookConfig
        .findOne({
          "sources.sourceId":
            sourceId,

          "sources.enabled":
            true,
        });

    if (!config) {
      return null;
    }

    const source =
      config.sources.find(
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

  // -------------------------------------------------------------------------
  // Event ingestion
  // -------------------------------------------------------------------------

  /**
   * Environment is derived from authenticated source.
   *
   * Caller must NOT pass organizationId/environmentId from webhook payload.
   */
  async ingestEvent(
    sourceId,
    rawApiKey,
    webhookPayload
  ) {
    try {
      const startTime =
        Date.now();

      const sourceContext =
        await this.authenticateSource(
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

      const externalEventId =
        webhookPayload?.eventId ||
        crypto
          .randomUUID();

      const event =
        new this.WebhookEvent({
          organizationId,

          environmentId,

          tenantId,

          sourceId:
            source.sourceId,

          source:
            source.type,

          eventId:
            externalEventId,

          alert: {
            name:
              webhookPayload
                ?.alertName,

            service:
              webhookPayload
                ?.service,

            pattern:
              this.inferPattern(
                webhookPayload ||
                  {}
              ),

            severity:
              webhookPayload
                ?.severity ||
              "medium",

            description:
              webhookPayload
                ?.description,

            metrics:
              webhookPayload
                ?.metrics ||
              {},
          },

          sourceMetadata:
            sanitizePayloadMetadata(
              webhookPayload
            ),
        });

      await event.save();

      if (
        config.autoAction &&
        this.shouldAction(
          event.alert.severity,
          config.severityThreshold
        )
      ) {
        event.status =
          "processing";
      } else {
        event.status =
          "received";
      }

      event.processingTimeMs =
        Date.now() -
        startTime;

      await event.save();

      return event;
    } catch (error) {
      if (
        error?.code ===
        11000
      ) {
        throw Object.assign(
          new Error(
            "Webhook event has already been received"
          ),
          {
            status:
              409,

            code:
              "WEBHOOK_EVENT_DUPLICATE",
          }
        );
      }

      if (
        error.status ||
        error.code
      ) {
        throw error;
      }

      throw new Error(
        `Failed to ingest event: ${error.message}`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Decision
  // -------------------------------------------------------------------------

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
        this.assertEnvironmentContext(
          context
        );

      const event =
        await this.WebhookEvent
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
          decision.decisionTraceId,
      };

      event.status =
        "actioned";

      await event.save();

      return event;
    } catch (error) {
      if (
        error.status ||
        error.code
      ) {
        throw error;
      }

      throw new Error(
        `Failed to record decision: ${error.message}`
      );
    }
  }

  // -------------------------------------------------------------------------
  // History
  // -------------------------------------------------------------------------

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
        this.assertEnvironmentContext(
          context
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
            ) || 50,
            1
          ),
          200
        );

      return this.WebhookEvent
        .find(query)
        .sort({
          timestamp:
            -1,
        })
        .limit(
          safeLimit
        );
    } catch (error) {
      if (
        error.status ||
        error.code
      ) {
        throw error;
      }

      throw new Error(
        `Failed to get event history: ${error.message}`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  async getStatistics(
    context
  ) {
    try {
      const {
        organizationId,
        environmentId,
      } =
        this.assertEnvironmentContext(
          context
        );

      return this.WebhookEvent
        .aggregate([
          {
            $match: {
              organizationId:
                new mongoose
                  .Types.ObjectId(
                    organizationId
                  ),

              environmentId:
                new mongoose
                  .Types.ObjectId(
                    environmentId
                  ),
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
    } catch (error) {
      if (
        error.status ||
        error.code
      ) {
        throw error;
      }

      throw new Error(
        `Failed to get statistics: ${error.message}`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  assertEnvironmentContext(
    context
  ) {
    if (
      !context?.organizationId
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
      !context?.environmentId
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
      !context?.tenantId
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
        context.organizationId,

      environmentId:
        context.environmentId,

      tenantId:
        context.tenantId,
    };
  }

  inferPattern(payload) {
    if (
      payload.metricName &&
      payload.metricName.includes(
        "error"
      )
    ) {
      return "high-error-rate";
    }

    if (
      payload.metricName &&
      payload.metricName.includes(
        "latency"
      )
    ) {
      return "high-latency";
    }

    if (
      payload.metricName &&
      payload.metricName.includes(
        "cpu"
      )
    ) {
      return "high-cpu";
    }

    if (
      payload.metricName &&
      payload.metricName.includes(
        "memory"
      )
    ) {
      return "memory-leak";
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

    return (
      levels[severity] >=
      levels[threshold]
    );
  }
}

module.exports =
  new WebhookIngestionService();