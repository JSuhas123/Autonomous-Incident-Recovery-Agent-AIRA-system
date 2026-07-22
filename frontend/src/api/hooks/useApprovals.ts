import { approvalApi } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

function useTenantId() {
  return useAuthStore((s) => s.credentials?.tenantId ?? '')
}

function useKeyId() {
  return useAuthStore((s) => s.credentials?.keyId ?? 'system')
}

export function useApprovals(status?: string) {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['approvals', tenantId, status],
    queryFn: () => approvalApi.list(tenantId, status),
    enabled: !!tenantId,
  })
}

export function useApproval(approvalId: string) {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['approvals', tenantId, approvalId],
    queryFn: () => approvalApi.get(tenantId, approvalId),
    enabled: !!tenantId && !!approvalId,
  })
}

export function useApprovalStats() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['approvals-stats', tenantId],
    queryFn: () => approvalApi.stats(tenantId),
    enabled: !!tenantId,
  })
}

export function useApprove() {
  const qc = useQueryClient()
  const tenantId = useTenantId()
  const keyId = useKeyId()
  return useMutation({
    mutationFn: ({ approvalId, comment }: { approvalId: string; comment?: string }) =>
      approvalApi.approve(tenantId, approvalId, { approvedBy: keyId, comment }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals', tenantId] }),
  })
}

export function useReject() {
  const qc = useQueryClient()
  const tenantId = useTenantId()
  const keyId = useKeyId()
  return useMutation({
    mutationFn: ({ approvalId, reason }: { approvalId: string; reason?: string }) =>
      approvalApi.reject(tenantId, approvalId, { rejectedBy: keyId, reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals', tenantId] }),
  })
}
