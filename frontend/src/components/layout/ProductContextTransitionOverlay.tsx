import {
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react'

import {
  useProductRuntimeStore,
} from '@/store/productRuntimeStore'


export function ProductContextTransitionOverlay() {
  const status =
    useProductRuntimeStore(
      (state) =>
        state.contextStatus,
    )


  const environment =
    useProductRuntimeStore(
      (state) =>
        state.environment,
    )


  if (
    status !==
      'transitioning' &&
    status !==
      'loading'
  ) {
    return null
  }


  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-background/75 px-4 backdrop-blur-sm"
      role="status"
      aria-live="assertive"
      aria-busy="true"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background/95 p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
            <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
          </div>


          <div>
            <p className="text-sm font-semibold">
              Resolving environment
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              AIRA is replacing tenant-scoped product state.
            </p>
          </div>
        </div>


        {environment?.name && (
          <div className="mt-5 rounded-xl border border-border/60 bg-secondary/[0.2] p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Selected environment
            </p>

            <p className="mt-1 text-xs font-medium">
              {environment.name}
            </p>
          </div>
        )}


        <div className="mt-4 flex items-start gap-2 text-[10px] leading-4 text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />

          Old environment requests are cancelled and cached tenant state is invalidated before the new product context becomes ready.
        </div>
      </div>
    </div>
  )
}