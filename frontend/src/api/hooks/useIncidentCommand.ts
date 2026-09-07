import {
  incidentCommandApi,
} from '@/api/incidentCommandApi'

import {
  productQueryKeys,
  type ProductQueryScope,
} from '@/product/productQueryKeys'

import {
  useProductRuntimeStore,
} from '@/store/productRuntimeStore'

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'


function useCommandScope():
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


function commandKey(
  scope:
    ProductQueryScope,
  incidentId:
    string,
) {
  return [
    ...productQueryKeys
      .incidents(
        scope,
      ),

    incidentId,

    'command',
  ] as const
}


function useCommandInvalidation() {
  const queryClient =
    useQueryClient()


  return async () => {
    await queryClient
      .invalidateQueries({
        queryKey: [
          'product',
        ],
      })
  }
}


export function useIncidentCommand(
  incidentId:
    string,
) {
  const scope =
    useCommandScope()


  return useQuery({
    queryKey:
      scope
        ? commandKey(
            scope,
            incidentId,
          )
        : [
            'incident-command',
            'unavailable',
            incidentId,
          ],

    queryFn: ({
      signal,
    }) =>
      incidentCommandApi
        .get(
          incidentId,
          signal,
        ),

    enabled:
      Boolean(
        scope &&
        incidentId,
      ),

    refetchInterval:
      15_000,

    refetchOnWindowFocus:
      true,
  })
}


export function useAcknowledgeHumanTask() {
  const invalidate =
    useCommandInvalidation()


  return useMutation({
    mutationFn: ({
      incidentId,
      taskId,
    }: {
      incidentId:
        string

      taskId:
        string
    }) =>
      incidentCommandApi
        .acknowledge(
          incidentId,
          {
            taskId,
          },
        ),

    onSuccess:
      invalidate,
  })
}


export function useRequestHumanControl() {
  const invalidate =
    useCommandInvalidation()


  return useMutation({
    mutationFn: ({
      incidentId,
      taskId,
      reason,
    }: {
      incidentId:
        string

      taskId:
        string

      reason?:
        string
    }) =>
      incidentCommandApi
        .requestControl(
          incidentId,
          {
            taskId,
            reason,
          },
        ),

    onSuccess:
      invalidate,
  })
}


export function useAuthorizeHumanControl() {
  const invalidate =
    useCommandInvalidation()


  return useMutation({
    mutationFn: ({
      incidentId,
      sessionId,
    }: {
      incidentId:
        string

      sessionId:
        string
    }) =>
      incidentCommandApi
        .authorizeControl(
          incidentId,
          {
            sessionId,
          },
        ),

    onSuccess:
      invalidate,
  })
}


export function useAcquireHumanControl() {
  const invalidate =
    useCommandInvalidation()


  return useMutation({
    mutationFn: ({
      incidentId,
      sessionId,
      leaseDurationMs,
    }: {
      incidentId:
        string

      sessionId:
        string

      leaseDurationMs?:
        number
    }) =>
      incidentCommandApi
        .acquireControl(
          incidentId,
          {
            sessionId,

            leaseDurationMs:
              leaseDurationMs ??
              300_000,
          },
        ),

    onSuccess:
      invalidate,
  })
}


export function useHeartbeatHumanControl() {
  const invalidate =
    useCommandInvalidation()


  return useMutation({
    mutationFn: ({
      incidentId,
      leaseId,
      extensionMs,
    }: {
      incidentId:
        string

      leaseId:
        string

      extensionMs?:
        number
    }) =>
      incidentCommandApi
        .heartbeatControl(
          incidentId,
          {
            leaseId,

            extensionMs:
              extensionMs ??
              300_000,
          },
        ),

    onSuccess:
      invalidate,
  })
}


export function useReturnHumanControl() {
  const invalidate =
    useCommandInvalidation()


  return useMutation({
    mutationFn: ({
      incidentId,
      leaseId,
      reason,
    }: {
      incidentId:
        string

      leaseId:
        string

      reason?:
        string
    }) =>
      incidentCommandApi
        .returnControl(
          incidentId,
          {
            leaseId,
            reason,
          },
        ),

    onSuccess:
      invalidate,
  })
}