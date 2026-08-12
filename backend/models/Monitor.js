"use strict";

const mongoose = require("mongoose");

const MONITOR_TYPES = [
  "http",
  "https",
  "ssl",
];

const HTTP_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
];

const MONITOR_STATUSES = [
  "healthy",
  "degraded",
  "down",
  "unknown",
];

// Headers that could leak credentials — reject silently before storage.
const BLOCKED_HEADER_NAMES =
  new Set([
    "authorization",
    "cookie",
    "set-cookie",
    "proxy-authorization",
    "x-api-key",
    "x-auth-token",
    "x-access-token",
  ]);

const monitorSchema =
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
       * Temporarily optional until existing monitor records
       * are migrated.
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
       * Legacy tenant identifier retained for compatibility
       * with older machine/worker paths.
       */
      tenantId: {
        type:
          String,
        required:
          true,
        index:
          true,
      },

      /**
       * Parent service.
       *
       * Route/service logic must verify that serviceId belongs to
       * the same organization + environment as this monitor.
       */
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

      name: {
        type:
          String,
        required:
          true,
        trim:
          true,
        maxlength:
          100,
      },

      type: {
        type:
          String,
        enum:
          MONITOR_TYPES,
        required:
          true,
      },

      url: {
        type:
          String,
        required:
          true,
        trim:
          true,
        maxlength:
          2048,
      },

      method: {
        type:
          String,
        enum:
          HTTP_METHODS,
        default:
          "GET",
      },

      enabled: {
        type:
          Boolean,
        default:
          true,
      },

      intervalSeconds: {
        type:
          Number,
        default:
          60,
        min:
          30,
        max:
          86400,
      },

      timeoutMs: {
        type:
          Number,
        default:
          10000,
        min:
          1000,
        max:
          30000,
      },

      expectedStatusCodes: {
        type:
          [Number],
        default:
          [200],
      },

      expectedText: {
        type:
          String,
        default:
          null,
        maxlength:
          500,
      },

      /**
       * Only non-sensitive request headers.
       */
      requestHeaders: {
        type:
          Map,
        of:
          String,
        default:
          () => new Map(),
      },

      requestBody: {
        type:
          String,
        default:
          null,
        maxlength:
          10240,
      },

      followRedirects: {
        type:
          Boolean,
        default:
          true,
      },

      maximumRedirects: {
        type:
          Number,
        default:
          5,
        min:
          0,
        max:
          10,
      },

      sslExpiryWarningDays: {
        type:
          Number,
        default:
          30,
        min:
          1,
        max:
          90,
      },

      consecutiveFailureThreshold: {
        type:
          Number,
        default:
          3,
        min:
          1,
        max:
          10,
      },

      recoverySuccessThreshold: {
        type:
          Number,
        default:
          2,
        min:
          1,
        max:
          5,
      },

      regions: {
        type:
          [String],
        default:
          ["default"],
      },

      createdBy: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref:
          "User",
        required:
          true,
      },

      /**
       * -------------------------------------------------------------
       * Runtime health state
       * -------------------------------------------------------------
       */

      lastStatus: {
        type:
          String,
        enum: [
          ...MONITOR_STATUSES,
          null,
        ],
        default:
          "unknown",
      },

      lastCheckedAt: {
        type:
          Date,
        default:
          null,
      },

      lastStatusCode: {
        type:
          Number,
        default:
          null,
      },

      lastResponseTimeMs: {
        type:
          Number,
        default:
          null,
      },

      consecutiveFailures: {
        type:
          Number,
        default:
          0,
      },

      consecutiveSuccesses: {
        type:
          Number,
        default:
          0,
      },

      /**
       * -------------------------------------------------------------
       * Scheduler lock
       * -------------------------------------------------------------
       */

      nextCheckAt: {
        type:
          Date,
        default:
          () => new Date(),
        index:
          true,
      },

      lockedAt: {
        type:
          Date,
        default:
          null,
      },

      lockedBy: {
        type:
          String,
        default:
          null,
      },
    },
    {
      versionKey:
        false,
      timestamps:
        true,
    }
  );

/**
 * Parent-service lookups inside a specific environment.
 */
monitorSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  serviceId:
    1,
});

/**
 * Common UI/list queries.
 */
monitorSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  enabled:
    1,
});

/**
 * Environment-aware scheduler lookup.
 *
 * This becomes important when workers claim due monitors.
 */
monitorSchema.index({
  environmentId:
    1,

  enabled:
    1,

  nextCheckAt:
    1,

  lockedAt:
    1,
});

/**
 * Organization + environment worker lookup.
 *
 * Useful for partitioned workers and future regional scheduling.
 */
monitorSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  nextCheckAt:
    1,
});

/**
 * Transitional global scheduler index.
 *
 * Keep temporarily because existing worker code may still use it.
 * We can remove it once the worker itself is migrated.
 */
monitorSchema.index({
  enabled:
    1,

  nextCheckAt:
    1,

  lockedAt:
    1,
});

/**
 * Strip auth/cookie headers before persisting.
 */
function sanitizeHeaders(raw) {
  if (
    !raw ||
    typeof raw !==
      "object"
  ) {
    return {};
  }

  const output = {};

  for (
    const [key, value]
    of Object.entries(raw)
  ) {
    if (
      !BLOCKED_HEADER_NAMES.has(
        key.toLowerCase()
      )
    ) {
      output[key] =
        String(value).slice(
          0,
          512
        );
    }
  }

  return output;
}

const Monitor =
  mongoose.model(
    "Monitor",
    monitorSchema
  );

module.exports =
  Monitor;

module.exports.MONITOR_TYPES =
  MONITOR_TYPES;

module.exports.HTTP_METHODS =
  HTTP_METHODS;

module.exports.MONITOR_STATUSES =
  MONITOR_STATUSES;

module.exports.sanitizeHeaders =
  sanitizeHeaders;