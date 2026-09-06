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
  (typeof PRODUCT_PERSONAS)[
    keyof typeof PRODUCT_PERSONAS
  ]


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
  (typeof ORGANIZATION_ROLES)[
    keyof typeof ORGANIZATION_ROLES
  ]


export interface ProductPersonaMetadata {
  id:
    ProductPersona

  label:
    string

  shortLabel:
    string

  description:
    string

  defaultLandingPath:
    string
}


export interface ProductIdentity {
  userId:
    string | null

  membershipId:
    string | null

  role:
    OrganizationRole |
    string

  permissions:
    string[]

  persona:
    ProductPersona

  personaMetadata:
    ProductPersonaMetadata
}


export interface ProductOrganizationSummary {
  id:
    string | null

  tenantId:
    string | null

  name:
    string | null

  slug:
    string | null

  status:
    string | null
}


export interface ProductEnvironmentSummary {
  id:
    string | null

  organizationId:
    string | null

  name:
    string | null

  slug:
    string | null

  type:
    | 'development'
    | 'testing'
    | 'staging'
    | 'production'
    | 'custom'
    | string
    | null

  criticality:
    | 'low'
    | 'medium'
    | 'high'
    | 'critical'
    | string
    | null

  status:
    | 'active'
    | 'maintenance'
    | 'archived'
    | string
    | null
}


export interface ProductRequestContext {
  requestId:
    string | null

  authenticationType:
    string | null
}


export interface ProductSafetyContext {
  personaGrantsAuthorization:
    false

  browserOrganizationAuthoritative:
    false

  browserEnvironmentAuthoritative:
    false

  executionAuthorized:
    false
}


export interface ProductContext {
  version:
    string

  identity:
    ProductIdentity

  organization:
    ProductOrganizationSummary |
    null

  environment:
    ProductEnvironmentSummary |
    null

  request:
    ProductRequestContext

  safety:
    ProductSafetyContext
}


export interface ProductContextResponse {
  success:
    boolean

  data:
    ProductContext

  executionAuthorized:
    false
}