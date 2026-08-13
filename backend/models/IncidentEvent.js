"use strict";

const mongoose =
  require(
    "mongoose"
  );

// ============================================================================
// CONSTANTS
// ============================================================================

const INCIDENT_EVENT_TYPES = [
  "incident.detected",
  "incident.updated",
  "incident.acknowledged",
  "incident.investigating",
  "incident.recovering",
  "incident.resolved",
  "incident.closed",
  "incident.reopened",
  "incident.assigned",
  "incident.unassigned",
  "incident.severity_escalated",

  /*
   * Downstream lifecycle.
   */
  "incident.analyzed",
  "decision.proposed",
  "action.approved",
  "action.rejected",
  "action.executed",
  "action.failed",
];

const INCIDENT_EVENT_STATUSES = [
  "pending",
  "published",
  "processed",
  "failed",
  "archived",
];

const INCIDENT_EVENT_SOURCES = [
  "incident_service",
  "signal_pipeline",
  "monitor",
  "user",
  "agent",
  "execution",
  "system",
];

const INCIDENT_EVENT_SEVERITIES = [
  "info",
  "warning",
  "critical",
];

// ============================================================================
// MODEL
// ============================================================================

const incidentEventSchema =
  new mongoose.Schema(
    {
      // ======================================================================
      // EVENT IDENTITY
      // ======================================================================

      eventId: {
        type:
          String,

        required:
          true,

        unique:
          true,

        index:
          true,

        trim:
          true,

        maxlength:
          128,
      },

      eventType: {
        type:
          String,

        enum:
          INCIDENT_EVENT_TYPES,

        required:
          true,

        index:
          true,
      },

      source: {
        type:
          String,

        enum:
          INCIDENT_EVENT_SOURCES,

        default:
          "incident_service",

        index:
          true,
      },

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

      // ======================================================================
      // INCIDENT
      // ======================================================================

      incidentId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Incident",

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

      // ======================================================================
      // CORRELATION
      // ======================================================================

      correlationId: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      correlationGroupId: {
        type:
          String,

        default:
          null,

        index:
          true,
      },

      signalId: {
        type:
          String,

        default:
          null,

        index:
          true,
      },

      // ======================================================================
      // INCIDENT SNAPSHOT
      // ======================================================================

      incidentStatus: {
        type:
          String,

        default:
          null,

        index:
          true,
      },

      severity: {
        type:
          String,

        enum:
          INCIDENT_EVENT_SEVERITIES,

        default:
          "warning",

        index:
          true,
      },

      issue: {
        type:
          String,

        maxlength:
          1024,

        default:
          null,
      },

      occurrenceCount: {
        type:
          Number,

        min:
          0,

        default:
          0,
      },

      // ======================================================================
      // TRANSITION
      // ======================================================================

      previousStatus: {
        type:
          String,

        default:
          null,
      },

      newStatus: {
        type:
          String,

        default:
          null,
      },

      changeType: {
        type:
          String,

        default:
          null,

        maxlength:
          128,
      },

      // ======================================================================
      // FUTURE AGENT / EXECUTION DATA
      // ======================================================================

      confidenceScore: {
        type:
          Number,

        min:
          0,

        max:
          1,

        default:
          null,
      },

      suggestedAction: {
        type:
          String,

        default:
          null,

        maxlength:
          1024,
      },

      actionTier: {
        type:
          String,

        default:
          null,
      },

      // ======================================================================
      // PAYLOAD
      // ======================================================================

      payload: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          {},
      },

      metadata: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          {},
      },

      // ======================================================================
      // PROCESSING
      // ======================================================================

      status: {
        type:
          String,

        enum:
          INCIDENT_EVENT_STATUSES,

        default:
          "pending",

        index:
          true,
      },

      retryCount: {
        type:
          Number,

        min:
          0,

        default:
          0,
      },

      processingTimeMs: {
        type:
          Number,

        min:
          0,

        default:
          null,
      },

      publishedAt: {
        type:
          Date,

        default:
          null,
      },

      processedAt: {
        type:
          Date,

        default:
          null,
      },

      failedAt: {
        type:
          Date,

        default:
          null,
      },

      error: {
        type:
          String,

        maxlength:
          2048,

        default:
          null,
      },

      // ======================================================================
      // TIMING
      // ======================================================================

      occurredAt: {
        type:
          Date,

        required:
          true,

        default:
          Date.now,

        index:
          true,
      },
    },
    {
      versionKey:
        false,

      timestamps:
        true,
    }
  );

// ============================================================================
// INDEXES
// ============================================================================

incidentEventSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  occurredAt:
    -1,
});

incidentEventSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  incidentId:
    1,

  occurredAt:
    1,
});

incidentEventSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  serviceId:
    1,

  occurredAt:
    -1,
});

incidentEventSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  eventType:
    1,

  status:
    1,

  occurredAt:
    -1,
});

incidentEventSchema.index({
  correlationId:
    1,

  occurredAt:
    1,
});

incidentEventSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  correlationGroupId:
    1,

  occurredAt:
    1,
});

incidentEventSchema.index({
  status:
    1,

  retryCount:
    1,

  occurredAt:
    1,
});

// ============================================================================
// RETENTION
// ============================================================================

const INCIDENT_EVENT_RETENTION_SECONDS =
  Number(
    process.env
      .INCIDENT_EVENT_RETENTION_SECONDS
  ) ||
  365 * 24 * 60 * 60;

/*
 * Only archived events expire.
 *
 * Active pipeline/audit events are never removed by TTL.
 */
incidentEventSchema.index(
  {
    occurredAt:
      1,
  },
  {
    expireAfterSeconds:
      INCIDENT_EVENT_RETENTION_SECONDS,

    partialFilterExpression: {
      status:
        "archived",
    },

    name:
      "incident_event_archive_ttl",
  }
);

// ============================================================================
// EXPORTS
// ============================================================================

const IncidentEvent =
  mongoose.model(
    "IncidentEvent",
    incidentEventSchema
  );

module.exports =
  IncidentEvent;

module.exports
  .INCIDENT_EVENT_TYPES =
  INCIDENT_EVENT_TYPES;

module.exports
  .INCIDENT_EVENT_STATUSES =
  INCIDENT_EVENT_STATUSES;

module.exports
  .INCIDENT_EVENT_SOURCES =
  INCIDENT_EVENT_SOURCES;

module.exports
  .INCIDENT_EVENT_SEVERITIES =
  INCIDENT_EVENT_SEVERITIES;

module.exports
  .INCIDENT_EVENT_RETENTION_SECONDS =
  INCIDENT_EVENT_RETENTION_SECONDS;