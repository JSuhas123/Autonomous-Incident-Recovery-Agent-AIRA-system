import { healthApi } from '@/api/client'
import { useQuery } from '@tanstack/react-query'

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => healthApi.check(),
    refetchInterval: 30_000,
    retry: 1,
  })
}
