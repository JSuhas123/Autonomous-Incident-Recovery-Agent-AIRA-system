"use strict";

/**
 * ============================================================================
 * AIRA PHASE 25.2B
 * PRODUCT CONTEXT ROUTES
 * ============================================================================
 *
 * This router is intentionally NOT registered in server.js yet.
 *
 * Final server integration happens during Phase 25.15.
 *
 * Route contract:
 *
 * GET /
 *
 * When mounted at:
 *
 *   /api/v1/product/context
 *
 * returns the authoritative product context for the authenticated request.
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
          status >= 500
            ? "Unable to resolve product context"
            : error?.message ||
              "Unable to resolve product context",
      },

      executionAuthorized:
        false,
    });
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
};