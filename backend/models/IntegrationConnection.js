"use strict";

const mongoose = require("mongoose");

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
  "revoke",
];

const nonSecretConfigSchema =
  new mongoose.Schema(
    {},
    {
      _id: false,
      strict: false,
    }
  );

const integrationConnectionSchema =
  new mongoose.Schema(
    {
      /**
       * Canonical organization ownership boundary.
       */
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

      /**
       * Canonical environment ownership boundary.
       *
       * Temporarily optional until existing integration
       * connections have been migrated.
       */
      environmentId: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref:
          "Environment",
        required:
          false,
        default:
          null,
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

      provider: {
        type:
          String,
        required:
          true,
        trim:
          true,
        maxlength:
          64,
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

      /**
       * Services associated with this integration.
       *
       * Route/service logic must verify that every service belongs
       * to the same organization + environment as this connection.
       */
      serviceIds: {
        type: [
          mongoose.Schema.Types.ObjectId,
        ],
        ref:
          "Service",
        default:
          [],
      },

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

      capabilities: {
        type:
          [String],
        enum:
          CAPABILITIES,
        default:
          [],
      },

      /**
       * Non-sensitive provider configuration.
       *
       * Secrets must never be stored here.
       */
      nonSecretConfig: {
        type:
          nonSecretConfigSchema,
        default:
          {},
      },

      /**
       * AES-256-GCM encrypted secret blob/reference.
       *
       * Decrypted credentials must remain memory-only.
       */
      encryptedSecretReference: {
        type:
          String,
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

      healthStatus: {
        type:
          String,
        enum:
          HEALTH_STATUSES,
        default:
          "unknown",
      },

      errorSummary: {
        type:
          String,
        maxlength:
          512,
        default:
          null,
      },

      createdBy: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref:
          "User",
        default:
          null,
      },

      disabledAt: {
        type:
          Date,
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

/**
 * ------------------------------------------------------------------
 * ENVIRONMENT-SCOPED INDEXES
 * ------------------------------------------------------------------
 */

/**
 * Provider lookup inside an environment.
 */
integrationConnectionSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  provider:
    1,
});

/**
 * Connection status inside an environment.
 */
integrationConnectionSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  status:
    1,
});

/**
 * Health dashboard queries.
 */
integrationConnectionSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  healthStatus:
    1,
});

/**
 * Service-linked integrations.
 */
integrationConnectionSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  serviceIds:
    1,
});

/**
 * Common environment list ordering.
 */
integrationConnectionSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  createdAt:
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