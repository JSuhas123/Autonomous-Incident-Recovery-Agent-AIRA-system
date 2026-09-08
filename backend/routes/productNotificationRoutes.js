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


const productNotificationPrincipalResolver =
  require(
    "../services/product/productNotificationPrincipalResolver"
  );


const router =
  express.Router();


function applicationContext(
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


async function canonicalContext(
  req
) {
  const context =
    applicationContext(
      req
    );


  const principal =
    await productNotificationPrincipalResolver
      .resolve(
        context
      );


  /*
   * productNotificationService already enters PostgresTenantScope.
   *
   * Passing physical organization/environment UUIDs is supported because
   * PostgresIdentityResolver resolves UUIDs as well as public/legacy IDs.
   *
   * Most importantly:
   *
   * userId and membershipId are now physical PostgreSQL UUIDs required by:
   *
   * identity.users(id)
   * identity.organization_memberships(id)
   * tenancy.team_memberships(membership_id)
   * product.notification_receipts(user_id)
   */
  return {
    organizationId:
      principal.organizationId,

    environmentId:
      principal.environmentId,

    userId:
      principal.userId,

    membershipId:
      principal.membershipId,
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
      const context =
        await canonicalContext(
          req
        );


      return response(
        res,

        await productNotificationService
          .list({
            ...context,

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
            await canonicalContext(
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
// PRODUCT READ STATE
//
// != INCIDENT ACKNOWLEDGEMENT
// != HUMAN TASK ACKNOWLEDGEMENT
// != APPROVAL
// != AUTHORIZATION
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
      const context =
        await canonicalContext(
          req
        );


      return response(
        res,

        await productNotificationService
          .markRead({
            ...context,

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
            await canonicalContext(
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
      const context =
        await canonicalContext(
          req
        );


      return response(
        res,

        await productNotificationService
          .dismiss({
            ...context,

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