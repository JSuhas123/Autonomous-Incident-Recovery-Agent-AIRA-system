"use strict";

const express = require("express");
const Joi     = require("joi");
const mongoose = require("mongoose");

const { Incident, INCIDENT_STATUSES, INCIDENT_SEVERITIES } = require("../models/Incident");
const incidentService = require("../services/incidents/incidentService");
const { getIncidentPlaybookService } = require("../services/incidents/incidentPlaybookService");
const { record: auditRecord } = require("../services/identity/identityAuditService");
const { AUTH_EVENT_TYPES, AUTH_EVENT_OUTCOMES } = require("../constants/authEvents");

const router = express.Router();

const PAGE_LIMIT = 100;

// ─── Serialiser ────────────────────────────────────────────────────────────────

function safeIncident(doc) {
  return {
    id:              doc._id,
    organizationId:  doc.organizationId,
    serviceId:       doc.serviceId,
    monitorId:       doc.monitorId,
    fingerprint:     doc.fingerprint,
    title:           doc.title,
    description:     doc.description,
    severity:        doc.severity,
    status:          doc.status,
    impact:          doc.impact,
    startedAt:       doc.startedAt,
    detectedAt:      doc.detectedAt,
    acknowledgedAt:  doc.acknowledgedAt,
    resolvedAt:      doc.resolvedAt,
    lastObservedAt:  doc.lastObservedAt,
    occurrenceCount: doc.occurrenceCount,
    evidence:        doc.evidence ?? [],
    assignedTo:      doc.assignedTo,
    resolution:      doc.resolution,
    tags:            doc.tags ?? [],
    createdAt:       doc.createdAt,
    updatedAt:       doc.updatedAt,
  };
}

// ─── Load + org-isolation helper ───────────────────────────────────────────────

async function loadIncident(req, res) {
  const { incidentId } = req.params;
  let incident;
  try {
    incident = await Incident.findById(incidentId);
  } catch {
    res.status(400).json({ error: "Invalid incident ID" });
    return null;
  }
  if (!incident) { res.status(404).json({ error: "Incident not found" }); return null; }
  if (incident.organizationId.toString() !== req.auth.organizationId.toString()) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return incident;
}

// ─── Validation schemas ────────────────────────────────────────────────────────

const acknowledgeSchema = Joi.object({
  note: Joi.string().max(512).allow("").optional(),
});

const resolveSchema = Joi.object({
  resolution: Joi.string().max(2048).allow("").optional(),
});

const reopenSchema = Joi.object({
  reason: Joi.string().max(512).allow("").optional(),
});

const assignSchema = Joi.object({
  assigneeId: Joi.string().allow(null).optional(),
  note:       Joi.string().max(512).allow("").optional(),
});

// ─── GET /  — list incidents ───────────────────────────────────────────────────

router.get("/", async (req, res) => {
  const q = req.query;
  const filter = { organizationId: req.auth.organizationId };

  if (q.status)   filter.status   = q.status;
  if (q.severity) filter.severity = q.severity;
  if (q.serviceId && mongoose.Types.ObjectId.isValid(q.serviceId)) {
    filter.serviceId = q.serviceId;
  }
  if (q.from || q.to) {
    filter.detectedAt = {};
    if (q.from) filter.detectedAt.$gte = new Date(q.from);
    if (q.to)   filter.detectedAt.$lte = new Date(q.to);
  }

  const limit  = Math.min(parseInt(q.limit ?? "50", 10), PAGE_LIMIT);
  const before = q.before ? new Date(q.before) : undefined;
  if (before && !isNaN(before)) {
    filter.createdAt = { ...(filter.createdAt ?? {}), $lt: before };
  }

  const incidents = await Incident.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return res.json({ incidents: incidents.map(safeIncident), count: incidents.length });
});

// ─── GET /:incidentId ─────────────────────────────────────────────────────────

router.get("/:incidentId", async (req, res) => {
  const incident = await loadIncident(req, res);
  if (!incident) return;
  return res.json({ incident: safeIncident(incident) });
});

// ─── POST /:incidentId/acknowledge ────────────────────────────────────────────

router.post("/:incidentId/acknowledge", async (req, res) => {
  const incident = await loadIncident(req, res);
  if (!incident) return;

  const { error, value } = acknowledgeSchema.validate(req.body);
  if (error) return res.status(422).json({ error: error.details[0].message });

  let updated;
  try {
    updated = await incidentService.acknowledge(incident._id, {
      userId: req.auth.userId,
      note:   value.note,
    });
  } catch (err) {
    return res.status(err.status ?? 500).json({ error: err.message });
  }

  auditRecord(
    AUTH_EVENT_TYPES.INCIDENT_ACKNOWLEDGED,
    AUTH_EVENT_OUTCOMES.SUCCESS,
    { userId: req.auth.userId, organizationId: req.auth.organizationId, tenantId: req.auth.tenantId,
      metadata: { incidentId: incident._id } }
  ).catch(() => {});

  return res.json({ incident: safeIncident(updated) });
});

