import {
  incidentApi,
} from '@/api/client'

import {
  getProductScopeSignal,
} from '@/product/productScope'

import {
  productQueryKeys,
  type ProductQueryScope,
} from '@/product/productQueryKeys'

import {
  useProductRuntimeStore,
} from '@/store/productRuntimeStore'

import type {
  IncidentListParams,
} from '@/types/incident'

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'


function useIncidentScope():
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


export function useIncidents(
  params?:
    IncidentListParams,
) {
  const scope =
    useIncidentScope()


  return useQuery({
    queryKey:
      scope
        ? [
            ...productQueryKeys
              .incidents(
                scope,
              ),

            'legacy-list',

            params ??
            {},
          ]
        : [
            'incidents',
            'unavailable',
          ],

    queryFn:
      () =>
        incidentApi.list(
          params,

          getProductScopeSignal(),
        ),

    enabled:
      Boolean(
        scope,
      ),
  })
}


export function useIncident(
  incidentId:
    string,
) {
  const scope =
    useIncidentScope()


  return useQuery({
    queryKey:
      scope
        ? [
            ...productQueryKeys
              .incidents(
                scope,
              ),

            incidentId,
          ]
        : [
            'incidents',
            'unavailable',
            incidentId,
          ],

    queryFn:
      () =>
        incidentApi.get(
          incidentId,

          getProductScopeSignal(),
        ),

    enabled:
      Boolean(
        scope &&
        incidentId,
      ),
  })
}


export function useIncidentTimeline(
  incidentId:
    string,
) {
  const scope =
    useIncidentScope()


  return useQuery({
    queryKey:
      scope
        ? [
            ...productQueryKeys
              .incidents(
                scope,
              ),

            incidentId,

            'timeline',
          ]
        : [
            'incidents',
            'unavailable',
            incidentId,
            'timeline',
          ],

    queryFn:
      () =>
        incidentApi.timeline(
          incidentId,

          getProductScopeSignal(),
        ),

    enabled:
      Boolean(
        scope &&
        incidentId,
      ),
  })
}


export function useAcknowledgeIncident() {
  const queryClient =
    useQueryClient()


  return useMutation({
    mutationFn: ({
      incidentId,
      note,
    }: {
      incidentId:
        string

      note?:
        string
    }) =>
      incidentApi
        .acknowledge(
          incidentId,
          {
            note,
          },
        ),

    onSuccess:
      async () => {
        await queryClient
          .invalidateQueries({
            queryKey: [
              'product',
            ],
          })
      },
  })
}


export function useResolveIncident() {
  const queryClient =
    useQueryClient()


  return useMutation({
    mutationFn: ({
      incidentId,
      resolution,
    }: {
      incidentId:
        string

      resolution?:
        string
    }) =>
      incidentApi
        .resolve(
          incidentId,
          {
            resolution,
          },
        ),

    onSuccess:
      async () => {
        await queryClient
          .invalidateQueries({
            queryKey: [
              'product',
            ],
          })
      },
  })
}


export function useReopenIncident() {
  const queryClient =
    useQueryClient()


  return useMutation({
    mutationFn: ({
      incidentId,
      reason,
    }: {
      incidentId:
        string

      reason?:
        string
    }) =>
      incidentApi
        .reopen(
          incidentId,
          {
            reason,
          },
        ),

    onSuccess:
      async () => {
        await queryClient
          .invalidateQueries({
            queryKey: [
              'product',
            ],
          })
      },
  })
}