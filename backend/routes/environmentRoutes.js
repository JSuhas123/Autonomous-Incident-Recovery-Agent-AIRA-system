"use strict";

const express = require("express");
const Joi = require("joi");

const EnvironmentService = require(
  "../services/core/environmentService"
);

const {
  PERMISSIONS,
} = require(
  "../constants/permissions"
);

const {
  sessionAuthMiddleware,
} = require(
  "../middleware/sessionAuthMiddleware"
);

const {
  requestContextMiddleware,
} = require(
  "../middleware/requestContextMiddleware"
);

const {
  requirePermission,
} = require(
  "../middleware/authorizationMiddleware"
);

const router =
  express.Router();

/**
 * ============================================================================
 * PHASE 14 — ENVIRONMENT CONTROL-PLANE ROUTES
 * ============================================================================
 *
 * Environment authorization is now permission-based.
 *
 * OLD:
 *
 * route
 *   ↓
 * hardcoded role array
 *   ↓
 * owner/admin/platform_engineer
 *
 * NEW:
 *
 * route
 *   ↓
 * canonical permission
 *   ↓
 * authorization middleware
 *   ↓
 * role permission bundle / future custom role / service account
 *
 * This removes role-specific authorization logic from the route layer.
 *
 * IMPORTANT:
 *
 * Environment APIs are organization-scoped because they manage environments
 * themselves.
 *
 * environmentContextMiddleware is therefore intentionally NOT used here.
 */

/**
 * ============================================================================
 * VALIDATION
 * ============================================================================
 */

const createEnvironmentSchema =
  Joi.object({
    name:
      Joi.string()
        .trim()
        .min(1)
        .max(100)
        .required(),

    slug:
      Joi.string()
        .trim()
        .lowercase()
        .max(80)
        .pattern(
          /^[a-z0-9_-]+$/
        )
        .optional(),

    type:
      Joi.string()
        .valid(
          "development",
          "testing",
          "staging",
          "production",
          "custom"
        )
        .default(
          "custom"
        ),

    criticality:
      Joi.string()
        .valid(
          "low",
          "medium",
          "high",
          "critical"
        )
        .default(
          "medium"
        ),

    description:
      Joi.string()
        .trim()
        .max(500)
        .allow("")
        .default(""),

    settings:
      Joi.object({
        allowAutonomousExecution:
          Joi.boolean(),

        requireApprovalForDestructiveActions:
          Joi.boolean(),

        timezone:
          Joi.string()
            .trim()
            .max(100)
            .allow(
              null,
              ""
            ),
      })
        .optional(),
  });

const updateEnvironmentSchema =
  Joi.object({
    name:
      Joi.string()
        .trim()
        .min(1)
        .max(100),

    description:
      Joi.string()
        .trim()
        .max(500)
        .allow(""),

    criticality:
      Joi.string()
        .valid(
          "low",
          "medium",
          "high",
          "critical"
        ),

    settings:
      Joi.object({
        allowAutonomousExecution:
          Joi.boolean(),

        requireApprovalForDestructiveActions:
          Joi.boolean(),

        timezone:
          Joi.string()
            .trim()
            .max(100)
            .allow(
              null,
              ""
            ),
      }),
  })
    .min(1)
    .unknown(false);

const maintenanceSchema =
  Joi.object({
    reason:
      Joi.string()
        .trim()
        .min(1)
        .max(500)
        .required(),
  });

const archiveSchema =
  Joi.object({
    reason:
      Joi.string()
        .trim()
        .max(500)
        .allow("")
        .default(""),
  });

/**
 * ============================================================================
 * VALIDATION MIDDLEWARE
 * ============================================================================
 */

