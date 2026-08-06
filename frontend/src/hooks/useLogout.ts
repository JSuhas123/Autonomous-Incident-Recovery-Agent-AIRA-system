import { authApi } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

export function useLogout() {
  const { setUnauthenticated } = useAuthStore()
  const navigate = useNavigate()

  return useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // Proceed with local cleanup even if backend revocation fails
    }
    setUnauthenticated()
    navigate('/login', { replace: true })
  }, [setUnauthenticated, navigate])
}
