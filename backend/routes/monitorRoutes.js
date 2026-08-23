"use strict";

const express = require("express");
const Joi = require("joi");

const {
  Monitor,
  MonitorCheck,
  Service,
  sanitizeHeaders,
} = require("../persistence/operational/operationalModels");

const {
  executeCheck,
} = require("../services/monitoring/monitorExecutionService");

const {
  record: auditRecord,
} = require("../services/identity/identityAuditService");

const {
  AUTH_EVENT_TYPES,
  AUTH_EVENT_OUTCOMES,
} = require("../constants/authEvents");

const CHECKS_PAGE_LIMIT = 100;

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

const monitorCreateSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .required(),

  type: Joi.string()
    .valid("http", "https", "ssl")
    .required(),

  url: Joi.string()
    .uri({
      scheme: ["http", "https"],
    })
    .max(2048)
    .required(),

  method: Joi.string()
    .valid(
      "GET",
      "HEAD",
      "POST",
      "PUT",
      "PATCH"
    )
    .default("GET"),

  enabled: Joi.boolean()
    .default(true),

  intervalSeconds: Joi.number()
    .integer()
    .min(30)
    .max(86400)
    .default(60),

  timeoutMs: Joi.number()
    .integer()
    .min(1000)
    .max(30000)
    .default(10000),

  expectedStatusCodes: Joi.array()
    .items(
      Joi.number()
        .integer()
        .min(100)
        .max(599)
    )
    .default([200]),

  expectedText: Joi.string()
    .max(500)
    .allow(null, "")
    .default(null),

  requestHeaders: Joi.object()
    .pattern(
      Joi.string(),
      Joi.string()
    )
    .default({}),

  requestBody: Joi.string()
    .max(10240)
    .allow(null, "")
    .default(null),

  followRedirects: Joi.boolean()
    .default(true),

  maximumRedirects: Joi.number()
    .integer()
    .min(0)
    .max(10)
    .default(5),

  sslExpiryWarningDays: Joi.number()
    .integer()
    .min(1)
    .max(90)
    .default(30),

  consecutiveFailureThreshold:
    Joi.number()
      .integer()
      .min(1)
      .max(10)
      .default(3),

  recoverySuccessThreshold:
    Joi.number()
      .integer()
      .min(1)
      .max(5)
      .default(2),

  regions: Joi.array()
    .items(Joi.string())
    .default(["default"]),
}).options({
  stripUnknown: true,
});

const monitorUpdateSchema =
  monitorCreateSchema.fork(
    ["name", "type", "url"],
    (schema) => schema.optional()
  );

/* -------------------------------------------------------------------------- */
/* Serialization                                                              */
/* -------------------------------------------------------------------------- */

function safeMonitor(doc) {
  return {
    id: doc._id,

    serviceId:
      doc.serviceId,

    organizationId:
      doc.organizationId,

    environmentId:
      doc.environmentId,

    name:
      doc.name,

    type:
      doc.type,

    url:
      doc.url,

    method:
      doc.method,

    enabled:
      doc.enabled,

    intervalSeconds:
      doc.intervalSeconds,

    timeoutMs:
      doc.timeoutMs,

    expectedStatusCodes:
      doc.expectedStatusCodes,

    expectedText:
      doc.expectedText,

    requestHeaders:
      doc.requestHeaders instanceof Map
        ? Object.fromEntries(
            doc.requestHeaders
          )
        : doc.requestHeaders,

    followRedirects:
      doc.followRedirects,

    maximumRedirects:
      doc.maximumRedirects,

    sslExpiryWarningDays:
      doc.sslExpiryWarningDays,

    consecutiveFailureThreshold:
      doc.consecutiveFailureThreshold,

    recoverySuccessThreshold:
      doc.recoverySuccessThreshold,

    regions:
      doc.regions,

    lastStatus:
      doc.lastStatus,

    lastCheckedAt:
      doc.lastCheckedAt,

    lastStatusCode:
      doc.lastStatusCode,

    lastResponseTimeMs:
      doc.lastResponseTimeMs,

    consecutiveFailures:
      doc.consecutiveFailures,

    consecutiveSuccesses:
      doc.consecutiveSuccesses,

    nextCheckAt:
      doc.nextCheckAt,

    createdAt:
      doc.createdAt,

    updatedAt:
      doc.updatedAt,
  };
}

