import {
  developmentApi,
  environmentApi,
} from '@/api/client'

import { Button } from '@/components/ui/button'
import { useLogout } from '@/hooks/useLogout'
import { useAuthStore } from '@/store/authStore'
import { useNotificationsStore } from '@/store/notificationsStore'

import {
  Bell,
  LogOut,
  Menu,
  Server,
  User,
} from 'lucide-react'

import { useNavigate } from 'react-router-dom'

interface TopBarProps {
  onMenuClick: () => void
}

type DevelopmentPlan =
  | 'developer'
  | 'team'
  | 'business'
  | 'enterprise'

function environmentLabel(type: string) {
  switch (type) {
    case 'production':
      return 'Production'

    case 'staging':
      return 'Staging'

    case 'development':
      return 'Development'

    case 'testing':
      return 'Testing'

    default:
      return 'Environment'
  }
}

export function TopBar({
  onMenuClick,
}: TopBarProps) {
  const unreadCount =
    useNotificationsStore(
      (state) => state.unreadCount,
    )

  const navigate = useNavigate()
  const logout = useLogout()

  const user =
    useAuthStore(
      (state) => state.user,
    )

  const organization =
    useAuthStore(
      (state) => state.organization,
    )

  const activeEnvironment =
    useAuthStore(
      (state) =>
        state.activeEnvironment,
    )

  const availableEnvironments =
    useAuthStore(
      (state) =>
        state.availableEnvironments,
    )

  const environmentsLoading =
    useAuthStore(
      (state) =>
        state.environmentsLoading,
    )

  const setActiveEnvironment =
    useAuthStore(
      (state) =>
        state.setActiveEnvironment,
    )

  const setAvailableEnvironments =
    useAuthStore(
      (state) =>
        state.setAvailableEnvironments,
    )

  const isDevelopment =
    import.meta.env.DEV

  function handleEnvironmentChange(
    environmentId: string,
  ) {
    const environment =
      availableEnvironments.find(
        (candidate) =>
          candidate.id ===
          environmentId,
      )

    if (!environment) {
      return
    }

    setActiveEnvironment(
      environment,
    )
  }

  async function handleDevelopmentPlanChange(
    plan: DevelopmentPlan,
  ) {
    try {
      await developmentApi.setPlan(
        plan,
      )

      const response =
        await environmentApi.list()

      setAvailableEnvironments(
        response.environments,
      )

      console.info(
        `[AIRA dev] Plan changed to ${plan}`,
      )
    } catch (error) {
      console.error(
        '[AIRA dev] Failed to change plan:',
        error,
      )
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="hidden min-w-0 items-center gap-3 lg:flex">
        {organization?.name && (
          <span className="truncate text-sm font-medium text-foreground">
            {organization.name}
          </span>
        )}

        {activeEnvironment && (
          <span className="text-muted-foreground">
            /
          </span>
        )}

        {activeEnvironment && (
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />

            <select
              value={
                activeEnvironment.id
              }
              disabled={
                environmentsLoading ||
                availableEnvironments.length ===
                  0
              }
              onChange={(event) =>
                handleEnvironmentChange(
                  event.target.value,
                )
              }
              aria-label="Active environment"
              className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              {availableEnvironments.map(
                (environment) => (
                  <option
                    key={
                      environment.id
                    }
                    value={
                      environment.id
                    }
                  >
                    {environment.name}

                    {environment.type ===
                    'production'
                      ? ' — Production'
                      : environment.status ===
                          'maintenance'
                        ? ' — Maintenance'
                        : ''}
                  </option>
                ),
              )}
            </select>

            <span
              className="hidden text-xs text-muted-foreground xl:inline"
              title={`Environment type: ${activeEnvironment.type}`}
            >
              {environmentLabel(
                activeEnvironment.type,
              )}
            </span>
          </div>
        )}

        {isDevelopment && (
          <select
            defaultValue="developer"
            onChange={(event) =>
              void handleDevelopmentPlanChange(
                event.target
                  .value as DevelopmentPlan,
              )
            }
            aria-label="Development pricing plan"
            title="Development-only plan override"
            className="h-8 rounded-md border border-dashed border-input bg-background px-2 text-xs text-muted-foreground"
          >
            <option value="developer">
              Dev Plan: Developer
            </option>

            <option value="team">
              Dev Plan: Team
            </option>

            <option value="business">
              Dev Plan: Business
            </option>

            <option value="enterprise">
              Dev Plan: Enterprise
            </option>
          </select>
        )}
      </div>

      <div className="flex items-center gap-1">
        {activeEnvironment && (
          <select
            value={
              activeEnvironment.id
            }
            disabled={
              environmentsLoading ||
              availableEnvironments.length ===
                0
            }
            onChange={(event) =>
              handleEnvironmentChange(
                event.target.value,
              )
            }
            aria-label="Active environment"
            className="mr-1 h-8 max-w-32 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring lg:hidden"
          >
            {availableEnvironments.map(
              (environment) => (
                <option
                  key={
                    environment.id
                  }
                  value={
                    environment.id
                  }
                >
                  {environment.name}
                </option>
              ),
            )}
          </select>
        )}

        {user?.fullName && (
          <span className="mr-2 hidden text-sm text-muted-foreground md:block">
            {user.fullName}
          </span>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() =>
            navigate(
              '/notifications',
            )
          }
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />

          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {unreadCount > 9
                ? '9+'
                : unreadCount}
            </span>
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() =>
            navigate('/profile')
          }
          aria-label="Profile"
        >
          <User className="h-5 w-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={logout}
          aria-label="Sign out"
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  )
}