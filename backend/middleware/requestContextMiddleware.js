"use strict";

const {
  resolvePermissions,
} = require(
  "../services/identity/authorizationService"
);

/**
 * ============================================================================
 * CANONICAL AIRA REQUEST CONTEXT
 * ============================================================================
 *
 * Authentication middleware MUST run before this middleware.
 *
 * The goal is to provide one stable request-level identity and authorization
 * model regardless of whether authentication was performed using:
 *
 * - browser session
 * - machine credentials
 * - future API keys
 * - future service accounts
 * - future workload identities
 *
 * Phase 14 introduces canonical `permissions` into this context.
 */

function normalizeId(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }

  return value
    .toString();
}

function requestContextMiddleware(
  req,
  res,
  next
) {
  try {
    /**
     * Authentication must already have produced req.auth.
     */
    if (
      !req.auth
    ) {
      return res
        .status(
          401
        )
        .json({
          error:
            "Not authenticated",

          code:
            "NOT_AUTHENTICATED",
        });
    }

    const auth =
      req.auth;

    /**
     * All Phase 14 organization-scoped requests require an active
     * organization.
     *
     * Service-account/API-key identity support added later will still resolve
     * an organization before reaching this middleware.
     */
    if (
      !auth
        .organizationId
    ) {
      return res
        .status(
          403
        )
        .json({
          error:
            "No active organization",

          code:
            "NO_ACTIVE_ORGANIZATION",
        });
    }

    /**
     * Resolve fine-grained permissions once at request-context creation.
     *
     * For existing browser sessions this is currently:
     *
     * membership.role
     *      ↓
     * default role bundle
     *      ↓
     * permissions[]
     *
     * Later custom roles / service accounts / API keys can provide explicit
     * auth.permissions without forcing downstream services to change.
     */
    const permissions =
      resolvePermissions({
        role:
          auth.role ||
          null,

        permissions:
          Array.isArray(
            auth.permissions
          )
            ? auth.permissions
            : [],
      });

    req.context = {
      /**
       * ----------------------------------------------------------------------
       * AUTHENTICATION IDENTITY
       * ----------------------------------------------------------------------
       */

      authenticationType:
        auth
          .authenticationType ||
        null,

      userId:
        normalizeId(
          auth.userId
        ),

      sessionId:
        normalizeId(
          auth.sessionId
        ),

      /**
       * ----------------------------------------------------------------------
       * TENANT IDENTITY
       * ----------------------------------------------------------------------
       */

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

      /**
       * ----------------------------------------------------------------------
       * AUTHORIZATION
       * ----------------------------------------------------------------------
       */

      /**
       * Retained for compatibility and UI display.
       *
       * New authorization decisions should consume permissions rather than
       * inspecting role directly.
       */
      role:
        auth.role ||
        null,

      /**
       * Canonical Phase 14 authorization capabilities.
       */
      permissions,

      assuranceLevel:
        auth
          .assuranceLevel ||
        null,

      /**
       * Existing legacy machine scopes are deliberately kept separate.
       *
       * They are NOT automatically promoted to enterprise permissions.
       */
      scopes:
        Array.isArray(
          auth.scopes
        )
          ? [
              ...auth.scopes,
            ]
          : [],

      machineKeyId:
        auth
          .machineKeyId ||
        null,

      /**
       * ----------------------------------------------------------------------
       * ENVIRONMENT CONTEXT
       * ----------------------------------------------------------------------
       *
       * environmentContextMiddleware resolves these after organization-level
       * request context exists.
       */

      environmentId:
        null,

      environment:
        null,

      /**
       * ----------------------------------------------------------------------
       * REQUEST CORRELATION
       * ----------------------------------------------------------------------
       */

      requestId:
        req.correlationId ||
        req.headers[
          "x-request-id"
        ] ||
        null,

      /**
       * ----------------------------------------------------------------------
       * INTERNAL REFERENCES
       * ----------------------------------------------------------------------
       *
       * These references are available for downstream middleware/services.
       *
       * NEVER serialize req.context directly to API clients.
       */

      user:
        auth._user ||
        null,

      organization:
        auth
          ._organization ||
        null,

      membership:
        auth
          ._membership ||
        null,
    };

    return next();
  } catch (
    error
  ) {
    console.error(
      "[request-context] Failed to build request context:",
      error.message
    );

    return res
      .status(
        500
      )
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