import {
  authApi,
  environmentApi,
} from '@/api/client'

import {
  getPersistedEnvironmentId,
  useAuthStore,
  type EnvironmentSummary,
} from '@/store/authStore'

import type {
  SafeMembership,
  SafeOrganization,
  SafeSession,
  SafeUser,
} from '@/types'

import {
  useEffect,
  useRef,
} from 'react'

/**
 * Bootstraps:
 *
 * User
 * Organization
 * Membership
 * Session
 * CSRF
 * Default/active Environment
 * Available Environments
 *
 * Must be mounted once at the application root.
 */
export function useSessionBootstrap() {
  const status =
    useAuthStore(
      (state) => state.status,
    )

  const bootstrapped =
    useRef(false)

  useEffect(() => {
    if (
      bootstrapped.current
    ) {
      return
    }

    bootstrapped.current =
      true

    const controller =
      new AbortController()

    const bootstrap =
      async () => {
        const store =
          useAuthStore.getState()

        store.setLoading()

        try {
          /*
           * First establish trusted server-side session,
           * organization and default environment.
           */
          const data =
            await authApi.session(
              controller.signal,
            )

          if (
            !data.authenticated
          ) {
            store.setUnauthenticated()
            return
          }

          const sessionEnvironment =
            data.environment as
              | EnvironmentSummary
              | null

          store.setAuthenticated({
            user:
              data.user as SafeUser,

            organization:
              data.organization as
                | SafeOrganization
                | null,

            membership:
              data.membership as
                | SafeMembership
                | null,

            session:
              data.session as
                | SafeSession
                | null,

            csrfToken:
              data.csrfToken,

            environment:
              sessionEnvironment,
          })

          /*
           * Then retrieve the complete environment catalogue.
           */
          store.setEnvironmentsLoading(
            true,
          )

          try {
            const response =
              await environmentApi.list(
                controller.signal,
              )

            const environments =
              response.environments

            store.setAvailableEnvironments(
              environments,
            )

            /*
             * Browser preference is convenience only.
             *
             * It is accepted only if the ID appears in the
             * server-authorized organization environment list.
             */
            const persistedId =
              getPersistedEnvironmentId()

            const persistedEnvironment =
              persistedId
                ? environments.find(
                    (environment) =>
                      environment.id ===
                      persistedId &&
                      environment.status !==
                        'archived',
                  )
                : null

            const sessionEnvironmentFromList =
              sessionEnvironment
                ? environments.find(
                    (environment) =>
                      environment.id ===
                      sessionEnvironment.id,
                  )
                : null

            const firstUsableEnvironment =
              environments.find(
                (environment) =>
                  environment.status ===
                  'active',
              ) ??
              environments.find(
                (environment) =>
                  environment.status ===
                  'maintenance',
              ) ??
              null

            const selectedEnvironment =
              persistedEnvironment ??
              sessionEnvironmentFromList ??
              firstUsableEnvironment

            store.setActiveEnvironment(
              selectedEnvironment,
            )
          } finally {
            store.setEnvironmentsLoading(
              false,
            )
          }
        } catch (error: unknown) {
          if (
            error instanceof DOMException &&
            error.name ===
              'AbortError'
          ) {
            return
          }

          if (
            error &&
            typeof error ===
              'object' &&
            'name' in error &&
            error.name ===
              'AbortError'
          ) {
            return
          }

          store.setUnauthenticated()
        }
      }

    void bootstrap()

    return () => {
      controller.abort()
    }
  }, [])

  return status
}