function validateBody(
  schema
) {
  return (
    req,
    res,
    next
  ) => {
    const {
      error,
      value,
    } =
      schema.validate(
        req.body ||
          {},
        {
          abortEarly:
            false,

          stripUnknown:
            true,
        }
      );

    if (
      error
    ) {
      const validationError =
        new Error(
          "Validation failed"
        );

      validationError.status =
        400;

      validationError.code =
        "VALIDATION_ERROR";

      validationError.field =
        error
          .details[0]
          ?.path
          ?.join(
            "."
          ) ||
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

/**
 * ============================================================================
 * ROUTER AUTHENTICATION / TENANT CONTEXT
 * ============================================================================
 *
 * Every route requires:
 *
 * - valid browser session
 * - active user
 * - active organization
 * - active membership
 * - canonical request context
 * - Phase 14 permission resolution
 *
 * requestContextMiddleware now produces:
 *
 * req.context.permissions
 *
 * which authorizationMiddleware consumes.
 */

router.use(
  sessionAuthMiddleware,
  requestContextMiddleware
);

/**
 * ============================================================================
 * GET /api/v1/environments/summary
 * ============================================================================
 *
 * Permission:
 *
 * environment.read
 */

router.get(
  "/summary",

  requirePermission(
    PERMISSIONS
      .ENVIRONMENT_READ
  ),

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
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

/**
 * ============================================================================
 * GET /api/v1/environments
 * ============================================================================
 *
 * Permission:
 *
 * environment.read
 */

router.get(
  "/",

  requirePermission(
    PERMISSIONS
      .ENVIRONMENT_READ
  ),

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
            (
              environment
            ) => ({
              ...EnvironmentService
                .safeEnvironment(
                  environment
                ),

              isDefault:
                defaultId ===
                environment
                  ._id
                  .toString(),
            })
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

/**
 * ============================================================================
 * GET /api/v1/environments/:environmentId
 * ============================================================================
 *
 * Permission:
 *
 * environment.read
 */

router.get(
  "/:environmentId",

  requirePermission(
    PERMISSIONS
      .ENVIRONMENT_READ
  ),

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
            environment
              ._id
              .toString(),
        },
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

/**
 * ============================================================================
 * POST /api/v1/environments
 * ============================================================================
 *
 * Permission:
 *
 * environment.manage
 */

router.post(
  "/",

  requirePermission(
    PERMISSIONS
      .ENVIRONMENT_MANAGE
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
        .status(
          201
        )
        .json({
          environment:
            EnvironmentService
              .safeEnvironment(
                environment
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

/**
 * ============================================================================
 * PATCH /api/v1/environments/:environmentId
 * ============================================================================
 *
 * Permission:
 *
 * environment.manage
 */

router.patch(
  "/:environmentId",

  requirePermission(
    PERMISSIONS
      .ENVIRONMENT_MANAGE
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
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

/**
 * ============================================================================
 * POST /api/v1/environments/:environmentId/default
 * ============================================================================
 *
 * Setting an organization's default environment modifies environment
 * control-plane configuration.
 *
 * Permission:
 *
 * environment.manage
 */

router.post(
  "/:environmentId/default",

  requirePermission(
    PERMISSIONS
      .ENVIRONMENT_MANAGE
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
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

/**
 * ============================================================================
 * POST /api/v1/environments/:environmentId/maintenance
 * ============================================================================
 *
 * Maintenance mode alters execution availability but does not archive the
 * environment.
 *
 * Permission:
 *
 * environment.manage
 */

router.post(
  "/:environmentId/maintenance",

  requirePermission(
    PERMISSIONS
      .ENVIRONMENT_MANAGE
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
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

/**
 * ============================================================================
 * POST /api/v1/environments/:environmentId/activate
 * ============================================================================
 *
 * Used to leave maintenance mode.
 *
 * Permission:
 *
 * environment.manage
 */

router.post(
  "/:environmentId/activate",

  requirePermission(
    PERMISSIONS
      .ENVIRONMENT_MANAGE
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
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

/**
 * ============================================================================
 * DELETE /api/v1/environments/:environmentId
 * ============================================================================
 *
 * This performs a SOFT DELETE / ARCHIVE.
 *
 * Operational environments are never physically deleted by this endpoint.
 *
 * Archival is deliberately separated from ordinary environment management.
 *
 * Platform engineers may manage active environment configuration, but only
 * roles granted the stronger environment.archive permission may archive an
 * environment.
 *
 * Current default bundle:
 *
 * owner  → allowed
 * admin  → allowed
 * platform_engineer → denied
 *
 * Permission:
 *
 * environment.archive
 */

router.delete(
  "/:environmentId",

  requirePermission(
    PERMISSIONS
      .ENVIRONMENT_ARCHIVE
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
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

module.exports =
  router;