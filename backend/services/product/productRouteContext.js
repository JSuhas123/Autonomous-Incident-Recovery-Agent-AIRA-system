"use strict";

/**
 * ============================================================================
 * AIRA PHASE 25.2B
 * PRODUCT ROUTE CONTEXT
 * ============================================================================
 *
 * PURPOSE
 *
 * Normalize the already-authenticated backend request into the minimum
 * authoritative context required by product-layer routes.
 *
 * SECURITY INVARIANTS
 *
 * - organization scope comes from server middleware
 * - environment scope comes from server middleware
 * - user identity comes from authenticated request state
 * - browser payload/query parameters never become tenant authority
 *
 * This module DOES NOT authenticate a request.
 * Authentication/context middleware must run before these handlers.
 * ============================================================================
 */


function createProductRouteError(
  message,
  status,
  code
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


function asString(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value ===
      "string"
  ) {
    return value;
  }

  if (
    typeof value?.toString ===
      "function"
  ) {
    return value.toString();
  }

  return String(
    value
  );
}


/**
 * AIRA has evolved through several context shapes.
 *
 * Until final Phase 25 server integration reconciles the complete middleware
 * stack, this helper accepts the already-server-generated forms below.
 *
 * It NEVER reads tenant authority from req.body or req.query.
 */
function getServerRequestContext(
  req
) {
  if (
    !req ||
    typeof req !==
      "object"
  ) {
    throw createProductRouteError(
      "Request is required",
      500,
      "PRODUCT_REQUEST_REQUIRED"
    );
  }

  const source =
    req.productContext ||
    req.airaContext ||
    req.requestContext ||
    req.context ||
    {};


  const user =
    req.user ||
    source.user ||
    null;

  const membership =
    req.membership ||
    source.membership ||
    null;

  const organization =
    req.organization ||
    source.organization ||
    null;

  const environment =
    req.environment ||
    source.environment ||
    null;


  const userId =
    asString(
      source.userId ??
      user?._id ??
      user?.id ??
      user?.publicId ??
      null
    );


  const organizationId =
    asString(
      source.organizationId ??
      organization?._id ??
      organization?.id ??
      organization?.publicId ??
      null
    );


  const environmentId =
    asString(
      source.environmentId ??
      environment?._id ??
      environment?.id ??
      environment?.publicId ??
      null
    );


  const membershipId =
    asString(
      source.membershipId ??
      membership?._id ??
      membership?.id ??
      membership?.publicId ??
      null
    );


  const role =
    source.role ??
    membership?.role ??
    null;


  if (!userId) {
    throw createProductRouteError(
      "Authenticated user context is required",
      401,
      "PRODUCT_AUTHENTICATED_USER_REQUIRED"
    );
  }


  if (!organizationId) {
    throw createProductRouteError(
      "Authoritative organization context is required",
      403,
      "PRODUCT_ORGANIZATION_CONTEXT_REQUIRED"
    );
  }


  if (!role) {
    throw createProductRouteError(
      "Organization membership role is required",
      403,
      "PRODUCT_MEMBERSHIP_ROLE_REQUIRED"
    );
  }


  return {
    authenticationType:
      source.authenticationType ??
      req.authenticationType ??
      "session",

    userId,

    organizationId,

    environmentId,

    membershipId,

    role,

    requestId:
      asString(
        source.requestId ??
        req.requestId ??
        req.id ??
        null
      ),

    tenantId:
      asString(
        source.tenantId ??
        organization?.tenantId ??
        organization?.tenantPublicId ??
        null
      ),

    user,

    membership,

    organization,

    environment,
  };
}


/**
 * Organization profile operations require an active environment because the
 * current PostgresTenantScope implementation scopes transactions using both
 * organization + environment.
 *
 * We preserve that contract for now rather than weakening tenancy guarantees.
 */
function requireProductEnvironment(
  context
) {
  if (
    !context?.environmentId
  ) {
    throw createProductRouteError(
      "Authoritative environment context is required",
      409,
      "PRODUCT_ENVIRONMENT_CONTEXT_REQUIRED"
    );
  }

  return context;
}


/**
 * Explicitly reject attempts to smuggle tenant selection through product
 * mutation payloads.
 */
function rejectClientTenantAuthority(
  req
) {
  const body =
    req?.body &&
    typeof req.body ===
      "object"
      ? req.body
      : {};

  const query =
    req?.query &&
    typeof req.query ===
      "object"
      ? req.query
      : {};


  const forbiddenFields = [
    "organizationId",
    "organization_id",
    "tenantId",
    "tenant_id",
    "environmentId",
    "environment_id",
  ];


  for (
    const field
    of
    forbiddenFields
  ) {
    if (
      Object.prototype
        .hasOwnProperty
        .call(
          body,
          field
        ) ||
      Object.prototype
        .hasOwnProperty
        .call(
          query,
          field
        )
    ) {
      throw createProductRouteError(
        `Client-supplied ${field} is not authoritative`,
        400,
        "PRODUCT_CLIENT_TENANT_AUTHORITY_REJECTED"
      );
    }
  }
}


module.exports = {
  createProductRouteError,

  getServerRequestContext,

  requireProductEnvironment,

  rejectClientTenantAuthority,
};