// ─── POST /:incidentId/resolve ────────────────────────────────────────────────

router.post("/:incidentId/resolve", async (req, res) => {
  const incident = await loadIncident(req, res);
  if (!incident) return;

  const { error, value } = resolveSchema.validate(req.body);
  if (error) return res.status(422).json({ error: error.details[0].message });

  let updated;
  try {
    updated = await incidentService.resolveManually(incident._id, {
      userId:     req.auth.userId,
      resolution: value.resolution,
    });
  } catch (err) {
    return res.status(err.status ?? 500).json({ error: err.message });
  }

  auditRecord(
    AUTH_EVENT_TYPES.INCIDENT_RESOLVED,
    AUTH_EVENT_OUTCOMES.SUCCESS,
    { userId: req.auth.userId, organizationId: req.auth.organizationId, tenantId: req.auth.tenantId,
      metadata: { incidentId: incident._id } }
  ).catch(() => {});

  return res.json({ incident: safeIncident(updated) });
});

// ─── POST /:incidentId/reopen ─────────────────────────────────────────────────

router.post("/:incidentId/reopen", async (req, res) => {
  const incident = await loadIncident(req, res);
  if (!incident) return;

  const { error, value } = reopenSchema.validate(req.body);
  if (error) return res.status(422).json({ error: error.details[0].message });

  let updated;
  try {
    updated = await incidentService.reopen(incident._id, {
      userId: req.auth.userId,
      reason: value.reason,
    });
  } catch (err) {
    return res.status(err.status ?? 500).json({ error: err.message });
  }

  auditRecord(
    AUTH_EVENT_TYPES.INCIDENT_REOPENED,
    AUTH_EVENT_OUTCOMES.SUCCESS,
    { userId: req.auth.userId, organizationId: req.auth.organizationId, tenantId: req.auth.tenantId,
      metadata: { incidentId: incident._id } }
  ).catch(() => {});

  return res.json({ incident: safeIncident(updated) });
});

// ─── PATCH /:incidentId/assignment ───────────────────────────────────────────

router.patch("/:incidentId/assignment", async (req, res) => {
  const incident = await loadIncident(req, res);
  if (!incident) return;

  const { error, value } = assignSchema.validate(req.body);
  if (error) return res.status(422).json({ error: error.details[0].message });

  const updated = await incidentService.assign(incident._id, {
    userId:     req.auth.userId,
    assigneeId: value.assigneeId,
    note:       value.note,
  });

  auditRecord(
    AUTH_EVENT_TYPES.INCIDENT_ASSIGNED,
    AUTH_EVENT_OUTCOMES.SUCCESS,
    { userId: req.auth.userId, organizationId: req.auth.organizationId, tenantId: req.auth.tenantId,
      metadata: { incidentId: incident._id, assigneeId: value.assigneeId } }
  ).catch(() => {});

  return res.json({ incident: safeIncident(updated) });
});

// ─── GET /:incidentId/timeline ────────────────────────────────────────────────

router.get("/:incidentId/timeline", async (req, res) => {
  const incident = await loadIncident(req, res);
  if (!incident) return;

  const timeline = (incident.timeline ?? [])
    .sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt))
    .map((e) => ({
      id:          e._id,
      occurredAt:  e.occurredAt,
      eventType:   e.eventType,
      actor:       e.actor,
      actorId:     e.actorId,
      description: e.description,
      metadata:    e.metadata,
    }));

  return res.json({ timeline, count: timeline.length });
});

// ─── GET /:incidentId/playbooks — analyse matching playbooks ──────────────────

router.get("/:incidentId/playbooks", async (req, res) => {
  const incident = await loadIncident(req, res);
  if (!incident) return;

  try {
    const tenantId = req.auth?.tenantId || incident.organizationId?.toString();
    const analysis = await getIncidentPlaybookService().analyseIncident(incident, { tenantId });
    return res.json(analysis);
  } catch (err) {
    return res.status(500).json({ error: "Failed to analyse playbooks", details: err.message });
  }
});

// ─── POST /:incidentId/playbooks/execute — execute best matching playbook ────

router.post("/:incidentId/playbooks/execute", async (req, res) => {
  const incident = await loadIncident(req, res);
  if (!incident) return;

  try {
    const tenantId      = req.auth?.tenantId || incident.organizationId?.toString();
    const { dryRun, correlationId } = req.body || {};

    const result = await getIncidentPlaybookService().executeForIncident(incident, {
      tenantId,
      correlationId,
      initiatedBy: req.auth?.userId,
      dryRun: !!dryRun,
    });

    const status = result.executed ? 200 : 202;
    return res.status(status).json(result);
  } catch (err) {
    return res.status(500).json({ error: "Failed to execute playbook", details: err.message });
  }
});

module.exports = router;
