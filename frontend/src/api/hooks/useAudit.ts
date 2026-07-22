import { actionLogApi } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { useQuery } from '@tanstack/react-query'

function useTenantId() {
  return useAuthStore((s) => s.credentials?.tenantId ?? '')
}

export function useAuditLogs(params?: Record<string, string>) {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['audit-logs', tenantId, params],
    queryFn: () => actionLogApi.list(tenantId, params),
    enabled: !!tenantId,
  })
}
