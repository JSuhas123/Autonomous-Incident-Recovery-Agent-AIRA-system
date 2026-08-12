"use strict";

const express = require("express");
const Joi = require("joi");

const Subscription = require("../models/Subscription");

const {
  PLAN_VALUES,
} = require("../constants/plans");

const {
  ORGANIZATION_ROLES,
} = require("../constants/roles");

const {
  sessionAuthMiddleware,
} = require("../middleware/sessionAuthMiddleware");

const {
  requestContextMiddleware,
} = require("../middleware/requestContextMiddleware");

const {
  csrfProtection,
} = require("../middleware/csrfMiddleware");

const EntitlementService = require(
  "../services/core/entitlementService"
);

const router = express.Router();

const changePlanSchema = Joi.object({
  plan: Joi.string()
    .valid(...PLAN_VALUES)
    .required(),
});

function ensureDevelopmentToolsEnabled(
  req,
  res,
  next
) {
  const explicitlyEnabled =
    process.env
      .ENABLE_DEVELOPMENT_TOOLS ===
    "true";

  const isProduction =
    process.env.NODE_ENV ===
    "production";

  /*
   * Absolutely unavailable in production.
   */
  if (isProduction) {
    return res.status(404).json({
      error: "Resource not found",
      code: "RESOURCE_NOT_FOUND",
    });
  }

  /*
   * Even in local/dev environments, require an
   * explicit opt-in environment variable.
   */
  if (!explicitlyEnabled) {
    return res.status(404).json({
      error: "Resource not found",
      code: "RESOURCE_NOT_FOUND",
    });
  }

  return next();
}

function requireOwner(
  req,
  res,
  next
) {
  if (
    req.context?.role !==
    ORGANIZATION_ROLES.OWNER
  ) {
    return res.status(403).json({
      error: "Owner role required",
      code: "OWNER_REQUIRED",
    });
  }

  return next();
}

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
    } = schema.validate(
      req.body || {},
      {
        abortEarly: false,
        stripUnknown: true,
      }
    );

    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        code: "VALIDATION_ERROR",

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

/*
 * Every development route still requires:
 *
 * real login
 * real organization membership
 * owner role
 * CSRF for mutations
 */
router.use(
  ensureDevelopmentToolsEnabled,
  sessionAuthMiddleware,
  requestContextMiddleware
);

/**
 * GET /api/v1/dev/subscription
 */
router.get(
  "/subscription",

  requireOwner,

  async (
    req,
    res,
    next
  ) => {
    try {
      const snapshot =
        await EntitlementService
          .getEntitlementSnapshot(
            req.context
              .organizationId
          );

      return res.json(
        snapshot
      );
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * POST /api/v1/dev/subscription/plan
 *
 * Development/testing ONLY.
 *
 * This does not involve payment/billing.
 */
router.post(
  "/subscription/plan",

  requireOwner,
  csrfProtection,

  validateBody(
    changePlanSchema
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        plan,
      } =
        req.validatedBody;

      const subscription =
        await Subscription
          .findOneAndUpdate(
            {
              organizationId:
                req.context
                  .organizationId,
            },

            {
              $set: {
                plan,
                status:
                  "active",
              },
            },

            {
              new: true,
              upsert: true,
              setDefaultsOnInsert:
                true,
            }
          );

      const snapshot =
        await EntitlementService
          .getEntitlementSnapshot(
            req.context
              .organizationId
          );

      console.warn(
        [
          "[development]",
          "Plan override",
          `organization=${req.context.organizationId}`,
          `user=${req.context.userId}`,
          `plan=${plan}`,
        ].join(" | ")
      );

      return res.json({
        success: true,

        subscription: {
          id:
            subscription._id
              .toString(),

          organizationId:
            subscription
              .organizationId
              .toString(),

          plan:
            subscription.plan,

          status:
            subscription.status,
        },

        ...snapshot,
      });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports =
  router;