function safeCheck(doc) {
  return {
    id:
      doc._id,

    monitorId:
      doc.monitorId,

    checkedAt:
      doc.checkedAt,

    status:
      doc.status,

    statusCode:
      doc.statusCode,

    responseTimeMs:
      doc.responseTimeMs,

    responseSizeBytes:
      doc.responseSizeBytes,

    dnsTimeMs:
      doc.dnsTimeMs,

    tcpTimeMs:
      doc.tcpTimeMs,

    tlsTimeMs:
      doc.tlsTimeMs,

    firstByteTimeMs:
      doc.firstByteTimeMs,

    sslValid:
      doc.sslValid,

    sslDaysRemaining:
      doc.sslDaysRemaining,

    contentMatched:
      doc.contentMatched,

    redirectCount:
      doc.redirectCount,

    errorCode:
      doc.errorCode,

    sanitizedErrorMessage:
      doc.sanitizedErrorMessage,

    checkerRegion:
      doc.checkerRegion,
  };
}

/* -------------------------------------------------------------------------- */
/* Context helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Environment context should already have been resolved by the
 * canonical request-context/environment middleware.
 *
 * We deliberately do not trust environmentId supplied by clients.
 */
function getEnvironmentId(req) {
  return (
    req.context?.environmentId ||
    req.auth?.environmentId ||
    req.environment?._id ||
    null
  );
}

function requireEnvironment(req, res) {
  const environmentId =
    getEnvironmentId(req);

  if (!environmentId) {
    res.status(400).json({
      error:
        "No active environment selected",
      code:
        "ENVIRONMENT_REQUIRED",
    });

    return null;
  }

  return environmentId;
}

/**
 * Load a service inside the authenticated organization AND
 * selected environment.
 *
 * Returning 404 rather than 403 for cross-environment resources
 * prevents resource enumeration.
 */
async function loadService(
  req,
  res,
  serviceId
) {
  const environmentId =
    requireEnvironment(req, res);

  if (!environmentId) {
    return null;
  }

  let service;

  try {
    service =
      await Service.findOne({
        _id:
          serviceId,

        organizationId:
          req.auth.organizationId,

        environmentId,
      });
  } catch {
    res.status(400).json({
      error:
        "Invalid service ID",
      code:
        "INVALID_SERVICE_ID",
    });

    return null;
  }

  if (!service) {
    res.status(404).json({
      error:
        "Service not found",
      code:
        "SERVICE_NOT_FOUND",
    });

    return null;
  }

  return service;
}

/**
 * Load monitor inside the authenticated organization AND
 * selected environment.
 *
 * Never load by ID and authorize afterwards when the ownership
 * dimensions can be included directly in the database query.
 */
async function loadMonitor(
  req,
  res
) {
  const {
    monitorId,
  } = req.params;

  const environmentId =
    requireEnvironment(req, res);

  if (!environmentId) {
    return null;
  }

  let monitor;

  try {
    monitor =
      await Monitor.findOne({
        _id:
          monitorId,

        organizationId:
          req.auth.organizationId,

        environmentId,
      });
  } catch {
    res.status(400).json({
      error:
        "Invalid monitor ID",
      code:
        "INVALID_MONITOR_ID",
    });

    return null;
  }

  if (!monitor) {
    res.status(404).json({
      error:
        "Monitor not found",
      code:
        "MONITOR_NOT_FOUND",
    });

    return null;
  }

  return monitor;
}

/* -------------------------------------------------------------------------- */
/* Service-scoped router                                                      */
/* Mounted at /:serviceId/monitors                                            */
/* -------------------------------------------------------------------------- */

const serviceMonitorRouter =
  express.Router({
    mergeParams: true,
  });

/**
 * POST /:serviceId/monitors
 */
