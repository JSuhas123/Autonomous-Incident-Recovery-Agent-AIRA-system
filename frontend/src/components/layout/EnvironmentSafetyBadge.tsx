import {
  FlaskConical,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'

import type {
  ProductRuntimeEnvironment,
} from '@/store/productRuntimeStore'


interface Props {
  environment:
    ProductRuntimeEnvironment | null
}


export function EnvironmentSafetyBadge({
  environment,
}: Props) {
  if (
    !environment
  ) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
        <ShieldAlert className="h-3.5 w-3.5" />

        Resolving environment
      </div>
    )
  }


  if (
    environment.type ===
    'production'
  ) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-300"
        title={
          environment.settings
            ?.requireApprovalForDestructiveActions
            ? 'Production environment. Destructive actions require approval.'
            : 'Production environment.'
        }
      >
        <ShieldAlert className="h-3.5 w-3.5" />

        <span>
          Production

          {environment
            .criticality
            ? ` · ${environment.criticality}`
            : ''}
        </span>
      </div>
    )
  }


  if (
    environment.type ===
      'development' ||
    environment.type ===
      'testing'
  ) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-2 text-xs text-cyan-300">
        <FlaskConical className="h-3.5 w-3.5" />

        {environment.name}
      </div>
    )
  }


  return (
    <div className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-2 text-xs text-emerald-300">
      <ShieldCheck className="h-3.5 w-3.5" />

      {environment.name}
    </div>
  )
}