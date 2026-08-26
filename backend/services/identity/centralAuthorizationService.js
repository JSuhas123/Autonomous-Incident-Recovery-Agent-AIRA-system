"use strict";

const {
  isKnownPermission,
} =
  require(
    "../../constants/permissions"
  );

const {
  getPrincipalPermissions,
  AuthorizationError,
} =
  require(
    "./authorizationService"
  );


// ============================================================================
// DECISION CONSTANTS
// ============================================================================

const AUTHORIZATION_DECISIONS =
  Object.freeze({
    ALLOW:
      "ALLOW",

    DENY:
      "DENY",
  });


const AUTHORIZATION_DENIAL_REASONS =
  Object.freeze({
    PRINCIPAL_MISSING:
      "PRINCIPAL_MISSING",

    PRINCIPAL_INVALID:
      "PRINCIPAL_INVALID",

    PERMISSION_UNKNOWN:
      "PERMISSION_UNKNOWN",

    PERMISSION_DENIED:
      "PERMISSION_DENIED",

    ORGANIZATION_SCOPE_REQUIRED:
      "ORGANIZATION_SCOPE_REQUIRED",

    ORGANIZATION_SCOPE_MISMATCH:
      "ORGANIZATION_SCOPE_MISMATCH",

    ENVIRONMENT_SCOPE_REQUIRED:
      "ENVIRONMENT_SCOPE_REQUIRED",

    ENVIRONMENT_SCOPE_DENIED:
      "ENVIRONMENT_SCOPE_DENIED",
  });


// ============================================================================
// HELPERS
// ============================================================================

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


function createDecision({
  allowed,
  permission =
    null,
  principal =
    null,
  organizationId =
    null,
  environmentId =
    null,
  reason =
    null,
}) {
  return Object.freeze({
    allowed:
      Boolean(
        allowed
      ),

    decision:
      allowed
        ? AUTHORIZATION_DECISIONS
            .ALLOW
        : AUTHORIZATION_DECISIONS
            .DENY,

    reason:
      allowed
        ? null
        : reason,

    permission:
      permission ||
      null,

    actorType:
      principal
        ?.actorType ||
      null,

    actorId:
      principal
        ?.actorId ||
      null,

    organizationId:
      normalizeId(
        organizationId
      ),

    environmentId:
      normalizeId(
        environmentId
      ),

    executionAuthorized:
      Boolean(
        allowed
      ),
  });
}


// ============================================================================
// PRINCIPAL VALIDATION
// ============================================================================

function validatePrincipal(
  principal
) {
  if (
    !principal
  ) {
    return {
      valid:
        false,

      reason:
        AUTHORIZATION_DENIAL_REASONS
          .PRINCIPAL_MISSING,
    };
  }

  if (
  typeof principal !==
    "object" ||
  !normalizeId(
    principal.actorType
  )
)
/**
 * actorId is intentionally not mandatory at the authorization layer.
 *
 * Authentication is responsible for establishing identity.
 * Authorization evaluates the authenticated principal's authority.
 *
 * This also preserves compatibility with earlier internal callers that
 * supplied role/permission principals without duplicating user identity.
 */
 {
    return {
      valid:
        false,

      reason:
        AUTHORIZATION_DENIAL_REASONS
          .PRINCIPAL_INVALID,
    };
  }

  return {
    valid:
      true,

    reason:
      null,
  };
}


// ============================================================================
// ORGANIZATION BOUNDARY
// ============================================================================

function checkOrganizationScope({
  principal,
  organizationId,
}) {
  const principalOrganizationId =
    normalizeId(
      principal
        ?.organizationId
    );

  const requestedOrganizationId =
    normalizeId(
      organizationId
    );

  if (
    !requestedOrganizationId
  ) {
    return {
      allowed:
        false,

      reason:
        AUTHORIZATION_DENIAL_REASONS
          .ORGANIZATION_SCOPE_REQUIRED,
    };
  }

  if (
    principalOrganizationId !==
    requestedOrganizationId
  ) {
    return {
      allowed:
        false,

      reason:
        AUTHORIZATION_DENIAL_REASONS
          .ORGANIZATION_SCOPE_MISMATCH,
    };
  }

  return {
    allowed:
      true,

    reason:
      null,
  };
}


// ============================================================================
// ENVIRONMENT BOUNDARY
// ============================================================================

