"use strict";

const express = require("express");
const Joi = require("joi");
const { isDatabaseIdentifier } = require("../utils/identifier");

const {
  Service,
  SERVICE_TYPES,
  SERVICE_ENVS,
  SERVICE_STATUSES,
  VERIFICATION_STATUSES,
  MONITORING_STATUSES,
} = require("../persistence/operational/operationalModels");

const verificationRoutes = require("./verificationRoutes");
const {
  serviceMonitorRouter,
} = require("./monitorRoutes");

const {
  validateServiceUrl,
} = require("../utils/urlValidator");

const {
  record: auditRecord,
} = require(
  "../services/identity/identityAuditService"
);

const {
  AUTH_EVENT_OUTCOMES,
} = require("../constants/authEvents");

const {
  environmentQuery,
  environmentCreateData,
} = require("../utils/contextQuery");


const router = express.Router();

/**
 * ------------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------------
 */

function slugify(name) {
  const slug = String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || "service";
}

function escapeRegex(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

/**
 * Preserve the old string environment only for compatibility.
 *
 * Canonical ownership is environmentId.
 */
function legacyEnvironmentValue(
  environment
) {
  const type =
    environment?.type;

  return SERVICE_ENVS.includes(
    type
  )
    ? type
    : null;
}

function safeService(doc) {
  if (!doc) {
    return null;
  }

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

    name:
      doc.name,

    slug:
      doc.slug,

    description:
      doc.description,

    type:
      doc.type,

    /**
     * Legacy compatibility field.
     */
    environment:
      doc.environment,

    baseUrl:
      doc.baseUrl,

    status:
      doc.status,

    verificationStatus:
      doc.verificationStatus,

    monitoringStatus:
      doc.monitoringStatus,

    tags:
      doc.tags,

    createdBy:
      doc.createdBy
        ?.toString?.() ??
      doc.createdBy,

    verificationMethod:
      doc.verificationMethod,

    verifiedAt:
      doc.verifiedAt,

    createdAt:
      doc.createdAt,

    updatedAt:
      doc.updatedAt,

    archivedAt:
      doc.archivedAt,
  };
}

function validate(schema) {
  return (
    req,
    res,
    next
  ) => {
    const {
      error,
      value,
    } = schema.validate(
      req.body || {},
      {
        abortEarly: false,
        stripUnknown: true,
      }
    );

    if (error) {
      return res
        .status(400)
        .json({
          error:
            "Validation failed",

          code:
            "VALIDATION_ERROR",

          details:
            error.details.map(
              (detail) => ({
                field:
                  detail.path.join(
                    "."
                  ),

                message:
                  detail.message,
              })
            ),
        });
    }

    req.validatedBody =
      value;

    return next();
  };
}

/**
 * Every /:serviceId operation must prove that the service
 * belongs to BOTH:
 *
 * - authenticated organization
 * - currently selected environment
 *
 * This also protects the verification and monitor subrouters
 * mounted under /:serviceId.
 */
