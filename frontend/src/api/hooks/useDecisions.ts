import { signalApi } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

function useTenantId() {
  return useAuthStore((s) => s.organization?.tenantId ?? '')
}

export function useDecisions(params?: Record<string, string>) {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['decisions', tenantId, params],
    queryFn: async () => {
      const res = await signalApi.listDecisions(tenantId, params) as any
      // Backend returns { recentDecisions: [], summary: {} }
      return {
        decisions: res?.recentDecisions ?? (Array.isArray(res) ? res : []),
        total: res?.summary?.total ?? res?.recentDecisions?.length ?? 0,
        summary: res?.summary ?? {},
      }
    },
    enabled: !!tenantId,
    refetchInterval: 30_000,
  })
}

export function useDecision(decisionId: string) {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['decisions', tenantId, decisionId],
    queryFn: () => signalApi.getDecision(tenantId, decisionId),
    enabled: !!tenantId && !!decisionId,
  })
}

export function useSubmitSignal() {
  const qc = useQueryClient()
  const tenantId = useTenantId()
  return useMutation({
    mutationFn: (signal: Record<string, unknown>) => signalApi.submit(tenantId, signal),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['decisions', tenantId] }),
  })
}
