import { dashboardApi, type OnboardingStatus } from '@/api/client'
import { useQuery } from '@tanstack/react-query'

export function useOnboardingStatus() {
  return useQuery<OnboardingStatus>({
    queryKey: ['dashboard', 'onboarding'],
    queryFn: async ({ signal }) => {
      const res = await dashboardApi.onboarding(signal)
      return res.data
    },
    staleTime: 60_000,
  })
}
