"use strict";

const mongoose = require("mongoose");

const INCIDENT_STATUSES = [
  "open",
  "acknowledged",
  "investigating",
  "recovering",
  "resolved",
  "closed",
];

const INCIDENT_SEVERITIES = [
  "info",
  "warning",
  "critical",
];

const INCIDENT_SOURCES = [
  "monitor",
  "manual",
  "alert",
  "integration",
];

const ACTIVE_INCIDENT_STATUSES = [
  "open",
  "acknowledged",
  "investigating",
  "recovering",
];

const evidenceSchema =
  new mongoose.Schema(
    {
      checkedAt:
        Date,

      status:
        String,

      statusCode:
        Number,

      responseTimeMs:
        Number,

      errorCode:
        String,

      sanitizedErrorMessage:
        String,

      checkerRegion:
        String,
    },
    {
      _id: false,
    }
  );

const timelineEventSchema =
  new mongoose.Schema(
    {
      occurredAt: {
        type: Date,
        required: true,
        default: Date.now,
      },

      eventType: {
        type: String,
        required: true,
      },

      actor: {
        type: String,
        enum: [
          "system",
          "user",
        ],
        default:
          "system",
      },

      actorId: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref:
          "User",
      },

      description: {
        type: String,
        required: true,
      },

      metadata: {
        type:
          mongoose.Schema.Types.Mixed,
      },
    },
    {
      _id: true,
    }
  );

const incidentSchema =
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
       * Temporarily optional until existing Incident records
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

      /**
       * Service where the incident occurred.
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

      /**
       * Monitor that detected the failure.
       *
       * May be absent for manual/integration incidents.
       */
      monitorId: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref:
          "Monitor",
        default:
          null,
        index:
          true,
      },

      /**
       * -------------------------------------------------------------
       * DEDUPLICATION
       * -------------------------------------------------------------
       */

      source: {
        type:
          String,
        enum:
          INCIDENT_SOURCES,
        default:
          "monitor",
      },

      sourceEventId: {
        type:
          String,
        default:
          null,
      },

      /**
       * Deterministic failure fingerprint.
       *
       * The environment is part of the fingerprint so that
       * identical failures in Staging and Production are separate
       * incidents.
       */
      fingerprint: {
        type:
          String,
        required:
          true,
        index:
          true,
      },

      /**
       * -------------------------------------------------------------
       * DESCRIPTION
       * -------------------------------------------------------------
       */

      title: {
        type:
          String,
        required:
          true,
        maxlength:
          256,
      },

      description: {
        type:
          String,
        maxlength:
          2048,
      },

      severity: {
        type:
          String,
        enum:
          INCIDENT_SEVERITIES,
        default:
          "warning",
      },

      status: {
        type:
          String,
        enum:
          INCIDENT_STATUSES,
        default:
          "open",
        index:
          true,
      },

      impact: {
        type:
          String,
        maxlength:
          512,
      },

      /**
       * -------------------------------------------------------------
       * TIMING
       * -------------------------------------------------------------
       */

      startedAt: {
        type:
          Date,
        required:
          true,
      },

      detectedAt: {
        type:
          Date,
        required:
          true,
      },

      acknowledgedAt:
        Date,

      resolvedAt:
        Date,

      lastObservedAt: {
        type:
          Date,
        required:
          true,
      },

      /**
       * Repeated failure tracking.
       */
      occurrenceCount: {
        type:
          Number,
        default:
          1,
        min:
          1,
      },

      /**
       * Sanitized evidence from monitor checks.
       */
      evidence: {
        type:
          [evidenceSchema],
        default:
          [],
      },

      /**
       * -------------------------------------------------------------
       * ASSIGNMENT / RESOLUTION
       * -------------------------------------------------------------
       */

      assignedTo: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref:
          "User",
        default:
          null,
      },

      resolution: {
        type:
          String,
        maxlength:
          2048,
      },

      tags: {
        type:
          [String],
        default:
          [],
      },

      /**
       * Full incident lifecycle.
       */
      timeline: {
        type:
          [timelineEventSchema],
        default:
          [],
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

incidentSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  fingerprint:
    1,
});

/**
 * Common incident-list query.
 */
incidentSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  status:
    1,

  createdAt:
    -1,
});

/**
 * Incidents for a service inside an environment.
 */
incidentSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  serviceId:
    1,

  status:
    1,
});

/**
 * Monitor-driven incident lookup.
 */
incidentSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  monitorId:
    1,

  status:
    1,
});

/**
 * Deduplication support.
 *
 * Only one ACTIVE incident with the same failure fingerprint
 * should exist inside one environment.
 *
 * Resolved/closed incidents remain historical records and a
 * later occurrence may create a new incident.
 */
incidentSchema.index(
  {
    organizationId:
      1,

    environmentId:
      1,

    fingerprint:
      1,
  },
  {
    unique:
      true,

    partialFilterExpression: {
      environmentId: {
        $type:
          "objectId",
      },

      status: {
        $in:
          ACTIVE_INCIDENT_STATUSES,
      },
    },

    name:
      "unique_active_incident_per_environment",
  }
);

/**
 * ------------------------------------------------------------------
 * FINGERPRINT
 * ------------------------------------------------------------------
 *
 * Environment MUST participate in incident identity.
 *
 * Otherwise:
 *
 * Staging payment-api failure
 *
 * could accidentally deduplicate against:
 *
 * Production payment-api failure.
 */
function buildFingerprint({
  organizationId,
  environmentId,
  serviceId,
  monitorId,
  errorCode,
  source = "monitor",
}) {
  if (!organizationId) {
    throw new Error(
      "organizationId is required to build incident fingerprint"
    );
  }

  if (!environmentId) {
    throw new Error(
      "environmentId is required to build incident fingerprint"
    );
  }

  if (!serviceId) {
    throw new Error(
      "serviceId is required to build incident fingerprint"
    );
  }

  return [
    organizationId,
    environmentId,
    serviceId,
    monitorId || "no-monitor",
    source,
    errorCode ||
      "http_failure",
  ]
    .map(String)
    .join("::");
}

const Incident =
  mongoose.model(
    "Incident",
    incidentSchema
  );

module.exports = {
  Incident,

  INCIDENT_STATUSES,
  INCIDENT_SEVERITIES,
  INCIDENT_SOURCES,

  ACTIVE_INCIDENT_STATUSES,

  buildFingerprint,
};