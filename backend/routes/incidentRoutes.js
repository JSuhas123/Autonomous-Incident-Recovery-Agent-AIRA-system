"use strict";

const express = require("express");
const Joi = require("joi");
const mongoose = require("mongoose");

const {
  Incident,
  INCIDENT_STATUSES,
  INCIDENT_SEVERITIES,
} = require("../models/Incident");

const incidentService =
  require("../services/incidents/incidentService");

const {
  getIncidentPlaybookService,
} = require(
  "../services/incidents/incidentPlaybookService"
);

const {
  record: auditRecord,
} = require(
  "../services/identity/identityAuditService"
);

const {
  AUTH_EVENT_TYPES,
  AUTH_EVENT_OUTCOMES,
} = require("../constants/authEvents");

const router = express.Router();

const PAGE_LIMIT = 100;

/* -------------------------------------------------------------------------- */
/* Serialization                                                              */
/* -------------------------------------------------------------------------- */

function safeIncident(doc) {
  return {
    id:
      doc._id?.toString?.() ??
      doc._id,

    organizationId:
      doc.organizationId
        ?.toString?.() ??
      doc.organizationId,

    environmentId:
      doc.environmentId
        ?.toString?.() ??
      null,

    tenantId:
      doc.tenantId,

    serviceId:
      doc.serviceId
        ?.toString?.() ??
      doc.serviceId,

    monitorId:
      doc.monitorId
        ?.toString?.() ??
      null,

    source:
      doc.source,

    sourceEventId:
      doc.sourceEventId,

    fingerprint:
      doc.fingerprint,

    title:
      doc.title,

    description:
      doc.description,

    severity:
      doc.severity,

    status:
      doc.status,

    impact:
      doc.impact,

    startedAt:
      doc.startedAt,

    detectedAt:
      doc.detectedAt,

    acknowledgedAt:
      doc.acknowledgedAt,

    resolvedAt:
      doc.resolvedAt,

    lastObservedAt:
      doc.lastObservedAt,

    occurrenceCount:
      doc.occurrenceCount,

    evidence:
      doc.evidence ?? [],

    assignedTo:
      doc.assignedTo
        ?.toString?.() ??
      null,

    resolution:
      doc.resolution,

    tags:
      doc.tags ?? [],

    createdAt:
      doc.createdAt,

    updatedAt:
      doc.updatedAt,
  };
}

/* -------------------------------------------------------------------------- */
/* Environment helpers                                                        */
/* -------------------------------------------------------------------------- */

function getEnvironmentId(req) {
  return (
    req.context?.environmentId ||
    req.auth?.environmentId ||
    null
  );
}

