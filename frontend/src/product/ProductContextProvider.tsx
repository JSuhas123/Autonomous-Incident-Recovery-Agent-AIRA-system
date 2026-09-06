import {
  type PropsWithChildren,
  useEffect,
} from 'react'

import {
  useAuthStore,
} from '@/store/authStore'

import {
  useProductRuntimeStore,
} from '@/store/productRuntimeStore'

import {
  buildSessionProductPreview,
} from './product.session-adapter'


export function ProductContextProvider({
  children,
}: PropsWithChildren) {
  const user =
    useAuthStore(
      (state) =>
        state.user,
    )

  const organization =
    useAuthStore(
      (state) =>
        state.organization,
    )

  const membership =
    useAuthStore(
      (state) =>
        state.membership,
    )

  const activeEnvironment =
    useAuthStore(
      (state) =>
        state.activeEnvironment,
    )

  const hydrateProductContext =
    useProductRuntimeStore(
      (state) =>
        state
          .hydrateProductContext,
    )

  const markContextUnavailable =
    useProductRuntimeStore(
      (state) =>
        state
          .markContextUnavailable,
    )


  useEffect(
    () => {
      if (
        !user ||
        !organization ||
        !membership
      ) {
        markContextUnavailable()

        return
      }


      const preview =
        buildSessionProductPreview({
          user,

          organization,

          membership,

          environment:
            activeEnvironment,
        })


      hydrateProductContext(
        preview,
      )
    },
    [
      user,
      organization,
      membership,
      activeEnvironment,
      hydrateProductContext,
      markContextUnavailable,
    ],
  )


  return children
}