"use strict";

const {
  isDatabaseIdentifier,
} =
  require(
    "../utils/identifier"
  );

const express =
  require("express");

const Joi =
  require("joi");

const {
  Incident,
  INCIDENT_STATUSES,
  INCIDENT_SEVERITIES,
} =
  require(
    "../persistence/operational/canonicalModels"
  );

const incidentService =
  require(
    "../services/incidents/incidentService"
  );

const incidentDetailService =
  require(
    "../services/incidents/incidentDetailService"
  );

const incidentEventService =
  require(
    "../services/incidents/incidentEventService"
  );

const {
  getIncidentPlaybookService,
} =
  require(
    "../services/incidents/incidentPlaybookService"
  );

const {
  record:
    auditRecord,
} =
  require(
    "../services/identity/identityAuditService"
  );

const {
  AUTH_EVENT_TYPES,
  AUTH_EVENT_OUTCOMES,
} =
  require(
    "../constants/authEvents"
  );

const router =
  express.Router();

const PAGE_LIMIT =
  100;

// ============================================================================
// SERIALIZATION
// ============================================================================

function safeIncident(
  doc
) {
  if (!doc) {
    return null;
  }

  return {
    id:
      doc._id
        ?.toString?.() ??
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

    // ------------------------------------------------------------------------
    // SOURCE / DETECTION
    // ------------------------------------------------------------------------

    source:
      doc.source,

    sourceEventId:
      doc.sourceEventId,

    detectionMethod:
      doc.detectionMethod,

    fingerprint:
      doc.fingerprint,

    // ------------------------------------------------------------------------
    // SIGNAL PROVENANCE
    // ------------------------------------------------------------------------

    correlationGroupId:
      doc
        .correlationGroupId ??
      null,

    primarySignalId:
      doc
        .primarySignalId ??
      null,

    signalIds:
      doc.signalIds ??
      [],

    signalFingerprint:
      doc
        .signalFingerprint ??
      null,

    providers:
      doc.providers ??
      [],

    providerCount:
      doc.providerCount ??
      0,

    evidenceCount:
      doc.evidenceCount ??
      0,

    correlationConfidence:
      doc
        .correlationConfidence ??
      null,

    lastSignalAt:
      doc.lastSignalAt ??
      null,

    // ------------------------------------------------------------------------
    // DESCRIPTION
    // ------------------------------------------------------------------------

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

    // ------------------------------------------------------------------------
    // TIMING
    // ------------------------------------------------------------------------

    startedAt:
      doc.startedAt,

    detectedAt:
      doc.detectedAt,

    acknowledgedAt:
      doc.acknowledgedAt,

    resolvedAt:
      doc.resolvedAt,

    closedAt:
      doc.closedAt,

    lastObservedAt:
      doc.lastObservedAt,

    // ------------------------------------------------------------------------
    // RECURRENCE
    // ------------------------------------------------------------------------

    occurrenceCount:
      doc.occurrenceCount,

    reopenCount:
      doc.reopenCount ??
      0,

    lastReopenedAt:
      doc
        .lastReopenedAt ??
      null,

    // ------------------------------------------------------------------------
    // EVIDENCE
    // ------------------------------------------------------------------------

    evidence:
      doc.evidence ??
      [],

    // ------------------------------------------------------------------------
    // ASSIGNMENT
    // ------------------------------------------------------------------------

    assignedTo:
      doc.assignedTo
        ?.toString?.() ??
      null,

    assignedAt:
      doc.assignedAt ??
      null,

    // ------------------------------------------------------------------------
    // RESOLUTION
    // ------------------------------------------------------------------------

    resolution:
      doc.resolution,

    resolutionType:
      doc.resolutionType ??
      null,

    // ------------------------------------------------------------------------
    // IMPACT ANALYSIS
    // ------------------------------------------------------------------------

    impactAnalysis:
      doc.impactAnalysis ??
      null,

    // ------------------------------------------------------------------------
    // AGENT INTELLIGENCE HANDOFF
    // ------------------------------------------------------------------------

    analysisStatus:
      doc.analysisStatus ??
      "not_started",

    analysisStartedAt:
      doc
        .analysisStartedAt ??
      null,

    analysisCompletedAt:
      doc
        .analysisCompletedAt ??
      null,

    // ------------------------------------------------------------------------
    // OTHER
    // ------------------------------------------------------------------------

    tags:
      doc.tags ??
      [],

    createdAt:
      doc.createdAt,

    updatedAt:
      doc.updatedAt,
  };
}

