"use strict";

const mongoose =
  require("mongoose");

const CONNECTION_STATUSES = [
  "draft",
  "connected",
  "degraded",
  "disconnected",
  "disabled",
];

const HEALTH_STATUSES = [
  "unknown",
  "healthy",
  "degraded",
  "unhealthy",
];

const CAPABILITIES = [
  "receive_events",
  "normalize_events",
  "send_notifications",
  "get_health",
  "discover_resources",
  "query_metrics",
  "query_logs",
  "query_traces",
  "revoke",
];

const nonSecretConfigSchema =
  new mongoose.Schema(
    {},
    {
      _id:
        false,

      strict:
        false,
    }
  );

const integrationConnectionSchema =
  new mongoose.Schema(
    {
      // ======================================================================
      // OWNERSHIP
      // ======================================================================

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

      /*
       * Concept 1 is complete.
       *
       * All operational integrations must now belong to
       * exactly one environment.
       */
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
       * Legacy compatibility identifier.
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

      // ======================================================================
      // IDENTITY
      // ======================================================================

      provider: {
        type:
          String,

        required:
          true,

        trim:
          true,

        lowercase:
          true,

        maxlength:
          64,

        index:
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

      /*
       * Optional provider-side identity.
       *
       * Examples:
       *
       * Kubernetes cluster name
       * AWS account ID
       * Datadog site/account
       * Grafana instance ID
       */
      externalAccountId: {
        type:
          String,

        trim:
          true,

        maxlength:
          256,

        default:
          null,
      },

      // ======================================================================
      // SERVICE ASSOCIATION
      // ======================================================================

      serviceIds: {
        type: [
          mongoose.Schema.Types.ObjectId,
        ],

        ref:
          "Service",

        default:
          [],
      },

      // ======================================================================
      // CAPABILITIES
      // ======================================================================

      /*
       * Snapshot of the provider capabilities when the
       * connection is created/updated.
       *
       * The catalogue remains the authoritative definition.
       */
      capabilities: {
        type:
          [String],

        enum:
          CAPABILITIES,

        default:
          [],
      },

      // ======================================================================
      // LIFECYCLE
      // ======================================================================

      status: {
        type:
          String,

        enum:
          CONNECTION_STATUSES,

        default:
          "draft",

        index:
          true,
      },

      connectedAt: {
        type:
          Date,

        default:
          null,
      },

      disconnectedAt: {
        type:
          Date,

        default:
          null,
      },

      disabledAt: {
        type:
          Date,

        default:
          null,
      },

      disabledReason: {
        type:
          String,

        trim:
          true,

        maxlength:
          512,

        default:
          null,
      },

      // ======================================================================
      // PROVIDER CONFIGURATION
      // ======================================================================

      /*
       * Absolutely no credentials/tokens/passwords should
       * be placed here.
       */
      nonSecretConfig: {
        type:
          nonSecretConfigSchema,

        default:
          () => ({}),
      },

      /*
       * Encrypted credential blob or external secret-manager
       * reference.
       */
      encryptedSecretReference: {
        type:
          String,

        default:
          null,

        select:
          false,
      },

      /*
       * Encryption/reference format version.
       */
      secretVersion: {
        type:
          String,

        default:
          null,
      },

      secretUpdatedAt: {
        type:
          Date,

        default:
          null,
      },

      // ======================================================================
      // OPERATIONAL HEALTH
      // ======================================================================

      healthStatus: {
        type:
          String,

        enum:
          HEALTH_STATUSES,

        default:
          "unknown",

        index:
          true,
      },

      lastHealthCheckAt: {
        type:
          Date,

        default:
          null,
      },

      lastEventAt: {
        type:
          Date,

        default:
          null,
      },

      lastSuccessfulEventAt: {
        type:
          Date,

        default:
          null,
      },

      lastErrorAt: {
        type:
          Date,

        default:
          null,
      },

      errorSummary: {
        type:
          String,

        maxlength:
          512,

        default:
          null,
      },

      consecutiveFailures: {
        type:
          Number,

        min:
          0,

        default:
          0,
      },

      /*
       * Last observed connection latency.
       */
      lastLatencyMs: {
        type:
          Number,

        min:
          0,

        default:
          null,
      },

      // ======================================================================
      // CREATION
      // ======================================================================

      createdBy: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        default:
          null,
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
// NORMALIZATION / LIFECYCLE
// ============================================================================

integrationConnectionSchema.pre(
  "validate",

  function normalizeConnection(
    next
  ) {
    if (
      Array.isArray(
        this.capabilities
      )
    ) {
      this.capabilities = [
        ...new Set(
          this.capabilities
        ),
      ];
    }

    if (
      Array.isArray(
        this.serviceIds
      )
    ) {
      this.serviceIds = [
        ...new Map(
          this.serviceIds.map(
            (id) => [
              String(id),
              id,
            ]
          )
        ).values(),
      ];
    }

    if (
      this.status ===
      "connected"
    ) {
      if (
        !this.connectedAt
      ) {
        this.connectedAt =
          new Date();
      }

      this.disconnectedAt =
        null;

      this.disabledAt =
        null;

      this.disabledReason =
        null;
    }

    if (
      this.status ===
      "disconnected" &&
      !this.disconnectedAt
    ) {
      this.disconnectedAt =
        new Date();
    }

    if (
      this.status ===
      "disabled"
    ) {
      if (
        !this.disabledAt
      ) {
        this.disabledAt =
          new Date();
      }
    }

    return next();
  }
);

// ============================================================================
// INDEXES
// ============================================================================

integrationConnectionSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  provider:
    1,

  status:
    1,
});

integrationConnectionSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  healthStatus:
    1,

  status:
    1,
});

integrationConnectionSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  serviceIds:
    1,
});

integrationConnectionSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  createdAt:
    -1,
});

integrationConnectionSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  provider:
    1,

  name:
    1,
});

integrationConnectionSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  lastHealthCheckAt:
    -1,
});

const IntegrationConnection =
  mongoose.model(
    "IntegrationConnection",
    integrationConnectionSchema
  );

module.exports = {
  IntegrationConnection,

  CONNECTION_STATUSES,

  HEALTH_STATUSES,

  CAPABILITIES,
};