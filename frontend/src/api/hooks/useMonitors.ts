import { monitorApi } from '@/api/client'
import type { CreateMonitorBody, UpdateMonitorBody } from '@/types/monitor'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

const MONITORS_KEY = 'monitors'
const CHECKS_KEY   = 'monitor-checks'

/** All monitors for a specific service */
export function useServiceMonitors(serviceId: string | undefined) {
  return useQuery({
    queryKey: [MONITORS_KEY, 'service', serviceId],
    queryFn: ({ signal }) => monitorApi.listForService(serviceId!, signal),
    enabled: !!serviceId,
  })
}

/** All monitors for the authenticated org (cross-service) */
export function useAllMonitors() {
  return useQuery({
    queryKey: [MONITORS_KEY, 'all'],
    queryFn: ({ signal }) => monitorApi.listAll(signal),
  })
}

/** Single monitor by ID */
export function useMonitor(monitorId: string | undefined) {
  return useQuery({
    queryKey: [MONITORS_KEY, monitorId],
    queryFn: ({ signal }) => monitorApi.get(monitorId!, signal),
    enabled: !!monitorId,
  })
}

/** Paginated check history for a monitor */
export function useMonitorChecks(
  monitorId: string | undefined,
  params?: { limit?: number; before?: string }
) {
  return useQuery({
    queryKey: [CHECKS_KEY, monitorId, params],
    queryFn: ({ signal }) => monitorApi.checks(monitorId!, params, signal),
    enabled: !!monitorId,
  })
}

/** Create a monitor */
export function useCreateMonitor(serviceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateMonitorBody) => monitorApi.create(serviceId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [MONITORS_KEY, 'service', serviceId] })
      qc.invalidateQueries({ queryKey: [MONITORS_KEY, 'all'] })
    },
  })
}

/** Update monitor configuration */
export function useUpdateMonitor(monitorId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateMonitorBody) => monitorApi.update(monitorId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [MONITORS_KEY, monitorId] })
      qc.invalidateQueries({ queryKey: [MONITORS_KEY, 'all'] })
    },
  })
}

/** Pause a monitor */
export function usePauseMonitor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (monitorId: string) => monitorApi.pause(monitorId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [MONITORS_KEY] })
    },
  })
}

/** Resume a paused monitor */
export function useResumeMonitor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (monitorId: string) => monitorApi.resume(monitorId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [MONITORS_KEY] })
    },
  })
}

/** Run an immediate test check (not persisted) */
export function useTestMonitor() {
  return useMutation({
    mutationFn: (monitorId: string) => monitorApi.test(monitorId),
  })
}

/** Delete a monitor */
export function useDeleteMonitor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (monitorId: string) => monitorApi.delete(monitorId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [MONITORS_KEY] })
    },
  })
}
