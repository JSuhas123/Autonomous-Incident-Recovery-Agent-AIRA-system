import {
  coverageApi,
  dashboardApi,
  type CoverageDomain,
  type CoverageResource,
  type CoverageSnapshot,
  type CoverageSummary,
  type OnboardingStatus,
} from '@/api/client'

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'


export function useOnboardingStatus() {
  return useQuery<OnboardingStatus>({
    queryKey: [
      'dashboard',
      'onboarding',
    ],

    queryFn: async ({
      signal,
    }) => {
      const res =
        await dashboardApi
          .onboarding(
            signal,
          )

      return res.data
    },

    staleTime:
      60_000,
  })
}


/**
 * ============================================================================
 * PHASE 19 RECOVERY COVERAGE
 * ============================================================================
 */


export function useCoverageSummary() {
  return useQuery<CoverageSummary>({
    queryKey: [
      'coverage',
      'summary',
    ],

    queryFn: async ({
      signal,
    }) => {
      const response =
        await coverageApi
          .summary(
            signal,
          )

      return response.data
    },

    staleTime:
      30_000,
  })
}


export function useCoverageDomains() {
  return useQuery<CoverageDomain[]>({
    queryKey: [
      'coverage',
      'domains',
    ],

    queryFn: async ({
      signal,
    }) => {
      const response =
        await coverageApi
          .domains(
            signal,
          )

      return response.data
    },

    staleTime:
      30_000,
  })
}


export function useCoverageResources() {
  return useQuery<CoverageResource[]>({
    queryKey: [
      'coverage',
      'resources',
    ],

    queryFn: async ({
      signal,
    }) => {
      const response =
        await coverageApi
          .resources(
            {
              limit:
                100,
            },

            signal,
          )

      return response.data
    },

    staleTime:
      30_000,
  })
}


export function useCoverageHistory() {
  return useQuery<CoverageSnapshot[]>({
    queryKey: [
      'coverage',
      'history',
    ],

    queryFn: async ({
      signal,
    }) => {
      const response =
        await coverageApi
          .history(
            {
              limit:
                10,
            },

            signal,
          )

      return response.data
    },

    staleTime:
      30_000,
  })
}


export function useRefreshCoverage() {
  const queryClient =
    useQueryClient()


  return useMutation({
    mutationFn:
      async () => {
        const response =
          await coverageApi
            .refresh()

        return response.data
      },


    onSuccess:
      async () => {
        await Promise.all([
          queryClient
            .invalidateQueries({
              queryKey: [
                'coverage',
              ],
            }),

          queryClient
            .invalidateQueries({
              queryKey: [
                'dashboard',
              ],
            }),
        ])
      },
  })
}