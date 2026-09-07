"use strict";

/**
 * ============================================================================
 * AIRA PHASE 25
 * AUTHORITATIVE PRODUCT CONTEXT ROUTE
 * ============================================================================
 *
 * Workspace ProductContext requires:
 *
 * authenticated session
 *      ↓
 * active organization
 *      ↓
 * VERIFIED USER EMAIL
 *      ↓
 * canonical membership / role
 *      ↓
 * canonical permissions
 *      ↓
 * authoritative environment
 *
 * Verification itself grants no authorization.
 * ============================================================================
 */

const express =
  require(
    "express"
  );


const {
  buildProductContext,
} =
  require(
    "../services/product/productContextService"
  );


const {
  getServerRequestContext,
} =
  require(
    "../services/product/productRouteContext"
  );


function sendRouteError(
  res,
  error
) {
  const status =
    Number.isInteger(
      error?.status
    )
      ? error.status
      : 500;


  return res
    .status(
      status
    )
    .json({
      success:
        false,

      error: {
        code:
          error?.code ||
          "PRODUCT_CONTEXT_FAILED",

        message:
          status >=
          500
            ? "Unable to resolve product context"
            : error?.message ||
              "Unable to resolve product context",
      },

      executionAuthorized:
        false,
    });
}


function requireVerifiedIdentity(
  serverContext
) {
  const user =
    serverContext
      ?.user;


  if (
    !user
  ) {
    const error =
      new Error(
        "Authenticated user context is required"
      );

    error.status =
      401;

    error.code =
      "PRODUCT_USER_CONTEXT_REQUIRED";

    throw error;
  }


  if (
    !user
      .emailVerifiedAt
  ) {
    const error =
      new Error(
        "Email verification is required before entering the AIRA workspace"
      );

    error.status =
      403;

    error.code =
      "EMAIL_VERIFICATION_REQUIRED";

    error.executionAuthorized =
      false;

    throw error;
  }
}


function createProductContextRouter(
  options = {}
) {
  const router =
    express.Router();


  const preHandlers =
    Array.isArray(
      options.preHandlers
    )
      ? options.preHandlers
      : [];


  router.get(
    "/",

    ...preHandlers,

    async (
      req,
      res
    ) => {
      try {
        const serverContext =
          getServerRequestContext(
            req
          );


        /*
         * Registration may create a valid session before verification,
         * but normal workspace ProductContext is unavailable until verified.
         */
        requireVerifiedIdentity(
          serverContext
        );


        const context =
          buildProductContext(
            serverContext
          );


        return res
          .status(
            200
          )
          .json({
            success:
              true,

            data:
              context,

            executionAuthorized:
              false,
          });
      } catch (
        error
      ) {
        return sendRouteError(
          res,
          error
        );
      }
    }
  );


  return router;
}


module.exports = {
  createProductContextRouter,

  sendRouteError,

  requireVerifiedIdentity,
};