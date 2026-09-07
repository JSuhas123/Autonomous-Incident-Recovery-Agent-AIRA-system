import {
    useQuery,
} from '@tanstack/react-query'

import {
    productReadModelApi,
} from '@/api/productReadModelApi'

import {
    productQueryKeys,
    type ProductQueryScope,
} from '@/product/productQueryKeys'

import {
    useProductRuntimeStore,
} from '@/store/productRuntimeStore'


function useScope():
  ProductQueryScope |
  null {
  const organization =
    useProductRuntimeStore(
      (
        state,
      ) =>
        state.organization,
    )


  const environment =
    useProductRuntimeStore(
      (
        state,
      ) =>
        state.environment,
    )


  const tenantEpoch =
    useProductRuntimeStore(
      (
        state,
      ) =>
        state.tenantEpoch,
    )


  if (
    !organization?.id ||
    !environment?.id
  ) {
    return null
  }


  return {
    organizationId:
      organization.id,

    environmentId:
      environment.id,

    tenantEpoch,
  }
}


export function useProductOverview() {
  const scope =
    useScope()


  return useQuery({
    queryKey:
      scope
        ? productQueryKeys
            .overview(
              scope,
            )
        : [
            'product',
            'unavailable',
            'overview',
          ],

    queryFn:
      () =>
        productReadModelApi
          .overview(),

    enabled:
      Boolean(
        scope,
      ),

    staleTime:
      15_000,
  })
}


export function useProductOperations() {
  const scope =
    useScope()


  return useQuery({
    queryKey:
      scope
        ? productQueryKeys
            .operations(
              scope,
            )
        : [
            'product',
            'unavailable',
            'operations',
          ],

    queryFn:
      () =>
        productReadModelApi
          .operations(),

    enabled:
      Boolean(
        scope,
      ),

    staleTime:
      10_000,

    refetchInterval:
      30_000,
  })
}


export function useProductIncidents() {
  const scope =
    useScope()


  return useQuery({
    queryKey:
      scope
        ? productQueryKeys
            .incidents(
              scope,
            )
        : [
            'product',
            'unavailable',
            'incidents',
          ],

    queryFn:
      () =>
        productReadModelApi
          .incidents(),

    enabled:
      Boolean(
        scope,
      ),

    staleTime:
      10_000,

    refetchInterval:
      30_000,
  })
}


export function useProductShadowMode() {
  const scope =
    useScope()


  return useQuery({
    queryKey:
      scope
        ? productQueryKeys
            .shadow(
              scope,
            )
        : [
            'product',
            'unavailable',
            'shadow',
          ],

    queryFn:
      () =>
        productReadModelApi
          .shadow(),

    enabled:
      Boolean(
        scope,
      ),

    staleTime:
      15_000,

    refetchInterval:
      30_000,
  })
}