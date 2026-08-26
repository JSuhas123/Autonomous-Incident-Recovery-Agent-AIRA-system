"use strict";

const {
  isKnownPermission,
} =
  require(
    "../constants/permissions"
  );

const {
  permissionRequiresEnvironment,
} =
  require(
    "../constants/permissionScopes"
  );

const {
  principalFromRequest,
} =
  require(
    "../services/identity/principalService"
  );

const {
  authorize,
} =
  require(
    "../services/identity/centralAuthorizationService"
  );

const {
  AuthorizationError,
  can,
} =
  require(
    "../services/identity/authorizationService"
  );

const {
  recordAuthorizationDecision,
} =
  require(
    "../services/identity/authorizationDecisionAuditService"
  );


// ============================================================================
// CONSTANTS
// ============================================================================

const AUTHORIZATION_MODE =
  Object.freeze({
    SINGLE:
      "SINGLE",

    ALL:
      "ALL",

    ANY:
      "ANY",
  });


// ============================================================================
// HELPERS
// ============================================================================

function normalizePermissionList(
  permissions
) {
  if (
    !Array.isArray(
      permissions
    )
  ) {
    return [];
  }

  return [
    ...new Set(
      permissions
        .map(
          (permission) =>
            typeof permission ===
              "string"
              ? permission.trim()
              : ""
        )
        .filter(
          Boolean
        )
    ),
  ];
}


function normalizeId(
  value
) {
  if (
    value == null
  ) {
    return null;
  }

  const normalized =
    String(
      value
        ?.toString?.() ??
      value
    ).trim();

  return normalized ||
    null;
}


// ============================================================================
// PRINCIPAL RESOLUTION
// ============================================================================

function resolveRequestPrincipal(
  req
) {
  // --------------------------------------------------------------------------
  // Already normalized
  // --------------------------------------------------------------------------

  if (
    req.principal &&
    typeof req.principal ===
      "object"
  ) {
    return req.principal;
  }


  // --------------------------------------------------------------------------
  // Service account
  // --------------------------------------------------------------------------

  const hasServiceAccountIdentity =
    Boolean(
      req.actor
        ?.serviceAccountId ||
      req.context
        ?.serviceAccountId
    );

  if (
    hasServiceAccountIdentity
  ) {
    const principal =
      principalFromRequest(
        req
      );

    req.principal =
      principal;

    return principal;
  }


  // --------------------------------------------------------------------------
  // Fully authenticated user
  // --------------------------------------------------------------------------

  const canonicalUserId =
    req.context
      ?.userId ||
    req.auth
      ?.userId ||
    null;

  const canonicalOrganizationId =
    req.context
      ?.organizationId ||
    req.auth
      ?.organizationId ||
    null;

  if (
    canonicalUserId &&
    canonicalOrganizationId
  ) {
    const principal =
      principalFromRequest(
        req
      );

    req.principal =
      principal;

    return principal;
  }


  // --------------------------------------------------------------------------
  // Phase 14.1 compatibility principal
  // --------------------------------------------------------------------------

  const auth =
    req.auth &&
    typeof req.auth ===
      "object"
      ? req.auth
      : {};

  const context =
    req.context &&
    typeof req.context ===
      "object"
      ? req.context
      : {};

  const user =
    req.user &&
    typeof req.user ===
      "object"
      ? req.user
      : {};

  const role =
    auth.role ||
    context.role ||
    user.role ||
    null;

  const permissions =
    Array.isArray(
      auth.permissions
    )
      ? [
          ...auth.permissions,
        ]
      : Array.isArray(
          context.permissions
        )
        ? [
            ...context.permissions,
          ]
        : Array.isArray(
            user.permissions
          )
          ? [
              ...user.permissions,
            ]
          : [];

  const environmentIds =
    Array.isArray(
      auth.environmentIds
    )
      ? [
          ...auth.environmentIds,
        ]
      : Array.isArray(
          context.environmentIds
        )
        ? [
            ...context.environmentIds,
          ]
        : [];

  const organizationId =
    normalizeId(
      auth.organizationId ||
      context.organizationId ||
      user.organizationId ||
      null
    );

  const userId =
    normalizeId(
      auth.userId ||
      context.userId ||
      user.userId ||
      user.id ||
      user._id ||
      null
    );

  const actorId =
    normalizeId(
      auth.actorId ||
      context.actorId ||
      userId ||
      auth.membershipId ||
      context.membershipId ||
      null
    );

  const principal = {
    actorType:
      auth.actorType ||
      context.actorType ||
      "USER",

    actorId,

    userId,

    serviceAccountId:
      null,

    organizationId,

    role,

    permissions,

    environmentIds,

    authenticationType:
      auth.authenticationType ||
      context.authenticationType ||
      "LEGACY",
  };

  req.principal =
    principal;

  return principal;
}


