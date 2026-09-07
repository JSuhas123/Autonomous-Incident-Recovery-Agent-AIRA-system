import {
  Bell,
  Building2,
  ChevronDown,
  Command,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
} from 'lucide-react'

import {
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  useNavigate,
} from 'react-router-dom'

import {
  authApi,
} from '@/api/client'

import {
  queryClient,
} from '@/lib/queryClient'

import {
  rotateProductScope,
} from '@/product/productScope'

import {
  EnvironmentSafetyBadge,
} from './EnvironmentSafetyBadge'

import {
  ProductContextStatus,
} from './ProductContextStatus'

import {
  useEnvironmentTransition,
} from '@/hooks/useEnvironmentTransition'

import {
  useAuthStore,
} from '@/store/authStore'

import {
  useProductRuntimeStore,
} from '@/store/productRuntimeStore'


export function ProductTopBar() {
  const navigate =
    useNavigate()


  const menuRef =
    useRef<HTMLDivElement | null>(
      null,
    )


  const [
    accountOpen,
    setAccountOpen,
  ] =
    useState(false)


  const [
    loggingOut,
    setLoggingOut,
  ] =
    useState(false)


  const organization =
    useProductRuntimeStore(
      (state) =>
        state.organization,
    )


  const environment =
    useProductRuntimeStore(
      (state) =>
        state.environment,
    )


  const persona =
    useProductRuntimeStore(
      (state) =>
        state.persona,
    )


  const role =
    useProductRuntimeStore(
      (state) =>
        state.role,
    )


  const contextStatus =
    useProductRuntimeStore(
      (state) =>
        state.contextStatus,
    )


  const setCommandOpen =
    useProductRuntimeStore(
      (state) =>
        state.setCommandOpen,
    )


  const resetProductRuntime =
    useProductRuntimeStore(
      (state) =>
        state.resetProductRuntime,
    )


  const user =
    useAuthStore(
      (state) =>
        state.user,
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


  const setUnauthenticated =
    useAuthStore(
      (state) =>
        state.setUnauthenticated,
    )


  const transitionEnvironment =
    useEnvironmentTransition()


  const transitionBlocked =
    contextStatus ===
      'transitioning' ||
    contextStatus ===
      'loading' ||
    environmentsLoading


  useEffect(
    () => {
      function handlePointerDown(
        event:
          MouseEvent,
      ) {
        if (
          accountOpen &&
          menuRef.current &&
          !menuRef.current.contains(
            event.target as Node,
          )
        ) {
          setAccountOpen(
            false,
          )
        }
      }


      document.addEventListener(
        'mousedown',
        handlePointerDown,
      )


      return () => {
        document.removeEventListener(
          'mousedown',
          handlePointerDown,
        )
      }
    },
    [
      accountOpen,
    ],
  )


  async function logout() {
    if (
      loggingOut
    ) {
      return
    }


    setLoggingOut(
      true,
    )


    try {
      /*
       * Server revocation first.
       */
      await authApi.logout()
    } catch {
      /*
       * Even if the request cannot complete, browser identity must not retain
       * an apparently authenticated workspace.
       *
       * Server-side expiry / revocation remains authoritative.
       */
    } finally {
      /*
       * Tear down all tenant-scoped browser state.
       */
      rotateProductScope()

      await queryClient
        .cancelQueries()


      queryClient
        .clear()


      resetProductRuntime()

      setUnauthenticated()

      setAccountOpen(
        false,
      )

      setLoggingOut(
        false,
      )


      navigate(
        '/login',
        {
          replace:
            true,
        },
      )
    }
  }


  return (
    <header className="sticky top-0 z-30 flex h-16 items-center border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5">
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />

          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-xs font-medium text-foreground">
              {organization?.name ??
                'No organization'}
            </p>

            <p className="truncate text-[10px] text-muted-foreground">
              {organization?.slug ??
                'organization unavailable'}
            </p>
          </div>
        </div>


        <div className="hidden h-6 w-px bg-border sm:block" />


        <div className="flex items-center gap-2">
          <EnvironmentSafetyBadge
            environment={
              environment
            }
          />


          {availableEnvironments.length >
            0 && (
            <select
              aria-label="Active AIRA environment"
              value={
                activeEnvironment?.id ??
                ''
              }
              disabled={
                transitionBlocked
              }
              onChange={
                (event) => {
                  const next =
                    availableEnvironments.find(
                      (candidate) =>
                        candidate.id ===
                        event.target.value,
                    )


                  if (next) {
                    void transitionEnvironment(
                      next,
                    )
                  }
                }
              }
              className="hidden h-9 max-w-[180px] rounded-lg border border-border bg-secondary/30 px-2 text-xs text-foreground outline-none transition-colors hover:bg-secondary/60 disabled:cursor-not-allowed disabled:opacity-50 md:block"
            >
              {availableEnvironments.map(
                (candidate) => (
                  <option
                    key={
                      candidate.id
                    }
                    value={
                      candidate.id
                    }
                  >
                    {
                      candidate.name
                    }
                  </option>
                ),
              )}
            </select>
          )}
        </div>


        <div className="hidden xl:block">
          <ProductContextStatus />
        </div>
      </div>


      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={
            contextStatus !==
            'ready'
          }
          onClick={
            () =>
              setCommandOpen(
                true,
              )
          }
          className="hidden h-9 min-w-[220px] items-center justify-between rounded-lg border border-border bg-secondary/30 px-3 text-xs text-muted-foreground transition-colors hover:bg-secondary/60 disabled:cursor-not-allowed disabled:opacity-50 md:flex"
        >
          <span className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5" />

            Search AIRA
          </span>

          <span className="flex items-center gap-1 rounded border border-border bg-background/60 px-1.5 py-0.5 text-[10px]">
            <Command className="h-2.5 w-2.5" />

            K
          </span>
        </button>


        <button
          type="button"
          disabled={
            contextStatus !==
            'ready'
          }
          onClick={
            () =>
              navigate(
                '/notifications',
              )
          }
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />

          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-amber-400" />
        </button>


        <div className="hidden h-6 w-px bg-border sm:block" />


        <div
          ref={
            menuRef
          }
          className="relative"
        >
          <button
            type="button"
            onClick={
              () =>
                setAccountOpen(
                  (current) =>
                    !current,
                )
            }
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-secondary/60"
            aria-haspopup="menu"
            aria-expanded={
              accountOpen
            }
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary/50">
              <UserRound className="h-4 w-4 text-muted-foreground" />
            </div>

            <div className="hidden min-w-0 text-left lg:block">
              <p className="max-w-[140px] truncate text-xs font-medium">
                {user?.fullName ??
                  user?.email ??
                  persona.replace(
                    /_/g,
                    ' ',
                  )}
              </p>

              <p className="text-[10px] text-muted-foreground">
                {role
                  ? role.replace(
                      /_/g,
                      ' ',
                    )
                  : 'Product persona'}
              </p>
            </div>

            <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground lg:block" />
          </button>


          {accountOpen && (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
            >
              <div className="border-b border-border px-4 py-3">
                <p className="truncate text-sm font-medium">
                  {user?.fullName ??
                    'AIRA user'}
                </p>

                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {user?.email ??
                    ''}
                </p>
              </div>


              <div className="p-1.5">
                <button
                  type="button"
                  onClick={
                    () => {
                      setAccountOpen(
                        false,
                      )

                      navigate(
                        '/profile',
                      )
                    }
                  }
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <UserRound className="h-4 w-4" />

                  Profile
                </button>


                <button
                  type="button"
                  onClick={
                    () => {
                      setAccountOpen(
                        false,
                      )

                      navigate(
                        '/account/security',
                      )
                    }
                  }
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <ShieldCheck className="h-4 w-4" />

                  Account security
                </button>


                <button
                  type="button"
                  onClick={
                    () => {
                      setAccountOpen(
                        false,
                      )

                      navigate(
                        '/settings',
                      )
                    }
                  }
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Settings className="h-4 w-4" />

                  Settings
                </button>
              </div>


              <div className="border-t border-border p-1.5">
                <button
                  type="button"
                  disabled={
                    loggingOut
                  }
                  onClick={
                    () =>
                      void logout()
                  }
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-red-300 transition-colors hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" />

                  {loggingOut
                    ? 'Signing out…'
                    : 'Sign out'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}