// ============================================================================
// ENVIRONMENT HELPERS
// ============================================================================

function getEnvironmentId(
  req
) {
  return (
    req.context
      ?.environmentId ||
    req.auth
      ?.environmentId ||
    null
  );
}

function requireEnvironment(
  req,
  res
) {
  const environmentId =
    getEnvironmentId(
      req
    );

  if (
    !environmentId
  ) {
    res
      .status(
        400
      )
      .json({
        error:
          "No active environment selected",

        code:
          "ENVIRONMENT_REQUIRED",
      });

    return null;
  }

  return environmentId;
}

// ============================================================================
// REQUEST CONTEXT
// ============================================================================

function incidentContext(
  req,
  environmentId = null
) {
  return {
    organizationId:
      req.auth
        ?.organizationId ||
      req.context
        ?.organizationId,

    environmentId:
      environmentId ||
      getEnvironmentId(
        req
      ),

    userId:
      req.auth
        ?.userId ||
      req.context
        ?.userId ||
      null,

    tenantId:
      req.auth
        ?.tenantId ||
      req.context
        ?.tenantId ||
      null,
  };
}

// ============================================================================
// INCIDENT LOADER
// ============================================================================

async function loadIncident(
  req,
  res
) {
  const {
    incidentId,
  } =
    req.params;

  const environmentId =
    requireEnvironment(
      req,
      res
    );

  if (
    !environmentId
  ) {
    return null;
  }

  if (
    !isDatabaseIdentifier(
        incidentId
      )
  ) {
    res
      .status(
        404
      )
      .json({
        error:
          "Incident not found",

        code:
          "INCIDENT_NOT_FOUND",
      });

    return null;
  }

  const organizationId =
    req.auth
      ?.organizationId ||
    req.context
      ?.organizationId;

  const incident =
    await Incident
      .findOne({
        _id:
          incidentId,

        organizationId,

        environmentId,
      });

  if (
    !incident
  ) {
    res
      .status(
        404
      )
      .json({
        error:
          "Incident not found",

        code:
          "INCIDENT_NOT_FOUND",
      });

    return null;
  }

  return incident;
}

// ============================================================================
// VALIDATION
// ============================================================================

const acknowledgeSchema =
  Joi.object({
    note:
      Joi.string()
        .max(
          512
        )
        .allow(
          ""
        )
        .optional(),
  });

const resolveSchema =
  Joi.object({
    resolution:
      Joi.string()
        .max(
          2048
        )
        .allow(
          ""
        )
        .optional(),
  });

const reasonSchema =
  Joi.object({
    reason:
      Joi.string()
        .max(
          1024
        )
        .allow(
          ""
        )
        .optional(),
  });

const reopenSchema =
  Joi.object({
    reason:
      Joi.string()
        .max(
          512
        )
        .allow(
          ""
        )
        .optional(),
  });

const assignSchema =
  Joi.object({
    assigneeId:
      Joi.string()
        .allow(
          null
        )
        .optional(),

    note:
      Joi.string()
        .max(
          512
        )
        .allow(
          ""
        )
        .optional(),
  });

// ============================================================================
// VALIDATION HELPER
// ============================================================================

