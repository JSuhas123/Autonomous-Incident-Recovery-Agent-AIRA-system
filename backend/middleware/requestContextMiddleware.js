"use strict";

/**
 * Canonical AIRA request context.
 *
 * Authentication middleware MUST run before this middleware.
 *
 * The goal is to provide one stable request-level identity
 * model regardless of whether authentication was performed
 * using a browser session or machine credentials.
 */

function normalizeId(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  return value.toString();
}

function requestContextMiddleware(
  req,
  res,
  next
) {
  try {
    if (!req.auth) {
      return res
        .status(401)
        .json({
          error:
            "Not authenticated",

          code:
            "NOT_AUTHENTICATED",
        });
    }

    const auth =
      req.auth;

    if (
      !auth.organizationId
    ) {
      return res
        .status(403)
        .json({
          error:
            "No active organization",

          code:
            "NO_ACTIVE_ORGANIZATION",
        });
    }

    req.context = {
      authenticationType:
        auth.authenticationType ||
        null,

      userId:
        normalizeId(
          auth.userId
        ),

      sessionId:
        normalizeId(
          auth.sessionId
        ),

      organizationId:
        normalizeId(
          auth.organizationId
        ),

      tenantId:
        auth.tenantId ||
        null,

      membershipId:
        normalizeId(
          auth.membershipId
        ),

      role:
        auth.role ||
        null,

      assuranceLevel:
        auth.assuranceLevel ||
        null,

      scopes:
        Array.isArray(
          auth.scopes
        )
          ? [...auth.scopes]
          : [],

      machineKeyId:
        auth.machineKeyId ||
        null,

      /*
       * Environment is resolved by
       * environmentContextMiddleware.
       */
      environmentId:
        null,

      environment:
        null,

      /*
       * Prefer AIRA's existing correlation ID.
       */
      requestId:
        req.correlationId ||
        req.headers[
          "x-request-id"
        ] ||
        null,

      /*
       * Internal references.
       *
       * NEVER serialize req.context directly.
       */
      user:
        auth._user ||
        null,

      organization:
        auth._organization ||
        null,

      membership:
        auth._membership ||
        null,
    };

    return next();
  } catch (error) {
    console.error(
      "[request-context] Failed to build request context:",
      error.message
    );

    return res
      .status(500)
      .json({
        error:
          "Request context initialization failed",

        code:
          "REQUEST_CONTEXT_ERROR",
      });
  }
}

module.exports = {
  requestContextMiddleware,
};