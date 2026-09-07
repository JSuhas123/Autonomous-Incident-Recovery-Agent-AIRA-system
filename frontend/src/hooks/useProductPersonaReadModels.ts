import {
  useQuery,
} from '@tanstack/react-query'

import {
  productPersonaApi,
} from '@/api/productPersonaApi'

import {
  useProductRuntimeStore,
} from '@/store/productRuntimeStore'


function useScope() {
  const organizationId =
    useProductRuntimeStore(
      (state) =>
        state.organization?.id,
    )

  const environmentId =
    useProductRuntimeStore(
      (state) =>
        state.environment?.id,
    )

  const tenantEpoch =
    useProductRuntimeStore(
      (state) =>
        state.tenantEpoch,
    )

  return {
    organizationId,
    environmentId,
    tenantEpoch,

    enabled:
      Boolean(
        organizationId &&
        environmentId,
      ),
  }
}


export function useProductReliability() {
  const scope =
    useScope()

  return useQuery({
    queryKey: [
      'product',
      scope.organizationId,
      scope.environmentId,
      scope.tenantEpoch,
      'reliability',
    ],

    queryFn:
      productPersonaApi
        .reliability,

    enabled:
      scope.enabled,

    staleTime:
      15_000,

    refetchInterval:
      30_000,

    refetchOnWindowFocus:
      true,
  })
}


export function useProductExecutive() {
  const scope =
    useScope()

  return useQuery({
    queryKey: [
      'product',
      scope.organizationId,
      scope.environmentId,
      scope.tenantEpoch,
      'executive',
    ],

    queryFn:
      productPersonaApi
        .executive,

    enabled:
      scope.enabled,

    staleTime:
      30_000,

    refetchOnWindowFocus:
      true,
  })
}


export function useProductGovernance() {
  const scope =
    useScope()

  return useQuery({
    queryKey: [
      'product',
      scope.organizationId,
      scope.environmentId,
      scope.tenantEpoch,
      'governance',
    ],

    queryFn:
      productPersonaApi
        .governance,

    enabled:
      scope.enabled,

    staleTime:
      15_000,

    refetchInterval:
      30_000,

    refetchOnWindowFocus:
      true,
  })
}


export function useProductDeveloper() {
  const scope =
    useScope()

  return useQuery({
    queryKey: [
      'product',
      scope.organizationId,
      scope.environmentId,
      scope.tenantEpoch,
      'developer',
    ],

    queryFn:
      productPersonaApi
        .developer,

    enabled:
      scope.enabled,

    staleTime:
      15_000,

    refetchInterval:
      30_000,

    refetchOnWindowFocus:
      true,
  })
}