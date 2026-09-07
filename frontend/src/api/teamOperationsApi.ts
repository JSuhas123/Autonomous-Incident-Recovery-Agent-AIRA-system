import {
  getProductScopeSignal,
} from '@/product/productScope'

import {
  useAuthStore,
} from '@/store/authStore'


const BASE_URL =
  import.meta.env
    .VITE_API_URL ??
  'http://localhost:5000'


export interface NotificationChannel {
  public_id:
    string

  name:
    string

  channel_type:
    'email' |
    'slack' |
    'pagerduty' |
    'webhook'

  status:
    'active' |
    'disabled'

  destination:
    string

  configuration:
    Record<
      string,
      unknown
    >

  metadata:
    Record<
      string,
      unknown
    >
}


export interface NotificationRoutingRule {
  public_id:
    string

  environment_id:
    string | null

  name:
    string

  enabled:
    boolean

  priority:
    number

  event_types:
    string[]

  severities:
    string[]

  channel_ids:
    string[]

  stop_processing:
    boolean
}


export interface OrganizationTeam {
  id?:
    string

  publicId?:
    string

  public_id?:
    string

  name:
    string

  description?:
    string | null

  status?:
    string
}


async function get<T>(
  path:
    string,
): Promise<T> {
  const state =
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
    state
      .activeEnvironment
      ?.id
  ) {
    headers[
      'X-AIRA-Environment-Id'
    ] =
      state
        .activeEnvironment
        .id
  }


  const response =
    await fetch(
      `${BASE_URL}${path}`,
      {
        method:
          'GET',

        credentials:
          'include',

        headers,

        signal:
          getProductScopeSignal(),
      },
    )


  const payload:
    any =
    await response
      .json()
      .catch(
        () => null,
      )


  if (
    !response.ok
  ) {
    throw new Error(
      payload
        ?.error
        ?.message ??
      payload
        ?.message ??
      'Team operations request failed.',
    )
  }


  return payload as T
}


export const teamOperationsApi = {
  async channels() {
    const response =
      await get<{
        channels:
          NotificationChannel[]
      }>(
        '/api/v1/notification-routing/channels',
      )


    return response.channels
  },


  async rules() {
    const response =
      await get<{
        rules:
          NotificationRoutingRule[]
      }>(
        '/api/v1/notification-routing/rules',
      )


    return response.rules
  },


  async teams() {
    const response =
      await get<{
        count:
          number

        teams:
          OrganizationTeam[]
      }>(
        '/api/v1/organizations/current/teams',
      )


    return response.teams
  },
}