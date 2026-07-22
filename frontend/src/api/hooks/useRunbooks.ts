import { runbookApi } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

function useTenantId() {
  return useAuthStore((s) => s.credentials?.tenantId ?? '')
}

export function useRunbooks() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['runbooks', tenantId],
    queryFn: () => runbookApi.list(tenantId),
    enabled: !!tenantId,
  })
}

export function useRunbook(runbookId: string) {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['runbooks', tenantId, runbookId],
    queryFn: () => runbookApi.get(tenantId, runbookId),
    enabled: !!tenantId && !!runbookId,
  })
}

export function useRunbookExecutions(runbookId: string) {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['runbook-executions', tenantId, runbookId],
    queryFn: () => runbookApi.executions(tenantId, runbookId),
    enabled: !!tenantId && !!runbookId,
  })
}

export function useExecuteRunbook() {
  const qc = useQueryClient()
  const tenantId = useTenantId()
  return useMutation({
    mutationFn: ({ runbookId, input }: { runbookId: string; input?: Record<string, unknown> }) =>
      runbookApi.execute(tenantId, runbookId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['runbook-executions', tenantId] }),
  })
}
