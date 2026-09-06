import {
  Navigate,
} from 'react-router-dom'

import {
  useProductRuntimeStore,
} from '@/store/productRuntimeStore'


export function ProductEntryRedirect() {
  const ready =
    useProductRuntimeStore(
      (state) =>
        state.contextReady,
    )

  const landingPath =
    useProductRuntimeStore(
      (state) =>
        state.landingPath,
    )


  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />

          <p className="mt-4 text-sm font-medium">
            Opening AIRA
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Resolving your product experience.
          </p>
        </div>
      </div>
    )
  }


  return (
    <Navigate
      replace
      to={
        landingPath
      }
    />
  )
}