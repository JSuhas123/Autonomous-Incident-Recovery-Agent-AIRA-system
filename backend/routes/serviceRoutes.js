"use strict";

const express = require("express");
const Joi = require("joi");
const crypto = require("crypto");

const Service = require("../models/Service");
const { validateServiceUrl } = require("../utils/urlValidator");
const { record: auditRecord } = require("../services/identity/identityAuditService");
const { AUTH_EVENT_TYPES, AUTH_EVENT_OUTCOMES } = require("../constants/authEvents");

const {
  SERVICE_TYPES,
  SERVICE_ENVS,
  SERVICE_STATUSES,
  VERIFICATION_STATUSES,
  MONITORING_STATUSES,
} = require("../models/Service");

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "service";
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base}-${suffix}`;
}

function safeService(doc) {
  return {
    id: doc._id,
    organizationId: doc.organizationId,
    name: doc.name,
    slug: doc.slug,
    description: doc.description,
    type: doc.type,
    environment: doc.environment,
    baseUrl: doc.baseUrl,
    status: doc.status,
    verificationStatus: doc.verificationStatus,
    monitoringStatus: doc.monitoringStatus,
    tags: doc.tags,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    archivedAt: doc.archivedAt,
  };
}

function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: error.details.map((d) => ({ field: d.path.join("."), message: d.message })),
      });
    }
    req.validatedBody = value;
    next();
  };
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createSchema = Joi.object({
  name: Joi.string().min(1).max(100).trim().required(),
  description: Joi.string().max(500).trim().allow("", null).default(null),
  type: Joi.string().valid(...SERVICE_TYPES).required(),
  environment: Joi.string().valid(...SERVICE_ENVS).required(),
  baseUrl: Joi.string().uri({ scheme: ["http", "https"] }).max(2048).allow("", null).default(null),
  tags: Joi.array().items(Joi.string().trim().max(50)).max(20).default([]),
});

const updateSchema = Joi.object({
  name: Joi.string().min(1).max(100).trim(),
  description: Joi.string().max(500).trim().allow("", null),
  type: Joi.string().valid(...SERVICE_TYPES),
  environment: Joi.string().valid(...SERVICE_ENVS),
  baseUrl: Joi.string().uri({ scheme: ["http", "https"] }).max(2048).allow("", null),
  tags: Joi.array().items(Joi.string().trim().max(50)).max(20),
});

const listQuerySchema = Joi.object({
  page:               Joi.number().integer().min(1).default(1),
  limit:              Joi.number().integer().min(1).max(100).default(20),
  search:             Joi.string().trim().max(100).allow("").default(""),
  type:               Joi.string().valid(...SERVICE_TYPES, "").allow("").default(""),
  environment:        Joi.string().valid(...SERVICE_ENVS, "").allow("").default(""),
  status:             Joi.string().valid(...SERVICE_STATUSES, "").allow("").default(""),
  verificationStatus: Joi.string().valid(...VERIFICATION_STATUSES, "").allow("").default(""),
  monitoringStatus:   Joi.string().valid(...MONITORING_STATUSES, "").allow("").default(""),
  sortBy:             Joi.string().valid("createdAt", "updatedAt", "name").default("createdAt"),
  order:              Joi.string().valid("asc", "desc").default("desc"),
});

// ─── POST /api/v1/services ────────────────────────────────────────────────────

router.post("/", validate(createSchema), async (req, res, next) => {
  try {
    const { organizationId, tenantId, userId } = req.auth;
    const { name, description, type, environment, baseUrl, tags } = req.validatedBody;

    // Validate URL if supplied
    let normalisedUrl = null;
    if (baseUrl) {
      const urlCheck = validateServiceUrl(baseUrl);
      if (!urlCheck.valid) {
        return res.status(400).json({ error: urlCheck.reason, code: "INVALID_URL" });
      }
      normalisedUrl = urlCheck.normalised;
    }

    const slug = slugify(name);

    let service;
    try {
      service = await Service.create({
        organizationId,
        tenantId,
        name,
        slug,
        description,
        type,
        environment,
        baseUrl: normalisedUrl,
        tags,
        createdBy: userId,
      });
    } catch (err) {
      // Unique index on (organizationId, slug) — practically impossible to hit but guard anyway
      if (err.code === 11000) {
        return res.status(409).json({ error: "A service with this name already exists in your organization", code: "DUPLICATE_SERVICE" });
      }
      throw err;
    }

    // Check for a logical duplicate (same org, same name, active)
    const dupCount = await Service.countDocuments({
      organizationId,
      name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      status: { $ne: "archived" },
      _id: { $ne: service._id },
    });
    if (dupCount > 0) {
      await Service.deleteOne({ _id: service._id });
      return res.status(409).json({ error: "A service with this name already exists in your organization", code: "DUPLICATE_SERVICE" });
    }

    await auditRecord("service_created", AUTH_EVENT_OUTCOMES.SUCCESS, {
      userId,
      organizationId,
      metadata: { serviceId: service._id, name, type, environment },
    });

    return res.status(201).json({ success: true, data: safeService(service) });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/services ─────────────────────────────────────────────────────

router.get("/", async (req, res, next) => {
  try {
    const { error: qErr, value: q } = listQuerySchema.validate(req.query, { abortEarly: false, stripUnknown: true });
    if (qErr) {
      return res.status(400).json({ error: "Invalid query parameters", code: "VALIDATION_ERROR" });
    }

    const { organizationId } = req.auth;
    const filter = { organizationId };

    if (q.search)             filter.name = { $regex: q.search, $options: "i" };
    if (q.type)               filter.type = q.type;
    if (q.environment)        filter.environment = q.environment;
    if (q.status)             filter.status = q.status;
    if (q.verificationStatus) filter.verificationStatus = q.verificationStatus;
    if (q.monitoringStatus)   filter.monitoringStatus = q.monitoringStatus;

    const sortField = q.sortBy === "name" ? "name" : q.sortBy;
    const sortDir   = q.order === "asc" ? 1 : -1;

    const skip  = (q.page - 1) * q.limit;
    const total = await Service.countDocuments(filter);
    const docs  = await Service.find(filter)
      .sort({ [sortField]: sortDir })
      .skip(skip)
      .limit(q.limit)
      .lean();

    return res.json({
      success: true,
      data: docs.map(safeService),
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        pages: Math.ceil(total / q.limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/services/:serviceId ─────────────────────────────────────────

router.get("/:serviceId", async (req, res, next) => {
  try {
    const { organizationId } = req.auth;
    const service = await Service.findOne({ _id: req.params.serviceId, organizationId }).lean();
    if (!service) {
      return res.status(404).json({ error: "Service not found", code: "SERVICE_NOT_FOUND" });
    }
    return res.json({ success: true, data: safeService(service) });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/v1/services/:serviceId ───────────────────────────────────────

router.patch("/:serviceId", validate(updateSchema), async (req, res, next) => {
  try {
    const { organizationId, userId } = req.auth;
    const updates = { ...req.validatedBody };

    if (updates.baseUrl !== undefined && updates.baseUrl) {
      const urlCheck = validateServiceUrl(updates.baseUrl);
      if (!urlCheck.valid) {
        return res.status(400).json({ error: urlCheck.reason, code: "INVALID_URL" });
      }
      updates.baseUrl = urlCheck.normalised;
    }

    const service = await Service.findOneAndUpdate(
      { _id: req.params.serviceId, organizationId },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!service) {
      return res.status(404).json({ error: "Service not found", code: "SERVICE_NOT_FOUND" });
    }

    await auditRecord("service_updated", AUTH_EVENT_OUTCOMES.SUCCESS, {
      userId,
      organizationId,
      metadata: { serviceId: service._id, fields: Object.keys(updates) },
    });

    return res.json({ success: true, data: safeService(service) });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/services/:serviceId/pause ──────────────────────────────────

router.post("/:serviceId/pause", async (req, res, next) => {
  try {
    const { organizationId, userId } = req.auth;
    const service = await Service.findOneAndUpdate(
      { _id: req.params.serviceId, organizationId, status: "active" },
      { $set: { status: "paused" } },
      { new: true }
    );
    if (!service) {
      return res.status(404).json({ error: "Service not found or not active", code: "SERVICE_NOT_FOUND" });
    }
    await auditRecord("service_paused", AUTH_EVENT_OUTCOMES.SUCCESS, {
      userId, organizationId, metadata: { serviceId: service._id },
    });
    return res.json({ success: true, data: safeService(service) });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/services/:serviceId/resume ─────────────────────────────────

router.post("/:serviceId/resume", async (req, res, next) => {
  try {
    const { organizationId, userId } = req.auth;
    const service = await Service.findOneAndUpdate(
      { _id: req.params.serviceId, organizationId, status: "paused" },
      { $set: { status: "active" } },
      { new: true }
    );
    if (!service) {
      return res.status(404).json({ error: "Service not found or not paused", code: "SERVICE_NOT_FOUND" });
    }
    await auditRecord("service_restored", AUTH_EVENT_OUTCOMES.SUCCESS, {
      userId, organizationId, metadata: { serviceId: service._id },
    });
    return res.json({ success: true, data: safeService(service) });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/v1/services/:serviceId (soft-archive) ───────────────────────

router.delete("/:serviceId", async (req, res, next) => {
  try {
    const { organizationId, userId } = req.auth;
    const service = await Service.findOneAndUpdate(
      { _id: req.params.serviceId, organizationId, status: { $ne: "archived" } },
      { $set: { status: "archived", archivedAt: new Date() } },
      { new: true }
    );
    if (!service) {
      return res.status(404).json({ error: "Service not found or already archived", code: "SERVICE_NOT_FOUND" });
    }
    await auditRecord("service_archived", AUTH_EVENT_OUTCOMES.SUCCESS, {
      userId, organizationId, metadata: { serviceId: service._id },
    });
    return res.json({ success: true, data: safeService(service) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
