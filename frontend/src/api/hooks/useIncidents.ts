import { incidentApi } from '@/api/client'
import type { IncidentListParams } from '@/types/incident'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export function useIncidents(params?: IncidentListParams) {
  return useQuery({
    queryKey: ['incidents', params],
    queryFn: ({ signal }) => incidentApi.list(params, signal),
  })
}

export function useIncident(incidentId: string) {
  return useQuery({
    queryKey: ['incidents', incidentId],
    queryFn: ({ signal }) => incidentApi.get(incidentId, signal),
    enabled: !!incidentId,
  })
}

export function useIncidentTimeline(incidentId: string) {
  return useQuery({
    queryKey: ['incidents', incidentId, 'timeline'],
    queryFn: ({ signal }) => incidentApi.timeline(incidentId, signal),
    enabled: !!incidentId,
  })
}

export function useAcknowledgeIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ incidentId, note }: { incidentId: string; note?: string }) =>
      incidentApi.acknowledge(incidentId, { note }),
    onSuccess: (_, { incidentId }) => {
      qc.invalidateQueries({ queryKey: ['incidents'] })
      qc.invalidateQueries({ queryKey: ['incidents', incidentId] })
    },
  })
}

export function useResolveIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ incidentId, resolution }: { incidentId: string; resolution?: string }) =>
      incidentApi.resolve(incidentId, { resolution }),
    onSuccess: (_, { incidentId }) => {
      qc.invalidateQueries({ queryKey: ['incidents'] })
      qc.invalidateQueries({ queryKey: ['incidents', incidentId] })
    },
  })
}

export function useReopenIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ incidentId, reason }: { incidentId: string; reason?: string }) =>
      incidentApi.reopen(incidentId, { reason }),
    onSuccess: (_, { incidentId }) => {
      qc.invalidateQueries({ queryKey: ['incidents'] })
      qc.invalidateQueries({ queryKey: ['incidents', incidentId] })
    },
  })
}
