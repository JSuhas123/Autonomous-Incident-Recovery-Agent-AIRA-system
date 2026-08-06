"use strict";

/**
 * Incident service.
 *
 * Handles opening, deduplicating, updating, and resolving incidents driven by
 * monitor state transitions.  All operations are scoped to organizationId.
 *
 * Language note: failures are described as "observed failures" and
 * "probable contributing signals" — not "root causes" — until deeper
 * telemetry is available.
 */

const crypto = require("crypto");
const { Incident, buildFingerprint } = require("../../models/Incident");

const OPEN_STATUSES   = ["open", "acknowledged", "investigating", "recovering"];
const MAX_EVIDENCE    = 20;  // keep last N check results as evidence

// ─── Fingerprint ──────────────────────────────────────────────────────────────

/** Derive a short, deterministic hex fingerprint from incident context. */
function fingerprintFor(ctx) {
  const raw = buildFingerprint(ctx);
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

// ─── Severity inference ───────────────────────────────────────────────────────

/**
 * Infer severity from failure context:
 *  - Connection errors → critical
 *  - SSL issues → warning
 *  - Non-2xx status → warning (upgrades to critical after many occurrences)
 */
function inferSeverity(errorCode, occurrenceCount = 1) {
  if (["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"].includes(errorCode)) {
    return "critical";
  }
  if (errorCode === "CERT_HAS_EXPIRED") return "critical";
  if (errorCode && errorCode.startsWith("CERT_")) return "warning";
  if (occurrenceCount >= 5) return "critical";
  return "warning";
}

// ─── Evidence sanitizer ───────────────────────────────────────────────────────

function sanitizeEvidence(check) {
  return {
    checkedAt:             check.checkedAt ?? new Date(),
    status:                check.status,
    statusCode:            check.statusCode ?? null,
    responseTimeMs:        check.responseTimeMs ?? null,
    errorCode:             check.errorCode ?? null,
    sanitizedErrorMessage: check.sanitizedErrorMessage ?? null,
    checkerRegion:         check.checkerRegion ?? "default",
  };
}

// ─── Open / deduplicate ───────────────────────────────────────────────────────

/**
 * Called after the monitor crosses the consecutiveFailureThreshold.
 *
 * - If an open incident with the same fingerprint already exists → update it.
 * - Otherwise → create a new open incident.
 *
 * Returns { incident, created }.
 */
async function openOrUpdate({ monitor, check, transitionedAt }) {
  const ctx = {
    organizationId: monitor.organizationId,
    serviceId:      monitor.serviceId,
    monitorId:      monitor._id,
    errorCode:      check.errorCode,
  };

  const fingerprint = fingerprintFor(ctx);
  const now = transitionedAt ?? new Date();

  // Look for any open incident with this fingerprint in this org
  const existing = await Incident.findOne({
    organizationId: monitor.organizationId,
    fingerprint,
    status: { $in: OPEN_STATUSES },
  });

  if (existing) {
    // Deduplicate: update occurrence count and refresh evidence
    const evidence = [
      ...existing.evidence,
      sanitizeEvidence(check),
    ].slice(-MAX_EVIDENCE);

    const severity = inferSeverity(check.errorCode, existing.occurrenceCount + 1);

    existing.occurrenceCount  += 1;
    existing.lastObservedAt    = now;
    existing.evidence          = evidence;
    existing.severity          = severity;
    existing.timeline.push({
      occurredAt:  now,
      eventType:   "observed_failure",
      actor:       "system",
      description: `Probable contributing signal observed again (${existing.occurrenceCount} occurrences). ${check.sanitizedErrorMessage ?? check.status ?? ""}`.trim(),
      metadata:    { statusCode: check.statusCode, errorCode: check.errorCode },
    });

    await existing.save();
    return { incident: existing, created: false };
  }

  // New incident
  const severity = inferSeverity(check.errorCode, 1);
  const title = buildTitle(monitor, check);

  const incident = await Incident.create({
    organizationId: monitor.organizationId,
    tenantId:       monitor.tenantId,
    serviceId:      monitor.serviceId,
    monitorId:      monitor._id,
    source:         "monitor",
    sourceEventId:  `${monitor._id}::${check.errorCode || "http_failure"}`,
    fingerprint,
    title,
    description:    buildDescription(monitor, check),
    severity,
    status:         "open",
    impact:         `Monitor "${monitor.name}" at ${monitor.url} is reporting an observed failure.`,
    startedAt:      now,
    detectedAt:     now,
    lastObservedAt: now,
    occurrenceCount: 1,
    evidence:       [sanitizeEvidence(check)],
    timeline: [{
      occurredAt:  now,
      eventType:   "opened",
      actor:       "system",
      description: `Incident opened after ${monitor.consecutiveFailureThreshold} consecutive observed failures. ${check.sanitizedErrorMessage ?? ""}`.trim(),
      metadata:    { monitorId: monitor._id, threshold: monitor.consecutiveFailureThreshold },
    }],
  });

  return { incident, created: true };
}

// ─── Recovery ─────────────────────────────────────────────────────────────────

/**
 * Called after monitor.recoverySuccessThreshold consecutive successes.
 * Resolves any open incident for this monitor.
 */
async function resolveForMonitor({ monitor, resolvedAt }) {
  const now = resolvedAt ?? new Date();

  const fingerprint = fingerprintFor({
    organizationId: monitor.organizationId,
    serviceId:      monitor.serviceId,
    monitorId:      monitor._id,
    errorCode:      monitor._lastKnownErrorCode,  // may be undefined — fingerprint covers all failures
  });

  // Find all open incidents for this monitor (regardless of error code)
  const openIncidents = await Incident.find({
    organizationId: monitor.organizationId,
    monitorId:      monitor._id,
    status:         { $in: OPEN_STATUSES },
  });

  for (const incident of openIncidents) {
    incident.status     = "resolved";
    incident.resolvedAt = now;
    incident.timeline.push({
      occurredAt:  now,
      eventType:   "resolved",
      actor:       "system",
      description: `Monitor recovered after ${monitor.recoverySuccessThreshold} consecutive successful checks. Incident auto-resolved.`,
      metadata:    { monitorId: monitor._id, recoveryThreshold: monitor.recoverySuccessThreshold },
    });
    await incident.save();
  }

  return openIncidents;
}

// ─── Manual operations ────────────────────────────────────────────────────────

async function acknowledge(incidentId, { userId, note }) {
  const incident = await Incident.findById(incidentId);
  if (!incident) return null;
  if (!OPEN_STATUSES.includes(incident.status)) {
    throw Object.assign(new Error("Incident is not in an open state"), { status: 409 });
  }

  incident.status          = "acknowledged";
  incident.acknowledgedAt  = new Date();
  incident.timeline.push({
    occurredAt:  new Date(),
    eventType:   "acknowledged",
    actor:       "user",
    actorId:     userId,
    description: note ? `Acknowledged: ${note}` : "Incident acknowledged.",
  });

  await incident.save();
  return incident;
}

async function resolveManually(incidentId, { userId, resolution }) {
  const incident = await Incident.findById(incidentId);
  if (!incident) return null;

  incident.status     = "resolved";
  incident.resolvedAt = new Date();
  incident.resolution = resolution ?? null;
  incident.timeline.push({
    occurredAt:  new Date(),
    eventType:   "resolved",
    actor:       "user",
    actorId:     userId,
    description: resolution ? `Manually resolved: ${resolution}` : "Manually resolved.",
  });

  await incident.save();
  return incident;
}

async function reopen(incidentId, { userId, reason }) {
  const incident = await Incident.findById(incidentId);
  if (!incident) return null;
  if (incident.status !== "resolved" && incident.status !== "closed") {
    throw Object.assign(new Error("Only resolved or closed incidents can be reopened"), { status: 409 });
  }

  incident.status     = "open";
  incident.resolvedAt = null;
  incident.resolution = null;
  incident.timeline.push({
    occurredAt:  new Date(),
    eventType:   "reopened",
    actor:       "user",
    actorId:     userId,
    description: reason ? `Reopened: ${reason}` : "Incident reopened.",
  });

  await incident.save();
  return incident;
}

async function assign(incidentId, { userId, assigneeId, note }) {
  const incident = await Incident.findById(incidentId);
  if (!incident) return null;

  incident.assignedTo = assigneeId ?? null;
  incident.timeline.push({
    occurredAt:  new Date(),
    eventType:   "assigned",
    actor:       "user",
    actorId:     userId,
    description: assigneeId ? `Assigned to user ${assigneeId}.${note ? " " + note : ""}` : "Unassigned.",
    metadata:    { assigneeId },
  });

  await incident.save();
  return incident;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTitle(monitor, check) {
  if (check.errorCode === "ENOTFOUND")    return `${monitor.name}: DNS resolution failure`;
  if (check.errorCode === "ECONNREFUSED") return `${monitor.name}: Connection refused`;
  if (check.errorCode === "ETIMEDOUT")   return `${monitor.name}: Request timeout`;
  if (check.statusCode)                  return `${monitor.name}: HTTP ${check.statusCode} observed`;
  return `${monitor.name}: Observed failure`;
}

function buildDescription(monitor, check) {
  const method = check.sanitizedErrorMessage ?? `HTTP ${check.statusCode}`;
  return (
    `Monitor "${monitor.name}" checking ${monitor.url} reported an observed failure (${method}). ` +
    `This is a probable contributing signal. Deeper telemetry may be needed to determine root cause.`
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
