const BASE_URL =
  import.meta.env.VITE_API_URL ??
  'http://localhost:5000'


export interface EnterpriseLoginDiscovery {
  enterprise:
    boolean

  organizationId?:
    string

  providerId?:
    string

  providerType?:
    'oidc' |
    'saml'

  providerName?:
    string

  loginMode?:
    string

  ssoRequired?:
    boolean
}


export class EnterpriseAuthApiError
  extends Error {
  constructor(
    public readonly status:
      number,

    message:
      string,

    public readonly code?:
      string,
  ) {
    super(
      message,
    )

    this.name =
      'EnterpriseAuthApiError'
  }
}


export const enterpriseAuthApi = {
  async discover(
    email:
      string,

    signal?:
      AbortSignal,
  ): Promise<EnterpriseLoginDiscovery> {
    const normalizedEmail =
      email
        .trim()
        .toLowerCase()


    const response =
      await fetch(
        `${BASE_URL}/api/v1/enterprise-auth/discover?email=${encodeURIComponent(
          normalizedEmail,
        )}`,
        {
          method:
            'GET',

          credentials:
            'include',

          headers: {
            Accept:
              'application/json',
          },

          signal,
        },
      )


    const payload =
      await response
        .json()
        .catch(
          () => null,
        )


    if (
      !response.ok
    ) {
      throw new EnterpriseAuthApiError(
        response.status,

        payload?.message ??
        payload?.error ??
        'Unable to discover organization authentication policy.',

        payload?.code,
      )
    }


    return payload as
      EnterpriseLoginDiscovery
  },
}