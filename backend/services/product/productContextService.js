"use strict";

/**
 * ============================================================================
 * AIRA PHASE 25.4R + 25.5
 * AUTHORITATIVE PRODUCT CONTEXT
 * ============================================================================
 *
 * Product context is derived only after:
 *
 * authentication
 *      ↓
 * canonical organization membership
 *      ↓
 * canonical role
 *      ↓
 * canonical backend permissions
 *      ↓
 * server-validated environment
 *      ↓
 * presentation persona
 *
 * Persona does not grant authorization.
 * Browser organization/environment identifiers are not authoritative.
 * Product context never grants recovery execution authority.
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
        .filter(
          Boolean
        )
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


  const settings =
    environment
      ?.settings &&
    typeof environment
      .settings ===
      "object"
      ? environment
          .settings
      : {};


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

    settings: {
      allowAutonomousExecution:
        settings
          .allowAutonomousExecution ===
        true,

      requireApprovalForDestructiveActions:
        settings
          .requireApprovalForDestructiveActions !==
        false,

      timezone:
        typeof settings
          .timezone ===
        "string"
          ? settings
              .timezone
          : null,
    },
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


  if (
    !role
  ) {
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


  const permissions =
    uniqueStrings(
      getPermissionsForRole(
        role
      )
    );


  const organization =
    safeOrganization(
      requestContext
        .organization,

      requestContext
    );


  if (
    !organization
      ?.id
  ) {
    const error =
      new Error(
        "Authoritative organization context is required"
      );

    error.code =
      "PRODUCT_ORGANIZATION_CONTEXT_REQUIRED";

    error.status =
      403;

    throw error;
  }


  const environment =
    safeEnvironment(
      requestContext
        .environment
    );


  if (
    !environment
      ?.id
  ) {
    const error =
      new Error(
        "Authoritative environment context is required"
      );

    error.code =
      "PRODUCT_ENVIRONMENT_CONTEXT_REQUIRED";

    error.status =
      409;

    throw error;
  }


  /*
   * Defense in depth:
   *
   * Environment middleware already performs the organization ownership
   * validation. This check ensures the serialized product context cannot
   * accidentally contradict the authoritative organization.
   */
  if (
    environment
      .organizationId &&
    environment
      .organizationId !==
    organization.id
  ) {
    const error =
      new Error(
        "Environment does not belong to authoritative organization"
      );

    error.code =
      "PRODUCT_ENVIRONMENT_ORGANIZATION_MISMATCH";

    error.status =
      403;

    throw error;
  }


  return {
    version:
      "25.5",

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
          personaMetadata
            .id,

        label:
          personaMetadata
            .label,

        shortLabel:
          personaMetadata
            .shortLabel,

        description:
          personaMetadata
            .description,

        defaultLandingPath:
          personaMetadata
            .defaultLandingPath,
      },
    },

    organization,

    environment,

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