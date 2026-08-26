"use strict";

const {
  isKnownPermission,
  normalizePermissions,
} = require(
  "../../constants/permissions"
);

const {
  getPermissionsForRole,
} = require(
  "../../constants/rolePermissions"
);


/**
 * ============================================================================
 * AUTHORIZATION ERROR
 * ============================================================================
 */

class AuthorizationError
  extends Error {
  constructor(
    message =
      "Insufficient permissions",

    details =
      {}
  ) {
    super(
      message
    );

    this.name =
      "AuthorizationError";

    this.status =
      403;

    this.code =
      "PERMISSION_DENIED";

    this.permission =
      details.permission ||
      null;

    this.requiredPermissions =
      Array.isArray(
        details.requiredPermissions
      )
        ? [
            ...details
              .requiredPermissions,
          ]
        : null;

    this.organizationId =
      details.organizationId ||
      null;

    this.environmentId =
      details.environmentId ||
      null;

    /**
     * Security-sensitive callers can rely on this being false.
     */
    this.executionAuthorized =
      false;
  }
}


/**
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

function normalizePermissionList(
  values
) {
  if (
    !Array.isArray(
      values
    )
  ) {
    return [];
  }

  return [
    ...new Set(
      values
        .filter(
          (
            value
          ) =>
            typeof value ===
              "string" &&
            value
              .trim()
              .length >
              0
        )
        .map(
          (
            value
          ) =>
            value.trim()
        )
    ),
  ];
}


/**
 * ============================================================================
 * RESOLVE EFFECTIVE PERMISSIONS
 * ============================================================================
 *
 * AIRA now supports both legacy and canonical principals.
 *
 * HUMAN PRINCIPAL
 *
 *   role
 *     +
 *   explicit permissions
 *     ↓
 *   effective permissions
 *
 * MACHINE PRINCIPAL
 *
 *   role = null
 *     +
 *   canonical explicit permissions
 *     ↓
 *   effective permissions
 *
 * SECURITY:
 *
 * - unknown roles resolve to zero role permissions
 * - unknown explicit permissions are discarded
 * - legacy scopes such as read:* / write:* are NOT promoted
 * - duplicate permissions are removed
 * ============================================================================
 */

function resolvePermissions(
  principal =
    {}
) {
  if (
    !principal ||
    typeof principal !==
      "object"
  ) {
    return [];
  }

  const rolePermissions =
    getPermissionsForRole(
      principal.role
    );

  const explicitPermissions =
    normalizePermissions(
      principal.permissions
    );

  return normalizePermissions([
    ...rolePermissions,
    ...explicitPermissions,
  ]);
}


/**
 * ============================================================================
 * CANONICAL PRINCIPAL PERMISSION RESOLUTION
 * ============================================================================
 *
 * Canonical principals already contain resolved permissions.
 *
 * However, we deliberately pass them through resolvePermissions() again:
 *
 * - canonical USER principals safely retain role + explicit permissions
 * - canonical SERVICE_ACCOUNT principals have role=null and therefore resolve
 *   only their explicit canonical permissions
 * - legacy principal objects remain backwards compatible
 *
 * This means authorization has ONE permission-resolution path.
 * ============================================================================
 */

function getPrincipalPermissions(
  principal
) {
  if (
    !principal
  ) {
    return [];
  }

  return resolvePermissions(
    principal
  );
}


/**
 * ============================================================================
 * AUTHORIZATION CHECKS
 * ============================================================================
 */

function hasPermission(
  principal,
  permission
) {
  /**
   * Unknown requested permissions fail closed.
   */
  if (
    !isKnownPermission(
      permission
    )
  ) {
    return false;
  }

  return getPrincipalPermissions(
    principal
  ).includes(
    permission
  );
}


function can(
  principal,
  permission
) {
  return hasPermission(
    principal,
    permission
  );
}


function canAll(
  principal,
  permissions
) {
  const required =
    normalizePermissionList(
      permissions
    );

  /**
   * Empty requirement = nothing to deny.
   *
   * Route middleware itself should reject invalid empty permission
   * declarations where appropriate.
   */
  if (
    required.length ===
    0
  ) {
    return true;
  }

  const granted =
    new Set(
      getPrincipalPermissions(
        principal
      )
    );

  return required.every(
    (
      permission
    ) =>
      isKnownPermission(
        permission
      ) &&
      granted.has(
        permission
      )
  );
}


function canAny(
  principal,
  permissions
) {
  const required =
    normalizePermissionList(
      permissions
    );

  if (
    required.length ===
    0
  ) {
    return true;
  }

  const granted =
    new Set(
      getPrincipalPermissions(
        principal
      )
    );

  return required.some(
    (
      permission
    ) =>
      isKnownPermission(
        permission
      ) &&
      granted.has(
        permission
      )
  );
}


/**
 * ============================================================================
 * ASSERTIONS
 * ============================================================================
 */

function assertCan(
  principal,
  permission
) {
  if (
    can(
      principal,
      permission
    )
  ) {
    return true;
  }

  throw new AuthorizationError(
    "Insufficient permissions",
    {
      permission,

      organizationId:
        principal
          ?.organizationId ||
        null,

      environmentId:
        principal
          ?.environmentId ||
        null,
    }
  );
}


function assertCanAll(
  principal,
  permissions
) {
  if (
    canAll(
      principal,
      permissions
    )
  ) {
    return true;
  }

  throw new AuthorizationError(
    "Insufficient permissions",
    {
      requiredPermissions:
        normalizePermissionList(
          permissions
        ),

      organizationId:
        principal
          ?.organizationId ||
        null,

      environmentId:
        principal
          ?.environmentId ||
        null,
    }
  );
}


function assertCanAny(
  principal,
  permissions
) {
  if (
    canAny(
      principal,
      permissions
    )
  ) {
    return true;
  }

  throw new AuthorizationError(
    "Insufficient permissions",
    {
      requiredPermissions:
        normalizePermissionList(
          permissions
        ),

      organizationId:
        principal
          ?.organizationId ||
        null,

      environmentId:
        principal
          ?.environmentId ||
        null,
    }
  );
}


/**
 * ============================================================================
 * EXPORTS
 * ============================================================================
 */

module.exports = {
  AuthorizationError,

  normalizePermissionList,

  resolvePermissions,

  getPrincipalPermissions,

  hasPermission,

  can,

  canAll,

  canAny,

  assertCan,

  assertCanAll,

  assertCanAny,
};