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
} from 'react'


function isAbortError(
  error: unknown,
): boolean {
  if (
    error instanceof DOMException &&
    error.name === 'AbortError'
  ) {
    return true
  }

  return Boolean(
    error &&
      typeof error === 'object' &&
      'name' in error &&
      error.name === 'AbortError',
  )
}


/**
 * Restores the authoritative browser session.
 *
 * SECURITY:
 * - session comes from backend
 * - organization comes from backend
 * - environment catalogue comes from backend
 * - localStorage environment ID is only a preference
 *
 * IMPORTANT:
 * There is intentionally NO useRef "bootstrapped" guard.
 *
 * React StrictMode can execute:
 *
 * effect -> cleanup -> effect
 *
 * The former useRef guard caused the first request to be aborted and
 * prevented the second bootstrap from running, leaving auth status stuck
 * at "loading" forever after refresh.
 */
export function useSessionBootstrap() {
  const status =
    useAuthStore(
      (state) =>
        state.status,
    )

  useEffect(
    () => {
      const controller =
        new AbortController()

      let disposed =
        false


      async function bootstrap() {
        const store =
          useAuthStore.getState()

        store.setLoading()

        try {
          // ------------------------------------------------------------------
          // 1. Restore trusted server session.
          // ------------------------------------------------------------------

          const data =
            await authApi.session(
              controller.signal,
            )

          if (
            disposed ||
            controller.signal.aborted
          ) {
            return
          }


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


          // ------------------------------------------------------------------
          // 2. Load server-authorized environment catalogue.
          // ------------------------------------------------------------------

          store.setEnvironmentsLoading(
            true,
          )

          try {
            const response =
              await environmentApi.list(
                controller.signal,
              )

            if (
              disposed ||
              controller.signal.aborted
            ) {
              return
            }


            const environments =
              Array.isArray(
                response.environments,
              )
                ? response.environments
                : []


            store.setAvailableEnvironments(
              environments,
            )


            // ----------------------------------------------------------------
            // 3. Browser preference is allowed only when server authorized.
            // ----------------------------------------------------------------

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
                  ) ?? null
                : null


            const sessionEnvironmentFromList =
              sessionEnvironment
                ? environments.find(
                    (environment) =>
                      environment.id ===
                      sessionEnvironment.id,
                  ) ?? null
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


            if (
              disposed ||
              controller.signal.aborted
            ) {
              return
            }


            store.setActiveEnvironment(
              selectedEnvironment,
            )
          } finally {
            if (
              !disposed &&
              !controller.signal.aborted
            ) {
              useAuthStore
                .getState()
                .setEnvironmentsLoading(
                  false,
                )
            }
          }
        } catch (error: unknown) {
          if (
            disposed ||
            isAbortError(error)
          ) {
            return
          }

          useAuthStore
            .getState()
            .setUnauthenticated()
        }
      }


      void bootstrap()


      return () => {
        disposed =
          true

        controller.abort()
      }
    },
    [],
  )


  return status
}