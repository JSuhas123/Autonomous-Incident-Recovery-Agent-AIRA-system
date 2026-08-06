import { integrationApi, integrationCatalogueApi, integrationConnectionApi } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateConnectionBody, UpdateConnectionBody } from '../../types/integration'

function useTenantId() {
  return useAuthStore((s) => s.organization?.tenantId ?? '')
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

// ─── Phase 6 — Catalogue + Connection hooks ───────────────────────────────

export const CATALOGUE_KEY   = ['integration-definitions'] as const
export const CONNECTIONS_KEY = ['integration-connections'] as const

export function useIntegrationDefinitions() {
  return useQuery({
    queryKey: CATALOGUE_KEY,
    queryFn: () => integrationCatalogueApi.listDefinitions().then((r) => r.definitions),
    staleTime: 5 * 60 * 1000,
  })
}

export function useIntegrationConnections() {
  return useQuery({
    queryKey: CONNECTIONS_KEY,
    queryFn: () => integrationConnectionApi.list().then((r) => r.integrations),
  })
}

export function useIntegrationConnection(id: string) {
  return useQuery({
    queryKey: [...CONNECTIONS_KEY, id],
    queryFn: () => integrationConnectionApi.get(id).then((r) => r.integration),
    enabled: !!id,
  })
}

export function useCreateConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateConnectionBody) =>
      integrationConnectionApi.create(body).then((r) => r.integration),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONNECTIONS_KEY }),
  })
}

export function useUpdateConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateConnectionBody }) =>
      integrationConnectionApi.update(id, body).then((r) => r.integration),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONNECTIONS_KEY }),
  })
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (id: string) => integrationConnectionApi.test(id),
  })
}

export function useDisableConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => integrationConnectionApi.disable(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONNECTIONS_KEY }),
  })
}

export function useRotateSecret() {
  return useMutation({
    mutationFn: ({ id, secret }: { id: string; secret: string }) =>
      integrationConnectionApi.rotateSecret(id, secret),
  })
}

export function useDeleteConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => integrationConnectionApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONNECTIONS_KEY }),
  })
}
