import {
  ORGANIZATION_ROLES,
  PRODUCT_PERSONAS,
  type OrganizationRole,
  type ProductPersona,
  type ProductPersonaMetadata,
} from './product.types'

export const PRODUCT_PERSONA_METADATA:
  Record<ProductPersona, ProductPersonaMetadata> = {
    [PRODUCT_PERSONAS.ADMINISTRATION]: {
      id:
        PRODUCT_PERSONAS
          .ADMINISTRATION,

      label:
        'Administration',

      shortLabel:
        'Admin',

      description:
        'Organization operations, integrations, governance, team management, reliability and commercial controls.',

      defaultLandingPath:
        '/overview',
    },

    [PRODUCT_PERSONAS.OPERATIONS]: {
      id:
        PRODUCT_PERSONAS
          .OPERATIONS,

      label:
        'Operations',

      shortLabel:
        'Operations',

      description:
        'Real-time reliability operations, incidents, investigation, recovery, human tasks and infrastructure context.',

      defaultLandingPath:
        '/operations',
    },

    [PRODUCT_PERSONAS.DEVELOPER]: {
      id:
        PRODUCT_PERSONAS
          .DEVELOPER,

      label:
        'Developer',

      shortLabel:
        'Developer',

      description:
        'Service-focused reliability, incidents, changes, recommendations and engineering guidance.',

      defaultLandingPath:
        '/my-services',
    },

    [PRODUCT_PERSONAS.GOVERNANCE]: {
      id:
        PRODUCT_PERSONAS
          .GOVERNANCE,

      label:
        'Governance',

      shortLabel:
        'Governance',

      description:
        'Policy, execution evidence, audit, trust, certification and access governance.',

      defaultLandingPath:
        '/governance',
    },

    [PRODUCT_PERSONAS.EXECUTIVE]: {
      id:
        PRODUCT_PERSONAS
          .EXECUTIVE,

      label:
        'Executive',

      shortLabel:
        'Executive',

      description:
        'High-level reliability, business impact, recovery coverage and operational risk.',

      defaultLandingPath:
        '/reliability',
    },
  }

const DEFAULT_PERSONA_BY_ROLE:
  Partial<Record<OrganizationRole, ProductPersona>> = {
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
  }

export function isProductPersona(
  value: unknown,
): value is ProductPersona {
  return (
    typeof value === 'string' &&
    Object
      .values(PRODUCT_PERSONAS)
      .includes(
        value as ProductPersona,
      )
  )
}

export function getDefaultPersonaForRole(
  role:
    | string
    | null
    | undefined,
): ProductPersona {
  if (!role) {
    return PRODUCT_PERSONAS.EXECUTIVE
  }

  return (
    DEFAULT_PERSONA_BY_ROLE[
      role as OrganizationRole
    ] ??
    PRODUCT_PERSONAS.EXECUTIVE
  )
}

export function getProductPersonaMetadata(
  persona:
    | ProductPersona
    | string
    | null
    | undefined,
): ProductPersonaMetadata {
  if (
    !isProductPersona(
      persona,
    )
  ) {
    return (
      PRODUCT_PERSONA_METADATA[
        PRODUCT_PERSONAS.EXECUTIVE
      ]
    )
  }

  return (
    PRODUCT_PERSONA_METADATA[
      persona
    ]
  )
}

export function getDefaultProductLandingPath(
  role:
    | string
    | null
    | undefined,
): string {
  const persona =
    getDefaultPersonaForRole(
      role,
    )

  return (
    PRODUCT_PERSONA_METADATA[
      persona
    ].defaultLandingPath
  )
}