import { integrationApi } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { useQuery } from '@tanstack/react-query'

function useTenantId() {
  return useAuthStore((s) => s.credentials?.tenantId ?? '')
}

export function useWebhookEvents() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['webhook-events', tenantId],
    queryFn: () => integrationApi.webhookHistory(tenantId),
    enabled: !!tenantId,
  })
}

export function useWebhookStats() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['webhook-stats', tenantId],
    queryFn: () => integrationApi.webhookStats(tenantId),
    enabled: !!tenantId,
  })
}
