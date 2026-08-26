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
  listTasks,
  requireTask,

  createTask,
  assignTask,
  acknowledgeTask,
  resolveTask,
  cancelTask,
  escalateTask,
} =
  require(
    "../services/humanOperations/humanTaskService"
  );


const router =
  express.Router();


function scope(
  req
) {
  return {
    organizationId:
      req.context
        .organizationId,

    environmentId:
      req.context
        .environmentId,
  };
}


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
        tasks:
          await listTasks({
            ...scope(
              req
            ),

            status:
              req.query
                ?.status ||
              null,
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
  "/:taskId",

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
        task:
          await requireTask({
            ...scope(
              req
            ),

            taskId:
              req.params
                .taskId,
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


router.post(
  "/",

  requirePermission(
    PERMISSIONS
      .HUMAN_TASK_CREATE
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
          task:
            await createTask({
              ...scope(
                req
              ),

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


router.post(
  "/:taskId/assign",

  requirePermission(
    PERMISSIONS
      .HUMAN_TASK_ASSIGN
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        task:
          await assignTask({
            ...scope(
              req
            ),

            taskId:
              req.params
                .taskId,

            actorUserId:
              req.context
                .userId,

            assignedUserId:
              req.body
                ?.assignedUserId ||
              null,

            assignedTeamId:
              req.body
                ?.assignedTeamId ||
              null,
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


router.post(
  "/:taskId/acknowledge",

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
      res.json({
        task:
          await acknowledgeTask({
            ...scope(
              req
            ),

            taskId:
              req.params
                .taskId,

            actorUserId:
              req.context
                .userId,
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


router.post(
  "/:taskId/resolve",

  requirePermission(
    PERMISSIONS
      .HUMAN_TASK_RESOLVE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        task:
          await resolveTask({
            ...scope(
              req
            ),

            taskId:
              req.params
                .taskId,

            actorUserId:
              req.context
                .userId,

            resolution:
              req.body
                ?.resolution ||
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


router.post(
  "/:taskId/cancel",

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
      res.json({
        task:
          await cancelTask({
            ...scope(
              req
            ),

            taskId:
              req.params
                .taskId,

            actorUserId:
              req.context
                .userId,

            reason:
              req.body
                ?.reason ||
              null,
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


router.post(
  "/:taskId/escalate",

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
      res.json({
        task:
          await escalateTask({
            ...scope(
              req
            ),

            taskId:
              req.params
                .taskId,

            actorUserId:
              req.context
                .userId,

            priority:
              req.body
                ?.priority ||
              "CRITICAL",
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