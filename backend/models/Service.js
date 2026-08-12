"use strict";

const mongoose = require("mongoose");

const SERVICE_TYPES = [
  "website",
  "api",
  "backend",
  "microservice",
  "kubernetes",
  "docker",
  "cloud",
  "database",
  "other",
];

/**
 * Legacy compatibility field.
 *
 * New environment ownership is represented by environmentId.
 * We keep this enum temporarily because older UI/services may
 * still read the string value during Phase 1 migration.
 */
const SERVICE_ENVS = [
  "production",
  "staging",
  "development",
  "testing",
];

const SERVICE_STATUSES = [
  "active",
  "paused",
  "archived",
];

const VERIFICATION_STATUSES = [
  "unverified",
  "pending",
  "verified",
  "failed",
];

const MONITORING_STATUSES = [
  "not_configured",
  "configuring",
  "active",
  "paused",
  "error",
];

const ownershipVerificationSchema =
  new mongoose.Schema(
    {
      method: {
        type: String,
        enum: [
          "dns_txt",
          "file",
          "meta_tag",
          "none",
        ],
        default: "none",
      },

      token: {
        type: String,
        default: null,
      },

      verifiedAt: {
        type: Date,
        default: null,
      },

      lastAttemptAt: {
        type: Date,
        default: null,
      },

      failureReason: {
        type: String,
        default: null,
      },
    },
    {
      _id: false,
    }
  );

const serviceSchema =
  new mongoose.Schema(
    {
      /**
       * Canonical organization ownership boundary.
       */
      organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
        required: true,
        index: true,
      },

      /**
       * Canonical environment ownership boundary.
       *
       * This becomes required after existing Service records
       * are migrated in Phase 1D.
       *
       * During migration we keep required:false temporarily.
       */
      environmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Environment",
        required: false,
        index: true,
        default: null,
      },

      /**
       * Legacy tenant identifier.
       *
       * Retained for machine APIs and older subsystems.
       */
      tenantId: {
        type: String,
        required: true,
        index: true,
      },

      name: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 100,
      },

      slug: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        match: /^[a-z0-9_-]+$/,
      },

      description: {
        type: String,
        trim: true,
        maxlength: 500,
        default: null,
      },

      type: {
        type: String,
        enum: SERVICE_TYPES,
        required: true,
      },

      /**
       * Legacy compatibility environment string.
       *
       * New code should use environmentId.
       * We keep this field until all older services/hooks are migrated.
       */
      environment: {
        type: String,
        enum: SERVICE_ENVS,
        required: false,
        default: null,
      },

      baseUrl: {
        type: String,
        trim: true,
        default: null,
      },

      status: {
        type: String,
        enum: SERVICE_STATUSES,
        default: "active",
      },

      verificationStatus: {
        type: String,
        enum: VERIFICATION_STATUSES,
        default: "unverified",
      },

      monitoringStatus: {
        type: String,
        enum: MONITORING_STATUSES,
        default: "not_configured",
      },

      ownershipVerification: {
        type: ownershipVerificationSchema,
        default: () => ({}),
      },

      tags: {
        type: [String],
        default: [],

        validate: {
          validator: (arr) =>
            arr.length <= 20,

          message:
            "Maximum 20 tags allowed",
        },
      },

      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },

      verificationMethod: {
        type: String,
        enum: [
          "dns_txt",
          "file",
          "meta_tag",
          null,
        ],
        default: null,
      },

      verifiedAt: {
        type: Date,
        default: null,
      },

      archivedAt: {
        type: Date,
        default: null,
      },
    },
    {
      versionKey: false,
      timestamps: true,
    }
  );

/**
 * ---------------------------------------------------------------
 * UNIQUENESS
 * ---------------------------------------------------------------
 *
 * A service slug may exist once per environment.
 *
 * This allows:
 *
 * Development -> payment-api
 * Staging     -> payment-api
 * Production  -> payment-api
 */
serviceSchema.index(
  {
    organizationId: 1,
    environmentId: 1,
    slug: 1,
  },
  {
    unique: true,

    /**
     * Only enforce this index once environmentId exists.
     * Existing pre-migration records may still have environmentId=null.
     */
    partialFilterExpression: {
      environmentId: {
        $type: "objectId",
      },
    },
  }
);

/**
 * ---------------------------------------------------------------
 * COMMON ENVIRONMENT-SCOPED QUERIES
 * ---------------------------------------------------------------
 */

serviceSchema.index({
  organizationId: 1,
  environmentId: 1,
  status: 1,
});

serviceSchema.index({
  organizationId: 1,
  environmentId: 1,
  type: 1,
});

serviceSchema.index({
  organizationId: 1,
  environmentId: 1,
  createdAt: -1,
});


module.exports =
  mongoose.model(
    "Service",
    serviceSchema
  );

module.exports.SERVICE_TYPES =
  SERVICE_TYPES;

module.exports.SERVICE_ENVS =
  SERVICE_ENVS;

module.exports.SERVICE_STATUSES =
  SERVICE_STATUSES;

module.exports.VERIFICATION_STATUSES =
  VERIFICATION_STATUSES;

module.exports.MONITORING_STATUSES =
  MONITORING_STATUSES;