// ============================================================================
// SCOPE RESOLUTION
// ============================================================================

function resolveOrganizationId(
  req,
  principal
) {
  return normalizeId(
    req.context
      ?.organizationId ||

    req.auth
      ?.organizationId ||

    principal
      ?.organizationId ||

    null
  );
}


function resolveEnvironmentId(
  req
) {
  return normalizeId(
    req.context
      ?.environmentId ||

    req.params
      ?.environmentId ||

    null
  );
}


function resolveRequireEnvironment(
  permission,
  options =
    {}
) {
  if (
    typeof options
      .requireEnvironment ===
      "boolean"
  ) {
    return options
      .requireEnvironment;
  }

  return permissionRequiresEnvironment(
    permission
  );
}


// ============================================================================
// ERROR
// ============================================================================

function createAuthorizationError({
  permission =
    null,

  requiredPermissions =
    null,

  organizationId =
    null,

  environmentId =
    null,

  reason =
    "PERMISSION_DENIED",
}) {
  const error =
    new AuthorizationError(
      "Insufficient permissions",
      {
        permission,

        requiredPermissions,

        organizationId,

        environmentId,
      }
    );

  error.reason =
    reason;

  error.executionAuthorized =
    false;

  return error;
}


// ============================================================================
// AUDIT
// ============================================================================

function auditDecision({
  req,
  principal,
  decision,
  permission =
    null,
  requiredPermissions =
    null,
}) {
  recordAuthorizationDecision({
    req,
    principal,
    decision,
    permission,
    requiredPermissions,
  }).catch(
    () => {}
  );
}


// ============================================================================
// LEGACY PERMISSION-ONLY MODE
// ============================================================================

function isLegacyPermissionOnlyPrincipal({
  principal,
  organizationId,
  requireEnvironment,
}) {
  return (
    !organizationId &&
    !requireEnvironment &&
    principal
      ?.authenticationType ===
      "LEGACY"
  );
}


// ============================================================================
// SINGLE PERMISSION
// ============================================================================

