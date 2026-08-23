"use strict";

const express =
  require(
    "express"
  );

const Joi =
  require(
    "joi"
  );

const {
  subscriptionRepository,
} =
  require(
    "../persistence/repositories"
  );

const {
  PLAN_VALUES,
} =
  require(
    "../constants/plans"
  );

const {
  ORGANIZATION_ROLES,
} =
  require(
    "../constants/roles"
  );

const {
  sessionAuthMiddleware,
} =
  require(
    "../middleware/sessionAuthMiddleware"
  );

const {
  requestContextMiddleware,
} =
  require(
    "../middleware/requestContextMiddleware"
  );

const {
  csrfProtection,
} =
  require(
    "../middleware/csrfMiddleware"
  );

const EntitlementService =
  require(
    "../services/core/entitlementService"
  );

const router =
  express.Router();

const changePlanSchema =
  Joi.object({
    plan:
      Joi.string()
        .valid(
          ...PLAN_VALUES
        )
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

  if (
    isProduction
  ) {
    return res
      .status(
        404
      )
      .json({
        error:
          "Resource not found",

        code:
          "RESOURCE_NOT_FOUND",
      });
  }

  if (
    !explicitlyEnabled
  ) {
    return res
      .status(
        404
      )
      .json({
        error:
          "Resource not found",

        code:
          "RESOURCE_NOT_FOUND",
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
    req.context
      ?.role !==
    ORGANIZATION_ROLES
      .OWNER
  ) {
    return res
      .status(
        403
      )
      .json({
        error:
          "Owner role required",

        code:
          "OWNER_REQUIRED",
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
      return res
        .status(
          400
        )
        .json({
          error:
            "Validation failed",

          code:
            "VALIDATION_ERROR",

          details:
            error.details.map(
              (
                detail
              ) => ({
                field:
                  detail.path
                    .join(
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
 * POST /api/v1/dev/subscription/plan
 *
 * Development/testing ONLY.
 *
 * Does not involve billing/payment.
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

      const organizationId =
        String(
          req.context
            .organizationId
        );

      /*
       * Phase 13:
       *
       * Never call Subscription.findOneAndUpdate() directly.
       *
       * First resolve the canonical subscription through the
       * provider-neutral repository.
       */
      let subscription =
        await subscriptionRepository
          .findOne({
            organizationId,
          });

      if (
        subscription
      ) {
        await subscriptionRepository
          .updateOne(
            {
              organizationId,
            },
            {
              $set: {
                plan,

                status:
                  "active",

                updatedAt:
                  new Date(),
              },
            }
          );
      } else {
        subscription =
          await subscriptionRepository
            .create({
              organizationId,

              plan,

              status:
                "active",

              startedAt:
                new Date(),

              metadata: {
                source:
                  "development_plan_override",
              },
            });
      }

      /*
       * Re-read after update so Mongo and PostgreSQL return the same
       * provider-neutral domain document.
       */
      subscription =
        await subscriptionRepository
          .findOne({
            organizationId,
          });

      if (
        !subscription
      ) {
        throw Object.assign(
          new Error(
            "Subscription could not be resolved after plan override"
          ),
          {
            code:
              "DEVELOPMENT_SUBSCRIPTION_NOT_FOUND",
          }
        );
      }

      const snapshot =
        await EntitlementService
          .getEntitlementSnapshot(
            organizationId
          );

      console.warn(
        [
          "[development]",
          "Plan override",
          `organization=${organizationId}`,
          `user=${req.context.userId}`,
          `plan=${plan}`,
        ].join(
          " | "
        )
      );

      return res.json({
        success:
          true,

        subscription: {
          id:
            String(
              subscription._id ||
              subscription.publicId ||
              ""
            ),

          organizationId:
            String(
              subscription
                .organizationId
            ),

          plan:
            subscription.plan,

          status:
            subscription.status,
        },

        ...snapshot,
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