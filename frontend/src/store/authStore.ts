import type {
  AuthState,
  SafeMembership,
  SafeOrganization,
  SafeSession,
  SafeUser,
} from '@/types'
import { create } from 'zustand'

export interface EnvironmentSummary {
  id: string
  organizationId: string | null

  name: string
  slug: string

  type:
    | 'development'
    | 'testing'
    | 'staging'
    | 'production'
    | 'custom'

  criticality:
    | 'low'
    | 'medium'
    | 'high'
    | 'critical'

  status:
    | 'active'
    | 'maintenance'
    | 'archived'

  description: string

  settings: {
    allowAutonomousExecution: boolean
    requireApprovalForDestructiveActions: boolean
    timezone: string | null
  }

  maintenance?: {
    reason: string | null
    startedAt: string | null
  }

  archive?: {
    archivedAt: string | null
    archivedByUserId: string | null
    reason: string | null
  }

  createdByUserId?: string | null
  createdAt?: string
  updatedAt?: string

  isDefault?: boolean
}

interface EnvironmentState {
  activeEnvironment: EnvironmentSummary | null
  availableEnvironments: EnvironmentSummary[]
  environmentsLoading: boolean
}

interface AuthActions {
  setAuthenticated: (payload: {
    user: SafeUser
    organization: SafeOrganization | null
    membership: SafeMembership | null
    session: SafeSession | null
    csrfToken: string | null
    environment?: EnvironmentSummary | null
  }) => void

  setUnauthenticated: (error?: string) => void

  setLoading: () => void

  setCsrfToken: (token: string) => void

  updateTenantName: (name: string) => void

  setActiveEnvironment: (
    environment: EnvironmentSummary | null
  ) => void

  setAvailableEnvironments: (
    environments: EnvironmentSummary[]
  ) => void

  setEnvironmentsLoading: (
    loading: boolean
  ) => void

  resetEnvironmentState: () => void
}

const ACTIVE_ENVIRONMENT_STORAGE_KEY =
  'aira.activeEnvironmentId'

const INITIAL: AuthState & EnvironmentState = {
  status: 'loading',

  user: null,
  organization: null,
  membership: null,
  session: null,
  csrfToken: null,
  error: null,

  activeEnvironment: null,
  availableEnvironments: [],
  environmentsLoading: false,
}

function persistActiveEnvironment(
  environment: EnvironmentSummary | null,
) {
  try {
    if (environment) {
      window.localStorage.setItem(
        ACTIVE_ENVIRONMENT_STORAGE_KEY,
        environment.id,
      )
    } else {
      window.localStorage.removeItem(
        ACTIVE_ENVIRONMENT_STORAGE_KEY,
      )
    }
  } catch {
    // localStorage may be unavailable in restricted browser contexts.
  }
}

export function getPersistedEnvironmentId(): string | null {
  try {
    return window.localStorage.getItem(
      ACTIVE_ENVIRONMENT_STORAGE_KEY,
    )
  } catch {
    return null
  }
}

export const useAuthStore = create<
  AuthState &
    EnvironmentState &
    AuthActions
>()((set) => ({
  ...INITIAL,

  setAuthenticated({
    user,
    organization,
    membership,
    session,
    csrfToken,
    environment,
  }) {
    set({
      status: 'authenticated',

      user,
      organization,
      membership,
      session,
      csrfToken,

      activeEnvironment:
        environment ?? null,

      error: null,
    })
  },

  setUnauthenticated(
    error = undefined,
  ) {
    persistActiveEnvironment(null)

    set({
      status: 'unauthenticated',

      user: null,
      organization: null,
      membership: null,
      session: null,
      csrfToken: null,

      activeEnvironment: null,
      availableEnvironments: [],
      environmentsLoading: false,

      error: error ?? null,
    })
  },

  setLoading() {
    set({
      status: 'loading',
    })
  },

  setCsrfToken(csrfToken) {
    set({
      csrfToken,
    })
  },

  updateTenantName(name) {
    set((state) =>
      state.organization
        ? {
            organization: {
              ...state.organization,
              name,
            },
          }
        : {},
    )
  },

  setActiveEnvironment(environment) {
    persistActiveEnvironment(
      environment,
    )

    set({
      activeEnvironment:
        environment,
    })
  },

  setAvailableEnvironments(
    availableEnvironments,
  ) {
    set({
      availableEnvironments,
    })
  },

  setEnvironmentsLoading(
    environmentsLoading,
  ) {
    set({
      environmentsLoading,
    })
  },

  resetEnvironmentState() {
    persistActiveEnvironment(null)

    set({
      activeEnvironment: null,
      availableEnvironments: [],
      environmentsLoading: false,
    })
  },
}))