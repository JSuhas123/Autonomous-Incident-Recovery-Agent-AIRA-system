"use strict";

const mongoose = require("mongoose");

const SIGNAL_TYPES = [
  "alert",
  "log",
  "metric",
  "trace",
  "monitor",
  "event",
  "health",
  "unknown",
];

const SIGNAL_SEVERITIES = [
  "unknown",
  "info",
  "warning",
  "critical",
];

const SIGNAL_STATUSES = [
  "received",
  "normalized",
  "enriched",
  "correlated",
  "routed",
  "ignored",
  "failed",
];

const SIGNAL_SOURCES = [
  "monitor",
  "integration",
  "telemetry",
  "manual",
  "internal",
];

const signalSchema = new mongoose.Schema(
  {
    // -----------------------------------------------------------------------
    // IDENTITY
    // -----------------------------------------------------------------------

    signalId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    environmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Environment",
      required: true,
      index: true,
    },

    tenantId: {
      type: String,
      required: true,
      index: true,
    },

    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      default: null,
      index: true,
    },

    monitorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Monitor",
      default: null,
      index: true,
    },

    integrationConnectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IntegrationConnection",
      default: null,
      index: true,
    },

    // -----------------------------------------------------------------------
    // SOURCE
    // -----------------------------------------------------------------------

    source: {
      type: String,
      enum: SIGNAL_SOURCES,
      required: true,
      index: true,
    },

    provider: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
      index: true,
    },

    sourceEventId: {
      type: String,
      default: null,
      maxlength: 512,
    },

    // -----------------------------------------------------------------------
    // SIGNAL CLASSIFICATION
    // -----------------------------------------------------------------------

    signalType: {
      type: String,
      enum: SIGNAL_TYPES,
      default: "unknown",
      index: true,
    },

    eventType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      index: true,
    },

    severity: {
      type: String,
      enum: SIGNAL_SEVERITIES,
      default: "unknown",
      index: true,
    },

    title: {
      type: String,
      required: true,
      maxlength: 512,
    },

    description: {
      type: String,
      maxlength: 4096,
      default: null,
    },

    // -----------------------------------------------------------------------
    // RESOURCE IDENTITY
    // -----------------------------------------------------------------------

    resource: {
      serviceName: {
        type: String,
        default: null,
      },

      namespace: {
        type: String,
        default: null,
      },

      cluster: {
        type: String,
        default: null,
      },

      pod: {
        type: String,
        default: null,
      },

      container: {
        type: String,
        default: null,
      },

      node: {
        type: String,
        default: null,
      },

      host: {
        type: String,
        default: null,
      },

      region: {
        type: String,
        default: null,
      },

      cloudProvider: {
        type: String,
        default: null,
      },

      resourceType: {
        type: String,
        default: null,
      },

      resourceId: {
        type: String,
        default: null,
      },
    },

    // -----------------------------------------------------------------------
    // TELEMETRY CORRELATION
    // -----------------------------------------------------------------------

    traceId: {
      type: String,
      default: null,
      index: true,
    },

    spanId: {
      type: String,
      default: null,
    },

    parentSpanId: {
      type: String,
      default: null,
    },

    correlationId: {
      type: String,
      default: null,
      index: true,
    },

    // -----------------------------------------------------------------------
    // FAILURE INFORMATION
    // -----------------------------------------------------------------------

    errorCode: {
      type: String,
      default: null,
      maxlength: 128,
      index: true,
    },

    statusCode: {
      type: Number,
      default: null,
    },

    errorMessage: {
      type: String,
      maxlength: 2048,
      default: null,
    },

    // -----------------------------------------------------------------------
    // METRIC INFORMATION
    // -----------------------------------------------------------------------

    metric: {
      name: {
        type: String,
        default: null,
      },

      value: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },

      unit: {
        type: String,
        default: null,
      },

      metricType: {
        type: String,
        default: null,
      },
    },

    // -----------------------------------------------------------------------
    // LABELS / ATTRIBUTES
    // -----------------------------------------------------------------------

    labels: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    annotations: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    attributes: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // -----------------------------------------------------------------------
    // DEDUPLICATION
    // -----------------------------------------------------------------------

    fingerprint: {
      type: String,
      required: true,
      index: true,
    },

    duplicateCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    firstSeenAt: {
      type: Date,
      required: true,
      default: Date.now,
    },

    lastSeenAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    // -----------------------------------------------------------------------
    // CORRELATION
    // -----------------------------------------------------------------------

    correlationGroupId: {
      type: String,
      default: null,
      index: true,
    },

    correlatedSignalIds: {
      type: [String],
      default: [],
    },

    correlationScore: {
      type: Number,
      default: null,
      min: 0,
      max: 1,
    },

    // -----------------------------------------------------------------------
    // PROCESSING
    // -----------------------------------------------------------------------

    processingStatus: {
      type: String,
      enum: SIGNAL_STATUSES,
      default: "received",
      index: true,
    },

    normalizedAt: {
      type: Date,
      default: null,
    },

    enrichedAt: {
      type: Date,
      default: null,
    },

    correlatedAt: {
      type: Date,
      default: null,
    },

    routedAt: {
      type: Date,
      default: null,
    },

    processingError: {
      type: String,
      maxlength: 2048,
      default: null,
    },

    // -----------------------------------------------------------------------
    // INCIDENT RELATIONSHIP
    // -----------------------------------------------------------------------

    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Incident",
      default: null,
      index: true,
    },

    incidentCandidate: {
      type: Boolean,
      default: false,
      index: true,
    },

    // -----------------------------------------------------------------------
    // TIMING
    // -----------------------------------------------------------------------

    observedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    receivedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },

    // -----------------------------------------------------------------------
    // RAW PROVIDER DATA
    // -----------------------------------------------------------------------

    rawPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false,
    },

    schemaVersion: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ---------------------------------------------------------------------------
