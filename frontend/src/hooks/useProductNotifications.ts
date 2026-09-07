import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {
  productNotificationsApi,
  type ProductNotificationKind,
} from '@/api/productNotificationsApi'

import {
  type ProductQueryScope,
} from '@/product/productQueryKeys'

import {
  useProductRuntimeStore,
} from '@/store/productRuntimeStore'


function useScope():
  ProductQueryScope |
  null {
  const organizationId =
    useProductRuntimeStore(
      (
        state,
      ) =>
        state
          .organization
          ?.id,
    )


  const environmentId =
    useProductRuntimeStore(
      (
        state,
      ) =>
        state
          .environment
          ?.id,
    )


  const tenantEpoch =
    useProductRuntimeStore(
      (
        state,
      ) =>
        state
          .tenantEpoch,
    )


  if (
    !organizationId ||
    !environmentId
  ) {
    return null
  }


  return {
    organizationId,
    environmentId,
    tenantEpoch,
  }
}


function notificationKey(
  scope:
    ProductQueryScope,
) {
  return [
    'product',
    scope.organizationId,
    scope.environmentId,
    scope.tenantEpoch,
    'notifications',
  ] as const
}


export function useProductNotifications({
  unreadOnly =
    false,

  kind =
    null,
}: {
  unreadOnly?:
    boolean

  kind?:
    ProductNotificationKind |
    null
} = {}) {
  const scope =
    useScope()


  return useQuery({
    queryKey:
      scope
        ? [
            ...notificationKey(
              scope,
            ),

            'list',

            unreadOnly,

            kind,
          ]
        : [
            'product',
            'unavailable',
            'notifications',
          ],

    queryFn:
      () =>
        productNotificationsApi
          .list({
            unreadOnly,
            kind,
          }),

    enabled:
      Boolean(
        scope,
      ),

    staleTime:
      10_000,

    refetchInterval:
      30_000,

    refetchOnWindowFocus:
      true,
  })
}


export function useProductNotificationSummary() {
  const scope =
    useScope()


  return useQuery({
    queryKey:
      scope
        ? [
            ...notificationKey(
              scope,
            ),

            'summary',
          ]
        : [
            'product',
            'unavailable',
            'notification-summary',
          ],

    queryFn:
      () =>
        productNotificationsApi
          .summary(),

    enabled:
      Boolean(
        scope,
      ),

    staleTime:
      8_000,

    refetchInterval:
      20_000,

    refetchOnWindowFocus:
      true,
  })
}


function useInvalidateNotifications() {
  const queryClient =
    useQueryClient()


  return async () => {
    await queryClient
      .invalidateQueries({
        predicate:
          (
            query,
          ) =>
            Array.isArray(
              query.queryKey,
            ) &&
            query.queryKey
              .includes(
                'notifications',
              ),
      })


    await queryClient
      .invalidateQueries({
        predicate:
          (
            query,
          ) =>
            Array.isArray(
              query.queryKey,
            ) &&
            query.queryKey
              .includes(
                'notification-summary',
              ),
      })
  }
}


export function useMarkProductNotificationRead() {
  const invalidate =
    useInvalidateNotifications()


  return useMutation({
    mutationFn:
      (
        notificationId:
          string,
      ) =>
        productNotificationsApi
          .markRead(
            notificationId,
          ),

    onSuccess:
      invalidate,
  })
}


export function useMarkAllProductNotificationsRead() {
  const invalidate =
    useInvalidateNotifications()


  return useMutation({
    mutationFn:
      () =>
        productNotificationsApi
          .markAllRead(),

    onSuccess:
      invalidate,
  })
}


export function useDismissProductNotification() {
  const invalidate =
    useInvalidateNotifications()


  return useMutation({
    mutationFn:
      (
        notificationId:
          string,
      ) =>
        productNotificationsApi
          .dismiss(
            notificationId,
          ),

    onSuccess:
      invalidate,
  })
}