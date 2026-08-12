"use strict";

const express = require("express");
const Joi = require("joi");

const EnvironmentService = require(
  "../services/core/environmentService"
);

const {
  ORGANIZATION_ROLES,
} = require("../constants/roles");

const {
  sessionAuthMiddleware,
} = require("../middleware/sessionAuthMiddleware");

const {
  requestContextMiddleware,
} = require("../middleware/requestContextMiddleware");

const router = express.Router();

/**
 * ---------------------------------------------------------------
 * ROLE GROUPS
 * ---------------------------------------------------------------
 */

const ENVIRONMENT_MANAGERS = [
  ORGANIZATION_ROLES.OWNER,
  ORGANIZATION_ROLES.ADMIN,
  ORGANIZATION_ROLES.PLATFORM_ENGINEER,
];

const ENVIRONMENT_ARCHIVERS = [
  ORGANIZATION_ROLES.OWNER,
  ORGANIZATION_ROLES.ADMIN,
];

/**
 * ---------------------------------------------------------------
 * VALIDATION
 * ---------------------------------------------------------------
 */

const createEnvironmentSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .required(),

  slug: Joi.string()
    .trim()
    .lowercase()
    .max(80)
    .pattern(/^[a-z0-9_-]+$/)
    .optional(),

  type: Joi.string()
    .valid(
      "development",
      "testing",
      "staging",
      "production",
      "custom"
    )
    .default("custom"),

  criticality: Joi.string()
    .valid(
      "low",
      "medium",
      "high",
      "critical"
    )
    .default("medium"),

  description: Joi.string()
    .trim()
    .max(500)
    .allow("")
    .default(""),

  settings: Joi.object({
    allowAutonomousExecution:
      Joi.boolean(),

    requireApprovalForDestructiveActions:
      Joi.boolean(),

    timezone: Joi.string()
      .trim()
      .max(100)
      .allow(null, ""),
  }).optional(),
});

const updateEnvironmentSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(1)
    .max(100),

  description: Joi.string()
    .trim()
    .max(500)
    .allow(""),

  criticality: Joi.string()
    .valid(
      "low",
      "medium",
      "high",
      "critical"
    ),

  settings: Joi.object({
    allowAutonomousExecution:
      Joi.boolean(),

    requireApprovalForDestructiveActions:
      Joi.boolean(),

    timezone: Joi.string()
      .trim()
      .max(100)
      .allow(null, ""),
  }),
})
  .min(1)
  .unknown(false);

const maintenanceSchema = Joi.object({
  reason: Joi.string()
    .trim()
    .min(1)
    .max(500)
    .required(),
});

const archiveSchema = Joi.object({
  reason: Joi.string()
    .trim()
    .max(500)
    .allow("")
    .default(""),
});

/**
 * ---------------------------------------------------------------
 * HELPERS
 * ---------------------------------------------------------------
 */

function validateBody(schema) {
  return (req, res, next) => {
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
      const validationError =
        new Error(
          "Validation failed"
        );

      validationError.status =
        400;

      validationError.code =
        "VALIDATION_ERROR";

      validationError.field =
        error.details[0]
          ?.path
          ?.join(".") ||
        null;

      return next(
        validationError
      );
    }

    req.validatedBody =
      value;

    return next();
  };
}

function requireRoles(
  allowedRoles
) {
  return (
    req,
    res,
    next
  ) => {
    const role =
      req.context?.role;

    if (
      !role ||
      !allowedRoles.includes(
        role
      )
    ) {
      const error =
        new Error(
          "Insufficient permissions"
        );

      error.status =
        403;

      error.code =
        "INSUFFICIENT_ROLE";

      return next(error);
    }

    return next();
  };
}

/**
 * Every route in this router requires:
 *
 * - valid browser session
 * - active organization
 * - active membership
 * - canonical organization context
 *
 * IMPORTANT:
 * We deliberately do NOT use environmentContextMiddleware here.
 *
 * This API manages environments themselves, so it is
 * organization-scoped rather than environment-scoped.
 */
router.use(
  sessionAuthMiddleware,
  requestContextMiddleware
);

/**
 * ---------------------------------------------------------------
 * GET /api/v1/environments/summary
 * ---------------------------------------------------------------
 */

