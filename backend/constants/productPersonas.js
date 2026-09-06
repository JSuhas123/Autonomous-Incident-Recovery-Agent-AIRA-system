"use strict";

/**
 * ============================================================================
 * AIRA PHASE 25.0A
 * PRODUCT PERSONA CONTRACT
 * ============================================================================
 *
 * Product personas control PRESENTATION.
 *
 * They DO NOT grant authorization.
 *
 * Canonical authorization remains:
 *
 * authenticated identity
 *      ↓
 * organization membership
 *      ↓
 * canonical role
 *      ↓
 * resolved permissions
 *      ↓
 * backend authorization middleware
 *
 * Product persona exists above this layer:
 *
 * resolved permissions
 *      ↓
 * product persona
 *      ↓
 * navigation / dashboard composition / UX
 *
 * SECURITY INVARIANT
 *
 * A persona MUST NEVER:
 *
 * - grant a permission
 * - bypass requirePermission()
 * - create execution authority
 * - modify tenant scope
 * - modify environment scope
 * - change autonomy policy
 *
 * ============================================================================
 */

const {
  ORGANIZATION_ROLES,
} = require(
  "./roles"
);

// ============================================================================
// PRODUCT PERSONAS
// ============================================================================

const PRODUCT_PERSONAS =
  Object.freeze({
    ADMINISTRATION:
      "administration",

    OPERATIONS:
      "operations",

    DEVELOPER:
      "developer",

    GOVERNANCE:
      "governance",

    EXECUTIVE:
      "executive",
  });

const PRODUCT_PERSONA_VALUES =
  Object.freeze(
    Object.values(
      PRODUCT_PERSONAS
    )
  );

// ============================================================================
// DEFAULT ROLE -> PERSONA
// ============================================================================

/**
 * This mapping controls the DEFAULT product experience.
 *
 * It does not alter authorization.
 *
 * Owners may eventually select between Administration and Executive
 * presentation modes because they already possess the underlying
 * permissions.
 *
 * Viewer maps to Executive because that experience is intentionally
 * high-level and read-oriented.
 */
const DEFAULT_PERSONA_BY_ROLE =
  Object.freeze({
    [ORGANIZATION_ROLES.OWNER]:
      PRODUCT_PERSONAS
        .ADMINISTRATION,

    [ORGANIZATION_ROLES.ADMIN]:
      PRODUCT_PERSONAS
        .ADMINISTRATION,

    [ORGANIZATION_ROLES.PLATFORM_ENGINEER]:
      PRODUCT_PERSONAS
        .OPERATIONS,

    [ORGANIZATION_ROLES.DEVELOPER]:
      PRODUCT_PERSONAS
        .DEVELOPER,

    [ORGANIZATION_ROLES.SECURITY_ANALYST]:
      PRODUCT_PERSONAS
        .GOVERNANCE,

    [ORGANIZATION_ROLES.AUDITOR]:
      PRODUCT_PERSONAS
        .GOVERNANCE,

    [ORGANIZATION_ROLES.VIEWER]:
      PRODUCT_PERSONAS
        .EXECUTIVE,
  });

// ============================================================================
// PERSONA METADATA
// ============================================================================

const PRODUCT_PERSONA_METADATA =
  Object.freeze({
    [PRODUCT_PERSONAS.ADMINISTRATION]:
      Object.freeze({
        id:
          PRODUCT_PERSONAS
            .ADMINISTRATION,

        label:
          "Administration",

        shortLabel:
          "Admin",

        description:
          "Organization operations, integrations, governance, team management, reliability and commercial controls.",

        defaultLandingPath:
          "/overview",
      }),

    [PRODUCT_PERSONAS.OPERATIONS]:
      Object.freeze({
        id:
          PRODUCT_PERSONAS
            .OPERATIONS,

        label:
          "Operations",

        shortLabel:
          "Operations",

        description:
          "Real-time reliability operations, incidents, investigation, recovery, human tasks and infrastructure context.",

        defaultLandingPath:
          "/operations",
      }),

    [PRODUCT_PERSONAS.DEVELOPER]:
      Object.freeze({
        id:
          PRODUCT_PERSONAS
            .DEVELOPER,

        label:
          "Developer",

        shortLabel:
          "Developer",

        description:
          "Service-focused reliability, incidents, changes, recommendations and engineering guidance.",

        defaultLandingPath:
          "/my-services",
      }),

    [PRODUCT_PERSONAS.GOVERNANCE]:
      Object.freeze({
        id:
          PRODUCT_PERSONAS
            .GOVERNANCE,

        label:
          "Governance",

        shortLabel:
          "Governance",

        description:
          "Policy, execution evidence, audit, trust, certification and access governance.",

        defaultLandingPath:
          "/governance",
      }),

    [PRODUCT_PERSONAS.EXECUTIVE]:
      Object.freeze({
        id:
          PRODUCT_PERSONAS
            .EXECUTIVE,

        label:
          "Executive",

        shortLabel:
          "Executive",

        description:
          "High-level reliability, business impact, recovery coverage and operational risk.",

        defaultLandingPath:
          "/reliability",
      }),
  });

// ============================================================================
// HELPERS
// ============================================================================

function isKnownProductPersona(
  value
) {
  return (
    typeof value ===
      "string" &&
    PRODUCT_PERSONA_VALUES
      .includes(
        value.trim()
      )
  );
}

function getDefaultPersonaForRole(
  role
) {
  if (
    typeof role !==
      "string"
  ) {
    return (
      PRODUCT_PERSONAS
        .EXECUTIVE
    );
  }

  return (
    DEFAULT_PERSONA_BY_ROLE[
      role.trim()
    ] ||
    PRODUCT_PERSONAS
      .EXECUTIVE
  );
}

function getProductPersonaMetadata(
  persona
) {
  const normalized =
    isKnownProductPersona(
      persona
    )
      ? persona.trim()
      : PRODUCT_PERSONAS
          .EXECUTIVE;

  return (
    PRODUCT_PERSONA_METADATA[
      normalized
    ]
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  PRODUCT_PERSONAS,
  PRODUCT_PERSONA_VALUES,

  DEFAULT_PERSONA_BY_ROLE,
  PRODUCT_PERSONA_METADATA,

  isKnownProductPersona,
  getDefaultPersonaForRole,
  getProductPersonaMetadata,
};