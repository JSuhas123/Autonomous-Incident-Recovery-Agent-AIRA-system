import { confidenceApi, effectivenessApi } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { useQuery } from '@tanstack/react-query'

function useTenantId() {
  return useAuthStore((s) => s.credentials?.tenantId ?? '')
}

export function useConfidenceTrends() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['confidence-trends', tenantId],
    // confidenceApi.trends takes optional AbortSignal, NOT tenantId
    queryFn: () => confidenceApi.trends(),
    enabled: !!tenantId,
    refetchInterval: 60_000,
  })
}

export function useConfidenceWeights() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['confidence-weights', tenantId],
    queryFn: () => confidenceApi.weights(),
    enabled: !!tenantId,
  })
}

export function useActionAccuracy() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['action-accuracy', tenantId],
    queryFn: () => effectivenessApi.accuracy(),
    enabled: !!tenantId,
  })
}

export function useEffectivenessRecords() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['effectiveness', tenantId],
    queryFn: () => effectivenessApi.list(),
    enabled: !!tenantId,
  })
}
