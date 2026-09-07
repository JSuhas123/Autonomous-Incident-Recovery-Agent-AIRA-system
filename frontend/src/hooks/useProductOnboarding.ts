import {
  useQuery,
} from '@tanstack/react-query'

import {
  productOnboardingApi,
} from '@/api/productOnboardingApi'

import {
  useProductRuntimeStore,
} from '@/store/productRuntimeStore'


export function useProductOnboarding() {
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


  const enabled =
    Boolean(
      organizationId &&
      environmentId,
    )


  return useQuery({
    queryKey:
      enabled
        ? [
            'product',
            organizationId,
            environmentId,
            tenantEpoch,
            'onboarding',
          ]
        : [
            'product',
            'unavailable',
            'onboarding',
          ],

    queryFn:
      () =>
        productOnboardingApi
          .get(),

    enabled,

    staleTime:
      15_000,

    refetchInterval:
      30_000,

    refetchOnWindowFocus:
      true,
  })
}