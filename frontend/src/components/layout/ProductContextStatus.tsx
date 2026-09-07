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
      (state) =>
        state.contextSource,
    )


  const status =
    useProductRuntimeStore(
      (state) =>
        state.contextStatus,
    )


  const tenantEpoch =
    useProductRuntimeStore(
      (state) =>
        state.tenantEpoch,
    )


  if (
    status ===
      'transitioning'
  ) {
    return (
      <div
        className="flex items-center gap-1.5 text-[10px] text-cyan-300"
        title={`Tenant epoch ${tenantEpoch}`}
      >
        <LoaderCircle className="h-3 w-3 animate-spin" />

        Switching environment
      </div>
    )
  }


  if (
    status ===
      'loading'
  ) {
    return (
      <div
        className="flex items-center gap-1.5 text-[10px] text-cyan-300"
        title={`Tenant epoch ${tenantEpoch}`}
      >
        <LoaderCircle className="h-3 w-3 animate-spin" />

        Resolving context
      </div>
    )
  }


  if (
    status ===
      'error'
  ) {
    return (
      <div
        className="flex items-center gap-1.5 text-[10px] text-red-300"
        role="alert"
      >
        <TriangleAlert className="h-3 w-3" />

        Context unavailable
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

        Server scoped
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