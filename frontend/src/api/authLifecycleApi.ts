import {
  useAuthStore,
} from '@/store/authStore'

const BASE_URL =
  import.meta.env.VITE_API_URL ??
  'http://localhost:5000'

const MUTATION_METHODS =
  new Set([
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
  ])

export class AuthLifecycleApiError
  extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message)

    this.name =
      'AuthLifecycleApiError'
  }
}

interface RequestOptions {
  method?: string

  body?: unknown

  signal?: AbortSignal

  publicEndpoint?: boolean
}

async function request<T>(
  path: string,
  options:
    RequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    signal,
    publicEndpoint = false,
  } = options

  const normalizedMethod =
    method.toUpperCase()

  const isMutation =
    MUTATION_METHODS.has(
      normalizedMethod,
    )

  const headers:
    Record<string, string> = {
      Accept:
        'application/json',
    }

  if (body !== undefined) {
    headers[
      'Content-Type'
    ] =
      'application/json'
  }

  /*
   * Public authentication lifecycle
   * endpoints do not require the
   * authenticated-session CSRF token.
   *
   * Authenticated account-security
   * mutations do.
   */
  if (
    isMutation &&
    !publicEndpoint
  ) {
    const csrfToken =
      useAuthStore
        .getState()
        .csrfToken

    if (csrfToken) {
      headers[
        'X-CSRF-Token'
      ] =
        csrfToken
    }
  }

  const response =
    await fetch(
      `${BASE_URL}${path}`,
      {
        method:
          normalizedMethod,

        headers,

        credentials:
          'include',

        signal,

        body:
          body !== undefined
            ? JSON.stringify(
                body,
              )
            : undefined,
      },
    )

  let data: unknown

  const contentType =
    response.headers.get(
      'content-type',
    ) ?? ''

  if (
    contentType.includes(
      'application/json',
    )
  ) {
    data =
      await response.json()
  } else {
    data =
      await response.text()
  }

  /*
   * Only authenticated lifecycle
   * endpoints may invalidate the
   * browser session.
   *
   * A public verification failure
   * must never clear an otherwise
   * valid logged-in session.
   */
  if (
    response.status ===
      401 &&
    !publicEndpoint
  ) {
    useAuthStore
      .getState()
      .setUnauthenticated()
  }

  if (!response.ok) {
    const error =
      data as {
        error?: string
        message?: string
        code?: string
      }

    throw new AuthLifecycleApiError(
      response.status,

      error?.error ??
        error?.message ??
        `HTTP ${response.status}`,

      error?.code,

      data,
    )
  }

  return data as T
}

export interface VerificationRequestResponse {
  accepted: boolean

  message: string

  developmentVerificationUrl?: string

  executionAuthorized: false
}

export interface VerificationResponse {
  verified: boolean

  emailVerifiedAt:
    string | null

  message: string

  executionAuthorized: false
}

export interface ChangePasswordResponse {
  changed: boolean

  sessionsRevoked?:
    number

  message: string

  executionAuthorized: false
}

export interface AuthSessionSummary {
  id: string

  current: boolean

  assuranceLevel:
    string

  rememberMe:
    boolean

  createdAt:
    string | null

  lastActivityAt:
    string | null

  idleExpiresAt:
    string | null

  absoluteExpiresAt:
    string | null

  ipAddressMasked:
    string | null

  userAgentSummary:
    string | null
}

export interface SessionListResponse {
  sessions:
    AuthSessionSummary[]

  executionAuthorized: false
}

export interface SessionRevocationResponse {
  revoked: boolean

  sessionId: string

  executionAuthorized: false
}

export interface SecurityEventSummary {
  id: string

  type: string

  outcome:
    string | null

  description:
    string | null

  occurredAt:
    string

  ipAddressMasked:
    string | null
}

export interface SecurityEventListResponse {
  events:
    SecurityEventSummary[]

  executionAuthorized: false
}

export const authLifecycleApi = {
  requestEmailVerification(
    email: string,
  ) {
    return request<
      VerificationRequestResponse
    >(
      '/api/v1/auth/email-verification/request',
      {
        method:
          'POST',

        body: {
          email,
        },

        publicEndpoint:
          true,
      },
    )
  },

  resendEmailVerification(
    email: string,
  ) {
    return request<
      VerificationRequestResponse
    >(
      '/api/v1/auth/email-verification/resend',
      {
        method:
          'POST',

        body: {
          email,
        },

        publicEndpoint:
          true,
      },
    )
  },

  verifyEmail(
    token: string,
  ) {
    return request<
      VerificationResponse
    >(
      '/api/v1/auth/email-verification/verify',
      {
        method:
          'POST',

        body: {
          token,
        },

        publicEndpoint:
          true,
      },
    )
  },

  changePassword(
    body: {
      currentPassword:
        string

      newPassword:
        string
    },
  ) {
    return request<
      ChangePasswordResponse
    >(
      '/api/v1/auth/change-password',
      {
        method:
          'POST',

        body,
      },
    )
  },

  listSessions(
    signal?: AbortSignal,
  ) {
    return request<
      SessionListResponse
    >(
      '/api/v1/auth/sessions',
      {
        signal,
      },
    )
  },

  revokeSession(
    sessionId: string,
  ) {
    return request<
      SessionRevocationResponse
    >(
      `/api/v1/auth/sessions/${encodeURIComponent(
        sessionId,
      )}`,
      {
        method:
          'DELETE',
      },
    )
  },

  securityEvents(
    signal?: AbortSignal,
  ) {
    return request<
      SecurityEventListResponse
    >(
      '/api/v1/auth/security-events',
      {
        signal,
      },
    )
  },
}