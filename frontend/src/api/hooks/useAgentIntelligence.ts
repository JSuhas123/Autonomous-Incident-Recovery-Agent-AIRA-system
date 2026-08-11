import { incidentApi } from '@/api/client'
import type { AgentIntelligence } from '@/types/agentIntelligence'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

const POLL_INTERVAL_MS = 4_000

function isTerminalState(state?: string) {
  return state === 'COMPLETED' || state === 'MANUAL_REQUIRED' || state === 'FAILED'
}

export function useAgentIntelligence(incidentId: string) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['incidents', incidentId, 'intelligence'],
    queryFn: ({ signal }) => incidentApi.intelligence(incidentId, signal),
    enabled: !!incidentId,
    // Keep polling while analysis is in progress
    refetchInterval: (query) =>
      isTerminalState((query.state.data as AgentIntelligence | undefined)?.state)
        ? false
        : POLL_INTERVAL_MS,
  })

  return { intelligence: data, isLoading, error, refetch }
}

export function useAgentTrace(incidentId: string) {
  return useQuery({
    queryKey: ['incidents', incidentId, 'agent-trace'],
    queryFn: ({ signal }) => incidentApi.agentTrace(incidentId, signal),
    enabled: !!incidentId,
  })
}

export function useTriggerAnalysis(incidentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => incidentApi.analyze(incidentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents', incidentId, 'intelligence'] })
      qc.invalidateQueries({ queryKey: ['incidents', incidentId, 'agent-trace'] })
    },
  })
}

export function useRetryAnalysis(incidentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => incidentApi.retryAnalysis(incidentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents', incidentId, 'intelligence'] })
      qc.invalidateQueries({ queryKey: ['incidents', incidentId, 'agent-trace'] })
    },
  })
}