router.param(
  "serviceId",
  async (
    req,
    res,
    next,
    serviceId
  ) => {
    try {
      if (
        !req.context
          ?.organizationId ||
        !req.context
          ?.environmentId
      ) {
        return res
          .status(500)
          .json({
            error:
              "Environment context unavailable",

            code:
              "ENVIRONMENT_CONTEXT_MISSING",
          });
      }

      if (
        !isDatabaseIdentifier(
          serviceId
        )
      ) {
        return res
          .status(404)
          .json({
            error:
              "Service not found",

            code:
              "SERVICE_NOT_FOUND",
          });
      }

      const service =
        await Service.findOne(
          environmentQuery(
            req.context,
            {
              _id:
                serviceId,
            }
          )
        );

      if (!service) {
        /*
         * Do not reveal whether this service exists
         * in another environment or organization.
         */
        return res
          .status(404)
          .json({
            error:
              "Service not found",

            code:
              "SERVICE_NOT_FOUND",
          });
      }

      req.scopedService =
        service;

      return next();
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ------------------------------------------------------------------
 * VALIDATION SCHEMAS
 * ------------------------------------------------------------------
 *
 * Notice that environment is NO LONGER accepted.
 *
 * Environment ownership comes entirely from req.context.
 */

const createSchema =
  Joi.object({
    name:
      Joi.string()
        .min(1)
        .max(100)
        .trim()
        .required(),

    description:
      Joi.string()
        .max(500)
        .trim()
        .allow("", null)
        .default(null),

    type:
      Joi.string()
        .valid(
          ...SERVICE_TYPES
        )
        .required(),

    baseUrl:
      Joi.string()
        .uri({
          scheme: [
            "http",
            "https",
          ],
        })
        .max(2048)
        .allow("", null)
        .default(null),

    tags:
      Joi.array()
        .items(
          Joi.string()
            .trim()
            .max(50)
        )
        .max(20)
        .default([]),
  });

const updateSchema =
  Joi.object({
    name:
      Joi.string()
        .min(1)
        .max(100)
        .trim(),

    description:
      Joi.string()
        .max(500)
        .trim()
        .allow("", null),

    type:
      Joi.string()
        .valid(
          ...SERVICE_TYPES
        ),

    baseUrl:
      Joi.string()
        .uri({
          scheme: [
            "http",
            "https",
          ],
        })
        .max(2048)
        .allow("", null),

    tags:
      Joi.array()
        .items(
          Joi.string()
            .trim()
            .max(50)
        )
        .max(20),
  })
    .min(1)
    .unknown(false);

const listQuerySchema =
  Joi.object({
    page:
      Joi.number()
        .integer()
        .min(1)
        .default(1),

    limit:
      Joi.number()
        .integer()
        .min(1)
        .max(100)
        .default(20),

    search:
      Joi.string()
        .trim()
        .max(100)
        .allow("")
        .default(""),

    type:
      Joi.string()
        .valid(
          ...SERVICE_TYPES,
          ""
        )
        .allow("")
        .default(""),

    /*
     * There is intentionally NO environment query filter.
     *
     * The active environment is mandatory request context.
     */

    status:
      Joi.string()
        .valid(
          ...SERVICE_STATUSES,
          ""
        )
        .allow("")
        .default(""),

    verificationStatus:
      Joi.string()
        .valid(
          ...VERIFICATION_STATUSES,
          ""
        )
        .allow("")
        .default(""),

    monitoringStatus:
      Joi.string()
        .valid(
          ...MONITORING_STATUSES,
          ""
        )
        .allow("")
        .default(""),

    sortBy:
      Joi.string()
        .valid(
          "createdAt",
          "updatedAt",
          "name"
        )
        .default(
          "createdAt"
        ),

    order:
      Joi.string()
        .valid(
          "asc",
          "desc"
        )
        .default(
          "desc"
        ),
  });

/**
 * ------------------------------------------------------------------
 * POST /api/v1/services
 * ------------------------------------------------------------------
 */

router.post(
  "/",
  validate(createSchema),

  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        name,
        description,
        type,
        baseUrl,
        tags,
      } =
        req.validatedBody;

      const {
        organizationId,
        environmentId,
        tenantId,
        userId,
        environment,
      } =
        req.context;

      if (
        !organizationId ||
        !environmentId
      ) {
        return res
          .status(500)
          .json({
            error:
              "Environment context unavailable",

            code:
              "ENVIRONMENT_CONTEXT_MISSING",
          });
      }

      /**
       * Validate URL if supplied.
       */
      let normalisedUrl =
        null;

      if (baseUrl) {
        const urlCheck =
          validateServiceUrl(
            baseUrl
          );

        if (!urlCheck.valid) {
          return res
            .status(400)
            .json({
              error:
                urlCheck.reason,

              code:
                "INVALID_URL",
            });
        }

        normalisedUrl =
          urlCheck.normalised;
      }

      /**
       * Duplicate names are scoped to the current
       * environment, not the entire organization.
       */
      const existingService =
        await Service.findOne(
          environmentQuery(
            req.context,
            {
              name: {
                $regex:
                  new RegExp(
                    `^${escapeRegex(
                      name
                    )}$`,
                    "i"
                  ),
              },

              status: {
                $ne:
                  "archived",
              },
            }
          )
        ).select("_id");

      if (
        existingService
      ) {
        return res
          .status(409)
          .json({
            error:
              "A service with this name already exists in this environment",

            code:
              "DUPLICATE_SERVICE",
          });
      }

      /**
       * Deterministic slug means the database's
       * org + environment + slug unique index can also
       * protect concurrent duplicate creation.
       */
      const slug =
        slugify(name);

      let service;

      try {
        service =
          await Service.create(
            environmentCreateData(
              req.context,
              {
                name,
                slug,

                description,

                type,

                /*
                 * Legacy compatibility only.
                 * The client cannot supply this.
                 */
                environment:
                  legacyEnvironmentValue(
                    environment
                  ),

                baseUrl:
                  normalisedUrl,

                tags,

                createdBy:
                  userId,
              }
            )
          );
      } catch (error) {
        if (
          error.code ===
          11000
        ) {
          return res
            .status(409)
            .json({
              error:
                "A service with this name already exists in this environment",

              code:
                "DUPLICATE_SERVICE",
            });
        }

        throw error;
      }

      await auditRecord(
        "service_created",
        AUTH_EVENT_OUTCOMES.SUCCESS,
        {
          userId,
          organizationId,

          metadata: {
            serviceId:
              service._id,

            environmentId,

            environmentType:
              environment?.type ||
              null,

            tenantId,

            name,
            type,
          },
        }
      );

      return res
        .status(201)
        .json({
          success:
            true,

          data:
            safeService(
              service
            ),
        });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ------------------------------------------------------------------
 * GET /api/v1/services
 * ------------------------------------------------------------------
 */

router.get(
  "/",

  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        error:
          queryError,

        value:
          query,
      } =
        listQuerySchema.validate(
          req.query,
          {
            abortEarly:
              false,

            stripUnknown:
              true,
          }
        );

      if (queryError) {
        return res
          .status(400)
          .json({
            error:
              "Invalid query parameters",

            code:
              "VALIDATION_ERROR",
          });
      }

      /**
       * Environment ownership is mandatory.
       */
      const filter =
        environmentQuery(
          req.context
        );

      if (query.search) {
        filter.name = {
          $regex:
            query.search,

          $options:
            "i",
        };
      }

      if (query.type) {
        filter.type =
          query.type;
      }

      if (query.status) {
        filter.status =
          query.status;
      }

      if (
        query.verificationStatus
      ) {
        filter.verificationStatus =
          query.verificationStatus;
      }

      if (
        query.monitoringStatus
      ) {
        filter.monitoringStatus =
          query.monitoringStatus;
      }

      const sortField =
        query.sortBy ===
        "name"
          ? "name"
          : query.sortBy;

      const sortDirection =
        query.order ===
        "asc"
          ? 1
          : -1;

      const skip =
        (query.page - 1) *
        query.limit;

      const [
        total,
        documents,
      ] =
        await Promise.all([
          Service.countDocuments(
            filter
          ),

          Service.find(
            filter
          )
            .sort({
              [sortField]:
                sortDirection,
            })
            .skip(skip)
            .limit(
              query.limit
            )
            .lean(),
        ]);

      return res.json({
        success:
          true,

        data:
          documents.map(
            safeService
          ),

        pagination: {
          page:
            query.page,

          limit:
            query.limit,

          total,

          pages:
            Math.ceil(
              total /
                query.limit
            ),
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ------------------------------------------------------------------
 * GET /api/v1/services/:serviceId
 * ------------------------------------------------------------------
 */

router.get(
  "/:serviceId",

  async (
    req,
    res,
    next
  ) => {
    try {
      return res.json({
        success:
          true,

        data:
          safeService(
            req.scopedService
          ),
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ------------------------------------------------------------------
 * PATCH /api/v1/services/:serviceId
 * ------------------------------------------------------------------
 */

router.patch(
  "/:serviceId",

  validate(updateSchema),

  async (
    req,
    res,
    next
  ) => {
    try {
      const service =
        req.scopedService;

      const updates = {
        ...req.validatedBody,
      };

      const {
        userId,
        organizationId,
        environmentId,
      } =
        req.context;

      if (
        updates.baseUrl !==
          undefined &&
        updates.baseUrl
      ) {
        const urlCheck =
          validateServiceUrl(
            updates.baseUrl
          );

        if (!urlCheck.valid) {
          return res
            .status(400)
            .json({
              error:
                urlCheck.reason,

              code:
                "INVALID_URL",
            });
        }

        updates.baseUrl =
          urlCheck.normalised;
      }

      /**
       * Name changes require duplicate protection and
       * deterministic slug regeneration.
       */
      if (
        updates.name !==
        undefined
      ) {
        const duplicate =
          await Service.findOne(
            environmentQuery(
              req.context,
              {
                _id: {
                  $ne:
                    service._id,
                },

                name: {
                  $regex:
                    new RegExp(
                      `^${escapeRegex(
                        updates.name
                      )}$`,
                      "i"
                    ),
                },

                status: {
                  $ne:
                    "archived",
                },
              }
            )
          ).select("_id");

        if (duplicate) {
          return res
            .status(409)
            .json({
              error:
                "A service with this name already exists in this environment",

              code:
                "DUPLICATE_SERVICE",
            });
        }

        updates.slug =
          slugify(
            updates.name
          );
      }

      /**
       * Ownership cannot be changed through this route.
       */
      delete updates.organizationId;
      delete updates.environmentId;
      delete updates.tenantId;
      delete updates.environment;

      for (
        const [
          key,
          value,
        ] of Object.entries(
          updates
        )
      ) {
        service[key] =
          value;
      }

      try {
        await service.save();
      } catch (error) {
        if (
          error.code ===
          11000
        ) {
          return res
            .status(409)
            .json({
              error:
                "A service with this name already exists in this environment",

              code:
                "DUPLICATE_SERVICE",
            });
        }

        throw error;
      }

      await auditRecord(
        "service_updated",
        AUTH_EVENT_OUTCOMES.SUCCESS,
        {
          userId,
          organizationId,

          metadata: {
            serviceId:
              service._id,

            environmentId,

            fields:
              Object.keys(
                updates
              ),
          },
        }
      );

      return res.json({
        success:
          true,

        data:
          safeService(
            service
          ),
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ------------------------------------------------------------------
 * POST /api/v1/services/:serviceId/pause
 * ------------------------------------------------------------------
 */

router.post(
  "/:serviceId/pause",

  async (
    req,
    res,
    next
  ) => {
    try {
      const service =
        req.scopedService;

      const {
        userId,
        organizationId,
        environmentId,
      } =
        req.context;

      if (
        service.status !==
        "active"
      ) {
        return res
          .status(409)
          .json({
            error:
              "Service is not active",

            code:
              "SERVICE_NOT_ACTIVE",
          });
      }

      service.status =
        "paused";

      await service.save();

      await auditRecord(
        "service_paused",
        AUTH_EVENT_OUTCOMES.SUCCESS,
        {
          userId,
          organizationId,

          metadata: {
            serviceId:
              service._id,

            environmentId,
          },
        }
      );

      return res.json({
        success:
          true,

        data:
          safeService(
            service
          ),
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ------------------------------------------------------------------
 * POST /api/v1/services/:serviceId/resume
 * ------------------------------------------------------------------
 */

router.post(
  "/:serviceId/resume",

  async (
    req,
    res,
    next
  ) => {
    try {
      const service =
        req.scopedService;

      const {
        userId,
        organizationId,
        environmentId,
      } =
        req.context;

      if (
        service.status !==
        "paused"
      ) {
        return res
          .status(409)
          .json({
            error:
              "Service is not paused",

            code:
              "SERVICE_NOT_PAUSED",
          });
      }

      service.status =
        "active";

      await service.save();

      await auditRecord(
        "service_restored",
        AUTH_EVENT_OUTCOMES.SUCCESS,
        {
          userId,
          organizationId,

          metadata: {
            serviceId:
              service._id,

            environmentId,
          },
        }
      );

      return res.json({
        success:
          true,

        data:
          safeService(
            service
          ),
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ------------------------------------------------------------------
 * DELETE /api/v1/services/:serviceId
 *
 * Soft archive only.
 * ------------------------------------------------------------------
 */

router.delete(
  "/:serviceId",

  async (
    req,
    res,
    next
  ) => {
    try {
      const service =
        req.scopedService;

      const {
        userId,
        organizationId,
        environmentId,
      } =
        req.context;

      if (
        service.status ===
        "archived"
      ) {
        return res
          .status(404)
          .json({
            error:
              "Service not found",

            code:
              "SERVICE_NOT_FOUND",
          });
      }

      service.status =
        "archived";

      service.archivedAt =
        new Date();

      await service.save();

      await auditRecord(
        "service_archived",
        AUTH_EVENT_OUTCOMES.SUCCESS,
        {
          userId,
          organizationId,

          metadata: {
            serviceId:
              service._id,

            environmentId,
          },
        }
      );

      return res.json({
        success:
          true,

        data:
          safeService(
            service
          ),
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ------------------------------------------------------------------
 * SERVICE SUBROUTERS
 * ------------------------------------------------------------------
 *
 * router.param("serviceId") executes first and proves that the
 * service belongs to the active organization + environment.
 *
 * This provides an environment boundary around these older
 * subrouters even before we migrate their internal models.
 */

router.use(
  "/:serviceId/verification",
  verificationRoutes
);

router.use(
  "/:serviceId/monitors",
  serviceMonitorRouter
);

module.exports =
  router;