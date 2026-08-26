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
  getOrganizationSettings,
  updateOrganizationSettings,
  getEnvironmentSettings,
  updateEnvironmentSettings,
  getEffectiveSettings,
} =
  require(
    "../services/identity/tenantRuntimeSettingsService"
  );


const router =
  express.Router();


router.get(
  "/",

  requirePermission(
    PERMISSIONS
      .TENANT_SETTINGS_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        settings:
          await getOrganizationSettings(
            req.context
              .organizationId
          ),
      });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


router.patch(
  "/",

  requirePermission(
    PERMISSIONS
      .TENANT_SETTINGS_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        settings:
          await updateOrganizationSettings({
            organizationId:
              req.context
                .organizationId,

            actorUserId:
              req.context
                .userId,

            updates:
              req.body ||
              {},
          }),
      });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


router.get(
  "/environments/:environmentId",

  requirePermission(
    PERMISSIONS
      .AUTONOMY_READ,
    {
      requireEnvironment:
        false,
    }
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        settings:
          await getEnvironmentSettings({
            organizationId:
              req.context
                .organizationId,

            environmentId:
              req.params
                .environmentId,
          }),
      });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


router.patch(
  "/environments/:environmentId",

  requirePermission(
    PERMISSIONS
      .AUTONOMY_MANAGE,
    {
      requireEnvironment:
        false,
    }
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        settings:
          await updateEnvironmentSettings({
            organizationId:
              req.context
                .organizationId,

            environmentId:
              req.params
                .environmentId,

            actorUserId:
              req.context
                .userId,

            updates:
              req.body ||
              {},
          }),
      });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


router.get(
  "/environments/:environmentId/effective",

  requirePermission(
    PERMISSIONS
      .AUTONOMY_READ,
    {
      requireEnvironment:
        false,
    }
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        settings:
          await getEffectiveSettings({
            organizationId:
              req.context
                .organizationId,

            environmentId:
              req.params
                .environmentId,
          }),
      });
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