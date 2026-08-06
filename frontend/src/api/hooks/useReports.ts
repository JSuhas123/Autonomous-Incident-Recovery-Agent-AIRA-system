import { reportApi } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { useMutation, useQuery } from '@tanstack/react-query'

function useTenantId() {
  return useAuthStore((s) => s.organization?.tenantId ?? '')
}

export function useReports() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['reports', tenantId],
    queryFn: () => reportApi.list(tenantId),
    enabled: !!tenantId,
  })
}

export function useGenerateReport() {
  const tenantId = useTenantId()
  return useMutation({
    mutationFn: (params: Record<string, unknown>) => reportApi.generate(tenantId, params),
  })
}
