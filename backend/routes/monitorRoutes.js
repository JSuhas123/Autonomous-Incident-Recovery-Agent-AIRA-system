"use strict";

const express = require("express");
const Joi     = require("joi");

const Monitor    = require("../models/Monitor");
const MonitorCheck = require("../models/MonitorCheck");
const Service    = require("../models/Service");
const { sanitizeHeaders } = require("../models/Monitor");
const { executeCheck }    = require("../services/monitoring/monitorExecutionService");
const { record: auditRecord } = require("../services/identity/identityAuditService");
const { AUTH_EVENT_TYPES, AUTH_EVENT_OUTCOMES } = require("../constants/authEvents");

const CHECKS_PAGE_LIMIT = 100;

// ─── Validation schemas ───────────────────────────────────────────────────────

const monitorCreateSchema = Joi.object({
  name:                        Joi.string().trim().min(1).max(100).required(),
  type:                        Joi.string().valid("http", "https", "ssl").required(),
  url:                         Joi.string().uri({ scheme: ["http", "https"] }).max(2048).required(),
  method:                      Joi.string().valid("GET", "HEAD", "POST", "PUT", "PATCH").default("GET"),
  enabled:                     Joi.boolean().default(true),
  intervalSeconds:             Joi.number().integer().min(30).max(86400).default(60),
  timeoutMs:                   Joi.number().integer().min(1000).max(30000).default(10000),
  expectedStatusCodes:         Joi.array().items(Joi.number().integer().min(100).max(599)).default([200]),
  expectedText:                Joi.string().max(500).allow(null, "").default(null),
  requestHeaders:              Joi.object().pattern(Joi.string(), Joi.string()).default({}),
  requestBody:                 Joi.string().max(10240).allow(null, "").default(null),
  followRedirects:             Joi.boolean().default(true),
  maximumRedirects:            Joi.number().integer().min(0).max(10).default(5),
  sslExpiryWarningDays:        Joi.number().integer().min(1).max(90).default(30),
  consecutiveFailureThreshold: Joi.number().integer().min(1).max(10).default(3),
  recoverySuccessThreshold:    Joi.number().integer().min(1).max(5).default(2),
  regions:                     Joi.array().items(Joi.string()).default(["default"]),
}).options({ stripUnknown: true });

