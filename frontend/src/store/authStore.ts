import type { AuthCredentials } from '@/types'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  credentials: AuthCredentials | null
  isAuthenticated: boolean
  login: (creds: AuthCredentials) => void
  logout: () => void
  updateTenantName: (name: string) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      credentials: null,
      isAuthenticated: false,

      login(creds) {
        set({ credentials: creds, isAuthenticated: true })
      },

      logout() {
        set({ credentials: null, isAuthenticated: false })
      },

      updateTenantName(name) {
        set((state) => ({
          credentials: state.credentials
            ? { ...state.credentials, tenantName: name }
            : null,
        }))
      },
    }),
    {
      name: 'aira-auth',
      partialize: (state) => ({
        credentials: state.credentials,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)
