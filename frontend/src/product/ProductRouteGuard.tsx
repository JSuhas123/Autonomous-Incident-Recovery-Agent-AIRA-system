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

  const contextStatus =
    useProductRuntimeStore(
      (
        state,
      ) =>
        state.contextStatus,
    )

  const contextError =
    useProductRuntimeStore(
      (
        state,
      ) =>
        state.contextError,
    )

  const persona =
    useProductRuntimeStore(
      (
        state,
      ) =>
        state.persona,
    )

  const permissions =
    useProductRuntimeStore(
      (
        state,
      ) =>
        state.permissions,
    )

  const landingPath =
    useProductRuntimeStore(
      (
        state,
      ) =>
        state.landingPath,
    )


  if (
    contextStatus ===
      'loading' ||
    contextStatus ===
      'transitioning' ||
    contextStatus ===
      'unavailable'
  ) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />

          <p className="mt-4 text-sm font-medium">
            Securing AIRA workspace
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Resolving authoritative organization and environment context.
          </p>
        </div>
      </div>
    )
  }


  if (
    contextStatus ===
    'error'
  ) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-lg rounded-2xl border border-red-400/20 bg-red-400/[0.04] p-6 text-center">
          <p className="font-medium text-red-300">
            AIRA could not establish a secure product context.
          </p>

          <p className="mt-2 text-sm text-muted-foreground">
            {contextError ??
              'Authoritative server context is unavailable.'}
          </p>

          <p className="mt-4 text-xs text-muted-foreground">
            Product access remains blocked rather than falling back to browser authority.
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


  if (
    !permitted
  ) {
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