"use strict";

const crypto = require("crypto");

const incidentStateMachine =
  require(
    "./incidentStateMachine"
  );

const {
  buildFingerprint,
} =
  require(
    "../../models/Incident"
  );

const {
  incidentRepository,
} =
  require(
    "../../persistence/repositories"
  );

const incidentEventService =
  require(
    "./incidentEventService"
  );


// ============================================================================
// CONSTANTS
// ============================================================================

const OPEN_STATUSES = [
  "open",
  "acknowledged",
  "investigating",
  "recovering",
];

const MAX_MONITOR_EVIDENCE =
  20;

const MAX_SIGNAL_EVIDENCE =
  250;

const MAX_SIGNAL_IDS =
  500;

const SEVERITY_RANK =
  Object.freeze({
    info:
      1,

    warning:
      2,

    critical:
      3,
  });

// ============================================================================
// FINGERPRINT
// ============================================================================

function fingerprintFor(
  ctx
) {
  const raw =
    buildFingerprint(
      ctx
    );

  return crypto
    .createHash(
      "sha256"
    )
    .update(
      raw
    )
    .digest(
      "hex"
    )
    .slice(
      0,
      16
    );
}

// ============================================================================
// SEVERITY
// ============================================================================

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
      "CERT_HAS_EXPIRED",
    ].includes(
      errorCode
    )
  ) {
    return "critical";
  }

  if (
    errorCode &&
    errorCode.startsWith(
      "CERT_"
    )
  ) {
    return "warning";
  }

  if (
    occurrenceCount >=
    5
  ) {
    return "critical";
  }

  return "warning";
}

function higherSeverity(
  current = "info",
  incoming = "info"
) {
  return (
    (
      SEVERITY_RANK[
        incoming
      ] ||
      0
    ) >
    (
      SEVERITY_RANK[
        current
      ] ||
      0
    )
  )
    ? incoming
    : current;
}

// ============================================================================
// MONITOR EVIDENCE
// ============================================================================

