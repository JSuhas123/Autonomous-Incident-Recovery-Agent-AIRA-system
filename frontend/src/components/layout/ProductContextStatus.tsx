import {
  Database,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'

import {
  useProductRuntimeStore,
} from '@/store/productRuntimeStore'


export function ProductContextStatus() {
  const source =
    useProductRuntimeStore(
      (
        state,
      ) =>
        state.contextSource,
    )

  const status =
    useProductRuntimeStore(
      (
        state,
      ) =>
        state.contextStatus,
    )

  const tenantEpoch =
    useProductRuntimeStore(
      (
        state,
      ) =>
        state.tenantEpoch,
    )


  if (
    status ===
      'transitioning' ||
    status ===
      'loading'
  ) {
    return (
      <div
        className="flex items-center gap-1.5 text-[10px] text-cyan-300"
        title={`Tenant epoch ${tenantEpoch}`}
      >
        <LoaderCircle className="h-3 w-3 animate-spin" />

        Resolving server context
      </div>
    )
  }


  if (
    status ===
    'error'
  ) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-red-300">
        <TriangleAlert className="h-3 w-3" />

        Context error
      </div>
    )
  }


  if (
    source ===
      'authoritative' &&
    status ===
      'ready'
  ) {
    return (
      <div
        className="flex items-center gap-1.5 text-[10px] text-emerald-300"
        title={`Backend-authoritative tenant context · epoch ${tenantEpoch}`}
      >
        <ShieldCheck className="h-3 w-3" />

        Server context
      </div>
    )
  }


  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <Database className="h-3 w-3" />

      Context unavailable
    </div>
  )
}