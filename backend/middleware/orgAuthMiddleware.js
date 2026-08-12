"use strict";

const {
  record: auditRecord,
} = require(
  "../services/identity/identityAuditService"
);

const {
  AUTH_EVENT_TYPES,
  AUTH_EVENT_OUTCOMES,
} = require(
  "../constants/authEvents"
);

/**
 * Enforce access to legacy browser routes containing:
 *
 * /tenants/:tenantId/...
 *
 * sessionAuthMiddleware MUST run before this middleware.
 *
 * The authenticated session has already validated:
 *
 * - user
 * - organization
 * - membership
 * - organization status
 * - membership status
 *
 * Therefore this middleware does not query those records again.
 *
 * Its responsibility is to bind the URL tenant to the already
 * authenticated organization and optionally enforce a role.
 */
function requireOrgAccess(
  allowedRoles = null
) {
  return async function orgAuthMiddleware(
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

      const tenantIdFromUrl =
        req.params.tenantId;

      if (!tenantIdFromUrl) {
        return res
          .status(400)
          .json({
            error:
              "Missing tenantId",

            code:
              "MISSING_TENANT_ID",
          });
      }

      /*
       * sessionAuthMiddleware already validated the active
       * organization and membership.
       *
       * Browser tenant routes must NEVER use the URL value
       * to switch organizations.
       */
      const authenticatedTenantId =
        req.auth.tenantId;

      const authenticatedOrganization =
        req.auth._organization;

      const authenticatedMembership =
        req.auth._membership;

      if (
        !authenticatedTenantId ||
        !authenticatedOrganization ||
        !authenticatedMembership
      ) {
        return res
          .status(403)
          .json({
            error:
              "Organization access denied",

            code:
              "ORGANIZATION_ACCESS_DENIED",
          });
      }

      /*
       * Cross-tenant URL substitution attempt.
       *
       * Return 404 rather than describing whether the requested
       * tenant actually exists. This avoids tenant enumeration.
       */
      if (
        authenticatedTenantId !==
        tenantIdFromUrl
      ) {
        try {
          await auditRecord(
            AUTH_EVENT_TYPES
              .PERMISSION_DENIED,

            AUTH_EVENT_OUTCOMES
              .DENIED,

            {
              userId:
                req.auth.userId,

              organizationId:
                req.auth
                  .organizationId,

              reasonCode:
                "CROSS_TENANT_ACCESS",

              metadata: {
                requestedTenant:
                  tenantIdFromUrl,

                sessionTenant:
                  authenticatedTenantId,
              },
            }
          );
        } catch (auditError) {
          /*
           * Authorization must not fail open or become unavailable
           * simply because audit persistence is temporarily failing.
           */
          console.error(
            "[org-auth] Failed to record cross-tenant denial:",
            auditError.message
          );
        }

        return res
          .status(404)
          .json({
            error:
              "Resource not found",

            code:
              "RESOURCE_NOT_FOUND",
          });
      }

      /*
       * Defensive consistency check.
       *
       * The validated organization's tenant ID must match
       * the authenticated tenant ID.
       */
      if (
        authenticatedOrganization
          .tenantId !==
        authenticatedTenantId
      ) {
        console.error(
          "[org-auth] Session organization/tenant mismatch",
          {
            organizationId:
              authenticatedOrganization
                ._id
                ?.toString(),

            organizationTenantId:
              authenticatedOrganization
                .tenantId,

            authenticatedTenantId,
          }
        );

        return res
          .status(403)
          .json({
            error:
              "Organization access denied",

            code:
              "ORGANIZATION_CONTEXT_MISMATCH",
          });
      }

      /*
       * Optional coarse role enforcement.
       *
       * Fine-grained enterprise permissions are intentionally
       * deferred until the Identity/RBAC phase.
       */
      if (
        Array.isArray(
          allowedRoles
        ) &&
        allowedRoles.length >
          0 &&
        !allowedRoles.includes(
          authenticatedMembership
            .role
        )
      ) {
        try {
          await auditRecord(
            AUTH_EVENT_TYPES
              .PERMISSION_DENIED,

            AUTH_EVENT_OUTCOMES
              .DENIED,

            {
              userId:
                req.auth.userId,

              organizationId:
                req.auth
                  .organizationId,

              reasonCode:
                "INSUFFICIENT_ROLE",

              metadata: {
                required:
                  allowedRoles,

                actual:
                  authenticatedMembership
                    .role,
              },
            }
          );
        } catch (auditError) {
          console.error(
            "[org-auth] Failed to record role denial:",
            auditError.message
          );
        }

        return res
          .status(403)
          .json({
            error:
              "Access denied",

            code:
              "INSUFFICIENT_ROLE",
          });
      }

      /*
       * Re-assert canonical values from the already validated
       * organization/membership rather than trusting the URL.
       */
      req.auth.organizationId =
        authenticatedOrganization
          ._id;

      req.auth.tenantId =
        authenticatedOrganization
          .tenantId;

      req.auth.membershipId =
        authenticatedMembership
          ._id;

      req.auth.role =
        authenticatedMembership
          .role;

      return next();
    } catch (error) {
      console.error(
        "[org-auth] Middleware error:",
        error.message
      );

      return next(error);
    }
  };
}

module.exports = {
  requireOrgAccess,
};