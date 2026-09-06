export const PRODUCT_PERSONAS = {
  ADMINISTRATION:
    'administration',

  OPERATIONS:
    'operations',

  DEVELOPER:
    'developer',

  GOVERNANCE:
    'governance',

  EXECUTIVE:
    'executive',
} as const

export type ProductPersona =
  (typeof PRODUCT_PERSONAS)[keyof typeof PRODUCT_PERSONAS]

export const ORGANIZATION_ROLES = {
  OWNER:
    'owner',

  ADMIN:
    'admin',

  PLATFORM_ENGINEER:
    'platform_engineer',

  DEVELOPER:
    'developer',

  SECURITY_ANALYST:
    'security_analyst',

  AUDITOR:
    'auditor',

  VIEWER:
    'viewer',
} as const

export type OrganizationRole =
  (typeof ORGANIZATION_ROLES)[keyof typeof ORGANIZATION_ROLES]

export interface ProductPersonaMetadata {
  id: ProductPersona

  label: string

  shortLabel: string

  description: string

  defaultLandingPath: string
}

export interface ProductIdentity {
  userId: string

  organizationId: string

  membershipId: string | null

  role: OrganizationRole | string

  permissions: string[]

  persona: ProductPersona
}

export interface ProductOrganizationSummary {
  id: string

  tenantId: string | null

  name: string

  slug: string

  status: string
}

export interface ProductEnvironmentSummary {
  id: string

  organizationId: string | null

  name: string

  slug: string

  type:
    | 'development'
    | 'testing'
    | 'staging'
    | 'production'
    | 'custom'

  criticality:
    | 'low'
    | 'medium'
    | 'high'
    | 'critical'

  status:
    | 'active'
    | 'maintenance'
    | 'archived'
}

export interface ProductContext {
  identity: ProductIdentity

  organization:
    ProductOrganizationSummary

  environment:
    ProductEnvironmentSummary | null

  requestId:
    string | null
}