import { policyApi } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

function useTenantId() {
  return useAuthStore((s) => s.organization?.tenantId ?? '')
}

export function usePolicies() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['policies', tenantId],
    queryFn: () => policyApi.get(tenantId),
    enabled: !!tenantId,
  })
}

export function usePolicyVersions() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['policy-versions', tenantId],
    queryFn: () => policyApi.versions(tenantId),
    enabled: !!tenantId,
  })
}

export function useValidatePolicy() {
  const tenantId = useTenantId()
  return useMutation({
    mutationFn: (yaml: string) => policyApi.validate(tenantId, yaml),
  })
}

export function useUpdatePolicy() {
  const qc = useQueryClient()
  const tenantId = useTenantId()
  return useMutation({
    mutationFn: (yaml: string) => policyApi.update(tenantId, yaml),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['policies', tenantId] })
      qc.invalidateQueries({ queryKey: ['policy-versions', tenantId] })
    },
  })
}

export function useDryRunPolicy() {
  const tenantId = useTenantId()
  return useMutation({
    mutationFn: ({ yaml, signal }: { yaml: string; signal: Record<string, unknown> }) =>
      policyApi.dryRun(tenantId, yaml, signal),
  })
}
