"use strict";


/**
 * ============================================================================
 * AIRA PHASE 23.7
 * INCIDENT COMMAND API
 * ============================================================================
 *
 * Mounted at:
 *
 * /api/v1/incidents/:incidentId/command
 *
 * ============================================================================
 */


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


const incidentCommandService =
  require(
    "../services/humanOperations/incidentCommandService"
  );


const router =
  express.Router({
    mergeParams:
      true,
  });


function commandScope(
  req
) {
  return {
    organizationId:
      req.context
        ?.organizationId,

    environmentId:
      req.context
        ?.environmentId,

    incidentId:
      req.params
        .incidentId,

    actorUserId:
      req.context
        ?.userId,
  };
}


/*
 * ============================================================================
 * READ MODEL
 * ============================================================================
 */


router.get(
  "/",

  requirePermission(
    PERMISSIONS
      .HUMAN_TASK_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        command:
          await incidentCommandService
            .get(
              commandScope(
                req
              )
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


/*
 * ============================================================================
 * ACKNOWLEDGE
 * ============================================================================
 */


router.post(
  "/acknowledge",

  requirePermission(
    PERMISSIONS
      .HUMAN_TASK_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json(
        await incidentCommandService
          .acknowledge({
            ...commandScope(
              req
            ),

            taskId:
              req.body
                ?.taskId,
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


/*
 * ============================================================================
 * TAKE CONTROL — REQUEST
 * ============================================================================
 */


router.post(
  "/take-control/request",

  requirePermission(
    PERMISSIONS
      .HUMAN_TASK_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json(
        await incidentCommandService
          .requestControl({
            ...commandScope(
              req
            ),

            taskId:
              req.body
                ?.taskId,

            reason:
              req.body
                ?.reason ||
              null,

            sessionExpiresAt:
              req.body
                ?.sessionExpiresAt ||
              null,

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


/*
 * ============================================================================
 * TAKE CONTROL — AUTHORIZE
 * ============================================================================
 */


router.post(
  "/take-control/authorize",

  requirePermission(
    PERMISSIONS
      .HUMAN_TASK_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json(
        await incidentCommandService
          .authorizeControl({
            ...commandScope(
              req
            ),

            sessionId:
              req.body
                ?.sessionId,

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


/*
 * ============================================================================
 * TAKE CONTROL — ACQUIRE
 * ============================================================================
 */


router.post(
  "/take-control/acquire",

  requirePermission(
    PERMISSIONS
      .HUMAN_TASK_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json(
        await incidentCommandService
          .acquireControl({
            ...commandScope(
              req
            ),

            sessionId:
              req.body
                ?.sessionId,

            leaseDurationMs:
              req.body
                ?.leaseDurationMs,

            expiresAt:
              req.body
                ?.expiresAt,

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


/*
 * ============================================================================
 * TAKE CONTROL — HEARTBEAT
 * ============================================================================
 */


router.post(
  "/take-control/heartbeat",

  requirePermission(
    PERMISSIONS
      .HUMAN_TASK_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json(
        await incidentCommandService
          .heartbeatControl({
            ...commandScope(
              req
            ),

            leaseId:
              req.body
                ?.leaseId,

            extensionMs:
              req.body
                ?.extensionMs,
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


/*
 * ============================================================================
 * RETURN CONTROL
 * ============================================================================
 */


router.post(
  "/return-control",

  requirePermission(
    PERMISSIONS
      .HUMAN_TASK_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json(
        await incidentCommandService
          .returnControl({
            ...commandScope(
              req
            ),

            leaseId:
              req.body
                ?.leaseId,

            reason:
              req.body
                ?.reason ||
              null,

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


module.exports =
  router;