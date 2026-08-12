"use strict";

const mongoose = require("mongoose");

const CHECK_STATUSES = [
  "healthy",
  "degraded",
  "down",
  "unknown",
];

const monitorCheckSchema =
  new mongoose.Schema(
    {
      monitorId: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref:
          "Monitor",
        required:
          true,
        index:
          true,
      },

      serviceId: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref:
          "Service",
        required:
          true,
        index:
          true,
      },

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
       * Temporarily optional until existing MonitorCheck
       * records are migrated.
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
       * Legacy tenant identifier retained for compatibility.
       */
      tenantId: {
        type:
          String,
        required:
          true,
      },

      checkedAt: {
        type:
          Date,
        required:
          true,
      },

      status: {
        type:
          String,
        enum:
          CHECK_STATUSES,
        required:
          true,
      },

      checkerRegion: {
        type:
          String,
        default:
          "default",
      },

      // HTTP response fields
      statusCode: {
        type:
          Number,
        default:
          null,
      },

      responseTimeMs: {
        type:
          Number,
        default:
          null,
      },

      responseSizeBytes: {
        type:
          Number,
        default:
          null,
      },

      redirectCount: {
        type:
          Number,
        default:
          0,
      },

      // Timing breakdown (ms)
      dnsTimeMs: {
        type:
          Number,
        default:
          null,
      },

      tcpTimeMs: {
        type:
          Number,
        default:
          null,
      },

      tlsTimeMs: {
        type:
          Number,
        default:
          null,
      },

      firstByteTimeMs: {
        type:
          Number,
        default:
          null,
      },

      // SSL
      sslValid: {
        type:
          Boolean,
        default:
          null,
      },

      sslDaysRemaining: {
        type:
          Number,
        default:
          null,
      },

      // Assertion results
      contentMatched: {
        type:
          Boolean,
        default:
          null,
      },

      // Error info — no secrets
      errorCode: {
        type:
          String,
        default:
          null,
      },

      sanitizedErrorMessage: {
        type:
          String,
        default:
          null,
        maxlength:
          500,
      },
    },
    {
      versionKey:
        false,
    }
  );

/**
 * Per-monitor time-series lookup.
 */
monitorCheckSchema.index({
  monitorId:
    1,

  checkedAt:
    -1,
});

/**
 * Canonical environment-scoped history.
 *
 * Used for dashboards, reports and environment-isolated
 * operational analysis.
 */
monitorCheckSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  checkedAt:
    -1,
});

/**
 * Environment + service history.
 */
monitorCheckSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  serviceId:
    1,

  checkedAt:
    -1,
});

/**
 * Environment + monitor history.
 *
 * This lets workers/reporting systems verify complete ownership
 * while retrieving monitor checks.
 */
monitorCheckSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  monitorId:
    1,

  checkedAt:
    -1,
});

/**
 * Auto-delete checks older than 90 days.
 *
 * Later pricing/retention work can replace this global TTL
 * strategy with plan-aware archival/retention infrastructure.
 */
monitorCheckSchema.index(
  {
    checkedAt:
      1,
  },
  {
    expireAfterSeconds:
      90 *
      24 *
      60 *
      60,
  }
);

const MonitorCheck =
  mongoose.model(
    "MonitorCheck",
    monitorCheckSchema
  );

module.exports =
  MonitorCheck;

module.exports.CHECK_STATUSES =
  CHECK_STATUSES;