router.get(
  "/summary",
  async (
    req,
    res,
    next
  ) => {
    try {
      const summary =
        await EnvironmentService
          .getEnvironmentSummary(
            req.context
              .organizationId
          );

      return res.json({
        summary,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ---------------------------------------------------------------
 * GET /api/v1/environments
 * ---------------------------------------------------------------
 */

router.get(
  "/",
  async (
    req,
    res,
    next
  ) => {
    try {
      const environments =
        await EnvironmentService
          .listForOrganization(
            req.context
              .organizationId
          );

      const organization =
        req.context
          .organization;

      const defaultId =
        organization
          ?.settings
          ?.defaultEnvironmentId
          ?.toString?.() ||
        null;

      return res.json({
        environments:
          environments.map(
            (environment) => ({
              ...EnvironmentService
                .safeEnvironment(
                  environment
                ),

              isDefault:
                defaultId ===
                environment._id
                  .toString(),
            })
          ),
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ---------------------------------------------------------------
 * GET /api/v1/environments/:environmentId
 * ---------------------------------------------------------------
 */

router.get(
  "/:environmentId",
  async (
    req,
    res,
    next
  ) => {
    try {
      const environment =
        await EnvironmentService
          .requireEnvironment(
            req.params
              .environmentId,

            req.context
              .organizationId
          );

      const defaultId =
        req.context
          .organization
          ?.settings
          ?.defaultEnvironmentId
          ?.toString?.() ||
        null;

      return res.json({
        environment: {
          ...EnvironmentService
            .safeEnvironment(
              environment
            ),

          isDefault:
            defaultId ===
            environment._id
              .toString(),
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ---------------------------------------------------------------
 * POST /api/v1/environments
 * ---------------------------------------------------------------
 */

router.post(
  "/",

  requireRoles(
    ENVIRONMENT_MANAGERS
  ),

  validateBody(
    createEnvironmentSchema
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const environment =
        await EnvironmentService
          .createEnvironment(
            req.context
              .organizationId,

            req.validatedBody,

            req.context
              .userId
          );

      return res
        .status(201)
        .json({
          environment:
            EnvironmentService
              .safeEnvironment(
                environment
              ),
        });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ---------------------------------------------------------------
 * PATCH /api/v1/environments/:environmentId
 * ---------------------------------------------------------------
 */

router.patch(
  "/:environmentId",

  requireRoles(
    ENVIRONMENT_MANAGERS
  ),

  validateBody(
    updateEnvironmentSchema
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const environment =
        await EnvironmentService
          .updateEnvironment(
            req.params
              .environmentId,

            req.context
              .organizationId,

            req.validatedBody
          );

      return res.json({
        environment:
          EnvironmentService
            .safeEnvironment(
              environment
            ),
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ---------------------------------------------------------------
 * POST /api/v1/environments/:environmentId/default
 * ---------------------------------------------------------------
 */

router.post(
  "/:environmentId/default",

  requireRoles(
    ENVIRONMENT_MANAGERS
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const environment =
        await EnvironmentService
          .setDefaultEnvironment(
            req.params
              .environmentId,

            req.context
              .organizationId
          );

      return res.json({
        environment:
          EnvironmentService
            .safeEnvironment(
              environment
            ),

        isDefault:
          true,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ---------------------------------------------------------------
 * POST /api/v1/environments/:environmentId/maintenance
 * ---------------------------------------------------------------
 */

router.post(
  "/:environmentId/maintenance",

  requireRoles(
    ENVIRONMENT_MANAGERS
  ),

  validateBody(
    maintenanceSchema
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const environment =
        await EnvironmentService
          .enterMaintenance(
            req.params
              .environmentId,

            req.context
              .organizationId,

            req.validatedBody
              .reason
          );

      return res.json({
        environment:
          EnvironmentService
            .safeEnvironment(
              environment
            ),
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ---------------------------------------------------------------
 * POST /api/v1/environments/:environmentId/activate
 *
 * Used to leave maintenance mode.
 * ---------------------------------------------------------------
 */

router.post(
  "/:environmentId/activate",

  requireRoles(
    ENVIRONMENT_MANAGERS
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const environment =
        await EnvironmentService
          .exitMaintenance(
            req.params
              .environmentId,

            req.context
              .organizationId
          );

      return res.json({
        environment:
          EnvironmentService
            .safeEnvironment(
              environment
            ),
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ---------------------------------------------------------------
 * DELETE /api/v1/environments/:environmentId
 *
 * This performs a SOFT DELETE / ARCHIVE.
 *
 * Operational environments are never physically deleted.
 * ---------------------------------------------------------------
 */

router.delete(
  "/:environmentId",

  requireRoles(
    ENVIRONMENT_ARCHIVERS
  ),

  validateBody(
    archiveSchema
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const environment =
        await EnvironmentService
          .archiveEnvironment(
            req.params
              .environmentId,

            req.context
              .organizationId,

            req.context
              .userId,

            req.validatedBody
              .reason ||
              null
          );

      return res.json({
        archived:
          true,

        environment:
          EnvironmentService
            .safeEnvironment(
              environment
            ),
      });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;