function validateBody(
  schema,
  req,
  res
) {
  const {
    error,
    value,
  } =
    schema.validate(
      req.body ||
      {}
    );

  if (
    error
  ) {
    res
      .status(
        422
      )
      .json({
        error:
          error
            .details[0]
            .message,

        code:
          "VALIDATION_ERROR",
      });

    return {
      valid:
        false,

      value:
        null,
    };
  }

  return {
    valid:
      true,

    value,
  };
}

// ============================================================================
// GET /
// ============================================================================

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

      if (
        !environmentId
      ) {
        return;
      }

      const q =
        req.query;

      const organizationId =
        req.auth
          ?.organizationId ||
        req.context
          ?.organizationId;

      const filter = {
        organizationId,

        environmentId,
      };

      if (
        q.status &&
        INCIDENT_STATUSES
          .includes(
            q.status
          )
      ) {
        filter.status =
          q.status;
      }

      if (
        q.severity &&
        INCIDENT_SEVERITIES
          .includes(
            q.severity
          )
      ) {
        filter.severity =
          q.severity;
      }

      if (
        q.serviceId &&
        isDatabaseIdentifier(
            q.serviceId
          )
      ) {
        filter.serviceId =
          q.serviceId;
      }

      if (
        q.monitorId &&
        isDatabaseIdentifier(
            q.monitorId
          )
      ) {
        filter.monitorId =
          q.monitorId;
      }

      if (
        q.correlationGroupId
      ) {
        filter
          .correlationGroupId =
          q
            .correlationGroupId;
      }

      if (
        q.provider
      ) {
        filter.providers =
          q.provider;
      }

      if (
        q.analysisStatus
      ) {
        filter.analysisStatus =
          q.analysisStatus;
      }

      if (
        q.userFacing ===
        "true"
      ) {
        filter[
          "impactAnalysis.summary.userFacingImpact"
        ] =
          true;
      }

      if (
        q.from ||
        q.to
      ) {
        filter.detectedAt =
          {};

        if (
          q.from
        ) {
          const from =
            new Date(
              q.from
            );

          if (
            Number.isNaN(
              from
                .getTime()
            )
          ) {
            return res
              .status(
                400
              )
              .json({
                error:
                  "Invalid from date",

                code:
                  "INVALID_DATE",
              });
          }

          filter
            .detectedAt
            .$gte =
            from;
        }

        if (
          q.to
        ) {
          const to =
            new Date(
              q.to
            );

          if (
            Number.isNaN(
              to
                .getTime()
            )
          ) {
            return res
              .status(
                400
              )
              .json({
                error:
                  "Invalid to date",

                code:
                  "INVALID_DATE",
              });
          }

          filter
            .detectedAt
            .$lte =
            to;
        }
      }

      const parsedLimit =
        Number.parseInt(
          q.limit ??
          "50",
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

      if (
        q.before
      ) {
        const before =
          new Date(
            q.before
          );

        if (
          Number.isNaN(
            before
              .getTime()
          )
        ) {
          return res
            .status(
              400
            )
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
        await Incident
          .find(
            filter
          )
          .sort({
            createdAt:
              -1,
          })
          .limit(
            limit
          )
          .lean();

      return res.json({
        incidents:
          incidents
            .map(
              safeIncident
            ),

        count:
          incidents
            .length,
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// GET /:incidentId/detail
// ============================================================================

router.get(
  "/:incidentId/detail",
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

      if (
        !environmentId
      ) {
        return;
      }

      if (
        !isDatabaseIdentifier(
            req.params
              .incidentId
          )
      ) {
        return res
          .status(
            404
          )
          .json({
            error:
              "Incident not found",

            code:
              "INCIDENT_NOT_FOUND",
          });
      }

      const context =
        incidentContext(
          req,
          environmentId
        );

      const detail =
        await incidentDetailService
          .getDetail(
            context,
            req.params
              .incidentId
          );

      if (
        !detail
      ) {
        return res
          .status(
            404
          )
          .json({
            error:
              "Incident not found",

            code:
              "INCIDENT_NOT_FOUND",
          });
      }

      return res.json(
        detail
      );
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// GET /:incidentId/events
// ============================================================================

router.get(
  "/:incidentId/events",
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

      if (
        !incident
      ) {
        return;
      }

      const parsedLimit =
        Number.parseInt(
          req.query
            .limit ??
          "200",
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
              1000
            )
          : 200;

      const events =
        await incidentEventService
          .listForIncident(
            {
              organizationId:
                incident
                  .organizationId,

              environmentId:
                incident
                  .environmentId,
            },

            incident._id,

            limit
          );

      return res.json({
        events,

        count:
          events.length,
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// GET /:incidentId/timeline
// ============================================================================

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

      if (
        !incident
      ) {
        return;
      }

      const timeline =
        [
          ...(
            incident.timeline ||
            []
          ),
        ]
          .sort(
            (
              first,
              second
            ) =>
              new Date(
                first
                  .occurredAt
              ) -
              new Date(
                second
                  .occurredAt
              )
          )
          .map(
            (
              event
            ) => ({
              id:
                event._id,

              occurredAt:
                event
                  .occurredAt,

              eventType:
                event
                  .eventType,

              actor:
                event.actor,

              actorId:
                event
                  .actorId,

              description:
                event
                  .description,

              metadata:
                event
                  .metadata,
            })
          );

      return res.json({
        timeline,

        count:
          timeline.length,
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// GET /:incidentId/playbooks
// ============================================================================

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

      if (
        !incident
      ) {
        return;
      }

      const tenantId =
        req.auth
          ?.tenantId ||
        incident
          .tenantId;

      const analysis =
        await getIncidentPlaybookService()
          .analyseIncident(
            incident,
            {
              tenantId,

              organizationId:
                incident
                  .organizationId,

              environmentId:
                incident
                  .environmentId,
            }
          );

      return res.json(
        analysis
      );
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// GET /:incidentId
// ============================================================================

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

      if (
        !incident
      ) {
        return;
      }

      return res.json({
        incident:
          safeIncident(
            incident
          ),
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// POST /:incidentId/acknowledge
// ============================================================================

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

      if (
        !incident
      ) {
        return;
      }

      const validation =
        validateBody(
          acknowledgeSchema,
          req,
          res
        );

      if (
        !validation.valid
      ) {
        return;
      }

      const updated =
        await incidentService
          .acknowledge(
            incident._id,
            {
              organizationId:
                incident
                  .organizationId,

              environmentId:
                incident
                  .environmentId,

              userId:
                req.auth
                  ?.userId ||
                req.context
                  ?.userId,

              note:
                validation
                  .value
                  .note,
            }
          );

      if (
        !updated
      ) {
        return res
          .status(
            404
          )
          .json({
            error:
              "Incident not found",

            code:
              "INCIDENT_NOT_FOUND",
          });
      }

      if (
        AUTH_EVENT_TYPES
          ?.INCIDENT_ACKNOWLEDGED
      ) {
        await auditRecord(
          AUTH_EVENT_TYPES
            .INCIDENT_ACKNOWLEDGED,

          AUTH_EVENT_OUTCOMES
            .SUCCESS,

          {
            userId:
              req.auth
                ?.userId,

            organizationId:
              incident
                .organizationId,

            tenantId:
              incident
                .tenantId,

            metadata: {
              incidentId:
                incident._id,

              environmentId:
                incident
                  .environmentId,
            },
          }
        )
          .catch(
            () => {}
          );
      }

      return res.json({
        incident:
          safeIncident(
            updated
          ),
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// POST /:incidentId/investigate
// ============================================================================

router.post(
  "/:incidentId/investigate",
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

      if (
        !incident
      ) {
        return;
      }

      const validation =
        validateBody(
          reasonSchema,
          req,
          res
        );

      if (
        !validation.valid
      ) {
        return;
      }

      const updated =
        await incidentService
          .startInvestigation(
            incident._id,
            {
              organizationId:
                incident
                  .organizationId,

              environmentId:
                incident
                  .environmentId,

              userId:
                req.auth
                  ?.userId ||
                req.context
                  ?.userId,

              reason:
                validation
                  .value
                  .reason ||
                null,
            }
          );

      if (
        !updated
      ) {
        return res
          .status(
            404
          )
          .json({
            error:
              "Incident not found",

            code:
              "INCIDENT_NOT_FOUND",
          });
      }

      return res.json({
        incident:
          safeIncident(
            updated
          ),
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// POST /:incidentId/recover
// ============================================================================

router.post(
  "/:incidentId/recover",
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

      if (
        !incident
      ) {
        return;
      }

      const validation =
        validateBody(
          reasonSchema,
          req,
          res
        );

      if (
        !validation.valid
      ) {
        return;
      }

      const updated =
        await incidentService
          .startRecovery(
            incident._id,
            {
              organizationId:
                incident
                  .organizationId,

              environmentId:
                incident
                  .environmentId,

              userId:
                req.auth
                  ?.userId ||
                req.context
                  ?.userId,

              reason:
                validation
                  .value
                  .reason ||
                null,
            }
          );

      if (
        !updated
      ) {
        return res
          .status(
            404
          )
          .json({
            error:
              "Incident not found",

            code:
              "INCIDENT_NOT_FOUND",
          });
      }

      return res.json({
        incident:
          safeIncident(
            updated
          ),
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// POST /:incidentId/resolve
// ============================================================================

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

      if (
        !incident
      ) {
        return;
      }

      const validation =
        validateBody(
          resolveSchema,
          req,
          res
        );

      if (
        !validation.valid
      ) {
        return;
      }

      const updated =
        await incidentService
          .resolveManually(
            incident._id,
            {
              organizationId:
                incident
                  .organizationId,

              environmentId:
                incident
                  .environmentId,

              userId:
                req.auth
                  ?.userId ||
                req.context
                  ?.userId,

              resolution:
                validation
                  .value
                  .resolution,
            }
          );

      if (
        !updated
      ) {
        return res
          .status(
            404
          )
          .json({
            error:
              "Incident not found",

            code:
              "INCIDENT_NOT_FOUND",
          });
      }

      if (
        AUTH_EVENT_TYPES
          ?.INCIDENT_RESOLVED
      ) {
        await auditRecord(
          AUTH_EVENT_TYPES
            .INCIDENT_RESOLVED,

          AUTH_EVENT_OUTCOMES
            .SUCCESS,

          {
            userId:
              req.auth
                ?.userId,

            organizationId:
              incident
                .organizationId,

            tenantId:
              incident
                .tenantId,

            metadata: {
              incidentId:
                incident._id,

              environmentId:
                incident
                  .environmentId,
            },
          }
        )
          .catch(
            () => {}
          );
      }

      return res.json({
        incident:
          safeIncident(
            updated
          ),
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// POST /:incidentId/reopen
// ============================================================================

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

      if (
        !incident
      ) {
        return;
      }

      const validation =
        validateBody(
          reopenSchema,
          req,
          res
        );

      if (
        !validation.valid
      ) {
        return;
      }

      const updated =
        await incidentService
          .reopen(
            incident._id,
            {
              organizationId:
                incident
                  .organizationId,

              environmentId:
                incident
                  .environmentId,

              userId:
                req.auth
                  ?.userId ||
                req.context
                  ?.userId,

              reason:
                validation
                  .value
                  .reason,
            }
          );

      if (
        !updated
      ) {
        return res
          .status(
            404
          )
          .json({
            error:
              "Incident not found",

            code:
              "INCIDENT_NOT_FOUND",
          });
      }

      if (
        AUTH_EVENT_TYPES
          ?.INCIDENT_REOPENED
      ) {
        await auditRecord(
          AUTH_EVENT_TYPES
            .INCIDENT_REOPENED,

          AUTH_EVENT_OUTCOMES
            .SUCCESS,

          {
            userId:
              req.auth
                ?.userId,

            organizationId:
              incident
                .organizationId,

            tenantId:
              incident
                .tenantId,

            metadata: {
              incidentId:
                incident._id,

              environmentId:
                incident
                  .environmentId,
            },
          }
        )
          .catch(
            () => {}
          );
      }

      return res.json({
        incident:
          safeIncident(
            updated
          ),
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// POST /:incidentId/close
// ============================================================================

router.post(
  "/:incidentId/close",
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

      if (
        !incident
      ) {
        return;
      }

      const validation =
        validateBody(
          reasonSchema,
          req,
          res
        );

      if (
        !validation.valid
      ) {
        return;
      }

      const updated =
        await incidentService
          .close(
            incident._id,
            {
              organizationId:
                incident
                  .organizationId,

              environmentId:
                incident
                  .environmentId,

              userId:
                req.auth
                  ?.userId ||
                req.context
                  ?.userId,

              reason:
                validation
                  .value
                  .reason ||
                null,
            }
          );

      if (
        !updated
      ) {
        return res
          .status(
            404
          )
          .json({
            error:
              "Incident not found",

            code:
              "INCIDENT_NOT_FOUND",
          });
      }

      return res.json({
        incident:
          safeIncident(
            updated
          ),
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// PATCH /:incidentId/assignment
// ============================================================================

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

      if (
        !incident
      ) {
        return;
      }

      const validation =
        validateBody(
          assignSchema,
          req,
          res
        );

      if (
        !validation.valid
      ) {
        return;
      }

      const {
        assigneeId,
        note,
      } =
        validation.value;

      if (
        assigneeId !==
          null &&
        assigneeId !==
          undefined &&
        !isDatabaseIdentifier(
            assigneeId
          )
      ) {
        return res
          .status(
            422
          )
          .json({
            error:
              "assigneeId must be a valid identifier or null",

            code:
              "INVALID_ASSIGNEE_ID",
          });
      }

      const updated =
        await incidentService
          .assign(
            incident._id,
            {
              organizationId:
                incident
                  .organizationId,

              environmentId:
                incident
                  .environmentId,

              userId:
                req.auth
                  ?.userId ||
                req.context
                  ?.userId,

              assigneeId:
                assigneeId ||
                null,

              note:
                note ||
                null,
            }
          );

      if (
        !updated
      ) {
        return res
          .status(
            404
          )
          .json({
            error:
              "Incident not found",

            code:
              "INCIDENT_NOT_FOUND",
          });
      }

      if (
        AUTH_EVENT_TYPES
          ?.INCIDENT_ASSIGNED
      ) {
        await auditRecord(
          AUTH_EVENT_TYPES
            .INCIDENT_ASSIGNED,

          AUTH_EVENT_OUTCOMES
            .SUCCESS,

          {
            userId:
              req.auth
                ?.userId,

            organizationId:
              incident
                .organizationId,

            tenantId:
              incident
                .tenantId,

            metadata: {
              incidentId:
                incident._id,

              environmentId:
                incident
                  .environmentId,

              assigneeId:
                assigneeId ||
                null,
            },
          }
        )
          .catch(
            () => {}
          );
      }

      return res.json({
        incident:
          safeIncident(
            updated
          ),
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// POST /:incidentId/playbooks/execute
// ============================================================================

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

      if (
        !incident
      ) {
        return;
      }

      const tenantId =
        req.auth
          ?.tenantId ||
        incident
          .tenantId;

      const {
        dryRun,
        correlationId,
      } =
        req.body ||
        {};

      const result =
        await getIncidentPlaybookService()
          .executeForIncident(
            incident,
            {
              tenantId,

              organizationId:
                incident
                  .organizationId,

              environmentId:
                incident
                  .environmentId,

              correlationId,

              initiatedBy:
                req.auth
                  ?.userId,

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
        .status(
          status
        )
        .json(
          result
        );
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  router;