const monitorUpdateSchema = monitorCreateSchema.fork(
  ["name", "type", "url"],
  (s) => s.optional()
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeMonitor(doc) {
  return {
    id:               doc._id,
    serviceId:        doc.serviceId,
    organizationId:   doc.organizationId,
    name:             doc.name,
    type:             doc.type,
    url:              doc.url,
    method:           doc.method,
    enabled:          doc.enabled,
    intervalSeconds:  doc.intervalSeconds,
    timeoutMs:        doc.timeoutMs,
    expectedStatusCodes:          doc.expectedStatusCodes,
    expectedText:     doc.expectedText,
    requestHeaders:   doc.requestHeaders instanceof Map
      ? Object.fromEntries(doc.requestHeaders) : doc.requestHeaders,
    followRedirects:  doc.followRedirects,
    maximumRedirects: doc.maximumRedirects,
    sslExpiryWarningDays:         doc.sslExpiryWarningDays,
    consecutiveFailureThreshold:  doc.consecutiveFailureThreshold,
    recoverySuccessThreshold:     doc.recoverySuccessThreshold,
    regions:          doc.regions,
    lastStatus:       doc.lastStatus,
    lastCheckedAt:    doc.lastCheckedAt,
    lastStatusCode:   doc.lastStatusCode,
    lastResponseTimeMs: doc.lastResponseTimeMs,
    consecutiveFailures: doc.consecutiveFailures,
    consecutiveSuccesses: doc.consecutiveSuccesses,
    nextCheckAt:      doc.nextCheckAt,
    createdAt:        doc.createdAt,
    updatedAt:        doc.updatedAt,
  };
}

function safeCheck(doc) {
  return {
    id:               doc._id,
    monitorId:        doc.monitorId,
    checkedAt:        doc.checkedAt,
    status:           doc.status,
    statusCode:       doc.statusCode,
    responseTimeMs:   doc.responseTimeMs,
    responseSizeBytes: doc.responseSizeBytes,
    dnsTimeMs:        doc.dnsTimeMs,
    tcpTimeMs:        doc.tcpTimeMs,
    tlsTimeMs:        doc.tlsTimeMs,
    firstByteTimeMs:  doc.firstByteTimeMs,
    sslValid:         doc.sslValid,
    sslDaysRemaining: doc.sslDaysRemaining,
    contentMatched:   doc.contentMatched,
    redirectCount:    doc.redirectCount,
    errorCode:        doc.errorCode,
    sanitizedErrorMessage: doc.sanitizedErrorMessage,
    checkerRegion:    doc.checkerRegion,
  };
}

/** Load monitor and enforce org isolation. */
async function loadMonitor(req, res) {
  const { monitorId } = req.params;
  let monitor;
  try {
    monitor = await Monitor.findById(monitorId);
  } catch {
    res.status(400).json({ error: "Invalid monitor ID" });
    return null;
  }
  if (!monitor) { res.status(404).json({ error: "Monitor not found" }); return null; }
  if (monitor.organizationId.toString() !== req.auth.organizationId.toString()) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return monitor;
}

// ─── Service-scoped router  (mounted at /:serviceId/monitors) ─────────────────

const serviceMonitorRouter = express.Router({ mergeParams: true });

/**
 * POST /:serviceId/monitors  — create a monitor for a service
 */
serviceMonitorRouter.post("/", async (req, res) => {
  const { serviceId } = req.params;
  const orgId = req.auth.organizationId;

  // Verify the service belongs to this org
  let service;
  try {
    service = await Service.findById(serviceId);
  } catch {
    return res.status(400).json({ error: "Invalid service ID" });
  }
  if (!service) return res.status(404).json({ error: "Service not found" });
  if (service.organizationId.toString() !== orgId.toString()) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { error, value } = monitorCreateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  // Sanitize headers before storage
  value.requestHeaders = sanitizeHeaders(value.requestHeaders ?? {});

  const monitor = await Monitor.create({
    ...value,
    serviceId:      service._id,
    organizationId: orgId,
    tenantId:       req.auth.tenantId,
    createdBy:      req.auth.userId,
    nextCheckAt:    new Date(),  // schedule immediately
  });

  await auditRecord(
    AUTH_EVENT_TYPES.MONITOR_CREATED,
    AUTH_EVENT_OUTCOMES.SUCCESS,
    { userId: req.auth.userId, organizationId: orgId, tenantId: req.auth.tenantId,
      metadata: { monitorId: monitor._id, serviceId, name: value.name } }
  ).catch(() => {});

  return res.status(201).json({ monitor: safeMonitor(monitor) });
});

/**
 * GET /:serviceId/monitors  — list monitors for a service
 */
serviceMonitorRouter.get("/", async (req, res) => {
  const { serviceId } = req.params;
  const orgId = req.auth.organizationId;

  let service;
  try {
    service = await Service.findById(serviceId);
  } catch {
    return res.status(400).json({ error: "Invalid service ID" });
  }
  if (!service) return res.status(404).json({ error: "Service not found" });
  if (service.organizationId.toString() !== orgId.toString()) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const monitors = await Monitor.find({ serviceId: service._id, organizationId: orgId })
    .sort({ createdAt: 1 });

  return res.json({ monitors: monitors.map(safeMonitor) });
});

// ─── Top-level monitor router  (mounted at /api/v1/monitors) ─────────────────

const topLevelRouter = express.Router();

/**
 * GET /  — list all monitors for the authenticated org (cross-service)
 */
topLevelRouter.get("/", async (req, res) => {
  const monitors = await Monitor.find({ organizationId: req.auth.organizationId })
    .sort({ createdAt: 1 })
    .limit(500);
  return res.json({ monitors: monitors.map(safeMonitor) });
});

/**
 * GET /:monitorId  — get a single monitor
 */
topLevelRouter.get("/:monitorId", async (req, res) => {
  const monitor = await loadMonitor(req, res);
  if (!monitor) return;
  return res.json({ monitor: safeMonitor(monitor) });
});

/**
 * PATCH /:monitorId  — update monitor fields
 */
topLevelRouter.patch("/:monitorId", async (req, res) => {
  const monitor = await loadMonitor(req, res);
  if (!monitor) return;

  const { error, value } = monitorUpdateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  if (value.requestHeaders !== undefined) {
    value.requestHeaders = sanitizeHeaders(value.requestHeaders);
  }

  Object.assign(monitor, value);
  await monitor.save();

  await auditRecord(
    AUTH_EVENT_TYPES.MONITOR_UPDATED,
    AUTH_EVENT_OUTCOMES.SUCCESS,
    { userId: req.auth.userId, organizationId: req.auth.organizationId, tenantId: req.auth.tenantId,
      metadata: { monitorId: monitor._id, fields: Object.keys(value) } }
  ).catch(() => {});

  return res.json({ monitor: safeMonitor(monitor) });
});

/**
 * POST /:monitorId/pause  — disable a monitor
 */
topLevelRouter.post("/:monitorId/pause", async (req, res) => {
  const monitor = await loadMonitor(req, res);
  if (!monitor) return;
  if (!monitor.enabled) return res.status(400).json({ error: "Monitor is already paused" });

  monitor.enabled = false;
  await monitor.save();

  await auditRecord(
    AUTH_EVENT_TYPES.MONITOR_PAUSED,
    AUTH_EVENT_OUTCOMES.SUCCESS,
    { userId: req.auth.userId, organizationId: req.auth.organizationId, tenantId: req.auth.tenantId,
      metadata: { monitorId: monitor._id } }
  ).catch(() => {});

  return res.json({ monitor: safeMonitor(monitor) });
});

/**
 * POST /:monitorId/resume  — enable a monitor
 */
topLevelRouter.post("/:monitorId/resume", async (req, res) => {
  const monitor = await loadMonitor(req, res);
  if (!monitor) return;
  if (monitor.enabled) return res.status(400).json({ error: "Monitor is already active" });

  monitor.enabled  = true;
  monitor.nextCheckAt = new Date();  // run immediately on resume
  await monitor.save();

  await auditRecord(
    AUTH_EVENT_TYPES.MONITOR_RESUMED,
    AUTH_EVENT_OUTCOMES.SUCCESS,
    { userId: req.auth.userId, organizationId: req.auth.organizationId, tenantId: req.auth.tenantId,
      metadata: { monitorId: monitor._id } }
  ).catch(() => {});

  return res.json({ monitor: safeMonitor(monitor) });
});

/**
 * POST /:monitorId/test  — run an immediate check without persisting
 */
topLevelRouter.post("/:monitorId/test", async (req, res) => {
  const monitor = await loadMonitor(req, res);
  if (!monitor) return;

  const result = await executeCheck(monitor);

  // Never persist test results
  return res.json({ result: safeCheck(result) });
});

/**
 * GET /:monitorId/checks  — paginated check history
 */
topLevelRouter.get("/:monitorId/checks", async (req, res) => {
  const monitor = await loadMonitor(req, res);
  if (!monitor) return;

  const limit  = Math.min(parseInt(req.query.limit ?? "50", 10), CHECKS_PAGE_LIMIT);
  const before = req.query.before ? new Date(req.query.before) : undefined;

  const query = { monitorId: monitor._id };
  if (before && !isNaN(before)) query.checkedAt = { $lt: before };

  const checks = await MonitorCheck.find(query)
    .sort({ checkedAt: -1 })
    .limit(limit);

  return res.json({ checks: checks.map(safeCheck), count: checks.length });
});

/**
 * DELETE /:monitorId  — delete monitor and all its checks
 */
topLevelRouter.delete("/:monitorId", async (req, res) => {
  const monitor = await loadMonitor(req, res);
  if (!monitor) return;

  await MonitorCheck.deleteMany({ monitorId: monitor._id });
  await Monitor.deleteOne({ _id: monitor._id });

  await auditRecord(
    AUTH_EVENT_TYPES.MONITOR_DELETED,
    AUTH_EVENT_OUTCOMES.SUCCESS,
    { userId: req.auth.userId, organizationId: req.auth.organizationId, tenantId: req.auth.tenantId,
      metadata: { monitorId: monitor._id, name: monitor.name } }
  ).catch(() => {});

  return res.status(204).end();
});

module.exports = { topLevelRouter, serviceMonitorRouter };
