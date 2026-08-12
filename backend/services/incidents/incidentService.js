"use strict";

/**
 * Incident service.
 *
 * Handles opening, deduplicating, updating, resolving,
 * acknowledging, reopening, and assigning incidents.
 *
 * Canonical ownership hierarchy:
 *
 * Organization
 *   -> Environment
 *      -> Service
 *         -> Monitor
 *            -> Incident
 *
 * All incident operations must preserve this ownership boundary.
 */

const crypto = require("crypto");

const {
  Incident,
  buildFingerprint,
} = require("../../models/Incident");

const OPEN_STATUSES = [
  "open",
  "acknowledged",
  "investigating",
  "recovering",
];

const MAX_EVIDENCE = 20;

// ---------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------

/**
 * Derive a short deterministic fingerprint from incident context.
 */
function fingerprintFor(ctx) {
  const raw =
    buildFingerprint(ctx);

  return crypto
    .createHash("sha256")
    .update(raw)
    .digest("hex")
    .slice(0, 16);
}

// ---------------------------------------------------------------------------
// Severity inference
// ---------------------------------------------------------------------------

function inferSeverity(
  errorCode,
  occurrenceCount = 1
) {
  if (
    [
      "ENOTFOUND",
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
    ].includes(errorCode)
  ) {
    return "critical";
  }

  if (
    errorCode ===
    "CERT_HAS_EXPIRED"
  ) {
    return "critical";
  }

  if (
    errorCode &&
    errorCode.startsWith("CERT_")
  ) {
    return "warning";
  }

  if (
    occurrenceCount >= 5
  ) {
    return "critical";
  }

  return "warning";
}

// ---------------------------------------------------------------------------
// Evidence sanitizer
// ---------------------------------------------------------------------------

function sanitizeEvidence(check) {
  return {
    checkedAt:
      check.checkedAt ??
      new Date(),

    status:
      check.status,

    statusCode:
      check.statusCode ??
      null,

    responseTimeMs:
      check.responseTimeMs ??
      null,

    errorCode:
      check.errorCode ??
      null,

    sanitizedErrorMessage:
      check.sanitizedErrorMessage ??
      null,

    checkerRegion:
      check.checkerRegion ??
      "default",
  };
}

// ---------------------------------------------------------------------------
// Ownership validation
// ---------------------------------------------------------------------------

/**
 * Background workers do not pass through browser auth middleware.
 *
 * Therefore incident creation must fail closed if the Monitor
 * does not carry its complete ownership lineage.
 */
function assertMonitorOwnership(
  monitor
) {
  if (!monitor) {
    throw Object.assign(
      new Error(
        "Monitor is required"
      ),
      {
        code:
          "MONITOR_REQUIRED",
      }
    );
  }

  if (!monitor.organizationId) {
    throw Object.assign(
      new Error(
        "Monitor organizationId is required"
      ),
      {
        code:
          "MONITOR_ORGANIZATION_REQUIRED",
      }
    );
  }

  if (!monitor.environmentId) {
    throw Object.assign(
      new Error(
        "Monitor environmentId is required"
      ),
      {
        code:
          "MONITOR_ENVIRONMENT_REQUIRED",
      }
    );
  }

  if (!monitor.serviceId) {
    throw Object.assign(
      new Error(
        "Monitor serviceId is required"
      ),
      {
        code:
          "MONITOR_SERVICE_REQUIRED",
      }
    );
  }

  if (!monitor._id) {
    throw Object.assign(
      new Error(
        "Monitor id is required"
      ),
      {
        code:
          "MONITOR_ID_REQUIRED",
      }
    );
  }
}

/**
 * Build an environment-scoped query for a user-triggered
 * incident operation.
 */
function incidentOwnershipQuery(
  incidentId,
  context = {}
) {
  const {
    organizationId,
    environmentId,
  } = context;

  if (!organizationId) {
    throw Object.assign(
      new Error(
        "organizationId is required for incident operation"
      ),
      {
        status: 400,
        code:
          "ORGANIZATION_CONTEXT_REQUIRED",
      }
    );
  }

  if (!environmentId) {
    throw Object.assign(
      new Error(
        "environmentId is required for incident operation"
      ),
      {
        status: 400,
        code:
          "ENVIRONMENT_CONTEXT_REQUIRED",
      }
    );
  }

  return {
    _id:
      incidentId,

    organizationId,

    environmentId,
  };
}

// ---------------------------------------------------------------------------
// Open / deduplicate
// ---------------------------------------------------------------------------

