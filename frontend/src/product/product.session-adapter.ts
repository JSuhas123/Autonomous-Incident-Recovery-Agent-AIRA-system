import {
    getDefaultPersonaForRole,
    getProductLandingPathForPersona,
} from './product.personas'

import type {
    OrganizationRole,
} from './product.types'


interface SessionUserLike {
  id?:
    string | null

  _id?:
    string | null
}


interface SessionMembershipLike {
  id?:
    string | null

  _id?:
    string | null

  role?:
    string | null
}


interface SessionOrganizationLike {
  id?:
    string | null

  _id?:
    string | null

  name?:
    string | null

  slug?:
    string | null
}


interface SessionEnvironmentLike {
  id?:
    string | null

  _id?:
    string | null

  name?:
    string | null

  type?:
    string | null

  environmentType?:
    string | null

  criticality?:
    string | null
}


interface BuildSessionPreviewInput {
  user:
    SessionUserLike |
    null |
    undefined

  membership:
    SessionMembershipLike |
    null |
    undefined

  organization:
    SessionOrganizationLike |
    null |
    undefined

  environment:
    SessionEnvironmentLike |
    null |
    undefined
}


function normalizeId(
  value:
    unknown,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null
  }


  return String(
    value,
  )
}


function normalizeEnvironmentType(
  value:
    string |
    null |
    undefined,
):
  | 'development'
  | 'staging'
  | 'production'
  | 'unknown' {
  switch (
    value
      ?.trim()
      .toLowerCase()
  ) {
    case 'development':
    case 'dev':
      return 'development'


    case 'staging':
    case 'stage':
      return 'staging'


    case 'production':
    case 'prod':
      return 'production'


    default:
      return 'unknown'
  }
}


function normalizeOrganizationRole(
  value:
    string |
    null |
    undefined,
):
  OrganizationRole |
  null {
  switch (
    value
  ) {
    case 'owner':
    case 'admin':
    case 'platform_engineer':
    case 'developer':
    case 'security_analyst':
    case 'auditor':
    case 'viewer':
      return value


    default:
      return null
  }
}


/**
 * Temporary fallback presentation adapter.
 *
 * It must never invent browser permissions.
 *
 * Once authoritative /api/v1/product/context succeeds,
 * ProductContextProvider replaces this state.
 */
export function buildSessionProductPreview({
  user,
  membership,
  organization,
  environment,
}: BuildSessionPreviewInput) {
  const role =
    normalizeOrganizationRole(
      membership?.role,
    )


  const persona =
    getDefaultPersonaForRole(
      role,
    )


  return {
    source:
      'session_preview' as const,

    userId:
      normalizeId(
        user?.id ??
        user?._id,
      ),

    membershipId:
      normalizeId(
        membership?.id ??
        membership?._id,
      ),

    role,

    persona,

    permissions:
      [] as string[],

    organization:
      organization
        ? {
            id:
              normalizeId(
                organization.id ??
                organization._id,
              ) ?? '',

            name:
              organization.name ??
              'Organization',

            slug:
              organization.slug ??
              'organization',
          }
        : null,

    environment:
      environment
        ? {
            id:
              normalizeId(
                environment.id ??
                environment._id,
              ) ?? '',

            name:
              environment.name ??
              'Environment',

            type:
              normalizeEnvironmentType(
                environment.type ??
                environment
                  .environmentType,
              ),

            criticality:
              environment
                .criticality ??
              null,
          }
        : null,

    landingPath:
      getProductLandingPathForPersona(
        persona,
      ),
  }
}