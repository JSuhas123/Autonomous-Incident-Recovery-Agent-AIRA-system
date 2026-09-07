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


const productNotificationService =
  require(
    "../services/product/productNotificationService"
  );


const router =
  express.Router();


function context(
  req
) {
  const organizationId =
    req.context
      ?.organizationId;


  const environmentId =
    req.context
      ?.environmentId;


  const userId =
    req.context
      ?.userId;


  const membershipId =
    req.context
      ?.membershipId;


  if (
    !organizationId ||
    !environmentId ||
    !userId ||
    !membershipId
  ) {
    const error =
      new Error(
        "Complete product notification context is required"
      );


    error.status =
      400;


    error.code =
      "PRODUCT_NOTIFICATION_CONTEXT_REQUIRED";


    error.executionAuthorized =
      false;


    throw error;
  }


  return {
    organizationId,
    environmentId,
    userId,
    membershipId,
  };
}


function response(
  res,
  data
) {
  return res.json({
    success:
      true,

    data,

    executionAuthorized:
      false,
  });
}


// ============================================================================
// LIST
// ============================================================================

router.get(
  "/",

  requirePermission(
    PERMISSIONS
      .NOTIFICATION_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      return response(
        res,

        await productNotificationService
          .list({
            ...context(
              req
            ),

            unreadOnly:
              req.query
                ?.unread ===
              "true",

            kind:
              req.query
                ?.kind ||
              null,

            limit:
              req.query
                ?.limit ||
              50,
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


// ============================================================================
// SUMMARY / BADGE
// ============================================================================

router.get(
  "/summary",

  requirePermission(
    PERMISSIONS
      .NOTIFICATION_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      return response(
        res,

        await productNotificationService
          .summary(
            context(
              req
            )
          )
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


// ============================================================================
// MARK ONE READ
//
// READ != INCIDENT ACKNOWLEDGEMENT
// ============================================================================

router.post(
  "/:notificationId/read",

  requirePermission(
    PERMISSIONS
      .NOTIFICATION_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      return response(
        res,

        await productNotificationService
          .markRead({
            ...context(
              req
            ),

            notificationId:
              req.params
                .notificationId,
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


// ============================================================================
// MARK ALL READ
// ============================================================================

router.post(
  "/read-all",

  requirePermission(
    PERMISSIONS
      .NOTIFICATION_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      return response(
        res,

        await productNotificationService
          .markAllRead(
            context(
              req
            )
          )
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


// ============================================================================
// DISMISS
// ============================================================================

router.post(
  "/:notificationId/dismiss",

  requirePermission(
    PERMISSIONS
      .NOTIFICATION_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      return response(
        res,

        await productNotificationService
          .dismiss({
            ...context(
              req
            ),

            notificationId:
              req.params
                .notificationId,
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