async function openOrUpdate({
  monitor,
  check,
  transitionedAt,
}) {
  assertMonitorOwnership(
    monitor
  );

  const ctx = {
    organizationId:
      monitor.organizationId,

    environmentId:
      monitor.environmentId,

    serviceId:
      monitor.serviceId,

    monitorId:
      monitor._id,

    source:
      "monitor",

    errorCode:
      check.errorCode,
  };

  const fingerprint =
    fingerprintFor(ctx);

  const now =
    transitionedAt ??
    new Date();

  /**
   * Deduplication is scoped to the complete operational boundary.
   *
   * A Production incident must never deduplicate against
   * an identical Staging incident.
   */
  const existing =
    await Incident.findOne({
      organizationId:
        monitor.organizationId,

      environmentId:
        monitor.environmentId,

      serviceId:
        monitor.serviceId,

      monitorId:
        monitor._id,

      fingerprint,

      status: {
        $in:
          OPEN_STATUSES,
      },
    });

  if (existing) {
    const evidence = [
      ...existing.evidence,
      sanitizeEvidence(check),
    ].slice(
      -MAX_EVIDENCE
    );

    const severity =
      inferSeverity(
        check.errorCode,
        existing.occurrenceCount +
          1
      );

    existing.occurrenceCount +=
      1;

    existing.lastObservedAt =
      now;

    existing.evidence =
      evidence;

    existing.severity =
      severity;

    existing.timeline.push({
      occurredAt:
        now,

      eventType:
        "observed_failure",

      actor:
        "system",

      description:
        `Probable contributing signal observed again (${existing.occurrenceCount} occurrences). ${
          check.sanitizedErrorMessage ??
          check.status ??
          ""
        }`.trim(),

      metadata: {
        statusCode:
          check.statusCode,

        errorCode:
          check.errorCode,

        environmentId:
          monitor.environmentId,

        serviceId:
          monitor.serviceId,

        monitorId:
          monitor._id,
      },
    });

    await existing.save();

    return {
      incident:
        existing,

      created:
        false,
    };
  }

  const severity =
    inferSeverity(
      check.errorCode,
      1
    );

  const title =
    buildTitle(
      monitor,
      check
    );

  const incident =
    await Incident.create({
      organizationId:
        monitor.organizationId,

      environmentId:
        monitor.environmentId,

      tenantId:
        monitor.tenantId,

      serviceId:
        monitor.serviceId,

      monitorId:
        monitor._id,

      source:
        "monitor",

      sourceEventId:
        `${monitor._id}::${
          check.errorCode ||
          "http_failure"
        }`,

      fingerprint,

      title,

      description:
        buildDescription(
          monitor,
          check
        ),

      severity,

      status:
        "open",

      impact:
        `Monitor "${monitor.name}" at ${monitor.url} is reporting an observed failure.`,

      startedAt:
        now,

      detectedAt:
        now,

      lastObservedAt:
        now,

      occurrenceCount:
        1,

      evidence: [
        sanitizeEvidence(
          check
        ),
      ],

      timeline: [
        {
          occurredAt:
            now,

          eventType:
            "opened",

          actor:
            "system",

          description:
            `Incident opened after ${monitor.consecutiveFailureThreshold} consecutive observed failures. ${
              check.sanitizedErrorMessage ??
              ""
            }`.trim(),

          metadata: {
            monitorId:
              monitor._id,

            serviceId:
              monitor.serviceId,

            environmentId:
              monitor.environmentId,

            threshold:
              monitor.consecutiveFailureThreshold,
          },
        },
      ],
    });

  return {
    incident,
    created:
      true,
  };
}

// ---------------------------------------------------------------------------
// Automatic recovery
// ---------------------------------------------------------------------------

async function resolveForMonitor({
  monitor,
  resolvedAt,
}) {
  assertMonitorOwnership(
    monitor
  );

  const now =
    resolvedAt ??
    new Date();

  /**
   * Resolve every active incident for this exact monitor,
   * but only inside the monitor's complete ownership boundary.
   *
   * We intentionally do not use errorCode here because one
   * recovered monitor may have produced multiple failure signals.
   */
  const openIncidents =
    await Incident.find({
      organizationId:
        monitor.organizationId,

      environmentId:
        monitor.environmentId,

      serviceId:
        monitor.serviceId,

      monitorId:
        monitor._id,

      status: {
        $in:
          OPEN_STATUSES,
      },
    });

  for (
    const incident
    of openIncidents
  ) {
    incident.status =
      "resolved";

    incident.resolvedAt =
      now;

    incident.timeline.push({
      occurredAt:
        now,

      eventType:
        "resolved",

      actor:
        "system",

      description:
        `Monitor recovered after ${monitor.recoverySuccessThreshold} consecutive successful checks. Incident auto-resolved.`,

      metadata: {
        monitorId:
          monitor._id,

        serviceId:
          monitor.serviceId,

        environmentId:
          monitor.environmentId,

        recoveryThreshold:
          monitor.recoverySuccessThreshold,
      },
    });

    await incident.save();
  }

  return openIncidents;
}

// ---------------------------------------------------------------------------
// Manual operations
// ---------------------------------------------------------------------------

/**
 * Manual operations MUST receive:
 *
 * {
 *   organizationId,
 *   environmentId,
 *   userId,
 *   ...
 * }
 *
 * The API route will provide these values from authenticated
 * organization/environment context.
 */

