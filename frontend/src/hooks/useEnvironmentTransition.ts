import {
  useCallback,
} from 'react'

import {
  queryClient,
} from '@/lib/queryClient'

import {
  rotateProductScope,
} from '@/product/productScope'

import {
  useAuthStore,
  type EnvironmentSummary,
} from '@/store/authStore'

import {
  useProductRuntimeStore,
} from '@/store/productRuntimeStore'


export function useEnvironmentTransition() {
  return useCallback(
    async (
      environment:
        EnvironmentSummary,
    ) => {
      const auth =
        useAuthStore
          .getState()

      const runtime =
        useProductRuntimeStore
          .getState()


      if (
        auth.activeEnvironment
          ?.id ===
        environment.id
      ) {
        return
      }


      /*
       * The browser may request only an environment that came from the
       * server-authorized environment catalogue.
       */
      const authorized =
        auth.availableEnvironments
          .some(
            (
              candidate,
            ) =>
              candidate.id ===
                environment.id &&
              candidate.status !==
                'archived',
          )


      if (
        !authorized
      ) {
        throw new Error(
          'Environment transition denied: environment is not in the authorized organization environment catalogue',
        )
      }


      runtime
        .beginTenantTransition()


      runtime
        .setCommandOpen(
          false,
        )


      rotateProductScope()


      await queryClient
        .cancelQueries()


      queryClient
        .removeQueries()


      /*
       * This remains a browser preference/request only.
       *
       * ProductContextProvider immediately asks the server to validate this
       * environment through /product/context.
       */
      auth
        .setActiveEnvironment(
          environment,
        )
    },
    [],
  )
}