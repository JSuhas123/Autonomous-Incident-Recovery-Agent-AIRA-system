"use strict";

const express =
  require(
    "express"
  );

const {
  PERMISSIONS,
} =
  require(
    "../constants/permissions"
  );

const {
  requirePermission,
} =
  require(
    "../middleware/authorizationMiddleware"
  );

const {
  getOnboarding,
  startOnboarding,
  completeStep,
  skipStep,
} =
  require(
    "../services/onboarding/onboardingService"
  );


const router =
  express.Router();


router.get(
  "/",

  requirePermission(
    PERMISSIONS
      .ONBOARDING_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json(
        await getOnboarding({
          organizationId:
            req.context
              .organizationId,

          actorUserId:
            req.context
              .userId,
        })
      );
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


router.post(
  "/start",

  requirePermission(
    PERMISSIONS
      .ONBOARDING_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json(
        await startOnboarding({
          organizationId:
            req.context
              .organizationId,

          actorUserId:
            req.context
              .userId,
        })
      );
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


router.post(
  "/steps/:stepKey/complete",

  requirePermission(
    PERMISSIONS
      .ONBOARDING_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json(
        await completeStep({
          organizationId:
            req.context
              .organizationId,

          stepKey:
            req.params
              .stepKey,

          actorUserId:
            req.context
              .userId,

          metadata:
            req.body
              ?.metadata ||
            {},
        })
      );
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


router.post(
  "/steps/:stepKey/skip",

  requirePermission(
    PERMISSIONS
      .ONBOARDING_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json(
        await skipStep({
          organizationId:
            req.context
              .organizationId,

          stepKey:
            req.params
              .stepKey,

          actorUserId:
            req.context
              .userId,

          reason:
            req.body
              ?.reason ||
            null,
        })
      );
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


module.exports =
  router;