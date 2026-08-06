import { safetyApi } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

function useTenantId() {
  return useAuthStore((s) => s.organization?.tenantId ?? '')
}

export function useKillSwitches() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['kill-switches', tenantId],
    queryFn: () => safetyApi.getKillSwitches(),
    enabled: !!tenantId,
    refetchInterval: 30_000,
  })
}

export function useThresholds() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['thresholds', tenantId],
    queryFn: () => safetyApi.getThresholds(),
    enabled: !!tenantId,
  })
}

export function useToggleKillSwitch() {
  const qc = useQueryClient()
  const tenantId = useTenantId()
  return useMutation({
    mutationFn: ({ action, scope }: { action: 'activate' | 'deactivate'; scope?: string }) =>
      safetyApi.toggleKillSwitch(tenantId, action, scope),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kill-switches', tenantId] }),
  })
}

export function useUpdateThresholds() {
  const qc = useQueryClient()
  const tenantId = useTenantId()
  return useMutation({
    mutationFn: (thresholds: Record<string, number>) =>
      safetyApi.updateThresholds(tenantId, thresholds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['thresholds', tenantId] }),
  })
}
