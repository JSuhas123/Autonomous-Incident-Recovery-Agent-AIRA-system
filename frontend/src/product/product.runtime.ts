import type {
  OrganizationRole,
  ProductPersona,
} from './product.types'


export type ProductContextSource =
  | 'authoritative'
  | 'session_preview'
  | 'unavailable'


export interface ProductRuntimeIdentity {
  userId:
    string | null

  membershipId:
    string | null

  role:
    OrganizationRole | null

  permissions:
    string[]

  persona:
    ProductPersona
}


export interface ProductRuntimeScope {
  organizationId:
    string | null

  organizationName:
    string | null

  organizationSlug:
    string | null

  environmentId:
    string | null

  environmentName:
    string | null

  environmentType:
    | 'development'
    | 'staging'
    | 'production'
    | 'unknown'
}


export interface ProductRuntimeContext {
  source:
    ProductContextSource

  ready:
    boolean

  identity:
    ProductRuntimeIdentity

  scope:
    ProductRuntimeScope

  landingPath:
    string

  executionAuthorized:
    false
}