// INDEXES
// ---------------------------------------------------------------------------

signalSchema.index({
  organizationId: 1,
  environmentId: 1,
  observedAt: -1,
});

signalSchema.index({
  organizationId: 1,
  environmentId: 1,
  serviceId: 1,
  observedAt: -1,
});

signalSchema.index({
  organizationId: 1,
  environmentId: 1,
  fingerprint: 1,
  lastSeenAt: -1,
});

signalSchema.index({
  organizationId: 1,
  environmentId: 1,
  severity: 1,
  processingStatus: 1,
  observedAt: -1,
});

signalSchema.index({
  organizationId: 1,
  environmentId: 1,
  provider: 1,
  eventType: 1,
  observedAt: -1,
});

signalSchema.index({
  organizationId: 1,
  environmentId: 1,
  correlationGroupId: 1,
});

signalSchema.index({
  organizationId: 1,
  environmentId: 1,
  traceId: 1,
});

signalSchema.index({
  organizationId: 1,
  environmentId: 1,
  incidentId: 1,
});

signalSchema.index({
  organizationId: 1,
  environmentId: 1,
  incidentCandidate: 1,
  processingStatus: 1,
  observedAt: -1,
});

// Provider source IDs are only unique inside the connection/environment.
signalSchema.index(
  {
    organizationId: 1,
    environmentId: 1,
    provider: 1,
    integrationConnectionId: 1,
    sourceEventId: 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      sourceEventId: {
        $type: "string",
      },

      integrationConnectionId: {
        $type: "objectId",
      },
    },

    name: "unique_provider_signal_event",
  }
);

// ---------------------------------------------------------------------------
// RETENTION
// ---------------------------------------------------------------------------

// Canonical signals are operational evidence rather than permanent audit
// records. Retention is intentionally separate from Incident history.
//
// Default: 90 days.
//
// NOTE:
// MongoDB TTL values are fixed at index creation time. Changing the
// environment variable later requires rebuilding the index.
const SIGNAL_RETENTION_SECONDS =
  Number(process.env.SIGNAL_RETENTION_SECONDS) ||
  60 * 60 * 24 * 90;

signalSchema.index(
  {
    receivedAt: 1,
  },
  {
    expireAfterSeconds:
      SIGNAL_RETENTION_SECONDS,

    name:
      "signal_retention_ttl",
  }
);

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

const Signal =
  mongoose.model(
    "Signal",
    signalSchema
  );

module.exports = {
  Signal,

  SIGNAL_TYPES,
  SIGNAL_SEVERITIES,
  SIGNAL_STATUSES,
  SIGNAL_SOURCES,

  SIGNAL_RETENTION_SECONDS,
};