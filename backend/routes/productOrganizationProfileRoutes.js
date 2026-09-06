"use strict";

/**
 * ============================================================================
 * AIRA PHASE 25.2B
 * ORGANIZATION PROFILE API
 * ============================================================================
 *
 * GET /
 *     Returns company/product profile for current authenticated organization.
 *
 * PUT /
 *     Updates company/product profile for current authenticated organization.
 *
 * IMPORTANT
 *
 * Organization identity does NOT come from:
 *
 * req.body.organizationId
 * req.query.organizationId
 * req.body.tenantId
 * req.body.environmentId
 *
 * Scope comes exclusively from authenticated server request context.
 *
 * This router remains unregistered until Phase 25 final server integration.
 * ============================================================================
 */

const express =
  require(
    "express"
  );


const {
  OrganizationProfileService,
} =
  require(
    "../services/product/organizationProfileService"
  );


const {
  getServerRequestContext,
  requireProductEnvironment,
  rejectClientTenantAuthority,
} =
  require(
    "../services/product/productRouteContext"
  );


function sendProfileError(
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
          "ORGANIZATION_PROFILE_REQUEST_FAILED",

        message:
          status >= 500
            ? "Organization profile request failed"
            : error?.message ||
              "Organization profile request failed",
      },

      executionAuthorized:
        false,
    });
}


function createProductOrganizationProfileRouter(
  options = {}
) {
  const router =
    express.Router();


  const service =
    options.service ||
    new OrganizationProfileService(
      options.serviceOptions ||
      {}
    );


  const readPreHandlers =
    Array.isArray(
      options.readPreHandlers
    )
      ? options.readPreHandlers
      : [];


  const writePreHandlers =
    Array.isArray(
      options.writePreHandlers
    )
      ? options.writePreHandlers
      : [];


  /*
   * GET
   *
   * Permission middleware will be injected at final server integration.
   */
  router.get(
    "/",

    ...readPreHandlers,

    async (
      req,
      res
    ) => {
      try {
        rejectClientTenantAuthority(
          req
        );


        const context =
          requireProductEnvironment(
            getServerRequestContext(
              req
            )
          );


        const profile =
          await service
            .getProfile({
              organizationId:
                context
                  .organizationId,

              environmentId:
                context
                  .environmentId,
            });


        return res
          .status(
            200
          )
          .json({
            success:
              true,

            data: {
              profile,
            },

            executionAuthorized:
              false,
          });
      } catch (
        error
      ) {
        return sendProfileError(
          res,
          error
        );
      }
    }
  );


  /*
   * PUT
   *
   * IMPORTANT:
   *
   * writePreHandlers MUST contain the canonical backend authorization
   * middleware when this router is mounted.
   *
   * We intentionally do not embed a made-up Phase 25 permission string here.
   *
   * During final server integration we will map this action onto the repo's
   * authoritative permission registry rather than creating parallel auth.
   */
  router.put(
    "/",

    ...writePreHandlers,

    async (
      req,
      res
    ) => {
      try {
        rejectClientTenantAuthority(
          req
        );


        const context =
          requireProductEnvironment(
            getServerRequestContext(
              req
            )
          );


        const profile =
          await service
            .upsertProfile({
              organizationId:
                context
                  .organizationId,

              environmentId:
                context
                  .environmentId,

              input:
                req.body ||
                {},
            });


        return res
          .status(
            200
          )
          .json({
            success:
              true,

            data: {
              profile,
            },

            executionAuthorized:
              false,
          });
      } catch (
        error
      ) {
        return sendProfileError(
          res,
          error
        );
      }
    }
  );


  return router;
}


module.exports = {
  createProductOrganizationProfileRouter,

  sendProfileError,
};