function checkEnvironmentScope({
  principal,
  environmentId,
  requireEnvironment =
    false,
}) {
  const requestedEnvironmentId =
    normalizeId(
      environmentId
    );

  if (
    !requestedEnvironmentId
  ) {
    if (
      requireEnvironment
    ) {
      return {
        allowed:
          false,

        reason:
          AUTHORIZATION_DENIAL_REASONS
            .ENVIRONMENT_SCOPE_REQUIRED,
      };
    }

    return {
      allowed:
        true,

      reason:
        null,
    };
  }

  /**
   * Human principals currently inherit environment authority through their
   * organization membership unless an explicit environment restriction exists.
   *
   * Machine identities are expected to carry environmentIds.
   *
   * Therefore:
   *
   * [] means unrestricted for human principals.
   * [] means NO environment authority for service accounts.
   */

  const environmentIds =
    Array.isArray(
      principal
        ?.environmentIds
    )
      ? principal
          .environmentIds
          .map(
            normalizeId
          )
          .filter(
            Boolean
          )
      : [];

  if (
    principal
      ?.actorType ===
      "SERVICE_ACCOUNT"
  ) {
    if (
      !environmentIds.includes(
        requestedEnvironmentId
      )
    ) {
      return {
        allowed:
          false,

        reason:
          AUTHORIZATION_DENIAL_REASONS
            .ENVIRONMENT_SCOPE_DENIED,
      };
    }

    return {
      allowed:
        true,

      reason:
        null,
    };
  }

  /**
   * Human principal with explicit environment restrictions.
   */
  if (
    environmentIds.length >
      0 &&
    !environmentIds.includes(
      requestedEnvironmentId
    )
  ) {
    return {
      allowed:
        false,

      reason:
        AUTHORIZATION_DENIAL_REASONS
          .ENVIRONMENT_SCOPE_DENIED,
    };
  }

  return {
    allowed:
      true,

    reason:
      null,
  };
}


// ============================================================================
// CENTRAL AUTHORIZATION DECISION
// ============================================================================

function authorize({
  principal,
  permission,
  organizationId,
  environmentId =
    null,
  requireEnvironment =
    false,
}) {
  // --------------------------------------------------------------------------
  // 1. Principal
  // --------------------------------------------------------------------------

  const principalValidation =
    validatePrincipal(
      principal
    );

  if (
    !principalValidation
      .valid
  ) {
    return createDecision({
      allowed:
        false,

      permission,

      principal,

      organizationId,

      environmentId,

      reason:
        principalValidation
          .reason,
    });
  }


  // --------------------------------------------------------------------------
  // 2. Canonical permission
  // --------------------------------------------------------------------------

  if (
    !isKnownPermission(
      permission
    )
  ) {
    return createDecision({
      allowed:
        false,

      permission,

      principal,

      organizationId,

      environmentId,

      reason:
        AUTHORIZATION_DENIAL_REASONS
          .PERMISSION_UNKNOWN,
    });
  }


  // --------------------------------------------------------------------------
  // 3. Organization isolation
  // --------------------------------------------------------------------------

  const organizationDecision =
    checkOrganizationScope({
      principal,
      organizationId,
    });

  if (
    !organizationDecision
      .allowed
  ) {
    return createDecision({
      allowed:
        false,

      permission,

      principal,

      organizationId,

      environmentId,

      reason:
        organizationDecision
          .reason,
    });
  }


  // --------------------------------------------------------------------------
  // 4. Environment isolation
  // --------------------------------------------------------------------------

  const environmentDecision =
    checkEnvironmentScope({
      principal,
      environmentId,
      requireEnvironment,
    });

  if (
    !environmentDecision
      .allowed
  ) {
    return createDecision({
      allowed:
        false,

      permission,

      principal,

      organizationId,

      environmentId,

      reason:
        environmentDecision
          .reason,
    });
  }


  // --------------------------------------------------------------------------
  // 5. Permission
  // --------------------------------------------------------------------------

  const permissions =
    getPrincipalPermissions(
      principal
    );

  if (
    !permissions.includes(
      permission
    )
  ) {
    return createDecision({
      allowed:
        false,

      permission,

      principal,

      organizationId,

      environmentId,

      reason:
        AUTHORIZATION_DENIAL_REASONS
          .PERMISSION_DENIED,
    });
  }


  // --------------------------------------------------------------------------
  // ALLOW
  // --------------------------------------------------------------------------

  return createDecision({
    allowed:
      true,

    permission,

    principal,

    organizationId,

    environmentId,
  });
}


// ============================================================================
// ASSERTION API
// ============================================================================

function assertAuthorized(
  options
) {
  const decision =
    authorize(
      options
    );

  if (
    decision.allowed
  ) {
    return decision;
  }

  const error =
    new AuthorizationError(
      "Authorization denied",
      {
        permission:
          decision
            .permission,

        organizationId:
          decision
            .organizationId,

        environmentId:
          decision
            .environmentId,
      }
    );

  error.reason =
    decision.reason;

  error.decision =
    decision.decision;

  error.executionAuthorized =
    false;

  throw error;
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  AUTHORIZATION_DECISIONS,
  AUTHORIZATION_DENIAL_REASONS,

  validatePrincipal,

  checkOrganizationScope,
  checkEnvironmentScope,

  authorize,
  assertAuthorized,
};