serviceMonitorRouter.post(
  "/",
  async (req, res) => {
    const {
      serviceId,
    } = req.params;

    const service =
      await loadService(
        req,
        res,
        serviceId
      );

    if (!service) {
      return;
    }

    const {
      error,
      value,
    } =
      monitorCreateSchema.validate(
        req.body
      );

    if (error) {
      return res
        .status(400)
        .json({
          error:
            error.details[0]
              .message,

          code:
            "VALIDATION_ERROR",
        });
    }

    value.requestHeaders =
      sanitizeHeaders(
        value.requestHeaders ??
          {}
      );

    const monitor =
      await Monitor.create({
        ...value,

        serviceId:
          service._id,

        organizationId:
          service.organizationId,

        environmentId:
          service.environmentId,

        tenantId:
          req.auth.tenantId,

        createdBy:
          req.auth.userId,

        nextCheckAt:
          new Date(),
      });

    await auditRecord(
      AUTH_EVENT_TYPES.MONITOR_CREATED,
      AUTH_EVENT_OUTCOMES.SUCCESS,
      {
        userId:
          req.auth.userId,

        organizationId:
          service.organizationId,

        tenantId:
          req.auth.tenantId,

        metadata: {
          monitorId:
            monitor._id,

          serviceId:
            service._id,

          environmentId:
            service.environmentId,

          name:
            value.name,
        },
      }
    ).catch(() => {});

    return res
      .status(201)
      .json({
        monitor:
          safeMonitor(monitor),
      });
  }
);

/**
 * GET /:serviceId/monitors
 */
serviceMonitorRouter.get(
  "/",
  async (req, res) => {
    const {
      serviceId,
    } = req.params;

    const service =
      await loadService(
        req,
        res,
        serviceId
      );

    if (!service) {
      return;
    }

    const monitors =
      await Monitor.find({
        organizationId:
          service.organizationId,

        environmentId:
          service.environmentId,

        serviceId:
          service._id,
      }).sort({
        createdAt: 1,
      });

    return res.json({
      monitors:
        monitors.map(
          safeMonitor
        ),
    });
  }
);

/* -------------------------------------------------------------------------- */
/* Top-level router                                                           */
/* Mounted at /api/v1/monitors                                                */
/* -------------------------------------------------------------------------- */

const topLevelRouter =
  express.Router();

/**
 * GET /
 *
 * List monitors only for selected environment.
 */
topLevelRouter.get(
  "/",
  async (req, res) => {
    const environmentId =
      requireEnvironment(
        req,
        res
      );

    if (!environmentId) {
      return;
    }

    const monitors =
      await Monitor.find({
        organizationId:
          req.auth.organizationId,

        environmentId,
      })
        .sort({
          createdAt: 1,
        })
        .limit(500);

    return res.json({
      monitors:
        monitors.map(
          safeMonitor
        ),
    });
  }
);

/**
 * GET /:monitorId
 */
topLevelRouter.get(
  "/:monitorId",
  async (req, res) => {
    const monitor =
      await loadMonitor(
        req,
        res
      );

    if (!monitor) {
      return;
    }

    return res.json({
      monitor:
        safeMonitor(monitor),
    });
  }
);

/**
 * PATCH /:monitorId
 */
topLevelRouter.patch(
  "/:monitorId",
  async (req, res) => {
    const monitor =
      await loadMonitor(
        req,
        res
      );

    if (!monitor) {
      return;
    }

    const {
      error,
      value,
    } =
      monitorUpdateSchema.validate(
        req.body
      );

    if (error) {
      return res
        .status(400)
        .json({
          error:
            error.details[0]
              .message,

          code:
            "VALIDATION_ERROR",
        });
    }

    if (
      value.requestHeaders !==
      undefined
    ) {
      value.requestHeaders =
        sanitizeHeaders(
          value.requestHeaders
        );
    }

    /**
     * organizationId/environmentId/serviceId cannot be changed
     * because Joi stripUnknown removes ownership fields.
     */
    Object.assign(
      monitor,
      value
    );

    await monitor.save();

    await auditRecord(
      AUTH_EVENT_TYPES.MONITOR_UPDATED,
      AUTH_EVENT_OUTCOMES.SUCCESS,
      {
        userId:
          req.auth.userId,

        organizationId:
          monitor.organizationId,

        tenantId:
          req.auth.tenantId,

        metadata: {
          monitorId:
            monitor._id,

          environmentId:
            monitor.environmentId,

          fields:
            Object.keys(value),
        },
      }
    ).catch(() => {});

    return res.json({
      monitor:
        safeMonitor(monitor),
    });
  }
);

/**
 * POST /:monitorId/pause
 */
