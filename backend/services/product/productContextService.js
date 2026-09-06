"use strict";

/**
 * ============================================================================
 * AIRA PHASE 25.0B
 * PRODUCT CONTEXT SERVICE
 * ============================================================================
 *
 * Converts AIRA's canonical authenticated request context into the safe
 * product context consumed by the frontend.
 *
 * SECURITY MODEL
 *
 * Request authentication
 *      ↓
 * organization membership
 *      ↓
 * canonical backend role
 *      ↓
 * canonical backend permissions
 *      ↓
 * product persona
 *
 * IMPORTANT
 *
 * Product persona is derived AFTER authorization identity.
 *
 * Persona:
 *   - may change navigation
 *   - may change dashboard composition
 *   - may change landing page
 *
 * Persona may NOT:
 *   - grant permissions
 *   - authorize execution
 *   - alter autonomy
 *   - change organization
 *   - change environment
 * ============================================================================
 */

const {
  getPermissionsForRole,
} =
  require(
    "../../constants/rolePermissions"
  );

const {
  getDefaultPersonaForRole,
  getProductPersonaMetadata,
} =
  require(
    "../../constants/productPersonas"
  );


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
    typeof value
      ?.toString ===
      "function"
  ) {
    return value
      .toString();
  }

  return String(
    value
  );
}


function uniqueStrings(
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
          (value) =>
            typeof value ===
            "string"
        )
        .map(
          (value) =>
            value.trim()
        )
        .filter(Boolean)
    ),
  ];
}


function safeOrganization(
  organization,
  context
) {
  if (
    !organization
  ) {
    return null;
  }

  return {
    id:
      asString(
        context
          ?.organizationId ??
        organization
          ?._id ??
        organization
          ?.id
      ),

    tenantId:
      asString(
        context
          ?.tenantId ??
        organization
          ?.tenantId ??
        organization
          ?.tenantPublicId
      ),

    name:
      organization
        ?.name ??
      null,

    slug:
      organization
        ?.slug ??
      null,

    status:
      organization
        ?.status ??
      null,
  };
}


function safeEnvironment(
  environment
) {
  if (
    !environment
  ) {
    return null;
  }

  return {
    id:
      asString(
        environment
          ?._id ??
        environment
          ?.id
      ),

    organizationId:
      asString(
        environment
          ?.organizationId
      ),

    name:
      environment
        ?.name ??
      null,

    slug:
      environment
        ?.slug ??
      null,

    type:
      environment
        ?.type ??
      environment
        ?.environmentType ??
      null,

    criticality:
      environment
        ?.criticality ??
      null,

    status:
      environment
        ?.status ??
      null,
  };
}


function buildProductContext(
  requestContext
) {
  if (
    !requestContext ||
    typeof requestContext !==
      "object"
  ) {
    const error =
      new Error(
        "Authenticated request context is required"
      );

    error.code =
      "PRODUCT_CONTEXT_REQUIRED";

    error.status =
      401;

    throw error;
  }

  const role =
    requestContext
      .role ??
    requestContext
      .membership
      ?.role ??
    null;

  if (!role) {
    const error =
      new Error(
        "Organization membership role is required"
      );

    error.code =
      "PRODUCT_MEMBERSHIP_ROLE_REQUIRED";

    error.status =
      403;

    throw error;
  }

  const persona =
    getDefaultPersonaForRole(
      role
    );

  const personaMetadata =
    getProductPersonaMetadata(
      persona
    );

  /*
   * Permissions always come from AIRA's canonical backend role registry.
   *
   * We intentionally do NOT trust:
   *
   * requestContext.permissions
   * browser permissions
   * product persona permissions
   */
  const permissions =
    uniqueStrings(
      getPermissionsForRole(
        role
      )
    );

  return {
    version:
      "25.0",

    identity: {
      userId:
        asString(
          requestContext
            .userId
        ),

      membershipId:
        asString(
          requestContext
            .membershipId ??
          requestContext
            .membership
            ?._id ??
          requestContext
            .membership
            ?.id
        ),

      role,

      permissions,

      persona,

      personaMetadata: {
        id:
          personaMetadata.id,

        label:
          personaMetadata.label,

        shortLabel:
          personaMetadata.shortLabel,

        description:
          personaMetadata.description,

        defaultLandingPath:
          personaMetadata
            .defaultLandingPath,
      },
    },

    organization:
      safeOrganization(
        requestContext
          .organization,

        requestContext
      ),

    environment:
      safeEnvironment(
        requestContext
          .environment
      ),

    request: {
      requestId:
        asString(
          requestContext
            .requestId
        ),

      authenticationType:
        requestContext
          .authenticationType ??
        null,
    },

    safety: {
      personaGrantsAuthorization:
        false,

      browserOrganizationAuthoritative:
        false,

      browserEnvironmentAuthoritative:
        false,

      executionAuthorized:
        false,
    },
  };
}


module.exports = {
  buildProductContext,
};