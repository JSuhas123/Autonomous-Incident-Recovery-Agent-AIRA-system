import type {
  ReactNode,
} from 'react'

import {
  Building2,
  Layers3,
  ShieldCheck,
} from 'lucide-react'

import {
  useProductRuntimeStore,
} from '@/store/productRuntimeStore'


export function FeaturePageHeader({
  kicker,
  title,
  description,
  action,
}: {
  kicker:
    string

  title:
    string

  description:
    string

  action?:
    ReactNode
}) {
  const organization =
    useProductRuntimeStore(
      (state) =>
        state.organization,
    )


  const environment =
    useProductRuntimeStore(
      (state) =>
        state.environment,
    )


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


  return (
    <section className="flex min-w-0 flex-col justify-between gap-4 xl:flex-row xl:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="aira-kicker">
            {kicker}
          </p>


          {source ===
            'session_preview' && (
            <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.05] px-2 py-0.5 text-[9px] uppercase tracking-wider text-amber-300">
              Preview context
            </span>
          )}


          {source ===
            'authoritative' &&
            status ===
              'ready' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/15 bg-emerald-400/[0.04] px-2 py-0.5 text-[9px] uppercase tracking-wider text-emerald-300">
              <ShieldCheck className="h-2.5 w-2.5" />

              Server scoped
            </span>
          )}
        </div>


        <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>


        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>


        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />

            {organization
              ?.name ??
              'Current organization'}
          </span>


          <span className="inline-flex items-center gap-1.5">
            <Layers3 className="h-3.5 w-3.5" />

            {environment
              ?.name ??
              'Current environment'}
          </span>
        </div>
      </div>


      {action && (
        <div className="shrink-0">
          {action}
        </div>
      )}
    </section>
  )
}