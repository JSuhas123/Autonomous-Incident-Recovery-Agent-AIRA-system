import {
  type PropsWithChildren,
} from 'react'

import {
  Navigate,
  useLocation,
} from 'react-router-dom'

import {
  canAccessProductPath,
} from './product.route-access'

import {
  useProductRuntimeStore,
} from '@/store/productRuntimeStore'


export function ProductRouteGuard({
  children,
}: PropsWithChildren) {
  const location =
    useLocation()

  const contextReady =
    useProductRuntimeStore(
      (state) =>
        state.contextReady,
    )

  const persona =
    useProductRuntimeStore(
      (state) =>
        state.persona,
    )

  const permissions =
    useProductRuntimeStore(
      (state) =>
        state.permissions,
    )

  const landingPath =
    useProductRuntimeStore(
      (state) =>
        state.landingPath,
    )


  /*
   * Session bootstrap may still be resolving.
   *
   * Do not redirect until product presentation context exists.
   */
  if (!contextReady) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />

          <p className="mt-4 text-sm font-medium">
            Preparing AIRA workspace
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Resolving organization and environment context.
          </p>
        </div>
      </div>
    )
  }


  const permitted =
    canAccessProductPath({
      pathname:
        location.pathname,

      persona,

      permissions,
    })


  if (!permitted) {
    return (
      <Navigate
        replace
        to={
          landingPath
        }
        state={{
          productRouteRedirect:
            true,

          attemptedPath:
            location.pathname,
        }}
      />
    )
  }


  return children
}