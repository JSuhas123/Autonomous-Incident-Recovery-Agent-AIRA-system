import { serviceApi } from '@/api/client'
import type { CreateServiceBody, ServiceListParams, UpdateServiceBody } from '@/types/service'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

const SERVICES_KEY = 'services'

export function useServices(params?: ServiceListParams) {
  return useQuery({
    queryKey: [SERVICES_KEY, params],
    queryFn: ({ signal }) => serviceApi.list(params, signal),
  })
}

export function useService(id: string) {
  return useQuery({
    queryKey: [SERVICES_KEY, id],
    queryFn: ({ signal }) => serviceApi.get(id, signal),
    enabled: !!id,
  })
}

export function useCreateService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateServiceBody) => serviceApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [SERVICES_KEY] }),
  })
}

export function useUpdateService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateServiceBody }) =>
      serviceApi.update(id, body),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [SERVICES_KEY] })
      qc.invalidateQueries({ queryKey: [SERVICES_KEY, id] })
    },
  })
}

export function usePauseService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => serviceApi.pause(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [SERVICES_KEY] }),
  })
}

export function useResumeService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => serviceApi.resume(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [SERVICES_KEY] }),
  })
}

export function useArchiveService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => serviceApi.archive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [SERVICES_KEY] }),
  })
}
