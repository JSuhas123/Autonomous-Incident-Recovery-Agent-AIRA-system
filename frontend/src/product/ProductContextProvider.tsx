import {
  type PropsWithChildren,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react'

import {
  fetchAuthoritativeProductContext,
} from '@/api/productContextApi'

import {
  queryClient,
} from '@/lib/queryClient'

import {
  rotateProductScope,
} from '@/product/productScope'

import {
  PRODUCT_PERSONAS,
  type ProductPersona,
} from '@/product/product.types'

import {
  useAuthStore,
} from '@/store/authStore'

import {
  useProductRuntimeStore,
} from '@/store/productRuntimeStore'


function normalizeEnvironmentType(
  value:
    string | null,
) {
  switch (
    value
  ) {
    case 'development':
    case 'testing':
    case 'staging':
    case 'production':
    case 'custom':
      return value

    default:
      return 'unknown'
  }
}


function isAbortError(
  error:
    unknown,
) {
  return (
    error instanceof DOMException &&
    error.name ===
      'AbortError'
  ) || (
      error !== null &&
      error !== undefined &&
    typeof error ===
      'object' &&
    'name' in error &&
    error.name ===
      'AbortError'
  )
}


export function ProductContextProvider({
  children,
}: PropsWithChildren) {
  const authStatus =
    useAuthStore(
      (
        state,
      ) =>
        state.status,
    )

  const user =
    useAuthStore(
      (
        state,
      ) =>
        state.user,
    )

  const organization =
    useAuthStore(
      (
        state,
      ) =>
        state.organization,
    )

  const membership =
    useAuthStore(
      (
        state,
      ) =>
        state.membership,
    )

  const activeEnvironment =
    useAuthStore(
      (
        state,
      ) =>
        state.activeEnvironment,
    )


  const previousScopeRef =
    useRef<
      string | null
    >(
      null,
    )


  /*
   * ========================================================================
   * PRE-PAINT TENANT / ENVIRONMENT INVALIDATION
   * ========================================================================
   *
   * useLayoutEffect runs before the browser paints the changed environment.
   *
   * Therefore old product context is cleared before Environment B can render
   * with Environment A's context.
   */
  useLayoutEffect(
    () => {
      const scopeKey =
        [
          organization
            ?.id ??
            'no-org',

          activeEnvironment
            ?.id ??
            'no-env',
        ].join(
          ':',
        )


      if (
        previousScopeRef
          .current ===
        null
      ) {
        previousScopeRef
          .current =
          scopeKey

        return
      }


      if (
        previousScopeRef
          .current ===
        scopeKey
      ) {
        return
      }


      previousScopeRef
        .current =
        scopeKey


      const runtime =
        useProductRuntimeStore
          .getState()


      runtime
        .beginTenantTransition()


      /*
       * Abort anything explicitly registered to the old product scope.
       */
      rotateProductScope()


      /*
       * Cancel all currently executing React Query requests.
       */
      void queryClient
        .cancelQueries()


      /*
       * Remove old cached server data immediately.
       *
       * Batch 25-B will narrow this to canonical tenant-scoped BFF query keys.
       * Until then, clearing all server-query cache is the safest transition.
       */
      queryClient
        .removeQueries()
    },
    [
      organization?.id,
      activeEnvironment?.id,
    ],
  )


  useEffect(
    () => {
      if (
        authStatus !==
          'authenticated' ||
        !user ||
        !organization ||
        !membership
      ) {
        useProductRuntimeStore
          .getState()
          .markContextUnavailable()

        return
      }


      const controller =
        new AbortController()


      const requestedEnvironmentId =
        activeEnvironment
          ?.id ??
        null


      const resolve =
        async () => {
          const runtime =
            useProductRuntimeStore
              .getState()


          if (
            runtime
              .contextStatus !==
            'transitioning'
          ) {
            runtime
              .markContextLoading()
          }


          try {
            const response =
              await fetchAuthoritativeProductContext(
                requestedEnvironmentId,
                controller.signal,
              )


            if (
              response
                .executionAuthorized !==
              false ||
              response
                .data
                .safety
                .executionAuthorized !==
              false
            ) {
              throw new Error(
                'Unsafe product context response: execution authorization invariant violated',
              )
            }


            const context =
              response.data


            if (
              !context
                .organization
                ?.id
            ) {
              throw new Error(
                'Authoritative organization context is missing',
              )
            }


            if (
              requestedEnvironmentId &&
              context
                .environment
                ?.id !==
                requestedEnvironmentId
            ) {
              throw new Error(
                'Server returned a different environment than the authorized requested environment',
              )
            }


            /*
             * If the browser environment changed while this request was in
             * flight, discard this response.
             */
            const currentEnvironmentId =
              useAuthStore
                .getState()
                .activeEnvironment
                ?.id ??
              null


            if (
              currentEnvironmentId !==
              requestedEnvironmentId
            ) {
              return
            }


            runtime
              .hydrateProductContext({
                source:
                  'authoritative',

                userId:
                  context
                    .identity
                    .userId,

                membershipId:
                  context
                    .identity
                    .membershipId,

                role:
                  context
                    .identity
                    .role,

                persona:
                  context
                    .identity
                    .persona as ProductPersona,

                permissions:
                  context
                    .identity
                    .permissions,

                organization: {
                  id:
                    context
                      .organization
                      .id,

                  tenantId:
                    context
                      .organization
                      .tenantId,

                  name:
                    context
                      .organization
                      .name ??
                    'Organization',

                  slug:
                    context
                      .organization
                      .slug ??
                    '',

                  status:
                    context
                      .organization
                      .status,
                },

                environment:
                  context
                    .environment
                    ?.id
                    ? {
                        id:
                          context
                            .environment
                            .id,

                        organizationId:
                          context
                            .environment
                            .organizationId,

                        name:
                          context
                            .environment
                            .name ??
                          'Environment',

                        slug:
                          context
                            .environment
                            .slug,

                        type:
                          normalizeEnvironmentType(
                            context
                              .environment
                              .type,
                          ),

                        criticality:
                          context
                            .environment
                            .criticality,

                        status:
                          context
                            .environment
                            .status,

                      }
                    : null,

                landingPath:
                  context
                    .identity
                    .personaMetadata
                    .defaultLandingPath,

                requestId:
                  context
                    .request
                    .requestId,
              })
          } catch (
            error
          ) {
            if (
              isAbortError(
                error,
              )
            ) {
              return
            }


            /*
             * Do not fall back to session_preview.
             *
             * Once Batch 25-A is installed, product routes require
             * authoritative backend context.
             */
            useProductRuntimeStore
              .getState()
              .markContextError(
                error instanceof Error
                  ? error.message
                  : 'Unable to resolve authoritative AIRA product context',
              )
          }
        }


      void resolve()


      return () => {
        controller.abort()
      }
    },
    [
      authStatus,
      user,
      organization,
      membership,
      activeEnvironment?.id,
    ],
  )


  /*
   * Product persona default is retained in the runtime store only as a safe
   * empty-state value. It is never considered authorization.
   */
  void PRODUCT_PERSONAS


  return children
}