topLevelRouter.post(
  "/:monitorId/pause",
  async (req, res) => {
    const monitor =
      await loadMonitor(
        req,
        res
      );

    if (!monitor) {
      return;
    }

    if (!monitor.enabled) {
      return res
        .status(400)
        .json({
          error:
            "Monitor is already paused",

          code:
            "MONITOR_ALREADY_PAUSED",
        });
    }

    monitor.enabled =
      false;

    await monitor.save();

    await auditRecord(
      AUTH_EVENT_TYPES.MONITOR_PAUSED,
      AUTH_EVENT_OUTCOMES.SUCCESS,
      {
        userId:
          req.auth.userId,

        organizationId:
          monitor.organizationId,

        tenantId:
          req.auth.tenantId,

        metadata: {
          monitorId:
            monitor._id,

          environmentId:
            monitor.environmentId,
        },
      }
    ).catch(() => {});

    return res.json({
      monitor:
        safeMonitor(monitor),
    });
  }
);

/**
 * POST /:monitorId/resume
 */
topLevelRouter.post(
  "/:monitorId/resume",
  async (req, res) => {
    const monitor =
      await loadMonitor(
        req,
        res
      );

    if (!monitor) {
      return;
    }

    if (monitor.enabled) {
      return res
        .status(400)
        .json({
          error:
            "Monitor is already active",

          code:
            "MONITOR_ALREADY_ACTIVE",
        });
    }

    monitor.enabled =
      true;

    monitor.nextCheckAt =
      new Date();

    await monitor.save();

    await auditRecord(
      AUTH_EVENT_TYPES.MONITOR_RESUMED,
      AUTH_EVENT_OUTCOMES.SUCCESS,
      {
        userId:
          req.auth.userId,

        organizationId:
          monitor.organizationId,

        tenantId:
          req.auth.tenantId,

        metadata: {
          monitorId:
            monitor._id,

          environmentId:
            monitor.environmentId,
        },
      }
    ).catch(() => {});

    return res.json({
      monitor:
        safeMonitor(monitor),
    });
  }
);

/**
 * POST /:monitorId/test
 *
 * Run immediate check without persistence.
 */
topLevelRouter.post(
  "/:monitorId/test",
  async (req, res) => {
    const monitor =
      await loadMonitor(
        req,
        res
      );

    if (!monitor) {
      return;
    }

    const result =
      await executeCheck(
        monitor
      );

    return res.json({
      result:
        safeCheck(result),
    });
  }
);

/**
 * GET /:monitorId/checks
 */
topLevelRouter.get(
  "/:monitorId/checks",
  async (req, res) => {
    const monitor =
      await loadMonitor(
        req,
        res
      );

    if (!monitor) {
      return;
    }

    const requestedLimit =
      parseInt(
        req.query.limit ??
          "50",
        10
      );

    const limit =
      Number.isFinite(
        requestedLimit
      )
        ? Math.min(
            Math.max(
              requestedLimit,
              1
            ),
            CHECKS_PAGE_LIMIT
          )
        : 50;

    const before =
      req.query.before
        ? new Date(
            req.query.before
          )
        : undefined;

    const query = {
      monitorId:
        monitor._id,
    };

    if (
      before &&
      !Number.isNaN(
        before.getTime()
      )
    ) {
      query.checkedAt = {
        $lt: before,
      };
    }

    const checks =
      await MonitorCheck.find(
        query
      )
        .sort({
          checkedAt: -1,
        })
        .limit(limit);

    return res.json({
      checks:
        checks.map(
          safeCheck
        ),

      count:
        checks.length,
    });
  }
);

/**
 * DELETE /:monitorId
 */
topLevelRouter.delete(
  "/:monitorId",
  async (req, res) => {
    const monitor =
      await loadMonitor(
        req,
        res
      );

    if (!monitor) {
      return;
    }

    /**
     * Monitor was already authorized against org + environment,
     * therefore these checks belong to an authorized monitor.
     */
    await MonitorCheck.deleteMany({
      monitorId:
        monitor._id,
    });

    await Monitor.deleteOne({
      _id:
        monitor._id,

      organizationId:
        monitor.organizationId,

      environmentId:
        monitor.environmentId,
    });

    await auditRecord(
      AUTH_EVENT_TYPES.MONITOR_DELETED,
      AUTH_EVENT_OUTCOMES.SUCCESS,
      {
        userId:
          req.auth.userId,

        organizationId:
          monitor.organizationId,

        tenantId:
          req.auth.tenantId,

        metadata: {
          monitorId:
            monitor._id,

          environmentId:
            monitor.environmentId,

          name:
            monitor.name,
        },
      }
    ).catch(() => {});

    return res
      .status(204)
      .end();
  }
);

module.exports = {
  topLevelRouter,
  serviceMonitorRouter,
};