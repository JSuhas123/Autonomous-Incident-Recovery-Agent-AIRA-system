import type { AuthState, SafeMembership, SafeOrganization, SafeSession, SafeUser } from '@/types'
import { create } from 'zustand'

interface AuthActions {
  setAuthenticated: (payload: {
    user: SafeUser
    organization: SafeOrganization | null
    membership: SafeMembership | null
    session: SafeSession | null
    csrfToken: string | null
  }) => void
  setUnauthenticated: (error?: string) => void
  setLoading: () => void
  setCsrfToken: (token: string) => void
  updateTenantName: (name: string) => void
}

const INITIAL: AuthState = {
  status: 'loading',
  user: null,
  organization: null,
  membership: null,
  session: null,
  csrfToken: null,
  error: null,
}

export const useAuthStore = create<AuthState & AuthActions>()((set) => ({
  ...INITIAL,

  setAuthenticated({ user, organization, membership, session, csrfToken }) {
    set({ status: 'authenticated', user, organization, membership, session, csrfToken, error: null })
  },

  setUnauthenticated(error = undefined) {
    set({ status: 'unauthenticated', user: null, organization: null, membership: null, session: null, csrfToken: null, error: error ?? null })
  },

  setLoading() {
    set({ status: 'loading' })
  },

  setCsrfToken(csrfToken) {
    set({ csrfToken })
  },

  updateTenantName(name) {
    set((state) =>
      state.organization
        ? { organization: { ...state.organization, name } }
        : {},
    )
  },
}))
