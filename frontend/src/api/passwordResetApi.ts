const BASE_URL =
  import.meta.env.VITE_API_URL ??
  'http://localhost:5000'

export class PasswordResetApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'PasswordResetApiError'
  }
}

async function post<T>(
  path: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(
    `${BASE_URL}${path}`,
    {
      method: 'POST',

      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },

      credentials: 'include',

      body: JSON.stringify(body),
    },
  )

  const data = await response
    .json()
    .catch(() => ({}))

  if (!response.ok) {
    throw new PasswordResetApiError(
      response.status,
      data?.error ??
        data?.message ??
        `HTTP ${response.status}`,
      data?.code,
    )
  }

  return data as T
}

export interface ForgotPasswordResponse {
  accepted: boolean

  message: string

  developmentResetUrl?: string

  executionAuthorized: false
}

export interface ResetPasswordResponse {
  reset: boolean

  message: string

  executionAuthorized: false
}

export const passwordResetApi = {
  requestReset: (email: string) =>
    post<ForgotPasswordResponse>(
      '/api/v1/auth/forgot-password',
      {
        email,
      },
    ),

  resetPassword: (
    token: string,
    password: string,
  ) =>
    post<ResetPasswordResponse>(
      '/api/v1/auth/reset-password',
      {
        token,
        password,
      },
    ),
}