async function acknowledge(
  incidentId,
  {
    organizationId,
    environmentId,
    userId,
    note,
  }
) {
  const incident =
    await Incident.findOne(
      incidentOwnershipQuery(
        incidentId,
        {
          organizationId,
          environmentId,
        }
      )
    );

  if (!incident) {
    return null;
  }

  if (
    !OPEN_STATUSES.includes(
      incident.status
    )
  ) {
    throw Object.assign(
      new Error(
        "Incident is not in an open state"
      ),
      {
        status: 409,
        code:
          "INCIDENT_NOT_OPEN",
      }
    );
  }

  incident.status =
    "acknowledged";

  incident.acknowledgedAt =
    new Date();

  incident.timeline.push({
    occurredAt:
      new Date(),

    eventType:
      "acknowledged",

    actor:
      "user",

    actorId:
      userId,

    description:
      note
        ? `Acknowledged: ${note}`
        : "Incident acknowledged.",
  });

  await incident.save();

  return incident;
}

async function resolveManually(
  incidentId,
  {
    organizationId,
    environmentId,
    userId,
    resolution,
  }
) {
  const incident =
    await Incident.findOne(
      incidentOwnershipQuery(
        incidentId,
        {
          organizationId,
          environmentId,
        }
      )
    );

  if (!incident) {
    return null;
  }

  incident.status =
    "resolved";

  incident.resolvedAt =
    new Date();

  incident.resolution =
    resolution ??
    null;

  incident.timeline.push({
    occurredAt:
      new Date(),

    eventType:
      "resolved",

    actor:
      "user",

    actorId:
      userId,

    description:
      resolution
        ? `Manually resolved: ${resolution}`
        : "Manually resolved.",
  });

  await incident.save();

  return incident;
}

async function reopen(
  incidentId,
  {
    organizationId,
    environmentId,
    userId,
    reason,
  }
) {
  const incident =
    await Incident.findOne(
      incidentOwnershipQuery(
        incidentId,
        {
          organizationId,
          environmentId,
        }
      )
    );

  if (!incident) {
    return null;
  }

  if (
    incident.status !==
      "resolved" &&
    incident.status !==
      "closed"
  ) {
    throw Object.assign(
      new Error(
        "Only resolved or closed incidents can be reopened"
      ),
      {
        status: 409,
        code:
          "INCIDENT_NOT_REOPENABLE",
      }
    );
  }

  incident.status =
    "open";

  incident.resolvedAt =
    null;

  incident.resolution =
    null;

  incident.timeline.push({
    occurredAt:
      new Date(),

    eventType:
      "reopened",

    actor:
      "user",

    actorId:
      userId,

    description:
      reason
        ? `Reopened: ${reason}`
        : "Incident reopened.",
  });

  await incident.save();

  return incident;
}

async function assign(
  incidentId,
  {
    organizationId,
    environmentId,
    userId,
    assigneeId,
    note,
  }
) {
  const incident =
    await Incident.findOne(
      incidentOwnershipQuery(
        incidentId,
        {
          organizationId,
          environmentId,
        }
      )
    );

  if (!incident) {
    return null;
  }

  incident.assignedTo =
    assigneeId ??
    null;

  incident.timeline.push({
    occurredAt:
      new Date(),

    eventType:
      "assigned",

    actor:
      "user",

    actorId:
      userId,

    description:
      assigneeId
        ? `Assigned to user ${assigneeId}.${
            note
              ? ` ${note}`
              : ""
          }`
        : "Unassigned.",

    metadata: {
      assigneeId,
    },
  });

  await incident.save();

  return incident;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTitle(
  monitor,
  check
) {
  if (
    check.errorCode ===
    "ENOTFOUND"
  ) {
    return `${monitor.name}: DNS resolution failure`;
  }

  if (
    check.errorCode ===
    "ECONNREFUSED"
  ) {
    return `${monitor.name}: Connection refused`;
  }

  if (
    check.errorCode ===
    "ETIMEDOUT"
  ) {
    return `${monitor.name}: Request timeout`;
  }

  if (
    check.statusCode
  ) {
    return `${monitor.name}: HTTP ${check.statusCode} observed`;
  }

  return `${monitor.name}: Observed failure`;
}

function buildDescription(
  monitor,
  check
) {
  const method =
    check.sanitizedErrorMessage ??
    (
      check.statusCode
        ? `HTTP ${check.statusCode}`
        : "unknown failure"
    );

  return (
    `Monitor "${monitor.name}" checking ${monitor.url} reported an observed failure (${method}). ` +
    "This is a probable contributing signal. Deeper telemetry may be needed to determine root cause."
  );
}

module.exports = {
  openOrUpdate,
  resolveForMonitor,

  acknowledge,
  resolveManually,
  reopen,
  assign,

  fingerprintFor,
  OPEN_STATUSES,
};