function requirePermission(
  permission,
  options =
    {}
) {
  if (
    !isKnownPermission(
      permission
    )
  ) {
    throw new Error(
      `Unknown permission declared in route: ${permission}`
    );
  }

  const requireEnvironment =
    resolveRequireEnvironment(
      permission,
      options
    );

  return async function permissionMiddleware(
    req,
    res,
    next
  ) {
    try {
      const principal =
        resolveRequestPrincipal(
          req
        );

      const organizationId =
        resolveOrganizationId(
          req,
          principal
        );

      const environmentId =
        resolveEnvironmentId(
          req
        );

      // ----------------------------------------------------------------------
      // Old Phase 14.1 permission-only compatibility
      // ----------------------------------------------------------------------

      if (
        isLegacyPermissionOnlyPrincipal({
          principal,
          organizationId,
          requireEnvironment,
        })
      ) {
        const allowed =
          can(
            principal,
            permission
          );

        const decision = {
          allowed,

          decision:
            allowed
              ? "ALLOW"
              : "DENY",

          reason:
            allowed
              ? null
              : "PERMISSION_DENIED",

          permission,

          actorType:
            principal
              ?.actorType ||
            null,

          actorId:
            principal
              ?.actorId ||
            null,

          organizationId:
            null,

          environmentId:
            null,

          executionAuthorized:
            allowed,
        };

        req.authorization = {
          ...decision,

          mode:
            AUTHORIZATION_MODE
              .SINGLE,
        };

        /**
         * Historical behavior:
         *
         * ALLOW did not emit an audit event.
         */
        if (
          allowed
        ) {
          return next();
        }

        auditDecision({
          req,
          principal,
          decision,
          permission,
        });

        return next(
          createAuthorizationError({
            permission,

            organizationId:
              null,

            environmentId:
              null,

            reason:
              decision.reason,
          })
        );
      }


      // ----------------------------------------------------------------------
      // Central authorization
      // ----------------------------------------------------------------------

      const decision =
        authorize({
          principal,

          permission,

          organizationId,

          environmentId,

          requireEnvironment,
        });

      req.authorization = {
        ...decision,

        mode:
          AUTHORIZATION_MODE
            .SINGLE,
      };

      auditDecision({
        req,
        principal,
        decision,
        permission,
      });

      if (
        decision.allowed
      ) {
        return next();
      }

      return next(
        createAuthorizationError({
          permission,

          organizationId,

          environmentId,

          reason:
            decision.reason,
        })
      );
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  };
}


// ============================================================================
// ALL PERMISSIONS
// ============================================================================

function requireAllPermissions(
  permissions,
  options =
    {}
) {
  const required =
    normalizePermissionList(
      permissions
    );

  if (
    required.length ===
    0
  ) {
    throw new Error(
      "requireAllPermissions requires at least one permission"
    );
  }

  for (
    const permission
    of required
  ) {
    if (
      !isKnownPermission(
        permission
      )
    ) {
      throw new Error(
        `Unknown permission declared in route: ${permission}`
      );
    }
  }

  return async function allPermissionsMiddleware(
    req,
    res,
    next
  ) {
    try {
      const principal =
        resolveRequestPrincipal(
          req
        );

      const organizationId =
        resolveOrganizationId(
          req,
          principal
        );

      const environmentId =
        resolveEnvironmentId(
          req
        );

      const decisions =
        required.map(
          (permission) =>
            authorize({
              principal,

              permission,

              organizationId,

              environmentId,

              requireEnvironment:
                resolveRequireEnvironment(
                  permission,
                  options
                ),
            })
        );

      const denied =
        decisions.find(
          (decision) =>
            !decision.allowed
        );

      if (
        !denied
      ) {
        const decision = {
          allowed:
            true,

          decision:
            "ALLOW",

          reason:
            null,

          organizationId,

          environmentId,

          executionAuthorized:
            true,
        };

        req.authorization = {
          ...decision,

          mode:
            AUTHORIZATION_MODE
              .ALL,

          permissions:
            required,
        };

        auditDecision({
          req,
          principal,
          decision,
          requiredPermissions:
            required,
        });

        return next();
      }

      req.authorization = {
        ...denied,

        mode:
          AUTHORIZATION_MODE
            .ALL,

        permissions:
          required,
      };

      auditDecision({
        req,
        principal,

        decision:
          denied,

        requiredPermissions:
          required,
      });

      return next(
        createAuthorizationError({
          requiredPermissions:
            required,

          organizationId,

          environmentId,

          reason:
            denied.reason,
        })
      );
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  };
}


// ============================================================================
// ANY PERMISSION
// ============================================================================

function requireAnyPermission(
  permissions,
  options =
    {}
) {
  const required =
    normalizePermissionList(
      permissions
    );

  if (
    required.length ===
    0
  ) {
    throw new Error(
      "requireAnyPermission requires at least one permission"
    );
  }

  for (
    const permission
    of required
  ) {
    if (
      !isKnownPermission(
        permission
      )
    ) {
      throw new Error(
        `Unknown permission declared in route: ${permission}`
      );
    }
  }

  return async function anyPermissionMiddleware(
    req,
    res,
    next
  ) {
    try {
      const principal =
        resolveRequestPrincipal(
          req
        );

      const organizationId =
        resolveOrganizationId(
          req,
          principal
        );

      const environmentId =
        resolveEnvironmentId(
          req
        );

      const decisions =
        required.map(
          (permission) =>
            authorize({
              principal,

              permission,

              organizationId,

              environmentId,

              requireEnvironment:
                resolveRequireEnvironment(
                  permission,
                  options
                ),
            })
        );

      const allowed =
        decisions.find(
          (decision) =>
            decision.allowed
        );

      if (
        allowed
      ) {
        req.authorization = {
          ...allowed,

          mode:
            AUTHORIZATION_MODE
              .ANY,

          permissions:
            required,
        };

        auditDecision({
          req,
          principal,

          decision:
            allowed,

          requiredPermissions:
            required,
        });

        return next();
      }

      const denied =
        decisions[0];

      req.authorization = {
        ...denied,

        mode:
          AUTHORIZATION_MODE
            .ANY,

        permissions:
          required,
      };

      auditDecision({
        req,
        principal,

        decision:
          denied,

        requiredPermissions:
          required,
      });

      return next(
        createAuthorizationError({
          requiredPermissions:
            required,

          organizationId,

          environmentId,

          reason:
            denied
              ?.reason ||
            "PERMISSION_DENIED",
        })
      );
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  };
}


// ============================================================================
// EXPLICIT SCOPE HELPERS
// ============================================================================

function requireEnvironmentPermission(
  permission
) {
  return requirePermission(
    permission,
    {
      requireEnvironment:
        true,
    }
  );
}


function requireOrganizationPermission(
  permission
) {
  return requirePermission(
    permission,
    {
      requireEnvironment:
        false,
    }
  );
}


// ============================================================================
// COMPATIBILITY
// ============================================================================

const requirePermissions =
  requireAllPermissions;

const requireAnyPermissions =
  requireAnyPermission;


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  AUTHORIZATION_MODE,

  resolveRequestPrincipal,

  resolveOrganizationId,

  resolveEnvironmentId,

  resolveRequireEnvironment,

  requirePermission,

  requireAllPermissions,

  requireAnyPermission,

  requireEnvironmentPermission,

  requireOrganizationPermission,

  requirePermissions,

  requireAnyPermissions,
};