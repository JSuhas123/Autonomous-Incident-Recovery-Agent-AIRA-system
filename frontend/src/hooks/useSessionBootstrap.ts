import { authApi } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import type { SafeMembership, SafeOrganization, SafeSession, SafeUser } from '@/types'
import { useEffect, useRef } from 'react'

/**
 * Bootstraps auth state on application load by calling GET /api/v1/auth/session.
 * Must be mounted at the root of the application.
 */
export function useSessionBootstrap() {
  const { setAuthenticated, setUnauthenticated, status } = useAuthStore()
  const bootstrapped = useRef(false)

  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true

    const controller = new AbortController()

    authApi.session(controller.signal)
      .then((data) => {
        if (data.authenticated) {
          setAuthenticated({
            user: data.user as SafeUser,
            organization: data.organization as SafeOrganization | null,
            membership: data.membership as SafeMembership | null,
            session: data.session as SafeSession | null,
            csrfToken: data.csrfToken,
          })
        } else {
          setUnauthenticated()
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        setUnauthenticated()
      })

    return () => controller.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return status
}
