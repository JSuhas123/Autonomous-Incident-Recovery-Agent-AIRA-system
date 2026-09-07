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


export type ProductNotificationKind =
  | 'incident'
  | 'approval'
  | 'human_task'
  | 'recovery'
  | 'trust'
  | 'certification'
  | 'integration'
  | 'policy'
  | 'security'
  | 'onboarding'
  | 'system'


export type ProductNotificationSeverity =
  | 'CRITICAL'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'INFO'


export interface ProductNotification {
  id:
    string

  organizationId:
    string

  environmentId:
    string | null

  kind:
    ProductNotificationKind

  severity:
    ProductNotificationSeverity

  title:
    string

  message:
    string

  sourceType:
    string

  sourceRef:
    string

  incidentId:
    string | null

  humanTaskId:
    string | null

  approvalId:
    string | null

  recoveryId:
    string | null

  certificationId:
    string | null

  integrationId:
    string | null

  targetType:
    'organization' |
    'team' |
    'user'

  actionPath:
    string | null

  metadata:
    Record<
      string,
      unknown
    >

  read:
    boolean

  readAt:
    string | null

  dismissed:
    boolean

  dismissedAt:
    string | null

  createdAt:
    string

  executionAuthorized:
    false
}


export interface ProductNotificationSummary {
  unreadCount:
    number

  criticalUnread:
    number

  highUnread:
    number

  totalVisible:
    number

  executionAuthorized:
    false
}


class ProductNotificationApiError
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
      'ProductNotificationApiError'
  }
}


function headers() {
  const state =
    useAuthStore
      .getState()


  const result:
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
    result[
      'X-AIRA-Environment-Id'
    ] =
      state
        .activeEnvironment
        .id
  }


  if (
    state.csrfToken
  ) {
    result[
      'X-CSRF-Token'
    ] =
      state.csrfToken
  }


  return result
}


async function request<T>(
  path:
    string,

  options: {
    method?:
      'GET' |
      'POST'

    signal?:
      AbortSignal
  } = {},
): Promise<T> {
  const response =
    await fetch(
      `${BASE_URL}${path}`,
      {
        method:
          options.method ??
          'GET',

        credentials:
          'include',

        headers:
          headers(),

        signal:
          options.signal ??
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
    throw new ProductNotificationApiError(
      response.status,

      payload
        ?.error
        ?.message ??
      payload
        ?.message ??
      'Notification request failed.',

      payload
        ?.error
        ?.code,
    )
  }


  if (
    payload
      ?.executionAuthorized !==
    false
  ) {
    throw new ProductNotificationApiError(
      500,

      'Notification response violated execution-authority boundary.',

      'PRODUCT_NOTIFICATION_AUTHORITY_VIOLATION',
    )
  }


  return payload
    .data as T
}


export const productNotificationsApi = {
  list({
    unreadOnly =
      false,

    kind,

    limit =
      50,
  }: {
    unreadOnly?:
      boolean

    kind?:
      ProductNotificationKind |
      null

    limit?:
      number
  } = {}) {
    const params =
      new URLSearchParams()


    params.set(
      'limit',
      String(
        limit,
      ),
    )


    if (
      unreadOnly
    ) {
      params.set(
        'unread',
        'true',
      )
    }


    if (
      kind
    ) {
      params.set(
        'kind',
        kind,
      )
    }


    return request<
      ProductNotification[]
    >(
      `/api/v1/product/notifications?${params.toString()}`,
    )
  },


  summary() {
    return request<
      ProductNotificationSummary
    >(
      '/api/v1/product/notifications/summary',
    )
  },


  markRead(
    notificationId:
      string,
  ) {
    return request<{
      read:
        true

      notificationId:
        string

      humanTaskAcknowledged:
        false

      incidentAcknowledged:
        false

      executionAuthorized:
        false
    }>(
      `/api/v1/product/notifications/${encodeURIComponent(
        notificationId,
      )}/read`,

      {
        method:
          'POST',
      },
    )
  },


  markAllRead() {
    return request<{
      updated:
        number

      executionAuthorized:
        false
    }>(
      '/api/v1/product/notifications/read-all',

      {
        method:
          'POST',
      },
    )
  },


  dismiss(
    notificationId:
      string,
  ) {
    return request<{
      dismissed:
        true

      notificationId:
        string

      executionAuthorized:
        false
    }>(
      `/api/v1/product/notifications/${encodeURIComponent(
        notificationId,
      )}/dismiss`,

      {
        method:
          'POST',
      },
    )
  },
}