function requireEnvironment(
  req,
  res
) {
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
 * Load incident using the complete ownership boundary.
 *
 * We query directly by:
 *
 * incidentId
 * + organizationId
 * + environmentId
 *
 * so an incident from another environment is indistinguishable
 * from a nonexistent incident.
 */
async function loadIncident(
  req,
  res
) {
  const {
    incidentId,
  } = req.params;

  const environmentId =
    requireEnvironment(
      req,
      res
    );

  if (!environmentId) {
    return null;
  }

  if (
    !mongoose.Types.ObjectId.isValid(
      incidentId
    )
  ) {
    res.status(404).json({
      error:
        "Incident not found",

      code:
        "INCIDENT_NOT_FOUND",
    });

    return null;
  }

  const incident =
    await Incident.findOne({
      _id:
        incidentId,

      organizationId:
        req.auth.organizationId,

      environmentId,
    });

  if (!incident) {
    res.status(404).json({
      error:
        "Incident not found",

      code:
        "INCIDENT_NOT_FOUND",
    });

    return null;
  }

  return incident;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

const acknowledgeSchema =
  Joi.object({
    note:
      Joi.string()
        .max(512)
        .allow("")
        .optional(),
  });

const resolveSchema =
  Joi.object({
    resolution:
      Joi.string()
        .max(2048)
        .allow("")
        .optional(),
  });

const reopenSchema =
  Joi.object({
    reason:
      Joi.string()
        .max(512)
        .allow("")
        .optional(),
  });

const assignSchema =
  Joi.object({
    assigneeId:
      Joi.string()
        .allow(null)
        .optional(),

    note:
      Joi.string()
        .max(512)
        .allow("")
        .optional(),
  });

/* -------------------------------------------------------------------------- */
/* GET /                                                                      */
/* -------------------------------------------------------------------------- */

router.get(
  "/",
  async (
    req,
    res,
    next
  ) => {
    try {
      const environmentId =
        requireEnvironment(
          req,
          res
        );

      if (!environmentId) {
        return;
      }

      const q =
        req.query;

      const filter = {
        organizationId:
          req.auth.organizationId,

        environmentId,
      };

      if (
        q.status &&
        INCIDENT_STATUSES.includes(
          q.status
        )
      ) {
        filter.status =
          q.status;
      }

      if (
        q.severity &&
        INCIDENT_SEVERITIES.includes(
          q.severity
        )
      ) {
        filter.severity =
          q.severity;
      }

      if (
        q.serviceId &&
        mongoose.Types.ObjectId.isValid(
          q.serviceId
        )
      ) {
        filter.serviceId =
          q.serviceId;
      }

      if (
        q.monitorId &&
        mongoose.Types.ObjectId.isValid(
          q.monitorId
        )
      ) {
        filter.monitorId =
          q.monitorId;
      }

      if (
        q.from ||
        q.to
      ) {
        filter.detectedAt =
          {};

        if (q.from) {
          const from =
            new Date(
              q.from
            );

          if (
            Number.isNaN(
              from.getTime()
            )
          ) {
            return res
              .status(400)
              .json({
                error:
                  "Invalid from date",

                code:
                  "INVALID_DATE",
              });
          }

          filter.detectedAt.$gte =
            from;
        }

        if (q.to) {
          const to =
            new Date(
              q.to
            );

          if (
            Number.isNaN(
              to.getTime()
            )
          ) {
            return res
              .status(400)
              .json({
                error:
                  "Invalid to date",

                code:
                  "INVALID_DATE",
              });
          }

          filter.detectedAt.$lte =
            to;
        }
      }

      const parsedLimit =
        parseInt(
          q.limit ?? "50",
          10
        );

      const limit =
        Number.isFinite(
          parsedLimit
        )
          ? Math.min(
              Math.max(
                parsedLimit,
                1
              ),
              PAGE_LIMIT
            )
          : 50;

      if (q.before) {
        const before =
          new Date(
            q.before
          );

        if (
          Number.isNaN(
            before.getTime()
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                "Invalid before date",

              code:
                "INVALID_DATE",
            });
        }

        filter.createdAt = {
          $lt:
            before,
        };
      }

      const incidents =
        await Incident.find(
          filter
        )
          .sort({
            createdAt:
              -1,
          })
          .limit(limit)
          .lean();

      return res.json({
        incidents:
          incidents.map(
            safeIncident
          ),

        count:
          incidents.length,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/* -------------------------------------------------------------------------- */
/* GET /:incidentId                                                           */
/* -------------------------------------------------------------------------- */

router.get(
  "/:incidentId",
  async (
    req,
    res,
    next
  ) => {
    try {
      const incident =
        await loadIncident(
          req,
          res
        );

      if (!incident) {
        return;
      }

      return res.json({
        incident:
          safeIncident(
            incident
          ),
      });
    } catch (error) {
      return next(error);
    }
  }
);

/* -------------------------------------------------------------------------- */
/* POST /:incidentId/acknowledge                                               */
/* -------------------------------------------------------------------------- */

router.post(
  "/:incidentId/acknowledge",
  async (
    req,
    res,
    next
  ) => {
    try {
      const incident =
        await loadIncident(
          req,
          res
        );

      if (!incident) {
        return;
      }

      const {
        error,
        value,
      } =
        acknowledgeSchema.validate(
          req.body || {}
        );

      if (error) {
        return res
          .status(422)
          .json({
            error:
              error.details[0]
                .message,

            code:
              "VALIDATION_ERROR",
          });
      }

      const updated =
        await incidentService
          .acknowledge(
            incident._id,
            {
              organizationId:
                req.auth.organizationId,

              environmentId:
                incident.environmentId,

              userId:
                req.auth.userId,

              note:
                value.note,
            }
          );

      if (!updated) {
        return res
          .status(404)
          .json({
            error:
              "Incident not found",

            code:
              "INCIDENT_NOT_FOUND",
          });
      }

      await auditRecord(
        AUTH_EVENT_TYPES
          .INCIDENT_ACKNOWLEDGED,

        AUTH_EVENT_OUTCOMES
          .SUCCESS,

        {
          userId:
            req.auth.userId,

          organizationId:
            req.auth.organizationId,

          tenantId:
            req.auth.tenantId,

          metadata: {
            incidentId:
              incident._id,

            environmentId:
              incident.environmentId,
          },
        }
      ).catch(() => {});

      return res.json({
        incident:
          safeIncident(
            updated
          ),
      });
    } catch (error) {
      return next(error);
    }
  }
);

/* -------------------------------------------------------------------------- */
/* POST /:incidentId/resolve                                                   */
/* -------------------------------------------------------------------------- */

router.post(
  "/:incidentId/resolve",
  async (
    req,
    res,
    next
  ) => {
    try {
      const incident =
        await loadIncident(
          req,
          res
        );

      if (!incident) {
        return;
      }

      const {
        error,
        value,
      } =
        resolveSchema.validate(
          req.body || {}
        );

      if (error) {
        return res
          .status(422)
          .json({
            error:
              error.details[0]
                .message,

            code:
              "VALIDATION_ERROR",
          });
      }

      const updated =
        await incidentService
          .resolveManually(
            incident._id,
            {
              organizationId:
                req.auth.organizationId,

              environmentId:
                incident.environmentId,

              userId:
                req.auth.userId,

              resolution:
                value.resolution,
            }
          );

      if (!updated) {
        return res
          .status(404)
          .json({
            error:
              "Incident not found",

            code:
              "INCIDENT_NOT_FOUND",
          });
      }

      await auditRecord(
        AUTH_EVENT_TYPES
          .INCIDENT_RESOLVED,

        AUTH_EVENT_OUTCOMES
          .SUCCESS,

        {
          userId:
            req.auth.userId,

          organizationId:
            req.auth.organizationId,

          tenantId:
            req.auth.tenantId,

          metadata: {
            incidentId:
              incident._id,

            environmentId:
              incident.environmentId,
          },
        }
      ).catch(() => {});

      return res.json({
        incident:
          safeIncident(
            updated
          ),
      });
    } catch (error) {
      return next(error);
    }
  }
);

/* -------------------------------------------------------------------------- */
/* POST /:incidentId/reopen                                                    */
/* -------------------------------------------------------------------------- */

router.post(
  "/:incidentId/reopen",
  async (
    req,
    res,
    next
  ) => {
    try {
      const incident =
        await loadIncident(
          req,
          res
        );

      if (!incident) {
        return;
      }

      const {
        error,
        value,
      } =
        reopenSchema.validate(
          req.body || {}
        );

      if (error) {
        return res
          .status(422)
          .json({
            error:
              error.details[0]
                .message,

            code:
              "VALIDATION_ERROR",
          });
      }

      const updated =
        await incidentService
          .reopen(
            incident._id,
            {
              organizationId:
                req.auth.organizationId,

              environmentId:
                incident.environmentId,

              userId:
                req.auth.userId,

              reason:
                value.reason,
            }
          );

      if (!updated) {
        return res
          .status(404)
          .json({
            error:
              "Incident not found",

            code:
              "INCIDENT_NOT_FOUND",
          });
      }

      await auditRecord(
        AUTH_EVENT_TYPES
          .INCIDENT_REOPENED,

        AUTH_EVENT_OUTCOMES
          .SUCCESS,

        {
          userId:
            req.auth.userId,

          organizationId:
            req.auth.organizationId,

          tenantId:
            req.auth.tenantId,

          metadata: {
            incidentId:
              incident._id,

            environmentId:
              incident.environmentId,
          },
        }
      ).catch(() => {});

      return res.json({
        incident:
          safeIncident(
            updated
          ),
      });
    } catch (error) {
      return next(error);
    }
  }
);

/* -------------------------------------------------------------------------- */
/* PATCH /:incidentId/assignment                                               */
/* -------------------------------------------------------------------------- */

router.patch(
  "/:incidentId/assignment",
  async (
    req,
    res,
    next
  ) => {
    try {
      const incident =
        await loadIncident(
          req,
          res
        );

      if (!incident) {
        return;
      }

      const {
        error,
        value,
      } =
        assignSchema.validate(
          req.body || {}
        );

      if (error) {
        return res
          .status(422)
          .json({
            error:
              error.details[0]
                .message,

            code:
              "VALIDATION_ERROR",
          });
      }

      const updated =
        await incidentService
          .assign(
            incident._id,
            {
              organizationId:
                req.auth.organizationId,

              environmentId:
                incident.environmentId,

              userId:
                req.auth.userId,

              assigneeId:
                value.assigneeId,

              note:
                value.note,
            }
          );

      if (!updated) {
        return res
          .status(404)
          .json({
            error:
              "Incident not found",

            code:
              "INCIDENT_NOT_FOUND",
          });
      }

      await auditRecord(
        AUTH_EVENT_TYPES
          .INCIDENT_ASSIGNED,

        AUTH_EVENT_OUTCOMES
          .SUCCESS,

        {
          userId:
            req.auth.userId,

          organizationId:
            req.auth.organizationId,

          tenantId:
            req.auth.tenantId,

          metadata: {
            incidentId:
              incident._id,

            environmentId:
              incident.environmentId,

            assigneeId:
              value.assigneeId,
          },
        }
      ).catch(() => {});

      return res.json({
        incident:
          safeIncident(
            updated
          ),
      });
    } catch (error) {
      return next(error);
    }
  }
);

/* -------------------------------------------------------------------------- */
/* GET /:incidentId/timeline                                                   */
/* -------------------------------------------------------------------------- */

router.get(
  "/:incidentId/timeline",
  async (
    req,
    res,
    next
  ) => {
    try {
      const incident =
        await loadIncident(
          req,
          res
        );

      if (!incident) {
        return;
      }

      const timeline = [
        ...(incident.timeline ??
          []),
      ]
        .sort(
          (a, b) =>
            new Date(
              a.occurredAt
            ) -
            new Date(
              b.occurredAt
            )
        )
        .map(
          (event) => ({
            id:
              event._id,

            occurredAt:
              event.occurredAt,

            eventType:
              event.eventType,

            actor:
              event.actor,

            actorId:
              event.actorId,

            description:
              event.description,

            metadata:
              event.metadata,
          })
        );

      return res.json({
        timeline,

        count:
          timeline.length,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/* -------------------------------------------------------------------------- */
/* GET /:incidentId/playbooks                                                  */
/* -------------------------------------------------------------------------- */

router.get(
  "/:incidentId/playbooks",
  async (
    req,
    res,
    next
  ) => {
    try {
      const incident =
        await loadIncident(
          req,
          res
        );

      if (!incident) {
        return;
      }

      const tenantId =
        req.auth?.tenantId ||
        incident.tenantId;

      const analysis =
        await getIncidentPlaybookService()
          .analyseIncident(
            incident,
            {
              tenantId,

              organizationId:
                incident.organizationId,

              environmentId:
                incident.environmentId,
            }
          );

      return res.json(
        analysis
      );
    } catch (error) {
      return next(error);
    }
  }
);

/* -------------------------------------------------------------------------- */
/* POST /:incidentId/playbooks/execute                                         */
/* -------------------------------------------------------------------------- */

router.post(
  "/:incidentId/playbooks/execute",
  async (
    req,
    res,
    next
  ) => {
    try {
      const incident =
        await loadIncident(
          req,
          res
        );

      if (!incident) {
        return;
      }

      const tenantId =
        req.auth?.tenantId ||
        incident.tenantId;

      const {
        dryRun,
        correlationId,
      } =
        req.body || {};

      const result =
        await getIncidentPlaybookService()
          .executeForIncident(
            incident,
            {
              tenantId,

              organizationId:
                incident.organizationId,

              environmentId:
                incident.environmentId,

              correlationId,

              initiatedBy:
                req.auth?.userId,

              dryRun:
                Boolean(
                  dryRun
                ),
            }
          );

      const status =
        result.executed
          ? 200
          : 202;

      return res
        .status(status)
        .json(result);
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;