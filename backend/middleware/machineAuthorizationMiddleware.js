"use strict";

/**
 * ============================================================================
 * AIRA PHASE 14.4E
 * MACHINE ACTOR AUTHORIZATION
 * ============================================================================
 *
 * This middleware adds machine-identity-specific authorization constraints.
 *
 * IMPORTANT:
 *
 * Permission authorization remains owned by authorizationMiddleware.js.
 *
 * This module adds constraints that are unique to machine identities:
 *
 *   1. organization scope
 *   2. environment scope
 *   3. actor-type integrity
 *
 * Human users are not affected by these checks.
 *
 * Machine identities MUST NOT:
 *
 *   - impersonate human users
 *   - access another organization
 *   - escape their configured environment scope
 *   - silently operate without an authenticated service-account actor
 * ============================================================================
 */


// ============================================================================
// CONSTANTS
// ============================================================================

const ACTOR_TYPES =
  Object.freeze({
    USER:
      "USER",

    SERVICE_ACCOUNT:
      "SERVICE_ACCOUNT",
  });


// ============================================================================
// ERROR
// ============================================================================

function authorizationError(
  message,
  code,
  status =
    403
) {
  const error =
    new Error(
      message
    );

  error.status =
    status;

  error.code =
    code;

  error.executionAuthorized =
    false;

  return error;
}


// ============================================================================
// NORMALIZATION
// ============================================================================

function normalizeId(
  value
) {
  if (
    value == null
  ) {
    return null;
  }

  return String(
    value
      ?.toString?.() ??
    value
  );
}


function normalizeIdArray(
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
        .map(
          normalizeId
        )
        .filter(
          Boolean
        )
    ),
  ];
}


// ============================================================================
// ACTOR RESOLUTION
// ============================================================================

function getActorType(
  req
) {
  return (
    req.actor
      ?.actorType ||
    req.context
      ?.actorType ||
    (
      req.context
        ?.serviceAccountId
        ? ACTOR_TYPES
            .SERVICE_ACCOUNT
        : ACTOR_TYPES
            .USER
    )
  );
}


function isServiceAccountRequest(
  req
) {
  return (
    getActorType(
      req
    ) ===
    ACTOR_TYPES
      .SERVICE_ACCOUNT
  );
}


// ============================================================================
// SERVICE ACCOUNT CONTEXT VALIDATION
// ============================================================================

function validateServiceAccountContext(
  req
) {
  if (
    !isServiceAccountRequest(
      req
    )
  ) {
    return;
  }

  const actor =
    req.actor ||
    {};

  const context =
    req.context ||
    {};

  if (
    !actor
      .serviceAccountId &&
    !context
      .serviceAccountId
  ) {
    throw authorizationError(
      "Authenticated service account context is incomplete",
      "SERVICE_ACCOUNT_CONTEXT_INVALID"
    );
  }

  const actorOrganizationId =
    normalizeId(
      actor
        .organizationId
    );

  const contextOrganizationId =
    normalizeId(
      context
        .organizationId
    );

  if (
    !actorOrganizationId ||
    !contextOrganizationId
  ) {
    throw authorizationError(
      "Service account organization context is required",
      "SERVICE_ACCOUNT_ORGANIZATION_REQUIRED"
    );
  }

  if (
    actorOrganizationId !==
    contextOrganizationId
  ) {
    throw authorizationError(
      "Service account organization context mismatch",
      "SERVICE_ACCOUNT_ORGANIZATION_MISMATCH"
    );
  }

  /**
   * Machine identities must never magically become human identities.
   */
  if (
    context.userId
  ) {
    throw authorizationError(
      "Service account cannot impersonate a user",
      "SERVICE_ACCOUNT_USER_IMPERSONATION_FORBIDDEN"
    );
  }
}


// ============================================================================
// ENVIRONMENT ACCESS
// ============================================================================

function serviceAccountCanAccessEnvironment(
  req,
  environmentId
) {
  if (
    !isServiceAccountRequest(
      req
    )
  ) {
    return true;
  }

  const requestedEnvironmentId =
    normalizeId(
      environmentId
    );

  if (
    !requestedEnvironmentId
  ) {
    return false;
  }

  const allowed =
    normalizeIdArray(
      req.actor
        ?.environmentIds ||
      req.context
        ?.environmentIds ||
      []
    );

  /**
   * Empty environment list means NO environment access.
   *
   * We deliberately fail closed.
   *
   * Organization-wide machine identities can be introduced later through
   * an explicit wildcard capability instead of making [] mean "everything".
   */
  if (
    allowed.length ===
    0
  ) {
    return false;
  }

  return allowed.includes(
    requestedEnvironmentId
  );
}


// ============================================================================
// ORGANIZATION SCOPE MIDDLEWARE
// ============================================================================

function requireMachineOrganizationScope(
  req,
  res,
  next
) {
  try {
    validateServiceAccountContext(
      req
    );

    return next();
  } catch (
    error
  ) {
    return next(
      error
    );
  }
}


// ============================================================================
// ENVIRONMENT SCOPE MIDDLEWARE
// ============================================================================

function requireMachineEnvironmentScope(
  req,
  res,
  next
) {
  try {
    if (
      !isServiceAccountRequest(
        req
      )
    ) {
      return next();
    }

    validateServiceAccountContext(
      req
    );

    const environmentId =
      normalizeId(
        req.context
          ?.environmentId
      );

    if (
      !environmentId
    ) {
      throw authorizationError(
        "Environment context is required for this machine request",
        "SERVICE_ACCOUNT_ENVIRONMENT_REQUIRED"
      );
    }

    if (
      !serviceAccountCanAccessEnvironment(
        req,
        environmentId
      )
    ) {
      throw authorizationError(
        "Service account is not authorized for this environment",
        "SERVICE_ACCOUNT_ENVIRONMENT_FORBIDDEN"
      );
    }

    return next();
  } catch (
    error
  ) {
    return next(
      error
    );
  }
}


// ============================================================================
// OPTIONAL ENVIRONMENT SCOPE
//
// Organization-level APIs may not have an environment.
//
// If an environment is present, machine scope is enforced.
// ============================================================================

function optionalMachineEnvironmentScope(
  req,
  res,
  next
) {
  try {
    if (
      !isServiceAccountRequest(
        req
      )
    ) {
      return next();
    }

    validateServiceAccountContext(
      req
    );

    const environmentId =
      normalizeId(
        req.context
          ?.environmentId
      );

    if (
      !environmentId
    ) {
      return next();
    }

    if (
      !serviceAccountCanAccessEnvironment(
        req,
        environmentId
      )
    ) {
      throw authorizationError(
        "Service account is not authorized for this environment",
        "SERVICE_ACCOUNT_ENVIRONMENT_FORBIDDEN"
      );
    }

    return next();
  } catch (
    error
  ) {
    return next(
      error
    );
  }
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  ACTOR_TYPES,

  getActorType,

  isServiceAccountRequest,

  validateServiceAccountContext,

  serviceAccountCanAccessEnvironment,

  requireMachineOrganizationScope,

  requireMachineEnvironmentScope,

  optionalMachineEnvironmentScope,
};