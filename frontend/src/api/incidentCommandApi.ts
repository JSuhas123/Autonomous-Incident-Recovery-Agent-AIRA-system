import {
  ApiError,
} from '@/api/client'

import {
  useAuthStore,
} from '@/store/authStore'

import type {
  IncidentCommandReadResponse,
  IncidentCommandResult,
} from '@/types/incidentCommand'


const BASE_URL =
  import.meta.env.VITE_API_URL ??
  'http://localhost:5000'


interface CommandRequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  signal?: AbortSignal
}


async function commandRequest<T>(
  path: string,
  options: CommandRequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    signal,
  } = options


  const state =
    useAuthStore.getState()


  const headers: Record<string, string> = {
    Accept:
      'application/json',
  }


  /*
   * Canonical browser environment context.
   *
   * The backend validates this against authenticated tenancy.
   */
  if (
    state.activeEnvironment?.id
  ) {
    headers['X-AIRA-Environment-Id'] =
      state.activeEnvironment.id
  }


  if (
    body !==
      undefined
  ) {
    headers['Content-Type'] =
      'application/json'
  }


  if (
    method !==
      'GET' &&
    state.csrfToken
  ) {
    headers['X-CSRF-Token'] =
      state.csrfToken
  }


  const response =
    await fetch(
      `${BASE_URL}${path}`,
      {
        method,

        headers,

        credentials:
          'include',

        body:
          body ===
            undefined
            ? undefined
            : JSON.stringify(
                body,
              ),

        signal,
      },
    )


  if (
    response.status ===
      401
  ) {
    useAuthStore
      .getState()
      .setUnauthenticated()
  }


  const contentType =
    response.headers.get(
      'content-type',
    ) ??
    ''


  let data: unknown


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


  if (
    !response.ok
  ) {
    const error =
      data as {
        error?: string
        message?: string
        code?: string
      }


    throw new ApiError(
      response.status,

      error.error ??
        error.message ??
        `HTTP ${response.status}`,

      error.code,

      data,
    )
  }


  return data as T
}


function commandPath(
  incidentId: string,
  suffix = '',
) {
  return (
    `/api/v1/incidents/` +
    `${encodeURIComponent(incidentId)}` +
    `/command${suffix}`
  )
}


export const incidentCommandApi = {
  get: (
    incidentId: string,
    signal?: AbortSignal,
  ) =>
    commandRequest<IncidentCommandReadResponse>(
      commandPath(
        incidentId,
      ),
      {
        signal,
      },
    ),


  acknowledge: (
    incidentId: string,
    body: {
      taskId: string
    },
  ) =>
    commandRequest<IncidentCommandResult>(
      commandPath(
        incidentId,
        '/acknowledge',
      ),
      {
        method:
          'POST',

        body,
      },
    ),


  requestControl: (
    incidentId: string,
    body: {
      taskId: string

      reason?: string

      sessionExpiresAt?: string

      metadata?: Record<string, unknown>
    },
  ) =>
    commandRequest<IncidentCommandResult>(
      commandPath(
        incidentId,
        '/take-control/request',
      ),
      {
        method:
          'POST',

        body,
      },
    ),


  authorizeControl: (
    incidentId: string,
    body: {
      sessionId: string

      metadata?: Record<string, unknown>
    },
  ) =>
    commandRequest<IncidentCommandResult>(
      commandPath(
        incidentId,
        '/take-control/authorize',
      ),
      {
        method:
          'POST',

        body,
      },
    ),


  acquireControl: (
    incidentId: string,
    body: {
      sessionId: string

      leaseDurationMs?: number

      expiresAt?: string

      metadata?: Record<string, unknown>
    },
  ) =>
    commandRequest<IncidentCommandResult>(
      commandPath(
        incidentId,
        '/take-control/acquire',
      ),
      {
        method:
          'POST',

        body,
      },
    ),


  heartbeatControl: (
    incidentId: string,
    body: {
      leaseId: string

      extensionMs?: number
    },
  ) =>
    commandRequest<IncidentCommandResult>(
      commandPath(
        incidentId,
        '/take-control/heartbeat',
      ),
      {
        method:
          'POST',

        body,
      },
    ),


  returnControl: (
    incidentId: string,
    body: {
      leaseId: string

      reason?: string

      metadata?: Record<string, unknown>
    },
  ) =>
    commandRequest<IncidentCommandResult>(
      commandPath(
        incidentId,
        '/return-control',
      ),
      {
        method:
          'POST',

        body,
      },
    ),
}