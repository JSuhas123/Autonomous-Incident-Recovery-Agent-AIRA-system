import {
  Database,
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


  if (
    source ===
    'authoritative'
  ) {
    return (
      <div
        className="flex items-center gap-1.5 text-[10px] text-emerald-300"
        title="Organization, environment and permissions were resolved by the AIRA backend."
      >
        <ShieldCheck className="h-3 w-3" />

        Server context
      </div>
    )
  }


  if (
    source ===
    'session_preview'
  ) {
    return (
      <div
        className="flex items-center gap-1.5 text-[10px] text-amber-300"
        title="Temporary Phase 25 frontend preview. Final authority will come from /product/context."
      >
        <TriangleAlert className="h-3 w-3" />

        Preview context
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