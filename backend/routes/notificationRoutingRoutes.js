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
  listChannels,
  createChannel,
  updateChannel,

  listRules,
  createRule,
  updateRule,
} =
  require(
    "../services/notifications/notificationRoutingService"
  );


const router =
  express.Router();


router.get(
  "/channels",

  requirePermission(
    PERMISSIONS
      .NOTIFICATION_ROUTE_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        channels:
          await listChannels(
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


router.post(
  "/channels",

  requirePermission(
    PERMISSIONS
      .NOTIFICATION_ROUTE_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res
        .status(
          201
        )
        .json({
          channel:
            await createChannel({
              organizationId:
                req.context
                  .organizationId,

              actorUserId:
                req.context
                  .userId,

              ...(
                req.body ||
                {}
              ),
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
  "/channels/:channelId",

  requirePermission(
    PERMISSIONS
      .NOTIFICATION_ROUTE_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        channel:
          await updateChannel({
            organizationId:
              req.context
                .organizationId,

            channelId:
              req.params
                .channelId,

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
  "/rules",

  requirePermission(
    PERMISSIONS
      .NOTIFICATION_ROUTE_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        rules:
          await listRules(
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


router.post(
  "/rules",

  requirePermission(
    PERMISSIONS
      .NOTIFICATION_ROUTE_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res
        .status(
          201
        )
        .json({
          rule:
            await createRule({
              organizationId:
                req.context
                  .organizationId,

              actorUserId:
                req.context
                  .userId,

              ...(
                req.body ||
                {}
              ),
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
  "/rules/:ruleId",

  requirePermission(
    PERMISSIONS
      .NOTIFICATION_ROUTE_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        rule:
          await updateRule({
            organizationId:
              req.context
                .organizationId,

            ruleId:
              req.params
                .ruleId,

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


module.exports =
  router;