function sanitizeEvidence(
  check
) {
  return {
    checkedAt:
      check.checkedAt ??
      new Date(),

    status:
      check.status ??
      null,

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

// ============================================================================
// SIGNAL EVIDENCE
// ============================================================================

function sanitizeSignalEvidence(
  signal
) {
  return {
    checkedAt:
      signal.observedAt ||
      signal.receivedAt ||
      new Date(),

    status:
      signal.eventType ||
      null,

    statusCode:
      signal.statusCode ??
      null,

    responseTimeMs:
      signal.metric
        ?.name ===
        "monitor.response_time"
        ? signal.metric
            .value ??
          null
        : null,

    errorCode:
      signal.errorCode ||
      null,

    sanitizedErrorMessage:
      signal.errorMessage ||
      signal.description ||
      null,

    checkerRegion:
      signal.resource
        ?.region ||
      null,

    signalId:
      signal.signalId ||
      null,

    provider:
      signal.provider ||
      null,

    signalType:
      signal.signalType ||
      null,

    eventType:
      signal.eventType ||
      null,

    severity:
      signal.severity ||
      null,

    observedAt:
      signal.observedAt ||
      null,

    traceId:
      signal.traceId ||
      null,

    resourceId:
      signal.resource
        ?.resourceId ||
      null,

    correlationScore:
      signal
        .correlationScore ??
      null,
  };
}

// ============================================================================
// OWNERSHIP
// ============================================================================

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

  if (
    !monitor.organizationId
  ) {
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

  if (
    !monitor.environmentId
  ) {
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

  if (
    !monitor.serviceId
  ) {
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

  if (
    !monitor._id
  ) {
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

function assertSignalOwnership(
  signal
) {
  if (!signal) {
    throw Object.assign(
      new Error(
        "Signal is required"
      ),
      {
        code:
          "INCIDENT_SIGNAL_REQUIRED",
      }
    );
  }

  if (
    !signal.organizationId ||
    !signal.environmentId ||
    !signal.tenantId ||
    !signal.serviceId
  ) {
    throw Object.assign(
      new Error(
        "Signal incident ownership context is incomplete"
      ),
      {
        code:
          "INCIDENT_SIGNAL_CONTEXT_REQUIRED",
      }
    );
  }
}

function incidentOwnershipQuery(
  incidentId,
  context = {}
) {
  const {
    organizationId,
    environmentId,
  } =
    context;

  if (
    !organizationId
  ) {
    throw Object.assign(
      new Error(
        "organizationId is required for incident operation"
      ),
      {
        status:
          400,

        code:
          "ORGANIZATION_CONTEXT_REQUIRED",
      }
    );
  }

  if (
    !environmentId
  ) {
    throw Object.assign(
      new Error(
        "environmentId is required for incident operation"
      ),
      {
        status:
          400,

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

// ============================================================================
// ARRAY BOUNDING
// ============================================================================

function pushBounded(
  array,
  value,
  max
) {
  array.push(
    value
  );

  if (
    array.length >
    max
  ) {
    array.splice(
      0,
      array.length -
        max
    );
  }
}

// ============================================================================
// SOURCE
// ============================================================================

function normalizeIncidentSource(
  signal
) {
  if (
    signal.source ===
    "monitor"
  ) {
    return "monitor";
  }

  if (
    signal.source ===
    "manual"
  ) {
    return "manual";
  }

  if (
    signal.signalType ===
    "alert"
  ) {
    return "alert";
  }

  return "integration";
}

// ============================================================================
// INCIDENT LIFECYCLE EVENT PUBLICATION
// ============================================================================

async function publishIncidentLifecycle(
  topicName,
  incident,
  extra = {}
) {
  const eventTypeMap = {
    INCIDENT_DETECTED:
      "incident.detected",

    INCIDENT_UPDATED:
      "incident.updated",

    INCIDENT_ACKNOWLEDGED:
      "incident.acknowledged",

    INCIDENT_INVESTIGATING:
      "incident.investigating",

    INCIDENT_RECOVERING:
      "incident.recovering",

    INCIDENT_RESOLVED:
      "incident.resolved",

    INCIDENT_CLOSED:
      "incident.closed",

    INCIDENT_REOPENED:
      "incident.reopened",

    INCIDENT_ASSIGNED:
      "incident.assigned",

    INCIDENT_UNASSIGNED:
      "incident.unassigned",

    INCIDENT_SEVERITY_ESCALATED:
      "incident.severity_escalated",
  };

  const eventType =
    eventTypeMap[
      topicName
    ];

  if (!eventType) {
    return {
      published:
        false,

      reason:
        "UNKNOWN_INCIDENT_EVENT_TOPIC",
    };
  }

  try {
    const result =
      await incidentEventService
        .persistAndPublish({
          incident,

          eventType,

          topicName,

          changeType:
            extra.changeType ||
            null,

          previousStatus:
            extra.previousStatus ||
            null,

          newStatus:
            extra.newStatus ||
            null,

          signalId:
            extra.signalId ||
            null,

          payload:
            extra,

          metadata: {
            correlationGroupId:
              incident
                .correlationGroupId ||
              null,
          },

          occurredAt:
            incident
              .lastObservedAt ||
            new Date(),
        });

    return {
      published:
        result
          .publication
          ?.published ===
        true,

      event:
        result.event,

      publication:
        result
          .publication,
    };
  } catch (
    error
  ) {
    console.error(
      "[incident-service] lifecycle persistence/publication failed:",
      error.message
    );

    /*
     * Incident state must remain durable even if event
     * persistence/publication fails.
     */
    return {
      published:
        false,

      reason:
        "INCIDENT_EVENT_PIPELINE_FAILED",

      error:
        error.message,
    };
  }
}

// ============================================================================
// LEGACY MONITOR PATH
// ============================================================================

async function openOrUpdate({
  monitor,
  check,
  transitionedAt,
}) {
  assertMonitorOwnership(
    monitor
  );

  const fingerprint =
    fingerprintFor({
      organizationId:
        monitor
          .organizationId,

      environmentId:
        monitor
          .environmentId,

      serviceId:
        monitor
          .serviceId,

      monitorId:
        monitor._id,

      source:
        "monitor",

      errorCode:
        check.errorCode,
    });

  const now =
    transitionedAt ??
    new Date();

  let existing =
    await incidentRepository
      .findOne({
        organizationId:
          monitor
            .organizationId,

        environmentId:
          monitor
            .environmentId,

        serviceId:
          monitor
            .serviceId,

        monitorId:
          monitor._id,

        fingerprint,

        status: {
          $in:
            OPEN_STATUSES,
        },
      });

  // ==========================================================================
  // EXISTING MONITOR INCIDENT
  // ==========================================================================

  if (existing) {
    const nextCount =
      existing
        .occurrenceCount +
      1;

    const incomingSeverity =
      inferSeverity(
        check.errorCode,
        nextCount
      );

    const previousSeverity =
      existing.severity;

    existing
      .occurrenceCount =
      nextCount;

    existing
      .lastObservedAt =
      now;

    existing
      .evidenceCount =
      (
        existing
          .evidenceCount ||
        0
      ) + 1;

    existing.providers =
      Array.from(
        new Set([
          ...(
            existing
              .providers ||
            []
          ),

          "monitor",
        ])
      );

    existing.providerCount =
      existing
        .providers
        .length;

    existing.detectionMethod =
      existing
        .detectionMethod ||
      "monitor_transition";

    /*
     * Never automatically reduce severity while active.
     */
    existing.severity =
      higherSeverity(
        existing.severity,
        incomingSeverity
      );

    pushBounded(
      existing.evidence,
      sanitizeEvidence(
        check
      ),
      MAX_MONITOR_EVIDENCE
    );

    if (
      previousSeverity !==
      existing.severity
    ) {
      existing
        .timeline
        .push({
          occurredAt:
            now,

          eventType:
            "severity_escalated",

          actor:
            "system",

          description:
            `Incident severity escalated from ${previousSeverity} to ${existing.severity}.`,

          metadata: {
            previousSeverity,

            newSeverity:
              existing
                .severity,

            monitorId:
              monitor._id,
          },
        });
    }

    /*
     * A new failure during recovery means recovery failed.
     */
    if (
      existing.status ===
      "recovering"
    ) {
      incidentStateMachine
        .transition(
          existing,
          "investigating",
          {
            actor:
              "system",

            occurredAt:
              now,

            reason:
              "A new failure was observed while the incident was recovering.",

            metadata: {
              monitorId:
                monitor._id,
            },
          }
        );
    }

    existing.timeline.push({
      occurredAt:
        now,

      eventType:
        "observed_failure",

      actor:
        "system",

      description:
        `Probable contributing signal observed again (${existing.occurrenceCount} occurrences). ${
          check
            .sanitizedErrorMessage ??
          check.status ??
          ""
        }`.trim(),

      metadata: {
        statusCode:
          check.statusCode,

        errorCode:
          check.errorCode,

        environmentId:
          monitor
            .environmentId,

        serviceId:
          monitor
            .serviceId,

        monitorId:
          monitor._id,
      },
    });

    await incidentRepository
      .save(
        existing
      );

    await publishIncidentLifecycle(
      "INCIDENT_UPDATED",
      existing,
      {
        changeType:
          "monitor_failure_observed",
      }
    );

    return {
      incident:
        existing,

      created:
        false,

      updated:
        true,
    };
  }

  // ==========================================================================
  // CREATE MONITOR INCIDENT
  // ==========================================================================

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

  try {
    const incident =
      await incidentRepository
        .create({
          organizationId:
            monitor
              .organizationId,

          environmentId:
            monitor
              .environmentId,

          tenantId:
            monitor
              .tenantId,

          serviceId:
            monitor
              .serviceId,

          monitorId:
            monitor._id,

          source:
            "monitor",

          sourceEventId:
            `${monitor._id}::${
              check.errorCode ||
              "http_failure"
            }`,

          detectionMethod:
            "monitor_transition",

          correlationGroupId:
            null,

          primarySignalId:
            null,

          signalIds:
            [],

          signalFingerprint:
            null,

          providers: [
            "monitor",
          ],

          providerCount:
            1,

          evidenceCount:
            1,

          correlationConfidence:
            null,

          lastSignalAt:
            null,

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
                  check
                    .sanitizedErrorMessage ??
                  ""
                }`.trim(),

              metadata: {
                monitorId:
                  monitor._id,

                serviceId:
                  monitor
                    .serviceId,

                environmentId:
                  monitor
                    .environmentId,

                threshold:
                  monitor
                    .consecutiveFailureThreshold,
              },
            },
          ],

          analysisStatus:
            "not_started",
        });

    await publishIncidentLifecycle(
      "INCIDENT_DETECTED",
      incident,
      {
        changeType:
          "monitor_transition",
      }
    );

    return {
      incident,

      created:
        true,

      updated:
        false,
    };
  } catch (
    error
  ) {
    /*
     * Active-incident unique index is the final concurrency
     * protection if multiple workers race.
     */
    if (
      error?.code ===
      11000
    ) {
      existing =
        await incidentRepository
          .findOne({
            organizationId:
              monitor
                .organizationId,

            environmentId:
              monitor
                .environmentId,

            fingerprint,

            status: {
              $in:
                OPEN_STATUSES,
            },
          });

      if (existing) {
        return openOrUpdate({
          monitor,

          check,

          transitionedAt:
            now,
        });
      }
    }

    throw error;
  }
}

// ============================================================================
// LEGACY MONITOR RECOVERY
// ============================================================================

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

  const openIncidents =
    await incidentRepository
      .findMany({
        organizationId:
          monitor
            .organizationId,

        environmentId:
          monitor
            .environmentId,

        serviceId:
          monitor
            .serviceId,

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
    incidentStateMachine
      .transition(
        incident,
        "resolved",
        {
          actor:
            "system",

          occurredAt:
            now,

          reason:
            `Monitor recovered after ${monitor.recoverySuccessThreshold} consecutive successful checks. Incident auto-resolved.`,

          metadata: {
            monitorId:
              monitor._id,

            serviceId:
              monitor
                .serviceId,

            environmentId:
              monitor
                .environmentId,

            recoveryThreshold:
              monitor
                .recoverySuccessThreshold,

            resolutionType:
              "automatic",
          },
        }
      );

    incident.lastObservedAt =
      now;

    incident.resolutionType =
      "automatic";

    incident.resolution =
      "Monitor recovery threshold reached.";

    await incidentRepository
      .save(
        incident
      );

    await publishIncidentLifecycle(
      "INCIDENT_RESOLVED",
      incident,
      {
        changeType:
          "monitor_recovery",

        resolutionType:
          "automatic",
      }
    );
  }

  return openIncidents;
}

// ============================================================================
// GENERIC STATE TRANSITION
// ============================================================================

async function transitionStatus(
  incidentId,
  {
    organizationId,
    environmentId,
    userId = null,
    targetStatus,
    reason = null,
    metadata = {},
    actor =
      userId
        ? "user"
        : "system",
  }
) {
  const incident =
    await incidentRepository
      .findOne(
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

  const result =
    incidentStateMachine
      .transition(
        incident,
        targetStatus,
        {
          actor,

          actorId:
            userId,

          occurredAt:
            new Date(),

          reason,

          metadata,
        }
      );

  if (
    result.changed
  ) {
    await incidentRepository
      .save(
        incident
      );

    const topicName =
      targetStatus ===
      "resolved"
        ? "INCIDENT_RESOLVED"
        : "INCIDENT_UPDATED";

    await publishIncidentLifecycle(
      topicName,
      incident,
      {
        changeType:
          "status_transition",

        previousStatus:
          result
            .previousStatus,

        newStatus:
          result
            .currentStatus,
      }
    );
  }

  return incident;
}

// ============================================================================
// ACKNOWLEDGE
// ============================================================================

async function acknowledge(
  incidentId,
  {
    organizationId,
    environmentId,
    userId,
  }
) {
  return transitionStatus(
    incidentId,
    {
      organizationId,

      environmentId,

      userId,

      targetStatus:
        "acknowledged",

      reason:
        "Incident acknowledged.",

      metadata: {
        userId,
      },
    }
  );
}

// ============================================================================
// INVESTIGATING
// ============================================================================

async function startInvestigation(
  incidentId,
  {
    organizationId,
    environmentId,
    userId = null,
    reason = null,
  }
) {
  return transitionStatus(
    incidentId,
    {
      organizationId,

      environmentId,

      userId,

      targetStatus:
        "investigating",

      reason:
        reason ||
        "Incident investigation started.",
    }
  );
}

// ============================================================================
// RECOVERING
// ============================================================================

async function startRecovery(
  incidentId,
  {
    organizationId,
    environmentId,
    userId = null,
    reason = null,
  }
) {
  return transitionStatus(
    incidentId,
    {
      organizationId,

      environmentId,

      userId,

      targetStatus:
        "recovering",

      reason:
        reason ||
        "Incident entered recovery.",
    }
  );
}

// ============================================================================
// MANUAL RESOLUTION
// ============================================================================

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
    await incidentRepository
      .findOne(
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

  const now =
    new Date();

  incidentStateMachine
    .transition(
      incident,
      "resolved",
      {
        actor:
          "user",

        actorId:
          userId,

        occurredAt:
          now,

        reason:
          resolution
            ? `Manually resolved: ${resolution}`
            : "Manually resolved.",

        metadata: {
          resolutionType:
            "manual",
        },
      }
    );

  incident.resolution =
    resolution ??
    null;

  incident.resolutionType =
    "manual";

  await incidentRepository
    .save(
      incident
    );

  await publishIncidentLifecycle(
    "INCIDENT_RESOLVED",
    incident,
    {
      changeType:
        "manual_resolution",

      resolutionType:
        "manual",
    }
  );

  return incident;
}

// ============================================================================
// REOPEN
// ============================================================================

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
    await incidentRepository
      .findOne(
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

  /*
   * State machine enforces:
   *
   * resolved -> open
   * closed   -> open
   */
  incidentStateMachine
    .transition(
      incident,
      "open",
      {
        actor:
          "user",

        actorId:
          userId,

        occurredAt:
          new Date(),

        reason:
          reason
            ? `Reopened: ${reason}`
            : "Incident reopened.",

        metadata: {
          reopenedBy:
            userId,
        },
      }
    );

  await incidentRepository
    .save(
      incident
    );

  await publishIncidentLifecycle(
    "INCIDENT_UPDATED",
    incident,
    {
      changeType:
        "reopened",
    }
  );

  return incident;
}

// ============================================================================
// CLOSE
// ============================================================================

async function close(
  incidentId,
  {
    organizationId,
    environmentId,
    userId,
    reason = null,
  }
) {
  return transitionStatus(
    incidentId,
    {
      organizationId,

      environmentId,

      userId,

      targetStatus:
        "closed",

      reason:
        reason ||
        "Incident closed.",
    }
  );
}

// ============================================================================
// ASSIGN
// ============================================================================

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
    await incidentRepository
      .findOne(
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

  const now =
    new Date();

  incident.assignedTo =
    assigneeId ??
    null;

  incident.assignedAt =
    assigneeId
      ? now
      : null;

  incident.timeline.push({
    occurredAt:
      now,

    eventType:
      assigneeId
        ? "assigned"
        : "unassigned",

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
      assigneeId:
        assigneeId ??
        null,
    },
  });

  await incidentRepository
    .save(
      incident
    );

  await publishIncidentLifecycle(
    "INCIDENT_UPDATED",
    incident,
    {
      changeType:
        assigneeId
          ? "assigned"
          : "unassigned",

      assigneeId:
        assigneeId ??
        null,
    }
  );

  return incident;
}

// ============================================================================
// MONITOR TITLE
// ============================================================================

function buildTitle(
  monitor,
  check
) {
  if (
    check.errorCode ===
    "ENOTFOUND"
  ) {
    return (
      `${monitor.name}: DNS resolution failure`
    );
  }

  if (
    check.errorCode ===
    "ECONNREFUSED"
  ) {
    return (
      `${monitor.name}: Connection refused`
    );
  }

  if (
    check.errorCode ===
    "ETIMEDOUT"
  ) {
    return (
      `${monitor.name}: Request timeout`
    );
  }

  if (
    check.statusCode
  ) {
    return (
      `${monitor.name}: HTTP ${check.statusCode} observed`
    );
  }

  return (
    `${monitor.name}: Observed failure`
  );
}

// ============================================================================
// MONITOR DESCRIPTION
// ============================================================================

function buildDescription(
  monitor,
  check
) {
  const method =
    check
      .sanitizedErrorMessage ??
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

// ============================================================================
// SIGNAL INCIDENT FINGERPRINT
// ============================================================================

function fingerprintForSignal(
  signal,
  correlationGroup = null
) {
  return fingerprintFor({
    organizationId:
      signal
        .organizationId,

    environmentId:
      signal
        .environmentId,

    serviceId:
      signal.serviceId,

    monitorId:
      signal.monitorId ||
      null,

    source:
      normalizeIncidentSource(
        signal
      ),

    errorCode:
      signal.errorCode ||
      signal.eventType ||
      "signal_failure",

    correlationGroupId:
      correlationGroup
        ?.correlationGroupId ||
      signal
        .correlationGroupId ||
      null,

    signalFingerprint:
      signal.fingerprint ||
      null,
  });
}

// ============================================================================
// DETECTION METHOD
// ============================================================================

function detectionMethodFor(
  signal,
  correlationGroup = null
) {
  if (
    signal.source ===
    "manual"
  ) {
    return "manual";
  }

  if (
    correlationGroup
      ?.providerCount >=
    2
  ) {
    return (
      "cross_provider_correlation"
    );
  }

  if (
    correlationGroup
      ?.signalCount >=
    2
  ) {
    return (
      "correlated_signals"
    );
  }

  if (
    signal.source ===
    "monitor"
  ) {
    return (
      "monitor_transition"
    );
  }

  return "single_signal";
}

// ============================================================================
// PROVIDERS
// ============================================================================

function collectProviders(
  signal,
  correlationGroup = null,
  incident = null
) {
  const providers =
    new Set(
      incident
        ?.providers ||
      []
    );

  if (
    signal.provider
  ) {
    providers.add(
      signal.provider
    );
  }

  for (
    const provider
    of correlationGroup
      ?.providers ||
    []
  ) {
    if (
      provider
    ) {
      providers.add(
        provider
      );
    }
  }

  return [
    ...providers,
  ];
}

// ============================================================================
// SIGNAL IDS
// ============================================================================

function collectSignalIds(
  signal,
  correlationGroup = null,
  incident = null
) {
  const ids =
    new Set(
      incident
        ?.signalIds ||
      []
    );

  if (
    signal.signalId
  ) {
    ids.add(
      signal.signalId
    );
  }

  for (
    const signalId
    of correlationGroup
      ?.signalIds ||
    []
  ) {
    if (
      signalId
    ) {
      ids.add(
        signalId
      );
    }
  }

  return [
    ...ids,
  ].slice(
    -MAX_SIGNAL_IDS
  );
}

// ============================================================================
// SIGNAL -> INCIDENT
// ============================================================================

async function openOrUpdateFromSignal({
  signal,
  correlationGroup = null,
  detectedAt = null,
}) {
  assertSignalOwnership(
    signal
  );

  const now =
    detectedAt ||
    signal.observedAt ||
    new Date();

  const fingerprint =
    fingerprintForSignal(
      signal,
      correlationGroup
    );

  const groupId =
    correlationGroup
      ?.correlationGroupId ||
    signal
      .correlationGroupId ||
    null;

  // ==========================================================================
  // FIND EXISTING
  // ==========================================================================

  let existing =
    await incidentRepository
      .findOne({
        organizationId:
          signal
            .organizationId,

        environmentId:
          signal
            .environmentId,

        fingerprint,

        status: {
          $in:
            OPEN_STATUSES,
        },
      });

  /*
   * Defensive fallback for an already-open correlation-group incident.
   */
  if (
    !existing &&
    groupId
  ) {
    existing =
      await incidentRepository
        .findOne({
          organizationId:
            signal
              .organizationId,

          environmentId:
            signal
              .environmentId,

          correlationGroupId:
            groupId,

          status: {
            $in:
              OPEN_STATUSES,
          },
        });
  }

  const providers =
    collectProviders(
      signal,
      correlationGroup,
      existing
    );

  const signalIds =
    collectSignalIds(
      signal,
      correlationGroup,
      existing
    );

  const evidence =
    sanitizeSignalEvidence(
      signal
    );

  const incomingSeverity =
    correlationGroup
      ?.highestSeverity ||
    signal.severity ||
    "warning";

  // ==========================================================================
  // UPDATE EXISTING SIGNAL INCIDENT
  // ==========================================================================

  if (existing) {
    const previousSeverity =
      existing.severity;

    existing.occurrenceCount +=
      1;

    existing.lastObservedAt =
      now;

    existing.lastSignalAt =
      now;

    existing.signalIds =
      signalIds;

    existing.providers =
      providers;

    existing.providerCount =
      providers.length;

    existing.evidenceCount =
      (
        existing
          .evidenceCount ||
        0
      ) + 1;

    existing.correlationConfidence =
      Math.max(
        existing
          .correlationConfidence ||
        0,

        correlationGroup
          ?.confidenceScore ||
        signal
          .correlationScore ||
        0
      );

    existing.correlationGroupId =
      existing
        .correlationGroupId ||
      groupId;

    existing.primarySignalId =
      existing
        .primarySignalId ||
      signal.signalId;

    existing.signalFingerprint =
      signal.fingerprint ||
      existing
        .signalFingerprint ||
      null;

    existing.detectionMethod =
      detectionMethodFor(
        signal,
        correlationGroup
      );

    /*
     * Escalation only.
     * Never automatically downgrade an active incident.
     */
    existing.severity =
      higherSeverity(
        existing.severity,
        incomingSeverity
      );

    if (
      previousSeverity !==
      existing.severity
    ) {
      existing.timeline.push({
        occurredAt:
          now,

        eventType:
          "severity_escalated",

        actor:
          "system",

        description:
          `Incident severity escalated from ${previousSeverity} to ${existing.severity}.`,

        metadata: {
          signalId:
            signal.signalId,

          provider:
            signal.provider,

          previousSeverity,

          newSeverity:
            existing.severity,
        },
      });
    }

    /*
     * New failure during recovery invalidates recovery.
     */
    if (
      existing.status ===
      "recovering"
    ) {
      incidentStateMachine
        .transition(
          existing,
          "investigating",
          {
            actor:
              "system",

            occurredAt:
              now,

            reason:
              "New failure evidence arrived while recovery was in progress.",

            metadata: {
              signalId:
                signal.signalId,

              provider:
                signal.provider,
            },
          }
        );
    }

    pushBounded(
      existing.evidence,
      evidence,
      MAX_SIGNAL_EVIDENCE
    );

    existing.timeline.push({
      occurredAt:
        now,

      eventType:
        "signal_observed",

      actor:
        "system",

      description:
        `Correlated operational signal received from ${signal.provider}.`,

      metadata: {
        signalId:
          signal.signalId,

        provider:
          signal.provider,

        eventType:
          signal.eventType,

        correlationGroupId:
          groupId,

        correlationScore:
          signal
            .correlationScore ??
          null,

        occurrenceCount:
          existing
            .occurrenceCount,
      },
    });

    await incidentRepository
      .save(
        existing
      );

    await publishIncidentLifecycle(
      "INCIDENT_UPDATED",
      existing,
      {
        changeType:
          "signal_observed",

        signalId:
          signal.signalId,
      }
    );

    return {
      incident:
        existing,

      created:
        false,

      updated:
        true,
    };
  }

  // ==========================================================================
  // CREATE SIGNAL INCIDENT
  // ==========================================================================

  const title =
    String(
      signal.title ||
      "AIRA operational incident"
    )
      .slice(
        0,
        256
      );

  const description =
    String(
      [
        signal.description,

        signal.errorMessage,

        correlationGroup
          ?.incidentCandidateReason,
      ]
        .filter(
          Boolean
        )
        .join(
          " "
        ) ||
      "Operational failure detected from canonical AIRA signals."
    )
      .slice(
        0,
        2048
      );

  try {
    const incident =
      await incidentRepository
        .create({
          organizationId:
            signal
              .organizationId,

          environmentId:
            signal
              .environmentId,

          tenantId:
            signal.tenantId,

          serviceId:
            signal.serviceId,

          monitorId:
            signal.monitorId ||
            null,

          source:
            normalizeIncidentSource(
              signal
            ),

          sourceEventId:
            signal
              .sourceEventId ||
            signal.signalId,

          detectionMethod:
            detectionMethodFor(
              signal,
              correlationGroup
            ),

          correlationGroupId:
            groupId,

          primarySignalId:
            signal.signalId,

          signalIds,

          signalFingerprint:
            signal.fingerprint ||
            null,

          providers,

          providerCount:
            providers.length,

          evidenceCount:
            1,

          correlationConfidence:
            correlationGroup
              ?.confidenceScore ||
            signal
              .correlationScore ||
            null,

          lastSignalAt:
            now,

          fingerprint,

          title,

          description,

          severity:
            incomingSeverity,

          status:
            "open",

          startedAt:
            signal.firstSeenAt ||
            signal.observedAt ||
            now,

          detectedAt:
            now,

          lastObservedAt:
            now,

          occurrenceCount:
            1,

          evidence: [
            evidence,
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
                "Incident opened from canonical AIRA signal evidence.",

              metadata: {
                signalId:
                  signal.signalId,

                provider:
                  signal.provider,

                correlationGroupId:
                  groupId,

                detectionMethod:
                  detectionMethodFor(
                    signal,
                    correlationGroup
                  ),
              },
            },
          ],

          analysisStatus:
            "not_started",
        });

    await publishIncidentLifecycle(
      "INCIDENT_DETECTED",
      incident,
      {
        changeType:
          "signal_detection",

        signalId:
          signal.signalId,
      }
    );

    return {
      incident,

      created:
        true,

      updated:
        false,
    };
  } catch (
    error
  ) {
    /*
     * Concurrent workers may both decide to create.
     *
     * Mongo unique-active-incident index is authoritative.
     */
    if (
      error?.code ===
      11000
    ) {
      const concurrent =
        await incidentRepository
          .findOne({
            organizationId:
              signal
                .organizationId,

            environmentId:
              signal
                .environmentId,

            fingerprint,

            status: {
              $in:
                OPEN_STATUSES,
            },
          });

      if (
        concurrent
      ) {
        return openOrUpdateFromSignal({
          signal,

          correlationGroup,

          detectedAt:
            now,
        });
      }
    }

    throw error;
  }
}

// ============================================================================
// SIGNAL RECOVERY
// ============================================================================

async function resolveFromSignal({
  signal,
  resolvedAt = null,
  reason = null,
}) {
  assertSignalOwnership(
    signal
  );

  const now =
    resolvedAt ||
    signal.observedAt ||
    new Date();

  const filter = {
    organizationId:
      signal
        .organizationId,

    environmentId:
      signal
        .environmentId,

    serviceId:
      signal.serviceId,

    status: {
      $in:
        OPEN_STATUSES,
    },
  };

  /*
   * Fail closed.
   *
   * A generic healthy signal must NEVER resolve every active
   * incident belonging to a service.
   */
  if (
    signal
      .correlationGroupId
  ) {
    filter.correlationGroupId =
      signal
        .correlationGroupId;
  } else if (
    signal.monitorId
  ) {
    filter.monitorId =
      signal.monitorId;
  } else if (
    signal.sourceEventId
  ) {
    filter.sourceEventId =
      signal
        .sourceEventId;
  } else if (
    signal.fingerprint
  ) {
    filter.signalFingerprint =
      signal.fingerprint;
  } else {
    return [];
  }

  const incidents =
    await incidentRepository
      .findMany(
        filter
      );

  for (
    const incident
    of incidents
  ) {
    incidentStateMachine
      .transition(
        incident,
        "resolved",
        {
          actor:
            "system",

          occurredAt:
            now,

          reason:
            reason ||
            `Incident automatically resolved from recovery signal provided by ${signal.provider}.`,

          metadata: {
            signalId:
              signal.signalId,

            provider:
              signal.provider,

            eventType:
              signal.eventType,

            resolutionType:
              "recovery_signal",
          },
        }
      );

    incident.lastObservedAt =
      now;

    incident.lastSignalAt =
      now;

    incident.resolutionType =
      "recovery_signal";

    incident.resolution =
      reason ||
      `Recovery signal received from ${signal.provider}.`;

    if (
      signal.signalId &&
      !incident
        .signalIds
        .includes(
          signal.signalId
        )
    ) {
      incident.signalIds =
        [
          ...incident
            .signalIds,

          signal.signalId,
        ]
          .slice(
            -MAX_SIGNAL_IDS
          );
    }

    pushBounded(
      incident.evidence,
      sanitizeSignalEvidence(
        signal
      ),
      MAX_SIGNAL_EVIDENCE
    );

    incident.evidenceCount =
      (
        incident
          .evidenceCount ||
        0
      ) + 1;

    await incidentRepository
      .save(
        incident
      );

    await publishIncidentLifecycle(
      "INCIDENT_RESOLVED",
      incident,
      {
        changeType:
          "recovery_signal",

        signalId:
          signal.signalId,

        resolutionType:
          "recovery_signal",
      }
    );
  }

  return incidents;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // --------------------------------------------------------------------------
  // Legacy monitor compatibility
  // --------------------------------------------------------------------------

  openOrUpdate,

  resolveForMonitor,

  // --------------------------------------------------------------------------
  // Canonical Phase 4 -> Phase 5 path
  // --------------------------------------------------------------------------

  openOrUpdateFromSignal,

  resolveFromSignal,

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  transitionStatus,

  acknowledge,

  startInvestigation,

  startRecovery,

  resolveManually,

  reopen,

  close,

  assign,

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  fingerprintFor,

  fingerprintForSignal,

  sanitizeEvidence,

  sanitizeSignalEvidence,

  detectionMethodFor,

  publishIncidentLifecycle,

  OPEN_STATUSES,
};