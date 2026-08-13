"use strict";

const mongoose =
  require("mongoose");

// ============================================================================
// CONSTANTS
// ============================================================================

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

const INCIDENT_DETECTION_METHODS = [
  "monitor_transition",
  "single_signal",
  "correlated_signals",
  "cross_provider_correlation",
  "manual",
];

const ACTIVE_INCIDENT_STATUSES = [
  "open",
  "acknowledged",
  "investigating",
  "recovering",
];

// ============================================================================
// EVIDENCE
// ============================================================================

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

      /*
       * Phase 4 signal provenance.
       */
      signalId: {
        type:
          String,

        default:
          null,
      },

      provider: {
        type:
          String,

        default:
          null,
      },

      signalType: {
        type:
          String,

        default:
          null,
      },

      eventType: {
        type:
          String,

        default:
          null,
      },

      severity: {
        type:
          String,

        default:
          null,
      },

      observedAt: {
        type:
          Date,

        default:
          null,
      },

      traceId: {
        type:
          String,

        default:
          null,
      },

      resourceId: {
        type:
          String,

        default:
          null,
      },

      correlationScore: {
        type:
          Number,

        min:
          0,

        max:
          1,

        default:
          null,
      },
    },
    {
      _id:
        false,
    }
  );

// ============================================================================
// TIMELINE
// ============================================================================

const timelineEventSchema =
  new mongoose.Schema(
    {
      occurredAt: {
        type:
          Date,

        required:
          true,

        default:
          Date.now,
      },

      eventType: {
        type:
          String,

        required:
          true,
      },

      actor: {
        type:
          String,

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

        default:
          null,
      },

      description: {
        type:
          String,

        required:
          true,

        maxlength:
          2048,
      },

      metadata: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          {},
      },
    },
    {
      _id:
        true,
    }
  );

// ============================================================================
// INCIDENT
// ============================================================================

const incidentSchema =
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

      environmentId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Environment",

        /*
         * Keep false until legacy migration is fully complete.
         */
        required:
          false,

        default:
          null,

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
      // SERVICE / MONITOR
      // ======================================================================

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
      // SOURCE
      // ======================================================================

      source: {
        type:
          String,

        enum:
          INCIDENT_SOURCES,

        default:
          "monitor",

        index:
          true,
      },

      sourceEventId: {
        type:
          String,

        default:
          null,

        maxlength:
          512,
      },

      detectionMethod: {
        type:
          String,

        enum:
          INCIDENT_DETECTION_METHODS,

        default:
          "monitor_transition",

        index:
          true,
      },

      // ======================================================================
      // PHASE 4 SIGNAL PROVENANCE
      // ======================================================================

      /*
       * Correlation group responsible for this incident.
       */
      correlationGroupId: {
        type:
          String,

        default:
          null,

        index:
          true,
      },

      /*
       * First / primary signal that opened the incident.
       */
      primarySignalId: {
        type:
          String,

        default:
          null,

        index:
          true,
      },

      /*
       * All canonical signals attached to this incident.
       *
       * Keep bounded in service logic later.
       */
      signalIds: {
        type:
          [String],

        default:
          [],
      },

      /*
       * Phase 4 fingerprint.
       *
       * This is NOT the same as Incident.fingerprint.
       *
       * signalFingerprint:
       *   identity of operational evidence
       *
       * fingerprint:
       *   identity of the incident itself
       */
      signalFingerprint: {
        type:
          String,

        default:
          null,

        index:
          true,
      },

      /*
       * Providers contributing evidence.
       *
       * Example:
       *
       * [
       *   "prometheus_alertmanager",
       *   "opentelemetry",
       *   "monitor"
       * ]
       */
      providers: {
        type:
          [String],

        default:
          [],
      },

      providerCount: {
        type:
          Number,

        min:
          0,

        default:
          0,
      },

      evidenceCount: {
        type:
          Number,

        min:
          0,

        default:
          0,
      },

      /*
       * Correlation confidence at latest observation.
       */
      correlationConfidence: {
        type:
          Number,

        min:
          0,

        max:
          1,

        default:
          null,
      },

      lastSignalAt: {
        type:
          Date,

        default:
          null,

        index:
          true,
      },

      // ======================================================================
      // INCIDENT IDENTITY / DEDUPLICATION
      // ======================================================================

      fingerprint: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      // ======================================================================
      // DESCRIPTION
      // ======================================================================

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

        default:
          null,
      },

      severity: {
        type:
          String,

        enum:
          INCIDENT_SEVERITIES,

        default:
          "warning",

        index:
          true,
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

        default:
          null,
      },

      // ======================================================================
      // TIMING
      // ======================================================================

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

      acknowledgedAt: {
        type:
          Date,

        default:
          null,
      },

      resolvedAt: {
        type:
          Date,

        default:
          null,
      },

      closedAt: {
        type:
          Date,

        default:
          null,
      },

      lastObservedAt: {
        type:
          Date,

        required:
          true,

        index:
          true,
      },

      // ======================================================================
      // RECURRENCE
      // ======================================================================

      occurrenceCount: {
        type:
          Number,

        default:
          1,

        min:
          1,
      },

      reopenCount: {
        type:
          Number,

        default:
          0,

        min:
          0,
      },

      lastReopenedAt: {
        type:
          Date,

        default:
          null,
      },

      // ======================================================================
      // EVIDENCE
      // ======================================================================

      evidence: {
        type:
          [evidenceSchema],

        default:
          [],
      },

      // ======================================================================
      // ASSIGNMENT
      // ======================================================================

      assignedTo: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        default:
          null,
      },

      assignedAt: {
        type:
          Date,

        default:
          null,
      },

      // ======================================================================
      // RESOLUTION
      // ======================================================================

      resolution: {
        type:
          String,

        maxlength:
          2048,

        default:
          null,
      },

      resolutionType: {
        type:
          String,

        enum: [
          "automatic",
          "manual",
          "recovery_signal",
          "rollback",
          "playbook",
          null,
        ],

        default:
          null,
      },

      // ======================================================================
      // TAGS
      // ======================================================================

      tags: {
        type:
          [String],

        default:
          [],
      },

      // ======================================================================
      // TIMELINE
      // ======================================================================

      timeline: {
        type:
          [timelineEventSchema],

        default:
          [],
      },
         // ======================================================================
      // IMPACT / BLAST RADIUS
      // ======================================================================

      impactAnalysis: {
        rootService: {
          type:
            mongoose.Schema.Types.Mixed,

          default:
            null,
        },

        affectedServices: {
          type:
            [mongoose.Schema.Types.Mixed],

          default:
            [],
        },

        affectedResources: {
          type:
            [mongoose.Schema.Types.Mixed],

          default:
            [],
        },

        levels: {
          type:
            [mongoose.Schema.Types.Mixed],

          default:
            [],
        },

        summary: {
          affectedServiceCount: {
            type:
              Number,

            default:
              0,
          },

          affectedResourceCount: {
            type:
              Number,

            default:
              0,
          },

          userFacingImpact: {
            type:
              Boolean,

            default:
              false,
          },

          maxCriticality: {
            type:
              Number,

            default:
              0,
          },
        },

        analyzedAt: {
          type:
            Date,

          default:
            null,
        },
      },
      // ======================================================================
      // FUTURE PHASE HANDOFF
      // ======================================================================

      /*
       * Phase 6 Agent Intelligence will set these.
       */
      analysisStatus: {
        type:
          String,

        enum: [
          "not_started",
          "queued",
          "analyzing",
          "completed",
          "failed",
        ],

        default:
          "not_started",

        index:
          true,
      },

      analysisStartedAt: {
        type:
          Date,

        default:
          null,
      },

      analysisCompletedAt: {
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

// ============================================================================
// INDEXES
// ============================================================================

incidentSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  fingerprint:
    1,
});

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
incidentSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  "impactAnalysis.summary.userFacingImpact":
    1,

  status:
    1,
});
// ============================================================================
// SIGNAL / CORRELATION INDEXES
// ============================================================================

incidentSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  correlationGroupId:
    1,

  status:
    1,
});

incidentSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  signalFingerprint:
    1,

  status:
    1,
});

incidentSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  primarySignalId:
    1,
});

incidentSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  providers:
    1,

  status:
    1,
});

incidentSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  lastSignalAt:
    -1,
});

// ============================================================================
// ACTIVE INCIDENT UNIQUENESS
// ============================================================================

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

// ============================================================================
// FINGERPRINT
// ============================================================================

function buildFingerprint({
  organizationId,
  environmentId,
  serviceId,
  monitorId = null,
  errorCode = null,
  source = "monitor",
  correlationGroupId = null,
  signalFingerprint = null,
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

  /*
   * Correlated-signal incidents should remain stable even
   * when evidence arrives from multiple providers.
   *
   * For those incidents, correlationGroupId becomes the
   * strongest identity component.
   */
  if (correlationGroupId) {
    return [
      organizationId,
      environmentId,
      serviceId,
      "correlation",
      correlationGroupId,
    ]
      .map(
        String
      )
      .join(
        "::"
      );
  }

  /*
   * Provider-neutral signal fallback.
   */
  if (
    signalFingerprint &&
    !monitorId
  ) {
    return [
      organizationId,
      environmentId,
      serviceId,
      source,
      signalFingerprint,
    ]
      .map(
        String
      )
      .join(
        "::"
      );
  }

  /*
   * Legacy monitor path.
   *
   * Keep exactly compatible with existing monitor incidents.
   */
  return [
    organizationId,
    environmentId,
    serviceId,
    monitorId ||
      "no-monitor",
    source,
    errorCode ||
      "http_failure",
  ]
    .map(
      String
    )
    .join(
      "::"
    );
}

// ============================================================================
// EXPORT
// ============================================================================

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

  INCIDENT_DETECTION_METHODS,

  ACTIVE_INCIDENT_STATUSES,

  buildFingerprint,
};