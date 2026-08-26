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

const integrationOwnershipMiddleware =
  require(
    "../middleware/integrationOwnershipMiddleware"
  );

const {
  getGovernance,
  upsertGovernance,
} =
  require(
    "../services/integrations/integrationGovernanceService"
  );


const router =
  express.Router();


router.get(
  "/:integrationId",

  integrationOwnershipMiddleware,

  requirePermission(
    PERMISSIONS
      .INTEGRATION_GOVERNANCE_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        governance:
          await getGovernance({
            organizationId:
              req.integrationScope
                .organizationId,

            environmentId:
              req.integrationScope
                .environmentId,

            integrationId:
              req.params
                .integrationId,
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


router.put(
  "/:integrationId",

  integrationOwnershipMiddleware,

  requirePermission(
    PERMISSIONS
      .INTEGRATION_GOVERNANCE_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        governance:
          await upsertGovernance({
            organizationId:
              req.integrationScope
                .organizationId,

            environmentId:
              req.integrationScope
                .environmentId,

            integrationId:
              req.params
                .integrationId,

            provider:
              req.body
                ?.provider ||
              null,

            actorUserId:
              req.context
                .userId,

            settings:
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


module.exports =
  router;