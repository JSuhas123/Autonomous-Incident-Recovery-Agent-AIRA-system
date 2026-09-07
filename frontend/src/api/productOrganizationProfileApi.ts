import {
  useAuthStore,
} from '@/store/authStore'


const BASE_URL =
  import.meta.env
    .VITE_API_URL ??
  'http://localhost:5000'


export interface OrganizationProfile {
  id: string
  organizationId: string

  legalName: string | null
  websiteUrl: string | null
  industry: string | null

  companySize:
    | 'solo'
    | 'micro'
    | 'small'
    | 'medium'
    | 'large'
    | 'enterprise'
    | null

  employeeCount: number | null

  headquartersCountryCode:
    string | null

  operatingRegion:
    string | null

  dataRegion:
    string | null

  primaryDomain:
    string | null

  technicalMaturity:
    | 'emerging'
    | 'developing'
    | 'established'
    | 'advanced'
    | null

  profileStatus:
    | 'incomplete'
    | 'complete'
    | 'verified'

  metadata:
    Record<
      string,
      unknown
    >

  completedAt:
    string | null

  verifiedAt:
    string | null

  createdAt:
    string | null

  updatedAt:
    string | null
}


export interface OrganizationProfileInput {
  legalName?: string | null

  websiteUrl?: string | null

  industry?: string | null

  companySize?:
    | 'solo'
    | 'micro'
    | 'small'
    | 'medium'
    | 'large'
    | 'enterprise'
    | null

  employeeCount?:
    number | null

  headquartersCountryCode?:
    string | null

  operatingRegion?:
    string | null

  dataRegion?:
    string | null

  primaryDomain?:
    string | null

  technicalMaturity?:
    | 'emerging'
    | 'developing'
    | 'established'
    | 'advanced'
    | null

  metadata?:
    Record<
      string,
      unknown
    >
}


export class ProductOrganizationProfileApiError
  extends Error {
  constructor(
    public readonly status:
      number,

    message:
      string,

    public readonly code?:
      string,

    public readonly details?:
      unknown,
  ) {
    super(
      message,
    )

    this.name =
      'ProductOrganizationProfileApiError'
  }
}


async function request<T>(
  method:
    'GET' |
    'PUT',

  body?:
    unknown,
): Promise<T> {
  const store =
    useAuthStore
      .getState()


  const headers:
    Record<
      string,
      string
    > = {
      Accept:
        'application/json',
    }


  if (
    body !==
    undefined
  ) {
    headers[
      'Content-Type'
    ] =
      'application/json'
  }


  /*
   * Browser environment is a preference only.
   * Backend remains authoritative.
   */
  if (
    store
      .activeEnvironment
      ?.id
  ) {
    headers[
      'X-AIRA-Environment-Id'
    ] =
      store
        .activeEnvironment
        .id
  }


  if (
    method ===
      'PUT' &&
    store
      .csrfToken
  ) {
    headers[
      'X-CSRF-Token'
    ] =
      store
        .csrfToken
  }


  const response =
    await fetch(
      `${BASE_URL}/api/v1/product/organization-profile`,
      {
        method,

        credentials:
          'include',

        headers,

        body:
          body !==
          undefined
            ? JSON.stringify(
                body,
              )
            : undefined,
      },
    )


  const contentType =
    response
      .headers
      .get(
        'content-type',
      ) ??
    ''


  const payload:
    any =
    contentType.includes(
      'application/json',
    )
      ? await response
          .json()
      : await response
          .text()


  if (
    !response.ok
  ) {
    const error =
      payload
        ?.error


    throw new ProductOrganizationProfileApiError(
      response.status,

      typeof error ===
        'object'
        ? error
            ?.message ??
          'Organization profile request failed'
        : payload
            ?.message ??
          payload
            ?.error ??
          'Organization profile request failed',

      typeof error ===
        'object'
        ? error
            ?.code
        : payload
            ?.code,

      payload,
    )
  }


  return payload as T
}


export const productOrganizationProfileApi = {
  async get() {
    const response =
      await request<{
        success:
          boolean

        data: {
          profile:
            OrganizationProfile |
            null
        }

        executionAuthorized:
          false
      }>(
        'GET',
      )


    return response
      .data
      .profile
  },


  async update(
    input:
      OrganizationProfileInput,
  ) {
    const response =
      await request<{
        success:
          boolean

        data: {
          profile:
            OrganizationProfile
        }

        executionAuthorized:
          false
      }>(
        'PUT',
        input,
      )


    return response
      .data
      .profile
  },
}