import { verificationApi } from '@/api/client'
import type { VerificationMethod } from '@/types/verification'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

const KEY = (serviceId: string) => ['verification', serviceId]

export function useVerificationStatus(serviceId: string) {
  return useQuery({
    queryKey: KEY(serviceId),
    queryFn: ({ signal }) => verificationApi.get(serviceId, signal),
    enabled: !!serviceId,
  })
}

export function useCreateChallenge(serviceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (method: VerificationMethod) => verificationApi.challenge(serviceId, method),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(serviceId) }),
  })
}

export function useRunVerificationCheck(serviceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => verificationApi.check(serviceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY(serviceId) })
      qc.invalidateQueries({ queryKey: ['services'] })
    },
  })
}

export function useRegenerateChallenge(serviceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (method: VerificationMethod) => verificationApi.regenerate(serviceId, method),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(serviceId) }),
  })
}
