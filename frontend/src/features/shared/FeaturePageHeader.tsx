import type { ReactNode } from 'react'
import { Clock3 } from 'lucide-react'
import { useProductRuntimeStore } from '@/store/productRuntimeStore'

export function FeaturePageHeader({
  kicker,
  title,
  description,
  action,
}: {
  kicker: string
  title: string
  description: string
  action?: ReactNode
}) {
  const organization = useProductRuntimeStore((state) => state.organization)
  const environment = useProductRuntimeStore((state) => state.environment)
  const source = useProductRuntimeStore((state) => state.contextSource)

  return (
    <section className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="aira-kicker">{kicker}</p>
          {source === 'session_preview' && (
            <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.05] px-2 py-0.5 text-[9px] uppercase tracking-wider text-amber-300">
              Preview context
            </span>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
          <span>{organization?.name ?? 'Current organization'}</span>
          <span>{environment?.name ?? 'Current environment'}</span>
          <span className="flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5" />
            Updated moments ago
          </span>
        </div>
      </div>
      {action}
    </section>
  )
}
